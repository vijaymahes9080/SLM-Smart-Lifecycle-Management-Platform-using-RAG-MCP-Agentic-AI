const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8020";

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

export const apiService = {
  getApiUrl(): string {
    return BASE_URL;
  },

  async fetchGoals(): Promise<GoalSummary[]> {
    const res = await fetch(`${BASE_URL}/api/goals`);
    if (!res.ok) throw new Error("Failed to fetch goals");
    return res.json();
  },

  async fetchGoalDetail(goalId: string): Promise<GoalDetail> {
    const res = await fetch(`${BASE_URL}/api/goals/${goalId}`);
    if (!res.ok) throw new Error("Failed to fetch goal details");
    return res.json();
  },

  async submitGoal(prompt: string): Promise<{ goal_id: string; lifecycle_id: string }> {
    const res = await fetch(`${BASE_URL}/api/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error("Failed to create goal");
    return res.json();
  },

  async triggerNextStage(goalId: string): Promise<{ status: string; current_stage: string }> {
    const res = await fetch(`${BASE_URL}/api/goals/${goalId}/run-next`, {
      method: "POST",
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to trigger next stage");
    }
    return res.json();
  },

  async fetchKnowledgeGraph(goalId: string): Promise<KnowledgeGraph> {
    const res = await fetch(`${BASE_URL}/api/goals/${goalId}/graph`);
    if (!res.ok) throw new Error("Failed to fetch knowledge graph");
    return res.json();
  },

  async fetchAnalytics(): Promise<AnalyticsMetrics> {
    const res = await fetch(`${BASE_URL}/api/analytics`);
    if (!res.ok) throw new Error("Failed to fetch analytics");
    return res.json();
  },

  getLogsStreamUrl(goalId: string): string {
    return `${BASE_URL}/api/goals/${goalId}/logs/stream`;
  }
};
