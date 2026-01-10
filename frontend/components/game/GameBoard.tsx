'use client';
import React from 'react';
import { boardTiles } from '@/config/boardData';
import BoardTile from './BoardTile';

export default function GameBoard() {
    return (
        <div className="w-full h-full relative p-4 flex items-center justify-center bg-gray-900 overflow-auto">
            {/* Aspect Ratio Container to keep board square */}
            <div className="aspect-square w-full max-w-[95vh] relative bg-gray-800 shadow-2xl rounded-xl overflow-hidden border-4 border-black">

                {/* The Grid */}
                <div
                    className="w-full h-full grid grid-rows-[repeat(17,1fr)] grid-cols-[repeat(17,1fr)] bg-[#d4eac8]"
                >
                    {/* Render Tiles */}
                    {boardTiles.map((tile, i) => (
                        <BoardTile key={tile.id} tile={tile} index={i} />
                    ))}

                    {/* Center Area (Logo, Dice, Chat) */}
                    {/* Spans Rows 2-16 and Cols 2-16 */}
                    <div
                        className="row-start-2 row-end-[17] col-start-2 col-end-[17] bg-gray-900 relative flex flex-col items-center justify-center border border-gray-700 m-[1px]"
                    >
                        {/* Branding */}
                        <div className="absolute opacity-20 transform -rotate-45 select-none pointer-events-none">
                            <h1 className="text-9xl font-black text-amber-500">MONOPOLY</h1>
                        </div>

                        <div className="z-10 text-white text-center">
                            <p className="text-gray-400">Game Center Area</p>
                            <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                                <p>Dice Roll placeholder</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
