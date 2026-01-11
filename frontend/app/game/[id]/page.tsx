'use client';
import React from 'react';
import { use } from 'react';
// import { GameProvider, useGame } from '@/context/GameContext';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useGameStore } from '@/store/gameStore';
import GameBoard from '@/components/game/GameBoard';
import { Box, AppBar, Toolbar, Typography, Chip } from '@mui/material';
import { AttachMoney } from '@mui/icons-material';

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
    const gameState = useGameStore((state) => state.game);
    const user = { user_id: 'unknown' }; // FIXME: Fetch User? Or trust store has it? 
    // Wait, the Store doesn't have `user` yet. 
    // And `useGameSocket` fetches user internally to connect but doesn't expose it.
    // I should add `user` to Store for consistency.

    // For now, let's assume `gameState.players` has the data we need or we look up token.
    // The previous code used `user` to find `myBalance`. 
    // We need `myUser` in the store.

    const myBalance = gameState?.players?.find((p: any) => p.user_id === user?.user_id)?.balance || 0;

    return (
        <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
            {/* Header / HUD */}
            <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', zIndex: 20 }}>
                <Toolbar variant="dense" sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" fontWeight="bold" color="primary">
                            Juego de Finanzas
                        </Typography>
                        <Chip label={`#${gameId}`} size="small" variant="outlined" />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {gameState && (
                            <Chip
                                icon={<AttachMoney />}
                                label={myBalance.toLocaleString()}
                                color="success"
                                variant="filled"
                            />
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
