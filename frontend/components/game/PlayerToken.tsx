import React from 'react';
import { Box, Tooltip, Avatar } from '@mui/material';
import Token3D from './Token3D';

interface PlayerTokenProps {
    color: string;
    name: string;
    isCurrentTurn: boolean;
    size?: number | string;
    shape?: string;
}

const colorMap: Record<string, string> = {
    'RED': '#ef4444',
    'BLUE': '#3b82f6',
    'GREEN': '#22c55e',
    'YELLOW': '#eab308',
    'PURPLE': '#a855f7',
    'ORANGE': '#f97316',
    'CYAN': '#06b6d4',
    'PINK': '#ec4899',
    // ...
};

export default function PlayerToken({ color, name, isCurrentTurn, size = 24, shape = 'CUBE' }: PlayerTokenProps) {
    const bgColor = colorMap[color] || '#a855f7';
    const numSize = typeof size === 'number' ? size : 24;

    return (
        <Tooltip title={name} arrow>
            <Box
                sx={{
                    position: 'relative',
                    transition: 'all 0.3s ease',
                    zIndex: isCurrentTurn ? 50 : 20,
                    transform: isCurrentTurn ? 'scale(1.2)' : 'scale(1)',
                    '&:hover': { zIndex: 60, transform: 'scale(1.1)' },
                    width: size,
                    height: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {/* Use Token3D if shape is provided (default CUBE) */}
                <Box sx={{ pointerEvents: 'none' }}>
                    <Token3D color={color} shape={shape} size={numSize} animated={isCurrentTurn} />
                </Box>

                {/* Name Badge separate or overlay? 
                    Token3D is pure CSS, maybe hard to read text on it.
                    Let's put a tiny Avatar below or inside if it was 2D. 
                    For 3D, maybe just rely on Tooltip for name.
                    Or floating text.
                */}
            </Box>
        </Tooltip>
    );
}
