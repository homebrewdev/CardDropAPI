import { useEffect, useRef, useState } from "react";

interface ShareButtonProps {
  joinCode: string;
  roomName?: string;
}

/** Ссылка-приглашение: открывает лобби сразу на входе по этому коду */
export function inviteUrl(joinCode: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", joinCode);
  return url.toString();
}

export function ShareButton({ joinCode, roomName }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const url = inviteUrl(joinCode);
  const text = `Заходи играть в CardDrop${roomName ? ` — комната «${roomName}»` : ""}. Код: ${joinCode}`;
  const enc = encodeURIComponent;

  const networks = [
    { id: "tg", label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { id: "wa", label: "WhatsApp", href: `https://wa.me/?text=${enc(`${text}\n${url}`)}` },
    { id: "vk", label: "ВКонтакте", href: `https://vk.com/share.php?url=${enc(url)}&title=${enc(text)}` },
  ];

  // Закрываем меню по клику мимо и по Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleClick() {
    // На телефонах — системное меню «Поделиться» со всеми установленными приложениями
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && navigator.share) {
      try {
        await navigator.share({ title: "CardDrop", text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    setOpen((v) => !v);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
    } catch {
      window.prompt("Скопируй ссылку:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="share" ref={rootRef}>
      <button
        type="button"
        className="share-btn"
        onClick={handleClick}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Поделиться приглашением"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        Поделиться
      </button>

      {open && (
        <div className="share-menu" role="menu">
          {networks.map((n) => (
            <a
              key={n.id}
              role="menuitem"
              className={`share-item share-${n.id}`}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              {n.label}
            </a>
          ))}
          <button type="button" role="menuitem" className="share-item" onClick={copyLink}>
            {copied ? "Скопировано ✓" : "Скопировать ссылку"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Кнопки «Поделиться в Telegram» и «Поделиться во ВКонтакте» (столбиком) */
export function SocialShareButtons({ joinCode, roomName }: ShareButtonProps) {
  const url = inviteUrl(joinCode);
  const text = `Заходи играть в CardDrop${roomName ? ` — комната «${roomName}»` : ""}. Код: ${joinCode}`;
  const enc = encodeURIComponent;

  return (
    <div className="social-share">
      <a
        className="social-btn social-tg"
        href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться в Telegram"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M21.5 3.5L2.8 10.7c-.9.4-.9 1.6.1 1.9l4.6 1.5 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.5 4.7 3.5c.7.5 1.7.1 1.9-.7l3-14.6c.2-1.1-.8-2-1.9-1.6zM9.6 14.3l-.5 3.9-1.3-4.3 10-7.2-8.2 7.6z" />
        </svg>
        Telegram
      </a>
      <a
        className="social-btn social-vk"
        href={`https://vk.com/share.php?url=${enc(url)}&title=${enc(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться во ВКонтакте"
      >
        <span className="social-vk-mark" aria-hidden="true">VK</span>
        ВКонтакте
      </a>
    </div>
  );
}
