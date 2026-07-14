"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Cpu, Database, Award, Layers, Terminal as TermIcon, 
  Plus, CheckCircle, AlertTriangle, Activity, Settings, RefreshCw, BarChart2, Share2, Shield, Eye,
  Folder, FileText, FileCode, Trash2, Save, FilePlus, Laptop, Smartphone, ExternalLink, Search, Code
} from "lucide-react";
import { apiService, GoalSummary, GoalDetail, KnowledgeGraph, AnalyticsMetrics, WorkspaceFile } from "../services/api";

const AGENTS = [
  { name: "Planner", desc: "Lifecycle execution planning & milestone structure", color: "border-purple-500 text-purple-400" },
  { name: "Researcher", desc: "Workspace context audit & external search", color: "border-blue-500 text-blue-400" },
  { name: "Architecture", desc: "Database schemas, patterns, and API contracts", color: "border-cyan-500 text-cyan-400" },
  { name: "Builder", desc: "Source code files compilation & integration", color: "border-emerald-500 text-emerald-400" },
  { name: "Testing", desc: "Test suite writing & automated validation runs", color: "border-orange-500 text-orange-400" },
  { name: "Deployment", desc: "Infrastructure configuration, Docker & pipelines", color: "border-indigo-500 text-indigo-400" },
  { name: "Monitoring", desc: "Telemetry setup, logs parsing, error tracking", color: "border-pink-500 text-pink-400" },
  { name: "Optimization", desc: "Refactoring, performance loop tuning, sizing", color: "border-teal-500 text-teal-400" },
  { name: "Security", desc: "Static scans, vulnerability shielding & policy checks", color: "border-red-500 text-red-400" },
  { name: "Coordinator", desc: "Validation reviews & continuous loop handoff", color: "border-amber-500 text-amber-400" }
];

const STAGE_ORDER = ["IDEA", "DESIGN", "PLAN", "BUILD", "TEST", "DEPLOY", "MONITOR", "OPTIMIZE", "EVOLVE"];

export default function Dashboard() {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GoalDetail | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], links: [] });
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"agents" | "knowledge" | "analytics" | "sandbox">("agents");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // Sandbox State Hooks
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>("");
  const [editedFileContent, setEditedFileContent] = useState<string>("");
  const [previewLayout, setPreviewLayout] = useState<"desktop" | "mobile">("desktop");
  const [newFileName, setNewFileName] = useState("");
  const [isNewFileMode, setIsNewFileMode] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logTerminalEndRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load initial goals and metrics
  useEffect(() => {
    loadGoals();
    loadAnalytics();
  }, []);

  // Poll current detail every 3 seconds if active to refresh stages / artifacts
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (selectedGoalId) {
      loadDetail(selectedGoalId);
      loadKnowledgeGraph(selectedGoalId);
      
      interval = setInterval(() => {
        loadDetail(selectedGoalId, true);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [selectedGoalId]);

  // Handle SSE Logs connection
  useEffect(() => {
    if (selectedGoalId) {
      // Clear logs
      setLogs([]);
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const streamUrl = apiService.getLogsStreamUrl(selectedGoalId);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "state_update") {
            // Can update stages reactively
          } else if (data.message) {
            setLogs((prev) => [...prev, data]);
          }
        } catch (e) {
          console.error("SSE parse error", e);
        }
      };

      es.onerror = () => {
        console.log("SSE Connection closed or errored.");
        es.close();
      };
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [selectedGoalId]);

  // Scroll terminal logs to bottom
  useEffect(() => {
    logTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Draw Knowledge Graph on Canvas
  useEffect(() => {
    if (activeTab === "knowledge" && graph.nodes.length > 0 && canvasRef.current) {
      drawGraph();
    }
  }, [activeTab, graph]);

  // Load workspace files if activeTab is sandbox
  useEffect(() => {
    if (activeTab === "sandbox") {
      loadWorkspaceFiles();
    }
  }, [activeTab]);

  const loadWorkspaceFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const data = await apiService.fetchWorkspaceFiles();
      setWorkspaceFiles(data);
      // Auto-select first file if none selected
      if (data.length > 0 && !selectedFilePath) {
        handleSelectFile(data[0].path);
      }
    } catch (e) {
      console.error("Failed to load workspace files:", e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSelectFile = async (path: string) => {
    setSelectedFilePath(path);
    try {
      const data = await apiService.fetchWorkspaceFile(path);
      setSelectedFileContent(data.content);
      setEditedFileContent(data.content);
    } catch (e) {
      console.error("Failed to load file content:", e);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFilePath) return;
    setIsSavingFile(true);
    try {
      await apiService.saveWorkspaceFile(selectedFilePath, editedFileContent);
      setSelectedFileContent(editedFileContent);
      // Refresh list to update modified time and size
      const data = await apiService.fetchWorkspaceFiles();
      setWorkspaceFiles(data);
    } catch (e) {
      alert("Failed to save file: " + e);
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleDeleteFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    try {
      await apiService.deleteWorkspaceFile(path);
      if (selectedFilePath === path) {
        setSelectedFilePath(null);
        setSelectedFileContent("");
        setEditedFileContent("");
      }
      loadWorkspaceFiles();
    } catch (e) {
      alert("Failed to delete file: " + e);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    
    // Ensure file doesn't start with backend/frontend paths to protect system code
    const parts = newFileName.split("/");
    if (["backend", "frontend", ".git", ".venv", "node_modules"].includes(parts[0])) {
      alert("Cannot create files inside system directories.");
      return;
    }

    try {
      await apiService.saveWorkspaceFile(newFileName, "<!-- Created in Sandbox -->\n");
      setNewFileName("");
      setIsNewFileMode(false);
      await loadWorkspaceFiles();
      handleSelectFile(newFileName);
    } catch (e) {
      alert("Failed to create file: " + e);
    }
  };

  const loadGoals = async () => {
    try {
      const data = await apiService.fetchGoals();
      setGoals(data);
      if (data.length > 0 && !selectedGoalId) {
        setSelectedGoalId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await apiService.fetchAnalytics();
      setAnalytics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDetail = async (id: string, isSilent = false) => {
    try {
      const data = await apiService.fetchGoalDetail(id);
      setDetail(data);
    } catch (e) {
      if (!isSilent) console.error(e);
    }
  };

  const loadKnowledgeGraph = async (id: string) => {
    try {
      const data = await apiService.fetchKnowledgeGraph(id);
      setGraph(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await apiService.submitGoal(prompt);
      setPrompt("");
      await loadGoals();
      setSelectedGoalId(res.goal_id);
    } catch (err) {
      alert("Failed to submit goal");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerNext = async () => {
    if (!selectedGoalId || isExecuting) return;
    setIsExecuting(true);
    try {
      await apiService.triggerNextStage(selectedGoalId);
      await loadDetail(selectedGoalId);
    } catch (err: any) {
      alert(`Execution Blocked: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // HTML5 Graph rendering logic (with physics simulation)
  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = graph.nodes.map((n, i) => ({
      ...n,
      x: canvas.width / 2 + Math.cos(i) * 100 + (Math.random() - 0.5) * 50,
      y: canvas.height / 2 + Math.sin(i) * 100 + (Math.random() - 0.5) * 50,
    }));

    const links = graph.links.map(l => {
      const sourceNode = nodes.find(n => n.id === l.source);
      const targetNode = nodes.find(n => n.id === l.target);
      return { ...l, sourceNode, targetNode };
    });

    // Run simple spring layout simulation for 100 iterations
    for (let step = 0; step < 120; step++) {
      // Repel nodes from each other
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 180) {
            const force = (180 - dist) / 10;
            nodes[i].x -= (dx / dist) * force;
            nodes[i].y -= (dy / dist) * force;
            nodes[j].x += (dx / dist) * force;
            nodes[j].y += (dy / dist) * force;
          }
        }
      }
      // Attract connected nodes
      for (const link of links) {
        if (link.sourceNode && link.targetNode) {
          const dx = link.targetNode.x - link.sourceNode.x;
          const dy = link.targetNode.y - link.sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * 0.05;
          link.sourceNode.x += (dx / dist) * force;
          link.sourceNode.y += (dy / dist) * force;
          link.targetNode.x -= (dx / dist) * force;
          link.targetNode.y -= (dy / dist) * force;
        }
      }
      // Keep within canvas boundaries
      for (const node of nodes) {
        node.x = Math.max(20, Math.min(canvas.width - 20, node.x));
        node.y = Math.max(20, Math.min(canvas.height - 20, node.y));
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw grid helper background
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw links
      ctx.strokeStyle = "rgba(139, 92, 246, 0.25)";
      ctx.lineWidth = 1.5;
      for (const link of links) {
        if (link.sourceNode && link.targetNode) {
          ctx.beginPath();
          ctx.moveTo(link.sourceNode.x, link.sourceNode.y);
          ctx.lineTo(link.targetNode.x, link.targetNode.y);
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const node of nodes) {
        // Outer glow
        ctx.shadowBlur = 15;
        if (node.group.startsWith("memory")) {
          ctx.fillStyle = "#F59E0B"; // Amber
          ctx.shadowColor = "rgba(245, 158, 11, 0.5)";
        } else if (node.group === "agent_task_result") {
          ctx.fillStyle = "#EC4899"; // Pink
          ctx.shadowColor = "rgba(236, 72, 153, 0.5)";
        } else {
          ctx.fillStyle = "#06B6D4"; // Cyan
          ctx.shadowColor = "rgba(6, 182, 212, 0.5)";
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Node Label
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#E5E7EB";
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, node.x, node.y - 12);
      }
    };

    render();

    // Click logic to inspect node
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let foundNode = null;
      for (const node of nodes) {
        const dx = node.x - clickX;
        const dy = node.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 12) {
          foundNode = node;
          break;
        }
      }
      setSelectedNode(foundNode);
    };
  };

  const getStageStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse-glow-cyan shadow-[0_0_10px_rgba(6,182,212,0.3)]";
      case "in_progress": return "bg-purple-500/20 text-purple-400 border-purple-500/40 animate-pulse-glow-purple shadow-[0_0_10px_rgba(139,92,246,0.3)]";
      case "failed": return "bg-red-500/20 text-red-400 border-red-500/40";
      default: return "bg-gray-800/30 text-gray-500 border-gray-700/50";
    }
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "running": return "text-purple-400 bg-purple-500/10 border-purple-500/20 animate-pulse";
      case "failed": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const activeGoal = goals.find(g => g.id === selectedGoalId);

  return (
    <div className="flex h-screen bg-grid-pattern overflow-hidden text-gray-200">
      
      {/* Sidebar - Goals Repository */}
      <div className="w-80 glass-panel border-r border-white/5 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="h-6 w-6 text-purple-500 animate-pulse" />
            <span className="font-semibold text-lg bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">SLM Operator</span>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-400">v1.0.0</span>
        </div>

        {/* Goal Submission Form */}
        <form onSubmit={handleSubmitGoal} className="p-4 border-b border-white/5">
          <label className="block text-xs font-mono uppercase text-gray-400 mb-2">Initiate Goal</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Deploy a microservice..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-black/40 border border-white/10 rounded focus:outline-none focus:border-purple-500 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim()}
              className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded disabled:opacity-40 flex items-center justify-center transition-all duration-300"
            >
              {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </form>

        {/* Goals List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <span className="px-2 text-[10px] font-mono uppercase text-gray-500">Execution Registry</span>
          {goals.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No active tasks. Submit one above.</div>
          ) : (
            goals.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedGoalId(g.id)}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-300 ${
                  g.id === selectedGoalId
                    ? "bg-purple-950/20 border-purple-500/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                    : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10"
                }`}
              >
                <div className="font-semibold text-sm truncate pr-4 text-white">{g.prompt}</div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${getGoalStatusColor(g.status)}`}>
                    {g.status}
                  </span>
                  <span className="text-gray-400 font-mono text-[10px]">
                    {g.current_stage || "IDEA"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeGoal ? (
          <>
            {/* Topbar Info */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0 bg-black/20">
              <div>
                <span className="text-[10px] uppercase font-mono text-cyan-400 tracking-wider">Active Workspace Goal</span>
                <h1 className="text-xl font-bold text-white tracking-tight">{activeGoal.prompt}</h1>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTriggerNext}
                  disabled={isExecuting || detail?.lifecycle.status === "completed"}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded font-medium text-sm transition-all duration-300 disabled:opacity-40 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Agent Execution Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      <span>Progress Next Stage</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lifecycle stages banner */}
            <div className="p-6 border-b border-white/5 overflow-x-auto flex-shrink-0 bg-[#0A0D15]/40">
              <div className="flex items-center justify-between min-w-[900px] relative px-4">
                {/* Connecting Track line */}
                <div className="absolute top-[28px] left-[5%] right-[5%] h-[2px] bg-white/5 -z-10" />
                
                {STAGE_ORDER.map((stage, idx) => {
                  const dbStage = detail?.lifecycle.stages.find(s => s.name === stage);
                  const isCurrent = detail?.lifecycle.current_stage === stage;
                  const status = dbStage ? dbStage.status : (isCurrent ? "in_progress" : "pending");
                  
                  return (
                    <div key={stage} className="flex flex-col items-center relative group">
                      {/* Stage indicator circular badge */}
                      <div className={`h-14 w-14 rounded-full border flex items-center justify-center font-mono text-xs font-semibold transition-all duration-500 z-10 ${getStageStatusColor(status)}`}>
                        {idx + 1}
                      </div>
                      <span className={`mt-2.5 text-[11px] font-mono font-semibold tracking-wider transition-all duration-300 ${isCurrent ? "text-purple-400 font-bold" : "text-gray-400"}`}>
                        {stage}
                      </span>
                      <span className="text-[9px] text-gray-500 uppercase mt-0.5">
                        {status.replace("_", " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Workspace Area: Tab Selectors */}
            <div className="flex border-b border-white/5 bg-black/10 flex-shrink-0">
              <button
                onClick={() => setActiveTab("agents")}
                className={`px-6 py-3 border-b-2 text-sm font-medium font-mono flex items-center gap-2 transition-all duration-300 ${
                  activeTab === "agents" ? "border-purple-500 text-purple-400 bg-purple-500/5" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Cpu className="h-4 w-4" />
                Agent Orchestration deck
              </button>
              <button
                onClick={() => setActiveTab("knowledge")}
                className={`px-6 py-3 border-b-2 text-sm font-medium font-mono flex items-center gap-2 transition-all duration-300 ${
                  activeTab === "knowledge" ? "border-purple-500 text-purple-400 bg-purple-500/5" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Database className="h-4 w-4" />
                Knowledge System & RAG Graph
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-6 py-3 border-b-2 text-sm font-medium font-mono flex items-center gap-2 transition-all duration-300 ${
                  activeTab === "analytics" ? "border-purple-500 text-purple-400 bg-purple-500/5" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <BarChart2 className="h-4 w-4" />
                Analytics & Evolution
              </button>
              <button
                onClick={() => setActiveTab("sandbox")}
                className={`px-6 py-3 border-b-2 text-sm font-medium font-mono flex items-center gap-2 transition-all duration-300 ${
                  activeTab === "sandbox" ? "border-purple-500 text-purple-400 bg-purple-500/5" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Code className="h-4 w-4" />
                Live Sandbox & Explorer
              </button>
            </div>

            {/* Tabs content panels */}
            <div className="flex-1 overflow-hidden relative">
              
              {/* Tab 1: Agent Orchestration Room */}
              {activeTab === "agents" && (
                <div className="h-full flex flex-col lg:flex-row overflow-hidden">
                  
                  {/* Grid of 10 Agents */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                      <Settings className="h-4 w-4 text-purple-500" />
                      Dynamic Agent Teams Configuration
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {AGENTS.map((agent) => {
                        const isActive = detail?.lifecycle.active_agent === agent.name;
                        return (
                          <div
                            key={agent.name}
                            className={`p-4 rounded-lg border glass-panel transition-all duration-500 relative overflow-hidden ${
                              isActive 
                                ? "border-purple-500/60 shadow-[0_0_15px_rgba(139,92,246,0.15)] bg-purple-950/10" 
                                : "border-white/5 bg-white/2"
                            }`}
                          >
                            {/* Scanning Pulse line if active */}
                            {isActive && (
                              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 animate-pulse" />
                            )}
                            
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-purple-400 animate-ping" : "bg-gray-700"}`} />
                                <span className="font-bold text-white text-sm tracking-wide">{agent.name} Agent</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded border ${agent.color}`}>
                                {isActive ? "active" : "idle"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">{agent.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Terminal CLI Stream */}
                  <div className="w-full lg:w-[480px] bg-black/40 border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-black/40 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <TermIcon className="h-4 w-4 text-cyan-400" />
                        <span className="text-xs font-mono font-bold text-gray-300">SYSTEM OPERATIONS LOGGER</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 animate-pulse">realtime logs streaming</span>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] space-y-3 leading-relaxed bg-[#05070B]">
                      {logs.length === 0 ? (
                        <div className="text-gray-600 text-center italic py-20">System idle. Ready to stream logs on next action.</div>
                      ) : (
                        logs.map((log, idx) => (
                          <div key={idx} className="border-l-2 border-purple-500/30 pl-3">
                            <div className="flex justify-between items-center text-[10px] text-gray-500 mb-0.5">
                              <span className="text-cyan-400 font-bold">{log.agent_name || "System"}</span>
                              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-gray-300 whitespace-pre-wrap">{log.message}</div>
                          </div>
                        ))
                      )}
                      <div ref={logTerminalEndRef} />
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 2: Knowledge Map & Canvas */}
              {activeTab === "knowledge" && (
                <div className="h-full flex overflow-hidden">
                  <div className="flex-1 relative">
                    <canvas 
                      ref={canvasRef} 
                      width={800} 
                      height={500} 
                      className="w-full h-full block bg-black/30 cursor-pointer"
                    />
                    <div className="absolute top-4 left-4 p-3 bg-black/60 border border-white/10 rounded font-mono text-[10px] text-gray-400 space-y-1">
                      <div>● Click node to inspect details</div>
                      <div>● Cyan: Workspace docs & System blueprints</div>
                      <div>● Amber: Long-term & Lifecycle memories</div>
                      <div>● Pink: Agent task completion summaries</div>
                    </div>
                  </div>

                  {/* Node Inspect Side Panel */}
                  <div className="w-80 bg-black/40 border-l border-white/5 p-5 overflow-y-auto flex flex-col flex-shrink-0">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400 mb-4">Metadata Inspector</h3>
                    {selectedNode ? (
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-mono text-cyan-400">Node Identifier</label>
                          <div className="font-bold text-white text-sm mt-1">{selectedNode.name}</div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-cyan-400">Source Type</label>
                          <div className="text-xs mt-1 bg-white/5 border border-white/10 px-2 py-1 rounded inline-block font-mono uppercase">
                            {selectedNode.group}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-cyan-400">Context Contents</label>
                          <div className="text-xs text-gray-300 bg-black/60 border border-white/5 p-3 rounded mt-1.5 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                            {selectedNode.summary}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center text-gray-500 text-xs italic">
                        Select a node in the graph to retrieve contextual memory.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Analytics dashboard */}
              {activeTab === "analytics" && (
                <div className="h-full overflow-y-auto p-6 space-y-6">
                  
                  {/* Stats Counter Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 bg-white/2 border border-white/5 rounded-lg glass-panel text-center">
                      <span className="text-[10px] uppercase font-mono text-gray-400">Processed Tasks</span>
                      <div className="text-3xl font-extrabold text-white mt-1.5 font-mono">{analytics?.metrics.total_goals || 0}</div>
                    </div>
                    <div className="p-5 bg-white/2 border border-white/5 rounded-lg glass-panel text-center">
                      <span className="text-[10px] uppercase font-mono text-gray-400">Completed Lifecycles</span>
                      <div className="text-3xl font-extrabold text-cyan-400 mt-1.5 font-mono">{analytics?.metrics.completed_goals || 0}</div>
                    </div>
                    <div className="p-5 bg-white/2 border border-white/5 rounded-lg glass-panel text-center">
                      <span className="text-[10px] uppercase font-mono text-gray-400">Active Pipelines</span>
                      <div className="text-3xl font-extrabold text-purple-400 mt-1.5 font-mono">{analytics?.metrics.running_goals || 0}</div>
                    </div>
                  </div>

                  {/* Execution Timeline and productivity split */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Stage Timeline */}
                    <div className="p-5 bg-white/2 border border-white/5 rounded-lg glass-panel">
                      <h3 className="text-sm font-semibold uppercase font-mono tracking-wider text-white mb-4">Lifecycle Phase Average Durations</h3>
                      <div className="space-y-3 font-mono text-xs">
                        {analytics?.metrics.average_stage_durations &&
                          Object.entries(analytics.metrics.average_stage_durations).map(([stage, dur]) => (
                            <div key={stage} className="flex items-center justify-between gap-4">
                              <span className="w-20 text-gray-400 font-medium">{stage}</span>
                              <div className="flex-1 bg-white/5 h-3 rounded overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded" 
                                  style={{ width: `${Math.min(dur * 5, 100)}%` }} 
                                />
                              </div>
                              <span className="text-right text-gray-300 w-12">{dur}s</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>

                    {/* Agent Productivity Grid */}
                    <div className="p-5 bg-white/2 border border-white/5 rounded-lg glass-panel">
                      <h3 className="text-sm font-semibold uppercase font-mono tracking-wider text-white mb-4">Agent Performance Index</h3>
                      <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        {analytics?.metrics.agent_efficiencies &&
                          Object.entries(analytics.metrics.agent_efficiencies).map(([agent, eff]) => (
                            <div key={agent} className="flex justify-between items-center p-2 rounded bg-white/2 border border-white/5">
                              <span className="text-gray-400 font-medium">{agent}</span>
                              <span className="text-cyan-400 font-bold">{eff}%</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 4: Sandbox & Explorer */}
              {activeTab === "sandbox" && (
                <div className="h-full flex overflow-hidden bg-black/10">
                  
                  {/* File List Sidebar */}
                  <div className="w-72 border-r border-white/5 flex flex-col bg-black/20 flex-shrink-0">
                    <div className="p-4 border-b border-white/5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold tracking-wider">Workspace Files</span>
                        <button
                          onClick={() => setIsNewFileMode(!isNewFileMode)}
                          className="flex items-center gap-1 text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded hover:bg-purple-500/30 transition-all font-mono"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>

                      {/* Search files input */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search files..."
                          value={fileSearchQuery}
                          onChange={(e) => setFileSearchQuery(e.target.value)}
                          className="w-full px-8 py-1.5 text-xs bg-black/40 border border-white/10 rounded focus:outline-none focus:border-purple-500/50 text-white placeholder-gray-500 font-mono"
                        />
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                      </div>

                      {/* Create New File form */}
                      {isNewFileMode && (
                        <form onSubmit={handleCreateFile} className="flex flex-col gap-2 mt-1 bg-white/5 border border-white/10 p-2 rounded">
                          <input
                            type="text"
                            placeholder="sandbox/index.html"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            className="px-2 py-1 text-xs bg-black/60 border border-white/10 rounded focus:outline-none text-white font-mono"
                            required
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsNewFileMode(false)}
                              className="px-2 py-0.5 text-[9px] bg-gray-800 text-gray-400 rounded hover:bg-gray-700 font-mono"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-2 py-0.5 text-[9px] bg-purple-600 text-white rounded hover:bg-purple-500 font-mono"
                            >
                              Create
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* Files List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                      {isLoadingFiles ? (
                        <div className="flex justify-center items-center py-20 text-gray-500 font-mono text-xs">
                          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-purple-400" /> Scanning...
                        </div>
                      ) : workspaceFiles.filter(f => f.path.toLowerCase().includes(fileSearchQuery.toLowerCase())).length === 0 ? (
                        <div className="text-center py-20 text-gray-500 text-xs italic font-mono">
                          No files found.
                        </div>
                      ) : (
                        workspaceFiles
                          .filter(f => f.path.toLowerCase().includes(fileSearchQuery.toLowerCase()))
                          .map((file) => {
                            const isSelected = selectedFilePath === file.path;
                            const isHtml = file.path.endsWith(".html");
                            const isSvg = file.path.endsWith(".svg");
                            
                            return (
                              <div
                                key={file.path}
                                onClick={() => handleSelectFile(file.path)}
                                className={`group flex items-center justify-between p-2.5 rounded cursor-pointer transition-all duration-300 border ${
                                  isSelected
                                    ? "bg-purple-950/20 border-purple-500/40 text-white shadow-[0_0_10px_rgba(139,92,246,0.15)]"
                                    : "bg-white/2 border-transparent text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  {isHtml ? (
                                    <FileCode className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                                  ) : isSvg ? (
                                    <FileCode className="h-4 w-4 text-pink-400 flex-shrink-0" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                  )}
                                  <div className="flex flex-col truncate">
                                    <span className="text-xs font-mono truncate">{file.path}</span>
                                    <span className="text-[9px] text-gray-500 font-mono">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => handleDeleteFile(file.path, e)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5 rounded transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>

                  {/* Main File Content Area (Editor + Preview) */}
                  <div className="flex-1 flex overflow-hidden">
                    
                    {/* Editor Section */}
                    <div className="flex-1 flex flex-col border-r border-white/5 bg-black/40 overflow-hidden">
                      
                      {/* Editor Header */}
                      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-black/40 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <TermIcon className="h-4 w-4 text-cyan-400" />
                          <span className="text-xs font-mono font-bold text-gray-300 font-bold truncate max-w-xs">
                            {selectedFilePath || "No File Selected"}
                          </span>
                          {selectedFilePath && editedFileContent !== selectedFileContent && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                              unsaved edits
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveFile}
                            disabled={!selectedFilePath || isSavingFile || editedFileContent === selectedFileContent}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded text-xs font-semibold transition-all duration-300 font-mono shadow-[0_0_10px_rgba(139,92,246,0.15)]"
                          >
                            {isSavingFile ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            <span>Save Changes</span>
                          </button>
                        </div>
                      </div>

                      {/* Custom Code Editor */}
                      <div className="flex-1 flex overflow-hidden font-mono text-xs relative">
                        {selectedFilePath ? (
                          <textarea
                            value={editedFileContent}
                            onChange={(e) => setEditedFileContent(e.target.value)}
                            className="flex-1 p-5 bg-[#05070B] text-gray-200 outline-none resize-none font-mono leading-relaxed overflow-y-auto border-none"
                            spellCheck={false}
                            placeholder="Type code here..."
                          />
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-center text-gray-500 italic p-6">
                            Select a file to inspect and customize its implementation details.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Preview Section */}
                    <div className="w-[500px] xl:w-[600px] flex flex-col bg-black/20 overflow-hidden flex-shrink-0">
                      
                      {/* Preview Header */}
                      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-black/40 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-purple-400" />
                          <span className="text-xs font-mono font-bold text-gray-300">Live Preview Canvas</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {/* Layout Toggles */}
                          <button
                            onClick={() => setPreviewLayout("desktop")}
                            className={`p-1.5 rounded transition-all ${
                              previewLayout === "desktop" ? "bg-white/10 text-cyan-400 border border-white/10" : "text-gray-500 hover:text-gray-300 border border-transparent"
                            }`}
                            title="Desktop View"
                          >
                            <Laptop className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewLayout("mobile")}
                            className={`p-1.5 rounded transition-all ${
                              previewLayout === "mobile" ? "bg-white/10 text-cyan-400 border border-white/10" : "text-gray-500 hover:text-gray-300 border border-transparent"
                            }`}
                            title="Mobile View"
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </button>
                          
                          {selectedFilePath && (
                            <a
                              href={apiService.getWorkspaceFilePreviewUrl(selectedFilePath)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-gray-500 hover:text-gray-300 border border-transparent transition-all ml-1"
                              title="Open in new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Interactive Preview Canvas */}
                      <div className="flex-1 bg-[#0A0D15]/80 p-4 flex items-center justify-center overflow-auto relative">
                        {selectedFilePath && (selectedFilePath.endsWith(".html") || selectedFilePath.endsWith(".svg")) ? (
                          <div 
                            className={`h-full border border-white/5 rounded-lg overflow-hidden bg-white shadow-2xl transition-all duration-300 flex flex-col ${
                              previewLayout === "mobile" ? "w-[360px] max-h-[640px]" : "w-full"
                            }`}
                          >
                            {/* Browser top-bar */}
                            <div className="h-8 bg-gray-100 border-b border-gray-200 px-3 flex items-center gap-1.5 flex-shrink-0">
                              <div className="h-2.5 w-2.5 bg-red-400 rounded-full" />
                              <div className="h-2.5 w-2.5 bg-yellow-400 rounded-full" />
                              <div className="h-2.5 w-2.5 bg-green-400 rounded-full" />
                              <div className="flex-1 bg-white border border-gray-200 rounded px-2.5 py-0.5 text-[10px] text-gray-400 truncate font-mono ml-3">
                                {apiService.getWorkspaceFilePreviewUrl(selectedFilePath)}
                              </div>
                            </div>
                            
                            {/* Browser iframe */}
                            <iframe
                              key={selectedFilePath + "_" + selectedFileContent.length}
                              src={apiService.getWorkspaceFilePreviewUrl(selectedFilePath)}
                              className="flex-1 w-full bg-white border-none"
                              title="Workspace Sandbox Live View"
                            />
                          </div>
                        ) : (
                          <div className="text-center p-6 space-y-3">
                            <Code className="h-10 w-10 text-gray-600 mx-auto animate-pulse" />
                            <h4 className="text-sm font-semibold text-white font-mono">No Preview Available</h4>
                            <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed mx-auto">
                              Live canvas preview is available for HTML or SVG files. Select or create an HTML file (e.g., `index.html`) to activate live rendering.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/10">
            <Cpu className="h-16 w-16 text-purple-500/40 animate-pulse mb-4" />
            <h2 className="text-xl font-bold text-white tracking-tight">AI Lifecycle Operator Shell</h2>
            <p className="text-sm text-gray-500 max-w-sm text-center mt-2 leading-relaxed">
              No active execution target is selected. Select an existing milestone task or initiate a new one from the sidebar.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
