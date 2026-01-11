'use client';
import React from 'react';
import { boardTiles, getGridPosition } from '@/config/boardData';
import BoardTile from './BoardTile';
import { useGame } from '@/context/GameContext';
import PlayerToken from './PlayerToken';

import Link from 'next/link';
import AuctionModal from './AuctionModal';
import InventoryDrawer from './InventoryDrawer';
import TradeModal from './TradeModal';
import { useState } from 'react';

export default function GameBoard() {
    const { gameState, sendMessage, user } = useGame();
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);

    const handleRollDice = () => {
        sendMessage('ROLL_DICE', {});
    };

    const getOwnerColor = (userId: string) => {
        const owner = gameState?.players?.find((p: any) => p.user_id === userId);
        const colorMap: Record<string, string> = {
            'RED': '#ef4444',
            'BLUE': '#3b82f6',
            'GREEN': '#22c55e',
            'YELLOW': '#eab308',
            'PURPLE': '#a855f7',
            'ORANGE': '#f97316',
            'CYAN': '#06b6d4',
            'PINK': '#ec4899',
        };
        return owner?.token_color ? colorMap[owner.token_color] : '#ffffff';
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
                                {/* Ownership Indicator Overlay */}
                                {tile.propertyId && gameState?.property_ownership?.[tile.propertyId] && (
                                    <div
                                        className="absolute inset-0 border-4 border-dashed z-10 pointer-events-none"
                                        style={{ borderColor: getOwnerColor(gameState.property_ownership[tile.propertyId]) }}
                                    />
                                )}

                                {/* Heatmap Overlay */}
                                {showHeatmap && gameState?.tile_visits?.[i] && (
                                    <div
                                        className="absolute inset-0 z-20 pointer-events-none bg-red-600 transition-opacity duration-500"
                                        style={{
                                            opacity: Math.min(0.8, (gameState.tile_visits[i] || 0) * 0.1 + 0.1)
                                            // Simple formula: base 0.1 + 0.1 per visit, max 0.8
                                        }}
                                    >
                                        <div className="flex items-center justify-center h-full text-white font-bold text-xs drop-shadow-md">
                                            {gameState.tile_visits[i]}
                                        </div>
                                    </div>
                                )}

                                {/* Tile Content */}
                                <BoardTile tile={tile} index={i} />
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
            <TradeModal gameState={gameState} user={user} sendMessage={sendMessage} />

            <InventoryDrawer
                isOpen={isInventoryOpen}
                onClose={() => setIsInventoryOpen(false)}
                gameState={gameState}
                user={user}
                sendMessage={sendMessage}
            />

            {/* Floating Action Button for Inventory */}
            <button
                onClick={() => setIsInventoryOpen(true)}
                className="fixed bottom-6 right-6 z-[60] bg-gray-800 hover:bg-gray-700 text-white p-4 rounded-full shadow-2xl border border-gray-600 transition-all hover:scale-110 group"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500 group-hover:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a4 4 0 014-4h2.08a2.4 2.4 0 011.92.96L11 8h5a1 1 0 011 1v7a1 1 0 01-1 1H6a4 4 0 01-4-4v-3zm3.293-2.707a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l5 5a1 1 0 01-1.414 1.414L15 10.414V18a2 2 0 01-2 2H6a2 2 0 01-2-2v-4.586l.293.293a1 1 0 01-1.414-1.414l5-5z" />
                    {/* Simple Wallet Icon */}
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Heatmap Toggle (Dev/Stats Tool) */}
            <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`fixed bottom-6 left-6 z-[60] p-3 rounded-full shadow-lg border transition-all hover:scale-110 ${showHeatmap ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}
                title="Toggle Heatmap"
            >
                🔥
            </button>
        </div>
    );
}
