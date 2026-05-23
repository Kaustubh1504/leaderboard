// Static-layout React Flow graph — 5 nodes in fixed positions.
// Only edge animation and node border color change on state updates.

import { useMemo } from "react";
import ReactFlow, { Background, Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import type { StatePayload, AgentId } from "../lib/types";

const POSITIONS: Record<AgentId, { x: number; y: number }> = {
  Chaos_Agent: { x: 250, y: 20 },
  Hacker_1: { x: 60, y: 180 },
  Hacker_2: { x: 200, y: 320 },
  Hacker_3: { x: 340, y: 180 },
  Hacker_4: { x: 470, y: 320 },
};

export default function AgentGraph({ state }: { state: StatePayload | null }) {
  const nodes = useMemo<Node[]>(() => {
    const active = state?.active_agent;
    const chaosActive = active === "Chaos_Agent" || state?.last_telemetry?.intent === "CHAOS";
    return (Object.keys(POSITIONS) as AgentId[]).map((id) => ({
      id,
      position: POSITIONS[id],
      data: { label: id.replace("_", " ") },
      style: {
        background: "#0c0f14",
        color: "#e6edf3",
        border: `2px solid ${borderColor(id, active, chaosActive)}`,
        borderRadius: 8,
        padding: 8,
        width: 120,
      },
    }));
  }, [state]);

  const edges = useMemo<Edge[]>(
    () =>
      (state?.graph_edges ?? []).map((e, i) => ({
        id: `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        animated: e.animated,
        style: { stroke: "#39d0d8" },
      })),
    [state]
  );

  return (
    <div style={{ height: "100%", minHeight: 360 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView panOnDrag={false} zoomOnScroll={false}>
        <Background color="#1a1f2b" gap={16} />
      </ReactFlow>
    </div>
  );
}

function borderColor(id: AgentId, active: AgentId | undefined, chaos: boolean): string {
  if (id === "Chaos_Agent" && chaos) return "#ff3b5c";
  if (id === active) return "#39ff8a";
  return "#2a3344";
}
