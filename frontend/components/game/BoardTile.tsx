import React from 'react';
import { TileData, getGridPosition } from '@/config/boardData';
import { Box, Typography } from '@mui/material';
import { Train, Lightbulb, HelpOutline, Inventory2 } from '@mui/icons-material';

interface BoardTileProps {
    tile: TileData;
    index: number;
    onClick?: () => void;
    fontScale?: number;
}

export default function BoardTile({ tile, index, onClick, fontScale = 1, ownerColor }: BoardTileProps & { ownerColor?: string }) {
    const { row, col } = getGridPosition(index);
    const isCorner = tile.type === 'CORNER' || tile.type === 'JAIL_VISIT' || tile.type === 'FREE_PARKING' || tile.type === 'GO_TO_JAIL';
    // Base background color
    let bgColor = isCorner ? '#cde6d0' : '#cee6d0';

    // Apply Owner Tint if owned
    if (ownerColor) {
        // Simple blend/overlay logic in CSS or here. 
        // We can just set bg to ownerColor with opacity, but MUI bg prop replaces it.
        // Let's use a style override or specific logic.
        // If we simply use ownerColor with opacity, it might look washed out.
        // Let's try mixing? OR just standard 'solid' lightened color?
        // Simplest: Use an overlay box inside, or change bgcolor.
        // Let's stick to the current structure but add an overlay for tint.
    }

    // Style logic for Colored Bars
    const getBarStyle = () => {
        if (!tile.color) return {};
        const borderStyle = `8px solid ${tile.color}`;
        if (row === 17) return { borderTop: borderStyle };
        if (col === 1) return { borderRight: borderStyle };
        if (row === 1) return { borderBottom: borderStyle };
        if (col === 17) return { borderLeft: borderStyle };
        return {};
    };

    return (
        <Box
            onClick={onClick}
            sx={{
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                p: 0.5,
                bgcolor: bgColor,
                border: 1,
                borderColor: 'grey.400',
                color: 'common.black',
                overflow: 'hidden',
                userSelect: 'none',
                cursor: 'pointer',
                transition: 'transform 0.1s, z-index 0.1s',
                '&:hover': { zIndex: 60, transform: 'scale(1.15)', boxShadow: 6 },
                ...getBarStyle(),
                gridRow: row,
                gridColumn: col,
            }}
            title={tile.name}
        >
            {/* Owner Background Tint Overlay */}
            {ownerColor && (
                <Box sx={{ position: 'absolute', inset: 0, bgcolor: ownerColor, opacity: 0.25, pointerEvents: 'none', zIndex: 0 }} />
            )}



            {/* Tile Name - Larger Font */}
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 0.2, pt: tile.groupName ? 1.5 : 0, zIndex: 1 }}>
                <Typography variant="caption" sx={{ fontSize: `${(0.55 * fontScale)}rem`, fontWeight: 'bold', lineHeight: 1.1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', '@media (min-width:600px)': { fontSize: `${0.7 * fontScale}rem` } }}>
                    {tile.name}
                </Typography>
            </Box>

            {/* Price */}
            {tile.price && (
                <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 'bold', fontSize: `${0.7 * fontScale}rem`, pb: 0.5, zIndex: 1 }}>
                    {tile.price}m
                </Typography>
            )}

            {/* Icons Watermark */}
            {tile.type === 'RAILROAD' && <WatermarkIcon icon={<Train fontSize="large" />} />}
            {tile.type === 'UTILITY' && <WatermarkIcon icon={<Lightbulb fontSize="large" />} />}
            {tile.type === 'CHANCE' && <WatermarkIcon icon={<HelpOutline fontSize="large" />} />}
            {tile.type === 'COMMUNITY' && <WatermarkIcon icon={<Inventory2 fontSize="large" />} />}
        </Box>
    );
}

function WatermarkIcon({ icon }: { icon: React.ReactNode }) {
    return (
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.15, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {icon}
        </Box>
    );
}
