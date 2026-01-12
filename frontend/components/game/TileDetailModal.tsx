'use client';
import React from 'react';
import { TileData } from '@/config/boardData';
import { Dialog, DialogTitle, DialogContent, Typography, Box, Chip, Divider, Grid, Button } from '@mui/material';
import { House, MonetizationOn, VpnKey } from '@mui/icons-material';
import { getContrastColor } from '@/theme';

interface TileDetailModalProps {
    tile: TileData | null;
    gameState: any;
    onClose: () => void;
}

// Classic Monopoly Title Deed Design
export default function TileDetailModal({ tile, gameState, onClose }: TileDetailModalProps) {
    if (!tile) return null;

    const propertyId = tile.propertyId;
    const ownerId = propertyId ? gameState?.property_ownership?.[propertyId] : null;
    const owner = ownerId ? gameState?.players?.find((p: any) => p.user_id === ownerId) : null;
    const isOwned = !!owner;

    return (
        <Dialog
            open={!!tile}
            onClose={onClose}
            maxWidth="xs"
            PaperProps={{
                sx: {
                    borderRadius: 0,
                    border: '2px solid black',
                    boxShadow: '10px 10px 0px rgba(0,0,0,0.5)',
                    overflow: 'visible'
                }
            }}
        >
            <Box sx={{ p: 2, bgcolor: 'white', color: 'black', border: '1px solid black', m: 0.5, minHeight: 400, display: 'flex', flexDirection: 'column' }}>

                {/* HEADER */}
                {tile.type === 'PROPERTY' && (
                    <Box sx={{
                        bgcolor: tile.color || 'grey.800',
                        color: getContrastColor(tile.color || '#333'), // Dynamic Text Color
                        textAlign: 'center',
                        border: '2px solid black',
                        mb: 2,
                        py: 2
                    }}>
                        <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', letterSpacing: 1, fontWeight: 'bold', color: 'inherit', opacity: 0.9 }}>
                            TITULO DE PROPIEDAD
                        </Typography>
                        {tile.groupName && (
                            <Typography variant="subtitle2" sx={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', mt: 0.5, mb: 0.5, color: 'inherit' }}>
                                {tile.groupName}
                            </Typography>
                        )}
                        <Typography variant="h5" sx={{ fontWeight: '900', textTransform: 'uppercase', lineHeight: 1.1, color: 'inherit', mt: 0.5 }}>
                            {tile.name}
                        </Typography>
                    </Box>
                )}

                {/* NON-PROPERTY HEADER */}
                {tile.type !== 'PROPERTY' && (
                    <Box sx={{ textAlign: 'center', mb: 2 }}>
                        <Typography variant="h5" fontWeight="bold" color="black">{tile.name}</Typography>
                        <Typography variant="overline" color="text.secondary">{tile.type}</Typography>
                    </Box>
                )}

                {/* CONTENT */}
                <Box sx={{ flex: 1, px: 2, textAlign: 'center' }}>
                    {propertyId ? (
                        <>
                            {/* OWNER CHIP */}
                            {isOwned && (
                                <Box sx={{ mb: 2, textAlign: 'center' }}>
                                    <Chip
                                        label={`Propiedad de: ${owner.name}`}
                                        color="success"
                                        variant="filled"
                                        size="small"
                                        sx={{ borderRadius: 1, fontWeight: 'bold' }}
                                    />
                                </Box>
                            )}

                            {tile.type === 'PROPERTY' ? (
                                <>
                                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold', color: 'black' }}>ALQUILER ${tile.rent_base}</Typography>

                                    <Box sx={{ textAlign: 'left', mb: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <RentRow label="con 1 Casa" value={tile.rent_1_house} />
                                        <RentRow label="con 2 Casas" value={tile.rent_2_house} />
                                        <RentRow label="con 3 Casas" value={tile.rent_3_house} />
                                        <RentRow label="con 4 Casas" value={tile.rent_4_house} />

                                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                                            <Typography variant="body2" sx={{ color: 'black' }}>Con HOTEL ${tile.rent_hotel}</Typography>
                                        </Box>
                                    </Box>

                                    <Divider sx={{ bgcolor: 'black', mb: 2 }} />

                                    <Typography variant="body2" sx={{ mb: 0.5, color: 'black' }}>Valor Hipoteca ${tile.mortgage_value}</Typography>
                                    <Typography variant="body2" sx={{ mb: 0.5, color: 'black' }}>Coste de casas ${tile.house_cost}. cada una</Typography>
                                    <Typography variant="body2" sx={{ mb: 1, color: 'black' }}>Hoteles, ${tile.hotel_cost}. más 4 casas</Typography>

                                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', lineHeight: 1.2, mt: 2, fontStyle: 'italic', color: 'black' }}>
                                        Si un jugador posee TODOS los solares de un Grupo de Color, el alquiler se duplica en los solares sin edificar de ese grupo.
                                    </Typography>
                                </>
                            ) : (
                                <Box sx={{ py: 4 }}>
                                    <Typography variant="body1" color="black">Precio: ${tile.price}</Typography>
                                    <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                                        La renta depende de la tirada de dados o cantidad de estaciones poseídas.
                                    </Typography>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{ py: 4 }}>
                            <Typography color="black">Esta casilla no tiene título de propiedad.</Typography>
                        </Box>
                    )}
                </Box>

                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button onClick={onClose} sx={{ color: 'black', fontWeight: 'bold', border: '1px solid black' }}>CERRAR</Button>
                </Box>
            </Box>
        </Dialog>
    );
}

function RentRow({ label, value, valueText, isActive = false }: { label: string, value?: number, valueText?: string, isActive?: boolean }) {
    return (
        <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            bgcolor: isActive ? 'rgba(57, 255, 20, 0.2)' : 'transparent',
            borderRadius: 1,
            px: 0.5
        }}>
            <Typography variant="body2" sx={{ color: 'black', fontWeight: isActive ? 'bold' : 'normal' }}>{label}</Typography>
            <Typography variant="body2" sx={{ color: 'black', fontWeight: isActive ? 'bold' : 'normal' }}>{valueText || (value ? `$${value}` : '-')}</Typography>
        </Box>
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
