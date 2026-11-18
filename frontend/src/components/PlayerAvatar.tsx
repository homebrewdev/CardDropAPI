import { useState } from "react";

interface PlayerAvatarProps {
  nickname: string;
  /** Ссылка на аватарку с сервера (/api/players/<id>/avatar?v=…) или null */
  src: string | null;
}

/** Содержимое кружка игрока: аватарка, а если её нет или она не загрузилась —
 *  первая буква ника */
export function PlayerAvatar({ nickname, src }: PlayerAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <img
        className="player-avatar-img"
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(src)}
      />
    );
  }
  return <>{nickname[0]?.toUpperCase()}</>;
}
