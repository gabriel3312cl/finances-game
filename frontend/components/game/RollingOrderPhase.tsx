'use client';
import React from 'react';
import { Box, Button, Typography, Paper, LinearProgress, Chip } from '@mui/material';
import { Casino } from '@mui/icons-material';

interface RollingOrderPhaseProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function RollingOrderPhase({ gameState, user, sendMessage }: RollingOrderPhaseProps) {
    const orderRolls = gameState.order_rolls || {};
    const players = gameState.players || [];
    const hasRolled = orderRolls[user?.user_id] !== undefined;
    const allRolled = Object.keys(orderRolls).length === players.length;

    return (
        <Box sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#0f172a',
            p: 4
        }}>
            <Paper sx={{
                p: 4,
                maxWidth: 600,
                width: '100%',
                bgcolor: '#1e293b',
                borderRadius: 4,
                border: '2px solid',
                borderColor: 'primary.main'
            }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Casino sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
                        Determinando Orden de Turnos
                    </Typography>
                    <Typography variant="body1" color="grey.400">
                        Cada jugador debe tirar los dados. El que saque el resultado más alto comienza.
                    </Typography>
                </Box>

                {/* Progress */}
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="grey.500">
                            Progreso
                        </Typography>
                        <Typography variant="caption" color="grey.500">
                            {Object.keys(orderRolls).length} / {players.length}
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={(Object.keys(orderRolls).length / players.length) * 100}
                        sx={{ height: 8, borderRadius: 4 }}
                    />
                </Box>

                {/* Players List */}
                <Box sx={{ mb: 3 }}>
                    {players.map((p: any) => {
                        const roll = orderRolls[p.user_id];
                        const isMe = p.user_id === user?.user_id;
                        return (
                            <Box key={p.user_id} sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                p: 2,
                                mb: 1,
                                bgcolor: isMe ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.05)',
                                borderRadius: 2,
                                border: 1,
                                borderColor: isMe ? 'primary.main' : 'transparent'
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        bgcolor: p.token_color
                                    }} />
                                    <Typography color="white" fontWeight={isMe ? 'bold' : 'normal'}>
                                        {p.name} {isMe && '(Tú)'}
                                    </Typography>
                                </Box>
                                {roll !== undefined ? (
                                    <Chip
                                        label={`🎲 ${roll}`}
                                        color="success"
                                        size="small"
                                        sx={{ fontWeight: 'bold' }}
                                    />
                                ) : (
                                    <Chip
                                        label="Esperando..."
                                        size="small"
                                        variant="outlined"
                                    />
                                )}
                            </Box>
                        );
                    })}
                </Box>

                {/* Action Button */}
                {!hasRolled && !allRolled && (
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={() => sendMessage('ROLL_ORDER', {})}
                        sx={{
                            py: 1.5,
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(45deg, #3b82f6 30%, #8b5cf6 90%)',
                            '&:hover': {
                                background: 'linear-gradient(45deg, #2563eb 30%, #7c3aed 90%)',
                            }
                        }}
                    >
                        <Casino sx={{ mr: 1 }} />
                        TIRAR DADOS
                    </Button>
                )}

                {hasRolled && !allRolled && (
                    <Typography variant="body2" color="success.main" textAlign="center" fontWeight="bold">
                        ✓ Has tirado. Esperando a los demás jugadores...
                    </Typography>
                )}
            </Paper>

            {/* Game Log */}
            <Box sx={{ mt: 4, maxWidth: 600, width: '100%' }}>
                <Typography variant="overline" color="grey.600" gutterBottom>
                    Registro
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', maxHeight: 200, overflowY: 'auto' }}>
                    {gameState.logs?.slice(-5).reverse().map((log: any, idx: number) => (
                        <Typography key={idx} variant="caption" color="grey.400" display="block">
                            {log.message}
                        </Typography>
                    ))}
                </Paper>
            </Box>
        </Box>
    );
}
