'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, TextField, IconButton, Badge, Chip, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { Chat, Send, SmartToy, Person, SwapHoriz, Reply } from '@mui/icons-material';

interface ChatMessage {
    id: string;
    player_id: string;
    player_name: string;
    message: string;
    type: 'PLAYER' | 'BOT_THOUGHT' | 'SYSTEM' | 'TRADE';
    timestamp: number;
    reply_to?: string; // ID of message being replied to
}

interface Player {
    user_id: string;
    name: string;
    token_color: string;
    is_bot: boolean;
}

interface GameChatProps {
    messages: ChatMessage[];
    players: Player[];
    onSend: (message: string) => void;
    currentUserId: string;
    logHeight: number; // To position above the log console
}

export default function GameChat({ messages, players, onSend, currentUserId }: Omit<GameChatProps, 'logHeight'>) {
    const [inputValue, setInputValue] = useState('');
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [mentionAnchorEl, setMentionAnchorEl] = useState<null | HTMLElement>(null);
    const [mentionSearch, setMentionSearch] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            const finalMessage = replyingTo
                ? `[Respuesta a ${replyingTo.player_name}] ${inputValue.trim()}`
                : inputValue.trim();
            onSend(finalMessage);
            setInputValue('');
            setReplyingTo(null);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);

        // Simple mention detection: Check if last word starts with @
        const words = val.split(' ');
        const lastWord = words[words.length - 1];
        if (lastWord.startsWith('@')) {
            setMentionSearch(lastWord.substring(1));
            // Set anchor to input if not already open
            if (!mentionAnchorEl) {
                setMentionAnchorEl(inputRef.current);
            }
        } else {
            setMentionAnchorEl(null);
        }
    };

    const handleMentionSelect = (player: Player) => {
        // Replace last @word with @PlayerName
        const words = inputValue.split(' ');
        words.pop(); // Remove partial mention
        const newValue = [...words, `@${player.name} `].join(' ');
        setInputValue(newValue);
        setMentionAnchorEl(null);
        inputRef.current?.focus();
    };

    const handleReply = (msg: ChatMessage) => {
        setReplyingTo(msg);
        inputRef.current?.focus();
    };

    const getMessageIcon = (type: string, isBot: boolean) => {
        if (isBot || type === 'BOT_THOUGHT') return <SmartToy sx={{ fontSize: 14, color: 'info.main' }} />;
        if (type === 'TRADE') return <SwapHoriz sx={{ fontSize: 14, color: 'warning.main' }} />;
        return <Person sx={{ fontSize: 14, color: 'grey.400' }} />;
    };

    const getMessageStyle = (type: string, isOwn: boolean) => {
        const base = {
            p: 1,
            borderRadius: 2,
            maxWidth: '90%',
        };
        if (type === 'BOT_THOUGHT') {
            return { ...base, bgcolor: 'rgba(33, 150, 243, 0.1)', border: '1px dashed rgba(33, 150, 243, 0.3)' };
        }
        if (type === 'TRADE') {
            return { ...base, bgcolor: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)' };
        }
        if (isOwn) {
            return { ...base, bgcolor: 'primary.dark' };
        }
        return { ...base, bgcolor: 'grey.800' };
    };

    const isPlayerBot = (playerId: string) => {
        return players.find(p => p.user_id === playerId)?.is_bot || false;
    };

    // Get other players for mention chips
    const otherPlayers = players.filter(p => p.user_id !== currentUserId);

    return (
        <Box sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#1e293b',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <Box sx={{ p: 1, bgcolor: 'grey.900', borderBottom: '1px solid', borderColor: 'grey.800', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" color="white" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chat fontSize="small" /> Chat del Juego
                </Typography>
            </Box>

            {/* Messages */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {messages.length === 0 && (
                    <Typography variant="caption" color="grey.500" sx={{ textAlign: 'center', mt: 2 }}>
                        Sin mensajes aún. ¡Menciona a un jugador con @ para iniciar!
                    </Typography>
                )}
                {messages.map((msg) => {
                    const isOwn = msg.player_id === currentUserId;
                    const isBot = isPlayerBot(msg.player_id);
                    return (
                        <Box key={msg.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                {getMessageIcon(msg.type, isBot)}
                                <Typography variant="caption" color="grey.500">{msg.player_name}</Typography>
                                {!isOwn && (
                                    <Tooltip title="Responder">
                                        <IconButton
                                            size="small"
                                            onClick={() => handleReply(msg)}
                                            sx={{ p: 0, ml: 0.5 }}
                                        >
                                            <Reply sx={{ fontSize: 12, color: 'grey.600' }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                            <Box sx={getMessageStyle(msg.type, isOwn)}>
                                <Typography variant="body2" color="white" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                    {msg.message}
                                </Typography>
                            </Box>
                        </Box>
                    );
                })}
                <div ref={messagesEndRef} />
            </Box>

            {/* Reply indicator */}
            {replyingTo && (
                <Box sx={{
                    px: 1.5,
                    py: 0.5,
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    borderTop: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <Typography variant="caption" color="info.main">
                        ↩ Respondiendo a {replyingTo.player_name}
                    </Typography>
                    <IconButton size="small" onClick={() => setReplyingTo(null)}>
                        <Typography variant="caption" color="error">✕</Typography>
                    </IconButton>
                </Box>
            )}

            {/* Input Area */}
            <Box component="form" onSubmit={handleSubmit} sx={{
                p: 1.5,
                bgcolor: 'rgba(0,0,0,0.2)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                flexShrink: 0
            }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Escribe un mensaje... (@ para mencionar)"
                        value={inputValue}
                        onChange={handleInputChange}
                        inputRef={inputRef}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(0,0,0,0.3)',
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                            }
                        }}
                    />
                    <IconButton
                        type="submit"
                        color="primary"
                        disabled={!inputValue.trim()}
                        sx={{ bgcolor: 'rgba(37, 99, 235, 0.1)', '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.2)' } }}
                    >
                        <Send fontSize="small" />
                    </IconButton>
                </Box>

                {/* Mention Menu */}
                <Menu
                    anchorEl={mentionAnchorEl}
                    open={Boolean(mentionAnchorEl)}
                    onClose={() => setMentionAnchorEl(null)}
                    anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    PaperProps={{
                        sx: { bgcolor: 'rgba(30, 41, 59, 0.95)', border: '1px solid #334155', color: 'white' }
                    }}
                >
                    {otherPlayers
                        .filter(p => p.name.toLowerCase().includes(mentionSearch.toLowerCase()))
                        .map(player => (
                            <MenuItem key={player.user_id} onClick={() => handleMentionSelect(player)} dense>
                                <ListItemIcon>
                                    {player.is_bot ? <SmartToy fontSize="small" sx={{ color: 'info.main' }} /> : <Person fontSize="small" sx={{ color: player.token_color }} />}
                                </ListItemIcon>
                                <ListItemText primary={player.name} />
                            </MenuItem>
                        ))}
                    {otherPlayers.filter(p => p.name.toLowerCase().includes(mentionSearch.toLowerCase())).length === 0 && (
                        <MenuItem disabled>
                            <ListItemText primary="No se encontraron jugadores" />
                        </MenuItem>
                    )}
                </Menu>
            </Box>
        </Box>
    );
}
