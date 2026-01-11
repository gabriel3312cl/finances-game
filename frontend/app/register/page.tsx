'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/auth';
import Link from 'next/link';
import { Container, Box, Typography, TextField, Button, Paper, Alert, Link as MuiLink } from '@mui/material';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [specialCode, setSpecialCode] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, special_code: specialCode }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Error en el registro');
            }

            router.push('/login');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at top, #1f2937, #111827)',
            }}
        >
            <Container maxWidth="xs">
                <Paper
                    elevation={10}
                    sx={{
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                    }}
                >
                    <Typography component="h1" variant="h4" sx={{ mb: 1, fontWeight: 'bold', background: 'linear-gradient(45deg, #c084fc, #f472b6)', backgroundClip: 'text', textFillColor: 'transparent', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Únete a la Élite
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Ingresa tu código de acceso para comenzar
                    </Typography>

                    <Box component="form" onSubmit={handleRegister} sx={{ mt: 1, width: '100%' }}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="username"
                            label="Nombre de Usuario"
                            name="username"
                            autoComplete="username"
                            autoFocus
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="Contraseña"
                            type="password"
                            id="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="specialCode"
                            label="CÓDIGO DE ACCESO"
                            id="specialCode"
                            value={specialCode}
                            onChange={(e) => setSpecialCode(e.target.value)}
                            sx={{
                                '& .MuiInputBase-input': { textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase' },
                                '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: '#d97706' }, // amber-600
                                    '&:hover fieldset': { borderColor: '#f59e0b' }, // amber-500
                                },
                            }}
                        />

                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            sx={{ mt: 3, mb: 2, bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }} // purple
                        >
                            Crear Cuenta
                        </Button>

                        <Box sx={{ textAlign: 'center' }}>
                            <MuiLink component={Link} href="/login" variant="body2" color="secondary" sx={{ cursor: 'pointer' }}>
                                {"¿Ya tienes cuenta? Inicia sesión aquí"}
                            </MuiLink>
                        </Box>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
}
