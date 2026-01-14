'use client';

import { useEffect, useState } from 'react';
import { Box, Modal, Typography } from '@mui/material';

interface DiceModalProps {
    open: boolean;
    onClose: () => void;
    dice: [number, number];
}

// Dice dot positions for each face value
const dotPositions: Record<number, { top: string; left: string }[]> = {
    1: [{ top: '50%', left: '50%' }],
    2: [{ top: '25%', left: '25%' }, { top: '75%', left: '75%' }],
    3: [{ top: '25%', left: '25%' }, { top: '50%', left: '50%' }, { top: '75%', left: '75%' }],
    4: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
    5: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '50%', left: '50%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
    6: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '50%', left: '25%' }, { top: '50%', left: '75%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
};

// Component for a single dice face
function DiceFace({ value, transform }: { value: number; transform: string }) {
    return (
        <Box sx={{
            position: 'absolute',
            width: 80,
            height: 80,
            background: 'linear-gradient(145deg, #ffffff, #e6e6e6)',
            borderRadius: 2,
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)',
            transform,
            backfaceVisibility: 'hidden',
        }}>
            {dotPositions[value]?.map((pos, i) => (
                <Box
                    key={i}
                    sx={{
                        position: 'absolute',
                        width: 14,
                        height: 14,
                        bgcolor: '#1a1a2e',
                        borderRadius: '50%',
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -50%)',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                    }}
                />
            ))}
        </Box>
    );
}

// Single 3D Dice component
function Dice3D({ finalValue, delay = 0 }: { finalValue: number; delay?: number }) {
    const [isRolling, setIsRolling] = useState(true);
    const [rotation, setRotation] = useState({ x: 0, y: 0 });

    // Calculate final rotation based on target value
    const getFinalRotation = (value: number) => {
        const rotations: Record<number, { x: number; y: number }> = {
            1: { x: 0, y: 0 },
            2: { x: 0, y: 90 },
            3: { x: -90, y: 0 },
            4: { x: 90, y: 0 },
            5: { x: 0, y: -90 },
            6: { x: 180, y: 0 },
        };
        return rotations[value] || { x: 0, y: 0 };
    };

    useEffect(() => {
        // Start with random spinning
        setIsRolling(true);
        setRotation({ x: Math.random() * 720 + 360, y: Math.random() * 720 + 360 });

        // After animation, settle on final value
        const timer = setTimeout(() => {
            setIsRolling(false);
            const final = getFinalRotation(finalValue);
            // Add extra full rotations for dramatic effect
            setRotation({ x: final.x + 720, y: final.y + 720 });
        }, 1500 + delay);

        return () => clearTimeout(timer);
    }, [finalValue, delay]);

    return (
        <Box sx={{
            width: 80,
            height: 80,
            perspective: 400,
            mx: 2,
        }}>
            <Box sx={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                transition: isRolling
                    ? 'transform 1.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                    : 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
                {/* Front - 1 */}
                <DiceFace value={1} transform="translateZ(40px)" />
                {/* Back - 6 */}
                <DiceFace value={6} transform="translateZ(-40px) rotateY(180deg)" />
                {/* Right - 2 */}
                <DiceFace value={2} transform="translateX(40px) rotateY(90deg)" />
                {/* Left - 5 */}
                <DiceFace value={5} transform="translateX(-40px) rotateY(-90deg)" />
                {/* Top - 3 */}
                <DiceFace value={3} transform="translateY(-40px) rotateX(90deg)" />
                {/* Bottom - 4 */}
                <DiceFace value={4} transform="translateY(40px) rotateX(-90deg)" />
            </Box>
        </Box>
    );
}

export default function DiceModal({ open, onClose, dice }: DiceModalProps) {
    const [showTotal, setShowTotal] = useState(false);
    const total = dice[0] + dice[1];

    useEffect(() => {
        if (open) {
            setShowTotal(false);
            // Show total after dice settle
            const timer = setTimeout(() => {
                setShowTotal(true);
            }, 2500);

            // Auto-close modal
            const closeTimer = setTimeout(() => {
                onClose();
            }, 4000);

            return () => {
                clearTimeout(timer);
                clearTimeout(closeTimer);
            };
        }
    }, [open, onClose]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Box sx={{
                outline: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 4,
                bgcolor: 'rgba(15, 23, 42, 0.95)',
                borderRadius: 4,
                border: '2px solid rgba(99, 102, 241, 0.5)',
                boxShadow: '0 0 60px rgba(99, 102, 241, 0.3)',
                backdropFilter: 'blur(20px)',
                minWidth: 300,
            }}>
                <Typography
                    variant="h5"
                    sx={{
                        color: 'white',
                        mb: 4,
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: 2,
                    }}
                >
                    🎲 Lanzando Dados
                </Typography>

                <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                    <Dice3D finalValue={dice[0]} delay={0} />
                    <Dice3D finalValue={dice[1]} delay={200} />
                </Box>

                <Box sx={{
                    mt: 4,
                    opacity: showTotal ? 1 : 0,
                    transform: showTotal ? 'scale(1)' : 'scale(0.5)',
                    transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}>
                    <Typography
                        variant="h3"
                        sx={{
                            color: '#22c55e',
                            fontWeight: 'bold',
                            textShadow: '0 0 20px rgba(34, 197, 94, 0.5)',
                        }}
                    >
                        ¡{total}!
                    </Typography>
                </Box>
            </Box>
        </Modal>
    );
}
