"use client";

import React, { useState } from "react";
import { Flame, Activity, Info, Shuffle } from "lucide-react";
import { RANDOM_CHAOS_EXAMPLES } from "../lib/ws";

interface HeaderProps {
  tick: number;
  connectionStatus: "connecting" | "live" | "mocked";
  onTriggerRandomChaos: () => void;
  onOpenCustomChaos: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  tick,
  connectionStatus,
  onTriggerRandomChaos,
  onOpenCustomChaos,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-title-section">
        <Activity size={28} className="text-cyan-400" style={{ color: "var(--accent-cyan)" }} />
        <h1 className="header-title">Mad Max</h1>

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

        {/* Random Chaos + hover-info tooltip listing example events */}
        <div
          className="chaos-btn-group"
          onMouseEnter={() => setInfoOpen(true)}
          onMouseLeave={() => setInfoOpen(false)}
        >
          <button
            className="chaos-btn chaos-btn-random"
            onClick={onTriggerRandomChaos}
            title="Fire a Gemini-generated random chaos event"
          >
            <Shuffle size={16} />
            RANDOM CHAOS
          </button>
          <button
            className="chaos-info-btn"
            type="button"
            aria-label="What kinds of chaos can fire?"
            onClick={(e) => { e.stopPropagation(); setInfoOpen((o) => !o); }}
          >
            <Info size={14} />
          </button>
          {infoOpen && (
            <div className="chaos-info-popover">
              <div className="chaos-info-title">Random chaos draws from events like:</div>
              <ul>
                {RANDOM_CHAOS_EXAMPLES.map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
              <div className="chaos-info-foot">
                Click <strong>RANDOM CHAOS</strong> to fire one, or <strong>CUSTOM CHAOS</strong>
                {" "}to write your own framing.
              </div>
            </div>
          )}
        </div>

        <button
          className="chaos-btn chaos-btn-custom"
          onClick={onOpenCustomChaos}
          title="Inject your own chaos prompt"
        >
          <Flame size={16} />
          CUSTOM CHAOS
        </button>
      </div>
    </header>
  );
};
