"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { enqueueRadioBlurb } from "./radio";

// --- Backend contract mirror (NEXUS-OS) --------------------------------- //
// Keep in sync with backend/schemas.py StatePayload.

export type CorpId = "Google" | "OpenAI" | "Anthropic" | "Chaos_Operator";

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
  // Voiceover for the audio queue. Optional — boot/system frames omit it.
  radio_blurb?: string | null;
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
  /** Corps mentioned in this event — used by the CorpActivityPane filter. */
  involvedCorps: CorpId[];
}

/**
 * Structured per-tick event. Captures the telemetry frame plus the
 * computed deltas on the leaderboard between this tick and the previous,
 * so the TelemetryStream and hover popover can render *impact* without
 * needing the backend to ship metric_impact on the wire.
 */
export interface TelemetryEvent {
  id: string;
  tick: number;
  timestamp: string;
  telemetry: LastTelemetry;
  /** corp -> metric -> signed delta (current - previous) */
  deltas: Record<string, Partial<LeaderboardEntry>>;
  isChaos: boolean;
}

// --- Initial defaults --------------------------------------------------- //

const CORP_ROTATION: CorpId[] = ["Google", "OpenAI", "Anthropic"];

const initialLeaderboard: Leaderboard = {
  Google:    { stock_value: 142, cash_reserves: 88, public_sentiment: 71, market_share: 34 },
  OpenAI:    { stock_value:  96, cash_reserves: 62, public_sentiment: 55, market_share: 28 },
  Anthropic: { stock_value:  78, cash_reserves: 41, public_sentiment: 33, market_share: 22 },
};

const initialState: TelemetryState = {
  tick: 0,
  active_agent: "Google",
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
  { sender: "OpenAI",    action: "predatory_pricing",   target: "Google",   reason: "flank_google_q4_enterprise_renewals", confidence_score: 0.88, msg: "OpenAI undercuts Google on enterprise inference pricing.", sentimentImpact: -6, shareImpact: -14 },
  { sender: "Google",   action: "defensive_pivot",      target: "Google",   reason: "protect_q3_guidance",                confidence_score: 0.78, msg: "Google announces $50M buyback to defend Q3 guidance.",        sentimentImpact:  4, shareImpact:   0 },
  { sender: "Anthropic", action: "narrative_campaign",   target: "Google",   reason: "google_offshore_labelers_leak",       confidence_score: 0.77, msg: "Anthropic leaks story about Google's offshore data labelers.", sentimentImpact: -12, shareImpact:  0 },
  { sender: "OpenAI",    action: "rd_investment",        target: "OpenAI",    reason: "step_change_multimodal_model",       confidence_score: 0.91, msg: "OpenAI ships step-change multimodal model release.",          sentimentImpact:  9, shareImpact:   6 },
  { sender: "Chaos_Operator", action: "CHAOS",             target: "Google",   reason: "EU AI Act Emergency Amendment",      confidence_score: 1.00, msg: "CHAOS: Brussels publishes emergency AI Act amendment overnight.", sentimentImpact: -20, shareImpact:  -8 },
  { sender: "Google",   action: "acquire_competitor",   target: "Anthropic", reason: "anthropic_cash_collapse_window",        confidence_score: 0.74, msg: "Google floats all-stock offer for Anthropic.",             sentimentImpact:  0, shareImpact:  18 },
  { sender: "Anthropic", action: "espionage",            target: "OpenAI",    reason: "openai_burn_rate_dossier",           confidence_score: 0.71, msg: "Anthropic recruits ex-OpenAI finance lead for burn-rate dossier.", sentimentImpact: -3, shareImpact:   5 },
  { sender: "Chaos_Operator", action: "CHAOS",             target: "OpenAI",    reason: "TSMC Fab 22 Goes Offline",           confidence_score: 1.00, msg: "CHAOS: TSMC Fab 22 coolant failure cuts GPU allocation 6 weeks.", sentimentImpact:  0, shareImpact: -22 },
  { sender: "Google",   action: "narrative_campaign",   target: "OpenAI",    reason: "highlight_openai_burn_rate",         confidence_score: 0.76, msg: "Google briefs analysts on OpenAI's unsustainable burn rate.", sentimentImpact: -8, shareImpact:   0 },
  { sender: "OpenAI",    action: "predatory_pricing",    target: "Anthropic", reason: "squeeze_anthropic_smb_segment",         confidence_score: 0.82, msg: "OpenAI launches aggressive SMB pricing tier — squeezes Anthropic.", sentimentImpact: 0, shareImpact:  -9 },
];

const EVENT_HISTORY_CAP = 30;

/** Compute corp-level deltas between two leaderboard snapshots. */
function computeDeltas(
  next: Leaderboard,
  prev: Leaderboard,
): Record<string, Partial<LeaderboardEntry>> {
  const out: Record<string, Partial<LeaderboardEntry>> = {};
  for (const corp of Object.keys(next)) {
    const a = next[corp];
    const b = prev[corp];
    if (!a || !b) continue;
    const d: Partial<LeaderboardEntry> = {};
    let touched = false;
    (Object.keys(a) as (keyof LeaderboardEntry)[]).forEach((k) => {
      const diff = a[k] - b[k];
      if (diff !== 0) {
        d[k] = diff;
        touched = true;
      }
    });
    if (touched) out[corp] = d;
  }
  return out;
}

export function useTelemetry() {
  const [state, setState] = useState<TelemetryState>(initialState);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "mocked">("connecting");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rawTelemetry, setRawTelemetry] = useState<string>("");
  // Rolling per-tick events with computed impact deltas, drives the
  // TelemetryStream cards and the popover's recent-actions list.
  const [events, setEvents] = useState<TelemetryEvent[]>([]);

  // High-density historical metrics database (used for Recharts Sparkline/chart visualizations)
  const [history, setHistory] = useState<Record<string, LeaderboardEntry[]>>({
    Google:   [initialLeaderboard.Google],
    OpenAI:    [initialLeaderboard.OpenAI],
    Anthropic: [initialLeaderboard.Anthropic],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mockTickerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to push logs securely.
  // involvedCorps powers the CorpActivityPane filter — pass [sender, target]
  // (deduped) when known. System messages can leave it empty.
  const addLog = useCallback((
    level: "chaos" | "system" | "action",
    message: string,
    involvedCorps: CorpId[] = [],
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const updated = [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, timestamp, level, message, involvedCorps },
      ];
      // Keep only last 50 logs for unscrollable viewport
      return updated.slice(-50);
    });
  }, []);

  // Helper: dedup the corps involved in a telemetry frame so the
  // CorpActivityPane can filter by membership.
  function corpsFromTelemetry(sender: string, target: string): CorpId[] {
    const ids: CorpId[] = [];
    const known: CorpId[] = ["Google", "OpenAI", "Anthropic", "Chaos_Operator"];
    if (known.includes(sender as CorpId)) ids.push(sender as CorpId);
    if (known.includes(target as CorpId) && target !== sender) ids.push(target as CorpId);
    return ids;
  }

  // Append a structured event with computed deltas. Skips when the
  // telemetry is identical to the previous frame's (handles WS re-sends).
  const pushEvent = useCallback((
    tick: number,
    telemetry: LastTelemetry,
    nextLeaderboard: Leaderboard,
    prevLeaderboard: Leaderboard,
  ) => {
    setEvents((prev) => {
      // Drop dupes (same tick, same action) — happens on initial-frame echo.
      if (prev.length && prev[prev.length - 1].tick === tick && prev[prev.length - 1].telemetry.reason === telemetry.reason) {
        return prev;
      }
      const event: TelemetryEvent = {
        id: `${tick}-${Date.now()}-${Math.random()}`,
        tick,
        timestamp: new Date().toLocaleTimeString(),
        telemetry,
        deltas: computeDeltas(nextLeaderboard, prevLeaderboard),
        isChaos: telemetry.sender === "Chaos_Operator" || telemetry.action === "CHAOS",
      };
      const next = [...prev, event];
      return next.length > EVENT_HISTORY_CAP ? next.slice(-EVENT_HISTORY_CAP) : next;
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
          // Mock mode borrows the human-readable msg as the blurb so the
          // audio queue stays exercised without a backend.
          radio_blurb: mockEvent.msg,
        },
        chaos_multipliers: prev.chaos_multipliers,
      };

      // Set raw JSON
      setRawTelemetry(JSON.stringify(nextPayload, null, 2));

      // Append log — same readable format as the live WS handler.
      const isChaos = mockEvent.sender === "Chaos_Operator";
      addLog(
        isChaos ? "chaos" : "action",
        formatTelemetryLog(nextPayload.last_telemetry),
        corpsFromTelemetry(mockEvent.sender, mockEvent.target),
      );
      enqueueRadioBlurb(nextPayload.last_telemetry.sender, nextPayload.last_telemetry.radio_blurb);

      // Push structured event with computed deltas (impact view).
      pushEvent(nextTick, nextPayload.last_telemetry, nextLeaderboard, prev.leaderboard);

      // Update historical track
      updateHistory(nextLeaderboard);

      return nextPayload;
    });
  }, [addLog, updateHistory, pushEvent]);

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
            // Capture the previous leaderboard inline so we can compute
            // per-tick deltas for the impact view.
            setState((prev) => {
              if (payload.last_telemetry && payload.leaderboard) {
                pushEvent(payload.tick, payload.last_telemetry, payload.leaderboard, prev.leaderboard);
              }
              return payload;
            });
            setRawTelemetry(JSON.stringify(payload, null, 2));

            // Human-readable activity line — same formatter used by chaos
            // feed + corp activity pane so the verb mapping is consistent.
            const telemetry = payload.last_telemetry;
            if (telemetry) {
              const isChaos = telemetry.sender === "Chaos_Operator" || telemetry.action === "CHAOS";
              addLog(
                isChaos ? "chaos" : "action",
                formatTelemetryLog(telemetry),
                corpsFromTelemetry(telemetry.sender, telemetry.target),
              );
              // Voiceover — serial audio queue handles dedup + overlap.
              enqueueRadioBlurb(telemetry.sender, telemetry.radio_blurb);
            }

            // Backend payload already uses canonical CorpId keys ("Google" etc.),
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
  }, [addLog, runMockTick, updateHistory, pushEvent]);

  // Handle manual queries and trigger requests
  const triggerChaos = useCallback(async () => {
    addLog("system", "Operator: RANDOM CHAOS injection requested...");
    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/api/chaos/trigger`, {
        method: "POST",
      });
      if (response.ok) {
        const result = await response.json();
        addLog(
          "chaos",
          `Chaos: ${result.name || "Macro shock initialized."}`,
          result.target ? [result.target as CorpId] : [],
        );
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

  const triggerCustomChaos = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    addLog("system", `Operator: CUSTOM CHAOS — "${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}"`);
    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/api/chaos/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed.slice(0, 240) }),
      });
      if (response.ok) {
        const result = await response.json();
        addLog(
          "chaos",
          `Chaos: ${result.name || trimmed.slice(0, 80)}`,
          result.target ? [result.target as CorpId] : [],
        );
      } else {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      addLog("chaos", `CHAOS INJECT FAIL: ${trimmed.slice(0, 60)}`);
    }
  }, [addLog]);

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
    events,
    rawTelemetry,
    triggerChaos,
    triggerCustomChaos,
    queryAgent,
  };
}

// --- Static info-button samples ---------------------------------------- //
// Hover-tooltip examples for the "Random Chaos" info icon — drawn from
// the kind of events the Chaos Operator typically emits. Display only.
export const RANDOM_CHAOS_EXAMPLES = [
  "EU AI Act Emergency Amendment",
  "TSMC Fab 22 Goes Offline",
  "DOJ Antitrust Suit Against Market Leader",
  "Hyperscaler Flash Outage Cascades",
];

// --- Human-readable telemetry formatting ------------------------------- //
// Maps action verbs to natural-language phrases so the activity log + chaos
// feed read like sentences instead of tag soup. Separate "self" forms when
// the target is the same as the sender — "Google is doubling down on R&D"
// reads better than "Google is investing R&D into Google".

const ACTION_PHRASE: Record<string, { vs_other: string; self: string }> = {
  predatory_pricing: {
    vs_other: "is cutting prices to squeeze",
    self: "is defending pricing on",
  },
  acquire_competitor: {
    vs_other: "is moving to acquire",
    self: "is restructuring",
  },
  narrative_campaign: {
    vs_other: "launches a narrative campaign against",
    self: "amplifies its own brand narrative",
  },
  defensive_pivot: {
    vs_other: "pivots defensively against pressure from",
    self: "is pivoting defensively",
  },
  rd_investment: {
    vs_other: "out-invests in R&D against",
    self: "doubles down on R&D",
  },
  espionage: {
    vs_other: "is conducting espionage against",
    self: "is hardening its own security",
  },
};

/** Turn a telemetry frame into a single human-readable sentence. */
export function formatTelemetryLog(t: LastTelemetry): string {
  if (t.action === "CHAOS" || t.sender === "Chaos_Operator") {
    return `Chaos Operator fires "${t.reason}" — hits ${t.target}.`;
  }
  const phrase = ACTION_PHRASE[t.action];
  const verb = phrase
    ? t.sender === t.target ? phrase.self : phrase.vs_other
    : t.action.replace(/_/g, " ");
  const reasonPart = t.reason ? ` — angle: "${t.reason}"` : "";
  const confPart = typeof t.confidence_score === "number"
    ? ` (confidence ${Math.round(t.confidence_score * 100)}%)`
    : "";
  if (t.sender === t.target) {
    return `${t.sender} ${verb}${reasonPart}${confPart}.`;
  }
  return `${t.sender} ${verb} ${t.target}${reasonPart}${confPart}.`;
}
