import re
import math
import httpx
import numpy as np
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types
from backend.app.config import settings

class RAGEngine:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Error initializing Gemini Client in RAG: {e}")
        
        # Local document stores (In-memory for easy demo, scoped by lifecycle_id)
        # In a full app, this can be written to DB or SQLite
        self.documents: Dict[str, List[Dict[str, Any]]] = {}
        # Graph connections {node_id: [connected_node_ids]}
        self.knowledge_graph: Dict[str, Dict[str, List[str]]] = {}

    def get_embedding(self, text: str) -> List[float]:
        """Fetch embeddings from Ollama or Gemini, or fallback to simple bag-of-words vector."""
        if settings.USE_OLLAMA:
            try:
                payload = {
                    "model": settings.OLLAMA_EMBED_MODEL,
                    "prompt": text
                }
                url = f"{settings.OLLAMA_BASE_URL}/api/embeddings"
                response = httpx.post(url, json=payload, timeout=20.0)
                if response.status_code == 200:
                    embedding = response.json().get("embedding")
                    if embedding:
                        return embedding
            except Exception as e:
                print(f"Ollama embedding query failed: {e}. Falling back to local.")

        if self.client and self.api_key:
            try:
                response = self.client.models.embed_content(
                    model="text-embedding-004",
                    contents=text,
                )
                if response.embeddings:
                    return response.embeddings[0].values
            except Exception as e:
                print(f"Gemini embedding API failed: {e}. Falling back to local embedder.")
        
        # Fallback local mock embedding (512-dim vector from text hash)
        np.random.seed(hash(text) % (2**32 - 1))
        vec = np.random.randn(512)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def ingest_document(self, lifecycle_id: str, title: str, content: str, source_type: str, metadata: Dict[str, Any] = None) -> str:
        """Store a document, compute its embedding and update the graph."""
        if lifecycle_id not in self.documents:
            self.documents[lifecycle_id] = []
        
        doc_id = f"doc_{len(self.documents[lifecycle_id])}_{hash(title) % 10000}"
        embedding = self.get_embedding(content)
        
        doc = {
            "id": doc_id,
            "title": title,
            "content": content,
            "source_type": source_type,
            "embedding": embedding,
            "metadata": metadata or {},
        }
        self.documents[lifecycle_id].append(doc)
        
        # Update Knowledge Graph
        if lifecycle_id not in self.knowledge_graph:
            self.knowledge_graph[lifecycle_id] = {}
        
        self.knowledge_graph[lifecycle_id][doc_id] = []
        
        # Auto-link based on overlapping keywords
        self._auto_link_graph(lifecycle_id, doc_id, content)
        
        return doc_id

    def _auto_link_graph(self, lifecycle_id: str, new_doc_id: str, new_content: str):
        """Build connections between related files/documents based on keywords."""
        keywords = set(re.findall(r"\b\w{4,15}\b", new_content.lower()))
        # Remove common stop words
        stopwords = {"this", "that", "with", "from", "have", "code", "file", "user", "func", "import", "class"}
        keywords = keywords - stopwords

        for old_doc_id, targets in list(self.knowledge_graph[lifecycle_id].items()):
            if old_doc_id == new_doc_id:
                continue
            
            # Find the old document content
            old_doc = next((d for d in self.documents[lifecycle_id] if d["id"] == old_doc_id), None)
            if not old_doc:
                continue
                
            old_keywords = set(re.findall(r"\b\w{4,15}\b", old_doc["content"].lower()))
            overlap = keywords.intersection(old_keywords)
            
            # If they share significant terms, link them
            if len(overlap) >= 3:
                if old_doc_id not in self.knowledge_graph[lifecycle_id][new_doc_id]:
                    self.knowledge_graph[lifecycle_id][new_doc_id].append(old_doc_id)
                if new_doc_id not in self.knowledge_graph[lifecycle_id][old_doc_id]:
                    self.knowledge_graph[lifecycle_id][old_doc_id].append(new_doc_id)

    def retrieve_relevant(self, lifecycle_id: str, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Retrieve relevant context items via hybrid search."""
        if lifecycle_id not in self.documents or not self.documents[lifecycle_id]:
            return []
            
        # Get query embedding
        query_embedding = self.get_embedding(query)
        
        results = []
        for doc in self.documents[lifecycle_id]:
            # Vector cosine similarity
            v1 = np.array(doc["embedding"])
            v2 = np.array(query_embedding)
            dot_product = np.dot(v1, v2)
            norm_v1 = np.linalg.norm(v1)
            norm_v2 = np.linalg.norm(v2)
            vector_score = dot_product / (norm_v1 * norm_v2) if norm_v1 > 0 and norm_v2 > 0 else 0.0
            
            # Simple keyword matching score (overlap count)
            query_words = set(re.findall(r"\b\w{3,15}\b", query.lower()))
            doc_words = set(re.findall(r"\b\w{3,15}\b", doc["content"].lower()))
            keyword_score = len(query_words.intersection(doc_words)) / max(len(query_words), 1)
            
            # Hybrid score
            hybrid_score = 0.7 * vector_score + 0.3 * keyword_score
            
            results.append((doc, hybrid_score))
            
        # Sort by score descending
        results.sort(key=lambda x: x[1], reverse=True)
        
        # Formulate output structure
        retrieved = []
        for doc, score in results[:k]:
            doc_copy = doc.copy()
            doc_copy.pop("embedding", None) # Don't send embeddings back in APIs
            doc_copy["score"] = float(score)
            retrieved.append(doc_copy)
            
        return retrieved

    def get_graph_nodes_and_links(self, lifecycle_id: str) -> Dict[str, Any]:
        """Format the knowledge graph for visualization in the UI (D3/Canvas)."""
        nodes = []
        links = []
        seen_links = set()
        
        if lifecycle_id not in self.documents:
            return {"nodes": [], "links": []}
            
        # Map IDs to indices or names
        for doc in self.documents[lifecycle_id]:
            nodes.append({
                "id": doc["id"],
                "name": doc["title"],
                "group": doc["source_type"],
                "summary": doc["content"][:200] + "..." if len(doc["content"]) > 200 else doc["content"]
            })
            
        if lifecycle_id in self.knowledge_graph:
            for source, targets in self.knowledge_graph[lifecycle_id].items():
                for target in targets:
                    link_pair = tuple(sorted([source, target]))
                    if link_pair not in seen_links:
                        seen_links.add(link_pair)
                        links.append({
                            "source": source,
                            "target": target,
                            "value": 1
                        })
                        
        return {"nodes": nodes, "links": links}

rag_engine = RAGEngine()
