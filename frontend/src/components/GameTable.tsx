import { Card } from "./Card";
import type { GameState, Player, PlayerCard } from "../types";

interface GameTableProps {
  state: GameState;
  onPlayCard: (playerCardId: number, cardId: number) => void;
  onPass: () => void;
  onStartRound: () => void;
  onDisconnect: () => void;
}

export function GameTable({
  state,
  onPlayCard,
  onPass,
  onStartRound,
  onDisconnect,
}: GameTableProps) {
  const myPlayer = state.player;
  const isMyTurn = state.current_player_id === myPlayer.id;
  const isFinished = state.session_status === "finished";
  const canAct = isMyTurn && !myPlayer.folded && !isFinished;

  const allPlayers: Player[] = [state.player, ...state.other_players];
  const nicknameById = new Map(allPlayers.map((p) => [p.id, p.nickname]));

  function handlePlayCard(pc: PlayerCard) {
    if (!canAct) return;
    onPlayCard(pc.id, pc.card.id);
  }

  return (
    <div className="game-table">
      <button className="btn btn-logout" onClick={onDisconnect}>
        Выйти
      </button>

      {/* Верх: другие игроки */}
      <div className="top-players">
        {state.other_players.map((p) => (
          <div
            key={p.id}
            className={[
              "opponent",
              p.is_ready ? "ready" : "",
              state.current_player_id === p.id ? "active-turn" : "",
              p.connected ? "" : "offline",
              p.folded ? "folded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="avatar">{p.nickname[0]?.toUpperCase()}</div>
            <div className="player-meta">
              <span className="name">
                {p.nickname} {p.is_ready && "✓"}
              </span>
              <span className="score">
                ★ {p.score} · ставка {p.bet}
              </span>
              <span className="cards-left">
                {p.folded ? "сбросил карты" : `карт: ${p.cards_left}`}
                {!p.connected && " · нет связи"}
              </span>
            </div>
            {state.current_player_id === p.id && (
              <span className="turn-dot" title="Ходит сейчас" />
            )}
          </div>
        ))}
        {state.other_players.length === 0 && (
          <p className="waiting">Ожидание других игроков...</p>
        )}
      </div>

      {/* Середина: стол */}
      <div className="table-area">
        <div className="table-center">
          <div className="table-info">
            <span className="round-info">Раунд {state.round_number || 1}</span>
            <span className="round-info">Банк: {state.ante}</span>
            {state.current_power !== null && (
              <span className="round-info">
                Старшая сила: {state.current_power}
              </span>
            )}
          </div>

          {state.is_tiebreak && (
            <p className="tiebreak-note">Равные карты — переигровка</p>
          )}

          {state.table_cards.length > 0 ? (
            <div className="played-cards">
              {state.table_cards.map((pc) => (
                <div key={pc.id} className="played-card">
                  <Card
                    name={pc.card.name}
                    suit={pc.card.suit}
                    value={pc.card.value}
                    power={pc.card.power}
                    highlight={pc.player_id === state.leader_player_id}
                  />
                  <span className="played-owner">
                    {pc.player_id ? nicknameById.get(pc.player_id) : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="waiting">
              {isFinished ? "Партия окончена" : "Стол пуст — сделай первый ход"}
            </p>
          )}
        </div>
      </div>

      {/* Низ: мой игрок + рука */}
      <div className="bottom-area">
        <div className="my-player">
          <div className="avatar primary">
            {myPlayer.nickname[0]?.toUpperCase()}
          </div>
          <div className="player-meta">
            <span className="name">{myPlayer.nickname}</span>
            <span className="score">
              ★ {myPlayer.score} · ставка {myPlayer.bet} · карт:{" "}
              {myPlayer.cards_left}
            </span>
          </div>
          {isMyTurn && !isFinished && (
            <span className="turn-badge">Твой ход!</span>
          )}
          {!isMyTurn && state.current_player_id && !isFinished && (
            <span className="waiting-turn">
              Ходит {nicknameById.get(state.current_player_id) ?? "игрок"}...
            </span>
          )}
          {myPlayer.folded && <span className="waiting-turn">Ты сбросил карты</span>}
        </div>

        {myPlayer.cards_left === 0 && !isFinished && (
          <p className="waiting">Карт на руках нет</p>
        )}

        {state.my_cards.length > 0 && (
          <div className="my-hand">
            {state.my_cards.map((pc) => {
              const tooWeak =
                state.current_power !== null &&
                !state.is_tiebreak &&
                pc.card.power <= state.current_power;
              return (
                <Card
                  key={pc.id}
                  name={pc.card.name}
                  suit={pc.card.suit}
                  value={pc.card.value}
                  power={pc.card.power}
                  disabled={!canAct || tooWeak}
                  onClick={() => handlePlayCard(pc)}
                />
              );
            })}
          </div>
        )}

        <div className="game-actions">
          <button
            className="btn btn-secondary"
            onClick={onPass}
            disabled={!canAct}
            title="Сбросить все карты и выйти из раунда"
          >
            Сбросить карты
          </button>
          {state.current_power !== null && !state.is_tiebreak && (
            <span className="hint">
              Нужна карта сильнее {state.current_power}
            </span>
          )}
        </div>
      </div>

      {isFinished && (
        <div className="result-overlay">
          <div className="result-box">
            <h2>Партия окончена</h2>
            <p>
              Победитель:{" "}
              <strong>{state.winner_nickname ?? "нет победителя"}</strong>
            </p>
            <ul>
              {allPlayers
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <li key={p.id}>
                    <span>{p.nickname}</span>
                    <span className="score">★ {p.score}</span>
                  </li>
                ))}
            </ul>
            <div className="waiting-actions">
              <button className="btn btn-primary" onClick={onStartRound}>
                Новая игра
              </button>
              <button className="btn btn-secondary" onClick={onDisconnect}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
