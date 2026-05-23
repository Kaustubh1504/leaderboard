"use client";

import React from "react";
import { Zap, Cpu, Shield, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { Leaderboard as LeaderboardType, LeaderboardEntry } from "../lib/ws";

interface LeaderboardProps {
  leaderboard: LeaderboardType;
  activeAgent: string;
  history: Record<string, LeaderboardEntry[]>;
  onQueryAgent: (corpId: string) => void;
}

const CORP_META: Record<string, { name: string; role: string; color: string }> = {
  Google:    { name: "Google",    role: "Gemini · Incumbent / Risk-Averse",    color: "var(--accent-cyan)" },
  OpenAI:    { name: "OpenAI",    role: "GPT · Aggressive Challenger",         color: "var(--accent-green)" },
  Anthropic: { name: "Anthropic", role: "Claude · Safety / Narrative",         color: "var(--accent-purple)" },
};

// Cash_reserves < 15 triggers the backend's insolvency loop (see backend/state.py).
const INSOLVENCY_THRESHOLD = 15;
// Below this sentiment we mark the row as visually wounded.
const SENTIMENT_DANGER = 30;
// Below this market_share we treat the corp as losing the market.
const SHARE_DANGER = 15;

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
          MARKET LEADERBOARD & METRICS
        </div>
      </div>
      <div className="panel-content">
        <div className="leaderboard-list">
          {Object.entries(CORP_META).map(([key, meta]) => {
            const stats = leaderboard[key] || {
              stock_value: 0, cash_reserves: 0, public_sentiment: 100, market_share: 0,
            };
            const isActive = activeAgent === key;
            const corpHistory = history[key] || [];

            // Insolvency = cash_reserves below threshold (matches backend insolvency loop).
            const isInsolvent = stats.cash_reserves < INSOLVENCY_THRESHOLD;

            return (
              <div
                key={key}
                className={`leaderboard-row ${isActive ? "active-agent" : ""}`}
                style={{
                  borderLeft: `3px solid ${isInsolvent ? "var(--accent-red)" : meta.color}`,
                }}
              >
                {/* Header info */}
                <div className="row-header">
                  <div className="agent-name-tag">
                    <span style={{ color: isInsolvent ? "var(--accent-red)" : "#fff" }}>
                      {meta.name}
                    </span>
                    <span className="agent-role">{meta.role}</span>
                    {isInsolvent && (
                      <AlertTriangle
                        size={12}
                        className="text-red-500"
                        style={{ color: "var(--accent-red)", animation: "blink-text 1s infinite" }}
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Sparkline trend of stock_value */}
                    {corpHistory.length > 1 && (
                      <div style={{ width: "50px", height: "16px", opacity: 0.8 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={corpHistory}>
                            <Line
                              type="monotone"
                              dataKey="stock_value"
                              stroke={isInsolvent ? "#ff073a" : "#00f0ff"}
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
                      title="Force manual strategic decision cycle"
                    >
                      [Force Decision]
                    </button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="row-stats-grid">
                  <div className="stat-box">
                    <div className="stat-label">
                      <Zap size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Stock
                    </div>
                    <div className="stat-value">{stats.stock_value}</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <Cpu size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Cash
                    </div>
                    <div
                      className={`stat-value ${
                        stats.cash_reserves < INSOLVENCY_THRESHOLD ? "low-stability" : "high-stability"
                      }`}
                    >
                      {stats.cash_reserves}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <Shield size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Sent.
                    </div>
                    <div
                      className={`stat-value ${
                        stats.public_sentiment < SENTIMENT_DANGER ? "low-stability" : "high-stability"
                      }`}
                    >
                      {stats.public_sentiment}%
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">
                      <AlertTriangle size={8} style={{ marginRight: "2px", display: "inline" }} />
                      Share
                    </div>
                    <div
                      className={`stat-value ${
                        stats.market_share < SHARE_DANGER ? "high-stress" : "normal-stress"
                      }`}
                    >
                      {stats.market_share}
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
