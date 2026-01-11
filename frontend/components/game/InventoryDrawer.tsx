'use client';
import React from 'react';
import { boardTiles } from '@/config/boardData'; // Absolute path prefered or relative? using alias

interface InventoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    gameState: any;
    user: any;
    sendMessage: (action: string, payload: any) => void;
}

export default function InventoryDrawer({ isOpen, onClose, gameState, user, sendMessage }: InventoryDrawerProps) {
    if (!user || !gameState) return null;

    // Filter properties owned by this user
    const myProperties = boardTiles.filter(tile => {
        if (!tile.propertyId) return false;
        const owner = gameState.property_ownership?.[tile.propertyId];
        return owner === user.user_id;
    });

    const totalAssetValue = myProperties.reduce((acc, tile) => acc + (tile.price || 0), 0);
    // Note: Balance is available in gameState.players

    const myPlayer = gameState.players?.find((p: any) => p.user_id === user.user_id);
    const balance = myPlayer?.balance || 0;
    const loan = myPlayer?.loan || 0;
    const netWorth = balance + totalAssetValue - loan;

    const [activeTab, setActiveTab] = React.useState<'ASSETS' | 'BANK'>('ASSETS');
    const [loanAmount, setLoanAmount] = React.useState('');

    const handleTransaction = (type: 'TAKE' | 'PAY') => {
        const amount = parseInt(loanAmount);
        if (!amount || amount <= 0) return;
        sendMessage(type === 'TAKE' ? 'TAKE_LOAN' : 'PAY_LOAN', { amount });
        setLoanAmount('');
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150]"
                    onClick={onClose}
                />
            )}

            {/* Drawer */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-[160] transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="p-6 border-b border-gray-700 pb-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white tracking-wide">My Assets</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('ASSETS')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'ASSETS' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            Assets
                        </button>
                        <button
                            onClick={() => setActiveTab('BANK')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'BANK' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            Bank
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* Summary Card */}
                    <div className="bg-checkered bg-gray-700/50 rounded-xl p-4 mb-6 border border-gray-600 relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex justify-between mb-2">
                                <span className="text-gray-400 text-sm">Cash</span>
                                <span className="text-green-400 font-bold">${balance}</span>
                            </div>
                            <div className="flex justify-between mb-2">
                                <span className="text-gray-400 text-sm">Real Estate</span>
                                <span className="text-blue-400 font-bold">${totalAssetValue}</span>
                            </div>
                            <div className="flex justify-between mb-2">
                                <span className="text-gray-400 text-sm">Debt</span>
                                <span className="text-red-400 font-bold">-${loan}</span>
                            </div>
                            <div className="border-t border-gray-600 mt-2 pt-2 flex justify-between">
                                <span className="text-white text-sm font-bold">Net Worth</span>
                                <span className="text-amber-400 font-bold">${netWorth}</span>
                            </div>
                        </div>
                    </div>

                    {activeTab === 'ASSETS' ? (
                        <div className="space-y-4">
                            <h3 className="text-gray-500 text-xs uppercase tracking-wider font-bold mb-2">Deeds ({myProperties.length})</h3>
                            {myProperties.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 italic">
                                    No properties owned yet.
                                </div>
                            ) : (
                                myProperties.map(tile => (
                                    <div key={tile.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex shadow-lg transition-transform hover:scale-[1.02]">
                                        <div className="w-3" style={{ backgroundColor: tile.color || '#666' }}></div>
                                        <div className="p-3 flex-1">
                                            <h4 className="text-white font-bold text-sm leading-tight mb-1">{tile.name}</h4>
                                            <div className="flex justify-between items-end">
                                                <span className="text-gray-500 text-xs">Prop. ID</span>
                                                <span className="text-gray-400 text-xs font-mono">{tile.propertyId}</span>
                                            </div>
                                            <div className="flex justify-between items-end mt-1">
                                                <span className="text-gray-500 text-xs">Value</span>
                                                <span className="text-blue-400 text-xs font-bold">${tile.price}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        // BANK TAB
                        <div className="space-y-6">
                            <div className="text-center p-4 border border-gray-700 rounded-lg bg-gray-800">
                                <p className="text-gray-400 text-sm mb-1">Current Loan</p>
                                <p className="text-3xl font-bold text-red-500">${loan}</p>
                                <p className="text-xs text-gray-500 mt-2">Max allowed: $5,000</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-gray-400 text-xs uppercase font-bold mb-2 block">Amount</label>
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        {[100, 500, 1000].map(amt => (
                                            <button
                                                key={amt}
                                                onClick={() => setLoanAmount(amt.toString())}
                                                className="bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm font-bold border border-gray-600"
                                            >
                                                ${amt}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="number"
                                        value={loanAmount}
                                        onChange={(e) => setLoanAmount(e.target.value)}
                                        placeholder="Custom Amount"
                                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500 mb-4"
                                    />
                                </div>

                                <button
                                    onClick={() => handleTransaction('TAKE')}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg disabled:opacity-50"
                                    disabled={!loanAmount}
                                >
                                    BORROW MONEY
                                </button>
                                <button
                                    onClick={() => handleTransaction('PAY')}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg disabled:opacity-50"
                                    disabled={!loanAmount}
                                >
                                    REPAY LOAN
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}
