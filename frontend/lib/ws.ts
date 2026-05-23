// WebSocket client. Auto-reconnects on close — required for the demo.

import type { StatePayload } from "./types";

type Listener = (s: StatePayload) => void;

const URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/telemetry";
const RECONNECT_MS = 1500;

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();

function connect() {
  if (typeof window === "undefined") return;
  socket = new WebSocket(URL);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as StatePayload;
      listeners.forEach((l) => l(payload));
    } catch (err) {
      console.error("ws: bad payload", err);
    }
  };

  socket.onclose = () => {
    socket = null;
    setTimeout(connect, RECONNECT_MS);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function subscribe(listener: Listener): () => void {
  if (!socket) connect();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
