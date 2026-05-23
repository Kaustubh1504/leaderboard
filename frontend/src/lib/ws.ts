"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Backend contract mirror (NEXUS-OS) --------------------------------- //
// Keep in sync with backend/schemas.py StatePayload.

export type CorpId = "NexusCorp" | "VertexAI" | "ShadowScale" | "Chaos_Operator";

export type Action =
  | "predatory_pricing"
  | "acquire_competitor"
  | "narrative_campaign"
  | "defensive_pivot"
  | "rd_investment"
  | "espionage"
  | "CHAOS";

export interface LeaderboardEntry {
  stock_value: number;       // [0, 200]
  cash_reserves: number;     // [0, 200]
  public_sentiment: number;  // [0, 100]
  market_share: number;      // [0, 200]
}

export type Leaderboard = Record<string, LeaderboardEntry>;

export interface GraphEdge {
  source: string;
  target: string;
  animated: boolean;
}

export interface LastTelemetry {
  sender: string;
  action: string;
  target: string;
  reason: string;
  confidence_score: number;
  parameters: Record<string, unknown>;
}

export interface ChaosMultiplier {
  target: string;
  factor: number;
  ticks_remaining: number;
  source: string;
}

export interface TelemetryState {
  tick: number;
  active_agent: string;
  leaderboard: Leaderboard;
  graph_edges: GraphEdge[];
  last_telemetry: LastTelemetry;
  chaos_multipliers: ChaosMultiplier[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "chaos" | "system" | "action";
  message: string;
}

// --- Initial defaults --------------------------------------------------- //

const CORP_ROTATION: CorpId[] = ["NexusCorp", "VertexAI", "ShadowScale"];

const initialLeaderboard: Leaderboard = {
  NexusCorp:   { stock_value: 142, cash_reserves: 88, public_sentiment: 71, market_share: 34 },
  VertexAI:    { stock_value:  96, cash_reserves: 62, public_sentiment: 55, market_share: 28 },
  ShadowScale: { stock_value:  78, cash_reserves: 41, public_sentiment: 33, market_share: 22 },
};

const initialState: TelemetryState = {
  tick: 0,
  active_agent: "NexusCorp",
  leaderboard: initialLeaderboard,
  graph_edges: [],
  last_telemetry: {
    sender: "System",
    action: "INITIALIZATION",
    target: "All",
    reason: "boot",
    confidence_score: 1.0,
    parameters: {},
  },
  chaos_multipliers: [],
};

const BACKEND_WS_URL = "ws://localhost:8000/ws/telemetry";
const BACKEND_HTTP_URL = "http://localhost:8000";

// Per-metric clamping (matches backend/state.py METRIC_MAX).
const METRIC_MAX: Record<keyof LeaderboardEntry, number> = {
  stock_value: 200,
  cash_reserves: 200,
  public_sentiment: 100,
  market_share: 200,
};
function clampMetric(value: number, metric: keyof LeaderboardEntry): number {
  const upper = METRIC_MAX[metric];
  return Math.max(0, Math.min(upper, Math.floor(value)));
}

// --- Mock pool (mirrors data/seed.json action vocabulary) --------------- //

interface MockEvent {
  sender: CorpId;
  action: Action;
  target: CorpId;
  reason: string;
  confidence_score: number;
  msg: string;
  sentimentImpact: number;
  shareImpact: number;
}

const mockEvents: MockEvent[] = [
  { sender: "VertexAI",    action: "predatory_pricing",   target: "NexusCorp",   reason: "flank_nexus_q4_enterprise_renewals", confidence_score: 0.88, msg: "VertexAI undercuts NexusCorp on enterprise inference pricing.", sentimentImpact: -6, shareImpact: -14 },
  { sender: "NexusCorp",   action: "defensive_pivot",      target: "NexusCorp",   reason: "protect_q3_guidance",                confidence_score: 0.78, msg: "NexusCorp announces $50M buyback to defend Q3 guidance.",        sentimentImpact:  4, shareImpact:   0 },
  { sender: "ShadowScale", action: "narrative_campaign",   target: "NexusCorp",   reason: "nexus_offshore_labelers_leak",       confidence_score: 0.77, msg: "ShadowScale leaks story about NexusCorp's offshore data labelers.", sentimentImpact: -12, shareImpact:  0 },
  { sender: "VertexAI",    action: "rd_investment",        target: "VertexAI",    reason: "step_change_multimodal_model",       confidence_score: 0.91, msg: "VertexAI ships step-change multimodal model release.",          sentimentImpact:  9, shareImpact:   6 },
  { sender: "Chaos_Operator", action: "CHAOS",             target: "NexusCorp",   reason: "EU AI Act Emergency Amendment",      confidence_score: 1.00, msg: "CHAOS: Brussels publishes emergency AI Act amendment overnight.", sentimentImpact: -20, shareImpact:  -8 },
  { sender: "NexusCorp",   action: "acquire_competitor",   target: "ShadowScale", reason: "shadow_cash_collapse_window",        confidence_score: 0.74, msg: "NexusCorp floats all-stock offer for ShadowScale.",             sentimentImpact:  0, shareImpact:  18 },
  { sender: "ShadowScale", action: "espionage",            target: "VertexAI",    reason: "vertex_burn_rate_dossier",           confidence_score: 0.71, msg: "ShadowScale recruits ex-Vertex finance lead for burn-rate dossier.", sentimentImpact: -3, shareImpact:   5 },
  { sender: "Chaos_Operator", action: "CHAOS",             target: "VertexAI",    reason: "TSMC Fab 22 Goes Offline",           confidence_score: 1.00, msg: "CHAOS: TSMC Fab 22 coolant failure cuts GPU allocation 6 weeks.", sentimentImpact:  0, shareImpact: -22 },
  { sender: "NexusCorp",   action: "narrative_campaign",   target: "VertexAI",    reason: "highlight_vertex_burn_rate",         confidence_score: 0.76, msg: "NexusCorp briefs analysts on VertexAI's unsustainable burn rate.", sentimentImpact: -8, shareImpact:   0 },
  { sender: "VertexAI",    action: "predatory_pricing",    target: "ShadowScale", reason: "squeeze_shadow_smb_segment",         confidence_score: 0.82, msg: "VertexAI launches aggressive SMB pricing tier — squeezes ShadowScale.", sentimentImpact: 0, shareImpact:  -9 },
];

export function useTelemetry() {
  const [state, setState] = useState<TelemetryState>(initialState);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "mocked">("connecting");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rawTelemetry, setRawTelemetry] = useState<string>("");

  // High-density historical metrics database (used for Recharts Sparkline/chart visualizations)
  const [history, setHistory] = useState<Record<string, LeaderboardEntry[]>>({
    NexusCorp:   [initialLeaderboard.NexusCorp],
    VertexAI:    [initialLeaderboard.VertexAI],
    ShadowScale: [initialLeaderboard.ShadowScale],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mockTickerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to push logs securely
  const addLog = useCallback((level: "chaos" | "system" | "action", message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const updated = [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, timestamp, level, message },
      ];
      // Keep only last 50 logs for unscrollable viewport
      return updated.slice(-50);
    });
  }, []);

  // Update history database
  const updateHistory = useCallback((currentLeaderboard: Leaderboard) => {
    setHistory((prev) => {
      const nextHistory = { ...prev };
      Object.keys(currentLeaderboard).forEach((key) => {
        const corpHistory = prev[key] || [];
        // Keep last 15 ticks for sparklines
        nextHistory[key] = [...corpHistory, currentLeaderboard[key]].slice(-15);
      });
      return nextHistory;
    });
  }, []);

  // Local state mutator (Mock Ticker Fallback Mode)
  const runMockTick = useCallback(() => {
    setState((prev) => {
      const nextTick = prev.tick + 1;

      // Determine active corp (circular)
      const activeCorpId = CORP_ROTATION[(nextTick - 1) % CORP_ROTATION.length];

      // Select random event
      const eventIndex = Math.floor(Math.random() * mockEvents.length);
      const mockEvent = mockEvents[eventIndex];

      // Mutate leaderboard stats
      const nextLeaderboard = { ...prev.leaderboard };
      Object.keys(nextLeaderboard).forEach((key) => {
        const entry = { ...nextLeaderboard[key] };

        if (key === activeCorpId) {
          // Active corp's stats fluctuate
          entry.stock_value = clampMetric(entry.stock_value + Math.floor(Math.random() * 11) - 5, "stock_value");
          entry.cash_reserves = clampMetric(entry.cash_reserves + Math.floor(Math.random() * 9) - 5, "cash_reserves");
          entry.public_sentiment = clampMetric(
            entry.public_sentiment + (mockEvent.sender === activeCorpId ? mockEvent.sentimentImpact : 2),
            "public_sentiment",
          );
          entry.market_share = clampMetric(
            entry.market_share + (mockEvent.sender === activeCorpId ? mockEvent.shareImpact : 1),
            "market_share",
          );
        } else {
          // Ambient drift
          entry.public_sentiment = clampMetric(entry.public_sentiment + Math.floor(Math.random() * 5) - 2, "public_sentiment");
          entry.market_share = clampMetric(entry.market_share + Math.floor(Math.random() * 3) - 1, "market_share");
        }

        nextLeaderboard[key] = entry;
      });

      // Construct payload
      const nextPayload: TelemetryState = {
        tick: nextTick,
        active_agent: activeCorpId,
        leaderboard: nextLeaderboard,
        graph_edges: [
          { source: "Chaos_Operator", target: activeCorpId, animated: mockEvent.sender === "Chaos_Operator" },
          { source: activeCorpId, target: mockEvent.target, animated: true },
        ],
        last_telemetry: {
          sender: mockEvent.sender,
          action: mockEvent.action,
          target: mockEvent.target,
          reason: mockEvent.reason,
          confidence_score: mockEvent.confidence_score,
          parameters: {},
        },
        chaos_multipliers: prev.chaos_multipliers,
      };

      // Set raw JSON
      setRawTelemetry(JSON.stringify(nextPayload, null, 2));

      // Append log
      const isChaos = mockEvent.sender === "Chaos_Operator";
      addLog(isChaos ? "chaos" : "action", `[${mockEvent.action}] ${mockEvent.msg}`);

      // Update historical track
      updateHistory(nextLeaderboard);

      return nextPayload;
    });
  }, [addLog, updateHistory]);

  // Connect WebSocket function
  const connectWS = useCallback(() => {
    if (wsRef.current) return;

    setConnectionStatus("connecting");
    addLog("system", "Establishing connection to API state loop...");

    try {
      const ws = new WebSocket(BACKEND_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("live");
        addLog("system", "WS telemetry link active. Receiving raw stream.");

        // Disable local mock ticker since backend is online
        if (mockTickerRef.current) {
          clearInterval(mockTickerRef.current);
          mockTickerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          // Verify telemetry state conforms to expected format
          if (payload && typeof payload.tick === "number") {
            setState(payload);
            setRawTelemetry(JSON.stringify(payload, null, 2));

            // Format log message
            const telemetry = payload.last_telemetry;
            if (telemetry) {
              const isChaos = telemetry.sender === "Chaos_Operator" || telemetry.action === "CHAOS";
              const conf = typeof telemetry.confidence_score === "number"
                ? ` (conf=${telemetry.confidence_score.toFixed(2)})`
                : "";
              const logMsg = `[${telemetry.action}] ${telemetry.sender} -> ${telemetry.target} · ${telemetry.reason}${conf}`;
              addLog(isChaos ? "chaos" : "action", logMsg);
            }

            // Backend payload already uses canonical CorpId keys ("NexusCorp" etc.),
            // so the leaderboard goes straight through with no key remapping.
            if (payload.leaderboard) {
              updateHistory(payload.leaderboard);
            }
          }
        } catch (err) {
          console.error("Failed to parse WS state stream:", err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnectionStatus("mocked");
        addLog("system", "WS telemetry link severed. Engaging local state simulator.");

        // Start client-side game loop immediately
        if (!mockTickerRef.current) {
          mockTickerRef.current = setInterval(runMockTick, 3000);
        }

        // Retry connection in 5 seconds
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connectWS, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

    } catch (e) {
      setConnectionStatus("mocked");
      if (!mockTickerRef.current) {
        mockTickerRef.current = setInterval(runMockTick, 3000);
      }
    }
  }, [addLog, runMockTick, updateHistory]);

  // Handle manual queries and trigger requests
  const triggerChaos = useCallback(async () => {
    addLog("system", "Manual override triggered: LAUNCHING CHAOS INJECTION...");
    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/api/chaos/trigger`, {
        method: "POST",
      });
      if (response.ok) {
        const result = await response.json();
        addLog("chaos", `Chaos response: ${result.name || "Macro shock initialized."}`);
      } else {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      addLog("chaos", "CHAOS REST FAIL: Simulation fallback injected market-wide damage.");
      // Mutate local state manually in mocked connection
      if (connectionStatus === "mocked") {
        setState((prev) => {
          const nextLeaderboard = { ...prev.leaderboard };
          Object.keys(nextLeaderboard).forEach((k) => {
            nextLeaderboard[k].stock_value = clampMetric(nextLeaderboard[k].stock_value - 30, "stock_value");
            nextLeaderboard[k].cash_reserves = clampMetric(nextLeaderboard[k].cash_reserves - 18, "cash_reserves");
            nextLeaderboard[k].public_sentiment = clampMetric(nextLeaderboard[k].public_sentiment - 22, "public_sentiment");
          });
          return {
            ...prev,
            leaderboard: nextLeaderboard,
            graph_edges: Object.keys(nextLeaderboard).map((k) => ({
              source: "Chaos_Operator",
              target: k,
              animated: true,
            })),
          };
        });
      }
    }
  }, [addLog, connectionStatus]);

  const queryAgent = useCallback(async (corpId: string) => {
    // Backend expects lowercase slug ("nexuscorp" / "vertexai" / "shadowscale").
    const slug = corpId.toLowerCase();
    addLog("system", `Manual query sent: Force decision check on ${corpId}`);

    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/api/agent/${slug}/query`, {
        method: "POST",
      });
      if (response.ok) {
        addLog("system", `Query check completed for ${corpId}. State recalculated.`);
      } else {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      addLog("system", `REST FAIL: Manual check fallback ran for ${corpId}.`);
      if (connectionStatus === "mocked") {
        // Boost selected corp's stock + cost some cash locally
        setState((prev) => {
          const nextLeaderboard = { ...prev.leaderboard };
          if (nextLeaderboard[corpId]) {
            nextLeaderboard[corpId].stock_value = clampMetric(
              nextLeaderboard[corpId].stock_value + 15, "stock_value");
            nextLeaderboard[corpId].cash_reserves = clampMetric(
              nextLeaderboard[corpId].cash_reserves - 8, "cash_reserves");
          }
          return {
            ...prev,
            leaderboard: nextLeaderboard,
          };
        });
      }
    }
  }, [addLog, connectionStatus]);

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (mockTickerRef.current) clearInterval(mockTickerRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWS]);

  return {
    state,
    history,
    connectionStatus,
    logs,
    rawTelemetry,
    triggerChaos,
    queryAgent,
  };
}
