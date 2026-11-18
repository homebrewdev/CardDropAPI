import { useEffect, useRef, useState } from "react";

interface CoinPileProps {
  amount: number;
  label?: string;
}

interface Coin {
  id: number;
  stack: number;
  level: number;
  jitter: number;
  delay: number;
}

const MAX_COINS = 30;
const DROP_STEP_MS = 70;
// Порядок раскладки по стопкам: средняя растёт быстрее — получается горка
const STACK_PATTERN = [1, 0, 1, 2];
const STACK_X = [-20, 0, 20];

/** Сколько монет рисовать: логарифмическая шкала, ставки бывают от 1 до 10000 */
function coinsFor(amount: number): number {
  if (amount <= 0) return 0;
  return Math.min(MAX_COINS, Math.max(1, Math.round(4 * Math.log2(amount / 25 + 1))));
}

function makeCoin(i: number, delayIdx: number, levels: number[]): Coin {
  const stack = STACK_PATTERN[i % STACK_PATTERN.length];
  const level = levels[stack]++;
  return {
    id: i,
    stack,
    level,
    jitter: ((i * 37) % 7) - 3,
    delay: delayIdx * DROP_STEP_MS,
  };
}

export function CoinPile({ amount, label = "Банк" }: CoinPileProps) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [gain, setGain] = useState<{ value: number; key: number } | null>(null);
  const prevAmount = useRef(0);

  useEffect(() => {
    const target = coinsFor(amount);
    setCoins((cur) => {
      if (target <= cur.length) return cur.slice(0, target);
      // Новые монеты дописываются сверху; уже лежащие не перемонтируются,
      // поэтому анимация падения проигрывается только у добавленных
      const levels = [0, 0, 0];
      for (const c of cur) levels[c.stack] = Math.max(levels[c.stack], c.level + 1);
      const added: Coin[] = [];
      for (let i = cur.length; i < target; i++) {
        added.push(makeCoin(i, i - cur.length, levels));
      }
      return [...cur, ...added];
    });

    const diff = amount - prevAmount.current;
    if (diff > 0) setGain({ value: diff, key: Date.now() });
    prevAmount.current = amount;
  }, [amount]);

  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1400);
    return () => clearTimeout(t);
  }, [gain]);

  return (
    <div className="coin-pile" aria-label={`${label}: ${amount}`}>
      <div className="coin-stage">
        {coins.map((c) => (
          <span
            key={c.id}
            className="coin"
            style={
              {
                "--x": `${STACK_X[c.stack] + c.jitter}px`,
                "--y": `${-c.level * 5}px`,
                "--z": c.level * 3 + c.stack,
                animationDelay: `${c.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}
        {gain && (
          <span key={gain.key} className="coin-gain">
            +{gain.value}
          </span>
        )}
      </div>
      <span className="coin-amount">
        {label}: <strong>{amount}</strong>
      </span>
    </div>
  );
}
