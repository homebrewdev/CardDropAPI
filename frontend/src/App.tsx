import { useEffect, useRef, useState } from "react";
import { GameTable, type LastRound } from "./components/GameTable";
import { PlayerAvatar } from "./components/PlayerAvatar";
import { loadAvatar } from "./components/AvatarPicker";
import { Lobby } from "./components/Lobby";
import { DemoTable } from "./components/DemoTable";
import { SocialShareButtons } from "./components/ShareButton";
import { CopyCodeButton } from "./components/CopyCodeButton";
import { CoinPile } from "./components/CoinPile";
import type { ChatMessage, GameState, SessionInfo, WSMessage } from "./types";
import { gameSocket, CLOSE_REASONS } from "./ws";
import { CoinIcon } from "./components/CoinIcon";
import { ChatPanel } from "./components/ChatPanel";
import {
  createSession as apiCreateSession,
  getSessionByCode,
} from "./api";

type Screen = "lobby" | "waiting" | "playing";

function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRound, setLastRound] = useState<LastRound | null>(null);
  // Чат комнаты: история приходит при входе, дальше — по сообщению.
  // Сбрасывается только при выходе из комнаты, не при новой партии
  const [chat, setChat] = useState<ChatMessage[]>([]);
  // Какую аватарку и какому игроку уже отправили на сервер
  const avatarSentKey = useRef<string | null>(null);

  // Подписка одна на всё время жизни приложения: переподписка при каждом
  // входе копила бы обработчики и дублировала сообщения
  useEffect(() => {
    const offMessage = gameSocket.onMessage((msg: WSMessage) => {
      if (msg.type === "game_state") {
        const state = msg as unknown as GameState;
        // Своя аватарка (выбрана на главном окне) уходит на сервер один раз
        // на игрока и картинку — дальше её видят все по ссылке из снапшота
        const local = loadAvatar();
        if (local) {
          const key = `${state.player.id}:${local.length}:${local.slice(-40)}`;
          if (avatarSentKey.current !== key) {
            if (gameSocket.send({ action: "set_avatar", avatar: local })) {
              avatarSentKey.current = key;
            }
          }
        }
        setGameState(state);
        setSession(state.session);
        setError(null);
        setScreen(
          state.session_status === "waiting" ? "waiting" : "playing"
        );
      } else if (msg.type === "chat_history") {
        setChat((msg.messages as ChatMessage[]) ?? []);
      } else if (msg.type === "chat") {
        const m = msg.message as ChatMessage;
        setChat((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].slice(-100)));
      } else if (msg.type === "round_finished") {
        setLastRound({
          winner: (msg.winner_nickname as string | null) ?? null,
          winnerId: (msg.winner_player_id as number | null) ?? null,
          bank: Number(msg.bank_won ?? 0),
        });
      } else if (msg.type === "error") {
        setError(String(msg.message ?? "Ошибка сервера"));
      }
    });

    const offClose = gameSocket.onClose((event: CloseEvent) => {
      const reason =
        CLOSE_REASONS[event.code] ||
        event.reason ||
        `Соединение закрыто (код ${event.code})`;
      if ([4000, 4001, 4005, 4006].includes(event.code)) {
        // Сервер отклонил вход — показываем причину и возвращаемся в лобби
        setError(reason);
        setNotice(null);
        setGameState(null);
        setSession(null);
        setScreen("lobby");
      } else {
        setNotice("Соединение потеряно, переподключаемся...");
      }
    });

    return () => {
      offMessage();
      offClose();
    };
  }, []);

  function createSession(name: string, maxPlayers: number, nick: string) {
    setChat([]);
    setError(null);
    setNotice(null);
    // createSession уже разбирает detail из ответа, поэтому ошибка доходит
    // до пользователя с текстом причины, а не «HTTP 409»
    apiCreateSession(name, maxPlayers)
      .then((s: SessionInfo) => {
        setSession(s);
        gameSocket.connect(s.join_code, nick);
        setScreen("waiting");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось создать комнату"));
  }

  async function joinSession(joinCode: string, nick: string) {
    const code = joinCode.trim().toUpperCase();
    setChat([]);
    setError(null);
    setNotice(null);
    setGameState(null);

    // Сначала проверяем комнату по коду: без этого при неверном коде
    // экран оставался пустым, а WS молча переподключался по кругу
    try {
      const room: SessionInfo = await getSessionByCode(code);
      setSession(room);
      gameSocket.connect(room.join_code, nick);
      setScreen("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Комната не найдена");
      setScreen("lobby");
    }
  }

  function handleReady() {
    if (!gameState) return;
    gameSocket.send({ action: "ready", player_id: gameState.player.id });
  }

  function handleBet(bet: number) {
    if (!gameState) return;
    gameSocket.send({ action: "set_bet", bet });
  }

  function handleFlip() {
    gameSocket.send({ action: "flip", client_action_id: crypto.randomUUID() });
  }

  function handleShuffle() {
    gameSocket.send({ action: "shuffle" });
  }

  function handleStartRound() {
    gameSocket.send({ action: "start" });
  }

  function handleChatSend(text: string): boolean {
    return gameSocket.send({ action: "chat", text });
  }

  function handleDisconnect() {
    gameSocket.disconnect();
    setChat([]);
    setScreen("lobby");
    setSession(null);
    setGameState(null);
    setError(null);
    setNotice(null);
  }

  const connectedCount = gameState
    ? gameState.other_players.filter((p) => p.connected).length + 1
    : 0;
  const maxPlayers = session?.max_players ?? 4;
  const canStart = connectedCount >= 2;
  // Партия стартует сама, когда все подключённые поставили — кто ещё нет
  const waitingBets = gameState
    ? gameState.other_players.filter((p) => p.connected && !p.bet).map((p) => p.nickname)
    : [];

  return (
    <div className="app">
      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button className="banner-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="banner banner-info">
          <span>{notice}</span>
          <button className="banner-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {screen === "lobby" && (
        <Lobby onCreate={createSession} onJoin={joinSession} sessions={[]} />
      )}

      {screen === "waiting" && (
        <div className="lobby">
          <DemoTable />
          <div className="lobby-overlay">
          <div className="waiting-box lobby-modal" role="dialog" aria-modal="true">
            <button
              type="button"
              className="modal-close"
              onClick={handleDisconnect}
              title="Выйти из комнаты"
              aria-label="Выйти из комнаты"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <h2>Ожидание игроков</h2>
            {session && (
              <p>
                Комната: <strong>{session.name}</strong>
              </p>
            )}
            {session && (
              <div className="code-row">
                <div className="code-main">
                  <span>Код:</span>
                  <strong className="join-code">{session.join_code}</strong>
                  <CopyCodeButton code={session.join_code} />
                </div>
                <SocialShareButtons joinCode={session.join_code} roomName={session.name} />
              </div>
            )}

            {!gameState && <p className="waiting">Подключение...</p>}

            {gameState && (
              <>
                <p>
                  Игроков: {connectedCount} / {maxPlayers}
                </p>

                <ul className="players-list">
                  <li>
                    <span className="player-line">
                      <span className="avatar avatar-sm">
                        <PlayerAvatar nickname={gameState.player.nickname} src={gameState.player.avatar} />
                      </span>
                      {gameState.player.nickname}{" "}
                      {gameState.player.is_ready ? "✓" : "○"}
                    </span>
                    <span className="score">
                      <CoinIcon /> {gameState.player.score} · ставка {gameState.player.bet}
                    </span>
                  </li>
                  {gameState.other_players.map((p) => (
                    <li key={p.id} className={p.connected ? "" : "offline"}>
                      <span className="player-line">
                        <span className="avatar avatar-sm">
                          <PlayerAvatar nickname={p.nickname} src={p.avatar} />
                        </span>
                        {p.nickname} {p.is_ready ? "✓" : "○"}
                        {!p.connected && " (нет связи)"}
                      </span>
                      <span className="score">
                        <CoinIcon /> {p.score} · ставка {p.bet}
                      </span>
                    </li>
                  ))}
                </ul>

                <CoinPile amount={gameState.ante} />

                {/* Что сделать, чтобы начать: шаги с отметками */}
                <ol className="next-steps">
                  {[
                    { done: gameState.player.bet > 0, text: "Сделай ставку" },
                    {
                      done: false,
                      text: !canStart
                        ? "Дождись второго игрока — поделись кодом комнаты"
                        : waitingBets.length > 0
                          ? `Ждём ставки: ${waitingBets.join(", ")}`
                          : "Все поставили — начинаем…",
                    },
                  ].map((step, i, arr) => {
                    const current = !step.done && arr.slice(0, i).every((x) => x.done);
                    return (
                      <li
                        key={i}
                        className={step.done ? "done" : current ? "current" : ""}
                      >
                        <span className="step-mark">{step.done ? "✓" : i + 1}</span>
                        {step.text}
                      </li>
                    );
                  })}
                </ol>

                <div className="waiting-actions">
                  <BetForm
                    defaultValue={gameState.player.bet || 100}
                    currentBet={gameState.player.bet}
                    onSubmit={handleBet}
                    isReady={gameState.player.is_ready}
                    onReady={handleReady}
                  />
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      )}

      {screen === "playing" && gameState && (
        <GameTable
          state={gameState}
          onFlip={handleFlip}
          onShuffle={handleShuffle}
          onStartRound={handleStartRound}
          lastRound={lastRound}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* Чат комнаты — только за столом, когда партия началась: в окне
          ожидания он перекрывал ставку на телефоне. История копится и до
          старта (сообщения приходят в state), так что ничего не теряется */}
      {screen === "playing" && (
        <ChatPanel
          messages={chat}
          myId={gameState?.player.id ?? null}
          onSend={handleChatSend}
        />
      )}
    </div>
  );
}

const BET_MIN = 1;
const BET_MAX = 10000;
const BET_STEP = 50;

function clampBet(n: number): number {
  return Math.min(BET_MAX, Math.max(BET_MIN, Math.round(n)));
}

/** Строка ставки: «Ваша ставка» [−] [поле] [+] [Поставить],
 *  под ней — кнопка «Готов» на всю ширину строки */
function BetForm({
  defaultValue,
  currentBet,
  onSubmit,
  isReady,
  onReady,
}: {
  defaultValue: number;
  /** Ставка, подтверждённая сервером (0 — ещё не ставил) */
  currentBet: number;
  onSubmit: (bet: number) => void;
  isReady: boolean;
  onReady: () => void;
}) {
  const [value, setValue] = useState(String(defaultValue));
  const num = Number(value);
  const valid = Number.isFinite(num) && num >= BET_MIN && num <= BET_MAX;
  // Ставка принята сервером и в поле то же значение — кнопка «выполнена»
  const placed = currentBet > 0 && valid && clampBet(num) === currentBet;

  function step(delta: number) {
    const base = Number.isFinite(num) ? num : defaultValue;
    // Шаг кратный BET_STEP: 100 → 150, 120 → 150 / 100
    const next =
      delta > 0
        ? Math.floor(base / BET_STEP) * BET_STEP + BET_STEP
        : Math.ceil(base / BET_STEP) * BET_STEP - BET_STEP;
    setValue(String(clampBet(next)));
  }

  return (
    <div className="bet-panel">
      <form
        className="bet-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !placed) onSubmit(clampBet(num));
        }}
      >
        <label className="bet-label" htmlFor="bet-input">
          Ваша ставка
        </label>
        <div className="bet-stepper">
          <button
            type="button"
            className="bet-step"
            onClick={() => step(-1)}
            disabled={Number.isFinite(num) && num <= BET_MIN}
            aria-label="Уменьшить ставку"
            title={`Уменьшить на ${BET_STEP}`}
          >
            −
          </button>
          <input
            id="bet-input"
            type="number"
            inputMode="numeric"
            min={BET_MIN}
            max={BET_MAX}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => valid || setValue(String(clampBet(Number.isFinite(num) ? num : defaultValue)))}
          />
          <button
            type="button"
            className="bet-step"
            onClick={() => step(1)}
            disabled={Number.isFinite(num) && num >= BET_MAX}
            aria-label="Увеличить ставку"
            title={`Увеличить на ${BET_STEP}`}
          >
            +
          </button>
        </div>
        <button
          type="submit"
          className={placed ? "btn bet-submit is-done" : "btn btn-primary bet-submit"}
          disabled={!valid || placed}
          title={placed ? "Ставка принята — измените сумму, чтобы переставить" : "Поставить"}
        >
          {placed ? "Поставлено ✓" : "Поставить"}
        </button>
      </form>
      <button
        type="button"
        className={isReady ? "btn btn-ready is-ready" : "btn btn-ready"}
        onClick={onReady}
      >
        {isReady ? "Готов ✓" : "Готов"}
      </button>
    </div>
  );
}

export default App;
