'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';

// Sound File Map
const SOUNDS = {
    big_rent: '/sounds/big_rent.mp3',
    deal: '/sounds/deal.mp3',
    dice: '/sounds/dice.mp3',
    explosion: '/sounds/explosion.mp3',
    fail: '/sounds/fail.mp3',
    given_money: '/sounds/given_money.mp3',
    hip: '/sounds/hip.mp3',
    hotel: '/sounds/hotel.mp3',
    house: '/sounds/house.mp3',
    lose: '/sounds/lose.mp3',
    notification: '/sounds/notification.mp3',
    police: '/sounds/police.mp3',
    finish: '/sounds/finish.mp3',
    purchase: '/sounds/purchase.mp3',
    subasta_win: '/sounds/subasta_win.mp3',
    tap: '/sounds/tap.mp3',
    win: '/sounds/win.mp3',
    wow: '/sounds/wow.mp3',
};

export default function SoundManager() {
    const gameState = useGameStore((state) => state.game);
    const user = useGameStore((state) => state.user);

    // Processed Logs Tracker
    const processedLogsRef = useRef<Set<number>>(new Set());
    const lastTurnIdRef = useRef<string | null>(null);
    const lastTradeRef = useRef<any>(null); // Use object ref
    const isFirstRender = useRef(true);

    // Helper to play sound
    const playSound = (soundKey: keyof typeof SOUNDS) => {
        try {
            const audio = new Audio(SOUNDS[soundKey]);
            audio.volume = 0.6; // Consistent volume
            audio.play().catch(e => console.warn("Audio play failed:", e));
        } catch (e) {
            console.error("Audio error:", e);
        }
    };

    // 1. Log-Event Sounds
    useEffect(() => {
        if (!gameState || !gameState.logs) return;

        // Skip sound on initial load / rejoin (don't replay history)
        if (isFirstRender.current) {
            gameState.logs.forEach(l => processedLogsRef.current.add(l.timestamp));
            isFirstRender.current = false;
            return;
        }

        gameState.logs.forEach((log) => {
            if (processedLogsRef.current.has(log.timestamp)) return;
            processedLogsRef.current.add(log.timestamp);

            // Analyze Log Content
            const msg = log.message.toLowerCase();
            const isMe = log.user_id === user?.user_id;

            // GLOBAL SOUNDS
            if (msg.includes('pagó renta de hotel') || msg.includes('renta alta')) {
                playSound('big_rent');
            } else if (msg.includes('bancarrota')) {
                playSound('explosion');
            } else if (msg.includes('hipotec')) {
                playSound('hip');
            } else if (msg.includes('construyó un hotel')) {
                playSound('hotel');
            } else if (msg.includes('construyó una casa')) {
                playSound('house');
            } else if (msg.includes('cárcel') && (log.type === 'ALERT' || msg.includes('enviado'))) {
                playSound('police');
            }

            // LOCAL SOUNDS (Only play if relevant to me)
            if (isMe || msg.includes(user?.name?.toLowerCase())) {
                if (msg.includes('compró')) {
                    playSound('purchase');
                } else if (msg.includes('ganó la subasta')) {
                    playSound('subasta_win');
                } else if (msg.includes('bonus $500')) {
                    playSound('wow');
                } else if (msg.includes('ganó') || msg.includes('recibió')) {
                    // Check if it's a card win or generic
                    if (log.type === 'SUCCESS') playSound('win');
                    else playSound('given_money');
                } else if (log.type === 'ALERT' || msg.includes('pagó')) {
                    // "Lose" sound for forget rent? Or fail?
                    // If msg includes "no pagó renta" -> playSound('lose')
                    if (msg.includes('no pagó') || msg.includes('perdió')) {
                        playSound('lose');
                    } else {
                        playSound('fail'); // Generic bad luck (card pay, tax)
                    }
                }
            }
        });
    }, [gameState?.logs, user?.user_id, user?.name]);

    // 2. State Change Sounds (Turn, Trade)
    useEffect(() => {
        if (!gameState || !user) return;

        // Turn Notification
        if (gameState.current_turn_id !== lastTurnIdRef.current) {
            if (gameState.current_turn_id === user.user_id) {
                playSound('notification');
            } else if (lastTurnIdRef.current === user.user_id) {
                // My turn ended
                playSound('finish');
            }
            lastTurnIdRef.current = gameState.current_turn_id;
        }

        // Trade Notification
        if (gameState.active_trade && gameState.active_trade !== lastTradeRef.current) {
            // Check if I am the target
            if (gameState.active_trade.target_id === user.user_id || gameState.active_trade.TargetID === user.user_id) { // Case safe check
                playSound('deal');
            }
            lastTradeRef.current = gameState.active_trade;
        }
    }, [gameState?.current_turn_id, gameState?.active_trade, user?.user_id]);

    return null; // Invisible Component
}

// Special hook or helper for GameBoard usage (Dice, Tap)
export const playSoundEffect = (soundKey: keyof typeof SOUNDS) => {
    try {
        const audio = new Audio(SOUNDS[soundKey]);
        audio.volume = 0.5;
        audio.play().catch(() => { });
    } catch { }
};
