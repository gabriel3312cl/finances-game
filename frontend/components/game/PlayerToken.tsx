import React from 'react';
import { Box, Tooltip, Avatar } from '@mui/material';

interface PlayerTokenProps {
    color: string;
    name: string;
    isCurrentTurn: boolean;
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
};

export default function PlayerToken({ color, name, isCurrentTurn }: PlayerTokenProps) {
    const bgColor = colorMap[color] || '#a855f7';

    return (
        <Tooltip title={name} arrow>
            <Box
                sx={{
                    position: 'relative',
                    transition: 'all 0.3s ease',
                    zIndex: isCurrentTurn ? 50 : 20,
                    transform: isCurrentTurn ? 'scale(1.2)' : 'scale(1)',
                    '&:hover': { zIndex: 60, transform: 'scale(1.1)' },
                }}
            >
                <Avatar
                    sx={{
                        width: 24,
                        height: 24,
                        bgcolor: bgColor,
                        border: 2,
                        borderColor: 'common.white',
                        fontSize: '0.6rem',
                        fontWeight: 'bold',
                        boxShadow: `0 0 10px ${bgColor}CC`,
                        animation: isCurrentTurn ? 'pulse 1.5s infinite' : 'none',
                        '@keyframes pulse': {
                            '0%': { boxShadow: `0 0 0 0 ${bgColor}99` },
                            '70%': { boxShadow: `0 0 0 6px ${bgColor}00` },
                            '100%': { boxShadow: `0 0 0 0 ${bgColor}00` },
                        },
                    }}
                >
                    {name.substring(0, 2).toUpperCase()}
                </Avatar>
            </Box>
        </Tooltip>
    );
}
