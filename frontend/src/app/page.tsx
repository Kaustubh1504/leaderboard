"use client";

import { useState } from "react";
import { CorpId, useTelemetry } from "../lib/ws";
import { useRadioQueue } from "../lib/useRadioQueue";
import { Header } from "../components/Header";
import { Leaderboard } from "../components/Leaderboard";
import { ChaosFeed } from "../components/ChaosFeed";
import { OrchestrationGraph } from "../components/OrchestrationGraph";
import { TelemetryStream } from "../components/TelemetryStream";
import { CollapsiblePane } from "../components/CollapsiblePane";
import { CustomChaosModal } from "../components/CustomChaosModal";
import { CorpActivityPane } from "../components/CorpActivityPane";

export default function Home() {
  const {
    state,
    history,
    connectionStatus,
    logs,
    events,
    triggerChaos,
    triggerCustomChaos,
    queryAgent,
  } = useTelemetry();

  const { isSpeaking, isMuted, toggleMute } = useRadioQueue(
    state.last_telemetry,
    state.tick,
  );

  // UI state lives here so layout reflows when panes collapse / graph maximizes.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [graphMaximized, setGraphMaximized] = useState(false);
  const [customChaosOpen, setCustomChaosOpen] = useState(false);
  const [selectedCorp, setSelectedCorp] = useState<CorpId | null>(null);

  // When the graph is maximized, force both side panes collapsed so it fills the row.
  const effectiveLeftCollapsed = graphMaximized || leftCollapsed;
  const effectiveRightCollapsed = graphMaximized || rightCollapsed;

  // Compute the grid template class based on which sides are collapsed.
  const gridClass = [
    "dashboard-grid",
    effectiveLeftCollapsed && "left-collapsed",
    effectiveRightCollapsed && "right-collapsed",
    graphMaximized && "graph-maximized",
  ].filter(Boolean).join(" ");

  return (
    <div className="dashboard-container">
      <div className="scanlines"></div>

      <Header
        tick={state.tick}
        connectionStatus={connectionStatus}
        onTriggerRandomChaos={triggerChaos}
        onOpenCustomChaos={() => setCustomChaosOpen(true)}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        isSpeaking={isSpeaking}
      />

      <main className={gridClass}>
        {/* Column 1: Leaderboard + ChaosFeed (collapsible) */}
        <CollapsiblePane
          side="left"
          collapsed={effectiveLeftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
          collapsedLabel="LEADERBOARD"
        >
          <div className="dashboard-column">
            <Leaderboard
              leaderboard={state.leaderboard}
              activeAgent={state.active_agent}
              history={history}
              onQueryAgent={queryAgent}
            />
            <ChaosFeed logs={logs} />
          </div>
        </CollapsiblePane>

        {/* Column 2: Orchestration graph (always visible, can be maximized) */}
        <div className="dashboard-column">
          <OrchestrationGraph
            state={state}
            maximized={graphMaximized}
            onToggleMaximize={() => setGraphMaximized((v) => !v)}
            onSelectCorp={(corp) => {
              setSelectedCorp(corp);
              // Opening the activity pane requires the right column to be expanded;
              // if the operator had collapsed it, popping it back is the right UX.
              setRightCollapsed(false);
            }}
            history={history}
            events={events}
          />
        </div>

        {/* Column 3: TelemetryStream OR CorpActivityPane (collapsible) */}
        <CollapsiblePane
          side="right"
          collapsed={effectiveRightCollapsed}
          onToggle={() => setRightCollapsed((v) => !v)}
          collapsedLabel="TELEMETRY"
        >
          <div className="dashboard-column">
            {selectedCorp ? (
              <CorpActivityPane
                corp={selectedCorp}
                stats={state.leaderboard[selectedCorp]}
                logs={logs}
                onClose={() => setSelectedCorp(null)}
              />
            ) : (
              <TelemetryStream events={events} />
            )}
          </div>
        </CollapsiblePane>
      </main>

      <CustomChaosModal
        open={customChaosOpen}
        onClose={() => setCustomChaosOpen(false)}
        onSubmit={triggerCustomChaos}
      />
    </div>
  );
}
