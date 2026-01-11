'use client';
import React, { useEffect, useState } from 'react';

import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, TextField, LinearProgress, Chip, Paper,
    InputAdornment, IconButton
} from '@mui/material';
import { Gavel, AccessTime, EmojiEvents } from '@mui/icons-material';

interface AuctionModalProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function AuctionModal({ gameState, user, sendMessage }: AuctionModalProps) {
    const auction = gameState?.active_auction;
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [customBid, setCustomBid] = useState<string>('');

    // Find Property Name from Board (Moved up to obey Hook Rules)
    const propertyName = React.useMemo(() => {
        if (!auction || !gameState?.board) return auction?.property_id;
        const tile = gameState.board.find((t: any) => t.property_id === auction.property_id);
        return tile ? tile.name : auction.property_id;
    }, [auction, gameState]);

    // Timer Logic
    useEffect(() => {
        if (!auction || !auction.is_active) return;

        const interval = setInterval(() => {
            const end = new Date(auction.end_time).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setTimeLeft(diff);

            if (diff <= 0) {
                // Trigger backend finalization
                sendMessage('FINALIZE_AUCTION', {});
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [auction]);

    if (!auction || !auction.is_active) return null;

    const currentBid = auction.highest_bid || 0;
    // const propertyName above replaces the boardTiles lookup
    const isWinning = auction.bidder_id === user?.user_id;

    const handleBid = (amount: number) => {
        sendMessage('BID', { amount });
        setCustomBid('');
    };

    return (
        <Dialog
            open={true}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    border: 2,
                    borderColor: 'warning.main',
                    bgcolor: 'grey.900',
                    backgroundImage: 'linear-gradient(to bottom right, #212121, #000000)'
                }
            }}
        >
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: isWinning ? 'success.main' : 'warning.main', boxShadow: isWinning ? '0 0 10px #4caf50' : 'none' }} />

            <DialogTitle sx={{ textAlign: 'center', color: 'common.white', textTransform: 'uppercase', letterSpacing: 2, pt: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Gavel fontSize="large" color="warning" />
                    SUBASTA
                </Box>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Typography variant="caption" color="grey.400">PROPIEDAD EN JUEGO</Typography>
                    <Typography variant="h5" color="warning.main" fontWeight="bold">
                        {propertyName}
                    </Typography>
                </Box>

                {/* Timer */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
                    <Typography variant="h2" fontFamily="monospace" fontWeight="bold" color={timeLeft < 10 ? 'error.main' : 'common.white'} sx={{ lineHeight: 1 }}>
                        00:{timeLeft.toString().padStart(2, '0')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'grey.500', mt: 1 }}>
                        <AccessTime fontSize="small" />
                        <Typography variant="caption">TIEMPO RESTANTE</Typography>
                    </Box>
                </Box>

                {/* Status Card */}
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.800', borderColor: 'grey.700', mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1 }}>
                        <Typography variant="body2" color="grey.400">Oferta Más Alta</Typography>
                        <Typography variant="h4" color="success.light" fontWeight="bold">${currentBid}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" color="grey.500">Líder</Typography>
                        {isWinning ? (
                            <Chip icon={<EmojiEvents />} label="¡TÚ!" color="success" size="small" />
                        ) : (
                            <Typography variant="body2" color="common.white">{auction.bidder_name || 'Nadie'}</Typography>
                        )}
                    </Box>
                </Paper>

                {/* Bidding Controls */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
                    {[10, 50, 100].map(inc => (
                        <Button
                            key={inc}
                            variant="outlined"
                            color="inherit"
                            sx={{ color: 'white', borderColor: 'grey.700' }}
                            onClick={() => handleBid(currentBid + inc)}
                        >
                            +${inc}
                        </Button>
                    ))}
                </Box>

                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Oferta Personalizada"
                    value={customBid}
                    onChange={(e) => setCustomBid(e.target.value)}
                    type="number"
                    size="small"
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Typography color="grey.400">$</Typography></InputAdornment>,
                        endAdornment: (
                            <InputAdornment position="end">
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="warning"
                                    onClick={() => {
                                        const val = parseInt(customBid);
                                        if (val > currentBid) handleBid(val);
                                    }}
                                    disabled={!customBid || parseInt(customBid) <= currentBid}
                                >
                                    OFERTAR
                                </Button>
                            </InputAdornment>
                        ),
                        sx: { color: 'white', bgcolor: 'grey.900' }
                    }}
                />

                {isWinning && (
                    <Typography
                        align="center"
                        variant="caption"
                        sx={{ display: 'block', mt: 2, color: 'success.main', fontWeight: 'bold', animation: 'pulse 1s infinite' }}
                    >
                        ¡VAS GANANDO!
                    </Typography>
                )}
            </DialogContent>
        </Dialog>
    );
}
