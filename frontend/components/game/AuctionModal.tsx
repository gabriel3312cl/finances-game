'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useGame } from '@/context/GameContext';

interface AuctionModalProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function AuctionModal({ gameState, user, sendMessage }: AuctionModalProps) {
    const auction = gameState?.active_auction;
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [customBid, setCustomBid] = useState<string>('');

    // Timer Logic
    useEffect(() => {
        if (!auction || !auction.is_active) return;

        const interval = setInterval(() => {
            const end = new Date(auction.end_time).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setTimeLeft(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [auction]);

    if (!auction || !auction.is_active) return null;

    const currentBid = auction.highest_bid || 0;
    const minBid = currentBid + 1;

    const handleBid = (amount: number) => {
        sendMessage('BID', { amount });
        setCustomBid('');
    };

    const isWinning = auction.bidder_id === user?.user_id;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-amber-500/50 p-8 rounded-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
                {/* Glow Effect */}
                <div className={`absolute top-0 left-0 w-full h-2 ${isWinning ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]'}`} />

                <h2 className="text-3xl font-bold text-white mb-2 text-center uppercase tracking-widest">Auction</h2>
                <div className="text-center mb-6">
                    <p className="text-gray-400 text-sm">Property</p>
                    <p className="text-xl text-amber-400 font-bold">{auction.property_id}</p> {/* TODO: Use Name map */}
                </div>

                {/* Timer */}
                <div className="flex justify-center mb-8">
                    <div className={`text-5xl font-mono font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        00:{timeLeft.toString().padStart(2, '0')}
                    </div>
                </div>

                {/* Status */}
                <div className="bg-gray-700/50 rounded-lg p-4 mb-6 border border-gray-600">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-gray-400 text-sm">Highest Bid</span>
                        <span className="text-3xl font-bold text-green-400">${currentBid}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Bidder</span>
                        <span className={`${isWinning ? 'text-green-400 font-bold' : 'text-white'}`}>
                            {auction.bidder_name || 'No bids yet'}
                        </span>
                    </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                        onClick={() => handleBid(currentBid + 10)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg border border-gray-600 transition-all hover:scale-105"
                    >
                        + $10
                    </button>
                    <button
                        onClick={() => handleBid(currentBid + 50)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg border border-gray-600 transition-all hover:scale-105"
                    >
                        + $50
                    </button>
                    <button
                        onClick={() => handleBid(currentBid + 100)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg border border-gray-600 transition-all hover:scale-105"
                    >
                        + $100
                    </button>
                    <div className="relative">
                        <input
                            type="number"
                            value={customBid}
                            onChange={(e) => setCustomBid(e.target.value)}
                            placeholder="Custom"
                            className="w-full h-full bg-gray-900 border border-gray-600 rounded-lg px-3 text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                        />
                        <button
                            onClick={() => {
                                const val = parseInt(customBid);
                                if (val > currentBid) handleBid(val);
                            }}
                            className="absolute right-1 top-1 bottom-1 px-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded flex items-center justify-center"
                        >
                            BID
                        </button>
                    </div>
                </div>

                {isWinning && (
                    <div className="text-center text-green-400 text-sm font-bold animate-pulse">
                        You are winning this auction!
                    </div>
                )}
            </div>
        </div>
    );
}
