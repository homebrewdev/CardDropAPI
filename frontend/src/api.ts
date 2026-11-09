// Относительный URL — запросы идут через Vite-прокси (vite.config.ts),
// поэтому CORS в разработке не нужен
const API_URL = "/api";

export async function createSession(name: string, maxPlayers: number = 4) {
  const res = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, max_players: maxPlayers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create session");
  }
  return res.json();
}

export async function listSessions() {
  const res = await fetch(`${API_URL}/sessions`);
  if (!res.ok) throw new Error("Failed to list sessions");
  return res.json();
}

export async function getSession(sessionId: number) {
  const res = await fetch(`${API_URL}/sessions/${sessionId}`);
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}
