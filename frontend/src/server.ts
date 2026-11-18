// Адрес игрового сервера.
//
// По умолчанию (пусто) клиент ходит на тот же сайт, откуда открыт: в
// разработке /api и /ws проксирует Vite (vite.config.ts). В Android-
// приложении своего сайта нет — там адрес задаётся явно: полем «Сервер»
// на главном окне (сохраняется в браузере) или при сборке через
// VITE_SERVER_URL, например http://192.168.1.10:8000

const STORAGE_KEY = "carddrop.server";

/** Привести ввод к виду http(s)://host[:port] без завершающего слеша.
 *  Пустая строка — «тот же сайт». Бросает ошибку на явном мусоре. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  const url = new URL(s); // бросит TypeError на некорректном адресе
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("Укажи только адрес и порт, без пути");
  }
  return `${url.protocol}//${url.host}`;
}

function fromEnv(): string {
  try {
    return normalizeServerUrl(import.meta.env.VITE_SERVER_URL ?? "");
  } catch {
    return "";
  }
}

/** Текущий адрес сервера ("" — тот же сайт) */
export function getServerUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch {
    // хранилище недоступно — берём адрес сборки
  }
  return fromEnv();
}

/** Сохранить адрес сервера ("" — сбросить на значение по умолчанию) */
export function setServerUrl(url: string): void {
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // не сохранится между запусками, но в этой сессии сработает через reload
  }
}

/** URL для REST-запроса: apiUrl("/api/sessions") */
export function apiUrl(path: string): string {
  return getServerUrl() + path;
}

/** URL для WebSocket: ws(s)://… на том же сервере */
export function wsUrl(path: string): string {
  const base = getServerUrl();
  if (base) return base.replace(/^http/i, "ws") + path;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

/** Ссылки с сервера вида /api/players/1/avatar → полный адрес */
export function assetUrl(src: string | null): string | null {
  if (!src) return src;
  return src.startsWith("/") ? getServerUrl() + src : src;
}

/** Проверить, что по адресу отвечает наш сервер (GET /health) */
export async function pingServer(url: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch((url || "") + "/health", { signal: ctrl.signal });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
