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
  const isChaos = id === "Chaos_Agent";
  
  return (
    <div
      className={`custom-node ${isChaos ? "chaos-agent-node" : ""} ${
        data.isActive ? (isChaos ? "active-chaos" : "active-hacker") : ""
      }`}
    >
      {/* Top handles */}
      {!isChaos && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
        />
      )}
      
      <div className="node-name" style={{ fontWeight: "700" }}>{data.label}</div>
      <div className="node-role">{data.role}</div>

      {/* Bottom handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "var(--accent-cyan)", width: 6, height: 6, border: "none" }}
      />
    </div>
  );
};

// Custom Node Types registered with React Flow
const nodeTypes = {
  custom: CustomNodeComponent,
};

interface OrchestrationGraphProps {
  state: TelemetryState;
}

const STATIC_NODES: Node[] = [
  {
    id: "Chaos_Agent",
    type: "custom",
    position: { x: 230, y: 20 },
    data: { label: "Chaos_Agent", role: "Disaster Injector", isActive: false },
  },
  {
    id: "Agent_Hacker_1",
    type: "custom",
    position: { x: 30, y: 150 },
    data: { label: "Agent_Hacker_1", role: "Frontend / Data Viz", isActive: false },
  },
  {
    id: "Agent_Hacker_2",
    type: "custom",
    position: { x: 430, y: 150 },
    data: { label: "Agent_Hacker_2", role: "Server / Gemini Loop", isActive: false },
  },
  {
    id: "Agent_Hacker_3",
    type: "custom",
    position: { x: 90, y: 290 },
    data: { label: "Agent_Hacker_3", role: "State & Socket Brokering", isActive: false },
  },
  {
    id: "Agent_Hacker_4",
    type: "custom",
    position: { x: 370, y: 290 },
    data: { label: "Agent_Hacker_4", role: "Prompts & Fallbacks", isActive: false },
  },
];

const STATIC_EDGES: Edge[] = [
  // Chaos links
  { id: "e-chaos-h1", source: "Chaos_Agent", target: "Agent_Hacker_1", animated: false },
  { id: "e-chaos-h2", source: "Chaos_Agent", target: "Agent_Hacker_2", animated: false },
  { id: "e-chaos-h3", source: "Chaos_Agent", target: "Agent_Hacker_3", animated: false },
  { id: "e-chaos-h4", source: "Chaos_Agent", target: "Agent_Hacker_4", animated: false },
  // Data pipe flows
  { id: "e-h4-h2", source: "Agent_Hacker_4", target: "Agent_Hacker_2", animated: false },
  { id: "e-h2-h3", source: "Agent_Hacker_2", target: "Agent_Hacker_3", animated: false },
  { id: "e-h3-h1", source: "Agent_Hacker_3", target: "Agent_Hacker_1", animated: false },
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

      if (node.id === "Chaos_Agent") {
        // Chaos agent is active if last sender is Chaos_Agent or active agent is Chaos_Agent
        isActive =
          state.active_agent === "Chaos_Agent" ||
          state.last_telemetry?.sender === "Chaos_Agent";
      } else {
        // Hacker agent is active if it's the active_agent
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

      // Check if this edge was explicitly marked as animated in telemetry
      const payloadAnimate = state.graph_edges?.some(
        (ge) => ge.source === edge.source && ge.target === edge.target && ge.animated
      );

      // If active sender/target match this edge
      const stateMatch =
        state.last_telemetry?.sender === edge.source &&
        state.last_telemetry?.target === edge.target;

      // Animate if active agent matches target of chaos link
      const chaosLinkMatch =
        edge.source === "Chaos_Agent" && edge.target === state.active_agent;

      if (payloadAnimate || stateMatch || chaosLinkMatch) {
        isAnimated = true;
      }

      // Add special class for chaos animation vs regular flow animation
      if (edge.source === "Chaos_Agent" && isAnimated) {
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
