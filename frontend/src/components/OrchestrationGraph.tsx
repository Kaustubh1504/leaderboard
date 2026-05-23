"use client";

import React, { useState, useEffect, useMemo } from "react";
import ReactFlow, {
  Handle,
  Position,
  Edge,
  Node,
  Background,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { GitBranch } from "lucide-react";
import { TelemetryState } from "../lib/ws";

// Custom node rendering component to bypass default styles
const CustomNodeComponent = ({ data, id }: any) => {
  const isChaos = id === "Chaos_Operator";

  return (
    <div
      className={`custom-node ${isChaos ? "chaos-agent-node" : ""} ${
        data.isActive ? (isChaos ? "active-chaos" : "active-hacker") : ""
      }`}
    >
      {/* Top handle (corps only) */}
      {!isChaos && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
        />
      )}

      <div className="node-name" style={{ fontWeight: "700" }}>{data.label}</div>
      <div className="node-role">{data.role}</div>

      {/* Bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
      />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNodeComponent,
};

interface OrchestrationGraphProps {
  state: TelemetryState;
}

// Layout: Chaos Operator at center, 3 corps arranged around it (per CLAUDE.md).
const STATIC_NODES: Node[] = [
  {
    id: "Chaos_Operator",
    type: "custom",
    position: { x: 230, y: 170 },
    data: { label: "Chaos_Operator", role: "Macro Shock Generator", isActive: false },
  },
  {
    id: "NexusCorp",
    type: "custom",
    position: { x: 30, y: 30 },
    data: { label: "NexusCorp", role: "Market Leader", isActive: false },
  },
  {
    id: "VertexAI",
    type: "custom",
    position: { x: 430, y: 30 },
    data: { label: "VertexAI", role: "Aggressive Challenger", isActive: false },
  },
  {
    id: "ShadowScale",
    type: "custom",
    position: { x: 230, y: 320 },
    data: { label: "ShadowScale", role: "Guerilla Disruptor", isActive: false },
  },
];

const STATIC_EDGES: Edge[] = [
  // Chaos -> each corp (the macro shock channels).
  { id: "e-chaos-nexus",  source: "Chaos_Operator", target: "NexusCorp",   animated: false },
  { id: "e-chaos-vertex", source: "Chaos_Operator", target: "VertexAI",    animated: false },
  { id: "e-chaos-shadow", source: "Chaos_Operator", target: "ShadowScale", animated: false },
  // Corp-to-corp competitive flow (triangle).
  { id: "e-nexus-vertex",  source: "NexusCorp",   target: "VertexAI",    animated: false },
  { id: "e-vertex-shadow", source: "VertexAI",    target: "ShadowScale", animated: false },
  { id: "e-shadow-nexus",  source: "ShadowScale", target: "NexusCorp",   animated: false },
];

export const OrchestrationGraph: React.FC<OrchestrationGraphProps> = ({ state }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute active nodes and edges dynamically based on state
  const nodes = useMemo(() => {
    return STATIC_NODES.map((node) => {
      let isActive = false;

      if (node.id === "Chaos_Operator") {
        // Chaos is active if last sender is the Operator or active_agent is Chaos.
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
        },
      };
    });
  }, [state.active_agent, state.last_telemetry]);

  const edges = useMemo(() => {
    return STATIC_EDGES.map((edge) => {
      let isAnimated = false;
      let className = "";

      // Backend payload explicitly marks the active edge as animated.
      const payloadAnimate = state.graph_edges?.some(
        (ge) => ge.source === edge.source && ge.target === edge.target && ge.animated
      );

      // Heuristic: animate if last telemetry sender/target match this edge.
      const stateMatch =
        state.last_telemetry?.sender === edge.source &&
        state.last_telemetry?.target === edge.target;

      // Animate the chaos channel landing on whoever the chaos is hitting.
      const chaosLinkMatch =
        edge.source === "Chaos_Operator" && edge.target === state.active_agent;

      if (payloadAnimate || stateMatch || chaosLinkMatch) {
        isAnimated = true;
      }

      if (edge.source === "Chaos_Operator" && isAnimated) {
        className = "chaos-active";
      }

      return {
        ...edge,
        animated: isAnimated,
        className,
      };
    });
  }, [state.graph_edges, state.last_telemetry, state.active_agent]);

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

  return (
    <div className="panel-card" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <GitBranch size={14} style={{ color: "var(--accent-cyan)" }} />
          ORCHESTRATION EDGE GRAPH
        </div>
      </div>
      <div className="panel-content" style={{ minHeight: "350px" }}>
        <div className="flow-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnDrag={false}
          >
            <Background
              variant={BackgroundVariant.Lines}
              color="var(--border-color)"
              gap={25}
              size={1}
              style={{ opacity: 0.2 }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};
