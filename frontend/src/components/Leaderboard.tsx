"use client";

import React from "react";
import { Zap, Cpu, Shield, AlertTriangle, Play } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { Leaderboard as LeaderboardType, LeaderboardEntry } from "../lib/ws";

interface LeaderboardProps {
  leaderboard: LeaderboardType;
  activeAgent: string;
  history: Record<string, LeaderboardEntry[]>;
  onQueryAgent: (agentId: string) => void;
}

const AGENT_META: Record<string, { name: string; role: string; color: string }> = {
  Hacker_1: { name: "Agent UI", role: "Frontend Lead", color: "var(--accent-cyan)" },
  Hacker_2: { name: "Agent Server", role: "Backend Orchestrator", color: "var(--accent-green)" },
  Hacker_3: { name: "Agent Socket", role: "State Broker", color: "var(--accent-purple)" },
  Hacker_4: { name: "Agent Prompt", role: "Prompt Architect", color: "var(--accent-yellow)" },
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  leaderboard,
  activeAgent,
  history,
  onQueryAgent,
}) => {
  return (
    <div className="panel-card" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Shield size={14} style={{ color: "var(--accent-cyan)" }} />
          TEAM LEADERBOARD & METRICS
        </div>
      </div>
      <div className="panel-content">
        <div className="leaderboard-list">
          {Object.entries(AGENT_META).map(([key, meta]) => {
            const agentId = `Agent_${key}`;
            const stats = leaderboard[key] || { velocity: 0, efficiency: 0, stability: 100, stress: 0 };
            const isActive = activeAgent === agentId;
            const agentHistory = history[key] || [];

            // Determine if agent is in critical state (stability < 20)
            const isPanic = stats.stability < 20;

            return (
              <div
                key={key}
                className={`leaderboard-row ${isActive ? "active-agent" : ""}`}
                style={{
                  borderLeft: `3px solid ${isPanic ? "var(--accent-red)" : meta.color}`,
                }}
              >
                {/* Header info */}
                <div className="row-header">
                  <div className="agent-name-tag">
                    <span style={{ color: isPanic ? "var(--accent-red)" : "#fff" }}>
                      {meta.name}
                    </span>
                    <span className="agent-role">{meta.role}</span>
                    {isPanic && (
                      <AlertTriangle
                        size={12}
                        className="text-red-500"
                        style={{ color: "var(--accent-red)", animation: "blink-text 1s infinite" }}
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Sparkline trend of stability */}
                    {agentHistory.length > 1 && (
                      <div style={{ width: "50px", height: "16px", opacity: 0.8 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={agentHistory}>
                            <Line
                              type="monotone"
                              dataKey="stability"
                              stroke={isPanic ? "#ff073a" : "#00f0ff"}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <button
                      className="query-intent-btn"
                      onClick={() => onQueryAgent(key)}
                      title="Force manual intent calculation cycle"
                    >
                      [Query Intent]
                    </button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="row-stats-grid">
                  <div className="stat-box">
                    <div className="stat-label">
                      <Zap size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Velocity
                    </div>
                    <div className="stat-value">{stats.velocity}%</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <Cpu size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Effic.
                    </div>
                    <div className="stat-value">{stats.efficiency}%</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <Shield size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Stability
                    </div>
                    <div
                      className={`stat-value ${
                        stats.stability < 30 ? "low-stability" : "high-stability"
                      }`}
                    >
                      {stats.stability}%
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <AlertTriangle size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Stress
                    </div>
                    <div
                      className={`stat-value ${
                        stats.stress > 60 ? "high-stress" : "normal-stress"
                      }`}
                    >
                      {stats.stress}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
