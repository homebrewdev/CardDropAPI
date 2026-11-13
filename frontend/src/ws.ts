import type { WSMessage } from "./types";

type MessageHandler = (msg: WSMessage) => void;
type CloseHandler = (event: CloseEvent) => void;

// Коды закрытия, после которых переподключаться бессмысленно:
// сервер отклонил вход, повтор создаст тот же отказ
const FATAL_CLOSE_CODES = new Set([4000, 4001, 4005, 4006]);
const MAX_RECONNECT_ATTEMPTS = 5;

export const CLOSE_REASONS: Record<number, string> = {
  4000: "Некорректный никнейм",
  4001: "Комната не найдена",
  4005: "Игра уже началась",
  4006: "Комната заполнена",
};

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private closeHandlers: Set<CloseHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closedByClient = false;
  private url: string = "";
  private lastJoinCode: string = "";
  private lastNickname: string = "";

  connect(joinCode: string, nickname: string) {
    this.lastJoinCode = joinCode.trim().toUpperCase();
    this.lastNickname = nickname.trim();
    this.reconnectAttempts = 0;
    this.closedByClient = false;
    this.clearReconnectTimer();

    // Предыдущее соединение (смена комнаты / повторный вход) закрываем сами,
    // иначе остаётся второй сокет и события приходят дважды
    this.teardownSocket();

    // Относительный URL — Vite проксирует /ws к бэкенду (vite.config.ts)
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${proto}//${location.host}/ws/join/${encodeURIComponent(
      this.lastJoinCode
    )}?nickname=${encodeURIComponent(this.lastNickname)}`;

    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      console.log("[WS] Connected");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach((h) => h(data));
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    socket.onclose = (event) => {
      // Сокет уже заменён новым подключением — его закрытие игнорируем
      if (this.ws !== socket) return;
      this.ws = null;
      console.log(`[WS] Closed: ${event.code} ${event.reason}`);

      if (this.closedByClient || event.code === 1000) return;

      this.closeHandlers.forEach((h) => h(event));

      if (FATAL_CLOSE_CODES.has(event.code)) return;

      this.scheduleReconnect();
    };

    socket.onerror = () => {
      console.error("[WS] Error");
    };
  }

  send(action: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
      return true;
    }
    return false;
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onClose(handler: CloseHandler) {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  disconnect() {
    this.closedByClient = true;
    this.clearReconnectTimer();
    this.teardownSocket();
  }

  private teardownSocket() {
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onopen = null;
      try {
        socket.close(1000, "Client disconnect");
      } catch {
        // сокет уже закрыт
      }
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[WS] Reconnect attempts exhausted");
      return;
    }
    this.reconnectAttempts += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      console.log(`[WS] Reconnecting (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      // Переподключаемся с теми же кодом и ником (пустой ник сервер закрывает с 4000)
      this.connect(this.lastJoinCode, this.lastNickname);
    }, 3000);
  }
}

export const gameSocket = new GameSocket();
