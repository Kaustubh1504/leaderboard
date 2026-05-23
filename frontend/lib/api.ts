const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function triggerChaos(): Promise<unknown> {
  const res = await fetch(`${BASE}/api/chaos/trigger`, { method: "POST" });
  if (!res.ok) throw new Error(`chaos trigger failed: ${res.status}`);
  return res.json();
}

export async function forceAgent(agentId: string): Promise<unknown> {
  const res = await fetch(`${BASE}/api/agent/${agentId}/query`, { method: "POST" });
  if (!res.ok) throw new Error(`agent query failed: ${res.status}`);
  return res.json();
}
