'use client';
import { useEffect, useState } from 'react'; // Added useState import
import { useRouter } from 'next/navigation';
import { fetchWithAuth, removeToken } from '@/lib/auth';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ user_id: string } | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetchWithAuth('/me');
                if (res.ok) {
                    const data = await res.json();
                    setUser(data);
                }
            } catch (error) {
                console.error("Auth check failed", error);
            }
        };
        checkAuth();
    }, []); // Corrected dependency array

    const handleLogout = () => {
        removeToken();
        router.push('/login');
    };

    const handleDeleteAccount = async () => {
        if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

        try {
            const res = await fetchWithAuth('/delete-account', { method: 'DELETE' });
            if (res.ok) {
                removeToken();
                router.push('/');
            }
        } catch (e) {
            alert('Failed to delete account');
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans">
            <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center">
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500">
                                Finances Game
                            </span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-400">Logged in as {user?.user_id}</span>
                            <button
                                onClick={handleLogout}
                                className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Create Session Card */}
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-amber-500/50 transition-colors group cursor-pointer relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h3 className="text-2xl font-bold text-amber-400 mb-2">Create New Session</h3>
                        <p className="text-gray-400 mb-6">Host a new game and become the tycoon.</p>
                        <button className="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-semibold shadow-lg shadow-amber-500/20 transition-all">
                            Create Game
                        </button>
                    </div>

                    {/* Join Session Card */}
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-blue-500/50 transition-colors group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h3 className="text-2xl font-bold text-blue-400 mb-2">Join Session</h3>
                        <p className="text-gray-400 mb-6">Enter a code to join an existing lobby.</p>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="CODE"
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 text-white focus:ring-2 focus:ring-blue-500 outline-none uppercase tracking-widest"
                            />
                            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold shadow-lg shadow-blue-500/20 transition-all">
                                Join
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Games Section */}
                <div className="mt-12">
                    <h2 className="text-xl font-semibold text-gray-200 mb-6">Your Active Games</h2>
                    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
                        You don't have any active games yet.
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-20 border-t border-gray-800 pt-8 flex justify-center">
                    <button
                        onClick={handleDeleteAccount}
                        className="text-red-500 hover:text-red-400 text-sm font-medium transition-colors"
                    >
                        Delete Account
                    </button>
                </div>
            </main>
        </div>
    );
}
