import { useEffect, useRef, useState } from "react";
import { GameTable } from "./components/GameTable";
import { Lobby } from "./components/Lobby";
import { WaitingRoom } from "./components/WaitingRoom";
import type { Session, GameState, WSMessage } from "./types";
import { gameSocket } from "./ws";

type Screen = "lobby" | "room";
type Theme = "green" | "blue";

function loadTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "blue" ? "blue" : "green";
  } catch {
    return "green";
  }
}

// Коды закрытия WS из app/ws/ws_handler.py
const CLOSE_REASONS: Record<number, string> = {
  4000: "Некорректный никнейм",
  4001: "Комната с таким кодом не найдена",
  4002: "Ошибка сервера при входе",
  4005: "Партия в этой комнате уже идёт — дождись её конца",
  4006: "Комната заполнена",
};

function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // хранилище недоступно — тема просто не запомнится
    }
  }, [theme]);

  function showNotice(text: string) {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  function resetToLobby() {
    gameSocket.disconnect();
    setScreen("lobby");
    setGameState(null);
    setLastResult(null);
  }

  function handleWsMessage(msg: WSMessage) {
    switch (msg.type) {
      case "game_state":
        setGameState(msg as unknown as GameState);
        break;
      case "round_started":
        setLastResult(null);
        break;
      case "error":
        showNotice(String(msg.message ?? "Ошибка"));
        break;
      case "player_folded":
        showNotice(`${msg.nickname} сдался`);
        break;
      case "round_finished":
        setLastResult(
          msg.winner_nickname
            ? `Партию выиграл ${msg.winner_nickname}, банк ${msg.bank_won}`
            : "Партия закончилась без победителя"
        );
        break;
      case "game_finished":
        setLastResult(String(msg.message ?? "Игра окончена"));
        break;
      case "connection_closed": {
        const code = Number(msg.code);
        resetToLobby();
        showNotice(CLOSE_REASONS[code] ?? `Соединение закрыто: ${msg.reason || code}`);
        break;
      }
    }
  }

  function enterRoom(joinCode: string, nick: string) {
    gameSocket.disconnect();
    setGameState(null);
    setLastResult(null);
    gameSocket.onMessage(handleWsMessage);
    gameSocket.connect(joinCode, nick);
    setScreen("room");
  }

  function createSession(name: string, maxPlayers: number, nick: string) {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, max_players: maxPlayers }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((s: Session) => enterRoom(s.join_code, nick))
      .catch((err) => showNotice("Не удалось создать игру: " + err.message));
  }

  const playerId = gameState?.player.id;

  return (
    <div className="app">
      <button
        className="btn btn-theme"
        onClick={() => setTheme(theme === "green" ? "blue" : "green")}
        title="Сменить тему"
      >
        {theme === "green" ? "🔵 Синяя тема" : "🟢 Зелёная тема"}
      </button>

      {screen === "lobby" && <Lobby onCreate={createSession} onJoin={enterRoom} sessions={[]} />}

      {screen === "room" && !gameState && (
        <div className="waiting-screen">
          <div className="waiting-box">
            <p>Подключение...</p>
            <button className="btn btn-secondary" onClick={resetToLobby}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {screen === "room" && gameState && gameState.session_status !== "playing" && (
        <WaitingRoom
          key={gameState.join_code}
          state={gameState}
          lastResult={lastResult}
          onReady={() => gameSocket.send({ action: "ready", player_id: playerId })}
          onSetBet={(bet) => gameSocket.send({ action: "set_bet", bet })}
          onStart={() => gameSocket.send({ action: "start" })}
          onLeave={resetToLobby}
        />
      )}

      {screen === "room" && gameState && gameState.session_status === "playing" && (
        <GameTable
          state={gameState}
          onPlayCard={(_pcId, cardId) =>
            gameSocket.send({
              action: "play_card",
              player_id: playerId,
              card_id: cardId,
              client_action_id: crypto.randomUUID(),
            })
          }
          onFold={() =>
            gameSocket.send({
              action: "fold",
              player_id: playerId,
              client_action_id: crypto.randomUUID(),
            })
          }
          onDisconnect={resetToLobby}
        />
      )}

      {notice && <div className="notice">{notice}</div>}
    </div>
  );
}

export default App;
