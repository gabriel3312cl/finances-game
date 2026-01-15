'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth, removeToken } from '@/lib/auth';
import {
    AppBar, Toolbar, Typography, Button, Container, Stack,
    Card, CardContent, CardActions, TextField, Box,
    IconButton, Alert
} from '@mui/material';
import { AccountCircle, ExitToApp, DeleteForever, AddCircle, Login as LoginIcon } from '@mui/icons-material';

interface Game {
    game_id: string;
    players: any[];
    status: string;
    host_id?: string;
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ user_id: string; username: string } | null>(null);
    const [joinCode, setJoinCode] = useState('');
    const [myGames, setMyGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuthAndLoad = async () => {
            try {
                // Check Auth
                const authRes = await fetchWithAuth('/me');
                if (authRes.ok) {
                    const userData = await authRes.json();
                    setUser(userData);

                    // Load My Games
                    const gamesRes = await fetchWithAuth('/games/my');
                    if (gamesRes.ok) {
                        const gamesData = await gamesRes.json();
                        setMyGames(gamesData || []);
                    }
                }
            } catch (error) {
                console.error("Error al cargar datos", error);
            } finally {
                setLoading(false);
            }
        };
        checkAuthAndLoad();
    }, []);

    const handleLogout = () => {
        removeToken();
        router.push('/login');
    };

    const handleCreateGame = async () => {
        try {
            const res = await fetchWithAuth('/games/create', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                router.push(`/game/${data.game_id}`);
            } else {
                alert('Error al crear partida');
            }
        } catch (e) {
            alert('Error de conexión');
        }
    };

    const handleJoinGame = async () => {
        if (!joinCode) return;
        try {
            const res = await fetchWithAuth('/games/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: joinCode.toUpperCase() })
            });

            if (res.ok) {
                const data = await res.json();
                router.push(`/game/${data.game_id}`);
            } else {
                const err = await res.json();
                alert(err.message || 'Error al unirse');
            }
        } catch (e) {
            alert('Error de conexión');
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm('¿Estás seguro de que quieres eliminar tu cuenta? No se puede deshacer.')) return;

        try {
            const res = await fetchWithAuth('/delete-account', { method: 'DELETE' });
            if (res.ok) {
                removeToken();
                router.push('/');
            }
        } catch (e) {
            alert('Error al eliminar cuenta');
        }
    };

    return (
        <Box sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Navbar */}
            <AppBar position="static" enableColorOnDark sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: 'primary.main' }}>
                        Juego de Finanzas
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                            {user?.username}
                        </Typography>
                        <Button
                            color="inherit"
                            startIcon={<AccountCircle />}
                            onClick={() => alert('Próximamente: Editar Perfil')}
                        >
                            Perfil
                        </Button>
                        <Button
                            color="error"
                            startIcon={<ExitToApp />}
                            onClick={handleLogout}
                        >
                            Salir
                        </Button>
                    </Box>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
                <Stack spacing={4}>
                    {/* Action Cards */}
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
                        <Box sx={{ flex: 1 }}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: '0.3s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 } }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography gutterBottom variant="h5" component="div" color="primary">
                                        Crear Nueva Sesión
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Crea una partida, invita amigos y conviértete en el magnate.
                                    </Typography>
                                </CardContent>
                                <CardActions sx={{ p: 2 }}>
                                    <Button fullWidth variant="contained" size="large" onClick={handleCreateGame} startIcon={<AddCircle />}>
                                        Crear Partida
                                    </Button>
                                </CardActions>
                            </Card>
                        </Box>

                        <Box sx={{ flex: 1 }}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: '0.3s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 } }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography gutterBottom variant="h5" component="div" color="secondary">
                                        Unirse a Sesión
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Ingresa el código para unirte a una sala existente.
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        label="CÓDIGO"
                                        variant="outlined"
                                        value={joinCode}
                                        onChange={(e) => setJoinCode(e.target.value)}
                                        inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 2 } }}
                                    />
                                </CardContent>
                                <CardActions sx={{ p: 2 }}>
                                    <Button fullWidth variant="contained" color="secondary" size="large" onClick={handleJoinGame} startIcon={<LoginIcon />}>
                                        Unirse
                                    </Button>
                                </CardActions>
                            </Card>
                        </Box>
                    </Stack>

                    {/* Active Games List */}
                    <Box>
                        <Typography variant="h5" sx={{ mb: 2, mt: 4, fontWeight: 'medium' }}>
                            Tus Partidas Activas
                        </Typography>

                        {myGames.length === 0 ? (
                            <Alert severity="info" variant="outlined">
                                No tienes partidas activas en este momento. ¡Crea o únete a una!
                            </Alert>
                        ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                {myGames.map((game) => (
                                    <Box key={game.game_id} sx={{ flex: '1 1 300px', maxWidth: '400px' }}>
                                        <Card sx={{ bgcolor: 'background.paper', borderLeft: 6, borderColor: 'primary.main' }}>
                                            <CardContent>
                                                <Typography variant="h6">
                                                    Partida #{game.game_id}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Estado: {game.status}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Jugadores: {game.players?.length || 0}
                                                </Typography>
                                            </CardContent>
                                            <CardActions sx={{ justifyContent: 'space-between' }}>
                                                <Button size="small" onClick={() => router.push(`/game/${game.game_id}`)}>
                                                    Continuar
                                                </Button>
                                                {user?.user_id === game.host_id && (
                                                    <IconButton
                                                        color="error"
                                                        size="small"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!confirm('¿Seguro que quieres eliminar esta partida? Se perderá todo el progreso.')) return;
                                                            try {
                                                                const res = await fetchWithAuth(`/games/delete?id=${game.game_id}`, { method: 'POST' }); // Using POST or DELETE depending on router/proxy issues, but backend expects DELETE? Main.go says DELETE handler? No wait, standard `mux` doesn't enforce method if I don't check it.
                                                                // Actually backend handler CHECKS: if r.Method != "DELETE"
                                                                // So I MUST use DELETE
                                                                const resDel = await fetchWithAuth(`/games/delete?id=${game.game_id}`, { method: 'DELETE' });
                                                                if (resDel.ok) {
                                                                    setMyGames(prev => prev.filter(g => g.game_id !== game.game_id));
                                                                } else {
                                                                    const err = await resDel.json();
                                                                    alert(err.message || 'Error al eliminar');
                                                                }
                                                            } catch (err) {
                                                                alert('Error de conexión');
                                                            }
                                                        }}
                                                    >
                                                        <DeleteForever />
                                                    </IconButton>
                                                )}
                                            </CardActions>
                                        </Card>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                </Stack>

                {/* Footer */}
                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center' }}>
                    <Button color="error" size="small" startIcon={<DeleteForever />} onClick={handleDeleteAccount}>
                        Eliminar Cuenta
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
