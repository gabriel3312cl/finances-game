import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { API_URL, fetchWithAuth } from '@/lib/auth';

export const useGameSocket = (gameId: string) => {
    const socketRef = useRef<WebSocket | null>(null);
    const setGame = useGameStore((state) => state.setGame);
    const setConnected = useGameStore((state) => state.setConnected);
    const setUser = useGameStore((state) => state.setUser);
    const setSocket = useGameStore((state) => state.setSocket);

    useEffect(() => {
        let ws: WebSocket | null = null;
        let active = true;

        const connect = async () => {
            try {
                // Get User ID
                const res = await fetchWithAuth('/me');
                if (!res.ok) return;
                const userData = await res.json();

                if (!active) return;
                setUser(userData); // Set User in Store

                // Connect
                const apiHost = new URL(API_URL).host;
                const wsUrl = `ws://${apiHost}/ws?game_id=${gameId}&user_id=${userData.user_id}`;

                ws = new WebSocket(wsUrl);
                socketRef.current = ws;
                setSocket(ws); // Set Socket in Store

                ws.onopen = () => {
                    console.log('WS Connected');
                    setConnected(true);
                    ws?.send(JSON.stringify({ action: 'JOIN_GAME', payload: {} }));
                };

                ws.onmessage = (event) => {
                    if (!active) return;
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'GAME_STATE') {
                            setGame(msg.payload);
                        }
                    } catch (e) {
                        console.error('WS Parse Error', e);
                    }
                };

                ws.onclose = () => {
                    if (!active) return;
                    console.log('WS Disconnected');
                    setConnected(false);
                    setSocket(null);
                    socketRef.current = null;
                };

            } catch (err) {
                console.error("Connection Failed", err);
            }
        };

        if (gameId) {
            connect();
        }

        return () => {
            active = false;
            if (ws) {
                ws.close();
            }
            // Cleanup store logic if desired (e.g. setConnected(false))
        };
    }, [gameId, setGame, setConnected, setUser, setSocket]);

    // Send Message Helper
    const sendMessage = useCallback((action: string, payload: any) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ action, payload }));
        } else {
            console.warn("Socket not connected");
        }
    }, []);

    return { sendMessage };
};
