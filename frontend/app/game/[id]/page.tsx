'use client';
import React from 'react';
import { GameProvider, useGame } from '@/context/GameContext';
import GameBoard from '@/components/game/GameBoard';

interface GamePageProps {
    params: Promise<{ id: string }>
}

import { use } from 'react';

export default function GamePage({ params }: GamePageProps) {
    const { id } = use(params);
    return (
        // We need a wrapper component to use useGame inside GameProvider
        <GameProvider>
            <GameWrapper gameId={id} />
        </GameProvider>
    );
}

function GameWrapper({ gameId }: { gameId: string }) {
    const { joinGame, gameState, user } = useGame();

    React.useEffect(() => {
        if (user) {
            joinGame(gameId);
        }
    }, [user, gameId]);

    return (
        <div className="w-screen h-screen overflow-hidden flex flex-col bg-black">
            {/* Header / HUD */}
            <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4 text-white z-20">
                <span className="font-bold text-amber-500">Finances Game <span className="text-gray-500 text-xs">#{gameId}</span></span>
                <div className="flex space-x-4 text-sm">
                    {/* Logic to find my player balance */}
                    {gameState && (
                        <span>Balance: <span className="text-green-400">
                            ${gameState.players?.find((p: any) => p.user_id === user?.user_id)?.balance || 0}
                        </span></span>
                    )}
                </div>
            </div>

            {/* Main View */}
            <div className="flex-1 relative">
                <GameBoard />
            </div>
        </div>
    );
}
