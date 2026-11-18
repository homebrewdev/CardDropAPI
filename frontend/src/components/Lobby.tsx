import { useCallback, useEffect, useState } from "react";
import { DemoTable } from "./DemoTable";
import { listSessions } from "../api";
import type { Session } from "../types";

const NICK_KEY = "carddrop.nickname";

function loadNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveNickname(nick: string) {
  try {
    localStorage.setItem(NICK_KEY, nick);
  } catch {
    // хранилище недоступно — просто не запомним
  }
}

/** Комнаты, в которые можно войти: ждут игроков и есть свободные места */
function joinable(list: Session[]): Session[] {
  return list
    .filter((s) => s.status === "waiting" && s.current_players < s.max_players)
    .sort((a, b) => b.current_players - a.current_players || b.id - a.id);
}

interface LobbyProps {
  onCreate: (name: string, maxPlayers: number, nickname: string) => void;
  onJoin: (code: string, nickname: string) => void;
  sessions: { id: number; name: string; join_code: string }[];
}

type Tab = "create" | "join";

export function Lobby({ onCreate, onJoin }: LobbyProps) {
  // Ссылка-приглашение ?room=CODE открывает сразу вход по коду
  const [inviteCode] = useState(() =>
    (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().slice(0, 8)
  );
  const [tab, setTab] = useState<Tab>(inviteCode ? "join" : "create");
  const [nickname, setNickname] = useState(loadNickname);
  const [name, setName] = useState("");
  const [code, setCode] = useState(inviteCode);
  const [maxPlayers, setMaxPlayers] = useState(4);

  // Список комнат на сервере для вкладки «Войти»
  const [rooms, setRooms] = useState<Session[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const refreshRooms = useCallback(() => {
    setRoomsLoading(true);
    listSessions()
      .then((list: Session[]) => {
        setRooms(joinable(list));
        setRoomsError(null);
      })
      .catch(() => setRoomsError("Не удалось загрузить список комнат"))
      .finally(() => setRoomsLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "join") return;
    refreshRooms();
    const t = window.setInterval(refreshRooms, 5000);
    return () => clearInterval(t);
  }, [tab, refreshRooms]);

  const nickOk = nickname.trim().length > 0;
  const canSubmit = nickOk && (tab === "create" ? name.trim().length > 0 : code.trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    saveNickname(nickname.trim());
    if (tab === "create") onCreate(name.trim(), maxPlayers, nickname.trim());
    else onJoin(code, nickname.trim());
  }

  return (
    <div className="lobby">
      <DemoTable />

      {/* Модальное окно без кнопки закрытия: убирается только когда
          игрок создал комнату или вошёл в неё (App переключает экран) */}
      <div className="lobby-overlay">
        <div className="lobby-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-title">
          <h1 className="title" id="lobby-title">🃏 CardDrop</h1>
          <p className="subtitle">Карточная игра на 2–4 человека</p>

          <div className="lobby-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "create"}
              className={tab === "create" ? "lobby-tab active" : "lobby-tab"}
              onClick={() => setTab("create")}
            >
              Создать комнату
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "join"}
              className={tab === "join" ? "lobby-tab active" : "lobby-tab"}
              onClick={() => setTab("join")}
            >
              Войти по коду
            </button>
          </div>

          <form className="form lobby-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Никнейм</span>
              <input
                type="text"
                placeholder="Как тебя звать"
                value={nickname}
                maxLength={30}
                autoFocus={!nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>

            {tab === "create" ? (
              <>
                <label className="field">
                  <span>Название комнаты</span>
                  <input
                    type="text"
                    placeholder="Например, «Пятничная»"
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="field">
                  <span>Игроков</span>
                  <div className="seg">
                    {[2, 3, 4].map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={maxPlayers === n ? "seg-btn active" : "seg-btn"}
                        onClick={() => setMaxPlayers(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
              <div className="field">
                <span className="room-list-head">
                  Открытые комнаты
                  <button
                    type="button"
                    className="room-refresh"
                    onClick={refreshRooms}
                    disabled={roomsLoading}
                    title="Обновить список"
                  >
                    ⟳
                  </button>
                </span>
                <div className="room-list" role="listbox" aria-label="Открытые комнаты">
                  {roomsError && <p className="room-list-empty">{roomsError}</p>}
                  {!roomsError && rooms === null && (
                    <p className="room-list-empty">Загрузка…</p>
                  )}
                  {!roomsError && rooms?.length === 0 && (
                    <p className="room-list-empty">Свободных комнат нет — создай свою</p>
                  )}
                  {rooms?.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      role="option"
                      aria-selected={code === r.join_code}
                      className={code === r.join_code ? "room-item active" : "room-item"}
                      onClick={() => setCode(r.join_code)}
                      onDoubleClick={() => {
                        if (!nickOk) return;
                        saveNickname(nickname.trim());
                        onJoin(r.join_code, nickname.trim());
                      }}
                      title="Клик — выбрать, двойной клик — войти"
                    >
                      <span className="room-name">{r.name}</span>
                      <span className="room-meta">
                        👤 {r.current_players}/{r.max_players} · {r.join_code}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Код комнаты</span>
                <input
                  type="text"
                  className="code-input"
                  placeholder="ABC12345"
                  value={code}
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
              </>
            )}

            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {tab === "create" ? "Создать и войти" : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
