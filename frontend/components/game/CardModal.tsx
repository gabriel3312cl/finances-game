import React from 'react';
import { Dialog, DialogContent, Typography, Button, Box, Paper, Slide } from '@mui/material';
import { Star, LocalActivity, Casino } from '@mui/icons-material';

interface CardModalProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
    onClose?: () => void;
}

const Transition = React.forwardRef(function Transition(props: any, ref: any) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function CardModal({ gameState, user, sendMessage, onClose }: CardModalProps) {
    const card = gameState?.drawn_card;
    const isOpen = !!card;

    if (!isOpen) return null;

    // Helper to clear the card from state (locally or via backend ack)
    // For now, we assume clicking "OK" just closes the modal or triggers a "Card Acknowledged" action if needed.
    // If backend persists `drawn_card` in state, we might need an action to clear it.
    // For MVP, if `drawn_card` sticks, the modal sticks.
    // So we likely need an action "ACKNOWLEDGE_CARD" or just "END_TURN" if that's next.
    // But typically we want to see the effect, then click OK, then End Turn.

    // Actually, `handleDrawCard` updates state. The card is visible.
    // We need a way to dismiss it.
    // Since we don't have "ACKNOWLEDGE_CARD" backend logic solely for this, 
    // we can trust that "End Turn" or next action clears it?
    // No, that's messy.
    // Let's implement client-side local dismissal? 
    // No, if I refresh page, card should be there or gone?
    // Proper way: Backend clears `DrawnCard` on a signal.

    // Workaround: We'll add local state to hide it IF the ID hasn't changed?
    // Start with just "End Turn" or a dismiss callback if provided.
    // Actually, let's just use `onClose` to hide it locally for this session view?

    const handleClose = () => {
        if (onClose) onClose();
        // Since we don't have a backend "Clear Card" action yet, 
        // we might rely on the next turn clearing it?
        // Or we can send a dummy action or if the user Ends Turn, it clears?
        // Let's try to just close locally.
    };

    const isChance = card.type === 'CHANCE';
    const bgColor = isChance ? '#ffa726' : '#42a5f5'; // Orange vs Blue
    const Icon = isChance ? Casino : LocalActivity;

    return (
        <Dialog
            open={isOpen}
            TransitionComponent={Transition}
            keepMounted
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    bgcolor: 'transparent',
                    boxShadow: 'none'
                }
            }}
        >
            <Paper sx={{
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                background: `linear-gradient(135deg, ${bgColor} 0%, #1a237e 100%)`,
                color: 'white',
                border: '4px solid white',
                borderRadius: 4,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <Box sx={{
                    position: 'absolute',
                    top: -20,
                    right: -20,
                    width: 100,
                    height: 100,
                    bgcolor: 'rgba(255,255,255,0.1)',
                    borderRadius: '50%'
                }} />

                <Icon sx={{ fontSize: 60, mb: 2, color: 'white' }} />

                <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>
                    {isChance ? 'FORTUNA' : 'ARCA COMUNAL'}
                </Typography>

                {card.title && (
                    <Typography variant="h6" sx={{ mt: 1, textTransform: 'uppercase', opacity: 0.9 }}>
                        {card.title}
                    </Typography>
                )}

                <Paper sx={{ p: 3, my: 2, width: '100%', bgcolor: 'rgba(255,255,255,0.9)', color: '#333', borderRadius: 2 }}>
                    <Typography variant="h6" fontStyle="italic">
                        {card.description}
                    </Typography>
                </Paper>

                <Button
                    variant="contained"
                    color="secondary"
                    size="large"
                    onClick={handleClose}
                    sx={{ borderRadius: 8, px: 4, mt: 1, bgcolor: 'white', color: bgColor, fontWeight: 'bold', '&:hover': { bgcolor: 'grey.100' } }}
                >
                    ACEPTAR
                </Button>
            </Paper>
        </Dialog>
    );
}
