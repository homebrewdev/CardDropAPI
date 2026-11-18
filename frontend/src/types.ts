export interface Card {
  id: number;
  name: string;
  suit: string | null;
  value: string;
  power: number;
}

export interface PlayerCard {
  id: number;
  card: Card;
  hand_order: number | null;
  player_id?: number | null;
}

export interface Player {
  id: number;
  nickname: string;
  avatar: string | null;
  score: number;
  bet: number;
  is_ready: boolean;
  folded: boolean;
  connected: boolean;
  cards_left: number;
}

export interface Session {
  id: number;
  name: string;
  join_code: string;
  status: "waiting" | "playing" | "finished" | "cancelled";
  max_players: number;
  current_players: number;
  deck_type: string;
  ante?: number;
  games_played?: number;
  winner_nickname?: string | null;
  created_at: string;
  players: Player[];
}

export interface SessionInfo {
  id: number;
  name: string;
  join_code: string;
  status: string;
  max_players: number;
  current_players: number;
}

export interface GameState {
  type: "game_state";
  session_id: number;
  session: SessionInfo;
  session_status: string;
  round_number: number;
  current_player_id: number | null;
  leader_player_id: number | null;
  current_power: number | null;
  is_tiebreak: boolean;
  ante: number;
  games_played: number;
  winner_nickname: string | null;
  player: Player;
  my_cards: PlayerCard[];
  other_players: Player[];
  table_cards: PlayerCard[];
  round_status: string;
  /** Кто участвует во вскрытии текущей фазы (при переигровке — только равные) */
  flip_contenders: number[];
  /** Кто в этой фазе уже открыл карту */
  flipped_ids: number[];
  /** Сколько карт ушло в биту за эту партию */
  discard_count: number;
  timestamp: string;
}

export interface ChatMessage {
  id: number;
  player_id: number;
  nickname: string;
  /** Ссылка на аватарку автора на момент отправки (или null) */
  avatar: string | null;
  text: string;
  ts: string;
}

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}
