"use client";

import React, { useEffect, useRef } from "react";
import { Terminal, AlertOctagon, Settings, Cpu } from "lucide-react";
import { LogEntry } from "../lib/ws";

interface ChaosFeedProps {
  logs: LogEntry[];
}

const LEVEL_ICON = {
  chaos: AlertOctagon,
  system: Settings,
  action: Cpu,
} as const;

export const ChaosFeed: React.FC<ChaosFeedProps> = ({ logs }) => {
  // Scroll the container itself rather than calling scrollIntoView on a
  // sentinel — scrollIntoView walks up the DOM and scrolls the page,
  // which steals focus from the dashboard layout.
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="panel-card chaos-feed-container" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Terminal size={14} style={{ color: "var(--accent-red)" }} />
          CHAOS LOG & ACTIVE EVENTS
        </div>
      </div>
      <div className="panel-content">
        <div className="terminal-box readable" ref={terminalRef}>
          {logs.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Initializing control systems… Waiting for telemetry packets…
            </div>
          ) : (
            logs.map((log) => {
              const Icon = LEVEL_ICON[log.level];
              return (
                <div key={log.id} className={`log-entry readable level-${log.level}`}>
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-tag chip ${log.level}`}>
                    <Icon size={10} />
                    {log.level.toUpperCase()}
                  </span>
                  <span className="log-msg">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
