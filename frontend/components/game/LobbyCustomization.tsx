'use client';
import React, { useState } from 'react';
import { Box, Typography, Button, Paper, IconButton, Tooltip } from '@mui/material';
import { Circle, Hexagon, Square, ChangeHistory } from '@mui/icons-material';
import Token3D from './Token3D';

interface LobbyCustomizationProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
    onClose: () => void;
}

const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE', 'CYAN', 'PINK', 'GRAY'];
const SHAPES = [
    { id: 'CUBE', name: 'Cubo', icon: <Square /> },
    { id: 'PYRAMID', name: 'Pirámide', icon: <ChangeHistory /> },
    { id: 'COIN', name: 'Moneda', icon: <Circle /> },
    { id: 'DOG', name: 'Perro', icon: '🐕' },
    { id: 'CAT', name: 'Gato', icon: '🐈' },
    // { id: 'HORSE', name: 'Caballo', icon: '🐎' },
    { id: 'CAR', name: 'Auto', icon: '🚗' },
    { id: 'MAN', name: 'Hombre', icon: '👨' },
    { id: 'WOMAN', name: 'Mujer', icon: '👩' },
    { id: 'ROCKET', name: 'Cohete', icon: '🚀' },
    { id: 'FROG', name: 'Rana', icon: '🐸' },
    { id: 'MEME1', name: 'Meme', icon: '🤡' },
];

export default function LobbyCustomization({ gameState, user, sendMessage, onClose }: LobbyCustomizationProps) {
    const myPlayer = gameState?.players?.find((p: any) => p.user_id === user?.user_id);
    const [selectedColor, setSelectedColor] = useState(myPlayer?.token_color || 'RED');
    const [selectedShape, setSelectedShape] = useState(myPlayer?.token_shape || 'CUBE');

    const handleUpdate = (color: string, shape: string) => {
        setSelectedColor(color);
        setSelectedShape(shape);
        sendMessage('UPDATE_PLAYER_CONFIG', {
            token_color: color,
            token_shape: shape
        });
    };

    const handleReset = () => {
        // Random or Default
        handleUpdate('RED', 'CUBE');
    };

    return (
        <Box sx={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            bgcolor: 'rgba(15, 23, 42, 0.95)', // Overlay
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center', // Center vertically
            p: 2,
            overflowY: 'auto' // Allow scroll on small screens
        }}>
            <Typography variant="h3" sx={{
                color: 'white',
                fontWeight: 'bold',
                mb: 4,
                textTransparent: 'transparent',
                background: 'linear-gradient(45deg, #FFD700, #FFA500)',
                backgroundClip: 'text',
                textFillColor: 'transparent',
                textAlign: 'center'
            }}>
                PERSONALIZA TU TOKEN
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, alignItems: 'center', maxWidth: 'lg', width: '100%' }}>
                {/* PREVIEW */}
                <Box sx={{ display: 'flex', justifyContent: 'center', flex: 1, minHeight: 250 }}>
                    <Box sx={{
                        width: 300,
                        height: 300,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Stage effect
                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            bottom: 40,
                            width: 200,
                            height: 200,
                            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0) 70%)',
                            transform: 'scaleY(0.3)',
                            zIndex: -1
                        }
                    }}>
                        <Token3D color={myPlayer?.token_color || selectedColor} shape={myPlayer?.token_shape || selectedShape} size={150} animated={true} />
                    </Box>
                </Box>

                {/* CONTROLS */}
                <Box sx={{ flex: 1, width: '100%' }}>
                    <Paper sx={{ p: 4, bgcolor: '#1e293b', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>

                        <Typography variant="h6" color="grey.400" gutterBottom>FORMA DEL TOKEN</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
                            {SHAPES.map((shape) => (
                                <Tooltip title={shape.name} key={shape.id}>
                                    <Button
                                        variant={shape.id === (myPlayer?.token_shape || selectedShape) ? "contained" : "outlined"}
                                        onClick={() => handleUpdate(myPlayer?.token_color || selectedColor, shape.id)}
                                        sx={{
                                            minWidth: 60,
                                            height: 60,
                                            borderRadius: 2,
                                            borderColor: 'rgba(255,255,255,0.2)',
                                            fontSize: '1.5rem'
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                            {typeof shape.icon === 'string' ? shape.icon : shape.icon}
                                            {/* <Typography variant="caption" sx={{fontSize: '0.6rem'}}>{shape.name}</Typography> */}
                                        </Box>
                                    </Button>
                                </Tooltip>
                            ))}
                        </Box>

                        <Typography variant="h6" color="grey.400" gutterBottom>COLOR</Typography>
                        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 4 }}>
                            {COLORS.map((color) => (
                                <Box
                                    key={color}
                                    onClick={() => handleUpdate(color, myPlayer?.token_shape || selectedShape)}
                                    sx={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        bgcolor: getColorHex(color),
                                        cursor: 'pointer',
                                        border: '3px solid',
                                        borderColor: (myPlayer?.token_color || selectedColor) === color ? 'white' : 'transparent',
                                        transition: 'transform 0.2s',
                                        '&:hover': { transform: 'scale(1.1)' },
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                    }}
                                />
                            ))}
                        </Box>

                        {/* ACTIONS */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                            <Button color="inherit" onClick={handleReset}>RESETEAR</Button>
                            <Button variant="contained" color="success" size="large" onClick={onClose} sx={{ px: 4 }}>
                                LISTO (OK)
                            </Button>
                        </Box>

                    </Paper>
                </Box>
            </Box>

            <Typography variant="caption" color="grey.500" sx={{ mt: 2, mb: 2 }}>
                JUGADORES EN SALA ({gameState.players.length})
            </Typography>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', width: '100%', pb: 4 }}>
                {gameState.players.map((p: any) => (
                    <Box key={p.user_id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: p.user_id === user.user_id ? 1 : 0.7 }}>
                        <Box sx={{ width: 50, height: 50, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Token3D color={p.token_color} shape={p.token_shape} size={40} animated={true} />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'white', mt: 1 }}>{p.name}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function getColorHex(colorName: string) {
    const map: Record<string, string> = {
        'RED': '#ef4444', 'BLUE': '#3b82f6', 'GREEN': '#22c55e',
        'YELLOW': '#eab308', 'PURPLE': '#a855f7', 'ORANGE': '#f97316',
        'CYAN': '#06b6d4', 'PINK': '#ec4899', 'GRAY': '#9ca3af'
    };
    return map[colorName] || colorName;
}
