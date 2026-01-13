import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Define Types (simplified from GameContext)
interface Player {
    user_id: string;
    name: string;
    balance: number;
    position: number;
    token_color: string;
    is_active: boolean;
    in_jail: boolean;
    loan: number;
}

interface Tile {
    id: number;
    type: string;
    name: string;
    property_id?: string; // Add property_id
    owner_id?: string;
    price?: number;
    rent?: number;
    group_identifier?: string;
    building_count?: number;
    is_mortgaged?: boolean;
    // Extended Info
    group_name?: string;
    group_color?: string;
    rent_base?: number;
    rent_color_group?: number;
    rent_1_house?: number;
    rent_2_house?: number;
    rent_3_house?: number;
    rent_4_house?: number;
    rent_hotel?: number;
    house_cost?: number;
    hotel_cost?: number;
    mortgage_value?: number;
}

interface EventLog {
    timestamp: number;
    message: string;
    type: string;
    tile_id?: number;
    user_id?: string;
}

interface GameState {
    game_id: string;
    players: Player[];
    board: Tile[]; // This comes from WebSocket state
    current_turn_id: string;
    status: string;
    dice: [number, number];
    last_action: string;
    active_auction?: any;
    active_trade?: any;
    property_ownership: Record<string, string>;
    tile_visits: Record<number, number>;
    logs: EventLog[];
    turn_order: string[];
    drawn_card?: { id: number; type: string; title?: string; description: string; effect: string };
}

interface GameStore {
    // WebSocket Data
    game: GameState | null;
    isConnected: boolean;
    user: any | null; // Added User
    socket: WebSocket | null; // Added Socket ref (optional, but good for direct usage if needed)
    sendMessage: (message: any) => void; // Added sendMessage

    // Config Data (REST API)
    boardConfig: Tile[]; // Static board layout from API

    // Actions
    setGame: (game: GameState) => void;
    setBoardConfig: (config: Tile[]) => void;
    setConnected: (status: boolean) => void;
    setUser: (user: any) => void;
    setSocket: (socket: WebSocket | null) => void;
    setSendMessage: (sendMessage: (message: any) => void) => void;
}

export const useGameStore = create<GameStore>()(
    devtools(
        (set) => ({
            // Initial State
            game: null,
            isConnected: false,
            user: null,
            socket: null,
            boardConfig: null,
            sendMessage: () => { }, // Default no-op function

            // Actions
            setGame: (game) => set({ game }),
            setConnected: (isConnected) => set({ isConnected }),
            setBoardConfig: (boardConfig) => set({ boardConfig }),
            setUser: (user) => set({ user }),
            setSocket: (socket) => set({ socket }),
            setSendMessage: (sendMessage) => set({ sendMessage }),
        }),
        { name: 'GameStore' }
    )
);
