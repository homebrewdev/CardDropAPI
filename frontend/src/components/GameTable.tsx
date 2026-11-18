import { useRef } from "react";
import { Card } from "./Card";
import { CoinPile } from "./CoinPile";
import { PoleDancer } from "./PoleDancer";
import { Garland } from "./Garland";
import type { GameState, Player, PlayerCard } from "../types";

interface GameTableProps {
  state: GameState;
  onPlayCard: (playerCardId: number, cardId: number) => void;
  onPass: () => void;
  onStartRound: () => void;
  onDisconnect: () => void;
  lastRound?: { winner: string | null; bank: number } | null;
}

export function GameTable({
  state,
  onPlayCard,
  onPass,
  onStartRound,
  onDisconnect,
  lastRound,
}: GameTableProps) {
  const myPlayer = state.player;
  const isMyTurn = state.current_player_id === myPlayer.id;
  const isFinished = state.session_status === "finished";
  const canAct = isMyTurn && !myPlayer.folded && !isFinished;
  // Раунд закрыт, банк выплачен, а партия продолжается: ход ни у кого,
  // нужна новая раздача
  const isRoundOver =
    !isFinished &&
    state.round_status === "finished" &&
    !state.is_tiebreak &&
    state.current_player_id === null;

  const allPlayers: Player[] = [state.player, ...state.other_players];
  const nicknameById = new Map(allPlayers.map((p) => [p.id, p.nickname]));

  // Анимация вылета карт на стол. Для каждой карты один раз запоминаем,
  // откуда она прилетела; карты, лежавшие на столе при открытии экрана
  // (перезагрузка, переподключение), не анимируем.
  const flyFrom = useRef<Map<number, React.CSSProperties | null>>(new Map());
  const tableSeeded = useRef(false);
  const opponentIds = state.other_players.map((p) => p.id);

  function flyStyle(pc: PlayerCard): React.CSSProperties | null {
    const known = flyFrom.current.get(pc.id);
    if (known !== undefined) return known;

    let style: React.CSSProperties | null = null;
    if (tableSeeded.current) {
      const oppIdx = opponentIds.indexOf(pc.player_id ?? -1);
      const fromMe = pc.player_id === myPlayer.id || oppIdx < 0;
      const n = opponentIds.length;
      const x = fromMe ? 0 : (oppIdx - (n - 1) / 2) * 240;
      const y = fromMe ? 300 : -260;
      const r = ((pc.id * 47) % 50) - 25;
      style = {
        "--fx": `${x}px`,
        "--fy": `${y}px`,
        "--fr": `${r}deg`,
      } as React.CSSProperties;
    }
    flyFrom.current.set(pc.id, style);
    return style;
  }

  const tableCardStyles = state.table_cards.map(flyStyle);
  tableSeeded.current = true;

  function handlePlayCard(pc: PlayerCard) {
    if (!canAct) return;
    onPlayCard(pc.id, pc.card.id);
  }

  return (
    <div className="game-table">
      <Garland />
      <PoleDancer side="left" />
      <PoleDancer side="right" />

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
            {state.current_power !== null && (
              <span className="round-info">
                Старшая сила: {state.current_power}
              </span>
            )}
          </div>

          <CoinPile amount={state.ante} />

          {state.is_tiebreak && (
            <p className="tiebreak-note">Равные карты — переигровка</p>
          )}

          {state.table_cards.length > 0 ? (
            <div className="played-cards">
              {state.table_cards.map((pc, i) => (
                <div
                  key={pc.id}
                  className={tableCardStyles[i] ? "played-card fly-in" : "played-card"}
                  style={tableCardStyles[i] ?? undefined}
                >
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

      {isRoundOver && (
        <div className="result-overlay">
          <div className="result-box">
            <h2>Раунд {state.round_number} окончен</h2>
            {lastRound && (
              <p>
                {lastRound.winner ? (
                  <>
                    Банк <strong>{lastRound.bank}</strong> забирает{" "}
                    <strong>{lastRound.winner}</strong>
                  </>
                ) : (
                  "Банк никому не достался"
                )}
              </p>
            )}
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
                Продолжить
              </button>
              <button className="btn btn-secondary" onClick={onDisconnect}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

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
