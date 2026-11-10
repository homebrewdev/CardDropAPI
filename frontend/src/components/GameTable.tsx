import { Card } from "./Card";
import type { GameState, PlayerCard } from "../types";

interface GameTableProps {
  state: GameState;
  onPlayCard: (playerCardId: number, cardId: number) => void;
  onFold: () => void;
  onDisconnect: () => void;
}

const POWER_NAMES: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

export function GameTable({ state, onPlayCard, onFold, onDisconnect }: GameTableProps) {
  const myPlayer = state.player;
  const isMyTurn = state.current_player_id === myPlayer.id && !myPlayer.folded;
  const myCards = state.my_cards;
  const everyone = [myPlayer, ...state.other_players];
  const currentName = everyone.find((p) => p.id === state.current_player_id)?.nickname;
  const leaderName = everyone.find((p) => p.id === state.leader_player_id)?.nickname;

  function canPlay(pc: PlayerCard) {
    if (!isMyTurn) return false;
    if (state.current_power == null || state.is_tiebreak) return true;
    return pc.card.power > state.current_power;
  }

  function handlePlayCard(pc: PlayerCard) {
    if (!canPlay(pc)) return;
    onPlayCard(pc.id, pc.card.id);
  }

  const hasPlayable = myCards.some(canPlay);

  return (
    <div className="game-table">
      {/* Верх: другие игроки */}
      <div className="top-players">
        {state.other_players.map((p) => (
          <div
            key={p.id}
            className={[
              "opponent",
              p.id === state.current_player_id ? "current" : "",
              p.folded ? "folded" : "",
              p.connected ? "" : "offline",
            ].join(" ")}
          >
            <div className="avatar">{p.nickname[0]?.toUpperCase()}</div>
            <span className="name">{p.nickname}</span>
            <span className="score">★ {p.score}</span>
            <span className="cards-left">
              {p.folded ? "сдался" : `🂠 ${p.cards_left}`}
            </span>
          </div>
        ))}
      </div>

      {/* Середина: стол */}
      <div className="table-area">
        <div className="table-center">
          <div className="table-info">
            <span>Партия {state.round_number}</span>
            <span>Банк: <strong>{state.ante}</strong></span>
            <span>
              Старшая:{" "}
              <strong>
                {state.current_power == null
                  ? "—"
                  : `${POWER_NAMES[state.current_power] ?? state.current_power}${leaderName ? ` (${leaderName})` : ""}`}
              </strong>
            </span>
          </div>
          {state.table_cards.length > 0 ? (
            <div className="played-cards">
              {[...state.table_cards].reverse().map((pc) => (
                <Card
                  key={pc.id}
                  name={pc.card.name}
                  suit={pc.card.suit}
                  value={pc.card.value}
                  power={pc.card.power}
                />
              ))}
            </div>
          ) : (
            <p className="waiting">Стол пуст — первый ход любой картой</p>
          )}
        </div>
      </div>

      {/* Низ: мой игрок + руки */}
      <div className="bottom-area">
        <div className="my-player">
          <div className="avatar primary">{myPlayer.nickname[0]?.toUpperCase()}</div>
          <span className="name">{myPlayer.nickname}</span>
          <span className="score">★ {myPlayer.score}</span>
          {myPlayer.folded && <span className="waiting-turn">Ты сдался — ждём конца раунда</span>}
          {isMyTurn && (
            <span className="turn-badge">
              {hasPlayable ? "Твой ход!" : "Побить нечем — сдавайся"}
            </span>
          )}
          {!isMyTurn && !myPlayer.folded && currentName && (
            <span className="waiting-turn">Ходит {currentName}...</span>
          )}
          {isMyTurn && (
            <button className="btn btn-fold" onClick={onFold}>
              Сдаться
            </button>
          )}
        </div>

        {myCards.length > 0 && (
          <div className="my-hand">
            {[...myCards]
              .sort((a, b) => a.card.power - b.card.power)
              .map((pc) => (
                <div key={pc.id} className={canPlay(pc) ? "playable" : "unplayable"}>
                  <Card
                    name={pc.card.name}
                    suit={pc.card.suit}
                    value={pc.card.value}
                    power={pc.card.power}
                    onClick={() => handlePlayCard(pc)}
                  />
                </div>
              ))}
          </div>
        )}
      </div>

      <button className="btn btn-logout" onClick={onDisconnect}>
        Выйти
      </button>
    </div>
  );
}
