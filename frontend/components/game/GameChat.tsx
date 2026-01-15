'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, TextField, IconButton, Badge, Chip, Tooltip } from '@mui/material';
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

export default function GameChat({ messages, players, onSend, currentUserId, logHeight }: GameChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastMessageCountRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Track unread messages
    useEffect(() => {
        if (!isOpen && messages.length > lastMessageCountRef.current) {
            setUnreadCount(prev => prev + (messages.length - lastMessageCountRef.current));
        }
        lastMessageCountRef.current = messages.length;
    }, [messages.length, isOpen]);

    // Clear unread when opened
    useEffect(() => {
        if (isOpen) setUnreadCount(0);
    }, [isOpen]);

    // Auto-scroll
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

    const handleMention = (player: Player) => {
        setInputValue(prev => prev + `@${player.name} `);
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
            maxWidth: '85%',
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
        <>
            {/* Chat FAB - No fixed position, will be placed by parent Stack */}
            <Box
                onClick={() => setIsOpen(!isOpen)}
                sx={{
                    width: 56,
                    height: 56,
                    background: isOpen ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isOpen ? '0 4px 20px rgba(239, 68, 68, 0.4)' : '0 4px 20px rgba(59, 130, 246, 0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': { transform: 'scale(1.1)' }
                }}
            >
                <Badge badgeContent={unreadCount} color="error">
                    <Chat sx={{ color: 'white' }} />
                </Badge>
            </Box>

            {/* Chat Panel - Fixed position, appears above the FAB area */}
            {isOpen && (
                <Paper sx={{
                    position: 'fixed',
                    bottom: logHeight + 90,
                    left: 24,
                    width: 340,
                    height: 450,
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 2,
                    zIndex: 100,
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}>
                    {/* Header */}
                    <Box sx={{ p: 1.5, bgcolor: 'grey.900', borderBottom: '1px solid', borderColor: 'grey.800' }}>
                        <Typography variant="subtitle2" color="white">💬 Chat del Juego</Typography>
                    </Box>

                    {/* Player Mention Bar */}
                    <Box sx={{
                        px: 1,
                        py: 0.5,
                        bgcolor: 'rgba(0,0,0,0.2)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        alignItems: 'center'
                    }}>
                        <Typography variant="caption" color="grey.500" sx={{ mr: 0.5 }}>@</Typography>
                        {otherPlayers.map(player => (
                            <Chip
                                key={player.user_id}
                                label={player.name}
                                size="small"
                                icon={player.is_bot ? <SmartToy sx={{ fontSize: 12 }} /> : undefined}
                                onClick={() => handleMention(player)}
                                sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    bgcolor: player.token_color,
                                    color: 'white',
                                    cursor: 'pointer',
                                    '&:hover': { filter: 'brightness(1.2)' }
                                }}
                            />
                        ))}
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
                                        <Typography variant="body2" color="white" sx={{ wordBreak: 'break-word' }}>
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
                            <IconButton size="small" onClick={() => setReplyingTo(null)} sx={{ p: 0 }}>
                                <Typography color="grey.500" sx={{ fontSize: 12 }}>✕</Typography>
                            </IconButton>
                        </Box>
                    )}

                    {/* Input */}
                    <Box component="form" onSubmit={handleSubmit} sx={{ p: 1, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 1 }}>
                        <TextField
                            inputRef={inputRef}
                            fullWidth
                            size="small"
                            placeholder="Escribe un mensaje..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            sx={{
                                '& input': { color: 'white' },
                                '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'grey.700' } }
                            }}
                        />
                        <IconButton type="submit" color="primary" disabled={!inputValue.trim()}>
                            <Send />
                        </IconButton>
                    </Box>
                </Paper>
            )}
        </>
    );
}
