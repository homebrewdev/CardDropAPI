import { useRef, useState } from "react";
import { AvatarCropper } from "./AvatarCropper";

/** Внутренний диаметр кружка в CSS-пикселях: 64 (.avatar-picker) минус рамка 2+2 */
const CIRCLE = 60;
const STORAGE_KEY = "carddrop.avatar";

export function loadAvatar(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveAvatar(dataUrl: string) {
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    // хранилище недоступно — аватарка останется только до перезагрузки
  }
}

/** Аватарка игрока на главном окне. Без картинки — силуэт и «+» внизу;
 *  «+» (или клик по кружку) открывает системный выбор файла. */
export function AvatarPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(loadAvatar);
  const [error, setError] = useState<string | null>(null);
  // Выбранный файл открывается в окне выбора области
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы повторный выбор того же файла снова срабатывал
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Это не картинка");
      return;
    }
    // Проверяем, что браузер умеет её прочитать, и открываем выбор области
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setError(null);
      setCropSrc(url);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Это не картинка");
    };
    probe.src = url;
  }

  function handleCropSave(dataUrl: string) {
    setSrc(dataUrl);
    saveAvatar(dataUrl); // на сервер уйдёт при входе в комнату (App.tsx)
    closeCropper();
  }

  const open = () => inputRef.current?.click();

  return (
    <div className="avatar-picker">
      <button
        type="button"
        className="avatar-picker-circle"
        onClick={open}
        title={src ? "Сменить аватарку" : "Выбрать аватарку"}
        aria-label={src ? "Сменить аватарку" : "Выбрать аватарку"}
      >
        {src ? (
          <img src={src} alt="" />
        ) : (
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="24" r="12" />
            <path d="M10 58c2-12 11-19 22-19s20 7 22 19z" />
          </svg>
        )}
      </button>
      {!src && (
        <button
          type="button"
          className="avatar-picker-add"
          onClick={open}
          tabIndex={-1}
          aria-hidden="true"
        >
          +
        </button>
      )}
      {error && <span className="avatar-picker-error">{error}</span>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      {cropSrc && (
        <AvatarCropper
          src={cropSrc}
          outputSize={CIRCLE}
          onCancel={closeCropper}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
}
