'use client';
import React from 'react';
import { TileData } from '@/config/boardData';
import { Dialog, Box, Typography, Chip, Divider, Button } from '@mui/material';
import { getContrastColor } from '@/theme';

interface TileDetailModalProps {
    tile: TileData | null;
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
    onClose: () => void;
    onPlayerClick?: (playerId: string) => void;
}

export default function TileDetailModal({ tile, gameState, user, sendMessage, onClose, onPlayerClick }: TileDetailModalProps) {
    if (!tile) return null;

    const propertyId = tile.propertyId;
    const ownerId = propertyId ? gameState?.property_ownership?.[propertyId] : null;
    const owner = ownerId ? gameState?.players?.find((p: any) => p.user_id === ownerId) : null;
    const isOwned = !!owner;

    const myUser = user;
    const isMeOwner = isOwned && myUser?.user_id === ownerId;
    // Determine if there is a victim on the tile to charge
    const potentialVictim = gameState?.players?.find((p: any) => p.position === tile.id && p.user_id !== ownerId);
    // Check if there's an active pending_rent for this property
    const pendingRent = gameState?.pending_rent;
    const hasPendingRentForThisProperty = pendingRent && pendingRent.property_id === propertyId && pendingRent.creditor_id === myUser?.user_id;
    // Can charge if: Is Owned, I am Owner, There is a Victim on tile, AND there is a pending rent for this property.
    const canCharge = isMeOwner && !!potentialVictim && hasPendingRentForThisProperty;

    const handleCharge = () => {
        if (!canCharge || !propertyId) return;
        sendMessage('PAY_RENT', { property_id: propertyId, target_id: potentialVictim.user_id });
        onClose();
    };

    // Calculate Owned Count in Group
    let ownedCount = 0;
    let isActiveLevel = -1; // -1: N/A, 0: Base, 1-4: Houses, 5: Hotel
    let isMonopoly = false;

    if (ownerId && gameState?.board) {
        const board = gameState.board;

        // Count owned in group
        const sameGroupTiles = board.filter((t: any) => {
            // Match logic from before
            if (tile.rent_rule === 'TRANSPORT_COUNT') return t.rent_rule === 'TRANSPORT_COUNT';
            if (tile.rent_rule === 'DICE_MULTIPLIER') return t.type === tile.type; // Utilities/Parks

            const targetGroup = tile.group_identifier || tile.groupId;
            if (!targetGroup) return false;
            return (t.group_identifier === targetGroup) || (t.groupId === targetGroup);
        });

        const totalInGroup = sameGroupTiles.length;
        ownedCount = sameGroupTiles.filter((t: any) => {
            const tilePropertyId = t.property_id || t.propertyId;
            return tilePropertyId && gameState.property_ownership?.[tilePropertyId] === ownerId;
        }).length;

        // Monopoly Logic for Standard Properties
        if (tile.type === 'PROPERTY') {
            isMonopoly = ownedCount === totalInGroup;
            // Find live tile data from board to get current building count
            const liveTile = board.find((t: any) => (t.id === tile.id) || (t.property_id === tile.propertyId));
            const houseCount = liveTile?.building_count || liveTile?.buildingCount || tile.buildingCount || 0;

            if (houseCount === 5) isActiveLevel = 5;
            else if (houseCount > 0) isActiveLevel = houseCount;
            else isActiveLevel = 0;
        } else {
            // For Specials, active level matches owned count usually
            isActiveLevel = ownedCount;
        }
    }

    // Helper for Row Opacity/Highlight
    // User wants:
    // 1. If not owned group (No Monopoly, Base Rent): "Blacken/Dim default option but maybe Red Highlight".
    // 2. If Monopoly/Houses: "Highlight corresponding option".
    // 3. Others: Dimmed ("Blackened").

    const getRowState = (levelOrIndex: number, isBaseProp: boolean = false) => {
        if (!isOwned) return { dimmed: false, active: false, bad: false }; // Show normal if unowned? Or everything normal.

        // If Owned:
        if (tile.type === 'PROPERTY') {
            if (levelOrIndex === isActiveLevel) {
                // Active Row
                if (levelOrIndex === 0 && !isMonopoly) return { dimmed: false, active: true, bad: true }; // Base Rent, No Monopoly -> Bad Active
                return { dimmed: false, active: true, bad: false }; // Good Active (Monopoly or Houses)
            }
            return { dimmed: true, active: false, bad: false };
        } else {
            // Specials
            // Level corresponds to ownedCount
            if (levelOrIndex === isActiveLevel) {
                return { dimmed: false, active: true, bad: false };
            }
            return { dimmed: true, active: false, bad: false };
        }
    };



    // Buying/Selling Logic
    const canBuy = isMeOwner && isMonopoly && isActiveLevel < 5 && gameState?.current_turn_id === user?.user_id; // + Even Build check (implicit backend, visual check ignored for now)
    const canSell = isMeOwner && isActiveLevel > 0 && gameState?.current_turn_id === user?.user_id;

    const handleBuyBuilding = () => {
        if (!canBuy) return;
        sendMessage("BUY_BUILDING", { property_id: propertyId });
    };

    const handleSellBuilding = () => {
        if (!canSell) return;
        sendMessage("SELL_BUILDING", { property_id: propertyId });
    };

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
                        color: getContrastColor(tile.color || '#333'),
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
                                    {/* Base Rent */}
                                    {(() => {
                                        const { dimmed, active, bad } = getRowState(0, true);
                                        // Show doubled rent if Monopoly and 0 houses
                                        const showDoubled = isMonopoly && isActiveLevel === 0 && tile.type === 'PROPERTY';
                                        const displayValue = showDoubled ? (tile.rent_color_group || (tile.rent_base ? tile.rent_base * 2 : 0)) : tile.rent_base;

                                        return (
                                            <Box sx={{ mb: 1 }}>
                                                <RentRow
                                                    label={showDoubled ? "ALQUILER (x2 por Grupo Computo)" : "ALQUILER"}
                                                    value={displayValue}
                                                    isActive={active}
                                                    isBad={bad}
                                                    isDimmed={dimmed}
                                                    onClick={active && canCharge ? handleCharge : undefined}
                                                />
                                            </Box>
                                        );
                                    })()}

                                    <Box sx={{ textAlign: 'left', mb: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {[1, 2, 3, 4].map(houses => {
                                            const { dimmed, active, bad } = getRowState(houses);
                                            return (
                                                <RentRow
                                                    key={houses}
                                                    label={`con ${houses} Casa${houses > 1 ? 's' : ''}`}
                                                    value={tile[`rent_${houses}_house` as keyof TileData] as number}
                                                    isActive={active}
                                                    isBad={bad}
                                                    isDimmed={dimmed}
                                                    onClick={active && canCharge ? handleCharge : undefined}
                                                />
                                            );
                                        })}

                                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                                            {(() => {
                                                const { dimmed, active, bad } = getRowState(5);
                                                return (
                                                    <RentRow
                                                        label="Con HOTEL"
                                                        value={tile.rent_hotel}
                                                        isActive={active}
                                                        isBad={bad}
                                                        isDimmed={dimmed}
                                                        onClick={active && canCharge ? handleCharge : undefined}
                                                        centered
                                                    />
                                                );
                                            })()}
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
                                <Box sx={{ py: 2 }}>
                                    {/* TRANSPORT LOGIC */}
                                    {tile.rent_rule === 'TRANSPORT_COUNT' && (
                                        <Box>
                                            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'black' }}>
                                                La renta se basa en el número de transportes que posee el propietario ({owner ? (ownedCount || 0) : '-'} en posesión).
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                {[25, 50, 100, 200, 400].map((val, idx) => {
                                                    const count = idx + 1; // 1-based count
                                                    // Map idx to standard levels? transport logic is separate.
                                                    // We used isActiveLevel = ownedCount.
                                                    const { dimmed, active, bad } = getRowState(count);
                                                    return (
                                                        <RentRow
                                                            key={idx}
                                                            label={`Con ${count} Transporte${count > 1 ? 's' : ''}`}
                                                            value={val}
                                                            isActive={active}
                                                            isBad={bad}
                                                            isDimmed={dimmed}
                                                            onClick={active && canCharge ? handleCharge : undefined}
                                                        />
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    )}

                                    {/* DICE MULTIPLIER LOGIC */}
                                    {tile.rent_rule === 'DICE_MULTIPLIER' && (
                                        <Box>
                                            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'black' }}>
                                                La renta es el resultado de los dados multiplicado por...
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                {(() => {
                                                    let tiers: number[] = [];
                                                    let labelSingular = "";
                                                    let labelPlural = "";

                                                    if (tile.type === 'UTILITY') {
                                                        tiers = [4, 10, 20, 40, 60, 80]; // Wait, original code had this list?
                                                        // Actually utility usually 4 and 10.
                                                        // Let's stick to simple logic or reuse what was there
                                                        // Original code: [4, 10, 20, 40, 60, 80]
                                                        // But Standard Monopoly is 4x and 10x for 1 or 2 Utilities.
                                                        // The array size implies support for more.
                                                        labelSingular = "Servicio";
                                                        labelPlural = "Servicios";
                                                    } else if (tile.type === 'ATTRACTION') {
                                                        tiers = [4, 10, 20, 40];
                                                        labelSingular = "Atracción";
                                                        labelPlural = "Atracciones";
                                                    } else if (tile.type === 'PARK') {
                                                        tiers = [4, 10, 20, 40];
                                                        labelSingular = "Parque";
                                                        labelPlural = "Parques";
                                                    } else {
                                                        tiers = [4, 10];
                                                        labelSingular = "Propiedad";
                                                        labelPlural = "Propiedades";
                                                    }

                                                    return tiers.map((multiplier, idx) => {
                                                        const count = idx + 1;
                                                        const label = count === 1
                                                            ? `Si es dueño de 1 "${labelSingular}"`
                                                            : `Si es dueño de ${count} "${labelPlural}"`;

                                                        const { dimmed, active, bad } = getRowState(count);

                                                        return (
                                                            <RentRow
                                                                key={idx}
                                                                label={label}
                                                                valueText={`renta es ${multiplier} veces dados`}
                                                                isActive={active}
                                                                isBad={bad}
                                                                isDimmed={dimmed}
                                                                onClick={active && canCharge ? handleCharge : undefined}
                                                            />
                                                        );
                                                    });
                                                })()}
                                            </Box>
                                        </Box>
                                    )}

                                    {!['TRANSPORT_COUNT', 'DICE_MULTIPLIER', 'STANDARD'].includes(tile.rent_rule || 'STANDARD') && (
                                        <Typography variant="body2" sx={{ mt: 2, color: 'rgba(0,0,0,0.6)' }}>
                                            Regla de renta desconocida: {tile.rent_rule}
                                        </Typography>
                                    )}

                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="body1" color="black" fontWeight="bold">Valor Hipoteca: ${tile.mortgage_value}</Typography>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{ py: 4 }}>
                            <Typography color="black">Esta casilla no tiene título de propiedad.</Typography>
                        </Box>
                    )}
                </Box>



                {/* VISITORS */}
                {(() => {
                    const visitors = gameState?.players?.filter((p: any) => p.position === tile.id) || [];
                    if (visitors.length === 0) return null;
                    return (
                        <Box sx={{ mt: 2, pt: 1, borderTop: '1px dashed grey', textAlign: 'center' }}>
                            <Typography variant="overline" color="text.secondary">Jugadores aquí</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                                {visitors.map((p: any) => (
                                    <Chip
                                        key={p.user_id}
                                        label={p.name}
                                        onClick={() => onPlayerClick && onPlayerClick(p.user_id)}
                                        sx={{
                                            bgcolor: p.token_color,
                                            color: getContrastColor(p.token_color),
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            '&:hover': { filter: 'brightness(0.9)' }
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    );
                })()}

                {/* BUY BUTTON */}
                {tile.type === 'PROPERTY' && isMeOwner && (
                    <Box sx={{ mt: 2, borderTop: '1px solid black', pt: 2, textAlign: 'center' }}>
                        <Button
                            variant="contained"
                            color="success"
                            disabled={!canBuy}
                            onClick={handleBuyBuilding}
                            title={!isMonopoly ? "Necesitas poseer todo el grupo" : (gameState?.current_turn_id !== user?.user_id ? "No es tu turno" : "")}
                        >
                            {isActiveLevel === 4 ? "COMPRAR HOTEL" : "COMPRAR CASA"} (${isActiveLevel === 4 ? tile.hotel_cost : tile.house_cost})
                        </Button>
                        <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                {isActiveLevel === 5 ? "Máximo nivel alcanzado" :
                                    (!isMonopoly ? "Necesitas Monopolio para construir" :
                                        (!canBuy ? "Espera tu turno" : "Puedes construir casas/hoteles"))}
                            </Typography>
                        </Box>

                        {/* SELL BUTTON */}
                        {isActiveLevel > 0 && (
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={handleSellBuilding}
                                disabled={!canSell}
                                sx={{ mt: 1, display: 'block', mx: 'auto' }}
                            >
                                VENDER EDIFICIO (Reembolso 50%)
                            </Button>
                        )}
                    </Box>
                )}

                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button onClick={onClose} sx={{ color: 'black', fontWeight: 'bold', border: '1px solid black' }}>CERRAR</Button>
                </Box>
            </Box>
        </Dialog >
    );
}

interface RentRowProps {
    label: string;
    value?: number;
    valueText?: string;
    isActive?: boolean;
    isBad?: boolean;
    isDimmed?: boolean;
    centered?: boolean;
    onClick?: () => void;
}

function RentRow({ label, value, valueText, isActive = false, isBad = false, isDimmed = false, centered = false, onClick }: RentRowProps) {
    // Styles
    let bgcolor = 'transparent';
    let color = 'black';
    let fontWeight = 'normal';

    if (isActive) {
        if (isBad) {
            // Default option but NOT fully owned (Monopoly) -> "Blackened/Red"
            // Suggestion: Dark Grey bg, Red text?
            bgcolor = '#e0e0e0';
            color = '#d32f2f'; // Red
            fontWeight = 'bold';
        } else {
            // Good Active (Monopoly, Houses, or Correct Count)
            bgcolor = 'rgba(57, 255, 20, 0.4)'; // Brighter green for active
            fontWeight = 'bold';
        }
    } else if (isDimmed) {
        // Dimmed/Impossible
        // "Blackened" -> Dark grey text, transparent bg?
        color = 'rgba(0,0,0,0.3)';
    }

    return (
        <Box
            onClick={onClick}
            sx={{
                display: 'flex',
                justifyContent: centered ? 'center' : 'space-between',
                gap: 2,
                bgcolor: bgcolor,
                borderRadius: 1,
                px: 1,
                py: 0.5,
                transition: 'all 0.2s',
                opacity: isDimmed ? 0.7 : 1,
                cursor: onClick ? 'pointer' : 'default',
                '&:hover': onClick ? {
                    filter: 'brightness(0.95)',
                    transform: 'scale(1.02)'
                } : undefined
            }}
        >
            <Typography variant="body2" sx={{ color, fontWeight }}>{label}</Typography>
            {!centered && <Typography variant="body2" sx={{ color, fontWeight }}>
                {valueText || (value !== undefined ? `$${value}` : '-')}
            </Typography>}
            {centered && value !== undefined && (
                <Typography variant="body2" sx={{ color, fontWeight, ml: 1 }}>${value}</Typography>
            )}
        </Box>
    );
}
