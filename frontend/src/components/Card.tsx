interface CardProps {
  name: string;
  suit: string | null;
  value: string;
  power: number;
  onClick?: () => void;
  faceDown?: boolean;
  disabled?: boolean;
  highlight?: boolean;
}

export function Card({
  name,
  suit,
  value,
  power,
  onClick,
  faceDown,
  disabled,
  highlight,
}: CardProps) {
  if (faceDown) {
    return <div className="card card-back" title={name} />;
  }

  const suitColor = suit === "hearts" || suit === "diamonds" ? "red" : "black";
  const suitSymbol =
    {
      hearts: "♥",
      diamonds: "♦",
      clubs: "♣",
      spades: "♠",
    }[suit || ""] || "•";

  const className = [
    "card",
    suitColor,
    disabled ? "card-disabled" : "",
    highlight ? "card-leader" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onClick={disabled ? undefined : onClick}
      title={`${name} (сила: ${power})`}
    >
      <span className="card-value">{value}</span>
      <span className="card-suit">{suitSymbol}</span>
    </div>
  );
}
