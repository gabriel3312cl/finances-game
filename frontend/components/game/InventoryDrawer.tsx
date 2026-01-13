'use client';
import React, { useState } from 'react';
// import { boardTiles } from '@/config/boardData';
import {
    Drawer, Box, Typography, IconButton, Tabs, Tab,
    Card, CardContent, Divider, List, ListItem,
    ListItemText, Button, TextField, Chip
} from '@mui/material';
import { Close, AccountBalance, Business, AttachMoney } from '@mui/icons-material';
import PlayerToken from './PlayerToken';

interface InventoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
    onPropertyClick?: (tile: any) => void;
}

export default function InventoryDrawer({ isOpen, onClose, gameState, user, sendMessage, targetPlayerId, onPropertyClick }: InventoryDrawerProps & { targetPlayerId?: string }) {
    const [activeTab, setActiveTab] = useState(0);
    const [loanAmount, setLoanAmount] = useState('');

    // Reset state on close
    React.useEffect(() => {
        if (!isOpen) {
            setActiveTab(0);
            setLoanAmount('');
        }
    }, [isOpen]);

    if (!user || !gameState) return null;

    // Determine whose inventory to show
    const isMe = !targetPlayerId || targetPlayerId === user.user_id;
    const playerId = targetPlayerId || user.user_id;
    const player = gameState.players?.find((p: any) => p.user_id === playerId);

    if (!player) return null; // Should not happen

    // Filter properties owned by this player
    const board = gameState.board || [];
    const myProperties = board.filter((tile: any) => {
        if (!tile.property_id) return false;
        // Check ownership from map or tile itself if available
        // gameState.property_ownership is map[propID] -> userID
        const owner = gameState.property_ownership?.[tile.property_id];
        return owner === playerId && (
            tile.type === 'PROPERTY' ||
            tile.type === 'UTILITY' ||
            tile.type === 'RAILROAD' ||
            tile.type === 'ATTRACTION' ||
            tile.type === 'PARK'
        );
    }).sort((a: any, b: any) => {
        // Sort by Price Descending (Expensive First -> implicitly sorts by Color Group Value)
        return (b.price || 0) - (a.price || 0);
    });

    const totalAssetValue = myProperties.reduce((acc: any, tile: any) => acc + (tile.price || 0), 0);
    const balance = player.balance || 0;
    const loan = player.loan || 0;
    const netWorth = balance + totalAssetValue - loan;

    // Credit System
    const credit = player.credit || { score: 700, rounds_in_debt: 0, current_round: 0, last_loan_round: 0 };
    const creditScore = credit.score || 700;
    const roundsInDebt = credit.rounds_in_debt || 0;

    // Calculate dynamic rate and limit based on score
    const getInterestRate = (score: number) => {
        if (score >= 750) return 5;
        if (score >= 700) return 10;
        if (score >= 650) return 15;
        if (score >= 550) return 25;
        return 35;
    };
    const getCreditLimit = (score: number) => {
        if (score >= 750) return 8000;
        if (score >= 700) return 6000;
        if (score >= 650) return 4000;
        if (score >= 550) return 2000;
        return 500;
    };
    const getCreditColor = (score: number) => {
        if (score >= 750) return '#22c55e'; // Green
        if (score >= 700) return '#84cc16'; // Lime
        if (score >= 650) return '#eab308'; // Yellow
        if (score >= 550) return '#f97316'; // Orange
        return '#ef4444'; // Red
    };

    const interestRate = getInterestRate(creditScore);
    const creditLimit = getCreditLimit(creditScore);
    const creditColor = getCreditColor(creditScore);

    const handleTransaction = (type: 'TAKE' | 'PAY') => {
        if (!isMe) return; // Guard
        const amount = parseInt(loanAmount);
        if (!amount || amount <= 0) return;
        sendMessage(type === 'TAKE' ? 'TAKE_LOAN' : 'PAY_LOAN', { amount });
        setLoanAmount('');
    };

    return (
        <Drawer
            anchor="right"
            open={isOpen}
            onClose={onClose}
            PaperProps={{
                sx: { width: { xs: '100%', sm: 400 }, bgcolor: 'background.paper' }
            }}
        >
            <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" fontWeight="bold">
                        {isMe ? 'Mi Portafolio' : `Portafolio de ${player.name}`}
                    </Typography>
                    <IconButton onClick={onClose}>
                        <Close />
                    </IconButton>
                </Box>

                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="fullWidth"
                    indicatorColor="secondary"
                    textColor="secondary"
                    sx={{ mb: 3 }}
                >
                    <Tab icon={<Business />} label="ACTIVOS" />
                    <Tab icon={<AccountBalance />} label="BANCO" />
                </Tabs>

                {/* Summary Card */}
                <Card variant="outlined" sx={{ mb: 3, bgcolor: 'action.hover' }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography color="text.secondary">Efectivo</Typography>
                            <Typography color="success.main" fontWeight="bold">${balance.toLocaleString()}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography color="text.secondary">Propiedades</Typography>
                            <Typography color="info.main" fontWeight="bold">${totalAssetValue.toLocaleString()}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography color="text.secondary">Deuda</Typography>
                            <Typography color="error.main" fontWeight="bold">-${loan.toLocaleString()}</Typography>
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography fontWeight="bold">Patrimonio Neto</Typography>
                            <Typography color="warning.main" fontWeight="bold">${netWorth.toLocaleString()}</Typography>
                        </Box>
                    </CardContent>
                </Card>

                {/* Content */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {activeTab === 0 ? (
                        // ASSETS TAB
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight="bold">
                                Títulos de Propiedad ({myProperties.length})
                            </Typography>

                            {myProperties.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4, fontStyle: 'italic' }}>
                                    {isMe ? 'No tienes propiedades aún.' : 'Este jugador no tiene propiedades.'}
                                </Typography>
                            ) : (
                                <List>
                                    {myProperties.map((tile: any) => {
                                        // Find players on this tile
                                        const visitors = gameState.players?.filter((p: any) => p.position === tile.id && p.user_id !== user.user_id) || [];

                                        return (
                                            <Card
                                                key={tile.id}
                                                variant="outlined"
                                                sx={{
                                                    mb: 1, display: 'flex', flexDirection: 'column', overflow: 'visible', position: 'relative',
                                                    borderColor: tile.is_mortgaged ? 'error.main' : undefined,
                                                    opacity: tile.is_mortgaged ? 0.7 : 1
                                                }}
                                            >
                                                {/* VISITOR AVATARS */}
                                                {visitors.length > 0 && (
                                                    <Box sx={{ position: 'absolute', top: -8, right: -8, display: 'flex', gap: -1 }}>
                                                        {visitors.map((v: any) => (
                                                            <Box key={v.user_id} sx={{ width: 24, height: 24, border: '2px solid white', borderRadius: '50%', overflow: 'hidden', boxShadow: 2 }}>
                                                                <PlayerToken color={v.token_color} name={v.name} isCurrentTurn={false} />
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}

                                                <Box sx={{ display: 'flex' }}>
                                                    <Box sx={{ width: 12, bgcolor: tile.group_color || 'grey.500' }} />
                                                    <CardContent
                                                        sx={{ flex: 1, py: 1, px: 2, '&:last-child': { pb: 1 }, cursor: onPropertyClick ? 'pointer' : 'default' }}
                                                        onClick={() => onPropertyClick && onPropertyClick(tile)}
                                                    >
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="subtitle2" fontWeight="bold">{tile.name}</Typography>
                                                            {tile.is_mortgaged && (
                                                                <Chip size="small" label="HIPOTECADA" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
                                                            )}
                                                            {tile.building_count > 0 && tile.building_count < 5 && (
                                                                <Chip size="small" label={`${tile.building_count} 🏠`} color="success" sx={{ height: 18, fontSize: '0.65rem' }} />
                                                            )}
                                                            {tile.building_count === 5 && (
                                                                <Chip size="small" label="🏨" color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />
                                                            )}
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Typography variant="caption" color="text.secondary">{tile.group_name}</Typography>
                                                            <Chip size="small" label={`$${tile.price}`} color="primary" variant="outlined" />
                                                        </Box>
                                                    </CardContent>
                                                </Box>

                                                {/* Action Buttons - Only show for own properties */}
                                                {isMe && (
                                                    <Box sx={{ display: 'flex', gap: 0.5, p: 1, pt: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                        {!tile.is_mortgaged && tile.building_count === 0 && (
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="warning"
                                                                sx={{ flex: 1, fontSize: '0.7rem', py: 0.3 }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    sendMessage('MORTGAGE_PROPERTY', { property_id: tile.property_id });
                                                                }}
                                                            >
                                                                Hipotecar (${tile.mortgage_value || Math.floor(tile.price / 2)})
                                                            </Button>
                                                        )}
                                                        {tile.is_mortgaged && (
                                                            <Button
                                                                size="small"
                                                                variant="contained"
                                                                color="success"
                                                                sx={{ flex: 1, fontSize: '0.7rem', py: 0.3 }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    sendMessage('UNMORTGAGE_PROPERTY', { property_id: tile.property_id });
                                                                }}
                                                            >
                                                                Deshipotecar (${tile.unmortgage_value || Math.floor((tile.mortgage_value || tile.price / 2) * 1.1)})
                                                            </Button>
                                                        )}
                                                        {tile.building_count === 0 && (
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="error"
                                                                sx={{ flex: 1, fontSize: '0.7rem', py: 0.3 }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm(`¿Vender ${tile.name} al banco por $${Math.floor(tile.price / 2)}?`)) {
                                                                        sendMessage('SELL_PROPERTY', { property_id: tile.property_id });
                                                                    }
                                                                }}
                                                            >
                                                                Vender (${Math.floor(tile.price / 2)})
                                                            </Button>
                                                        )}
                                                    </Box>
                                                )}
                                            </Card>
                                        )
                                    })}
                                </List>
                            )}
                        </Box>
                    ) : (
                        // BANK TAB
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* Credit Score Card */}
                            <Card variant="outlined" sx={{ textAlign: 'center', p: 2, borderColor: creditColor, borderWidth: 2 }}>
                                <Typography variant="caption" color="text.secondary">Puntaje Crediticio</Typography>
                                <Typography variant="h3" fontWeight="bold" sx={{ color: creditColor }}>
                                    {creditScore}
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                                    <Chip label={`Tasa: ${interestRate}%`} size="small" color={interestRate <= 10 ? 'success' : interestRate <= 15 ? 'warning' : 'error'} />
                                    <Chip label={`Límite: $${creditLimit.toLocaleString()}`} size="small" variant="outlined" />
                                </Box>
                                {roundsInDebt > 0 && (
                                    <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                                        ⚠️ {roundsInDebt} ronda(s) en deuda {roundsInDebt >= 3 && '(+10% penalización)'}
                                    </Typography>
                                )}
                            </Card>

                            {/* Current Loan */}
                            <Card variant="outlined" sx={{ textAlign: 'center', p: 2 }}>
                                <Typography variant="caption" color="text.secondary">Préstamo Actual</Typography>
                                <Typography variant="h4" color={loan > 0 ? 'error' : 'success'} fontWeight="bold">
                                    ${loan.toLocaleString()}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Disponible: ${(creditLimit - loan).toLocaleString()}
                                </Typography>
                            </Card>

                            {isMe ? (
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Gestionar Préstamo</Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                        {[100, 500, 1000].map(amt => (
                                            <Button
                                                key={amt}
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                onClick={() => setLoanAmount(amt.toString())}
                                            >
                                                ${amt}
                                            </Button>
                                        ))}
                                    </Box>

                                    <TextField
                                        fullWidth
                                        label="Cantidad Personalizada"
                                        type="number"
                                        value={loanAmount}
                                        onChange={(e) => setLoanAmount(e.target.value)}
                                        InputProps={{ startAdornment: <AttachMoney fontSize="small" /> }}
                                        sx={{ mb: 2 }}
                                    />

                                    <Button
                                        fullWidth
                                        variant="contained"
                                        color="success"
                                        onClick={() => handleTransaction('TAKE')}
                                        disabled={!loanAmount}
                                        sx={{ mb: 1 }}
                                    >
                                        SOLICITAR PRÉSTAMO
                                    </Button>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        color="info"
                                        onClick={() => handleTransaction('PAY')}
                                        disabled={!loanAmount}
                                    >
                                        PAGAR DEUDA
                                    </Button>
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                                    Solo el propietario puede gestionar sus préstamos.
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
