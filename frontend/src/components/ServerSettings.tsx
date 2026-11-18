import { useState } from "react";
import { getServerUrl, normalizeServerUrl, pingServer, setServerUrl } from "../server";

/** Строка «⚙ Сервер» на главном окне: адрес игрового сервера.
 *  Нужна в Android-приложении (там нет «своего» сайта) и для игры по
 *  локальной сети: например 192.168.1.10:8000 */
export function ServerSettings() {
  const current = getServerUrl();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current.replace(/^http:\/\//, ""));
  const [status, setStatus] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let url: string;
    try {
      url = normalizeServerUrl(value);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error && err.message.includes("пути") ? err.message : "Неверный адрес" });
      return;
    }
    setBusy(true);
    setStatus({ kind: "info", text: "Проверяю…" });
    const ok = await pingServer(url);
    setBusy(false);
    if (!ok) {
      setStatus({
        kind: "error",
        text: url
          ? "Сервер не отвечает. Проверь IP, порт и что телефон в той же Wi-Fi сети"
          : "Сервер не отвечает",
      });
      return;
    }
    setServerUrl(url);
    // Перезагрузка: заново откроются список комнат и соединения с новым сервером
    window.location.reload();
  }

  function reset() {
    setServerUrl("");
    window.location.reload();
  }

  return (
    <div className="server-settings">
      {!open ? (
        <button type="button" className="server-toggle" onClick={() => setOpen(true)}>
          ⚙ Сервер: <span>{current ? current.replace(/^https?:\/\//, "") : "этот сайт"}</span>
        </button>
      ) : (
        <form className="server-form" onSubmit={save}>
          <label htmlFor="server-input">Адрес сервера</label>
          <div className="server-row">
            <input
              id="server-input"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="192.168.1.10:8000"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
              Сохранить
            </button>
          </div>
          {status && <p className={`server-status ${status.kind}`}>{status.text}</p>}
          <div className="server-actions">
            {current && (
              <button type="button" className="server-link" onClick={reset}>
                Сбросить на «этот сайт»
              </button>
            )}
            <button type="button" className="server-link" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
