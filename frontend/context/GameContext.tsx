'use client';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';

interface GameContextType {
    socket: WebSocket | null;
    gameState: any; // We'll type this better later
    joinGame: (gameID: string) => void;
    createGame: () => Promise<void>;
    sendMessage: (action: string, payload: any) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [currentGameId, setCurrentGameId] = useState<string | null>(null);
    const userRef = useRef<string | null>(null);

    useEffect(() => {
        // Simple user ID extraction from token (JWT)
        // Ideally we decode the token
        const token = getToken();
        if (token) {
            // Mock decoding for now or just trust backend handles handshake
        }
    }, []);

    const connect = (gameID: string) => {
        const token = getToken();
        if (!token) return;

        // We pass token in query param or header (standard WS API doesn't support custom headers easily without workaround)
        // For this MVP we might need to decode user_id on client or pass token in protocol
        // Let's assume we pass user_id in query for now (insecure but fast for MVP)
        // Wait, we can't easily get user_id without decoding JWT.
        // Let's pass the token in 'Sec-WebSocket-Protocol' or query param 'token'
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8080/ws?game_id=${gameID}&user_id=mock_user_id`; // TODO: Fix user_id

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to game', gameID);
            setCurrentGameId(gameID);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'GAME_STATE') {
                setGameState(msg.payload);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected');
            setSocket(null);
        };

        setSocket(ws);
    };

    const joinGame = (gameID: string) => {
        connect(gameID);
    };

    const createGame = async () => {
        // Call API to create game, get ID, then connect
    };

    const sendMessage = (action: string, payload: any) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action, payload }));
        }
    };

    return (
        <GameContext.Provider value={{ socket, gameState, joinGame, createGame, sendMessage }}>
            {children}
        </GameContext.Provider>
    );
}

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};
