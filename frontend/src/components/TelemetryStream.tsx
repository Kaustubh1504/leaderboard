"use client";

import React, { useEffect, useRef } from "react";
import { Cpu, ArrowUp, ArrowDown, Zap, AlertOctagon } from "lucide-react";
import { LeaderboardEntry, TelemetryEvent } from "../lib/ws";

interface TelemetryStreamProps {
  events: TelemetryEvent[];
}

const METRIC_LABEL: Record<keyof LeaderboardEntry, string> = {
  stock_value: "Stock",
  cash_reserves: "Cash",
  public_sentiment: "Sent.",
  market_share: "Share",
};

/** A metric delta is "positive" for the corp when the metric is in the
 * direction that corp wants. Stock/cash/sentiment/market_share are all
 * "up = good" so the sign maps directly. */
function deltaIsGood(delta: number): boolean {
  return delta > 0;
}

const ImpactBadge: React.FC<{
  metric: keyof LeaderboardEntry;
  delta: number;
}> = ({ metric, delta }) => {
  const good = deltaIsGood(delta);
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`impact-badge ${good ? "good" : "bad"}`}>
      <Icon size={10} />
      <span className="impact-label">{METRIC_LABEL[metric]}</span>
      <span className="impact-value">{delta > 0 ? "+" : ""}{delta}</span>
    </span>
  );
};

export const TelemetryStream: React.FC<TelemetryStreamProps> = ({ events }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Latest event at top — render newest first.
  const reversed = [...events].reverse();

  useEffect(() => {
    // Auto-scroll to top (newest event) on each new arrival.
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [events.length]);

  return (
    <div className="panel-card telemetry-container" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Cpu size={14} style={{ color: "var(--accent-cyan)" }} />
          AGENT ACTIVITY · LIVE IMPACT
        </div>
      </div>
      <div className="panel-content">
        <div className="telemetry-cards" ref={containerRef}>
          {reversed.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic", padding: 12 }}>
              Listening for active WebSocket packets…
            </div>
          ) : (
            reversed.map((ev) => {
              const t = ev.telemetry;
              const senderClass = `corp-tag corp-${t.sender.toLowerCase()}`;
              const targetClass = `corp-tag corp-${t.target.toLowerCase()}`;
              return (
                <div
                  key={ev.id}
                  className={`telemetry-card ${ev.isChaos ? "is-chaos" : ""}`}
                >
                  <div className="telemetry-card-head">
                    <span className="tick-label">tick {ev.tick}</span>
                    <span className="ts-label">{ev.timestamp}</span>
                    {ev.isChaos && (
                      <span className="chaos-pill">
                        <AlertOctagon size={10} />
                        CHAOS
                      </span>
                    )}
                  </div>

                  <div className="telemetry-card-body">
                    <span className={senderClass}>{t.sender}</span>
                    <span className="action-arrow">→</span>
                    <span className={targetClass}>{t.target}</span>
                  </div>

                  <div className="telemetry-card-action">
                    <Zap size={11} style={{ color: "var(--accent-green)" }} />
                    <span className="action-verb">{t.action.replace(/_/g, " ")}</span>
                    {!ev.isChaos && typeof t.confidence_score === "number" && (
                      <span className="conf-pill">
                        conf {Math.round(t.confidence_score * 100)}%
                      </span>
                    )}
                  </div>

                  {t.reason && (
                    <div className="telemetry-card-reason">
                      <span className="reason-label">REASON</span>
                      <span className="reason-text">{t.reason}</span>
                    </div>
                  )}

                  {Object.keys(ev.deltas).length > 0 && (
                    <div className="telemetry-card-impact">
                      <div className="impact-header">IMPACT</div>
                      {Object.entries(ev.deltas).map(([corp, d]) => (
                        <div key={corp} className="impact-row">
                          <span className={`corp-tag corp-${corp.toLowerCase()} compact`}>{corp}</span>
                          <div className="impact-badges">
                            {(Object.entries(d) as [keyof LeaderboardEntry, number][]).map(([m, v]) =>
                              v !== undefined ? <ImpactBadge key={m} metric={m} delta={v as number} /> : null
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
