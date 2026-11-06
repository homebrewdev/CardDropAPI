import { useState } from "react";

interface LobbyProps {
  onCreate: (name: string, maxPlayers: number) => void;
  onJoin: (code: string, nickname: string) => void;
  sessions: { id: number; name: string; join_code: string }[];
}

export function Lobby({ onCreate, onJoin }: LobbyProps) {
  const [form, setForm] = useState({ name: "", code: "", nickname: "", maxPlayers: 4 });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onCreate(form.name, form.maxPlayers);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.nickname.trim()) return;
    onJoin(form.code, form.nickname);
  }

  return (
    <div className="lobby">
      <h1 className="title">🃏 CardDrop</h1>
      <p className="subtitle">Карточная игра на 2–4 человека</p>

      <form className="form" onSubmit={handleCreate}>
        <h3>Создать игру</h3>
        <input
          type="text"
          placeholder="Название"
          value={form.name}
          maxLength={100}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <label>
          Игроков:
          <select value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Создать</button>
      </form>

      <form className="form" onSubmit={handleJoin}>
        <h3>Войти по коду</h3>
        <input
          type="text"
          placeholder="Код комнаты (ABC12345)"
          value={form.code}
          maxLength={8}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        />
        <input
          type="text"
          placeholder="Никнейм"
          value={form.nickname}
          maxLength={30}
          onChange={(e) => setForm({ ...form, nickname: e.target.value })}
        />
        <button type="submit" className="btn btn-primary">Войти</button>
      </form>
    </div>
  );
}
