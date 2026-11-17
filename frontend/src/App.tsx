import { useEffect, useState } from "react";
import { GameTable } from "./components/GameTable";
import { Lobby } from "./components/Lobby";
import type { GameState, SessionInfo, WSMessage } from "./types";
import { gameSocket, CLOSE_REASONS } from "./ws";
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

  // Подписка одна на всё время жизни приложения: переподписка при каждом
  // входе копила бы обработчики и дублировала сообщения
  useEffect(() => {
    const offMessage = gameSocket.onMessage((msg: WSMessage) => {
      if (msg.type === "game_state") {
        const state = msg as unknown as GameState;
        setGameState(state);
        setSession(state.session);
        setError(null);
        setScreen(
          state.session_status === "waiting" ? "waiting" : "playing"
        );
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
      .catch((err) => alert("Ошибка: " + err.message));
  }

  async function joinSession(joinCode: string, nick: string) {
    const code = joinCode.trim().toUpperCase();
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

  function handlePlayCard(_playerCardId: number, cardId: number) {
    if (!gameState) return;
    gameSocket.send({
      action: "play_card",
      player_id: gameState.player.id,
      card_id: cardId,
      client_action_id: crypto.randomUUID(),
    });
  }

  function handlePass() {
    if (!gameState) return;
    gameSocket.send({
      action: "pass",
      player_id: gameState.player.id,
      client_action_id: crypto.randomUUID(),
    });
  }

  function handleStartRound() {
    gameSocket.send({ action: "start" });
  }

  function handleDisconnect() {
    gameSocket.disconnect();
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
        <div className="waiting-screen">
          <div className="waiting-box">
            <h2>Ожидание игроков</h2>
            {session && (
              <p>
                Комната: <strong>{session.name}</strong>
                <br />
                Код: <strong className="join-code">{session.join_code}</strong>
              </p>
            )}

            {!gameState && <p className="waiting">Подключение...</p>}

            {gameState && (
              <>
                <p>
                  Игроков: {connectedCount} / {maxPlayers}
                </p>

                <ul className="players-list">
                  <li>
                    <span>
                      {gameState.player.nickname}{" "}
                      {gameState.player.is_ready ? "✓" : "○"}
                    </span>
                    <span className="score">
                      ★ {gameState.player.score} · ставка {gameState.player.bet}
                    </span>
                  </li>
                  {gameState.other_players.map((p) => (
                    <li key={p.id} className={p.connected ? "" : "offline"}>
                      <span>
                        {p.nickname} {p.is_ready ? "✓" : "○"}
                        {!p.connected && " (нет связи)"}
                      </span>
                      <span className="score">
                        ★ {p.score} · ставка {p.bet}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="bank-line">
                  Банк: <strong>{gameState.ante}</strong>
                </p>

                <div className="waiting-actions">
                  <BetForm
                    defaultValue={gameState.player.bet || 100}
                    onSubmit={handleBet}
                  />
                  <button className="btn btn-secondary" onClick={handleReady}>
                    {gameState.player.is_ready ? "Готов ✓" : "Готов"}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartRound}
                    disabled={!canStart}
                    title={
                      canStart
                        ? "Начать партию"
                        : "Нужно минимум два подключённых игрока"
                    }
                  >
                    Начать игру
                  </button>
                  <button className="btn btn-secondary" onClick={handleDisconnect}>
                    Выйти
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {screen === "playing" && gameState && (
        <GameTable
          state={gameState}
          onPlayCard={handlePlayCard}
          onPass={handlePass}
          onStartRound={handleStartRound}
          onDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
}

function BetForm({
  defaultValue,
  onSubmit,
}: {
  defaultValue: number;
  onSubmit: (bet: number) => void;
}) {
  const [value, setValue] = useState(String(defaultValue));

  return (
    <form
      className="bet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const bet = Number(value);
        if (Number.isFinite(bet) && bet > 0) onSubmit(bet);
      }}
    >
      <input
        type="number"
        min={1}
        max={10000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ставка"
      />
      <button type="submit" className="btn btn-secondary">
        Ставка
      </button>
    </form>
  );
}

export default App;
