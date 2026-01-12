'use client';
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#fbbf24', // amber-400 equivalent for "Monopoly" gold
        },
        secondary: {
            main: '#3b82f6', // blue-500
        },
        background: {
            default: '#111827', // gray-900
            paper: '#1f2937', // gray-800
        },
    },
    typography: {
        fontFamily: 'Inter, sans-serif',
    },
});

// Utility to calculate contrast color (black or white)
export function getContrastColor(hexColor: string) {
    // Default to white if invalid
    if (!hexColor || hexColor.charAt(0) !== '#') return '#ffffff';

    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

export default theme;
