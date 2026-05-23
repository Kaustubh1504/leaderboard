// Auto-scrolls to bottom on every new message.

import { useEffect, useRef, useState } from "react";
import type { StatePayload, Telemetry } from "../lib/types";

const MAX_ENTRIES = 100;

export default function TelemetryStream({ state }: { state: StatePayload | null }) {
  const [log, setLog] = useState<{ tick: number; t: Telemetry }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state?.last_telemetry) return;
    setLog((prev) => {
      const next = [...prev, { tick: state.tick, t: state.last_telemetry! }];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, [state?.tick, state?.last_telemetry]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <h2 className="col-title">Telemetry</h2>
      <div className="stream">
        {log.map((row, i) => (
          <pre key={i} className={`stream-row ${row.t.intent === "CHAOS" ? "chaos" : ""}`}>
            [{String(row.tick).padStart(3, "0")}] {row.t.sender} → {row.t.target} · {row.t.intent} ({row.t.patch_size_kb}kb)
          </pre>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
