'use client';
import { Box } from '@mui/material';
import { keyframes } from '@mui/system';
import React from 'react';

// Maps Color Name to Hex (sharing map from PlayerToken if possible, or duplicated)
const colorMap: Record<string, string> = {
    'RED': '#ef4444',
    'BLUE': '#3b82f6',
    'GREEN': '#22c55e',
    'YELLOW': '#eab308',
    'PURPLE': '#a855f7',
    'ORANGE': '#f97316',
    'CYAN': '#06b6d4',
    'PINK': '#ec4899',
    'GRAY': '#9ca3af',
};

const spin = keyframes`
  0% { transform: rotateX(-15deg) rotateY(0deg); }
  100% { transform: rotateX(-15deg) rotateY(360deg); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`;

interface Token3DProps {
    color: string;
    shape: string; // 'CUBE' | 'PYRAMID' | 'COIN' | 'STAR'
    size?: number;
    animated?: boolean;
}

export default function Token3D({ color, shape, size = 40, animated = true }: Token3DProps) {
    const hex = colorMap[color] || color;

    return (
        <Box sx={{
            width: size,
            height: size,
            perspective: size * 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Box sx={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                animation: animated ? `${spin} 8s linear infinite` : 'none',
                transform: !animated ? 'rotateX(-20deg) rotateY(30deg)' : undefined,
            }}>
                {shape === 'CUBE' && <Cube color={hex} size={size} />}
                {shape === 'PYRAMID' && <Pyramid color={hex} size={size} />}
                {shape === 'COIN' && <Coin color={hex} size={size} />}

                {/* Emojis */}
                {shape === 'DOG' && <Billboard content="🐕" size={size} />}
                {shape === 'CAT' && <Billboard content="🐈" size={size} />}
                {shape === 'HORSE' && <Billboard content="🐎" size={size} />}
                {shape === 'CAR' && <Billboard content="🚗" size={size} />}
                {shape === 'MAN' && <Billboard content="👨" size={size} />}
                {shape === 'WOMAN' && <Billboard content="👩" size={size} />}
                {shape === 'ROCKET' && <Billboard content="🚀" size={size} />}
                {shape === 'FROG' && <Billboard content="🐸" size={size} />}
                {shape === 'MEME1' && <Billboard content="🤡" size={size} />}

                {/* Fallback */}
                {(!shape || !['CUBE', 'PYRAMID', 'COIN', 'DOG', 'CAT', 'HORSE', 'CAR', 'MAN', 'WOMAN', 'ROCKET', 'FROG', 'MEME1'].includes(shape)) && <Cube color={hex} size={size} />}
            </Box>
        </Box>
    );
}

function Billboard({ content, size }: { content: string, size: number }) {
    // Single-sided Billboard (Back is naturally mirrored by browser)
    // This avoids "ghosting" or "double" look caused by transparent emojis on two faces.
    const s = size * 1.2;
    const fontsize = s * 0.8;

    return (
        <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: s,
            height: s,
            transform: `translate(-${s / 2}px, -${s / 2}px)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontsize,
            // Ensure visibility from both sides (default is visible)
        }}>
            {content}
        </Box>
    );
}

function Cube({ color, size }: { color: string, size: number }) {
    const s = size * 0.6; // Scale down slightly to fit container
    const offset = s / 2;
    // Darken/Lighten for 3D effect
    const faceStyle = {
        position: 'absolute',
        width: s,
        height: s,
        opacity: 0.9,
        border: '1px solid rgba(0,0,0,0.1)'
    } as const;

    return (
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-${size / 2}px, -${size / 2}px)` }}>
            {/* Front */}
            <Box sx={{ ...faceStyle, bgcolor: color, transform: `translateZ(${offset}px)` }} />
            {/* Back */}
            <Box sx={{ ...faceStyle, bgcolor: color, filter: 'brightness(0.7)', transform: `rotateY(180deg) translateZ(${offset}px)` }} />
            {/* Right */}
            <Box sx={{ ...faceStyle, bgcolor: color, filter: 'brightness(0.8)', transform: `rotateY(90deg) translateZ(${offset}px)` }} />
            {/* Left */}
            <Box sx={{ ...faceStyle, bgcolor: color, filter: 'brightness(0.8)', transform: `rotateY(-90deg) translateZ(${offset}px)` }} />
            {/* Top */}
            <Box sx={{ ...faceStyle, bgcolor: color, filter: 'brightness(1.2)', transform: `rotateX(90deg) translateZ(${offset}px)` }} />
            {/* Bottom */}
            <Box sx={{ ...faceStyle, bgcolor: color, filter: 'brightness(0.5)', transform: `rotateX(-90deg) translateZ(${offset}px)` }} />
        </Box>
    );
}

function Pyramid({ color, size }: { color: string, size: number }) {
    // 4 Sided Pyramid (Square Base)
    const w = size * 0.7; // Base width
    const h = size * 0.7; // Height
    const offset = w / 2;

    // Slant height calculation roughly
    // We use borders to create triangles or clip-path
    // CSS 3D Triangles are best done with clip-path on a square method or using borders
    // Let's use clip-path square with rotation

    const faceStyle = {
        position: 'absolute',
        width: w,
        height: h, // Slant height
        bgcolor: color,
        transformOrigin: 'bottom center',
        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        opacity: 0.9,
    } as const;

    return (
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
            <Box sx={{ position: 'relative', transform: `translate(-${w / 2}px, -${h / 2}px)` }}>
                {/* Base */}
                <Box sx={{
                    position: 'absolute',
                    width: w, height: w,
                    bgcolor: color,
                    filter: 'brightness(0.5)',
                    transform: `rotateX(90deg) translateZ(-${0}px)`,
                    top: h - w / 2 // Position at bottom of faces
                }} />

                {/* Front Face */}
                <Box sx={{ ...faceStyle, transform: `translateZ(${offset}px) rotateX(30deg)` }} />

                {/* Back Face */}
                <Box sx={{ ...faceStyle, filter: 'brightness(0.7)', transform: `translateZ(-${offset}px) rotateY(180deg) rotateX(30deg)` }} />

                {/* Right Face */}
                <Box sx={{ ...faceStyle, filter: 'brightness(0.8)', transform: `translateX(${offset}px) rotateY(90deg) rotateX(30deg)` }} />

                {/* Left Face */}
                <Box sx={{ ...faceStyle, filter: 'brightness(0.8)', transform: `translateX(-${offset}px) rotateY(-90deg) rotateX(30deg)` }} />
            </Box>
        </Box>
    );
}

function Coin({ color, size }: { color: string, size: number }) {
    const s = size * 0.7;
    const thickness = 10;

    return (
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
            <Box sx={{ position: 'relative', transform: `translateZ(0)` }}>
                {/* Front Face */}
                <Box sx={{
                    position: 'absolute', width: s, height: s,
                    bgcolor: color, borderRadius: '50%',
                    transform: `translate(-50%, -50%) translateZ(${thickness / 2}px)`,
                    border: '4px solid rgba(255,255,255,0.2)', // pattern
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
                }} />

                {/* Back Face */}
                <Box sx={{
                    position: 'absolute', width: s, height: s,
                    bgcolor: color, borderRadius: '50%',
                    transform: `translate(-50%, -50%) translateZ(-${thickness / 2}px) rotateY(180deg)`,
                    filter: 'brightness(0.7)'
                }} />

                {/* Side (Approximated with multiple panels or simple cylinder gradient if possible) */}
                {/* Creating a true cylinder side is heavy on DOM elements. We might skip side or use stripped version.
                    For a simple coin, two faces is often enough if rotating fast. 
                    But let's add a "rim" using a trick: multiple rotated divs? No, too heavy.
                    Let's use a "Side Ring" logic: A div with huge border? No.
                    
                    We will simulate thickness by adding a few cross-sections or just accept 2D floating disk feel 
                    User asked for "3d tokens", so let's try to make it look decent.
                    We can use a strip for the side.
                 */}
                {Array.from({ length: 12 }).map((_, i) => (
                    <Box key={i} sx={{
                        position: 'absolute',
                        width: (s * 3.14) / 12 + 2, // Circumference slice
                        height: thickness,
                        bgcolor: color,
                        filter: 'brightness(0.6)',
                        transform: `translate(-50%, -50%) rotateY(${i * 30}deg) translateZ(${s / 2}px)`,
                        // top: 0, left: 0
                    }} />
                ))}
            </Box>
        </Box>
    );
}
