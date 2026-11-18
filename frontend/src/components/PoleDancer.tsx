import { useEffect, useRef, useState } from "react";

interface Bill {
  id: number;
  x: number; // старт по горизонтали, % ширины
  drift: number; // снос вбок к концу падения, px
  rot: number; // итоговый поворот, deg
  delay: number; // мс
  dur: number; // мс
}

const BILLS_PER_TOSS = 16;
const MAX_BILLS = 120;

interface PoleDancerProps {
  side: "left" | "right";
}

/** Декорация стола: неоновый силуэт танцовщицы на шесте.
 *  Сама танцовщица клики пропускает; рядом кнопка-монетка,
 *  которая осыпает её купюрами. */
export function PoleDancer({ side }: PoleDancerProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function tossBills() {
    const batch: Bill[] = Array.from({ length: BILLS_PER_TOSS }, () => ({
      id: nextId.current++,
      x: 20 + Math.random() * 60,
      drift: (Math.random() - 0.5) * 120,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.random() * 350,
      dur: 1300 + Math.random() * 900,
    }));
    setBills((prev) => [...prev, ...batch].slice(-MAX_BILLS));
    const ids = new Set(batch.map((b) => b.id));
    const longest = Math.max(...batch.map((b) => b.delay + b.dur));
    const t = window.setTimeout(() => {
      setBills((prev) => prev.filter((b) => !ids.has(b.id)));
    }, longest + 1200);
    timers.current.push(t);
  }

  return (
    <>
    <button
      type="button"
      className={`pd-tip-btn pd-tip-${side}`}
      onClick={tossBills}
      title="Кинуть денег"
      aria-label="Кинуть денег танцовщице"
    >
      <span className="pd-tip-dollar">$</span>
    </button>
    <div className={`pole-dancer pole-${side}`} aria-hidden="true">
      <div className="pd-bills">
        {bills.map((b) => (
          <span
            key={b.id}
            className="pd-bill"
            style={
              {
                left: `${b.x}%`,
                "--drift": `${b.drift}px`,
                "--rot": `${b.rot}deg`,
                animationDelay: `${b.delay}ms`,
                animationDuration: `${b.dur}ms`,
              } as React.CSSProperties
            }
          >
            $
          </span>
        ))}
      </div>
      <svg viewBox="0 0 160 440" preserveAspectRatio="xMidYMax meet">
        {/* Луч прожектора */}
        <polygon className="pd-spot" points="68,0 92,0 150,420 10,420" />

        {/* Сцена */}
        <ellipse className="pd-stage-glow" cx="80" cy="418" rx="70" ry="14" />
        <ellipse className="pd-stage" cx="80" cy="414" rx="56" ry="9" />

        {/* Шест */}
        <rect className="pd-pole" x="77" y="0" width="6" height="414" rx="3" />
        <rect className="pd-pole-shine" x="78.2" y="0" width="1.4" height="414" />

        {/* Танцовщица: внешняя группа скользит по шесту, внутренняя вращается вокруг него */}
        <g className="pd-slide">
          <g className="pd-spin">
            {/* Рука, держащаяся за шест */}
            <path className="pd-limb" d="M97 152 L88 128 L82 104" />
            {/* Свободная рука */}
            <g className="pd-arm">
              <path className="pd-limb" d="M104 154 L122 146 L138 128" />
            </g>
            {/* Волосы */}
            <path className="pd-body" d="M92 128 q-2 -18 12 -20 q14 0 12 16 q8 18 2 34 q-6 -12 -10 -16 z" />
            {/* Голова */}
            <circle className="pd-body" cx="104" cy="126" r="10" />
            {/* Новогодняя шапочка: колпак свисает назад, помпон на кончике */}
            <g className="pd-hat">
              <path className="pd-hat-cap" d="M94 118 Q96 104 108 101 Q118 100 122 108 Q124 114 128 120 Q120 114 116 116 L115 118 Z" />
              <rect className="pd-hat-fur" x="92.5" y="115.5" width="24" height="5" rx="2.5" />
              <circle className="pd-hat-fur" cx="129" cy="121" r="3.4" />
            </g>
            {/* Шея и тело */}
            <path
              className="pd-body"
              d="M101 135 L107 135 L109 142 Q116 150 112 170 Q108 184 114 200 Q116 212 104 214 L94 212 Q88 204 94 190 Q98 176 94 162 Q90 148 101 142 Z"
            />
            {/* Нога, обхватившая шест */}
            <path className="pd-limb pd-thigh" d="M98 210 L82 236 L84 270" />
            {/* Свободная нога */}
            <g className="pd-leg">
              <path className="pd-limb pd-thigh" d="M108 210 L116 254 L112 300" />
              <path className="pd-limb pd-foot" d="M112 300 L120 306" />
            </g>
          </g>
        </g>
      </svg>
    </div>
    </>
  );
}
