import { useEffect, useMemo, useRef, useState } from "react";
import { playJingleBells } from "../jingleBells";
import { Snowfall } from "./Snowfall";

/** Режимы мигания гирлянды */
const MODES = [
  { id: "chase", label: "Бегущие огни" },
  { id: "alternate", label: "Через одну" },
  { id: "all", label: "Все разом" },
  { id: "twinkle", label: "Мерцание" },
  { id: "steady", label: "Без мигания" },
] as const;
type Mode = (typeof MODES)[number]["id"];

const COLORS = ["#ff3b3b", "#ffd23b", "#3bff6e", "#3bc8ff", "#d23bff"];
const BULBS = 36;
const SWAGS = 4; // сколько провисаний провода
const SAG = 26; // глубина провисания, px

const STORAGE_KEY = "garland";

function loadSettings(): { on: boolean; mode: Mode } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (MODES.some((m) => m.id === s.mode)) return { on: !!s.on, mode: s.mode };
    }
  } catch {
    // хранилище недоступно — берём умолчания
  }
  return { on: true, mode: "chase" };
}

function saveSettings(on: boolean, mode: Mode) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ on, mode }));
  } catch {
    // не критично
  }
}

/** Провисание провода в точке t ∈ [0,1] внутри одного пролёта */
function sag(t: number) {
  return 4 * SAG * t * (1 - t);
}

/** Мигающая гирлянда над игровым полем с кнопками вкл/выкл и смены режима */
export function Garland() {
  const initial = useMemo(loadSettings, []);
  const [on, setOn] = useState(initial.on);
  const [mode, setMode] = useState<Mode>(initial.mode);

  const bulbs = useMemo(
    () =>
      Array.from({ length: BULBS }, (_, i) => {
        const x = (i + 0.5) / BULBS; // 0..1 по ширине
        const local = (x * SWAGS) % 1;
        return {
          left: x * 100,
          top: sag(local),
          color: COLORS[i % COLORS.length],
          // для мерцания — случайные фаза и период
          twDelay: -Math.random() * 2,
          twDur: 0.6 + Math.random() * 1.4,
        };
      }),
    []
  );

  // Провод: по одной параболе на пролёт (координаты в процентах ширины)
  const wire = useMemo(() => {
    const step = 100 / SWAGS;
    let d = "M0 0";
    for (let k = 0; k < SWAGS; k++) {
      const x0 = k * step;
      d += ` Q${x0 + step / 2} ${SAG * 2} ${x0 + step} 0`;
    }
    return d;
  }, []);

  function toggle() {
    setOn((v) => {
      saveSettings(!v, mode);
      return !v;
    });
  }

  function nextMode() {
    const idx = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(idx + 1) % MODES.length].id;
    setMode(next);
    saveSettings(on, next);
    if (!on) {
      setOn(true);
      saveSettings(true, next);
    }
  }

  // Песня «Jingle Bells» (~30 с)
  const [playing, setPlaying] = useState(false);
  const stopSong = useRef<(() => void) | null>(null);

  useEffect(() => () => stopSong.current?.(), []);

  function toggleSong() {
    if (stopSong.current) {
      stopSong.current();
      return;
    }
    setPlaying(true);
    stopSong.current = playJingleBells(() => {
      stopSong.current = null;
      setPlaying(false);
    });
  }

  const [snow, setSnow] = useState(false);

  const modeLabel = MODES.find((m) => m.id === mode)?.label;

  return (
    <div className={`garland garland-${mode} ${on ? "garland-on" : "garland-off"}`}>
      <div className="garland-strip" aria-hidden="true">
        <svg className="garland-wire" viewBox={`0 0 100 ${SAG + 4}`} preserveAspectRatio="none">
          <path d={wire} vectorEffect="non-scaling-stroke" />
        </svg>
        {bulbs.map((b, i) => (
          <span
            key={i}
            className={`garland-bulb ${i % 2 ? "odd" : "even"}`}
            style={
              {
                left: `${b.left}%`,
                top: `${b.top}px`,
                "--c": b.color,
                "--i": i,
                "--tw-delay": `${b.twDelay}s`,
                "--tw-dur": `${b.twDur}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="garland-controls">
        <button
          type="button"
          className="garland-btn"
          onClick={toggle}
          title={on ? "Выключить гирлянду" : "Включить гирлянду"}
        >
          {on ? "💡 Выкл" : "💡 Вкл"}
        </button>
        <button
          type="button"
          className="garland-btn"
          onClick={nextMode}
          title="Сменить режим мигания"
        >
          ✨ {modeLabel}
        </button>
        <button
          type="button"
          className={`garland-btn ${playing ? "garland-btn-active" : ""}`}
          onClick={toggleSong}
          title={playing ? "Остановить песню" : "Сыграть Jingle Bells"}
        >
          {playing ? "⏹ Стоп" : "🔔 Jingle Bells"}
        </button>
        <button
          type="button"
          className={`garland-btn ${snow ? "garland-btn-snow" : ""}`}
          onClick={() => setSnow((v) => !v)}
          title={snow ? "Остановить снегопад" : "Включить снегопад"}
        >
          {snow ? "❄️ Хватит снега" : "❄️ Снег"}
        </button>
      </div>
      {snow && <Snowfall />}
    </div>
  );
}
