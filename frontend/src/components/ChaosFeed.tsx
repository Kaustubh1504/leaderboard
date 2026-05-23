"use client";

import React, { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { LogEntry } from "../lib/ws";

interface ChaosFeedProps {
  logs: LogEntry[];
}

export const ChaosFeed: React.FC<ChaosFeedProps> = ({ logs }) => {
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  return (
    <div className="panel-card chaos-feed-container" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Terminal size={14} style={{ color: "var(--accent-red)" }} />
          CHAOS log & active events
        </div>
      </div>
      <div className="panel-content">
        <div className="terminal-box">
          {logs.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Initializing control systems... Waiting for telemetry packages...
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-entry">
                <span className="log-time">[{log.timestamp}]</span>
                <span className={`log-tag ${log.level}`}>{log.level}</span>
                <span className="log-msg" style={{
                  color: log.level === "chaos" ? "var(--accent-red)" : 
                         log.level === "system" ? "var(--accent-cyan)" : 
                         "var(--text-primary)"
                }}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
