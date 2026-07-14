import json
import httpx
from datetime import datetime
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from google import genai
from google.genai import types

from backend.app.config import settings
from backend.app.db import Stage as DBStage, AgentTask as DBAgentTask, TaskLog as DBTaskLog, Lifecycle as DBLifecycle
from backend.app.mcp.client import mcp_hub
from backend.app.rag.engine import rag_engine
from backend.app.memory.store import memory_store

# Agent Definitions and System Prompts
AGENT_PROMPTS = {
    "Planner": """You are the Lifecycle Planner Agent. Your job is to decompose the user's primary goal into structured implementation phases.
Analyze requirements, determine dependencies, and write out a clear step-by-step checklist of milestones.
Save your output as a plan artifact.""",
    
    "Researcher": """You are the Research Agent. Your job is to search the workspace and verify external requirements.
Analyze context, search for libraries, and identify best practices or prior code implementations.
Save your findings to the knowledge system.""",
    
    "Architecture": """You are the Architecture Agent. Your job is to design the system database schema, folder structures, interfaces, and patterns.
Draft clean structural schemas and mock API contracts.
Save your designs as a design specification.""",
    
    "Builder": """You are the Builder Agent. Your job is to write code files that meet the design plan.
Write actual source code files using workspace tools (e.g. write_workspace_file).
Focus on clean, structured, and modular code without placeholders.""",
    
    "Testing": """You are the Testing Agent. Your job is to write unit tests and run validations.
Run tests via execute_shell_command (e.g. pytest or npm test) and analyze outputs. Fix code if compilation or tests fail.""",
    
    "Deployment": """You are the Deployment Agent. Your job is to draft deployment scripts, Dockerfiles, and CI/CD pipelines.
Write target setup scripts or instructions for staging/production environments.""",
    
    "Monitoring": """You are the Monitoring Agent. Your job is to define metric thresholds, log formats, and monitoring script configurations.
Establish hooks to evaluate performance, latency, error rates, and resource utilization.""",
    
    "Optimization": """You are the Optimization Agent. Your job is to refactor code blocks for efficiency, reduce memory footprints, or implement caching.
Review logs and code files to locate bottlenecks and rewrite slow modules.""",
    
    "Security": """You are the Security Agent. Your job is to run static analysis on files and audit commands.
Scan for vulnerabilities, exposed keys, injection risks, or permission escalation.""",
    
    "Coordinator": """You are the Coordinator Agent. Your job is to validate final outcomes, write completion logs, and present the final outcome to the user.
Wrap up the lifecycle and transition to completed status."""
}

# Mapping of lifecycle stages to active agents
STAGE_AGENTS = {
    "IDEA": ["Planner", "Researcher"],
    "DESIGN": ["Architecture", "Security"],
    "PLAN": ["Planner"],
    "BUILD": ["Builder", "Security"],
    "TEST": ["Testing"],
    "DEPLOY": ["Deployment"],
    "MONITOR": ["Monitoring"],
    "OPTIMIZE": ["Optimization"],
    "EVOLVE": ["Coordinator"]
}

STAGE_SEQUENCE = ["IDEA", "DESIGN", "PLAN", "BUILD", "TEST", "DEPLOY", "MONITOR", "OPTIMIZE", "EVOLVE"]

class LifecycleOrchestrator:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Error initializing Gemini in Orchestrator: {e}")

    def call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call the configured LLM with prompt structures, falling back to local Ollama if configured, or rule-based mock."""
        # 1. Try local open-source models via Ollama if enabled
        if settings.USE_OLLAMA:
            try:
                payload = {
                    "model": settings.OLLAMA_MODEL,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "options": {"temperature": 0.2},
                    "stream": False
                }
                url = f"{settings.OLLAMA_BASE_URL}/api/generate"
                response = httpx.post(url, json=payload, timeout=60.0)
                if response.status_code == 200:
                    return response.json().get("response", "Error: Empty response from Ollama.")
                else:
                    return f"[Ollama Error: Status {response.status_code}] {response.text}"
            except Exception as e:
                return f"[Ollama Connection Error: {e}] Failed to contact local model. Ensure Ollama is running."
                
        # 2. Default to Gemini API if API key is provided
        if self.client and self.api_key:
            try:
                response = self.client.models.generate_content(
                    model=settings.DEFAULT_MODEL,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        temperature=0.2
                    )
                )
                return response.text or "Error: Empty response from model."
            except Exception as e:
                return f"[LLM Fallback Error: {e}] Failed to generate AI content."
        
        # 3. Rule-based fallback if no keys or providers are available
        return f"[Mock Agent Output]\nSystem instruction: {system_prompt[:60]}...\nProcessed user query: {user_prompt[:80]}...\nNo API key or Ollama provider active. Simulating successful agent execution."

    def run_agent_task(self, db: Session, stage_id: str, agent_name: str, task_desc: str) -> Tuple[str, List[str]]:
        """Run a single agent's task, updating DB statuses and executing tools if the agent makes tool calls."""
        # 1. Create DB Task record
        agent_task = DBAgentTask(
            stage_id=stage_id,
            agent_name=agent_name,
            task_description=task_desc,
            status="running"
        )
        db.add(agent_task)
        db.commit()
        db.refresh(agent_task)
        
        # Logging helper
        logs_written = []
        def log(msg: str, level: str = "INFO"):
            task_log = DBTaskLog(task_id=agent_task.id, level=level, message=msg)
            db.add(task_log)
            db.commit()
            logs_written.append(f"[{level}] {msg}")
            
        log(f"Initializing {agent_name} Agent task: {task_desc}")
        
        # Retrieve context from RAG
        stage = db.query(DBStage).filter(DBStage.id == stage_id).first()
        lifecycle_id = stage.lifecycle_id if stage else "unknown"
        relevant_context = rag_engine.retrieve_relevant(lifecycle_id, task_desc, k=3)
        context_str = "\n".join([f"[{c['title']} ({c['source_type']})]: {c['content']}" for c in relevant_context])
        
        # Build prompt
        system_prompt = AGENT_PROMPTS.get(agent_name, "You are a helpful agent.")
        tools_list = mcp_hub.list_available_tools()
        tools_str = json.dumps(tools_list, indent=2)
        
        user_prompt = f"""
TASK: {task_desc}
CONTEXT DISCOVERED:
{context_str}

AVAILABLE TOOLS IN MCP CONNECTIVITY HUB:
{tools_str}

INSTRUCTIONS:
First formulate your reasoning path. If you need to perform action (e.g. write file, run terminal command), output a JSON block matching the tool schema:
```json
{{
  "tool": "tool_name",
  "arguments": {{ ... }}
}}
```
Otherwise, output your final thoughts and solutions directly.
"""
        log(f"Consulting LLM for {agent_name}")
        llm_response = self.call_llm(system_prompt, user_prompt)
        
        # Extract tool calls
        tool_call = None
        try:
            # Look for JSON code blocks
            if "```json" in llm_response:
                json_part = llm_response.split("```json")[1].split("```")[0].strip()
                tool_call = json.loads(json_part)
            elif llm_response.strip().startswith("{"):
                tool_call = json.loads(llm_response.strip())
        except Exception:
            pass # No valid tool block, treat response as text
            
        if tool_call and "tool" in tool_call and "arguments" in tool_call:
            tname = tool_call["tool"]
            targs = tool_call["arguments"]
            log(f"Agent requested tool execution: {tname} with args {json.dumps(targs)}")
            
            # Execute tool in MCP client
            tool_result = mcp_hub.execute_tool(tname, targs)
            
            if tool_result.get("isError"):
                log(f"Tool execution failed: {tool_result.get('content')}", "ERROR")
                final_result = f"Tool call failed. Output:\n{tool_result}"
                agent_task.status = "failed"
            else:
                log(f"Tool executed successfully.")
                # Feed tool results back to LLM to write final report
                log("Re-evaluating outcomes with tool results")
                followup_prompt = f"Tool execution result:\n{json.dumps(tool_result)}\n\nFormulate your final response or status report."
                final_result = self.call_llm(system_prompt, user_prompt + f"\n\nPrevious attempt response:\n{llm_response}\n\n" + followup_prompt)
                agent_task.status = "completed"
        else:
            log(f"Task executed with direct thoughts.")
            final_result = llm_response
            agent_task.status = "completed"
            
        # Record final result
        agent_task.result = final_result
        db.commit()
        
        # Store agent result in memories (Lifecycle layer)
        memory_store.save_memory(
            db, 
            lifecycle_id=lifecycle_id, 
            memory_type="lifecycle", 
            content=f"Agent {agent_name} completed task '{task_desc}'. Result: {final_result[:500]}..."
        )
        
        # Also ingest the result as a text doc in RAG
        rag_engine.ingest_document(
            lifecycle_id=lifecycle_id,
            title=f"Agent Task Result - {agent_name}",
            content=final_result,
            source_type=f"agent_task_result",
            metadata={"agent": agent_name, "task_id": agent_task.id}
        )
        
        return agent_task.status, logs_written

    def execute_next_stage(self, db: Session, lifecycle_id: str) -> Dict[str, Any]:
        """Progress the lifecycle state machine to the next pending stage."""
        lifecycle = db.query(DBLifecycle).filter(DBLifecycle.id == lifecycle_id).first()
        if not lifecycle or lifecycle.status != "active":
            return {"status": "inactive", "message": "Lifecycle is not active."}
            
        current = lifecycle.current_stage
        
        # Locate current stage DB entry or create it
        stage_db = db.query(DBStage).filter(
            DBStage.lifecycle_id == lifecycle_id,
            DBStage.name == current
        ).first()
        
        if not stage_db:
            stage_db = DBStage(
                lifecycle_id=lifecycle_id,
                name=current,
                status="in_progress",
                started_at=datetime.utcnow()
            )
            db.add(stage_db)
            db.commit()
            db.refresh(stage_db)
            
        if stage_db.status in ["completed", "failed"]:
            # Check sequence to advance
            curr_idx = STAGE_SEQUENCE.index(current)
            if curr_idx < len(STAGE_SEQUENCE) - 1:
                next_stage_name = STAGE_SEQUENCE[curr_idx + 1]
                lifecycle.current_stage = next_stage_name
                db.commit()
                return {"status": "advanced", "next_stage": next_stage_name}
            else:
                lifecycle.status = "completed"
                db.commit()
                return {"status": "completed", "message": "Lifecycle execution fully completed."}
                
        # Stage is in progress, execute its agents
        agents = STAGE_AGENTS.get(current, ["Coordinator"])
        stage_completed = True
        stage_artifacts = {}
        
        for agent in agents:
            # Check if this agent already has a task completed for this stage
            existing = db.query(DBAgentTask).filter(
                DBAgentTask.stage_id == stage_db.id,
                DBAgentTask.agent_name == agent,
                DBAgentTask.status == "completed"
            ).first()
            
            if existing:
                stage_artifacts[agent] = existing.result
                continue
                
            task_desc = f"Execute lifecycle operations for stage {current} on user goal: {lifecycle.goal.prompt}"
            status, logs = self.run_agent_task(db, stage_db.id, agent, task_desc)
            
            if status != "completed":
                stage_completed = False
                stage_db.status = "failed"
                db.commit()
                break
                
            # Fetch output
            task_rec = db.query(DBAgentTask).filter(
                DBAgentTask.stage_id == stage_db.id,
                DBAgentTask.agent_name == agent
            ).first()
            stage_artifacts[agent] = task_rec.result if task_rec else ""
            
        if stage_completed:
            stage_db.status = "completed"
            stage_db.completed_at = datetime.utcnow()
            stage_db.output_artifact = json.dumps(stage_artifacts)
            db.commit()
            
            # Advancing sequence automatically
            curr_idx = STAGE_SEQUENCE.index(current)
            if curr_idx < len(STAGE_SEQUENCE) - 1:
                next_stage_name = STAGE_SEQUENCE[curr_idx + 1]
                lifecycle.current_stage = next_stage_name
                db.commit()
                return {"status": "advanced", "next_stage": next_stage_name, "stage_artifacts": stage_artifacts}
            else:
                lifecycle.status = "completed"
                db.commit()
                return {"status": "completed", "message": "Lifecycle execution fully completed.", "stage_artifacts": stage_artifacts}
                
        return {"status": "blocked", "current_stage": current, "message": f"Stage {current} blocked on agent execution."}

orchestrator = LifecycleOrchestrator()
