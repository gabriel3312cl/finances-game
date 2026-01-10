import React from 'react';

interface PlayerTokenProps {
    color: string;
    name: string;
    isCurrentTurn: boolean;
}

export default function PlayerToken({ color, name, isCurrentTurn }: PlayerTokenProps) {
    // Simple colored circle with initial or icon
    // color can be hex, or we map "RED" -> bg-red-500

    const getColorClass = (c: string) => {
        switch (c) {
            case 'RED': return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]';
            case 'BLUE': return 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]';
            case 'GREEN': return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]';
            case 'YELLOW': return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]';
            default: return 'bg-purple-500';
        }
    };

    return (
        <div
            className={`relative w-6 h-6 rounded-full border-2 border-white flex items-center justify-center -ml-2 select-none transition-all duration-300 transform ${getColorClass(color)} ${isCurrentTurn ? 'scale-125 z-50 animate-pulse ring-2 ring-white' : 'z-20 hover:scale-110'}`}
            title={name}
        >
            <span className="text-[0.6rem] font-bold text-white uppercase">{name.substring(0, 2)}</span>
        </div>
    );
}
