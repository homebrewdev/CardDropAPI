import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  myId: number | null;
  onSend: (text: string) => boolean;
}

const MAX_LEN = 300; // как CHAT_MAX_LEN на сервере

function timeOf(ts: string): string {
  const d = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z");
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Чат комнаты: всегда открыт, слева сверху до танцовщицы.
 *  Текст выводится только как текст — HTML из сообщений не исполняется. */
export function ChatPanel({ messages, myId, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Новые сообщения прокручивают вниз, если игрок и так был внизу
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (onSend(t)) {
      setText("");
      stickToBottom.current = true;
    }
  }

  return (
    <section className="chat-panel" aria-label="Чат комнаты">
      <header className="chat-head">💬 Чат</header>
      <div className="chat-list" ref={listRef} onScroll={handleScroll} aria-live="polite">
        {messages.length === 0 && (
          <p className="chat-empty">Сообщений пока нет — напиши первым</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.player_id === myId ? "chat-msg mine" : "chat-msg"}>
            <span className="avatar chat-avatar">
              <PlayerAvatar nickname={m.nickname} src={m.avatar} />
            </span>
            <div className="chat-bubble">
              <div className="chat-meta">
                <span className="chat-nick">{m.nickname}</span>
                <span className="chat-time">{timeOf(m.ts)}</span>
              </div>
              <div className="chat-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          type="text"
          value={text}
          maxLength={MAX_LEN}
          placeholder="Сообщение…"
          aria-label="Сообщение в чат"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="Отправить">
          ➤
        </button>
      </form>
    </section>
  );
}
