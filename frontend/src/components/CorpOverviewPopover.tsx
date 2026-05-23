"use client";

import React from "react";
import { ArrowUp, ArrowDown, Minus, Activity } from "lucide-react";
import { CorpId, LeaderboardEntry, LastTelemetry, TelemetryEvent } from "../lib/ws";

interface CorpOverviewPopoverProps {
  corp: CorpId;
  stats: LeaderboardEntry | undefined;
  lastTelemetry: LastTelemetry | null | undefined;
  /** Anchor — pixel coordinates of the hovered node's center inside the dashboard */
  anchor: { x: number; y: number };
  /** Time-series of leaderboard snapshots for this corp; last entry is current. */
  history: LeaderboardEntry[] | undefined;
  /** Rolling event log — used to render the last 3 actions involving this corp. */
  events: TelemetryEvent[];
}

const DELTA_WINDOW = 5; // ticks back for the headline ticker delta

const Trend: React.FC<{ delta: number; label: string }> = ({ delta, label }) => {
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const cls = delta > 0 ? "trend up" : delta < 0 ? "trend down" : "trend flat";
  return (
    <span className={cls}>
      <Icon size={11} />
      <span className="trend-value">{delta > 0 ? "+" : ""}{delta}</span>
      <span className="trend-label">{label}</span>
    </span>
  );
};

/**
 * Hover popover shown next to a corp node on the orchestration graph.
 * Three sections:
 *   1. Current four metrics
 *   2. Ticker delta vs DELTA_WINDOW ticks ago (the price impact)
 *   3. Last 3 actions involving this corp (sender OR target), pulled
 *      from the rolling events deque
 */
export const CorpOverviewPopover: React.FC<CorpOverviewPopoverProps> = ({
  corp,
  stats,
  lastTelemetry,
  anchor,
  history,
  events,
}) => {
  const rightSide = typeof window === "undefined" || anchor.x < window.innerWidth / 2;

  // Last-N-tick deltas — pull from history.
  let deltaStock = 0;
  let deltaCash = 0;
  let deltaSent = 0;
  let deltaShare = 0;
  if (stats && history && history.length >= 2) {
    const refIdx = Math.max(0, history.length - 1 - DELTA_WINDOW);
    const ref = history[refIdx];
    deltaStock = stats.stock_value - ref.stock_value;
    deltaCash = stats.cash_reserves - ref.cash_reserves;
    deltaSent = stats.public_sentiment - ref.public_sentiment;
    deltaShare = stats.market_share - ref.market_share;
  }

  const recent = events
    .filter((ev) => ev.telemetry.sender === corp || ev.telemetry.target === corp)
    .slice(-3)
    .reverse();

  const recentSingle =
    lastTelemetry &&
    (lastTelemetry.sender === corp || lastTelemetry.target === corp)
      ? lastTelemetry
      : null;

  return (
    <div
      className={`corp-popover ${rightSide ? "side-right" : "side-left"}`}
      style={{ top: anchor.y, left: anchor.x }}
    >
      <div className="corp-popover-header">{corp}</div>

      {stats ? (
        <>
          <div className="corp-popover-grid">
            <div><span className="stat-label">STOCK</span><span className="stat-value">{stats.stock_value}</span></div>
            <div><span className="stat-label">CASH</span><span className="stat-value">{stats.cash_reserves}</span></div>
            <div><span className="stat-label">SENT.</span><span className="stat-value">{stats.public_sentiment}%</span></div>
            <div><span className="stat-label">SHARE</span><span className="stat-value">{stats.market_share}</span></div>
          </div>

          <div className="corp-popover-trends">
            <div className="corp-popover-trends-label">TICKER · LAST {DELTA_WINDOW} TICKS</div>
            <div className="corp-popover-trends-row">
              <Trend delta={deltaStock} label="stk" />
              <Trend delta={deltaCash} label="cash" />
              <Trend delta={deltaSent} label="sent" />
              <Trend delta={deltaShare} label="shr" />
            </div>
          </div>
        </>
      ) : (
        <div className="corp-popover-empty">No stats yet.</div>
      )}

      {recentSingle && recent.length === 0 && (
        <div className="corp-popover-recent">
          <div className="corp-popover-recent-label">
            <Activity size={9} /> LAST ACTION
          </div>
          <div className="corp-popover-recent-line">
            <span className="action-chip">{recentSingle.action}</span>
            {recentSingle.sender !== corp && <span> from {recentSingle.sender}</span>}
            {recentSingle.target !== corp && <span> → {recentSingle.target}</span>}
          </div>
          <div className="corp-popover-recent-reason">{recentSingle.reason}</div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="corp-popover-recent">
          <div className="corp-popover-recent-label">
            <Activity size={9} /> RECENT ACTIVITY · LAST {recent.length}
          </div>
          {recent.map((ev) => {
            const t = ev.telemetry;
            const direction = t.sender === corp ? "→ " + t.target : "← " + t.sender;
            return (
              <div key={ev.id} className="corp-popover-recent-row">
                <span className="corp-popover-recent-tick">t{ev.tick}</span>
                <span className="action-chip">{ev.isChaos ? "CHAOS" : t.action}</span>
                <span className="corp-popover-recent-dir">{direction}</span>
                {!ev.isChaos && (
                  <span className="corp-popover-recent-reason-mini">{t.reason}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
