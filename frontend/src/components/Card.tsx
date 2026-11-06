interface CardProps {
  name: string;
  suit: string | null;
  value: string;
  power: number;
  onClick?: () => void;
  faceDown?: boolean;
}

export function Card({ name, suit, value, power, onClick, faceDown }: CardProps) {
  if (faceDown) {
    return <div className="card card-back" title={name} />;
  }

  const suitColor = suit === "hearts" || suit === "diamonds" ? "red" : "black";
  const suitSymbol = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  }[suit || ""] || "•";

  return (
    <div
      className={`card ${suitColor}`}
      onClick={onClick}
      title={`${name} (сила: ${power})`}
    >
      <span className="card-value">{value}</span>
      <span className="card-suit">{suitSymbol}</span>
    </div>
  );
}
