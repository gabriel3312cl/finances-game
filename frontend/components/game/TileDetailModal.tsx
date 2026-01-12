'use client';
import React from 'react';
import { TileData } from '@/config/boardData';
import { Dialog, DialogTitle, DialogContent, Typography, Box, Chip, Divider, Grid, Button } from '@mui/material';
import { House, MonetizationOn, VpnKey } from '@mui/icons-material';

interface TileDetailModalProps {
    tile: TileData | null;
    gameState: any;
    onClose: () => void;
}

export default function TileDetailModal({ tile, gameState, onClose }: TileDetailModalProps) {
    if (!tile) return null;

    const propertyId = tile.propertyId;
    const ownerId = propertyId ? gameState?.property_ownership?.[propertyId] : null;
    const owner = ownerId ? gameState?.players?.find((p: any) => p.user_id === ownerId) : null;

    // Derived Data
    const isOwned = !!owner;
    const rent = tile.rent || Math.floor((tile.price || 0) * 0.1); // Fallback estimate if not in Data

    return (
        <Dialog open={!!tile} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ bgcolor: tile.color || 'grey.800', color: tile.color ? 'white' : 'white', textAlign: 'center', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                {tile.name}
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Typography variant="overline" color="text.secondary">TIPO: {tile.type}</Typography>
                    {tile.groupName && <Typography variant="caption" display="block" color="text.secondary">GRUPO: {tile.groupName}</Typography>}
                </Box>

                {propertyId ? (
                    <>
                        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                            {isOwned ? (
                                <Chip
                                    icon={<VpnKey />}
                                    label={`Propiedad de: ${owner.name}`}
                                    color="success"
                                    variant="outlined"
                                />
                            ) : (
                                <Chip
                                    icon={<MonetizationOn />}
                                    label={`Precio: $${tile.price}`}
                                    color="primary"
                                />
                            )}
                        </Box>

                        <PaperSection title="Alquiler">
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2">Base</Typography>
                                <Typography variant="body2" fontWeight="bold">${tile.rent_base}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: tile.rent_color_group ? 'primary.main' : 'text.disabled' }}>
                                <Typography variant="body2">Grupo Completo</Typography>
                                <Typography variant="body2">${tile.rent_color_group || (tile.rent_base || 0) * 2}</Typography>
                            </Box>
                            <Divider sx={{ my: 1 }} />
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.5 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">1 Casa</Typography><Typography variant="body2">${tile.rent_1_house}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">2 Casas</Typography><Typography variant="body2">${tile.rent_2_house}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">3 Casas</Typography><Typography variant="body2">${tile.rent_3_house}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">4 Casas</Typography><Typography variant="body2">${tile.rent_4_house}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}><Typography variant="body2">Hotel</Typography><Typography variant="body2">${tile.rent_hotel}</Typography></Box>
                            </Box>
                        </PaperSection>

                        <PaperSection title="Costos">
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2">Casa</Typography>
                                <Typography variant="body2" fontWeight="bold">${tile.house_cost}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2">Hotel</Typography>
                                <Typography variant="body2" fontWeight="bold">${tile.hotel_cost}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                <Typography variant="body2">Valor Hipoteca</Typography>
                                <Typography variant="body2">${tile.mortgage_value}</Typography>
                            </Box>
                        </PaperSection>
                    </>
                ) : (
                    <Typography align="center" fontStyle="italic" color="text.secondary">
                        Esta casilla no es una propiedad comprable.
                    </Typography>
                )}

                <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button onClick={onClose} variant="outlined" color="inherit">Cerrar</Button>
                </Box>
            </DialogContent >
        </Dialog >
    );
}

function PaperSection({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}
