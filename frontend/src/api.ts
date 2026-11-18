// Относительный URL — запросы идут через Vite-прокси (vite.config.ts),
// поэтому CORS в разработке не нужен
import { apiUrl } from "./server";

// Адрес сервера берётся из server.ts: в разработке — тот же сайт
// (Vite-прокси), в Android-приложении — заданный IP сервера
const api = (path: string) => apiUrl("/api" + path);

export async function createSession(name: string, maxPlayers: number = 4) {
  const res = await fetch(`${api("/sessions")}`, {
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
  const res = await fetch(`${api("/sessions")}`);
  if (!res.ok) throw new Error("Failed to list sessions");
  return res.json();
}

export async function getSession(sessionId: number) {
  const res = await fetch(`${api(`/sessions/${sessionId}`)}`);
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}

export async function getSessionByCode(joinCode: string) {
  const res = await fetch(`${api("/sessions/by-code/")}${encodeURIComponent(joinCode)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Комната не найдена" }));
    throw new Error(err.detail || "Комната не найдена");
  }
  return res.json();
}
