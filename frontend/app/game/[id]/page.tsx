'use client';
import React from 'react';
import { use } from 'react';
// import { GameProvider, useGame } from '@/context/GameContext';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useGameStore } from '@/store/gameStore';
import GameBoard from '@/components/game/GameBoard';
import { Box, AppBar, Toolbar, Typography, Chip, Paper } from '@mui/material';
import { AttachMoney, ExitToApp } from '@mui/icons-material';
import PlayerToken from '@/components/game/PlayerToken';
import Link from 'next/link';
import { IconButton, Tooltip } from '@mui/material';

interface GamePageProps {
    params: Promise<{ id: string }>
}

export default function GamePage({ params }: GamePageProps) {
    const { id } = use(params);
    return (
        <GameWrapper gameId={id} />
    );
}

function GameWrapper({ gameId }: { gameId: string }) {
    // Init Socket Connection (automatically joins on open)
    useGameSocket(gameId);

    // Get State from Store
    // Get State from Store
    const gameState = useGameStore((state) => state.game);
    const user = useGameStore((state) => state.user); // Get actual user

    const myPlayer = gameState?.players?.find((p: any) => p.user_id === user?.user_id);
    const myBalance = myPlayer?.balance || 0;

    return (
        <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
            {/* Header / HUD */}
            <AppBar position="static" color="transparent" elevation={0} sx={{
                bgcolor: 'rgba(20,20,20,0.95)',
                borderBottom: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                zIndex: 20,
                backdropFilter: 'blur(10px)'
            }}>
                <Toolbar variant="dense" sx={{ justifyContent: 'space-between', height: 60 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Link href="/">
                            <Tooltip title="Volver al Menú Principal">
                                <IconButton sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                                    <ExitToApp />
                                </IconButton>
                            </Tooltip>
                        </Link>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="h6" fontWeight="900" sx={{
                                background: 'linear-gradient(45deg, #FFD700, #FFA500)',
                                backgroundClip: 'text',
                                color: 'transparent',
                                letterSpacing: 1
                            }}>
                                MONOPOLY
                            </Typography>
                            {gameState && <Typography variant="caption" color="grey.500">SALA: {gameId}</Typography>}
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>


                        {/* Status Widget */}
                        {gameState && (
                            <Box sx={{
                                px: 2, py: 0.5,
                                borderRadius: 4,
                                bgcolor: gameState.status === 'ACTIVE' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                                border: 1,
                                borderColor: gameState.status === 'ACTIVE' ? 'success.main' : 'warning.main',
                                display: { xs: 'none', sm: 'block' }
                            }}>
                                <Typography variant="caption" fontWeight="bold" color={gameState.status === 'ACTIVE' ? 'success.main' : 'warning.main'}>
                                    {gameState.status === 'ACTIVE' ? 'EN JUEGO' : 'ESPERANDO'}
                                </Typography>
                            </Box>
                        )}

                        {/* WALLET WIDGET */}
                        {gameState && (
                            <Paper sx={{
                                px: 2.5, py: 1,
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
                                border: 1,
                                borderColor: 'rgba(255,255,255,0.15)',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                            }}>
                                <Box sx={{
                                    p: 0.8,
                                    borderRadius: '50%',
                                    bgcolor: 'rgba(76, 175, 80, 0.2)',
                                    display: 'flex',
                                    color: '#4caf50'
                                }}>
                                    <AttachMoney fontSize="small" />
                                </Box>
                                <Box>
                                    <Typography variant="caption" display="block" color="grey.500" lineHeight={1}>
                                        BALANCE
                                    </Typography>
                                    <Typography variant="h6" lineHeight={1} fontWeight="bold" sx={{ color: '#fff' }}>
                                        ${myBalance.toLocaleString()}
                                    </Typography>
                                </Box>
                            </Paper>
                        )}

                        {/* AVATAR */}
                        {myPlayer && (
                            <Box sx={{
                                width: 42, height: 42,
                                borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,0.1)',
                                overflow: 'hidden',
                                boxShadow: 4,
                                bgcolor: 'rgba(0,0,0,0.2)'
                            }}>
                                <PlayerToken color={myPlayer.token_color} name={myPlayer.name} isCurrentTurn={false} size="100%" />
                            </Box>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Main View */}
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <GameBoard />
            </Box>
        </Box>
    );
}
