import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { StatePayload } from "../lib/types";

export default function Leaderboard({ state }: { state: StatePayload | null }) {
  const rows = Object.entries(state?.leaderboard ?? {}).map(([name, stats]) => ({
    name: name.replace("_", " "),
    ...stats,
  }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <h2 className="col-title">Leaderboard</h2>
      <div style={{ flex: 1, minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <XAxis dataKey="name" stroke="#8a93a6" />
            <YAxis domain={[0, 100]} stroke="#8a93a6" />
            <Tooltip contentStyle={{ background: "#0c0f14", border: "1px solid #2a3344" }} />
            <Legend />
            <Bar dataKey="velocity" fill="#39ff8a" />
            <Bar dataKey="efficiency" fill="#39d0d8" />
            <Bar dataKey="stability" fill="#c389ff" />
            <Bar dataKey="stress" fill="#ff3b5c" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
