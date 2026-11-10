import { useState } from "react";
import type { GameState } from "../types";

interface WaitingRoomProps {
  state: GameState;
  lastResult: string | null;
  onReady: () => void;
  onSetBet: (bet: number) => void;
  onStart: () => void;
  onLeave: () => void;
}

const DEFAULT_BET = 100;

export function WaitingRoom({ state, lastResult, onReady, onSetBet, onStart, onLeave }: WaitingRoomProps) {
  const me = state.player;
  const [bet, setBet] = useState<number>(me.bet || DEFAULT_BET);

  const everyone = [me, ...state.other_players];
  const online = everyone.filter((p) => p.connected);
  const finished = state.session_status === "finished";

  return (
    <div className="waiting-screen">
      <div className="waiting-box">
        <h2>{finished ? "Игра окончена" : "Ожидание игроков"}</h2>
        <p>
          Код комнаты: <strong>{state.join_code}</strong>
        </p>
        <p>
          Игроков в сети: {online.length} / {state.max_players}
          {state.games_played > 0 && <> · Сыграно партий: {state.games_played}</>}
        </p>

        {lastResult && <div className="result-banner">{lastResult}</div>}
        {finished && (
          <div className="result-banner">
            {state.winner_nickname ? `🏆 Победитель: ${state.winner_nickname}` : "Средств ни у кого не осталось"}
          </div>
        )}

        <ul className="player-list">
          {everyone.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className="pl-name">
                {p.is_ready ? "✓" : "○"} {p.nickname}
                {p.id === me.id && " (ты)"}
              </span>
              <span className="pl-stats">
                ★ {p.score} · ставка {p.bet || DEFAULT_BET}
                {!p.connected && " · не в сети"}
              </span>
            </li>
          ))}
        </ul>

        {!finished && (
          <>
            <div className="bet-row">
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.min(10000, me.score))}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
              />
              <button
                className="btn btn-secondary"
                disabled={!(bet >= 1 && bet <= 10000)}
                onClick={() => onSetBet(Math.floor(bet))}
              >
                Поставить
              </button>
            </div>
            {me.score === 0 && <p className="hint">У тебя нет средств — в партию тебя не возьмут</p>}

            <div className="button-row">
              <button className="btn btn-secondary" onClick={onReady} disabled={me.is_ready}>
                {me.is_ready ? "Готов ✓" : "Готов"}
              </button>
              <button
                className="btn btn-primary"
                onClick={onStart}
                disabled={online.length < 2}
                title={online.length < 2 ? "Нужно минимум 2 игрока в сети" : ""}
              >
                {state.games_played > 0 ? "Следующая партия" : "Начать игру"}
              </button>
            </div>
          </>
        )}

        <button className="btn btn-secondary" onClick={onLeave}>
          {finished ? "В лобби" : "Выйти"}
        </button>
      </div>
    </div>
  );
}
