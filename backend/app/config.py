import os
# Standard environment variable mapping

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./slm_platform.db")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    WORKSPACE_DIR: str = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    PORT: int = int(os.getenv("PORT", 8020))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    
    # Defaults
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "gemini-2.5-flash")
    
    # Ollama / Open Source configuration
    USE_OLLAMA: bool = os.getenv("USE_OLLAMA", "false").lower() == "true"
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5")
    OLLAMA_EMBED_MODEL: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

settings = Settings()
