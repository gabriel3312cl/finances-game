'use client';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getToken, API_URL, fetchWithAuth } from '@/lib/auth';

interface GameContextType {
    socket: WebSocket | null;
    gameState: any;
    user: any;
    joinGame: (gameID: string) => void;
    createGame: () => Promise<string | null>;
    sendMessage: (action: string, payload: any) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [user, setUser] = useState<any>(null);

    // Fetch User on mount
    useEffect(() => {
        fetchWithAuth('/me')
            .then(res => res.json())
            .then(data => setUser(data))
            .catch(err => console.error("Not logged in", err));
    }, []);

    const connect = (gameID: string) => {
        if (!user) return; // Wait for user

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Ideally we assume localhost:8080 for dev if window location port is 80 or 3000?
        // Let's use NEXT_PUBLIC_API_URL host.
        const apiHost = new URL(API_URL).host;
        const wsUrl = `ws://${apiHost}/ws?game_id=${gameID}&user_id=${user.user_id}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to game', gameID);
            // Try to join logically
            sendMessageToWs(ws, 'JOIN_GAME', {});
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'GAME_STATE') {
                    setGameState(msg.payload);
                }
            } catch (e) {
                console.error("WS Parse Error", e);
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

    // Helper to init game via API then join
    const createGame = async () => {
        // Not implementing API call in this context yet, assume Create happens on Dashboard
        return null;
    };

    const sendMessageToWs = (ws: WebSocket, action: string, payload: any) => {
        ws.send(JSON.stringify({ action, payload }));
    };

    const sendMessage = (action: string, payload: any) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            sendMessageToWs(socket, action, payload);
        }
    };

    // Auto-connect if ID is in URL (handled by Page, but Page calls joinGame)

    return (
        <GameContext.Provider value={{ socket, gameState, user, joinGame, createGame, sendMessage }}>
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
