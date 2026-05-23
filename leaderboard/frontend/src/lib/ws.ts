"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface LeaderboardEntry {
  velocity: number;
  efficiency: number;
  stability: number;
  stress: number;
}

export type Leaderboard = Record<string, LeaderboardEntry>;

export interface GraphEdge {
  source: string;
  target: string;
  animated: boolean;
}

export interface LastTelemetry {
  sender: string;
  intent: string;
  target: string;
  patch_size_kb: number;
}

export interface TelemetryState {
  tick: number;
  active_agent: string;
  leaderboard: Leaderboard;
  graph_edges: GraphEdge[];
  last_telemetry: LastTelemetry;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "chaos" | "system" | "action";
  message: string;
}

// Initial default state
const initialLeaderboard: Leaderboard = {
  Hacker_1: { velocity: 85, efficiency: 90, stability: 88, stress: 12 },
  Hacker_2: { velocity: 60, efficiency: 75, stability: 65, stress: 45 },
  Hacker_3: { velocity: 70, efficiency: 80, stability: 82, stress: 22 },
  Hacker_4: { velocity: 50, efficiency: 68, stability: 70, stress: 35 },
};

const initialState: TelemetryState = {
  tick: 0,
  active_agent: "Agent_Hacker_1",
  leaderboard: initialLeaderboard,
  graph_edges: [],
  last_telemetry: {
    sender: "System",
    intent: "INITIALIZATION",
    target: "All",
    patch_size_kb: 0,
  },
};

const BACKEND_WS_URL = "ws://localhost:8000/ws/telemetry";
const BACKEND_HTTP_URL = "http://localhost:8000";

// Fallback pool of pre-written hackathon events for mock ticker (Hacker 4 seed data equivalent)
const mockEvents = [
  { sender: "Agent_Hacker_2", intent: "REFACTOR_BACKEND_PAYLOAD", target: "Agent_Hacker_3", patch_size_kb: 124, msg: "Refactoring state machines to support stream buffering.", stabilityImpact: 5, stressImpact: 8 },
  { sender: "Agent_Hacker_1", intent: "OPTIMIZE_CODE", target: "Agent_Hacker_2", patch_size_kb: 45, msg: "Optimizing canvas component renders to reduce CPU load.", stabilityImpact: 10, stressImpact: -5 },
  { sender: "Agent_Hacker_3", intent: "SUPPORT_TEAMMATE", target: "Agent_Hacker_1", patch_size_kb: 80, msg: "Relaying websocket buffer data stream to client hook.", stabilityImpact: 4, stressImpact: -2 },
  { sender: "Agent_Hacker_4", intent: "REDUCE_SCOPE", target: "Agent_Hacker_3", patch_size_kb: 12, msg: "Cutting visual chart historical buffer depth to stabilize loop.", stabilityImpact: -3, stressImpact: -10 },
  { sender: "Chaos_Agent", intent: "INJECT_LATENCY_SPIKE", target: "Agent_Hacker_2", patch_size_kb: 300, msg: "CHAOS: Network packet drop simulated on backend API gateway!", stabilityImpact: -25, stressImpact: 30 },
  { sender: "Agent_Hacker_2", intent: "OPTIMIZE_CODE", target: "Agent_Hacker_4", patch_size_kb: 75, msg: "Rewriting schema parser with Pydantic model configurations.", stabilityImpact: 8, stressImpact: 4 },
  { sender: "Agent_Hacker_4", intent: "SUPPORT_TEAMMATE", target: "Agent_Hacker_2", patch_size_kb: 95, msg: "Generating fallback prompts to rescue rate-limited LLM calls.", stabilityImpact: 12, stressImpact: 5 },
  { sender: "Chaos_Agent", intent: "MEMORY_LEAK_WARNING", target: "Agent_Hacker_1", patch_size_kb: 512, msg: "CHAOS: Chrome canvas memory leak detected. Memory exceeding 1.2GB!", stabilityImpact: -15, stressImpact: 25 },
  { sender: "Agent_Hacker_1", intent: "SUPPORT_TEAMMATE", target: "Agent_Hacker_4", patch_size_kb: 50, msg: "Injecting CSS emergency safety layout to override broken grids.", stabilityImpact: 6, stressImpact: -6 },
  { sender: "Agent_Hacker_3", intent: "OPTIMIZE_CODE", target: "Agent_Hacker_2", patch_size_kb: 110, msg: "Synchronizing websocket broad pool threads to avoid deadlocks.", stabilityImpact: 15, stressImpact: 5 },
];

export function useTelemetry() {
  const [state, setState] = useState<TelemetryState>(initialState);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "mocked">("connecting");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rawTelemetry, setRawTelemetry] = useState<string>("");
  
  // High-density historical metrics database (used for Recharts Sparkline/chart visualizations)
  const [history, setHistory] = useState<Record<string, LeaderboardEntry[]>>({
    Hacker_1: [initialLeaderboard.Hacker_1],
    Hacker_2: [initialLeaderboard.Hacker_2],
    Hacker_3: [initialLeaderboard.Hacker_3],
    Hacker_4: [initialLeaderboard.Hacker_4],
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
        const agentHistory = prev[key] || [];
        // Keep last 15 ticks for sparklines
        nextHistory[key] = [...agentHistory, currentLeaderboard[key]].slice(-15);
      });
      return nextHistory;
    });
  }, []);

  // Local state mutator (Mock Ticker Fallback Mode)
  const runMockTick = useCallback(() => {
    setState((prev) => {
      const nextTick = prev.tick + 1;
      
      // Determine active agent (circular)
      const agents = ["Agent_Hacker_1", "Agent_Hacker_2", "Agent_Hacker_3", "Agent_Hacker_4"];
      const activeAgentId = agents[(nextTick - 1) % agents.length];
      const activeKey = activeAgentId.replace("Agent_", "");

      // Select random event
      const eventIndex = Math.floor(Math.random() * mockEvents.length);
      const mockEvent = mockEvents[eventIndex];

      // Mutate leaderboard stats
      const nextLeaderboard = { ...prev.leaderboard };
      Object.keys(nextLeaderboard).forEach((key) => {
        const entry = { ...nextLeaderboard[key] };
        
        if (key === activeKey) {
          // Active agent stats fluctuate
          entry.velocity = Math.max(0, Math.min(100, entry.velocity + Math.floor(Math.random() * 11) - 5));
          entry.efficiency = Math.max(0, Math.min(100, entry.efficiency + Math.floor(Math.random() * 9) - 4));
          entry.stability = Math.max(0, Math.min(100, entry.stability + (mockEvent.sender === activeAgentId ? mockEvent.stabilityImpact : 2)));
          entry.stress = Math.max(0, Math.min(100, entry.stress + (mockEvent.sender === activeAgentId ? mockEvent.stressImpact : -2)));
        } else {
          // Ambient drift
          entry.stability = Math.max(0, Math.min(100, entry.stability + Math.floor(Math.random() * 5) - 2));
          entry.stress = Math.max(0, Math.min(100, entry.stress + Math.floor(Math.random() * 5) - 2));
        }

        // Clamp safety check
        entry.velocity = Math.floor(entry.velocity);
        entry.efficiency = Math.floor(entry.efficiency);
        entry.stability = Math.floor(entry.stability);
        entry.stress = Math.floor(entry.stress);

        nextLeaderboard[key] = entry;
      });

      // Construct payload
      const nextPayload: TelemetryState = {
        tick: nextTick,
        active_agent: activeAgentId,
        leaderboard: nextLeaderboard,
        graph_edges: [
          { source: "Chaos_Agent", target: activeAgentId, animated: mockEvent.sender === "Chaos_Agent" },
          { source: activeAgentId, target: mockEvent.target, animated: true }
        ],
        last_telemetry: {
          sender: mockEvent.sender,
          intent: mockEvent.intent,
          target: mockEvent.target,
          patch_size_kb: mockEvent.patch_size_kb
        }
      };

      // Set raw JSON
      setRawTelemetry(JSON.stringify(nextPayload, null, 2));

      // Append log
      const isChaos = mockEvent.sender === "Chaos_Agent";
      addLog(isChaos ? "chaos" : "action", `[${mockEvent.intent}] ${mockEvent.msg}`);

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
              const isChaos = telemetry.sender === "Chaos_Agent";
              const logMsg = `[${telemetry.intent}] Node ${telemetry.sender} -> ${telemetry.target} (${telemetry.patch_size_kb}KB)`;
              addLog(isChaos ? "chaos" : "action", logMsg);
            }

            // Sync metrics check
            if (payload.leaderboard) {
              // Standardize hacker keys inside payload matching initialState structure
              const leaderboardData: Leaderboard = {};
              // Convert Hacker_1 style or Agent_Hacker_1 style keys
              Object.keys(payload.leaderboard).forEach(k => {
                const standardizedKey = k.includes("Hacker_") ? k : `Hacker_${k}`;
                leaderboardData[standardizedKey] = payload.leaderboard[k];
              });
              updateHistory(leaderboardData);
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
        addLog("chaos", `Chaos response received: ${result.catastrophe || "Disaster sequence initialized."}`);
      } else {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      addLog("chaos", "CHAOS REST FAIL: Simulation fallback injected latency penalty (+15s).");
      // Mutate local state manually in mocked connection
      if (connectionStatus === "mocked") {
        setState((prev) => {
          const nextLeaderboard = { ...prev.leaderboard };
          Object.keys(nextLeaderboard).forEach(k => {
            nextLeaderboard[k].stability = Math.max(10, nextLeaderboard[k].stability - 20);
            nextLeaderboard[k].stress = Math.min(95, nextLeaderboard[k].stress + 25);
          });
          return {
            ...prev,
            leaderboard: nextLeaderboard,
            graph_edges: Object.keys(nextLeaderboard).map(k => ({
              source: "Chaos_Agent",
              target: `Agent_${k}`,
              animated: true
            }))
          };
        });
      }
    }
  }, [addLog, connectionStatus]);

  const queryAgent = useCallback(async (agentId: string) => {
    // Standardize naming
    const cleanId = agentId.replace("Agent_", "");
    addLog("system", `Manual query sent: Force decision check on ${cleanId}`);

    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/api/agent/${cleanId}/query`, {
        method: "POST",
      });
      if (response.ok) {
        addLog("system", `Query check completed for ${cleanId}. State recalculated.`);
      } else {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      addLog("system", `REST FAIL: Manual check fallback ran for ${cleanId}.`);
      if (connectionStatus === "mocked") {
        // Boost selected agent code velocity locally
        setState((prev) => {
          const nextLeaderboard = { ...prev.leaderboard };
          if (nextLeaderboard[cleanId]) {
            nextLeaderboard[cleanId].velocity = Math.min(100, nextLeaderboard[cleanId].velocity + 15);
            nextLeaderboard[cleanId].stress = Math.min(100, nextLeaderboard[cleanId].stress + 10);
          }
          return {
            ...prev,
            leaderboard: nextLeaderboard
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
    queryAgent
  };
}
