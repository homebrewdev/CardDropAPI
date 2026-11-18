import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  myId: number | null;
  onSend: (text: string) => boolean;
}

const MAX_LEN = 300; // как CHAT_MAX_LEN на сервере
const OPEN_KEY = "carddrop.chatOpen";

/** Свёрнут ли чат: выбор игрока, иначе на узких экранах (телефон) — свёрнут */
function loadOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    if (v !== null) return v === "1";
  } catch {
    // нет хранилища — решаем по ширине экрана
  }
  return !window.matchMedia("(max-width: 1100px)").matches;
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // не критично
  }
}

function timeOf(ts: string): string {
  const d = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z");
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Чат комнаты: слева сверху до танцовщицы, сворачивается в кнопку
 *  со счётчиком непрочитанных. Текст выводится только как текст. */
export function ChatPanel({ messages, myId, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(loadOpen);
  // id последнего сообщения, которое игрок видел при открытом чате.
  // С нуля: сообщения из окна ожидания (там чата нет) тоже непрочитанные
  const [seenId, setSeenId] = useState(0);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Открытый чат — всё прочитано
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    if (open) setSeenId(lastId);
  }, [open, lastId]);
  const unread = open ? 0 : messages.filter((m) => m.id > seenId && m.player_id !== myId).length;

  // Новые сообщения прокручивают вниз, если игрок и так был внизу
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // При открытии — сразу к последним сообщениям
  useLayoutEffect(() => {
    const el = listRef.current;
    if (open && el) {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = true;
    }
  }, [open]);

  function toggle(next: boolean) {
    setOpen(next);
    saveOpen(next);
  }

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

  if (!open) {
    return (
      <button
        type="button"
        className="chat-fab"
        onClick={() => toggle(true)}
        aria-label={unread ? `Открыть чат, непрочитанных: ${unread}` : "Открыть чат"}
        title="Открыть чат"
      >
        💬 Чат
        {unread > 0 && <span className="chat-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
    );
  }

  return (
    <section className="chat-panel" aria-label="Чат комнаты">
      <header className="chat-head">
        <span>💬 Чат</span>
        <button
          type="button"
          className="chat-collapse"
          onClick={() => toggle(false)}
          aria-label="Свернуть чат"
          title="Свернуть чат"
        >
          —
        </button>
      </header>
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
