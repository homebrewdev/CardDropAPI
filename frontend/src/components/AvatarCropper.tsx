import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AvatarCropperProps {
  /** objectURL выбранной картинки */
  src: string;
  /** Размер результата в CSS-пикселях (внутренний диаметр кружка аватарки) */
  outputSize: number;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}

/** Окно рамки, в которой картинка двигается и масштабируется под круг */
const VIEW = 280;
/** Диаметр круга выбора внутри окна */
const CIRCLE = 220;
const MAX_ZOOM = 6;

interface View {
  scale: number;
  x: number; // смещение центра картинки от центра круга, px окна
  y: number;
}

/** Выбор области картинки для аватарки: круглая рамка, картинку можно
 *  двигать и масштабировать, справа — предпросмотр в реальном размере. */
export function AvatarCropper({ src, outputSize, onCancel, onSave }: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [limits, setLimits] = useState({ min: 0.01, max: 1 });
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Картинка загружена: по умолчанию круг полностью закрыт картинкой (cover)
  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    imgRef.current = el;
    const cover = CIRCLE / Math.min(w, h);
    // Можно уменьшить, пока картинка целиком не войдёт в круг
    const min = Math.min(cover, CIRCLE / Math.hypot(w, h));
    const max = Math.max(cover * MAX_ZOOM, 1);
    setNatural({ w, h });
    setLimits({ min, max });
    setView({ scale: cover, x: 0, y: 0 });
  }

  /** Не даём увести картинку слишком далеко: край картинки — до края круга */
  function clamp(v: View): View {
    if (!natural) return v;
    const bx = Math.abs(natural.w * v.scale - CIRCLE) / 2;
    const by = Math.abs(natural.h * v.scale - CIRCLE) / 2;
    return {
      scale: v.scale,
      x: Math.max(-bx, Math.min(bx, v.x)),
      y: Math.max(-by, Math.min(by, v.y)),
    };
  }

  function zoomTo(scale: number) {
    const s = Math.max(limits.min, Math.min(limits.max, scale));
    // Масштабируем относительно центра круга
    setView((v) => clamp({ scale: s, x: (v.x * s) / v.scale, y: (v.y * s) / v.scale }));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((v) => clamp({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    zoomTo(view.scale * Math.exp(-e.deltaY * 0.0015));
  }

  // Esc — отмена
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /** Отрисовать область круга в canvas заданного размера */
  function render(canvas: HTMLCanvasElement, size: number) {
    const img = imgRef.current;
    if (!img || !natural) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    const k = size / CIRCLE;
    const dw = natural.w * view.scale * k;
    const dh = natural.h * view.scale * k;
    ctx.drawImage(img, size / 2 + view.x * k - dw / 2, size / 2 + view.y * k - dh / 2, dw, dh);
  }

  // Живой предпросмотр
  useEffect(() => {
    if (previewRef.current) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      render(previewRef.current, Math.round(outputSize * dpr));
    }
  });

  function handleSave() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const canvas = document.createElement("canvas");
    render(canvas, Math.round(outputSize * dpr));
    onSave(canvas.toDataURL("image/png"));
  }

  const imgStyle: React.CSSProperties = natural
    ? {
        width: natural.w * view.scale,
        height: natural.h * view.scale,
        transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
      }
    : { visibility: "hidden" };

  // Ползунок в логарифмической шкале: равные шаги — равное «приближение»
  const logMin = Math.log(limits.min);
  const logMax = Math.log(limits.max);
  const sliderValue = natural ? ((Math.log(view.scale) - logMin) / (logMax - logMin)) * 100 : 0;

  // Портал в body: модалка лобби может создавать свой контекст (анимация,
  // overflow), и fixed-окно внутри неё позиционировалось бы неправильно
  return createPortal(
    <div className="cropper-overlay" role="dialog" aria-modal="true" aria-labelledby="cropper-title">
      <div className="cropper-modal">
        <h2 id="cropper-title">Выбери область аватарки</h2>
        <div className="cropper-body">
          <div
            className="cropper-view"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <img src={src} alt="" draggable={false} onLoad={handleLoad} style={imgStyle} />
            <div className="cropper-mask" style={{ width: CIRCLE, height: CIRCLE }} />
          </div>
          <div className="cropper-side">
            <span className="cropper-preview-label">Так будет видно</span>
            <canvas
              ref={previewRef}
              className="cropper-preview"
              style={{ width: outputSize, height: outputSize }}
            />
          </div>
        </div>
        <label className="cropper-zoom">
          <span aria-hidden="true">−</span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={sliderValue}
            onChange={(e) => zoomTo(Math.exp(logMin + (Number(e.target.value) / 100) * (logMax - logMin)))}
            aria-label="Масштаб"
          />
          <span aria-hidden="true">+</span>
        </label>
        <p className="cropper-hint">Перетащи картинку и выбери масштаб колесом мыши или ползунком</p>
        <div className="cropper-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!natural}>
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
