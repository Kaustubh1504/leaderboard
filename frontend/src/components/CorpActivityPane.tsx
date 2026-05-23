"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { X, Activity } from "lucide-react";
import { CorpId, LeaderboardEntry, LogEntry } from "../lib/ws";

interface CorpActivityPaneProps {
  corp: CorpId;
  stats: LeaderboardEntry | undefined;
  logs: LogEntry[];
  onClose: () => void;
}

/**
 * Right-column replacement that opens when the operator clicks a corp
 * node on the graph. Filters the chaos/action log to only entries that
 * mention this corp (sender or target). Close button restores
 * TelemetryStream.
 */
export const CorpActivityPane: React.FC<CorpActivityPaneProps> = ({
  corp,
  stats,
  logs,
  onClose,
}) => {
  // Scroll the container directly — scrollIntoView would walk up the DOM
  // and steal scroll from the page layout.
  const terminalRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => logs.filter((l) => l.involvedCorps?.includes(corp)),
    [logs, corp],
  );

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  return (
    <div className="panel-card corp-activity-pane" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Activity size={14} style={{ color: "var(--accent-cyan)" }} />
          ACTIVITY: <span style={{ color: "var(--text-primary)", marginLeft: 4 }}>{corp}</span>
        </div>
        <button className="modal-close" onClick={onClose} title="Close activity view" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {stats && (
        <div className="corp-activity-stats">
          <div><span className="stat-label">STOCK</span><span className="stat-value">{stats.stock_value}</span></div>
          <div><span className="stat-label">CASH</span><span className="stat-value">{stats.cash_reserves}</span></div>
          <div><span className="stat-label">SENT.</span><span className="stat-value">{stats.public_sentiment}%</span></div>
          <div><span className="stat-label">SHARE</span><span className="stat-value">{stats.market_share}</span></div>
        </div>
      )}

      <div className="panel-content">
        <div className="terminal-box readable" ref={terminalRef}>
          {filtered.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              No activity yet for {corp}. Waiting for the next decision or chaos event…
            </div>
          ) : (
            filtered.map((log) => (
              <div key={log.id} className={`log-entry readable level-${log.level}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className={`log-tag chip ${log.level}`}>{log.level.toUpperCase()}</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
