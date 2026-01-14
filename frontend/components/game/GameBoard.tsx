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
import AdvisorChat from './AdvisorChat';
import { getToken, API_URL } from '@/lib/auth';
import { Box, Paper, Typography, Button, IconButton, Tooltip, Dialog, DialogContent, DialogTitle, List, ListItem, ListItemText, Popover, Slider, Stack, TextField } from '@mui/material';
import { LocalFireDepartment, Wallet, Casino, PlayArrow, CheckCircle, History, Settings as SettingsIcon, ZoomIn, ZoomOut, Handshake, Layers, Palette, Person, Psychology, Stop, Style } from '@mui/icons-material';

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
    // Merge dynamic data from gameState.board (building_count) with static config from API
    const boardTiles: TileData[] = (boardDataApi || []).map((t: any) => {
        // Find corresponding dynamic tile from gameState.board
        const dynamicTile = gameState?.board?.find((dt: any) => dt.id === t.id);

        return {
            id: t.id,
            type: t.type,
            name: t.name,
            propertyId: t.property_id,
            groupId: t.group_identifier,
            price: t.price,
            rent: t.rent,
            buildingCount: dynamicTile?.building_count ?? t.building_count ?? 0, // Prioritize dynamic
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
        };
    });

    // Local UI State
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [isTradeOpen, setIsTradeOpen] = useState(false);
    const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [logHeight, setLogHeight] = useState(160);
    const [isDraggingLogs, setIsDraggingLogs] = useState(false);
    const [selectedTile, setSelectedTile] = useState<TileData | null>(null);
    const [hiddenCardId, setHiddenCardId] = useState<number | null>(null);
    const [inventoryTargetId, setInventoryTargetId] = useState<string | null>(null);
    const [minimapLayer, setMinimapLayer] = useState<'group' | 'owner' | 'globalHeatmap'>('group');
    const [initialBalance, setInitialBalance] = useState(1500);
    const [rentCountdown, setRentCountdown] = useState(0);
    const pendingRentRef = useRef<string | null>(null);
    const [actionPending, setActionPending] = useState(false);

    // ...


    // Log Auto-Scroll
    const logEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [gameState?.logs]);

    // Rent Collection Countdown Timer
    const pendingRent = (gameState as any)?.pending_rent;
    useEffect(() => {
        // Start countdown when new pending_rent appears
        const currentPendingId = pendingRent?.property_id || null;
        if (currentPendingId && currentPendingId !== pendingRentRef.current) {
            pendingRentRef.current = currentPendingId;
            setRentCountdown(5);
        } else if (!currentPendingId) {
            pendingRentRef.current = null;
            setRentCountdown(0);
        }
    }, [pendingRent?.property_id]);

    useEffect(() => {
        if (rentCountdown > 0) {
            const timer = setTimeout(() => setRentCountdown(rentCountdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [rentCountdown]);

    // Derived States
    // Reset actionPending when game state changes (action completed)
    useEffect(() => {
        setActionPending(false);
    }, [gameState?.current_turn_id, gameState?.dice?.[0], gameState?.drawn_card?.id]);

    // Idempotent action sender - prevents double-clicks
    const sendAction = (action: string, payload: any = {}) => {
        if (actionPending) return;
        setActionPending(true);
        sendMessage(action, payload);
    };

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

    // Log Resize Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDraggingLogs(true);
        e.preventDefault();
    };

    const handleMouseUp = React.useCallback(() => {
        setIsDraggingLogs(false);
    }, []);

    const handleMouseMove = React.useCallback((e: MouseEvent) => {
        if (!isDraggingLogs) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < 600) { // Limit min/max height
            setLogHeight(newHeight);
        }
    }, [isDraggingLogs]);

    useEffect(() => {
        if (isDraggingLogs) {
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mousemove', handleMouseMove);
        } else {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
        }
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
        }
    }, [isDraggingLogs, handleMouseUp, handleMouseMove]);

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

    // Auto-focus on my position (follows player movement after dice roll)
    const myPosition = gameState?.players?.find((p: any) => p.user_id === user?.user_id)?.position;

    useEffect(() => {
        if (myPosition !== undefined) {
            // Determine lane based on position
            // 0-15: Lane 0, 16-31: Lane 1, 32-47: Lane 2, 48-63: Lane 3
            const lane = Math.floor(myPosition / 16);
            setCurrentLane(Math.min(lane, 3));
        }
    }, [myPosition]); // Re-focus whenever my position changes

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

            {/* MAIN CONTENT SPLIT */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

                {/* ACTIVE LANE VIEW */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 2 }}>

                    {/* Navigation Removed per user request */}

                    {/* Tiles Row */}
                    <Box sx={{ display: 'flex', gap: 0, overflowX: 'auto', maxWidth: '100%', px: { xs: 0, sm: 1, md: 1 }, pb: 2, alignItems: 'center', minHeight: 200 }}>
                        {(() => {
                            const start = currentLane * 16;
                            const end = start + 16;
                            const indices = [];
                            for (let i = start; i <= end; i++) indices.push(i % 64);

                            // Reverse for lanes 0 (bottom) and 1 (left) to match board orientation
                            // Lane 2 (top) and 3 (right) are not reversed
                            const tilesToRender = (currentLane === 0 || currentLane === 1) ? indices.reverse() : indices;

                            return tilesToRender.map(i => {
                                const staticTile = boardTiles.find(t => t.id === i);
                                if (!staticTile) return null;

                                // Merge with dynamic state
                                const dynamicTile = gameState.board?.find((t: any) => t.id === i) || {};
                                const tile: any = { ...staticTile, ...dynamicTile };

                                return (
                                    <Box key={i} sx={{ width: 130, height: 160 }}>
                                        <BoardTile
                                            tile={tile}
                                            index={i}
                                            onClick={() => setSelectedTile(tile)}
                                            players={gameState.players?.filter((p: any) => p.position === i)}
                                            fontScale={0.7}
                                            forceTopBar={true}
                                            ownerColor={tile.property_id || tile.propertyId ? getOwnerColor(gameState, tile.property_id || tile.propertyId) : undefined}
                                        />
                                    </Box>
                                );
                            });
                        })()}
                    </Box>

                    {/* MINIMAP (Below Active Lane) */}
                    <Paper sx={{
                        width: { xs: 180, sm: 200, md: 240 },
                        height: { xs: 180, sm: 200, md: 240 },
                        bgcolor: '#1e293b', opacity: 0.95, border: '2px solid grey',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(17, 1fr)',
                        gridTemplateRows: 'repeat(17, 1fr)',
                        p: 0.5,
                        gap: '1px',
                        mt: 2,
                        position: 'relative'
                    }}>
                        {/* Layer Toggles */}
                        <Box sx={{ position: 'absolute', top: -40, right: 0, display: 'flex', gap: 1, bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 1, p: 0.5 }}>
                            <Tooltip title="Ver por Grupos">
                                <IconButton
                                    size="small"
                                    onClick={() => setMinimapLayer('group')}
                                    sx={{ color: minimapLayer === 'group' ? 'primary.main' : 'grey.500' }}
                                >
                                    <Palette fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Ver por Dueños">
                                <IconButton
                                    size="small"
                                    onClick={() => setMinimapLayer('owner')}
                                    sx={{ color: minimapLayer === 'owner' ? 'secondary.main' : 'grey.500' }}
                                >
                                    <Person fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Mapa de Calor Global">
                                <IconButton
                                    size="small"
                                    onClick={() => setMinimapLayer('globalHeatmap')}
                                    sx={{ color: minimapLayer === 'globalHeatmap' ? 'orange' : 'grey.500' }}
                                >
                                    <LocalFireDepartment fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>

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

                            // Calculate heatmap data based on selected layer
                            const getHeatmapData = () => {
                                if (minimapLayer === 'globalHeatmap') {
                                    return gameState?.tile_visits || {};
                                }
                                return {};
                            };

                            const heatmapData = getHeatmapData();
                            const maxVisits = Math.max(1, ...Object.values(heatmapData).map(v => Number(v) || 0));

                            const getHeatmapColor = (visits: number) => {
                                if (!visits) return '#1e293b'; // Base background
                                const intensity = Math.min(100, Math.floor((visits / maxVisits) * 100));
                                // Fire style: Yellow (60) to Red (0)
                                return `hsl(${60 - intensity * 0.6}, 100%, ${Math.max(20, 100 - intensity / 2)}%)`;
                            };


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

                                    if (currentLane === 0 && (id >= 0 && id <= 16)) isFocused = true;
                                    else if (currentLane === 1 && (id >= 16 && id <= 32)) isFocused = true;
                                    else if (currentLane === 2 && (id >= 32 && id <= 48)) isFocused = true;
                                    else if (currentLane === 3 && (id >= 48 && id <= 63)) isFocused = true;
                                }

                                if (!tile) return <Box key={`empty-${i}`} sx={{ bgcolor: 'transparent' }} />;

                                // Check if player is here
                                const playerHere = gameState.players.find((p: any) => p.position === tile.id);

                                // Determine Cell Color based on Layer
                                let cellColor = '#94a3b8'; // Default grey
                                if (tile) {
                                    if (minimapLayer === 'group') {
                                        cellColor = tile.color || (['CORNER', 'JAIL_VISIT', 'FREE_PARKING', 'GO_TO_JAIL'].includes(tile.type) ? '#94a3b8' : '#e2e8f0');
                                    } else if (minimapLayer === 'owner') {
                                        // Owner Layer
                                        if (tile.propertyId) {
                                            const ownerColor = getOwnerColor(gameState, tile.propertyId);
                                            cellColor = ownerColor || 'rgba(255,255,255,0.1)';
                                        } else {
                                            cellColor = '#475569'; // Neutral dark for unownable
                                        }
                                    } else if (minimapLayer === 'globalHeatmap') {
                                        const visits = gameState.tile_visits?.[tile.id] || 0;
                                        cellColor = getHeatmapColor(visits);
                                    }
                                }

                                return (
                                    <Box
                                        key={tile.id}
                                        onClick={() => {
                                            if (laneIndex !== -1) setCurrentLane(laneIndex);
                                        }}
                                        sx={{
                                            width: '100%', height: '100%',
                                            bgcolor: playerHere ? playerHere.token_color : cellColor,
                                            border: playerHere ? '1px solid white' : (minimapLayer === 'owner' && tile.propertyId && !getOwnerColor(gameState, tile.propertyId) ? '1px dashed rgba(255,255,255,0.1)' : 'none'),
                                            borderRadius: '2px',
                                            opacity: isFocused ? 1 : 0.3, // Dim non-focused lanes
                                            transition: 'opacity 0.3s, background-color 0.3s',
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
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                                <TextField
                                    label="Dinero Inicial"
                                    type="number"
                                    value={initialBalance}
                                    onChange={(e) => setInitialBalance(Math.max(500, Math.min(10000, parseInt(e.target.value) || 1500)))}
                                    inputProps={{ min: 500, max: 10000, step: 100 }}
                                    size="small"
                                    sx={{ width: 150, '& input': { color: 'white' }, '& label': { color: 'grey.400' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'grey.600' } } }}
                                />
                                <Button variant="contained" color="primary" size="large" onClick={() => sendMessage('START_GAME', { initial_balance: initialBalance })}>
                                    INICIAR JUEGO
                                </Button>
                            </Box>
                        )}

                        {/* Buy/Auction buttons - only shown when on purchasable unowned property */}
                        {isGameActive && isMyTurn && hasRolledAny && (() => {
                            const me = gameState.players.find((p: any) => p.user_id === user.user_id);
                            if (!me) return null;
                            const tile = gameState?.board?.[me.position];
                            if (!tile) return null;
                            const propId = tile.property_id;
                            const isUnowned = propId && !gameState.property_ownership?.[propId];
                            const isPurchasable = tile.type === 'PROPERTY' || tile.type === 'UTILITY' || tile.type === 'RAILROAD' || tile.type === 'ATTRACTION' || tile.type === 'PARK';

                            const mustBuy = isUnowned && isPurchasable;
                            if (!mustBuy) return null;

                            return (
                                <>
                                    <Button variant="contained" color="info" disabled={(me.balance || 0) < (tile.price || 0) || actionPending} onClick={() => sendAction('BUY_PROPERTY', { property_id: propId })}>COMPRAR (${tile.price})</Button>
                                    <Button variant="outlined" color="warning" disabled={actionPending} onClick={() => sendAction('START_AUCTION', { property_id: propId })}>SUBASTAR</Button>
                                </>
                            );
                        })()}

                    </Box>
                </Box>
            </Box>

            {/* LOG CONSOLE */}
            <Paper sx={{ height: logHeight, width: '100%', bgcolor: 'black', borderTop: 1, borderColor: 'grey.800', display: 'flex', flexDirection: 'column', zIndex: 10, position: 'relative' }}>
                {/* Resize Handle */}
                <Box
                    onMouseDown={handleMouseDown}
                    sx={{
                        height: 8,
                        width: '100%',
                        bgcolor: 'grey.900',
                        cursor: 'ns-resize',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderTop: '1px solid #333',
                        '&:hover': { bgcolor: 'primary.main' }
                    }}
                >
                    <Box sx={{ width: 40, height: 3, bgcolor: 'grey.600', borderRadius: 2 }} />
                </Box>

                <Box sx={{ px: 2, py: 0.5, bgcolor: 'grey.900', borderBottom: 1, borderColor: 'grey.800', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <History fontSize="small" color="disabled" />
                    <Typography variant="caption" color="grey.500" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>Registro de Eventos</Typography>
                </Box>
                <List dense sx={{ flex: 1, overflowY: 'auto', px: 2, py: 0, fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
                    {[...(gameState.logs || [])].reverse().map((log: any, i: number) => (
                        <ListItem key={i} sx={{ py: 0, minHeight: 20 }}>
                            <ListItemText
                                primary={
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: getLogColor(log.type), lineHeight: 1.2 }}>
                                        <span style={{ opacity: 0.5, marginRight: 8 }}>[{new Date(log.timestamp * 1000).toLocaleTimeString()}]</span>
                                        {translateLog(log.message)}
                                    </Typography>
                                }
                            />
                        </ListItem>
                    ))}
                    {/* Auto-scroll removed since we are showing newest at top */}
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
                        const lane = Math.floor(match.id / 16);
                        setCurrentLane(Math.min(lane, 3));
                    }
                }}
            />

            <TradeModal
                gameState={gameState}
                user={user}
                sendMessage={sendMessage}
                isOpen={isTradeOpen}
                onClose={() => setIsTradeOpen(false)}
            />

            <AuctionModal gameState={gameState} user={user} sendMessage={sendMessage} />

            {isMyTurn && gameState?.drawn_card && gameState.drawn_card.id !== hiddenCardId && (
                <CardModal
                    gameState={gameState}
                    user={user}
                    sendMessage={sendMessage}
                    onClose={() => setHiddenCardId(gameState.drawn_card?.id ?? null)}
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

            {/* AI Advisor Chat */}
            <AdvisorChat
                gameId={gameState.game_id}
                token={getToken() || ''}
                apiUrl={API_URL}
                isOpen={isAdvisorOpen}
                onClose={() => setIsAdvisorOpen(false)}
            />

            {/* FABs */}
            <Box sx={{ position: 'fixed', bottom: logHeight + 20, right: 24, zIndex: 60, transition: 'bottom 0.1s' }}>
                <Stack direction="column" spacing={2}>
                    <Tooltip title="Asesor IA" placement="left">
                        <Box sx={{
                            width: 56,
                            height: 56,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '&:hover': { transform: 'scale(1.1)' }
                        }}
                            onClick={() => setIsAdvisorOpen(true)}
                        >
                            <Psychology sx={{ color: 'white' }} />
                        </Box>
                    </Tooltip>

                    <Tooltip title="Comercio" placement="left">
                        <Box sx={{
                            width: 56,
                            height: 56,
                            bgcolor: '#334155',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 6,
                            cursor: 'pointer',
                            transition: 'transfrom 0.2s',
                            '&:hover': { transform: 'scale(1.1)' }
                        }}
                            onClick={() => setIsTradeOpen(true)}
                        >
                            <Handshake color="warning" />
                        </Box>
                    </Tooltip>

                    <Tooltip title="Inventario" placement="left">
                        <Box sx={{
                            width: 56,
                            height: 56,
                            bgcolor: '#334155',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 6,
                            cursor: 'pointer',
                            transition: 'transfrom 0.2s',
                            '&:hover': { transform: 'scale(1.1)' }
                        }}
                            onClick={() => setIsInventoryOpen(true)}
                        >
                            <Wallet color="secondary" />
                        </Box>
                    </Tooltip>
                </Stack>
            </Box>

            {/* LEFT FABs - Game Actions */}
            {isGameActive && isMyTurn && (
                <Box sx={{ position: 'fixed', bottom: logHeight + 20, left: 24, zIndex: 60, transition: 'bottom 0.1s' }}>
                    <Stack direction="column" spacing={2}>
                        {/* Roll Dice */}
                        {canRoll && (
                            <Tooltip title="Lanzar Dados" placement="right">
                                <Box sx={{
                                    width: 56,
                                    height: 56,
                                    background: actionPending ? '#555' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
                                    cursor: actionPending ? 'not-allowed' : 'pointer',
                                    transition: 'transform 0.2s',
                                    '&:hover': { transform: actionPending ? 'none' : 'scale(1.1)' }
                                }}
                                    onClick={() => sendAction('ROLL_DICE', {})}
                                >
                                    <Casino sx={{ color: 'white' }} />
                                </Box>
                            </Tooltip>
                        )}

                        {/* Draw Card */}
                        {hasRolledAny && (() => {
                            const me = gameState.players.find((p: any) => p.user_id === user.user_id);
                            if (!me) return null;
                            const tile = gameState?.board?.[me.position];
                            const mustDraw = tile && (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') && !gameState.drawn_card;
                            if (!mustDraw) return null;
                            return (
                                <Tooltip title="Sacar Tarjeta" placement="right">
                                    <Box sx={{
                                        width: 56,
                                        height: 56,
                                        background: actionPending ? '#555' : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4)',
                                        cursor: actionPending ? 'not-allowed' : 'pointer',
                                        transition: 'transform 0.2s',
                                        '&:hover': { transform: actionPending ? 'none' : 'scale(1.1)' }
                                    }}
                                        onClick={() => sendAction('DRAW_CARD', {})}
                                    >
                                        <Style sx={{ color: 'white' }} />
                                    </Box>
                                </Tooltip>
                            );
                        })()}

                        {/* End Turn */}
                        {hasRolledAny && (() => {
                            const me = gameState.players.find((p: any) => p.user_id === user.user_id);
                            if (!me) return null;
                            const tile = gameState?.board?.[me.position];
                            const propId = tile?.property_id;
                            const isUnowned = propId && !gameState.property_ownership?.[propId];
                            const isPurchasable = tile && ['PROPERTY', 'UTILITY', 'RAILROAD', 'ATTRACTION', 'PARK'].includes(tile.type);
                            const mustBuy = isUnowned && isPurchasable;
                            const mustDraw = tile && (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') && !gameState.drawn_card;

                            // Don't show if must buy or draw first
                            if (mustBuy || mustDraw) return null;

                            const hasPendingRent = !!(gameState as any).pending_rent;
                            const isWaitingForRent = hasPendingRent && rentCountdown > 0;
                            const isDisabled = isWaitingForRent || actionPending;

                            return (
                                <Tooltip title={isWaitingForRent ? `Espera ${rentCountdown}s` : "Terminar Turno"} placement="right">
                                    <Box sx={{
                                        width: 56,
                                        height: 56,
                                        background: isDisabled ? '#555' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: isDisabled ? 'none' : '0 4px 20px rgba(239, 68, 68, 0.4)',
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        transition: 'transform 0.2s',
                                        '&:hover': { transform: isDisabled ? 'none' : 'scale(1.1)' },
                                        position: 'relative'
                                    }}
                                        onClick={() => !isDisabled && sendAction('END_TURN', {})}
                                    >
                                        <Stop sx={{ color: 'white' }} />
                                        {isWaitingForRent && (
                                            <Typography sx={{
                                                position: 'absolute',
                                                bottom: -8,
                                                fontSize: 10,
                                                fontWeight: 'bold',
                                                bgcolor: 'warning.main',
                                                color: 'black',
                                                px: 0.5,
                                                borderRadius: 1
                                            }}>
                                                {rentCountdown}s
                                            </Typography>
                                        )}
                                    </Box>
                                </Tooltip>
                            );
                        })()}
                    </Stack>
                </Box>
            )}
        </Box >
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
