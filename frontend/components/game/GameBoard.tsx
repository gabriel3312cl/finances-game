'use client';
import React from 'react';
import { boardTiles, getGridPosition } from '@/config/boardData';
import BoardTile from './BoardTile';
import { useGame } from '@/context/GameContext';
import PlayerToken from './PlayerToken';

import Link from 'next/link';
import AuctionModal from './AuctionModal';

export default function GameBoard() {
    const { gameState, sendMessage, user } = useGame();

    const handleRollDice = () => {
        sendMessage('ROLL_DICE', {});
    };

    const isMyTurn = gameState?.current_turn_id === user?.user_id;

    return (
        <div className="w-full h-full relative p-4 flex items-center justify-center bg-gray-900 overflow-auto">
            {/* Aspect Ratio Container to keep board square */}
            <div className="aspect-square w-full max-w-[95vh] relative bg-gray-800 shadow-2xl rounded-xl overflow-hidden border-4 border-black">

                {/* The Grid */}
                <div
                    className="w-full h-full grid grid-rows-[repeat(17,1fr)] grid-cols-[repeat(17,1fr)] bg-[#d4eac8]"
                >
                    {/* Render Tiles */}
                    {boardTiles.map((tile, i) => {
                        // Find players on this tile
                        const playersOnTile = gameState?.players?.filter((p: any) => p.position === i) || [];

                        return (
                            <div key={tile.id} className="relative contents">
                                {/* Render the Tile itself. We can modify BoardTile to accept children (players) but better to overlay them?
                                    Actually, BoardTile is self-contained. Let's modify BoardTile to accept 'players' prop or Render overlay here?
                                    Since BoardTile has the grid positioning logic inside it, strict overlay here is tricky without duplicating logic.
                                    Better: Pass players to BoardTile.
                                */}
                                {/* Wait, BoardTile handles its own Grid placement style.
                                    We can just pass the children.
                                */}
                                <BoardTile tile={tile} index={i} />

                                {/* Ownership Indicator */}
                                {(() => {
                                    if (!tile.propertyId || !gameState?.property_ownership) return null;
                                    const ownerID = gameState.property_ownership[tile.propertyId];
                                    if (ownerID) {
                                        const owner = gameState.players.find((p: any) => p.user_id === ownerID);
                                        const colorMap: Record<string, string> = {
                                            'RED': 'border-red-500 bg-red-500/20',
                                            'BLUE': 'border-blue-500 bg-blue-500/20',
                                            'GREEN': 'border-green-500 bg-green-500/20',
                                            'YELLOW': 'border-yellow-500 bg-yellow-500/20',
                                            'PURPLE': 'border-purple-500 bg-purple-500/20',
                                            'ORANGE': 'border-orange-500 bg-orange-500/20',
                                            'CYAN': 'border-cyan-500 bg-cyan-500/20',
                                            'PINK': 'border-pink-500 bg-pink-500/20',
                                        };
                                        const colorClass = colorMap[owner?.token_color] || 'border-white';

                                        // Position overlay locally on the tile (BoardTile determines grid area, but we can't easily hook into it from outside if BoardTile is just a component)
                                        // Wait, BoardTile returns a div with grid-row/col.
                                        // We need to wrap BoardTile or be inside the grid cell. 
                                        // BoardTile uses getGridPosition inside? No, passed prop? 
                                        // Let's check BoardTile source.
                                        // Assuming BoardTile renders at grid position.
                                        // We can render a DIV at same grid position.
                                        const { row, col } = getGridPosition(i);
                                        return (
                                            <div
                                                className={`pointer-events-none absolute inset-0 z-10 border-4 border-dashed rounded-lg ${colorClass}`}
                                                style={{ gridRow: row, gridColumn: col }}
                                            />
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        );
                    })}

                    {/* Render Players Overlay (Global) - Simpler than per-tile modification?
                        We can iterate players and use getGridPosition to place them absolute/grid.
                    */}
                    {gameState?.players?.map((player: any) => {
                        const { row, col } = getGridPosition(player.position);
                        return (
                            <div
                                key={player.user_id}
                                className="flex items-center justify-center pointer-events-none"
                                style={{ gridRow: row, gridColumn: col, zIndex: 50 }}
                            >
                                <PlayerToken
                                    color={player.token_color}
                                    name={player.name}
                                    isCurrentTurn={gameState.current_turn_id === player.user_id}
                                />
                            </div>
                        );
                    })}

                    {/* Center Area (Logo, Dice, Chat) */}
                    {/* Spans Rows 2-16 and Cols 2-16 */}
                    <div
                        className="row-start-2 row-end-[17] col-start-2 col-end-[17] bg-gray-900 relative flex flex-col items-center justify-center border border-gray-700 m-[1px] z-0"
                    >
                        {/* Branding */}
                        <div className="absolute opacity-20 transform -rotate-45 select-none pointer-events-none">
                            <h1 className="text-9xl font-black text-amber-500">MONOPOLY</h1>
                        </div>

                        <div className="z-10 text-white text-center space-y-6">

                            {/* Game Info */}
                            <div className="bg-gray-800/80 backdrop-blur p-4 rounded-xl border border-gray-700">
                                <h2 className="text-xl font-bold text-amber-500">
                                    {gameState ? `Turn: ${gameState.current_turn_id === user?.user_id ? 'YOUR TURN' : 'Waiting...'}` : 'Waiting for game data...'}
                                </h2>
                                {gameState?.last_action && (
                                    <p className="text-sm text-gray-300 mt-2 italic">"{gameState.last_action}"</p>
                                )}
                            </div>

                            {/* Dice Result */}
                            {gameState?.dice && (
                                <div className="flex justify-center space-x-4">
                                    <div className="w-16 h-16 bg-white text-black rounded-lg flex items-center justify-center text-4xl font-bold shadow-lg border-2 border-gray-300">
                                        {gameState.dice[0]}
                                    </div>
                                    <div className="w-16 h-16 bg-white text-black rounded-lg flex items-center justify-center text-4xl font-bold shadow-lg border-2 border-gray-300">
                                        {gameState.dice[1]}
                                    </div>
                                </div>
                            )}

                            {/* Controls */}
                            {isMyTurn && (
                                <div className="space-y-4">
                                    <button
                                        onClick={handleRollDice}
                                        className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold rounded-full shadow-lg shadow-green-500/30 transform hover:scale-105 transition-all text-xl block w-full"
                                    >
                                        ROLL DICE
                                    </button>

                                    {(() => {
                                        // Property Buy Logic
                                        const currentPlayer = gameState?.players?.find((p: any) => p.user_id === user?.user_id);
                                        if (currentPlayer) {
                                            const currentTile = boardTiles[currentPlayer.position];
                                            if (currentTile && currentTile.propertyId) {
                                                const ownerID = gameState?.property_ownership?.[currentTile.propertyId];
                                                if (!ownerID) {
                                                    return (
                                                        <button
                                                            onClick={() => sendMessage('BUY_PROPERTY', { property_id: currentTile.propertyId })}
                                                            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold rounded-full shadow-lg shadow-blue-500/30 transform hover:scale-105 transition-all text-xl block w-full"
                                                        >
                                                            BUY {currentTile.name} (${currentTile.price})
                                                        </button>
                                                    );
                                                }
                                            }
                                        }
                                        return null;
                                    })()}

                                    {/* Test Auction Button (Dev only) */}
                                    <button
                                        onClick={() => sendMessage('START_AUCTION', { property_id: 'TEST_PROP' })}
                                        className="text-xs text-gray-500 underline hover:text-white"
                                    >
                                        [Dev] Start Auction
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Global Modals */}
            <AuctionModal gameState={gameState} user={user} sendMessage={sendMessage} />
        </div>
    );
}
