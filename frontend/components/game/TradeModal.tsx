'use client';
import React, { useState } from 'react';
// import { boardTiles } from '@/config/boardData';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, TextField, Checkbox, FormControlLabel,
    MenuItem, Select, InputLabel, FormControl, Paper,
    IconButton, Fab
} from '@mui/material';
import { Handshake, SwapHoriz, Close } from '@mui/icons-material';

interface TradeModalProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export default function TradeModal({ gameState, user, sendMessage, isOpen = false, onClose }: TradeModalProps) {
    const [localIsOpen, setLocalIsOpen] = useState(false);

    // Use external props if provided, otherwise internal state (keep backward compat if needed, but we will move to external)
    const effectiveIsOpen = onClose ? isOpen : localIsOpen;
    const handleClose = onClose ? onClose : () => setLocalIsOpen(false);
    const [targetId, setTargetId] = useState('');
    const [offerProperties, setOfferProperties] = useState<string[]>([]);
    const [requestProperties, setRequestProperties] = useState<string[]>([]);
    const [offerCash, setOfferCash] = useState('');
    const [requestCash, setRequestCash] = useState('');

    if (!user || !gameState) return null;

    const activeTrade = gameState?.active_trade;
    const isIncomingTrade = activeTrade && activeTrade.target_id === user.user_id;

    // Filter properties owned by user and potential targets
    const board = gameState?.board || [];

    // My Properties
    const myProperties = board.filter((t: any) =>
        t.property_id &&
        gameState?.property_ownership?.[t.property_id] === user.user_id &&
        (t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD')
    );

    const otherPlayers = gameState.players?.filter((p: any) => p.user_id !== user.user_id) || [];

    // Helper to find name by ID
    const getPropertyName = (id: string) => {
        const tile = board.find((t: any) => t.property_id === id);
        return tile ? tile.name : id;
    };

    const handleSendTrade = () => {
        if (!targetId) return;
        sendMessage('INITIATE_TRADE', {
            target_id: targetId,
            offer_properties: offerProperties,
            offer_cash: parseInt(offerCash) || 0,
            request_properties: requestProperties,
            request_cash: parseInt(requestCash) || 0
        });
        handleClose();
    };

    const handleAccept = () => sendMessage('ACCEPT_TRADE', {});
    const handleReject = () => sendMessage('REJECT_TRADE', {});

    // --- INCOMING TRADE DIALOG ---
    if (isIncomingTrade) {
        return (
            <Dialog open={true} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'warning.main', color: 'common.black', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Handshake /> ¡Oferta de Intercambio!
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Typography align="center" variant="h6" gutterBottom>
                        <Box component="span" fontWeight="bold">{activeTrade.offerer_name}</Box> quiere negociar contigo.
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        {/* You Get */}
                        <Box sx={{ flex: 1 }}>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.light', height: '100%' }}>
                                <Typography variant="subtitle2" color="success.dark" fontWeight="bold" gutterBottom>RECIBES</Typography>
                                <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                    {activeTrade.offer_cash > 0 && <li><b>${activeTrade.offer_cash}</b></li>}
                                    {activeTrade.offer_properties?.map((id: string) => (
                                        <li key={id}>{getPropertyName(id)}</li>
                                    ))}
                                    {(!activeTrade.offer_properties?.length && !activeTrade.offer_cash) && <li><i>Nada</i></li>}
                                </Box>
                            </Paper>
                        </Box>

                        {/* You Give */}
                        <Box sx={{ flex: 1 }}>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'error.light', height: '100%' }}>
                                <Typography variant="subtitle2" color="error.dark" fontWeight="bold" gutterBottom>ENTREGAS</Typography>
                                <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                    {activeTrade.request_cash > 0 && <li><b>${activeTrade.request_cash}</b></li>}
                                    {activeTrade.request_properties?.map((id: string) => (
                                        <li key={id}>{getPropertyName(id)}</li>
                                    ))}
                                    {(!activeTrade.request_properties?.length && !activeTrade.request_cash) && <li><i>Nada</i></li>}
                                </Box>
                            </Paper>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                    <Button onClick={handleReject} variant="outlined" color="error" fullWidth sx={{ mr: 1 }}>
                        RECHAZAR
                    </Button>
                    <Button onClick={handleAccept} variant="contained" color="success" fullWidth sx={{ ml: 1 }}>
                        ACEPTAR TRATO
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    // --- CREATE TRADE DIALOG ---
    // FAB moved to parent (GameBoard)
    return (
        <Dialog open={effectiveIsOpen} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Proponer Intercambio
                <IconButton onClick={handleClose}><Close /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Box sx={{ mb: 3 }}>
                    <FormControl fullWidth>
                        <InputLabel>Negociar con...</InputLabel>
                        <Select
                            value={targetId}
                            label="Negociar con..."
                            onChange={(e) => setTargetId(e.target.value)}
                        >
                            <MenuItem value=""><em>Seleccionar Jugador</em></MenuItem>
                            {otherPlayers.map((p: any) => (
                                <MenuItem key={p.user_id} value={p.user_id}>{p.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {targetId && (
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
                        {/* Offer Column */}
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" color="success.main" gutterBottom>Tu Oferta</Typography>
                            <TextField
                                fullWidth
                                label="Efectivo"
                                type="number"
                                value={offerCash}
                                onChange={(e) => setOfferCash(e.target.value)}
                                size="small"
                                sx={{ mb: 2 }}
                            />
                            <Typography variant="subtitle2" gutterBottom>Propiedades</Typography>
                            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', p: 1 }}>
                                {myProperties.length === 0 ? <Typography variant="caption" color="text.secondary">No tienes propiedades</Typography> : (
                                    myProperties.map((tile: any) => (
                                        <FormControlLabel
                                            key={tile.id}
                                            control={
                                                <Checkbox
                                                    checked={offerProperties.includes(tile.property_id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setOfferProperties([...offerProperties, tile.property_id]);
                                                        else setOfferProperties(offerProperties.filter(id => id !== tile.property_id));
                                                    }}
                                                />
                                            }
                                            label={<Typography variant="body2">{tile.name}</Typography>}
                                        />
                                    ))
                                )}
                            </Paper>
                        </Box>

                        {/* Request Column */}
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" color="error.main" gutterBottom>Tu Demanda</Typography>
                            <TextField
                                fullWidth
                                label="Efectivo"
                                type="number"
                                value={requestCash}
                                onChange={(e) => setRequestCash(e.target.value)}
                                size="small"
                                sx={{ mb: 2 }}
                            />
                            <Typography variant="subtitle2" gutterBottom>Propiedades</Typography>
                            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', p: 1 }}>
                                {(() => {
                                    const targetProps = board.filter((t: any) =>
                                        t.property_id &&
                                        gameState.property_ownership?.[t.property_id] === targetId &&
                                        (t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD')
                                    );

                                    if (targetProps.length === 0) return <Typography variant="caption" color="text.secondary">No tiene propiedades</Typography>;
                                    return targetProps.map((tile: any) => (
                                        <FormControlLabel
                                            key={tile.id}
                                            control={
                                                <Checkbox
                                                    checked={requestProperties.includes(tile.property_id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setRequestProperties([...requestProperties, tile.property_id]);
                                                        else setRequestProperties(requestProperties.filter(id => id !== tile.property_id));
                                                    }}
                                                />
                                            }
                                            label={<Typography variant="body2">{tile.name}</Typography>}
                                        />
                                    ));
                                })()}
                            </Paper>
                        </Box>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancelar</Button>
                <Button
                    onClick={handleSendTrade}
                    variant="contained"
                    color="warning"
                    disabled={!targetId}
                >
                    Enviar Oferta
                </Button>
            </DialogActions>
        </Dialog>
    );
}
