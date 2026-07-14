import os
import asyncio
import json
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
import mimetypes
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from backend.app.config import settings
from backend.app.db import init_db, get_db, Goal, Lifecycle, Stage, AgentTask, TaskLog
from backend.app.agents.orchestrator import orchestrator, STAGE_SEQUENCE
from backend.app.rag.engine import rag_engine
from backend.app.memory.store import memory_store

# Initialize DB on startup
init_db()

app = FastAPI(title="SLM (Smart Lifecycle Management) Platform API")

# Configure CORS for Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "platform": "Smart Lifecycle Management (SLM)"}

@app.post("/api/goals")
def create_goal(payload: Dict[str, str], background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    prompt = payload.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")
        
    # 1. Create Goal
    goal = Goal(prompt=prompt, status="running")
    db.add(goal)
    db.commit()
    db.refresh(goal)
    
    # 2. Create Lifecycle
    lifecycle = Lifecycle(goal_id=goal.id, current_stage="IDEA", status="active")
    db.add(lifecycle)
    db.commit()
    db.refresh(lifecycle)
    
    # Seed initial context
    # Read files in workspace to seed RAG
    workspace_dir = settings.WORKSPACE_DIR
    readme_path = os.path.join(workspace_dir, "README.md")
    
    # Pre-populate RAG with general platform details
    rag_engine.ingest_document(
        lifecycle_id=lifecycle.id,
        title="SLM Platform System Architecture",
        content="SLM Platform is a multi-agent framework managing: IDEA -> DESIGN -> PLAN -> BUILD -> TEST -> DEPLOY -> MONITOR -> OPTIMIZE -> EVOLVE.",
        source_type="system_doc"
    )
    
    if os.path.exists(readme_path):
        try:
            with open(readme_path, "r", encoding="utf-8") as f:
                content = f.read()
            rag_engine.ingest_document(
                lifecycle_id=lifecycle.id,
                title="Workspace README",
                content=content,
                source_type="workspace_file",
                metadata={"path": "README.md"}
            )
        except Exception:
            pass
            
    # Trigger first stage run in background
    def run_initial_stage():
        db_session = next(get_db())
        try:
            orchestrator.execute_next_stage(db_session, lifecycle.id)
        except Exception as e:
            print(f"Background run error: {e}")
        finally:
            db_session.close()
            
    background_tasks.add_task(run_initial_stage)
    
    return {
        "goal_id": goal.id,
        "lifecycle_id": lifecycle.id,
        "current_stage": lifecycle.current_stage,
        "status": goal.status
    }

@app.get("/api/goals")
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(Goal).order_by(Goal.created_at.desc()).all()
    results = []
    for g in goals:
        lifecycle = db.query(Lifecycle).filter(Lifecycle.goal_id == g.id).first()
        results.append({
            "id": g.id,
            "prompt": g.prompt,
            "status": g.status,
            "created_at": g.created_at,
            "lifecycle_id": lifecycle.id if lifecycle else None,
            "current_stage": lifecycle.current_stage if lifecycle else None,
            "lifecycle_status": lifecycle.status if lifecycle else None
        })
    return results

@app.get("/api/goals/{goal_id}")
def get_goal_status(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
        
    lifecycle = db.query(Lifecycle).filter(Lifecycle.goal_id == goal_id).first()
    if not lifecycle:
        raise HTTPException(status_code=404, detail="Lifecycle not found.")
        
    stages = db.query(Stage).filter(Stage.lifecycle_id == lifecycle.id).all()
    stage_data = []
    for s in stages:
        tasks = db.query(AgentTask).filter(AgentTask.stage_id == s.id).all()
        task_data = []
        for t in tasks:
            task_data.append({
                "agent_name": t.agent_name,
                "task_description": t.task_description,
                "status": t.status,
                "result": t.result,
                "created_at": t.created_at
            })
        stage_data.append({
            "name": s.name,
            "status": s.status,
            "started_at": s.started_at,
            "completed_at": s.completed_at,
            "output_artifact": json.loads(s.output_artifact) if s.output_artifact else {},
            "tasks": task_data
        })
        
    # Also fetch active agent name
    active_agent = "None"
    running_task = db.query(AgentTask).join(Stage).filter(
        Stage.lifecycle_id == lifecycle.id,
        AgentTask.status == "running"
    ).first()
    if running_task:
        active_agent = running_task.agent_name

    return {
        "id": goal.id,
        "prompt": goal.prompt,
        "status": goal.status,
        "created_at": goal.created_at,
        "lifecycle": {
            "id": lifecycle.id,
            "current_stage": lifecycle.current_stage,
            "status": lifecycle.status,
            "active_agent": active_agent,
            "stages": stage_data
        }
    }

@app.post("/api/goals/{goal_id}/run-next")
def trigger_next_stage(goal_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    lifecycle = db.query(Lifecycle).filter(Lifecycle.goal_id == goal_id).first()
    if not lifecycle:
        raise HTTPException(status_code=404, detail="Lifecycle not found.")
        
    if lifecycle.status == "completed":
        return {"status": "completed", "message": "Lifecycle already completed."}
        
    # Check if there's any active tasks already running
    running_task = db.query(AgentTask).join(Stage).filter(
        Stage.lifecycle_id == lifecycle.id,
        AgentTask.status == "running"
    ).first()
    if running_task:
        raise HTTPException(status_code=400, detail="An agent task is already executing.")

    # Trigger run in background
    def run_next():
        db_session = next(get_db())
        try:
            orchestrator.execute_next_stage(db_session, lifecycle.id)
        except Exception as e:
            print(f"Error executing stage: {e}")
        finally:
            db_session.close()

    background_tasks.add_task(run_next)
    
    return {"status": "triggered", "current_stage": lifecycle.current_stage}

@app.get("/api/goals/{goal_id}/graph")
def get_knowledge_graph(goal_id: str, db: Session = Depends(get_db)):
    lifecycle = db.query(Lifecycle).filter(Lifecycle.goal_id == goal_id).first()
    if not lifecycle:
        raise HTTPException(status_code=404, detail="Lifecycle not found.")
        
    return rag_engine.get_graph_nodes_and_links(lifecycle.id)

@app.get("/api/goals/{goal_id}/logs/stream")
def stream_logs(goal_id: str):
    """Server-Sent Events endpoint to stream real-time task logs to frontend."""
    async def log_generator():
        last_log_id = 0
        while True:
            db = next(get_db())
            try:
                # Find current lifecycle logs
                lifecycle = db.query(Lifecycle).filter(Lifecycle.goal_id == goal_id).first()
                if not lifecycle:
                    yield f"data: {json.dumps({'error': 'Lifecycle not found'})}\n\n"
                    break
                
                # Fetch new logs
                logs = db.query(TaskLog).join(AgentTask).join(Stage).filter(
                    Stage.lifecycle_id == lifecycle.id,
                    TaskLog.id > last_log_id
                ).order_by(TaskLog.id.asc()).all()
                
                for log_entry in logs:
                    yield f"data: {json.dumps({
                        'task_id': log_entry.task_id,
                        'agent_name': log_entry.agent_task.agent_name,
                        'level': log_entry.level,
                        'message': log_entry.message,
                        'timestamp': log_entry.timestamp.isoformat()
                    })}\n\n"
                    last_log_id = max(last_log_id, log_entry.id)
                
                # Yield current state updates to keep frontend sync'd
                yield f"data: {json.dumps({
                    'type': 'state_update',
                    'current_stage': lifecycle.current_stage,
                    'lifecycle_status': lifecycle.status
                })}\n\n"
                
                if lifecycle.status in ["completed", "failed"] and not logs:
                    # Keep connection open briefly, then end
                    await asyncio.sleep(2)
                    
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                db.close()
                
            await asyncio.sleep(1) # check database every 1 second
            
    return StreamingResponse(log_generator(), media_type="text/event-stream")

@app.get("/api/analytics")
def get_analytics(db: Session = Depends(get_db)):
    goals = db.query(Goal).all()
    stages = db.query(Stage).all()
    
    # Calculate some metrics
    total_goals = len(goals)
    completed_goals = len([g for g in goals if g.status == "completed"])
    running_goals = len([g for g in goals if g.status == "running"])
    
    stage_durations = {}
    stage_counts = {}
    for s in stages:
        if s.completed_at and s.started_at:
            duration = (s.completed_at - s.started_at).total_seconds()
            stage_durations[s.name] = stage_durations.get(s.name, 0.0) + duration
            stage_counts[s.name] = stage_counts.get(s.name, 0) + 1
            
    avg_durations = {}
    for stage_name in STAGE_SEQUENCE:
        count = stage_counts.get(stage_name, 0)
        avg_durations[stage_name] = round(stage_durations.get(stage_name, 0.0) / count, 1) if count > 0 else 0.0

    return {
        "metrics": {
            "total_goals": total_goals,
            "completed_goals": completed_goals,
            "running_goals": running_goals,
            "average_stage_durations": avg_durations,
            "agent_efficiencies": {
                "Planner": 95,
                "Researcher": 88,
                "Architecture": 92,
                "Builder": 85,
                "Testing": 79,
                "Deployment": 91,
                "Monitoring": 87,
                "Optimization": 84,
                "Security": 96,
                "Coordinator": 98
            }
        }
    }

@app.get("/api/workspace/files")
def get_workspace_files():
    ignored_dirs = {
        "backend", "frontend", ".git", ".venv", ".pytest_cache", 
        "__pycache__", "node_modules", ".next", ".agents"
    }
    ignored_files = {
        ".env", ".env.example", ".gitignore", "README.md", 
        "composer.json", "slm_platform.db"
    }
    
    workspace_dir = settings.WORKSPACE_DIR
    files_list = []
    
    for root, dirs, files in os.walk(workspace_dir):
        # Filter ignored directories in-place to avoid traversing them
        dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
        
        for file in files:
            if file in ignored_files or file.startswith("."):
                continue
            
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, workspace_dir)
            files_list.append({
                "path": rel_path.replace("\\", "/"),
                "size": os.path.getsize(full_path),
                "modified": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat()
            })
            
    return files_list

@app.get("/api/workspace/file")
def get_workspace_file_content(path: str):
    workspace_dir = settings.WORKSPACE_DIR
    full_path = os.path.abspath(os.path.join(workspace_dir, path))
    if not full_path.startswith(os.path.abspath(workspace_dir)):
        raise HTTPException(status_code=403, detail="Access denied: outside workspace bounds.")
        
    if not os.path.exists(full_path) or os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="File not found.")
        
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@app.post("/api/workspace/file")
def save_workspace_file_content(payload: Dict[str, str]):
    path = payload.get("path")
    content = payload.get("content", "")
    if not path:
        raise HTTPException(status_code=400, detail="Path is required.")
        
    workspace_dir = settings.WORKSPACE_DIR
    full_path = os.path.abspath(os.path.join(workspace_dir, path))
    if not full_path.startswith(os.path.abspath(workspace_dir)):
        raise HTTPException(status_code=403, detail="Access denied: outside workspace bounds.")
        
    # Prevent writing over backend or frontend folders
    rel_path = os.path.relpath(full_path, workspace_dir).replace("\\", "/")
    parts = rel_path.split("/")
    if parts[0] in ["backend", "frontend", ".git", ".venv", "node_modules", ".agents"]:
        raise HTTPException(status_code=403, detail="Access denied: cannot modify system workspace directories.")
        
    try:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "success", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

@app.delete("/api/workspace/file")
def delete_workspace_file(path: str):
    workspace_dir = settings.WORKSPACE_DIR
    full_path = os.path.abspath(os.path.join(workspace_dir, path))
    if not full_path.startswith(os.path.abspath(workspace_dir)):
        raise HTTPException(status_code=403, detail="Access denied: outside workspace bounds.")
        
    rel_path = os.path.relpath(full_path, workspace_dir).replace("\\", "/")
    parts = rel_path.split("/")
    if parts[0] in ["backend", "frontend", ".git", ".venv", "node_modules", ".agents"]:
        raise HTTPException(status_code=403, detail="Access denied: cannot delete files in system directories.")
        
    if not os.path.exists(full_path) or os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="File not found.")
        
    try:
        os.remove(full_path)
        return {"status": "success", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

@app.get("/api/workspace/preview/{file_path:path}")
def preview_workspace_file_render(file_path: str):
    workspace_dir = settings.WORKSPACE_DIR
    full_path = os.path.abspath(os.path.join(workspace_dir, file_path))
    if not full_path.startswith(os.path.abspath(workspace_dir)):
        raise HTTPException(status_code=403, detail="Access denied: outside workspace bounds.")
        
    rel_path = os.path.relpath(full_path, workspace_dir).replace("\\", "/")
    parts = rel_path.split("/")
    if parts[0] in ["backend", "frontend", ".git", ".venv", "node_modules", ".agents"]:
        raise HTTPException(status_code=403, detail="Access denied: cannot preview system folders.")
        
    if not os.path.exists(full_path) or os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="File not found.")
        
    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime_type or "text/plain")

