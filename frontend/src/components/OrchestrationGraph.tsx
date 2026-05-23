"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Handle,
  Position,
  Edge,
  Node,
  Background,
  BackgroundVariant,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import { GitBranch, Maximize2, Minimize2 } from "lucide-react";
import { CorpId, LeaderboardEntry, TelemetryEvent, TelemetryState } from "../lib/ws";
import { CorpOverviewPopover } from "./CorpOverviewPopover";

// Larger custom-node renderer with hover + click hooks.
const CustomNodeComponent = ({ data, id }: any) => {
  const isChaos = id === "Chaos_Operator";

  return (
    <div
      className={`custom-node ${isChaos ? "chaos-agent-node" : ""} ${
        data.isActive ? (isChaos ? "active-chaos" : "active-hacker") : ""
      }`}
      onMouseEnter={(e) => data.onHover?.(id, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => data.onHoverEnd?.(id)}
      onClick={() => !isChaos && data.onClick?.(id)}
      role={isChaos ? undefined : "button"}
      tabIndex={isChaos ? undefined : 0}
    >
      {!isChaos && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
        />
      )}
      <div className="node-name">{data.label}</div>
      <div className="node-role">{data.role}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
      />
    </div>
  );
};

const nodeTypes = { custom: CustomNodeComponent };

interface OrchestrationGraphProps {
  state: TelemetryState;
  maximized: boolean;
  onToggleMaximize: () => void;
  /** Called when the user clicks a corp node — opens the activity pane. */
  onSelectCorp: (corp: CorpId) => void;
  /** Per-corp time series — feeds the popover's ticker delta. */
  history: Record<string, LeaderboardEntry[]>;
  /** Rolling per-tick events — feeds the popover's recent-actions list. */
  events: TelemetryEvent[];
}

// 4 nodes: Chaos in the centre, 3 corps around it. Slightly larger
// positions than before to give the bigger nodes breathing room.
const STATIC_NODES: Node[] = [
  { id: "Chaos_Operator", type: "custom", position: { x: 250, y: 180 }, data: { label: "Chaos_Operator", role: "Macro Shock Generator", isActive: false } },
  { id: "Google",     type: "custom", position: { x: 30,  y: 30  }, data: { label: "Google",     role: "Market Leader",          isActive: false } },
  { id: "OpenAI",      type: "custom", position: { x: 470, y: 30  }, data: { label: "OpenAI",      role: "Aggressive Challenger",  isActive: false } },
  { id: "Anthropic",   type: "custom", position: { x: 250, y: 360 }, data: { label: "Anthropic",   role: "Guerilla Disruptor",     isActive: false } },
];

const STATIC_EDGES: Edge[] = [
  { id: "e-chaos-google",   source: "Chaos_Operator", target: "Google",   animated: false },
  { id: "e-chaos-openai",  source: "Chaos_Operator", target: "OpenAI",    animated: false },
  { id: "e-chaos-anthropic",  source: "Chaos_Operator", target: "Anthropic", animated: false },
  { id: "e-google-openai",  source: "Google",      target: "OpenAI",    animated: false },
  { id: "e-openai-anthropic", source: "OpenAI",       target: "Anthropic", animated: false },
  { id: "e-anthropic-google",  source: "Anthropic",    target: "Google",   animated: false },
];

const CORPS: CorpId[] = ["Google", "OpenAI", "Anthropic"];

export const OrchestrationGraph: React.FC<OrchestrationGraphProps> = ({
  state,
  maximized,
  onToggleMaximize,
  onSelectCorp,
  history,
  events,
}) => {
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<{ id: CorpId; anchor: { x: number; y: number } } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Hover callbacks live on data so they aren't recreated by the
  // CustomNodeComponent (which is re-instantiated by ReactFlow per render).
  const handleHover = (id: string, rect: DOMRect) => {
    if (!CORPS.includes(id as CorpId)) return;
    // Anchor relative to viewport — popover uses fixed positioning.
    setHovered({ id: id as CorpId, anchor: { x: rect.right + 12, y: rect.top + rect.height / 2 } });
  };
  const handleHoverEnd = (id: string) => {
    setHovered((prev) => (prev && prev.id === id ? null : prev));
  };
  const handleClick = (id: string) => {
    if (CORPS.includes(id as CorpId)) onSelectCorp(id as CorpId);
  };

  const nodes = useMemo(() => {
    return STATIC_NODES.map((node) => {
      let isActive = false;
      if (node.id === "Chaos_Operator") {
        isActive =
          state.active_agent === "Chaos_Operator" ||
          state.last_telemetry?.sender === "Chaos_Operator" ||
          state.last_telemetry?.action === "CHAOS";
      } else {
        isActive = state.active_agent === node.id;
      }
      return {
        ...node,
        data: {
          ...node.data,
          isActive,
          onHover: handleHover,
          onHoverEnd: handleHoverEnd,
          onClick: handleClick,
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active_agent, state.last_telemetry, onSelectCorp]);

  const edges = useMemo(() => {
    return STATIC_EDGES.map((edge) => {
      let isAnimated = false;
      let className = "";
      const payloadAnimate = state.graph_edges?.some(
        (ge) => ge.source === edge.source && ge.target === edge.target && ge.animated
      );
      const stateMatch =
        state.last_telemetry?.sender === edge.source &&
        state.last_telemetry?.target === edge.target;
      const chaosLinkMatch =
        edge.source === "Chaos_Operator" && edge.target === state.active_agent;
      if (payloadAnimate || stateMatch || chaosLinkMatch) isAnimated = true;
      if (edge.source === "Chaos_Operator" && isAnimated) className = "chaos-active";
      return { ...edge, animated: isAnimated, className };
    });
  }, [state.graph_edges, state.last_telemetry, state.active_agent]);

  const hoveredStats: LeaderboardEntry | undefined = hovered
    ? state.leaderboard[hovered.id]
    : undefined;

  if (!mounted) {
    return (
      <div className="panel-card" style={{ flex: 1 }}>
        <div className="panel-header">
          <div className="panel-title">
            <GitBranch size={14} style={{ color: "var(--accent-cyan)" }} />
            ORCHESTRATION EDGE GRAPH
          </div>
        </div>
        <div className="panel-content" style={{ background: "rgba(5, 7, 12, 0.4)" }} />
      </div>
    );
  }

  const MaxIcon = maximized ? Minimize2 : Maximize2;

  return (
    <div className="panel-card" style={{ flex: 1 }} ref={wrapperRef}>
      <div className="panel-header">
        <div className="panel-title">
          <GitBranch size={14} style={{ color: "var(--accent-cyan)" }} />
          ORCHESTRATION EDGE GRAPH
        </div>
        <button
          className="graph-maximize-btn"
          onClick={onToggleMaximize}
          title={maximized ? "Restore default layout" : "Maximize graph"}
          aria-label={maximized ? "Restore default layout" : "Maximize graph"}
        >
          <MaxIcon size={14} />
        </button>
      </div>
      <div className="panel-content" style={{ minHeight: "350px" }}>
        <div className="flow-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={true}
            panOnDrag={true}
            minZoom={0.6}
            maxZoom={2.5}
          >
            <Controls showInteractive={false} position="bottom-right" />
            <Background
              variant={BackgroundVariant.Lines}
              color="var(--border-color)"
              gap={25}
              size={1}
              style={{ opacity: 0.2 }}
            />
          </ReactFlow>
        </div>
        {hovered && (
          <CorpOverviewPopover
            corp={hovered.id}
            stats={hoveredStats}
            lastTelemetry={state.last_telemetry}
            anchor={hovered.anchor}
            history={history[hovered.id]}
            events={events}
          />
        )}
      </div>
    </div>
  );
};
