"use client";

import React from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ArrowDown, Minus, Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
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

interface MetricChartProps {
  label: string;
  value: number | string;
  delta: number;
  data: LeaderboardEntry[];
  dataKey: keyof LeaderboardEntry;
  color: string;
}

const MetricChart: React.FC<MetricChartProps> = ({ label, value, delta, data, dataKey, color }) => {
  const deltaCls = delta > 0 ? "metric-delta up" : delta < 0 ? "metric-delta down" : "metric-delta flat";
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <div className="corp-popover-metric">
      <div className="corp-popover-metric-top">
        <span className="corp-popover-metric-label">{label}</span>
        <span className={deltaCls}>
          <DeltaIcon size={12} />
          {delta > 0 ? "+" : ""}{delta}
        </span>
      </div>
      <div className="corp-popover-metric-value">{value}</div>
      <div className="corp-popover-metric-chart">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                type="monotone"
                dataKey={dataKey as string}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="corp-popover-metric-chart-empty">— no history —</div>
        )}
      </div>
    </div>
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
  // anchor is no longer used for positioning (popover is docked to the
  // viewport edge), but kept on the props so the graph hover wiring works.
  history,
  events,
}) => {
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

  if (typeof document === "undefined") return null;

  const node = (
    <div className="corp-popover">
      {/* Docked to the right side of the viewport (CSS top/right/height) —
         anchor.x/y are unused now, but kept on the API so the hover wiring
         in OrchestrationGraph doesn't need to change. */}
      <div className="corp-popover-header">
        <span>{corp}</span>
        <span className="corp-popover-model">gemini-3.1-flash</span>
      </div>

      {stats ? (
        <>
          <div className="corp-popover-trends-label">METRICS · LAST {DELTA_WINDOW}-TICK DELTA</div>
          <div className="corp-popover-charts">
            <MetricChart
              label="STOCK"
              value={stats.stock_value}
              delta={deltaStock}
              data={history ?? []}
              dataKey="stock_value"
              color="#00f0ff"
            />
            <MetricChart
              label="CASH"
              value={stats.cash_reserves}
              delta={deltaCash}
              data={history ?? []}
              dataKey="cash_reserves"
              color="#39ff0e"
            />
            <MetricChart
              label="SENT."
              value={`${stats.public_sentiment}%`}
              delta={deltaSent}
              data={history ?? []}
              dataKey="public_sentiment"
              color="#b86bff"
            />
            <MetricChart
              label="SHARE"
              value={stats.market_share}
              delta={deltaShare}
              data={history ?? []}
              dataKey="market_share"
              color="#ffb800"
            />
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

  return createPortal(node, document.body);
};
