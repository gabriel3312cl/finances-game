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

export default theme;
