"use client";

import { useTelemetry } from "../lib/ws";
import { Header } from "../components/Header";
import { Leaderboard } from "../components/Leaderboard";
import { ChaosFeed } from "../components/ChaosFeed";
import { OrchestrationGraph } from "../components/OrchestrationGraph";
import { TelemetryStream } from "../components/TelemetryStream";

export default function Home() {
  const {
    state,
    history,
    connectionStatus,
    logs,
    rawTelemetry,
    triggerChaos,
    queryAgent,
  } = useTelemetry();

  return (
    <div className="dashboard-container">
      {/* Background decoration */}
      <div className="scanlines"></div>
      
      {/* Header Panel */}
      <Header
        tick={state.tick}
        connectionStatus={connectionStatus}
        onTriggerChaos={triggerChaos}
      />
      
      {/* 3-Column Control Layout */}
      <main className="dashboard-grid">
        {/* Column 1: Leaderboard & Chaos Feed */}
        <div className="dashboard-column">
          <Leaderboard
            leaderboard={state.leaderboard}
            activeAgent={state.active_agent}
            history={history}
            onQueryAgent={queryAgent}
          />
          <ChaosFeed logs={logs} />
        </div>
        
        {/* Column 2: The Orchestration React Flow Graph */}
        <div className="dashboard-column">
          <OrchestrationGraph state={state} />
        </div>
        
        {/* Column 3: The Telemetry Code Stream */}
        <div className="dashboard-column">
          <TelemetryStream rawTelemetry={rawTelemetry} />
        </div>
      </main>
    </div>
  );
}
