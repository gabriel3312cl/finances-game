'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Paper, Typography, IconButton, TextField,
    Drawer, Chip, CircularProgress, Fade
} from '@mui/material';
import {
    Psychology, Close, Send, AutoAwesome, AttachMoney,
    TrendingUp, Warning, Lightbulb
} from '@mui/icons-material';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface AdvisorChatProps {
    gameId: string;
    token: string;
    apiUrl: string;
    isOpen: boolean;
    onClose: () => void;
}

const QUICK_SUGGESTIONS = [
    { text: '¿Debería comprar esta propiedad?', icon: <AttachMoney fontSize="small" /> },
    { text: '¿Cuál es mi situación financiera?', icon: <TrendingUp fontSize="small" /> },
    { text: '¿Qué propiedades me convienen?', icon: <Lightbulb fontSize="small" /> },
    { text: '¿Debo pedir un préstamo?', icon: <Warning fontSize="small" /> },
];

export default function AdvisorChat({ gameId, token, apiUrl, isOpen, onClose }: AdvisorChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load history from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(`advisor_chat_${gameId}`);
        if (saved) {
            try {
                setMessages(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load chat history:', e);
            }
        }
    }, [gameId]);

    // Save history to localStorage
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem(`advisor_chat_${gameId}`, JSON.stringify(messages));
        }
    }, [messages, gameId]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [streamingContent, setStreamingContent] = useState('');

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: text.trim(),
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);
        setStreamingContent('');

        try {
            // Build history for context (last 10 messages)
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }));

            // Use streaming endpoint
            const response = await fetch(`${apiUrl}/api/games/${gameId}/advisor/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: text.trim(),
                    history
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Error al contactar al asesor');
            }

            // Read the stream
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Streaming not supported');

            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                fullContent += parsed.content;
                                setStreamingContent(fullContent);
                            }
                            if (parsed.error) {
                                throw new Error(parsed.error);
                            }
                        } catch (e) {
                            // Skip malformed JSON
                        }
                    }
                }
            }

            // Add final message
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: fullContent,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMessage]);
            setStreamingContent('');

        } catch (err: any) {
            setError(err.message || 'Error de conexión');
            console.error('Advisor error:', err);
            setStreamingContent('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearHistory = () => {
        setMessages([]);
        localStorage.removeItem(`advisor_chat_${gameId}`);
    };

    return (
        <Drawer
            anchor="right"
            open={isOpen}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: '100%', sm: 400 },
                    bgcolor: '#0f172a',
                    borderLeft: '1px solid rgba(255,255,255,0.1)'
                }
            }}
        >
            {/* Header */}
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                        p: 1,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        display: 'flex'
                    }}>
                        <Psychology sx={{ color: 'white' }} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" fontWeight="bold" color="white">
                            Asesor de Monopoly
                        </Typography>
                        <Typography variant="caption" color="grey.500">
                            Estrategia profesional
                        </Typography>
                    </Box>
                </Box>
                <IconButton onClick={onClose} sx={{ color: 'grey.400' }}>
                    <Close />
                </IconButton>
            </Box>

            {/* Messages */}
            <Box sx={{
                flex: 1,
                overflowY: 'auto',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}>
                {messages.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <AutoAwesome sx={{ fontSize: 48, color: 'grey.600', mb: 2 }} />
                        <Typography variant="body2" color="grey.500" sx={{ mb: 3 }}>
                            ¡Hola! Soy tu asesor estratégico de Monopoly.
                            Pregúntame sobre compras, ventas, negociaciones o cualquier duda del juego.
                        </Typography>
                    </Box>
                )}

                {messages.map((msg, idx) => (
                    <Fade in key={idx}>
                        <Box sx={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                        }}>
                            <Paper sx={{
                                p: 1.5,
                                maxWidth: '85%',
                                bgcolor: msg.role === 'user'
                                    ? 'rgba(99, 102, 241, 0.2)'
                                    : 'rgba(255,255,255,0.05)',
                                border: msg.role === 'user'
                                    ? '1px solid rgba(99, 102, 241, 0.3)'
                                    : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: msg.role === 'user'
                                    ? '12px 12px 4px 12px'
                                    : '12px 12px 12px 4px'
                            }}>
                                <Typography variant="body2" color="white" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {msg.content}
                                </Typography>
                                <Typography variant="caption" color="grey.600" sx={{ display: 'block', mt: 0.5, textAlign: 'right' }}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Paper>
                        </Box>
                    </Fade>
                ))}

                {/* Streaming message (typing effect) */}
                {isLoading && streamingContent && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Paper sx={{
                            p: 1.5,
                            maxWidth: '85%',
                            bgcolor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px 12px 12px 4px'
                        }}>
                            <Typography variant="body2" color="white" sx={{ whiteSpace: 'pre-wrap' }}>
                                {streamingContent}
                                <Box
                                    component="span"
                                    sx={{
                                        display: 'inline-block',
                                        width: 8,
                                        height: 16,
                                        bgcolor: 'primary.main',
                                        ml: 0.5,
                                        animation: 'blink 1s step-end infinite',
                                        '@keyframes blink': {
                                            '0%, 100%': { opacity: 1 },
                                            '50%': { opacity: 0 }
                                        }
                                    }}
                                />
                            </Typography>
                        </Paper>
                    </Box>
                )}

                {/* Loading indicator when no content yet */}
                {isLoading && !streamingContent && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} sx={{ color: 'grey.500' }} />
                        <Typography variant="caption" color="grey.500">
                            Analizando...
                        </Typography>
                    </Box>
                )}

                {error && (
                    <Paper sx={{ p: 1.5, bgcolor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <Typography variant="caption" color="error.main">
                            ⚠️ {error}
                        </Typography>
                    </Paper>
                )}

                <div ref={messagesEndRef} />
            </Box>

            {/* Quick Suggestions */}
            {messages.length === 0 && (
                <Box sx={{ px: 2, pb: 2 }}>
                    <Typography variant="caption" color="grey.600" sx={{ mb: 1, display: 'block' }}>
                        Sugerencias:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                            <Chip
                                key={idx}
                                icon={suggestion.icon}
                                label={suggestion.text}
                                onClick={() => sendMessage(suggestion.text)}
                                sx={{
                                    bgcolor: 'rgba(255,255,255,0.05)',
                                    color: 'grey.300',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    '&:hover': {
                                        bgcolor: 'rgba(99, 102, 241, 0.2)',
                                        borderColor: 'rgba(99, 102, 241, 0.3)'
                                    }
                                }}
                            />
                        ))}
                    </Box>
                </Box>
            )}

            {/* Input */}
            <Box sx={{
                p: 2,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                bgcolor: '#1e293b'
            }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="Escribe tu pregunta..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isLoading}
                        size="small"
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(0,0,0,0.2)',
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                            },
                            '& .MuiOutlinedInput-input': {
                                '&::placeholder': { color: 'grey.600', opacity: 1 }
                            }
                        }}
                    />
                    <IconButton
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || isLoading}
                        sx={{
                            bgcolor: 'primary.main',
                            color: 'white',
                            '&:hover': { bgcolor: 'primary.dark' },
                            '&.Mui-disabled': { bgcolor: 'grey.800', color: 'grey.600' }
                        }}
                    >
                        <Send />
                    </IconButton>
                </Box>
                {messages.length > 0 && (
                    <Typography
                        variant="caption"
                        color="grey.600"
                        sx={{ mt: 1, display: 'block', textAlign: 'center', cursor: 'pointer', '&:hover': { color: 'grey.400' } }}
                        onClick={clearHistory}
                    >
                        Limpiar historial
                    </Typography>
                )}
            </Box>
        </Drawer>
    );
}
