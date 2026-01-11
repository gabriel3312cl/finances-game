'use client';
import React, { useState, useEffect } from 'react';
import { boardTiles } from '@/config/boardData';

interface TradeModalProps {
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function TradeModal({ gameState, user, sendMessage }: TradeModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [targetId, setTargetId] = useState('');
    const [offerProperties, setOfferProperties] = useState<string[]>([]);
    const [requestProperties, setRequestProperties] = useState<string[]>([]);
    const [offerCash, setOfferCash] = useState('');
    const [requestCash, setRequestCash] = useState('');

    const activeTrade = gameState?.active_trade;
    const isIncomingTrade = activeTrade && activeTrade.target_id === user.user_id;

    // Filter properties owned by user and potential targets
    const myProperties = boardTiles.filter(t => t.propertyId && gameState?.property_ownership?.[t.propertyId] === user.user_id);

    // Get list of other players
    const otherPlayers = gameState.players?.filter((p: any) => p.user_id !== user.user_id) || [];

    const handleSendTrade = () => {
        if (!targetId) return;
        sendMessage('INITIATE_TRADE', {
            target_id: targetId,
            offer_properties: offerProperties,
            offer_cash: parseInt(offerCash) || 0,
            request_properties: requestProperties,
            request_cash: parseInt(requestCash) || 0
        });
        setIsOpen(false);
    };

    const handleAccept = () => sendMessage('ACCEPT_TRADE', {});
    const handleReject = () => sendMessage('REJECT_TRADE', {});

    // Incoming Trade UI
    if (isIncomingTrade) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-gray-800 border border-amber-500/50 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-600 to-amber-800 p-4 border-b border-amber-500/30">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">🤝</span> Trade Offer!
                        </h2>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="text-center text-gray-300">
                            <span className="text-white font-bold text-lg">{activeTrade.offerer_name}</span> wants to trade with you.
                        </div>

                        <div className="flex gap-4">
                            {/* Gets */}
                            <div className="flex-1 bg-green-900/20 p-3 rounded-lg border border-green-500/30">
                                <h3 className="text-green-400 text-xs font-bold uppercase mb-2">You Get</h3>
                                <ul className="text-sm text-gray-300 space-y-1">
                                    {activeTrade.offer_cash > 0 && (
                                        <li className="font-bold text-white">+ ${activeTrade.offer_cash}</li>
                                    )}
                                    {activeTrade.offer_properties?.map((id: string) => {
                                        const tile = boardTiles.find(t => t.propertyId === id);
                                        return <li key={id}>{tile?.name || id}</li>;
                                    })}
                                    {(!activeTrade.offer_properties?.length && !activeTrade.offer_cash) && <li className="italic opacity-50">Nothing</li>}
                                </ul>
                            </div>

                            {/* Gives */}
                            <div className="flex-1 bg-red-900/20 p-3 rounded-lg border border-red-500/30">
                                <h3 className="text-red-400 text-xs font-bold uppercase mb-2">You Give</h3>
                                <ul className="text-sm text-gray-300 space-y-1">
                                    {activeTrade.request_cash > 0 && (
                                        <li className="font-bold text-white">- ${activeTrade.request_cash}</li>
                                    )}
                                    {activeTrade.request_properties?.map((id: string) => {
                                        const tile = boardTiles.find(t => t.propertyId === id);
                                        return <li key={id}>{tile?.name || id}</li>;
                                    })}
                                    {(!activeTrade.request_properties?.length && !activeTrade.request_cash) && <li className="italic opacity-50">Nothing</li>}
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={handleAccept} className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold text-white shadow-lg">
                                ACCEPT DEAL
                            </button>
                            <button onClick={handleReject} className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-lg font-bold text-white shadow-lg">
                                DECLINE
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Trade Creation Modal
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-6 z-[60] bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-xl border border-gray-600 transition-all hover:scale-110 group"
                title="Trade"
            >
                <span className="text-xl">🤝</span>
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Propose Trade</h2>
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Target Selection */}
                    <div>
                        <label className="block text-gray-400 text-sm mb-2">Trade With:</label>
                        <select
                            className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700 focus:border-amber-500 outline-none"
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                        >
                            <option value="">Select Player...</option>
                            {otherPlayers.map((p: any) => (
                                <option key={p.user_id} value={p.user_id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {targetId && (
                        <div className="grid grid-cols-2 gap-6">
                            {/* You Offer */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-green-400 border-b border-gray-700 pb-2">You Offer</h3>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Cash</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                                        placeholder="$0"
                                        value={offerCash}
                                        onChange={(e) => setOfferCash(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Properties</label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                                        {myProperties.map(tile => (
                                            <label key={tile.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={offerProperties.includes(tile.propertyId!)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setOfferProperties([...offerProperties, tile.propertyId!]);
                                                        else setOfferProperties(offerProperties.filter(id => id !== tile.propertyId));
                                                    }}
                                                    className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                                                />
                                                <span className="text-sm text-gray-300">{tile.name}</span>
                                            </label>
                                        ))}
                                        {myProperties.length === 0 && <p className="text-gray-600 text-xs italic">No properties owned</p>}
                                    </div>
                                </div>
                            </div>

                            {/* You Request */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-red-400 border-b border-gray-700 pb-2">You Request</h3>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Cash</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                                        placeholder="$0"
                                        value={requestCash}
                                        onChange={(e) => setRequestCash(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Properties</label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                                        {boardTiles.filter(t => t.propertyId && gameState.property_ownership?.[t.propertyId] === targetId).map(tile => (
                                            <label key={tile.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={requestProperties.includes(tile.propertyId!)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setRequestProperties([...requestProperties, tile.propertyId!]);
                                                        else setRequestProperties(requestProperties.filter(id => id !== tile.propertyId));
                                                    }}
                                                    className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                                                />
                                                <span className="text-sm text-gray-300">{tile.name}</span>
                                            </label>
                                        ))}
                                        {boardTiles.filter(t => t.propertyId && gameState.property_ownership?.[t.propertyId] === targetId).length === 0 &&
                                            <p className="text-gray-600 text-xs italic">They have no properties</p>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-800 flex justify-end">
                    <button
                        onClick={handleSendTrade}
                        disabled={!targetId}
                        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-transform active:scale-95"
                    >
                        Send Offer
                    </button>
                </div>
            </div>
        </div>
    );
}
