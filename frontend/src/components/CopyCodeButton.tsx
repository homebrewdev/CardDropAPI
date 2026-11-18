import { useEffect, useState } from "react";

/** Копирование в буфер. navigator.clipboard есть только в защищённом
 *  контексте (https или localhost), поэтому для http по сети — запасной путь. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // пробуем запасной способ ниже
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export function CopyCodeButton({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const t = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [status]);

  async function handleClick() {
    setStatus((await copyText(code)) ? "ok" : "fail");
  }

  const title =
    status === "ok" ? "Скопировано" : status === "fail" ? "Не удалось скопировать" : "Скопировать код комнаты";

  return (
    <button
      type="button"
      className={`copy-btn ${status !== "idle" ? `copy-${status}` : ""}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      {status === "ok" ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      )}
    </button>
  );
}
