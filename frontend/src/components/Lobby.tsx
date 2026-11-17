import { useState } from "react";
import { DemoTable } from "./DemoTable";

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
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(inviteCode);
  const [maxPlayers, setMaxPlayers] = useState(4);

  const nickOk = nickname.trim().length > 0;
  const canSubmit = nickOk && (tab === "create" ? name.trim().length > 0 : code.trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
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
                autoFocus
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
