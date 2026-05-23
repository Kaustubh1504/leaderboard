// Single screen, unscrollable. Three columns + header. See CLAUDE.md.

import { useEffect, useState } from "react";
import { subscribe } from "../lib/ws";
import { triggerChaos } from "../lib/api";
import type { StatePayload } from "../lib/types";
import AgentGraph from "../components/AgentGraph";
import Leaderboard from "../components/Leaderboard";
import TelemetryStream from "../components/TelemetryStream";

export default function Home() {
  const [state, setState] = useState<StatePayload | null>(null);

  useEffect(() => subscribe(setState), []);

  return (
    <div className="root">
      <header className="header">
        <h1>AI War Room</h1>
        <div className="header-meta">
          <span>tick {state?.tick ?? 0}</span>
          <span>active: {state?.active_agent ?? "—"}</span>
          <button className="chaos-btn" onClick={() => triggerChaos()}>
            Launch Chaos Injection
          </button>
        </div>
      </header>

      <main className="columns">
        <section className="col"><AgentGraph state={state} /></section>
        <section className="col"><Leaderboard state={state} /></section>
        <section className="col"><TelemetryStream state={state} /></section>
      </main>
    </div>
  );
}
