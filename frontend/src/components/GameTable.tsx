import { Card } from "./Card";
import type { GameState, PlayerCard } from "../types";

interface GameTableProps {
  state: GameState;
  onReady: () => void;
  onPlayCard: (playerCardId: number, cardId: number) => void;
  onStartRound: () => void;
  onDisconnect: () => void;
}

export function GameTable({ state, onPlayCard, onDisconnect }: GameTableProps) {
  const myPlayer = state.player;
  const isMyTurn = state.current_player_id === myPlayer.id;
  const myCards = state.my_cards;

  function handlePlayCard(pc: PlayerCard) {
    onPlayCard(pc.id, pc.card.id);
  }

  return (
    <div className="game-table">
      {/* Верх: другие игроки */}
      <div className="top-players">
        {state.other_players.map((p) => (
          <div key={p.id} className={`opponent ${p.is_ready ? "ready" : ""}`}>
            <div className="avatar">{p.nickname[0]?.toUpperCase()}</div>
            <span className="name">{p.nickname}</span>
            <span className="score">★ {p.score}</span>
            {p.is_ready && <span className="ready-badge">✓</span>}
          </div>
        ))}
        {state.other_players.length === 0 && (
          <p className="waiting">Ожидание других игроков...</p>
        )}
      </div>

      {/* Середина: стол */}
      <div className="table-area">
        <div className="table-center">
          <span className="round-info">Раунд {state.round_number}</span>
          {state.table_cards.length > 0 && (
            <div className="played-cards">
              {state.table_cards.map((pc) => (
                <Card
                  key={pc.id}
                  name={pc.card.name}
                  suit={pc.card.suit}
                  value={pc.card.value}
                  power={pc.card.power}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Низ: мой игрок + руки */}
      <div className="bottom-area">
        {/* Мой игрок */}
        <div className="my-player">
          <div className="avatar primary">{myPlayer.nickname[0]?.toUpperCase()}</div>
          <span className="name">{myPlayer.nickname}</span>
          <span className="score">★ {myPlayer.score}</span>
          {isMyTurn && <span className="turn-badge">Твой ход!</span>}
          {!isMyTurn && state.current_player_id && (
            <span className="waiting-turn">Ждём...</span>
          )}
        </div>

        {/* Мои карты */}
        {myCards.length > 0 && (
          <div className="my-hand">
            {myCards.map((pc) => (
              <Card
                key={pc.id}
                name={pc.card.name}
                suit={pc.card.suit}
                value={pc.card.value}
                power={pc.card.power}
                onClick={() => handlePlayCard(pc)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Кнопка выхода */}
      <button className="btn btn-logout" onClick={onDisconnect}>
        Выйти
      </button>
    </div>
  );
}
