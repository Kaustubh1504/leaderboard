// Mirrors backend/schemas.py StatePayload.
// Keep in sync — both sides reject anything not matching this shape.

export type AgentId =
  | "Hacker_1"
  | "Hacker_2"
  | "Hacker_3"
  | "Hacker_4"
  | "Chaos_Agent";

export type Intent = "OPTIMIZE_CODE" | "REDUCE_SCOPE" | "SUPPORT_TEAMMATE" | "CHAOS";

export interface HackerStats {
  velocity: number;
  efficiency: number;
  stability: number;
  stress: number;
}

export interface GraphEdge {
  source: AgentId;
  target: AgentId;
  animated: boolean;
}

export interface Telemetry {
  sender: AgentId;
  intent: Intent;
  target: AgentId;
  patch_size_kb: number;
}

export interface StatePayload {
  tick: number;
  active_agent: AgentId;
  leaderboard: Record<string, HackerStats>;
  graph_edges: GraphEdge[];
  last_telemetry: Telemetry | null;
}
