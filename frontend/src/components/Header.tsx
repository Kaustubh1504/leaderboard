"use client";

import React from "react";
import { Flame, Activity } from "lucide-react";

interface HeaderProps {
  tick: number;
  connectionStatus: "connecting" | "live" | "mocked";
  onTriggerChaos: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  tick,
  connectionStatus,
  onTriggerChaos,
}) => {
  return (
    <header className="header">
      <div className="header-title-section">
        <Activity size={18} className="text-cyan-400" style={{ color: "var(--accent-cyan)" }} />
        <h1 className="header-title">AI WAR ROOM // OPERATIONAL CONTROL</h1>
        
        {connectionStatus === "live" && (
          <div className="status-badge live">
            <span className="status-indicator-dot"></span>
            <span>LIVE SYNC</span>
          </div>
        )}
        
        {connectionStatus === "mocked" && (
          <div className="status-badge mocked">
            <span className="status-indicator-dot"></span>
            <span>SIMULATED FALLBACK</span>
          </div>
        )}

        {connectionStatus === "connecting" && (
          <div className="status-badge">
            <span className="status-indicator-dot" style={{ animation: "pulse-glow 1s infinite" }}></span>
            <span>ESTABLISHING LINK...</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div className="tick-counter">
          SYSTEM_TICK: <span style={{ color: "#fff", fontWeight: "bold" }}>{tick}</span>
        </div>

        <button className="chaos-btn" onClick={onTriggerChaos}>
          <Flame size={16} />
          LAUNCH CHAOS INJECTION
        </button>
      </div>
    </header>
  );
};
