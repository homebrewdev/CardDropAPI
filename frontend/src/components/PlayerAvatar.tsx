import { useState } from "react";
import { assetUrl } from "../server";

interface PlayerAvatarProps {
  nickname: string;
  /** Ссылка на аватарку с сервера (/api/players/<id>/avatar?v=…) или null */
  src: string | null;
}

/** Содержимое кружка игрока: аватарка, а если её нет или она не загрузилась —
 *  первая буква ника */
export function PlayerAvatar({ nickname, src: rawSrc }: PlayerAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  // Ссылка с сервера относительная — в приложении нужен полный адрес
  const src = assetUrl(rawSrc);
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
