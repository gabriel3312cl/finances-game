'use client';
import React, { useState, useEffect, useRef } from 'react';
import { getGridPosition, TileData } from '@/config/boardData'; // Keep getGridPosition helper
import BoardTile from './BoardTile';
import { useGameStore } from '@/store/gameStore';
import { useBoardConfig } from '@/hooks/useGameQueries';
import PlayerToken from './PlayerToken';

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
    const currentDice = gameState?.dice || [0, 0];
    const hasRolledAny = currentDice[0] !== 0;
    const isDoubles = hasRolledAny && currentDice[0] === currentDice[1];
    const canRoll = !hasRolledAny || isDoubles;
    const hasRolled = hasRolledAny; // Alias for backward compat if needed or just use hasRolledAny

    // State for Settings
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [tileScale, setTileScale] = useState(1); // Default scaling 1:1
    const [fontScale, setFontScale] = useState(0.5); // Default font scaling 0.5

    // Pan State
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    // Handlers
    const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleSettingsClose = () => {
        setAnchorEl(null);
    };

    // Pan Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - startPan.x,
            y: e.clientY - startPan.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    if (!gameState) return <Box sx={{ p: 4, color: 'white' }}>Cargando partida...</Box>;

    // Dynamic Grid Construction
    // Default is 17 tracks.
    // Tracks 0,1 (Top) and 15,16 (Bottom) are edges. Indices [0,1, 15,16]
    // Tracks 0,1 (Left) and 15,16 (Right) are edges.
    const getTrackSize = (index: number) => {
        if (index <= 1 || index >= 15) return `${tileScale}fr`;
        return '1fr';
    };
    const gridTemplate = Array.from({ length: 17 }, (_, i) => getTrackSize(i)).join(' ');


    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'grey.900', overflow: 'hidden' }}>

            {/* HEADER TOOLBAR FOR SETTINGS */}
            <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 100 }}>
                <IconButton onClick={handleSettingsClick} sx={{ bgcolor: 'background.paper', boxShadow: 3, '&:hover': { bgcolor: 'background.paper' } }}>
                    <SettingsIcon color="primary" />
                </IconButton>
                <Popover
                    open={Boolean(anchorEl)}
                    anchorEl={anchorEl}
                    onClose={handleSettingsClose}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                    <Box sx={{ p: 2, width: 300 }}>
                        <Typography variant="subtitle2" gutterBottom fontWeight="bold">Configuración de Tablero</Typography>

                        <Typography variant="caption" color="text.secondary">Zoom General (Arrastra para mover)</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                            <ZoomOut fontSize="small" color="action" />
                            <Slider
                                value={zoomLevel}
                                min={0.5}
                                max={3.0}
                                step={0.1}
                                onChange={(_: Event, val: number | number[]) => setZoomLevel(val as number)}
                                size="small"
                            />
                            <ZoomIn fontSize="small" color="action" />
                        </Stack>

                        <Typography variant="caption" color="text.secondary">Tamaño de Casillas (vs Centro)</Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="caption" sx={{ minWidth: 20 }}>-</Typography>
                            <Slider
                                value={tileScale}
                                min={0.5}
                                max={3.0}
                                step={0.1}
                                onChange={(_: Event, val: number | number[]) => setTileScale(val as number)}
                                size="small"
                                valueLabelDisplay="auto"
                            />
                            <Typography variant="caption" sx={{ minWidth: 20 }}>+</Typography>
                        </Stack>

                        <Typography variant="caption" color="text.secondary">Tamaño de Texto</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ minWidth: 20 }}>A-</Typography>
                            <Slider
                                value={fontScale}
                                min={0.5}
                                max={2.0}
                                step={0.1}
                                onChange={(_: Event, val: number | number[]) => setFontScale(val as number)}
                                size="small"
                                valueLabelDisplay="auto"
                            />
                            <Typography variant="caption" sx={{ minWidth: 20 }}>A+</Typography>
                        </Stack>

                        <Button
                            variant="outlined"
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                            onClick={() => setTileScale(1)}
                        >
                            Casillas Uniformes (1:1)
                        </Button>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                            <Button size="small" onClick={() => { setZoomLevel(1); setTileScale(1); setFontScale(0.5); setPan({ x: 0, y: 0 }); }}>Reset Default</Button>
                        </Box>
                    </Box>
                </Popover>
            </Box>

            {/* GAME AREA */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    p: 0,
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Scale Wrapper */}
                <Box
                    sx={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                        transformOrigin: 'center center',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >
                    <Paper
                        elevation={10}
                        sx={{
                            // Fixed Aspect Ratio Box logic
                            aspectRatio: '1/1',
                            height: 'min(95%, 95vw)', // Fit to smaller dimension mostly
                            width: 'auto', // Let aspect ratio drive width
                            maxHeight: '100%',
                            maxWidth: '100%',
                            position: 'relative',
                            borderRadius: 2,
                            overflow: 'hidden',
                            boxShadow: '0 0 40px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {/* The Grid */}
                        <Box
                            sx={{
                                width: '100%',
                                height: '100%',
                                display: 'grid',
                                gridTemplateRows: gridTemplate,
                                gridTemplateColumns: gridTemplate,
                                bgcolor: '#d4eac8'
                            }}
                        >
                            {boardTiles.map((tile, i) => (
                                <Box key={tile.id} sx={{ position: 'relative', display: 'contents' }}>
                                    <BoardTile
                                        tile={tile}
                                        index={i}
                                        onClick={() => setSelectedTile(tile)}
                                        fontScale={fontScale}
                                        ownerColor={tile.propertyId ? getOwnerColor(gameState, tile.propertyId) : undefined}
                                    />
                                </Box>
                            ))}

                            {/* Players */}
                            {/* Players */}
                            {(() => {
                                // Group players by position
                                const playersByPosition: { [key: number]: any[] } = {};
                                gameState.players?.forEach((p: any) => {
                                    if (!playersByPosition[p.position]) playersByPosition[p.position] = [];
                                    playersByPosition[p.position].push(p);
                                });

                                return Object.entries(playersByPosition).flatMap(([posStr, players]) => {
                                    const position = parseInt(posStr);
                                    const { row, col } = getGridPosition(position);

                                    return players.map((player: any, index: number) => {
                                        // Calculate Offset
                                        // If multiple players (length > 1), offset them.
                                        // Simple horizontal offset: (index - (total-1)/2) * offsetAmount
                                        const count = players.length;
                                        const offsetX = count > 1 ? (index - (count - 1) / 2) * 20 : 0;
                                        const offsetY = count > 1 ? (index % 2 === 0 ? -5 : 5) : 0; // Zig-zag slightly vertical too

                                        return (
                                            <Box
                                                key={player.user_id}
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent board drag
                                                    setInventoryTargetId(player.user_id);
                                                    setIsInventoryOpen(true);
                                                }}
                                                sx={{
                                                    gridRow: row,
                                                    gridColumn: col,
                                                    zIndex: 50 + index,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    pointerEvents: 'auto',
                                                    cursor: 'pointer',
                                                    transform: `translate(${offsetX}px, ${offsetY}px)`,
                                                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                    '&:hover': { transform: `translate(${offsetX}px, ${offsetY - 5}px) scale(1.1)` }
                                                }}
                                            >
                                                <PlayerToken color={player.token_color} name={player.name} isCurrentTurn={gameState.current_turn_id === player.user_id} />
                                            </Box>
                                        );
                                    });
                                });
                            })()}

                            {/* CENTER CONSOLE */}
                            <Box sx={{
                                gridRow: '2 / 17',
                                gridColumn: '2 / 17',
                                bgcolor: 'grey.900',
                                m: 1,
                                borderRadius: 4,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                border: 1,
                                borderColor: 'grey.800'
                            }}>

                                {/* STATUS: WAITING */}
                                {gameState.status === 'WAITING' && (
                                    <Box sx={{ textAlign: 'center', p: 4 }}>
                                        <Typography variant="h4" color="white" gutterBottom>Esperando Jugadores...</Typography>
                                        <Typography variant="body1" color="grey.400" gutterBottom>Jugadores conectados: {gameState.players.length}</Typography>
                                        {canStart && (
                                            <Button variant="contained" color="success" size="large" startIcon={<PlayArrow />} onClick={() => sendMessage('START_GAME', {})}>
                                                INICIAR PARTIDA
                                            </Button>
                                        )}
                                        {!isHost && <Typography variant="caption" color="grey.600">Solo el anfitrión puede iniciar.</Typography>}
                                    </Box>
                                )}

                                {/* STATUS: ROLLING ORDER */}
                                {gameState.status === 'ROLLING_ORDER' && (
                                    <Box sx={{ textAlign: 'center', p: 4 }}>
                                        <Typography variant="h5" color="warning.main" gutterBottom>Fase de Inicialización</Typography>
                                        <Typography variant="body1" color="white" gutterBottom>
                                            Lanza los dados para determinar el orden de los turnos.
                                        </Typography>

                                        {/* Check if I already rolled in logs */}
                                        {(() => {
                                            const myRollLog = gameState.logs?.find((l: any) => l.message.includes(user?.name) && l.message.includes('initiative'));
                                            if (myRollLog) {
                                                return <Typography variant="h6" color="success.light">¡Ya has lanzado! Esperando a los demás...</Typography>;
                                            }
                                            return (
                                                <Button variant="contained" color="warning" size="large" onClick={() => sendMessage('ROLL_ORDER', {})}>
                                                    LANZAR DADO (INICIATIVA)
                                                </Button>
                                            );
                                        })()}
                                    </Box>
                                )}

                                {/* STATUS: ACTIVE */}
                                {gameState.status === 'ACTIVE' && (
                                    <Box sx={{ width: '100%', maxWidth: 500, p: 2, textAlign: 'center' }}>
                                        <Typography variant="h4" fontWeight="900" color="primary" sx={{ opacity: 0.1, userSelect: 'none' }}>MONOPOLY</Typography>

                                        <Paper sx={{ my: 3, p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                                            <Typography variant="h5" fontWeight="bold" color="primary">
                                                {isMyTurn ? '¡TU TURNO!' : `Turno de: ${gameState.players?.find((p: any) => p.user_id === gameState.current_turn_id)?.name}`}
                                            </Typography>
                                        </Paper>

                                        {/* Dice Display */}
                                        {gameState.dice && (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 3 }}>
                                                {gameState.dice.map((d: number, i: number) => (
                                                    <Paper key={i} sx={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}>
                                                        <Typography variant="h4" fontWeight="bold">{d}</Typography>
                                                    </Paper>
                                                ))}
                                            </Box>
                                        )}



                                        {/* Actions */}
                                        {isMyTurn && (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                                                {canRoll && (
                                                    <Button variant="contained" color="success" size="large" startIcon={<Casino />} onClick={() => sendMessage('ROLL_DICE', {})} sx={{ px: 4, py: 1.5, borderRadius: 8, fontSize: '1.2rem' }}>
                                                        {isDoubles ? 'LANZAR DE NUEVO (DOBLES)' : 'LANZAR DADOS'}
                                                    </Button>
                                                )}
                                                {/* Buy Logic & End Turn Control */}
                                                {hasRolledAny && (() => {
                                                    const me = gameState.players.find((p: any) => p.user_id === user.user_id);
                                                    if (!me) return null; // Guard against undefined

                                                    // Use dynamic board from gameState
                                                    const tile = gameState?.board?.[me.position];
                                                    if (!tile) return null;

                                                    // Check ownership using property_id (snake_case from API)
                                                    const propId = tile.property_id;
                                                    const isUnownedProperty = propId && !gameState.property_ownership?.[propId];

                                                    // Force Action if on Unowned Property
                                                    // If it's an unowned property, HIDE End Turn until dealt with.
                                                    // Also ensure it's a purchasable type
                                                    const isPurchasable = tile.type === 'PROPERTY' || tile.type === 'UTILITY' || tile.type === 'RAILROAD' || tile.type === 'ATTRACTION' || tile.type === 'PARK';
                                                    const mustBuyOrAuction = isUnownedProperty && isPurchasable;

                                                    // Card Logic
                                                    const isCardTile = tile.type === 'CHANCE' || tile.type === 'COMMUNITY';
                                                    const hasDrawn = !!gameState.drawn_card;
                                                    const mustDraw = isCardTile && !hasDrawn;

                                                    const canEndTurn = !mustBuyOrAuction && !mustDraw;

                                                    return (
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                            {/* Draw Card Button */}
                                                            {mustDraw && (
                                                                <Button
                                                                    variant="contained"
                                                                    color="secondary"
                                                                    size="large"
                                                                    startIcon={<Casino />}
                                                                    onClick={() => sendMessage('DRAW_CARD', {})}
                                                                    sx={{ px: 4, py: 1.5, borderRadius: 8, background: 'linear-gradient(45deg, #FF8E53 30%, #FE6B8B 90%)' }}
                                                                >
                                                                    SACAR TARJETA
                                                                </Button>
                                                            )}

                                                            {/* Action Buttons for Unowned Property */}
                                                            {mustBuyOrAuction && (
                                                                <Stack direction="row" spacing={1}>
                                                                    <Button
                                                                        variant="contained"
                                                                        color="info"
                                                                        disabled={(me.balance || 0) < (tile.price || 0)}
                                                                        onClick={() => sendMessage('BUY_PROPERTY', { property_id: propId })}
                                                                    >
                                                                        COMPRAR (${tile.price})
                                                                    </Button>
                                                                    <Button
                                                                        variant="outlined"
                                                                        color="warning"
                                                                        onClick={() => sendMessage('START_AUCTION', { property_id: propId })}
                                                                    >
                                                                        SUBASTAR
                                                                    </Button>
                                                                </Stack>
                                                            )}

                                                            {/* End Turn Button - Only if allowed */}
                                                            {canEndTurn && (
                                                                <Button variant="contained" color="error" size="large" startIcon={<CheckCircle />} onClick={() => sendMessage('END_TURN', {})} sx={{ px: 4, py: 1.5, borderRadius: 8 }}>
                                                                    FINALIZAR TURNO
                                                                </Button>
                                                            )}
                                                        </Box>
                                                    );
                                                })()}
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Box>
            </Box>

            {/* Persistent Funds Display (Tablet/Mobile) - REMOVED (Moved to Navbar) */}

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

            {/* Drawers & Modals */}
            <InventoryDrawer
                isOpen={isInventoryOpen}
                onClose={() => { setIsInventoryOpen(false); setInventoryTargetId(null); }}
                gameState={gameState}
                user={user}
                sendMessage={sendMessage}
                targetPlayerId={inventoryTargetId || undefined}
            />
            <TradeModal gameState={gameState} user={user} sendMessage={sendMessage} />
            <AuctionModal gameState={gameState} user={user} sendMessage={sendMessage} />

            {gameState.drawn_card && gameState.drawn_card.id !== hiddenCardId && (
                <CardModal
                    gameState={gameState}
                    user={user}
                    sendMessage={sendMessage}
                    onClose={() => setHiddenCardId(gameState.drawn_card.id)}
                />
            )}

            <TileDetailModal
                tile={selectedTile}
                gameState={gameState}
                user={user}
                sendMessage={sendMessage}
                onClose={() => setSelectedTile(null)}
            />

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
