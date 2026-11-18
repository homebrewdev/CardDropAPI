import { forwardRef } from "react";

interface DiscardPileProps {
  count: number;
}

/** Бита: сыгранные карты партии, сложенные стопкой рубашкой вверх */
export const DiscardPile = forwardRef<HTMLDivElement, DiscardPileProps>(
  function DiscardPile({ count }, ref) {
    // Толщина стопки растёт с числом карт, но не бесконечно
    const layers = count === 0 ? 0 : Math.min(Math.ceil(count / 2), 10);
    return (
      <div className="discard-pile" title={`Бита: ${count} карт`}>
        <div className="discard-stack" ref={ref}>
          {layers === 0 && <span className="discard-empty" />}
          {Array.from({ length: layers }).map((_, i) => (
            <span
              key={i}
              className="card card-back discard-layer"
              style={
                {
                  "--layer": i,
                  "--tilt": `${((i * 53) % 9) - 4}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <span className="discard-label">
          Бита <strong key={count}>{count}</strong>
        </span>
      </div>
    );
  }
);
