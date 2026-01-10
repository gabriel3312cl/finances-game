import React from 'react';
import { TileData, getGridPosition } from '@/config/boardData';

interface BoardTileProps {
    tile: TileData;
    index: number;
}

export default function BoardTile({ tile, index }: BoardTileProps) {
    const { row, col } = getGridPosition(index);

    // Determine if it's a corner
    const isCorner = tile.type === 'CORNER' || tile.type === 'JAIL_VISIT' || tile.type === 'FREE_PARKING' || tile.type === 'GO_TO_JAIL';

    // Determine orientation for text/color bar
    // Details depend on row/col.
    // Bottom Row (Row 17): Bar at Top.
    // Left Col (Col 1): Bar at Right.
    // Top Row (Row 1): Bar at Bottom.
    // Right Col (Col 17): Bar at Left.

    const getBarStyle = () => {
        if (!tile.color) return {};
        if (row === 17) return { borderTop: `8px solid ${tile.color}` };
        if (col === 1) return { borderRight: `8px solid ${tile.color}` };
        if (row === 1) return { borderBottom: `8px solid ${tile.color}` };
        if (col === 17) return { borderLeft: `8px solid ${tile.color}` };
        return {};
    };

    return (
        <div
            className={`relative flex flex-col justify-between p-1 text-[0.6rem] sm:text-xs leading-tight text-center border border-gray-700 bg-[#cee6d0] text-black font-semibold overflow-hidden select-none hover:z-10 hover:scale-105 transition-transform ${isCorner ? 'bg-[#cde6d0] z-10' : ''}`}
            style={{
                gridRow: row,
                gridColumn: col,
                ...getBarStyle(),
            }}
            title={tile.name}
        >
            {/* Content layout varies by orientation, simplified for now */}
            <div className="w-full flex-1 flex items-center justify-center break-words px-1">
                {tile.name}
            </div>

            {tile.price && (
                <div className="w-full text-center pb-1 font-bold">
                    {tile.price}m
                </div>
            )}

            {/* Icon placeholders based on type */}
            {tile.type === 'RAILROAD' && <div className="absolute inset-0 opacity-10 flex items-center justify-center">🚂</div>}
            {tile.type === 'UTILITY' && <div className="absolute inset-0 opacity-10 flex items-center justify-center">💡</div>}
            {tile.type === 'CHANCE' && <div className="absolute inset-0 opacity-10 flex items-center justify-center">❓</div>}
            {tile.type === 'COMMUNITY' && <div className="absolute inset-0 opacity-10 flex items-center justify-center">📦</div>}
        </div>
    );
}
