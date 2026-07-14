# SLM — Smart Lifecycle Management Platform

> **Tagline**: *"Understand ➔ Plan ➔ Execute ➔ Learn ➔ Evolve"*

SLM is an AI-powered Lifecycle Operating System designed to manage the entire lifecycle of goals, tasks, operations, and knowledge. The platform utilizes **Retrieval-Augmented Generation (RAG)**, **Model Context Protocol (MCP)** tools execution, and a **LangGraph-driven Multi-Agent Orchestration Network** to transform goals into continuously evolving outcomes.

---

## 🏗️ System Architecture

```
                  ┌──────────────────────────────┐
                  │          USER GOAL           │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ 1. Goal Understanding Engine │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │2. Context Intelligence System│
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │    3. Advanced RAG Engine    │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ 4. Multi-Agent Orchestration │
                  │     (LangGraph Nodes)        │
                  └──────────────┬───────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│Planner Agent  │          │ Builder Agent │          │Testing Agent  │
└──────┬────────┘          └──────┬────────┘          └──────┬────────┘
       │                          │                          │
       ▼                          ▼                          ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│Memory System  │          │  MCP Client   │          │  Environment  │
└───────────────┘          └───────────────┘          └───────────────┘
```

---

## 🌟 Key Features

1. **Goal Understanding Engine**: Decomposes natural language prompts into logical sub-tasks and priorities.
2. **Context Intelligence System**: Aggregates and ranks information from workspace directories, sessions, and memory stores.
3. **Lifecycle Management Engine**: Coordinates stages of execution: **IDEA ➔ DESIGN ➔ PLAN ➔ BUILD ➔ TEST ➔ DEPLOY ➔ MONITOR ➔ OPTIMIZE ➔ EVOLVE**.
4. **Advanced RAG Engine**: Implements dense vector similarity (via Gemini API) and keyword hybrid retrieval, indexing documents and memories into a linked graph view.
5. **MCP Connectivity Hub**: Exposes universal filesystem actions, shell execution wrappers, and external API connectors under standard tool definitions.
6. **Agentic Execution Layer**: Creates collaborative teams of 10 specialized agent roles (Planner, Researcher, Architect, Builder, Tester, Deployer, Monitor, Optimizer, Security, Coordinator).
7. **Memory + Knowledge System**: Stores facts and outcomes across session, long-term, lifecycle, and organizational layers.
8. **Real-time SSE Operations Console**: Streams execution logs, file changes, and agent thoughts to a responsive CLI console interface in the browser.

---

## 📁 Repository Layout

```
├── backend/                  # FastAPI + Agent Backend
│   ├── app/
│   │   ├── agents/           # Multi-agent graph nodes & system instructions
│   │   ├── mcp/              # MCP client tool executor
│   │   ├── memory/           # Memory stores and retrieval layers
│   │   ├── rag/              # Hybrid search indexer & canvas graph builder
│   │   ├── config.py         # App settings & dotenv parsing
│   │   ├── db.py             # Database models (SQLite/PostgreSQL) and session handlers
│   │   └── main.py           # API endpoints & SSE log generators
│   ├── tests/                # Automated pytest unit test suite
│   ├── requirements.txt      # Python dependencies
│   └── run.py                # Server execution script
├── frontend/                 # Next.js React Dashboard
│   ├── src/
│   │   ├── app/              # Next.js pages, globals, layout
│   │   ├── components/       # Glowing visual cards, canvas graphs, CLI log feeds
│   │   └── services/         # REST API endpoints service client
│   └── package.json          # Frontend packages configurations
├── .env.example              # Environment variables template
└── README.md                 # System overview and startup documentation
```

---

## ⚡ Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (Tested on v24)
- **Python**: v3.10 or higher (Tested on v3.12)
- **Gemini API Key**: (Optional for mock runs, highly recommended for agent reasoning)

### 2. Backend Setup
1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a python virtual environment:
   ```bash
   python -m venv .venv
   # Windows (PowerShell/Command Prompt)
   .venv\Scripts\activate
   # macOS/Linux
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Setup your API credentials in a `.env` file inside the root directory or copy `.env.example`:
   ```bash
   cp ../.env.example ../.env
   ```
5. Run the FastAPI development server:
   ```bash
   python run.py
   ```
   The backend will bootstrap on `http://localhost:8000`.

### 3. Frontend Setup
1. Open a secondary terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the Next.js development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 🧪 Verification & Testing

Verify that backend schemas, database models, RAG vectors, and orchestrator routes are functioning:
```bash
cd backend
pytest
```
All assertions should pass green.

---

## 🛡️ Governance & Security Model
- **Workspace Isolation**: Paths are strictly locked within the project directory to prevent traversal attacks.
- **Safety Intercept Checkpoints**: Dangerous shell operations (like deleting files or installing global tools) trigger a manual approval gate in the Agent Dashboard.
- **Audit Logging**: Every agent step, prompt call, and execution trace is preserved in `task_logs` table for absolute accountability.
