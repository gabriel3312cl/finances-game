'use client';
import React, { useState } from 'react';
// import { boardTiles } from '@/config/boardData';
import {
    Drawer, Box, Typography, IconButton, Tabs, Tab,
    Card, CardContent, Divider, List, ListItem,
    ListItemText, Button, TextField, Chip
} from '@mui/material';
import { Close, AccountBalance, Business, AttachMoney } from '@mui/icons-material';

interface InventoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function InventoryDrawer({ isOpen, onClose, gameState, user, sendMessage }: InventoryDrawerProps) {
    const [activeTab, setActiveTab] = useState(0);
    const [loanAmount, setLoanAmount] = useState('');

    if (!user || !gameState) return null;

    // Filter properties owned by this user
    // Filter properties owned by this user
    const board = gameState.board || [];
    const myProperties = board.filter((tile: any) => {
        if (!tile.property_id) return false;
        // Check ownership from map or tile itself if available
        // gameState.property_ownership is map[propID] -> userID
        const owner = gameState.property_ownership?.[tile.property_id];
        return owner === user.user_id && (tile.type === 'PROPERTY' || tile.type === 'UTILITY' || tile.type === 'RAILROAD');
    });

    const totalAssetValue = myProperties.reduce((acc, tile) => acc + (tile.price || 0), 0);
    const myPlayer = gameState.players?.find((p: any) => p.user_id === user.user_id);
    const balance = myPlayer?.balance || 0;
    const loan = myPlayer?.loan || 0;
    const netWorth = balance + totalAssetValue - loan;

    const handleTransaction = (type: 'TAKE' | 'PAY') => {
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
                        Mi Portafolio
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
                                    No tienes propiedades aún.
                                </Typography>
                            ) : (
                                <List>
                                    {myProperties.map((tile: any) => (
                                        <Card key={tile.id} variant="outlined" sx={{ mb: 1, display: 'flex', overflow: 'hidden' }}>
                                            <Box sx={{ width: 12, bgcolor: tile.group_color || 'grey.500' }} />
                                            <CardContent sx={{ flex: 1, py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                                                <Typography variant="subtitle2" fontWeight="bold">{tile.name}</Typography>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Typography variant="caption" color="text.secondary">{tile.group_name}</Typography>
                                                    <Chip size="small" label={`$${tile.price}`} color="primary" variant="outlined" />
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </List>
                            )}
                        </Box>
                    ) : (
                        // BANK TAB
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Card variant="outlined" sx={{ textAlign: 'center', p: 2 }}>
                                <Typography variant="caption" color="text.secondary">Préstamo Actual</Typography>
                                <Typography variant="h4" color="error" fontWeight="bold">${loan.toLocaleString()}</Typography>
                                <Typography variant="caption" color="text.secondary">Máximo permitido: $5,000</Typography>
                            </Card>

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
                        </Box>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
