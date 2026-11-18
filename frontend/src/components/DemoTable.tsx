import { Card } from "./Card";

// Тестовая раздача для фона: фиксированная, чтобы карты не прыгали
// при каждом ререндере. Это просто декорация, с сервером не связана.
const DEMO_HAND: { value: string; suit: string }[] = [
  { value: "2", suit: "clubs" },
  { value: "5", suit: "hearts" },
  { value: "7", suit: "spades" },
  { value: "8", suit: "diamonds" },
  { value: "9", suit: "clubs" },
  { value: "10", suit: "hearts" },
  { value: "J", suit: "spades" },
  { value: "Q", suit: "diamonds" },
  { value: "Q", suit: "hearts" },
  { value: "K", suit: "clubs" },
  { value: "K", suit: "spades" },
  { value: "A", suit: "diamonds" },
  { value: "A", suit: "hearts" },
];

const DEMO_TABLE: { value: string; suit: string }[] = [
  { value: "6", suit: "spades" },
  { value: "J", suit: "hearts" },
  { value: "A", suit: "clubs" },
];

const OPPONENT_CARDS = 13;

export function DemoTable() {
  const mid = (DEMO_HAND.length - 1) / 2;

  return (
    <div className="lobby-bg" aria-hidden="true">
      <div className="demo-opponents">
        {[0, 1].map((seat) => (
          <div className="demo-opponent" key={seat}>
            {Array.from({ length: OPPONENT_CARDS }, (_, i) => (
              <Card key={i} name="" suit={null} value="" power={0} faceDown />
            ))}
          </div>
        ))}
      </div>

      <div className="demo-table-cards">
        {DEMO_TABLE.map((c, i) => (
          <div className="demo-table-card" key={i} style={{ "--i": i } as React.CSSProperties}>
            <Card name="" suit={c.suit} value={c.value} power={0} disabled />
          </div>
        ))}
      </div>

      <div className="demo-hand">
        {DEMO_HAND.map((c, i) => (
          <div
            className="demo-hand-card"
            key={i}
            style={{ "--offset": i - mid } as React.CSSProperties}
          >
            <Card name="" suit={c.suit} value={c.value} power={0} disabled />
          </div>
        ))}
      </div>
    </div>
  );
}
