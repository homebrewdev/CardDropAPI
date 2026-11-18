/** Маленькая стопка монет — значок баланса игрока (в стиле монет банка) */
export function CoinIcon() {
  return (
    <span className="coin-icon" aria-label="монеты" role="img">
      <span className="coin-icon-coin" />
      <span className="coin-icon-coin" />
      <span className="coin-icon-coin" />
    </span>
  );
}
