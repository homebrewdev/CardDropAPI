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
}

export interface Player {
  id: number;
  nickname: string;
  avatar: string | null;
  score: number;
  is_ready: boolean;
}

export interface Session {
  id: number;
  name: string;
  join_code: string;
  status: "waiting" | "playing" | "finished" | "cancelled";
  max_players: number;
  current_players: number;
  deck_type: string;
  created_at: string;
  players: Player[];
}

export interface GameState {
  type: "game_state";
  session_id: number;
  session_status: string;
  round_number: number;
  current_player_id: number | null;
  player: Player;
  my_cards: PlayerCard[];
  other_players: Player[];
  table_cards: PlayerCard[];
  round_status: string;
  timestamp: string;
}

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}
