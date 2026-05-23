"use client";

import React from "react";
import { CorpId, LeaderboardEntry, LastTelemetry } from "../lib/ws";

interface CorpOverviewPopoverProps {
  corp: CorpId;
  stats: LeaderboardEntry | undefined;
  lastTelemetry: LastTelemetry | null | undefined;
  /** Anchor — pixel coordinates of the hovered node's center inside the dashboard */
  anchor: { x: number; y: number };
}

/**
 * Hover popover shown next to a corp node on the orchestration graph.
 * Renders the corp's four metrics + the most recent action it took (if
 * the latest telemetry frame involves this corp).
 *
 * The popover is positioned via the `anchor` prop — the parent computes
 * node center coordinates and decides which side to render on so the
 * popover never clips off-screen.
 */
export const CorpOverviewPopover: React.FC<CorpOverviewPopoverProps> = ({
  corp,
  stats,
  lastTelemetry,
  anchor,
}) => {
  // Decide popover side: if anchor.x is past the midline, render to the
  // left of the node; otherwise to the right. Always away from clipping.
  const rightSide = typeof window === "undefined" || anchor.x < window.innerWidth / 2;

  const recent =
    lastTelemetry &&
    (lastTelemetry.sender === corp || lastTelemetry.target === corp)
      ? lastTelemetry
      : null;

  return (
    <div
      className={`corp-popover ${rightSide ? "side-right" : "side-left"}`}
      style={{ top: anchor.y, left: anchor.x }}
      // Don't intercept pointer events so a fast cursor flick doesn't sticky-hover the popover.
      // The graph's onMouseLeave on the node controls visibility.
    >
      <div className="corp-popover-header">{corp}</div>

      {stats ? (
        <div className="corp-popover-grid">
          <div><span className="stat-label">STOCK</span><span className="stat-value">{stats.stock_value}</span></div>
          <div><span className="stat-label">CASH</span><span className="stat-value">{stats.cash_reserves}</span></div>
          <div><span className="stat-label">SENT.</span><span className="stat-value">{stats.public_sentiment}%</span></div>
          <div><span className="stat-label">SHARE</span><span className="stat-value">{stats.market_share}</span></div>
        </div>
      ) : (
        <div className="corp-popover-empty">No stats yet.</div>
      )}

      {recent && (
        <div className="corp-popover-recent">
          <div className="corp-popover-recent-label">LAST ACTION</div>
          <div className="corp-popover-recent-line">
            <span className="action-chip">{recent.action}</span>
            {recent.sender !== corp && <span> from {recent.sender}</span>}
            {recent.target !== corp && <span> → {recent.target}</span>}
          </div>
          <div className="corp-popover-recent-reason">{recent.reason}</div>
        </div>
      )}
    </div>
  );
};
