import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from backend.app.config import settings

# Create engine
engine = create_engine(
    settings.DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Goal(Base):
    __tablename__ = "goals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    prompt = Column(Text, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)

    lifecycles = relationship("Lifecycle", back_populates="goal", cascade="all, delete-orphan")

class Lifecycle(Base):
    __tablename__ = "lifecycles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String, ForeignKey("goals.id"), nullable=False)
    current_stage = Column(String, default="IDEA")  # IDEA, DESIGN, PLAN, BUILD, TEST, DEPLOY, MONITOR, OPTIMIZE, EVOLVE
    status = Column(String, default="active")  # active, completed, suspended
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    goal = relationship("Goal", back_populates="lifecycles")
    stages = relationship("Stage", back_populates="lifecycle", cascade="all, delete-orphan")
    memories = relationship("Memory", back_populates="lifecycle", cascade="all, delete-orphan")
    context_items = relationship("ContextItem", back_populates="lifecycle", cascade="all, delete-orphan")

class Stage(Base):
    __tablename__ = "stages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lifecycle_id = Column(String, ForeignKey("lifecycles.id"), nullable=False)
    name = Column(String, nullable=False)  # IDEA, DESIGN, PLAN, BUILD, TEST, DEPLOY, MONITOR, OPTIMIZE, EVOLVE
    status = Column(String, default="pending")  # pending, in_progress, completed, failed
    output_artifact = Column(Text, nullable=True)  # JSON summary of output artifacts
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    lifecycle = relationship("Lifecycle", back_populates="stages")
    agent_tasks = relationship("AgentTask", back_populates="stage", cascade="all, delete-orphan")

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stage_id = Column(String, ForeignKey("stages.id"), nullable=False)
    agent_name = Column(String, nullable=False)  # Planner, Researcher, Architect, Builder, etc.
    task_description = Column(Text, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    result = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    stage = relationship("Stage", back_populates="agent_tasks")
    logs = relationship("TaskLog", back_populates="agent_task", cascade="all, delete-orphan")

class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("agent_tasks.id"), nullable=False)
    level = Column(String, default="INFO")  # INFO, DEBUG, WARNING, ERROR
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    agent_task = relationship("AgentTask", back_populates="logs")

class Memory(Base):
    __tablename__ = "memories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lifecycle_id = Column(String, ForeignKey("lifecycles.id"), nullable=False)
    memory_type = Column(String, nullable=False)  # session, long_term, lifecycle, organizational, knowledge
    content = Column(Text, nullable=False)
    vector_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lifecycle = relationship("Lifecycle", back_populates="memories")

class ContextItem(Base):
    __tablename__ = "context_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lifecycle_id = Column(String, ForeignKey("lifecycles.id"), nullable=False)
    source_type = Column(String, nullable=False)  # workspace, document, api, database
    file_path = Column(String, nullable=True)
    content_summary = Column(Text, nullable=True)
    ingested_at = Column(DateTime, default=datetime.utcnow)

    lifecycle = relationship("Lifecycle", back_populates="context_items")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
