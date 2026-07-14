from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from backend.app.db import Memory as DBMemory
from backend.app.rag.engine import rag_engine

class MemoryStore:
    """Manages multi-layered memory (Session, Long-Term, Lifecycle, Organizational, Knowledge)."""
    
    def __init__(self):
        # Cache for session memory (in-memory, volatile)
        self.session_memories: Dict[str, List[Dict[str, Any]]] = {}

    def save_memory(self, db: Session, lifecycle_id: str, memory_type: str, content: str) -> DBMemory:
        """Save memory to the database and also register it in the RAG search index for semantic lookup."""
        # 1. Store in SQL database
        db_memory = DBMemory(
            lifecycle_id=lifecycle_id,
            memory_type=memory_type,
            content=content
        )
        db.add(db_memory)
        db.commit()
        db.refresh(db_memory)
        
        # 2. Ingest into RAG engine for semantic search across memories
        # We index it under 'memory' source type
        doc_id = rag_engine.ingest_document(
            lifecycle_id=lifecycle_id,
            title=f"Memory ({memory_type.upper()}) - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            content=content,
            source_type=f"memory_{memory_type}",
            metadata={"memory_id": db_memory.id}
        )
        
        # Save vector_id ref back to DB
        db_memory.vector_id = doc_id
        db.commit()
        
        return db_memory

    def get_memories_by_type(self, db: Session, lifecycle_id: str, memory_type: str) -> List[DBMemory]:
        """Fetch memories matching a specific type."""
        return db.query(DBMemory).filter(
            DBMemory.lifecycle_id == lifecycle_id,
            DBMemory.memory_type == memory_type
        ).order_by(DBMemory.created_at.desc()).all()

    def search_memories(self, lifecycle_id: str, query: str, k: int = 3) -> List[Dict[str, Any]]:
        """Query stored memories semantically using RAG engine."""
        results = rag_engine.retrieve_relevant(lifecycle_id, query, k=k)
        # Filter for documents that are memory elements
        memories = [r for r in results if r["source_type"].startswith("memory_")]
        return memories

    # Session Memory specific methods
    def add_session_log(self, lifecycle_id: str, role: str, message: str):
        """Append log to running interactive conversation."""
        if lifecycle_id not in self.session_memories:
            self.session_memories[lifecycle_id] = []
        self.session_memories[lifecycle_id].append({
            "role": role,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })

    def get_session_history(self, lifecycle_id: str) -> List[Dict[str, Any]]:
        """Get the dialogue session history for the current lifecycle execution."""
        return self.session_memories.get(lifecycle_id, [])

memory_store = MemoryStore()
