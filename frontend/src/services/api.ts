const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8020";

export interface WorkspaceFile {
  path: string;
  size: number;
  modified: string;
}

export interface GoalSummary {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
  lifecycle_id: string | null;
  current_stage: string | null;
  lifecycle_status: string | null;
}

export interface TaskInfo {
  agent_name: string;
  task_description: string;
  status: string;
  result: string | null;
  created_at: string;
}

export interface StageInfo {
  name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  output_artifact: Record<string, any>;
  tasks: TaskInfo[];
}

export interface GoalDetail {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
  lifecycle: {
    id: string;
    current_stage: string;
    status: string;
    active_agent: string;
    stages: StageInfo[];
  };
}

export interface GraphNode {
  id: string;
  name: string;
  group: string;
  summary: string;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface AnalyticsMetrics {
  metrics: {
    total_goals: number;
    completed_goals: number;
    running_goals: number;
    average_stage_durations: Record<string, number>;
    agent_efficiencies: Record<string, number>;
  };
}

// -------------------------------------------------------------
// CLIENT-SIDE OFFLINE SIMULATION STORE (Using localStorage)
// -------------------------------------------------------------
const isClient = typeof window !== "undefined";

function getLocalStorageItem<T>(key: string, defaultValue: T): T {
  if (!isClient) return defaultValue;
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : defaultValue;
}

function setLocalStorageItem<T>(key: string, value: T) {
  if (isClient) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

const DEFAULT_MOCK_FILES: WorkspaceFile[] = [
  {
    path: "sandbox/index.html",
    size: 1540,
    modified: new Date().toISOString()
  },
  {
    path: "sandbox/styles.css",
    size: 180,
    modified: new Date().toISOString()
  }
];

const DEFAULT_MOCK_FILE_CONTENTS: Record<string, string> = {
  "sandbox/index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SLM Sandbox Landing Page</title>
  <style>
    body {
      background: #090c15;
      color: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      overflow: hidden;
    }
    .container {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 10px 50px rgba(139, 92, 246, 0.15);
      text-align: center;
      max-width: 440px;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      background: linear-gradient(135deg, #a78bfa, #22d3ee);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0 0 1.25rem 0;
    }
    p {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .btn {
      padding: 0.85rem 2rem;
      background: linear-gradient(135deg, #7c3aed, #0891b2);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      box-shadow: 0 0 15px rgba(8, 145, 178, 0.3);
      transition: all 0.3s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 25px rgba(8, 145, 178, 0.5);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SLM Playground Active</h1>
    <p>This is a live preview rendering of the HTML page generated in client-side simulation mode. Try editing this file in the editor and click "Save Changes" to see live updates!</p>
    <button class="btn" onclick="alert('Hello from the Simulated Sandbox!')">Interactive Demo</button>
  </div>
</body>
</html>`,
  "sandbox/styles.css": `/* Custom styles for your Sandbox environment */`
};

const STAGES = ["IDEA", "DESIGN", "PLAN", "BUILD", "TEST", "DEPLOY", "MONITOR", "OPTIMIZE", "EVOLVE"];
const STAGE_AGENTS: Record<string, string[]> = {
  "IDEA": ["Planner", "Researcher"],
  "DESIGN": ["Architecture", "Security"],
  "PLAN": ["Planner"],
  "BUILD": ["Builder", "Security"],
  "TEST": ["Testing"],
  "DEPLOY": ["Deployment"],
  "MONITOR": ["Monitoring"],
  "OPTIMIZE": ["Optimization"],
  "EVOLVE": ["Coordinator"]
};

let isOffline = false;

// Custom request wrapper to detect offline state
async function apiCall<T>(call: () => Promise<T>, mockFallback: () => Promise<T>): Promise<T> {
  if (isOffline) {
    return mockFallback();
  }
  try {
    return await call();
  } catch (e: any) {
    if (e instanceof TypeError || e.message?.includes("fetch")) {
      console.warn("FastAPI backend is unreachable. Switching to client-side Simulation Mode.");
      isOffline = true;
      if (isClient) {
        window.dispatchEvent(new CustomEvent("slm-offline-mode"));
      }
      return mockFallback();
    }
    throw e;
  }
}

// -------------------------------------------------------------
// API SERVICE
// -------------------------------------------------------------
export const apiService = {
  getApiUrl(): string {
    return BASE_URL;
  },

  isOfflineMode(): boolean {
    return isOffline;
  },

  async fetchGoals(): Promise<GoalSummary[]> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/goals`);
        if (!res.ok) throw new Error("Failed to fetch goals");
        return res.json();
      },
      async () => {
        return getLocalStorageItem<GoalSummary[]>("slm_mock_goals", [
          {
            id: "mock-1",
            prompt: "Create a modern responsive portfolio landing page with interactive canvas elements",
            status: "running",
            created_at: new Date().toISOString(),
            lifecycle_id: "lc-mock-1",
            current_stage: "IDEA",
            lifecycle_status: "active"
          }
        ]);
      }
    );
  },

  async fetchGoalDetail(goalId: string): Promise<GoalDetail> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/goals/${goalId}`);
        if (!res.ok) throw new Error("Failed to fetch goal details");
        return res.json();
      },
      async () => {
        const details = getLocalStorageItem<Record<string, GoalDetail>>("slm_mock_details", {
          "mock-1": {
            id: "mock-1",
            prompt: "Create a modern responsive portfolio landing page with interactive canvas elements",
            status: "running",
            created_at: new Date().toISOString(),
            lifecycle: {
              id: "lc-mock-1",
              current_stage: "IDEA",
              status: "active",
              active_agent: "Planner",
              stages: [
                {
                  name: "IDEA",
                  status: "in_progress",
                  started_at: new Date().toISOString(),
                  completed_at: null,
                  output_artifact: {},
                  tasks: [
                    {
                      agent_name: "Planner",
                      task_description: "Decompose user goal into sub-tasks",
                      status: "running",
                      result: null,
                      created_at: new Date().toISOString()
                    }
                  ]
                }
              ]
            }
          }
        });
        return details[goalId] || {
          id: goalId,
          prompt: "Simulated Custom Goal",
          status: "completed",
          created_at: new Date().toISOString(),
          lifecycle: {
            id: "lc-" + goalId,
            current_stage: "EVOLVE",
            status: "completed",
            active_agent: "Coordinator",
            stages: []
          }
        };
      }
    );
  },

  async submitGoal(prompt: string): Promise<{ goal_id: string; lifecycle_id: string }> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) throw new Error("Failed to create goal");
        return res.json();
      },
      async () => {
        const goals = getLocalStorageItem<GoalSummary[]>("slm_mock_goals", []);
        const id = "mock-" + Math.floor(Math.random() * 100000);
        const newGoal: GoalSummary = {
          id,
          prompt,
          status: "running",
          created_at: new Date().toISOString(),
          lifecycle_id: "lc-" + id,
          current_stage: "IDEA",
          lifecycle_status: "active"
        };
        goals.unshift(newGoal);
        setLocalStorageItem("slm_mock_goals", goals);

        const details = getLocalStorageItem<Record<string, GoalDetail>>("slm_mock_details", {});
        details[id] = {
          id,
          prompt,
          status: "running",
          created_at: new Date().toISOString(),
          lifecycle: {
            id: "lc-" + id,
            current_stage: "IDEA",
            status: "active",
            active_agent: "Planner",
            stages: [
              {
                name: "IDEA",
                status: "in_progress",
                started_at: new Date().toISOString(),
                completed_at: null,
                output_artifact: {},
                tasks: [
                  {
                    agent_name: "Planner",
                    task_description: "Decompose user goal into milestones",
                    status: "running",
                    result: null,
                    created_at: new Date().toISOString()
                  }
                ]
              }
            ]
          }
        };
        setLocalStorageItem("slm_mock_details", details);

        const logs = getLocalStorageItem<Record<string, any[]>>("slm_mock_logs", {});
        logs[id] = [
          {
            agent_name: "Planner",
            message: "Initiating goal: " + prompt,
            level: "INFO",
            timestamp: new Date().toISOString()
          },
          {
            agent_name: "Planner",
            message: "No live backend detected. Operating in simulated offline mode.",
            level: "WARNING",
            timestamp: new Date().toISOString()
          }
        ];
        setLocalStorageItem("slm_mock_logs", logs);

        return { goal_id: id, lifecycle_id: "lc-" + id };
      }
    );
  },

  async triggerNextStage(goalId: string): Promise<{ status: string; current_stage: string }> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/goals/${goalId}/run-next`, {
          method: "POST",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to trigger next stage");
        }
        return res.json();
      },
      async () => {
        const details = getLocalStorageItem<Record<string, GoalDetail>>("slm_mock_details", {});
        const detail = details[goalId];
        if (!detail) return { status: "error", current_stage: "unknown" };

        const current = detail.lifecycle.current_stage;
        const currIdx = STAGES.indexOf(current);

        const currentStageObj = detail.lifecycle.stages.find(s => s.name === current);
        if (currentStageObj) {
          currentStageObj.status = "completed";
          currentStageObj.completed_at = new Date().toISOString();
          currentStageObj.tasks.forEach(t => {
            t.status = "completed";
            t.result = "Stage tasks executed successfully.";
          });
        }

        let nextStage = current;
        if (currIdx < STAGES.length - 1) {
          nextStage = STAGES[currIdx + 1];
          detail.lifecycle.current_stage = nextStage;
          detail.lifecycle.active_agent = STAGE_AGENTS[nextStage]?.[0] || "Coordinator";
          
          detail.lifecycle.stages.push({
            name: nextStage,
            status: "in_progress",
            started_at: new Date().toISOString(),
            completed_at: null,
            output_artifact: {},
            tasks: (STAGE_AGENTS[nextStage] || ["Coordinator"]).map(agent => ({
              agent_name: agent,
              task_description: `Run operational node tools for ${nextStage} stage.`,
              status: "running",
              result: null,
              created_at: new Date().toISOString()
            }))
          });

          const logs = getLocalStorageItem<Record<string, any[]>>("slm_mock_logs", {});
          const gLogs = logs[goalId] || [];
          gLogs.push({
            agent_name: detail.lifecycle.active_agent,
            message: `Transitioning stage: ${current} -> ${nextStage}`,
            level: "INFO",
            timestamp: new Date().toISOString()
          });
          gLogs.push({
            agent_name: detail.lifecycle.active_agent,
            message: `Dispatched agents: ${STAGE_AGENTS[nextStage]?.join(", ")}`,
            level: "INFO",
            timestamp: new Date().toISOString()
          });

          if (nextStage === "BUILD") {
            gLogs.push({
              agent_name: "Builder",
              message: "Builder agent executing tool: write_workspace_file for sandbox/index.html",
              level: "INFO",
              timestamp: new Date().toISOString()
            });
            gLogs.push({
              agent_name: "Builder",
              message: "Successfully generated project sandbox files.",
              level: "SUCCESS",
              timestamp: new Date().toISOString()
            });
          }

          logs[goalId] = gLogs;
          setLocalStorageItem("slm_mock_logs", logs);
        } else {
          detail.status = "completed";
          detail.lifecycle.status = "completed";
          detail.lifecycle.active_agent = "None";

          const logs = getLocalStorageItem<Record<string, any[]>>("slm_mock_logs", {});
          const gLogs = logs[goalId] || [];
          gLogs.push({
            agent_name: "Coordinator",
            message: "Lifecycle complete. Simulated outcomes verified.",
            level: "SUCCESS",
            timestamp: new Date().toISOString()
          });
          logs[goalId] = gLogs;
          setLocalStorageItem("slm_mock_logs", logs);

          const goals = getLocalStorageItem<GoalSummary[]>("slm_mock_goals", []);
          const g = goals.find(x => x.id === goalId);
          if (g) {
            g.status = "completed";
            g.current_stage = "EVOLVE";
            setLocalStorageItem("slm_mock_goals", goals);
          }
        }

        setLocalStorageItem("slm_mock_details", details);
        return { status: "advanced", current_stage: nextStage };
      }
    );
  },

  async fetchKnowledgeGraph(goalId: string): Promise<KnowledgeGraph> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/goals/${goalId}/graph`);
        if (!res.ok) throw new Error("Failed to fetch knowledge graph");
        return res.json();
      },
      async () => {
        return {
          nodes: [
            { id: "mock-n1", name: "System Plan", group: "system_doc", summary: "Mock project roadmap" },
            { id: "mock-n2", name: "Builder Agent Output", group: "agent_task_result", summary: "Files written in sandbox/" },
            { id: "mock-n3", name: "Memory Store", group: "memory", summary: "Offline execution memories" }
          ],
          links: [
            { source: "mock-n1", target: "mock-n2", value: 1 },
            { source: "mock-n2", target: "mock-n3", value: 1 }
          ]
        };
      }
    );
  },

  async fetchAnalytics(): Promise<AnalyticsMetrics> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/analytics`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      },
      async () => {
        return {
          metrics: {
            total_goals: 12,
            completed_goals: 8,
            running_goals: 4,
            average_stage_durations: {
              "IDEA": 1.2, "DESIGN": 2.4, "PLAN": 0.8, "BUILD": 5.6, "TEST": 3.1, "DEPLOY": 1.9, "MONITOR": 2.5, "OPTIMIZE": 4.2, "EVOLVE": 1.1
            },
            agent_efficiencies: {
              "Planner": 96, "Researcher": 91, "Architecture": 95, "Builder": 88, "Testing": 82, "Deployment": 94, "Monitoring": 89, "Optimization": 87, "Security": 98, "Coordinator": 99
            }
          }
        };
      }
    );
  },

  getLogsStreamUrl(goalId: string): string {
    return `${BASE_URL}/api/goals/${goalId}/logs/stream`;
  },

  async fetchMockLogs(goalId: string): Promise<any[]> {
    const logs = getLocalStorageItem<Record<string, any[]>>("slm_mock_logs", {});
    return logs[goalId] || [];
  },

  async fetchWorkspaceFiles(): Promise<WorkspaceFile[]> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/workspace/files`);
        if (!res.ok) throw new Error("Failed to fetch workspace files");
        return res.json();
      },
      async () => {
        return getLocalStorageItem<WorkspaceFile[]>("slm_mock_files", DEFAULT_MOCK_FILES);
      }
    );
  },

  async fetchWorkspaceFile(path: string): Promise<{ path: string; content: string }> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/workspace/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error("Failed to fetch workspace file content");
        return res.json();
      },
      async () => {
        const contents = getLocalStorageItem<Record<string, string>>("slm_mock_file_contents", DEFAULT_MOCK_FILE_CONTENTS);
        return { path, content: contents[path] || "/* File Empty */" };
      }
    );
  },

  async saveWorkspaceFile(path: string, content: string): Promise<{ status: string; path: string }> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/workspace/file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content })
        });
        if (!res.ok) throw new Error("Failed to save workspace file");
        return res.json();
      },
      async () => {
        const files = getLocalStorageItem<WorkspaceFile[]>("slm_mock_files", DEFAULT_MOCK_FILES);
        if (!files.find(f => f.path === path)) {
          files.push({
            path,
            size: content.length,
            modified: new Date().toISOString()
          });
          setLocalStorageItem("slm_mock_files", files);
        } else {
          const f = files.find(f => f.path === path)!;
          f.size = content.length;
          f.modified = new Date().toISOString();
          setLocalStorageItem("slm_mock_files", files);
        }
        const contents = getLocalStorageItem<Record<string, string>>("slm_mock_file_contents", DEFAULT_MOCK_FILE_CONTENTS);
        contents[path] = content;
        setLocalStorageItem("slm_mock_file_contents", contents);
        return { status: "success", path };
      }
    );
  },

  async deleteWorkspaceFile(path: string): Promise<{ status: string; path: string }> {
    return apiCall(
      async () => {
        const res = await fetch(`${BASE_URL}/api/workspace/file?path=${encodeURIComponent(path)}`, {
          method: "DELETE"
        });
        if (!res.ok) throw new Error("Failed to delete workspace file");
        return res.json();
      },
      async () => {
        const files = getLocalStorageItem<WorkspaceFile[]>("slm_mock_files", DEFAULT_MOCK_FILES);
        const filtered = files.filter(f => f.path !== path);
        setLocalStorageItem("slm_mock_files", filtered);

        const contents = getLocalStorageItem<Record<string, string>>("slm_mock_file_contents", DEFAULT_MOCK_FILE_CONTENTS);
        delete contents[path];
        setLocalStorageItem("slm_mock_file_contents", contents);
        return { status: "success", path };
      }
    );
  },

  getWorkspaceFilePreviewUrl(path: string): string {
    return `${BASE_URL}/api/workspace/preview/${path}`;
  }
};
