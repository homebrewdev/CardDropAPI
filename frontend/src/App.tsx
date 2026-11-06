import { useState } from "react";
import { GameTable } from "./components/GameTable";
import { Lobby } from "./components/Lobby";
import type { Session, GameState, PlayerCard } from "./types";
import { gameSocket } from "./ws";

type Screen = "lobby" | "waiting" | "playing";

function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [session, setSession] = useState<Session | null>(null);
  const [nickname, setNickname] = useState("");
  const [gameState, setGameState] = useState<GameState | null>(null);

  function onGameState(state: GameState) {
    setGameState(state);
    if (state.session_status === "playing") {
      setScreen("playing");
    } else {
      setScreen("waiting");
    }
  }

  function onSessionUpdate(s: Session) {
    setSession(s);
  }

  function createSession(name: string, maxPlayers: number) {
    fetch("http://localhost:8000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, max_players: maxPlayers }),
    })
      .then((res) => res.json())
      .then((s) => {
        setSession(s);
        setScreen("waiting");
      })
      .catch((err) => alert("Ошибка: " + err.message));
  }

  function joinSession(joinCode: string, nick: string) {
    setNickname(nick);
    // Подключаем WebSocket
    gameSocket.onMessage(onGameState);
    gameSocket.connect(joinCode, nick);
    setScreen("waiting");
  }

  function handleReady() {
    gameSocket.send({ action: "ready", player_id: gameState?.player.id });
  }

  function handlePlayCard(playerCardId: number, cardId: number) {
    gameSocket.send({
      action: "play_card",
      player_id: gameState?.player.id,
      card_id: cardId,
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
  }

  return (
    <div className="app">
      {screen === "lobby" && (
        <Lobby
          onCreate={createSession}
          onJoin={joinSession}
          sessions={[]}
        />
      )}

      {screen === "waiting" && session && gameState && (
        <div className="waiting-screen">
          <div className="waiting-box">
            <h2>Ожидание игроков</h2>
            <p>Код комнаты: <strong>{session.join_code}</strong></p>
            <p>Игроков: {gameState.other_players.length + 1} / {session.max_players}</p>
            <ul>
              <li>{gameState.player.nickname} {gameState.player.is_ready ? "✓" : "○"}</li>
              {gameState.other_players.map((p) => (
                <li key={p.id}>{p.nickname} {p.is_ready ? "✓" : "○"}</li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={handleReady}>
              {gameState.player.is_ready ? "Готов" : "Готов!"}
            </button>
            <button className="btn btn-secondary" onClick={handleDisconnect}>
              Выйти
            </button>
          </div>
        </div>
      )}

      {screen === "waiting" && session && !gameState && (
        <div className="waiting-screen">
          <div className="waiting-box">
            <p>Подключение...</p>
          </div>
        </div>
      )}

      {screen === "playing" && gameState && (
        <GameTable
          state={gameState}
          onReady={handleReady}
          onPlayCard={handlePlayCard}
          onStartRound={handleStartRound}
          onDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
}

export default App;
