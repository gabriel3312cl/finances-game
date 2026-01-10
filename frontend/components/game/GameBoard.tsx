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

                                {/* Overlay Players if any. We need to position them 'on top' of the tile.
                                    Since BoardTile is a div at grid (r,c), we can use React Portals or just have BoardTile render them.
                                    Let's modify BoardTile to accept Children.
                                */}
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
