import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db import Base, Goal, Lifecycle, Stage, AgentTask, TaskLog
from backend.app.rag.engine import rag_engine
from backend.app.memory.store import memory_store
from backend.app.agents.orchestrator import orchestrator, STAGE_SEQUENCE

# Test Database setup
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Create a fresh in-memory database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

def test_database_models(db_session):
    """Test standard goal lifecycle DB model relationship creation."""
    goal = Goal(prompt="Build a SaaS product")
    db_session.add(goal)
    db_session.commit()
    
    lifecycle = Lifecycle(goal_id=goal.id, current_stage="IDEA", status="active")
    db_session.add(lifecycle)
    db_session.commit()
    
    stage = Stage(lifecycle_id=lifecycle.id, name="IDEA", status="in_progress")
    db_session.add(stage)
    db_session.commit()
    
    assert goal.id is not None
    assert lifecycle.goal_id == goal.id
    assert stage.lifecycle_id == lifecycle.id
    assert lifecycle.current_stage == "IDEA"

def test_rag_engine_ingest_and_retrieve():
    """Test vector storage indexing and keyword hybrid retrieval functionality."""
    lifecycle_id = "test-lifecycle-123"
    
    # Ingest document
    doc_id = rag_engine.ingest_document(
        lifecycle_id=lifecycle_id,
        title="Weather Microservice Spec",
        content="Create a microservice that exposes a weather API querying external coordinates.",
        source_type="design_doc"
    )
    
    assert doc_id is not None
    
    # Ingest secondary document
    rag_engine.ingest_document(
        lifecycle_id=lifecycle_id,
        title="Auth Module",
        content="Setup JWT session authorization middleware security checks.",
        source_type="code_doc"
    )
    
    # Retrieve relevant items
    results = rag_engine.retrieve_relevant(lifecycle_id, query="weather API query", k=1)
    
    assert len(results) == 1
    assert results[0]["title"] == "Weather Microservice Spec"
    assert results[0]["score"] > 0.0

def test_memory_layers(db_session):
    """Test memory store persistence and tagging."""
    lifecycle_id = "test-lifecycle-456"
    
    # Save memory
    mem = memory_store.save_memory(
        db=db_session,
        lifecycle_id=lifecycle_id,
        memory_type="long_term",
        content="The builder agent preferred Python 3.12 syntax formatting."
    )
    
    assert mem.id is not None
    assert mem.memory_type == "long_term"
    
    # Retrieve
    memories = memory_store.get_memories_by_type(db_session, lifecycle_id, "long_term")
    assert len(memories) == 1
    assert "Python 3.12" in memories[0].content

def test_orchestrator_stage_transitions(db_session):
    """Test transitioning lifecycle stages sequential advances."""
    goal = Goal(prompt="Write simple script")
    db_session.add(goal)
    db_session.commit()
    
    lifecycle = Lifecycle(goal_id=goal.id, current_stage="IDEA", status="active")
    db_session.add(lifecycle)
    db_session.commit()
    
    # Run stage execution
    res = orchestrator.execute_next_stage(db_session, lifecycle.id)
    
    # Verify stage DB records exist
    stages = db_session.query(Stage).filter(Stage.lifecycle_id == lifecycle.id).all()
    assert len(stages) > 0
    assert stages[0].name == "IDEA"
    # Stage status could be completed (in mock mode if LLM call is simulated) or blocked
    assert res["status"] in ["advanced", "blocked", "completed"]
