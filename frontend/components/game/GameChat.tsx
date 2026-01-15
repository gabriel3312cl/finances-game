'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, TextField, IconButton, Collapse, Badge, Fab } from '@mui/material';
import { Chat, Send, Close, SmartToy, Person, SwapHoriz } from '@mui/icons-material';

interface ChatMessage {
    id: string;
    player_id: string;
    player_name: string;
    message: string;
    type: 'PLAYER' | 'BOT_THOUGHT' | 'SYSTEM' | 'TRADE';
    timestamp: number;
}

interface GameChatProps {
    messages: ChatMessage[];
    onSend: (message: string) => void;
    currentUserId: string;
}

export default function GameChat({ messages, onSend, currentUserId }: GameChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastMessageCountRef = useRef(0);

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
            onSend(inputValue.trim());
            setInputValue('');
        }
    };

    const getMessageIcon = (type: string) => {
        switch (type) {
            case 'BOT_THOUGHT': return <SmartToy sx={{ fontSize: 14, color: 'info.main' }} />;
            case 'TRADE': return <SwapHoriz sx={{ fontSize: 14, color: 'warning.main' }} />;
            default: return <Person sx={{ fontSize: 14, color: 'grey.400' }} />;
        }
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

    return (
        <>
            {/* FAB */}
            <Fab
                color="primary"
                onClick={() => setIsOpen(!isOpen)}
                sx={{
                    position: 'fixed',
                    bottom: 200,
                    left: 24,
                    zIndex: 100
                }}
            >
                <Badge badgeContent={unreadCount} color="error">
                    {isOpen ? <Close /> : <Chat />}
                </Badge>
            </Fab>

            {/* Chat Panel */}
            <Collapse in={isOpen}>
                <Paper sx={{
                    position: 'fixed',
                    bottom: 270,
                    left: 24,
                    width: 320,
                    height: 400,
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 2,
                    zIndex: 100,
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <Box sx={{ p: 1.5, bgcolor: 'grey.900', borderBottom: '1px solid', borderColor: 'grey.800' }}>
                        <Typography variant="subtitle2" color="white">💬 Chat del Juego</Typography>
                    </Box>

                    {/* Messages */}
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {messages.length === 0 && (
                            <Typography variant="caption" color="grey.500" sx={{ textAlign: 'center', mt: 2 }}>
                                Sin mensajes aún. ¡Escribe algo!
                            </Typography>
                        )}
                        {messages.map((msg) => {
                            const isOwn = msg.player_id === currentUserId;
                            return (
                                <Box key={msg.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                        {getMessageIcon(msg.type)}
                                        <Typography variant="caption" color="grey.500">{msg.player_name}</Typography>
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

                    {/* Input */}
                    <Box component="form" onSubmit={handleSubmit} sx={{ p: 1, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 1 }}>
                        <TextField
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
            </Collapse>
        </>
    );
}
