// Mirrors backend/schemas.py StatePayload.
// Keep in sync — both sides reject anything not matching this shape.

export type CorpId = "NexusCorp" | "VertexAI" | "ShadowScale" | "Chaos_Operator";

export type Action =
  | "predatory_pricing"
  | "acquire_competitor"
  | "narrative_campaign"
  | "defensive_pivot"
  | "rd_investment"
  | "espionage"
  | "CHAOS";

export interface CorpStats {
  stock_value: number;     // [0, 200]
  cash_reserves: number;   // [0, 200]
  public_sentiment: number; // [0, 100]
  market_share: number;    // [0, 200]
}

export interface GraphEdge {
  source: CorpId;
  target: CorpId;
  animated: boolean;
}

export interface Telemetry {
  sender: CorpId;
  action: Action;
  target: CorpId;
  reason: string;
  confidence_score: number; // [0, 1]
  parameters: Record<string, unknown>;
}

export interface ChaosMultiplier {
  target: CorpId;
  factor: number;           // (0, 1] — multiplier applied to subsequent metric_impact deltas
  ticks_remaining: number;  // decrements each tick, entry dropped at 0
  source: string;           // name of the chaos event that installed it
}

export interface StatePayload {
  tick: number;
  active_agent: CorpId;
  leaderboard: Record<string, CorpStats>;
  graph_edges: GraphEdge[];
  last_telemetry: Telemetry | null;
  chaos_multipliers: ChaosMultiplier[];
}
