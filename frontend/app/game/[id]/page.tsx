'use client';
import { GameProvider } from '@/context/GameContext';
import GameBoard from '@/components/game/GameBoard';

interface GamePageProps {
    params: { id: string }
}

export default function GamePage({ params }: GamePageProps) {
    return (
        <GameProvider>
            <div className="w-screen h-screen overflow-hidden flex flex-col bg-black">
                {/* Header / HUD */}
                <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4 text-white z-20">
                    <span className="font-bold text-amber-500">Finances Game <span className="text-gray-500 text-xs">#{params.id}</span></span>
                    <div className="flex space-x-4 text-sm">
                        <span>Player: <span className="text-green-400">$1500</span></span>
                    </div>
                </div>

                {/* Main View */}
                <div className="flex-1 relative">
                    <GameBoard />
                </div>
            </div>
        </GameProvider>
    );
}
