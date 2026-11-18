import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiscardPile } from "./DiscardPile";
import { Card } from "./Card";
import { CoinPile } from "./CoinPile";
import { PoleDancer } from "./PoleDancer";
import { Garland } from "./Garland";
import type { GameState, Player, PlayerCard } from "../types";

interface GameTableProps {
  state: GameState;
  onFlip: () => void;
  onShuffle: () => void;
  onStartRound: () => void;
  onDisconnect: () => void;
  lastRound?: LastRound | null;
}

export interface LastRound {
  winner: string | null;
  winnerId: number | null;
  bank: number;
}

/** Сколько секунд карты раунда лежат на столе (как NEXT_ROUND_DELAY на сервере) */
const NEXT_ROUND_DELAY = 4;
/** Через сколько мс после конца раунда карты улетают в биту и сколько летят */
const COLLECT_AFTER_MS = 2200;
const COLLECT_FLIGHT_MS = 800;
/** Карты улетают по одной с этим интервалом */
const COLLECT_STAGGER_MS = 110;
/** Полёт монет из банка к победителю */
const COIN_FLIGHT_MS = 900;
const COIN_STAGGER_MS = 55;

interface FlyingCoins {
  from: { x: number; y: number };
  coins: { dx: number; dy: number; arc: number; delay: number; spin: number }[];
  to: { x: number; y: number };
  landAt: number;
}

function coinCountFor(bank: number): number {
  if (bank <= 0) return 0;
  return Math.min(14, Math.max(5, Math.round(3 * Math.log2(bank / 25 + 1))));
}

type CollectPhase = "none" | "measure" | "flying" | "done";

export function GameTable({
  state,
  onFlip,
  onShuffle,
  onStartRound,
  onDisconnect,
  lastRound,
}: GameTableProps) {
  const myPlayer = state.player;
  const isFinished = state.session_status === "finished";
  const roundActive = state.round_status === "active" && !isFinished;
  const contenders = new Set(state.flip_contenders ?? []);
  const flipped = new Set(state.flipped_ids ?? []);
  const iAmIn = contenders.has(myPlayer.id);
  const iFlipped = flipped.has(myPlayer.id);
  // Очереди нет: открыть карту может любой участник, кто ещё не открыл
  const canFlip =
    roundActive && iAmIn && !iFlipped && !myPlayer.folded && myPlayer.cards_left > 0;

  const [shuffling, setShuffling] = useState(false);
  function handleShuffle() {
    if (myPlayer.cards_left < 2 || shuffling) return;
    onShuffle();
    setShuffling(true);
    window.setTimeout(() => setShuffling(false), 600);
  }

  function handleFlip() {
    if (canFlip && !shuffling) onFlip();
  }
  // Раунд закрыт, банк выплачен, а партия продолжается: карты лежат на
  // столе, сервер сам раздаст новый раунд через NEXT_ROUND_DELAY секунд
  const isRoundOver =
    !isFinished &&
    state.round_status === "finished" &&
    !state.is_tiebreak &&
    state.current_player_id === null;

  const [countdown, setCountdown] = useState(NEXT_ROUND_DELAY);
  // Сервер раздаёт сам; кнопка «Раздать» — только если он не справился
  // за разумное время (иначе она мелькала бы на каждом раунде)
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!isRoundOver) return;
    setCountdown(NEXT_ROUND_DELAY);
    setStalled(false);
    const t = window.setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    const s = window.setTimeout(() => setStalled(true), NEXT_ROUND_DELAY * 1000 + 3000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, [isRoundOver, state.round_number]);

  // Конец раунда: карты лежат на столе, потом улетают в биту справа
  const [collect, setCollect] = useState<CollectPhase>("none");
  const [flyTo, setFlyTo] = useState<Map<number, React.CSSProperties>>(new Map());
  const cardEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const pileRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const [flyingCoins, setFlyingCoins] = useState<FlyingCoins | null>(null);
  const [coinsLanded, setCoinsLanded] = useState(false);
  const tableCountRef = useRef(0);
  tableCountRef.current = state.table_cards.length;

  useEffect(() => {
    if (!isRoundOver) {
      setCollect("none");
      setFlyingCoins(null);
      setCoinsLanded(false);
      return;
    }
    const n = Math.max(tableCountRef.current, 1);
    const t1 = window.setTimeout(() => setCollect("measure"), COLLECT_AFTER_MS);
    const t2 = window.setTimeout(
      () => setCollect("done"),
      COLLECT_AFTER_MS + COLLECT_FLIGHT_MS + COLLECT_STAGGER_MS * (n - 1) + 80
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isRoundOver, state.round_number]);

  // Перед полётом меряем, куда лететь каждой карте: в центр стопки биты
  useLayoutEffect(() => {
    if (collect !== "measure") return;
    const pile = pileRef.current?.getBoundingClientRect();
    const next = new Map<number, React.CSSProperties>();
    if (pile) {
      const px = pile.left + pile.width / 2;
      const py = pile.top + pile.height / 2;
      tableCards.forEach((pc, i) => {
        const el = cardEls.current.get(pc.id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        next.set(pc.id, {
          "--bx": `${px - (r.left + r.width / 2)}px`,
          "--by": `${py - (r.top + r.height / 2)}px`,
          "--br": `${((pc.id * 37) % 30) - 15}deg`,
          "--delay": `${i * COLLECT_STAGGER_MS}ms`,
          "--dur": `${COLLECT_FLIGHT_MS}ms`,
        } as React.CSSProperties);
      });
    }
    setFlyTo(next);

    // Монеты банка летят к аватару победителя
    const bank = lastRound?.bank ?? 0;
    const stage = bankRef.current?.querySelector(".coin-stage")?.getBoundingClientRect();
    const avatar =
      lastRound?.winnerId != null
        ? document
            .querySelector(`[data-avatar-id="${lastRound.winnerId}"]`)
            ?.getBoundingClientRect()
        : undefined;
    if (bank > 0 && stage && avatar) {
      const from = { x: stage.left + stage.width / 2, y: stage.top + stage.height * 0.8 };
      const to = { x: avatar.left + avatar.width / 2, y: avatar.top + avatar.height / 2 };
      const n = coinCountFor(bank);
      const coins = Array.from({ length: n }, (_, i) => ({
        dx: to.x - from.x + (((i * 29) % 13) - 6),
        dy: to.y - from.y + (((i * 17) % 9) - 4),
        // Дуга: монеты подлетают вверх (к игроку снизу — повыше)
        arc: -60 - ((i * 23) % 50) - (to.y > from.y ? 40 : 0),
        delay: i * COIN_STAGGER_MS,
        spin: ((i * 41) % 2 ? 1 : -1) * (360 + ((i * 53) % 360)),
      }));
      setFlyingCoins({ from, to, coins, landAt: COIN_FLIGHT_MS + COIN_STAGGER_MS * (n - 1) });
    }

    // Кадр паузы: браузер фиксирует исходное положение, и transition срабатывает
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCollect("flying"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [collect]);

  // Карты раунда, которые ещё лежат на столе, в биту не считаем
  const roundClosed = state.round_status === "finished";
  const cardsStillOnTable = roundClosed && collect !== "done" ? state.table_cards.length : 0;
  const discardShown = Math.max((state.discard_count ?? 0) - cardsStillOnTable, 0);
  const hideTableCards = isRoundOver && collect === "done";

  // Карты победителя раунда подсвечиваем, пока они лежат на столе
  const winnerId = isRoundOver ? lastRound?.winnerId ?? null : null;

  // Банк лежит на столе, пока монеты не полетели к победителю
  const coinsGone = collect === "flying" || collect === "done";
  const bankShown = isRoundOver ? (coinsGone ? 0 : lastRound?.bank ?? 0) : state.ante;

  useEffect(() => {
    if (!flyingCoins) return;
    const t = window.setTimeout(() => setCoinsLanded(true), flyingCoins.landAt);
    return () => clearTimeout(t);
  }, [flyingCoins]);
  const winnerCardId =
    winnerId === null
      ? null
      : state.table_cards
          .filter((pc) => pc.player_id === winnerId)
          .reduce<PlayerCard | null>(
            (best, pc) => (!best || pc.card.power > best.card.power ? pc : best),
            null
          )?.id ?? null;

  // Сервер присылает карты стола от новой к старой. Показываем по порядку
  // выкладывания: новая карта встаёт справа и не сдвигает уже лежащие
  const tableCards = [...state.table_cards].reverse();

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

  const tableCardStyles = tableCards.map(flyStyle);
  tableSeeded.current = true;

  return (
    <div className="game-table">
      <Garland />

      {flyingCoins && isRoundOver && (
        <div className="coin-flight" aria-hidden="true">
          {flyingCoins.coins.map((c, i) => (
            <span
              key={i}
              className="flying-coin"
              style={
                {
                  left: `${flyingCoins.from.x}px`,
                  top: `${flyingCoins.from.y}px`,
                  "--dx": `${c.dx}px`,
                  "--dy": `${c.dy}px`,
                  "--arc": `${c.arc}px`,
                  "--spin": `${c.spin}deg`,
                  "--delay": `${c.delay}ms`,
                  "--dur": `${COIN_FLIGHT_MS}ms`,
                } as React.CSSProperties
              }
            />
          ))}
          {coinsLanded && (
            <span
              className="coin-win-gain"
              style={{ left: `${flyingCoins.to.x}px`, top: `${flyingCoins.to.y}px` }}
            >
              +{lastRound?.bank}
            </span>
          )}
        </div>
      )}
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
              roundActive && contenders.has(p.id) && !flipped.has(p.id)
                ? "active-turn"
                : "",
              p.connected ? "" : "offline",
              p.folded ? "folded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className={
                coinsLanded && winnerId === p.id ? "avatar avatar-win" : "avatar"
              }
              data-avatar-id={p.id}
            >
              {p.nickname[0]?.toUpperCase()}
            </div>
            <div className="player-meta">
              <span className="name">
                {p.nickname} {p.is_ready && "✓"}
              </span>
              <span className="score">
                ★ {p.score} · ставка {p.bet}
              </span>
              <span className="cards-left">
                {p.folded
                  ? "выбыл"
                  : !roundActive
                    ? `карт: ${p.cards_left}`
                    : flipped.has(p.id)
                      ? "✓ открыл карту"
                      : contenders.has(p.id)
                        ? "думает…"
                        : "ждёт переигровку"}
                {!p.connected && " · нет связи"}
              </span>
            </div>
            {/* Стопка соперника рубашкой вверх — как у основного игрока */}
            <div
              className={[
                "opp-stack",
                roundActive && contenders.has(p.id) && !flipped.has(p.id) ? "can-flip" : "",
                p.cards_left === 0 ? "empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={`Карт в стопке: ${p.cards_left}`}
              aria-label={`Стопка ${p.nickname}: ${p.cards_left} карт`}
            >
              {Array.from({ length: Math.min(p.cards_left, 6) }).map((_, i, arr) => (
                <span
                  key={i}
                  className="card card-back stack-layer"
                  style={{ "--layer": arr.length - 1 - i } as React.CSSProperties}
                />
              ))}
              <span className="stack-count">{p.cards_left}</span>
            </div>
            {roundActive && contenders.has(p.id) && !flipped.has(p.id) && (
              <span className="turn-dot" title="Ещё не открыл карту" />
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
          {/* Две колонки фиксированной ширины: слева раунд, итог и банк,
              справа карты. Размеры зарезервированы — вёрстка не прыгает */}
          <div className="table-row">
            <div className="table-side">
              <div className="table-info">
                <span className="round-info">Раунд {state.round_number || 1}</span>
                {roundActive && state.current_power !== null && (
                  <span className="round-info">
                    Старшая: {state.current_power}
                  </span>
                )}
              </div>

              <div className="round-status" role="status">
                {isRoundOver ? (
                  <div className="round-result">
                    <span className="round-result-line">
                      {lastRound?.winner ? (
                        <>
                          🏆 <strong>{lastRound.winner}</strong> забирает{" "}
                          <strong>{lastRound.bank}</strong>
                        </>
                      ) : (
                        "Банк никому не достался"
                      )}
                    </span>
                    {countdown > 0 ? (
                      <span className="round-countdown">
                        Новый раунд через <strong>{countdown}</strong>…
                      </span>
                    ) : !stalled ? (
                      <span className="round-countdown">Раздаём…</span>
                    ) : (
                      // Запасной путь, если сервер не смог раздать сам
                      <button className="btn btn-primary btn-small" onClick={onStartRound}>
                        Раздать
                      </button>
                    )}
                  </div>
                ) : state.is_tiebreak && roundActive ? (
                  <p className="tiebreak-note">
                    Переигровка: открывают{" "}
                    {[...contenders].map((id) => nicknameById.get(id)).join(", ")}
                  </p>
                ) : null}
              </div>

              <div ref={bankRef} className="table-bank">
                <CoinPile amount={bankShown} />
              </div>
            </div>

            <div className="table-cards-slot">
          {state.table_cards.length > 0 && !hideTableCards ? (
            <div className="played-cards">
              {tableCards.map((pc, i) => (
                <div
                  key={pc.id}
                  ref={(el) => {
                    if (el) cardEls.current.set(pc.id, el);
                    else cardEls.current.delete(pc.id);
                  }}
                  className={
                    collect === "flying" && isRoundOver
                      ? "played-card to-bita"
                      : tableCardStyles[i]
                        ? "played-card fly-in"
                        : "played-card"
                  }
                  style={
                    collect === "flying" && isRoundOver
                      ? flyTo.get(pc.id)
                      : tableCardStyles[i] ?? undefined
                  }
                >
                  <Card
                    name={pc.card.name}
                    suit={pc.card.suit}
                    value={pc.card.value}
                    power={pc.card.power}
                    highlight={
                      isRoundOver
                        ? pc.id === winnerCardId
                        : pc.player_id === state.leader_player_id
                    }
                  />
                  <span className="played-owner">
                    {pc.player_id ? nicknameById.get(pc.player_id) : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : hideTableCards ? (
            <p className="waiting">Карты ушли в биту</p>
          ) : (
            <p className="waiting">
              {isFinished ? "Партия окончена" : "Стол пуст — открой верхнюю карту стопки"}
            </p>
          )}
            </div>
          </div>
        </div>

        <DiscardPile ref={pileRef} count={discardShown} />
      </div>

      {/* Низ: мой игрок + рука */}
      <div className="bottom-area">
        <div className="my-player">
          <div
            className={
              coinsLanded && winnerId === myPlayer.id
                ? "avatar primary avatar-win"
                : "avatar primary"
            }
            data-avatar-id={myPlayer.id}
          >
            {myPlayer.nickname[0]?.toUpperCase()}
          </div>
          <div className="player-meta">
            <span className="name">{myPlayer.nickname}</span>
            <span className="score">
              ★ {myPlayer.score} · ставка {myPlayer.bet} · карт:{" "}
              {myPlayer.cards_left}
            </span>
          </div>
          {canFlip && <span className="turn-badge">Открой карту!</span>}
          {roundActive && iFlipped && (
            <span className="waiting-turn">Ждём остальных…</span>
          )}
          {roundActive && !iAmIn && !myPlayer.folded && (
            <span className="waiting-turn">Переигровка без тебя…</span>
          )}
          {myPlayer.folded && <span className="waiting-turn">Ты выбыл из раунда</span>}
        </div>

        <div className="deck-area">
          {myPlayer.cards_left > 0 ? (
            <button
              type="button"
              className={[
                "card-stack",
                canFlip ? "can-flip" : "",
                shuffling ? "shuffling" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={handleFlip}
              disabled={!canFlip}
              title={canFlip ? "Открыть верхнюю карту" : "Сейчас открывать нельзя"}
              aria-label={`Стопка: ${myPlayer.cards_left} карт рубашкой вверх`}
            >
              {Array.from({ length: Math.min(myPlayer.cards_left, 6) }).map((_, i, arr) => (
                <span
                  key={i}
                  className="card card-back stack-layer"
                  style={{ "--layer": arr.length - 1 - i } as React.CSSProperties}
                />
              ))}
              <span className="stack-count">{myPlayer.cards_left}</span>
            </button>
          ) : (
            <p className="waiting">Карт в стопке нет</p>
          )}

          <button
            type="button"
            className="btn btn-secondary shuffle-btn"
            onClick={handleShuffle}
            disabled={myPlayer.cards_left < 2 || shuffling || isFinished}
            title="Перемешать свою стопку"
          >
            🔀 Перемешать
          </button>
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
