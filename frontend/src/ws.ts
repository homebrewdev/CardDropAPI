import type { WSMessage } from "./types";

type MessageHandler = (msg: WSMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = "";
  private lastJoinCode: string = "";
  private lastNickname: string = "";

  connect(joinCode: string, nickname: string) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.lastJoinCode = joinCode;
    this.lastNickname = nickname;
    // Относительный URL — Vite проксирует /ws к бэкенду (vite.config.ts)
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${proto}//${location.host}/ws/join/${joinCode}?nickname=${encodeURIComponent(nickname)}`;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach((h) => h(data));
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = (event) => {
      // Закрылся уже заменённый сокет — игнорируем
      if (this.ws !== ws) return;
      console.log(`[WS] Closed: ${event.code} ${event.reason}`);
      if (event.code >= 4000 && event.code < 5000) {
        // Сервер отказал (нет комнаты, партия идёт, мест нет…) — переподключение бессмысленно
        this.handlers.forEach((h) =>
          h({ type: "connection_closed", code: event.code, reason: event.reason })
        );
        return;
      }
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      console.error("[WS] Error");
    };
  }

  send(action: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.handlers.clear();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, "Client disconnect");
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      console.log("[WS] Reconnecting...");
      // Переподключаемся с теми же кодом и ником (пустой ник сервер закрывает с 4000)
      this.connect(this.lastJoinCode, this.lastNickname);
    }, 3000);
  }
}

export const gameSocket = new GameSocket();
