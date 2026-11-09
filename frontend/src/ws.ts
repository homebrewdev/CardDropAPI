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
    this.lastJoinCode = joinCode;
    this.lastNickname = nickname;
    // Относительный URL — Vite проксирует /ws к бэкенду (vite.config.ts)
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${proto}//${location.host}/ws/join/${joinCode}?nickname=${encodeURIComponent(nickname)}`;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] Connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach((h) => h(data));
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Closed: ${event.code} ${event.reason}`);
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
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
    this.handlers.clear();
    this.ws?.close(1000, "Client disconnect");
    this.ws = null;
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
