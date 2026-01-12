'use client';
import React, { useState, useEffect, useRef } from 'react';
import { getGridPosition, TileData } from '@/config/boardData'; // Keep getGridPosition helper
import BoardTile from './BoardTile';
import { useGameStore } from '@/store/gameStore';
import { useBoardConfig } from '@/hooks/useGameQueries';
import PlayerToken from './PlayerToken';
import RollingOrderPhase from './RollingOrderPhase';

import CardModal from './CardModal';
import InventoryDrawer from './InventoryDrawer';
import TradeModal from './TradeModal';
import AuctionModal from './AuctionModal';
import TileDetailModal from './TileDetailModal';
import { Box, Paper, Typography, Button, IconButton, Tooltip, Dialog, DialogContent, DialogTitle, List, ListItem, ListItemText, Popover, Slider, Stack } from '@mui/material';
import { LocalFireDepartment, Wallet, Casino, PlayArrow, CheckCircle, History, Settings as SettingsIcon, ZoomIn, ZoomOut } from '@mui/icons-material';

export default function GameBoard() {
    // State from Store
    const gameState = useGameStore((state) => state.game);
    const user = useGameStore((state) => state.user);
    const socket = useGameStore((state) => state.socket);

    // Send Message Helper
    const sendMessage = (action: string, payload: any) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action, payload }));
        } else {
            console.warn("Socket not connected or not found in store");
        }
    };

    // No context, no local `useGameSocket` call here (handled in Page)



    // Now use Store State
    // const gameState = useGameStore(s => s.game); // This would be the "Refactored" way
    // For safety, I'll use the one from store (synced).

    // Board Data Logic
    // We map `boardDataApi` (from REST) + `gameState` (Owner/Buildings) -> UI Tiles.
    // The `boardDataApi` gives us the structure.
    // If API isn't ready/mocked, we fall back to hardcoded? No, API is ready.

    // Board Data Logic
    const { data: boardDataApi } = useBoardConfig();

    // Map API data (snake_case) to Frontend TileData (camelCase)
    // If API is loading/empty, boardTiles is empty array
    const boardTiles: TileData[] = (boardDataApi || []).map((t: any) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        propertyId: t.property_id,
        groupId: t.group_identifier,
        price: t.price,
        rent: t.rent,
        buildingCount: t.building_count,
        // Map Color
        color: t.group_color,
        groupName: t.group_name,
        // Extended
        rent_base: t.rent_base,
        rent_color_group: t.rent_color_group,
        rent_1_house: t.rent_1_house,
        rent_2_house: t.rent_2_house,
        rent_3_house: t.rent_3_house,
        rent_4_house: t.rent_4_house,
        rent_hotel: t.rent_hotel,
        house_cost: t.house_cost,
        hotel_cost: t.hotel_cost,
        mortgage_value: t.mortgage_value,
        rent_rule: t.rent_rule // Map Rent Rule Logic
    }));

    // Local UI State
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [selectedTile, setSelectedTile] = useState<TileData | null>(null);
    const [hiddenCardId, setHiddenCardId] = useState<number | null>(null);
    const [inventoryTargetId, setInventoryTargetId] = useState<string | null>(null);

    // ...


    // Log Auto-Scroll
    const logEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [gameState?.logs]);

    // Derived States
    const isHost = gameState?.players?.[0]?.user_id === user?.user_id; // Simple Host Assumption
    const isMyTurn = gameState?.current_turn_id === user?.user_id;
    const isGameActive = gameState?.status === 'ACTIVE';
    const canStart = isHost && gameState?.status === 'WAITING' && (gameState?.players?.length >= 2);

    // Helper to check if I can End Turn (simple: I rolled dice)
    // Complex logic: check Logs if last action was 'DICE' or 'BUY' by me?
    // For now, allow End Turn if it's my turn and I have rolled (gameState.dice is updated?)
    // Better: Backend should track 'HasRolled' per turn.
    // For this iteration, we allow "Finish Turn" if I am current turn.
    // User must be responsible to Roll first. We can hide Roll button if already rolled 
    // BUT we don't have that field yet. We will just trust the flow or use Log check.
    const lastLog = gameState?.logs?.[gameState.logs.length - 1];

    // Dice Logic for UI
    const logicDice = gameState?.dice || [0, 0];
    const lastDiceRef = useRef<number[]>([1, 1]); // Default visuals

    // Update ref if we have new live dice
    if (logicDice[0] !== 0) {
        lastDiceRef.current = logicDice;
    }

    // For rendering, use persisted dice if current is 0
    const displayDice = logicDice[0] !== 0 ? logicDice : lastDiceRef.current;

    const hasRolledAny = logicDice[0] !== 0;
    const isDoubles = hasRolledAny && logicDice[0] === logicDice[1];
    const canRoll = !hasRolledAny || isDoubles;
    const hasRolled = hasRolledAny; // Alias for backward compat if needed or just use hasRolledAny

    // Board Lane Logic
    // 0: Bottom (0-16), 1: Left (16-32), 2: Top (32-48), 3: Right (48-64)
    // Actually, normally:
    // Bottom: 0 is GO (Right), moves Left to 10/16? 
    // Wait, indices:
    // If 0 is GO (Bottom Right). It moves Left. 1..15 are Bottom Row. 16 is JAIL (Bottom Left).
    // Left Lane: 16 (Bottom) -> 32 (Top Left).
    // Top Lane: 32 -> 48 (Top Right).
    // Right Lane: 48 -> 0 (Bottom Right).
    const [currentLane, setCurrentLane] = useState(0);

    // Auto-focus on my turn or load
    useEffect(() => {
        if (user && gameState?.players) {
            const me = gameState.players.find((p: any) => p.user_id === user.user_id);
            if (me) {
                // Determine lane based on position
                // 0-16: Lane 0
                // 16-32: Lane 1
                // 32-48: Lane 2
                // 48-64: Lane 3
                const lane = Math.floor(me.position / 16);
                setCurrentLane(Math.min(lane, 3));
            }
        }
    }, [gameState?.current_turn_id, user?.user_id]); // Re-focus on turn change? Or just init?
    // User requested: "Boton donde poder centrar". So maybe default is auto, but allow manual.

    const focusMyLane = () => {
        if (!gameState || !gameState.players) return;
        const me = gameState.players.find((p: any) => p.user_id === user.user_id);
        if (me) {
            const lane = Math.floor(me.position / 16);
            setCurrentLane(Math.min(lane, 3));
        }
    };

    if (!gameState) return <Box sx={{ p: 4, color: 'white' }}>Cargando partida...</Box>;

    // Show Rolling Order Phase if game is in that status
    if (gameState.status === 'ROLLING_ORDER') {
        return <RollingOrderPhase gameState={gameState} user={user} sendMessage={sendMessage} />;
    }

    const myPlayer = gameState.players?.find((p: any) => p.user_id === user.user_id);

    return (
        <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#0f172a', overflow: 'hidden' }}>

            {/* TOP BAR */}
            <Box sx={{ p: 1, bgcolor: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, borderBottom: 1, borderColor: 'grey.800' }}>
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Casino color="warning" /> MONOPOLY FT
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>

                    {/* My Player Info */}
                    {myPlayer && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.05)', px: 1.5, py: 0.5, borderRadius: 2 }}>
                            <Box sx={{ width: 24, height: 24 }}>
                                <PlayerToken color={myPlayer.token_color} name={myPlayer.name} isCurrentTurn={false} />
                            </Box>
                            <Typography variant="body2" color="white" fontWeight="bold">
                                ${myPlayer.balance}
                            </Typography>
                        </Box>
                    )}

                    <Typography variant="body2" sx={{ color: 'white', bgcolor: 'primary.main', px: 1, borderRadius: 1 }}>
                        Turno: {gameState.players.find((p: any) => p.user_id === gameState.current_turn_id)?.name || '...'}
                    </Typography>
                </Box>
            </Box>

            {/* MAIN CONTENT SPLIT */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

                {/* ACTIVE LANE VIEW */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 2 }}>

                    {/* Navigation Removed per user request */}

                    {/* Tiles Row */}
                    <Box sx={{ display: 'flex', gap: 0, overflowX: 'auto', maxWidth: '100%', px: 4, pb: 2, alignItems: 'center', minHeight: 200 }}>
                        {(() => {
                            const start = currentLane * 16;
                            const end = start + 16;
                            const indices = [];
                            for (let i = start; i <= end; i++) indices.push(i % 64);

                            // Reverse for lanes 0 (bottom) and 3 (right) to match MiniMap orientation
                            const tilesToRender = (currentLane === 0 || currentLane === 3) ? indices.reverse() : indices;

                            return tilesToRender.map(i => {
                                const tile = boardTiles.find(t => t.id === i);
                                if (!tile) return null;
                                return (
                                    <Box key={i} sx={{ width: 130, height: 130 }}>
                                        <BoardTile
                                            tile={tile}
                                            index={i}
                                            onClick={() => setSelectedTile(tile)}
                                            players={gameState.players?.filter((p: any) => p.position === i)}
                                            fontScale={0.7}
                                            forceTopBar={true}
                                            ownerColor={tile.propertyId ? getOwnerColor(gameState, tile.propertyId) : undefined}
                                        />
                                    </Box>
                                );
                            });
                        })()}
                    </Box>

                    {/* MINIMAP (Below Active Lane) */}
                    <Paper sx={{
                        width: 240, height: 240,
                        bgcolor: '#1e293b', opacity: 0.95, border: '2px solid grey',
                        display: { xs: 'none', md: 'grid' },
                        gridTemplateColumns: 'repeat(17, 1fr)',
                        gridTemplateRows: 'repeat(17, 1fr)',
                        p: 0.5,
                        gap: '1px',
                        mt: 2
                    }}>
                        {(() => {
                            // Render full 17x17 grid (64 tiles + empty center)
                            const cells = [];
                            // We iterate logical board positions 0..63 and place them
                            const gridCells = Array(17 * 17).fill(null);

                            boardTiles.forEach(tile => {
                                const { row, col } = getGridPosition(tile.id);
                                const indexIdx = (row - 1) * 17 + (col - 1);
                                if (indexIdx >= 0 && indexIdx < gridCells.length) {
                                    gridCells[indexIdx] = tile;
                                }
                            });


                            return gridCells.map((tile, i) => {
                                // Lanes mapping
                                let isFocused = false;
                                let laneIndex = -1;

                                if (tile) {
                                    const id = tile.id;
                                    if (id < 16) laneIndex = 0;
                                    else if (id < 32) laneIndex = 1;
                                    else if (id < 48) laneIndex = 2;
                                    else laneIndex = 3;

                                    // Special case for shared corners if we want smoother feel, but explicit ranges work.
                                    // Adjusted ranges slightly to include start corner in previous lane? 
                                    // Let's stick to the visual ranges:
                                    // Lane 0: 0-16. Lane 1: 16-32. Lane 2: 32-48. Lane 3: 48-63.

                                    if (currentLane === 0 && (id >= 0 && id <= 16)) isFocused = true;
                                    else if (currentLane === 1 && (id >= 16 && id <= 32)) isFocused = true;
                                    else if (currentLane === 2 && (id >= 32 && id <= 48)) isFocused = true;
                                    else if (currentLane === 3 && (id >= 48 && id <= 63)) isFocused = true;
                                }

                                if (!tile) return <Box key={`empty-${i}`} sx={{ bgcolor: 'transparent' }} />;

                                // Check if player is here
                                const playerHere = gameState.players.find((p: any) => p.position === tile.id);

                                return (
                                    <Box
                                        key={tile.id}
                                        onClick={() => {
                                            if (laneIndex !== -1) setCurrentLane(laneIndex);
                                        }}
                                        sx={{
                                            width: '100%', height: '100%',
                                            bgcolor: playerHere ? playerHere.token_color : (tile.color || (['CORNER', 'JAIL_VISIT', 'FREE_PARKING', 'GO_TO_JAIL'].includes(tile.type) ? '#94a3b8' : '#e2e8f0')),
                                            border: playerHere ? '1px solid white' : 'none',
                                            borderRadius: '2px',
                                            opacity: isFocused ? 1 : 0.3, // Dim non-focused lanes
                                            transition: 'opacity 0.3s',
                                            cursor: 'pointer',
                                            '&:hover': { opacity: 1, transform: 'scale(1.1)', zIndex: 10 }
                                        }}>
                                    </Box>
                                );
                            });
                        })()}
                    </Paper>
                </Box>

                {/* DICE & ACTION PANEL (Bottom Overlay) */}
                <Box sx={{ p: 2, bgcolor: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderTop: 1, borderColor: 'grey.700' }}>
                    {/* Dice */}
                    <Paper sx={{ p: 1, px: 3, display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#334155' }}>
                        <Typography variant="h6" color="white">DADOS:</Typography>
                        {displayDice.map((d: number, i: number) => (
                            <Box key={i} sx={{ width: 40, height: 40, bgcolor: 'white', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', borderRadius: 1, fontSize: 20 }}>{d}</Box>
                        ))}
                    </Paper>

                    {/* Action Buttons Logic */}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>

                        {/* 0. Start Game (Host only, when WAITING and 2+ players) */}
                        {canStart && (
                            <Button variant="contained" color="primary" size="large" onClick={() => sendMessage('START_GAME', {})}>
                                INICIAR JUEGO
                            </Button>
                        )}

                        {/* 1. Roll Dice (If my turn, game active, and haven't rolled) */}
                        {isGameActive && isMyTurn && canRoll && (
                            <Button variant="contained" color="success" size="large" onClick={() => sendMessage('ROLL_DICE', {})}>LANZAR DADOS</Button>
                        )}

                        {/* 2. Post-Roll Actions (Buy, Draw, etc) */}
                        {isGameActive && isMyTurn && hasRolledAny && (() => {
                            const me = gameState.players.find((p: any) => p.user_id === user.user_id);
                            if (!me) return null;
                            const tile = gameState?.board?.[me.position];
                            if (!tile) return null;
                            const propId = tile.property_id;
                            const isUnowned = propId && !gameState.property_ownership?.[propId];
                            const isPurchasable = tile.type === 'PROPERTY' || tile.type === 'UTILITY' || tile.type === 'RAILROAD' || tile.type === 'ATTRACTION' || tile.type === 'PARK';

                            const mustBuy = isUnowned && isPurchasable;
                            const mustDraw = (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') && !gameState.drawn_card;

                            if (mustDraw) return <Button variant="contained" color="secondary" onClick={() => sendMessage('DRAW_CARD', {})}>SACAR TARJETA</Button>;

                            if (mustBuy) return (
                                <>
                                    <Button variant="contained" color="info" disabled={(me.balance || 0) < (tile.price || 0)} onClick={() => sendMessage('BUY_PROPERTY', { property_id: propId })}>COMPRAR (${tile.price})</Button>
                                    <Button variant="outlined" color="warning" onClick={() => sendMessage('START_AUCTION', { property_id: propId })}>SUBASTAR</Button>
                                </>
                            );

                            // Can End Turn
                            return <Button variant="outlined" color="error" onClick={() => sendMessage('END_TURN', {})}>TERMINAR TURNO</Button>;
                        })()}

                        {/* 3. Pending Rent (If any) */}
                        {(gameState as any).pending_rent && (gameState as any).pending_rent.creditor_id === user?.user_id && (
                            <Button variant="contained" color="warning" onClick={() => sendMessage('COLLECT_RENT', {})}>COBRAR RENTA (${(gameState as any).pending_rent.amount})</Button>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* LOG CONSOLE */}
            <Paper sx={{ height: 160, width: '100%', bgcolor: 'black', borderTop: 1, borderColor: 'grey.800', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
                <Box sx={{ px: 2, py: 0.5, bgcolor: 'grey.900', borderBottom: 1, borderColor: 'grey.800', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <History fontSize="small" color="disabled" />
                    <Typography variant="caption" color="grey.500" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>Registro de Eventos</Typography>
                </Box>
                <List dense sx={{ flex: 1, overflowY: 'auto', px: 2, py: 0, fontFamily: 'monospace' }}>
                    {gameState.logs?.map((log: any, i: number) => (
                        <ListItem key={i} sx={{ py: 0.2 }}>
                            <ListItemText
                                primary={
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: getLogColor(log.type) }}>
                                        <span style={{ opacity: 0.5, marginRight: 8 }}>[{new Date(log.timestamp * 1000).toLocaleTimeString()}]</span>
                                        {translateLog(log.message)}
                                    </Typography>
                                }
                            />
                        </ListItem>
                    ))}
                    <div ref={logEndRef} />
                </List>
            </Paper>

            {/* MODALS & DRAWERS */}
            <InventoryDrawer
                isOpen={isInventoryOpen}
                onClose={() => { setIsInventoryOpen(false); setInventoryTargetId(null); }}
                gameState={gameState}
                user={user}
                sendMessage={sendMessage}
                targetPlayerId={inventoryTargetId || undefined}
                onPropertyClick={(inventoryTile) => {
                    const match = boardTiles.find(t => t.id === inventoryTile.id);
                    if (match) {
                        setIsInventoryOpen(false);
                        setSelectedTile(match);
                        // Also jump to lane
                        const lane = Math.floor(match.id / 16);
                        setCurrentLane(Math.min(lane, 3));
                    }
                }}
            />
            <TradeModal gameState={gameState} user={user} sendMessage={sendMessage} />
            <AuctionModal gameState={gameState} user={user} sendMessage={sendMessage} />

            {isMyTurn && gameState?.drawn_card && gameState.drawn_card.id !== hiddenCardId && (
                <CardModal
                    gameState={gameState}
                    user={user}
                    sendMessage={sendMessage}
                    onClose={() => setHiddenCardId(gameState.drawn_card.id)}
                />
            )}

            {selectedTile && selectedTile.propertyId && (
                <TileDetailModal
                    tile={selectedTile}
                    gameState={gameState}
                    user={user}
                    sendMessage={sendMessage}
                    onClose={() => setSelectedTile(null)}
                    onPlayerClick={(targetId) => {
                        setSelectedTile(null);
                        setInventoryTargetId(targetId);
                        setIsInventoryOpen(true);
                    }}
                />
            )}

            {/* FABs */}
            <Box sx={{ position: 'fixed', bottom: 180, right: 24, zIndex: 60 }}>
                <Tooltip title="Inventario"><IconButton onClick={() => setIsInventoryOpen(true)} size="large" sx={{ bgcolor: 'background.paper' }}><Wallet color="secondary" /></IconButton></Tooltip>
            </Box>
        </Box>
    );
}

function translateLog(message: string): string {
    if (!message) return '';

    return message
        .replace(/ rolled /g, ' lanzó ')
        .replace(/ landed on /g, ' cayó en ')
        .replace(/ bought /g, ' compró ')
        .replace(/ paid rent of /g, ' pagó renta de ')
        .replace(/ to /g, ' a ')
        .replace(/Turn started for/g, 'Comienza turno de')
        .replace(/Game started!/g, '¡Juego iniciado!')
        .replace(/ joined the game./g, ' se unió a la partida.')
        .replace(/ for /g, ' por ')
        .replace(/Property/g, 'Propiedad')
        .replace(/auctioned/g, 'subastado')
        .replace(/won the auction for/g, 'ganó la subasta de')
        .replace(/with a bid of/g, 'con una oferta de')
        .replace(/Insufficient funds/g, 'Fondos insuficientes')
        .replace(/You must roll the dice first/g, 'Debes lanzar los dados primero')
        .replace(/It is not your turn/g, 'No es tu turno');
}



function getOwnerColor(gameState: any, propertyId: string) {
    const ownerId = gameState.property_ownership[propertyId];
    const owner = gameState.players.find((p: any) => p.user_id === ownerId);
    const colorMap: Record<string, string> = {
        'RED': '#ef4444', 'BLUE': '#3b82f6', 'GREEN': '#22c55e', 'YELLOW': '#eab308',
        'PURPLE': '#a855f7', 'ORANGE': '#f97316', 'CYAN': '#06b6d4', 'PINK': '#ec4899',
    };
    return owner?.token_color ? colorMap[owner.token_color] : undefined;
}

function getLogColor(type: string) {
    switch (type) {
        case 'ALERT': return '#ff5252';
        case 'SUCCESS': return '#69f0ae';
        case 'DICE': return '#40c4ff';
        case 'INFO': default: return '#e0e0e0';
    }
}
