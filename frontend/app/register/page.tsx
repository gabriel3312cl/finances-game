'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/auth';
import Link from 'next/link';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [specialCode, setSpecialCode] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, special_code: specialCode }),
            });

            if (!res.ok) {
                throw new Error(await res.text() || 'Registration failed');
            }

            // Automatically redirect to login, or maybe auto-login in future
            router.push('/login');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black text-white">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700 shadow-2xl">
                <div className="text-center">
                    <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        Join the Elite
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">Enter your access code to begin</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleRegister}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="username" className="sr-only">Username</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-500 text-gray-100 rounded-lg bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm transition-all"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-500 text-gray-100 rounded-lg bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm transition-all"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="specialCode" className="sr-only">Access Code</label>
                            <input
                                id="specialCode"
                                name="specialCode"
                                type="text"
                                required
                                className="appearance-none relative block w-full px-3 py-3 border border-yellow-600/50 placeholder-yellow-600/70 text-yellow-100 rounded-lg bg-yellow-900/10 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 focus:z-10 sm:text-sm transition-all text-center tracking-widest uppercase font-mono"
                                placeholder="ACCESS CODE"
                                value={specialCode}
                                onChange={(e) => setSpecialCode(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-400 text-sm text-center">{error}</div>}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transform hover:scale-[1.02] transition-all duration-200 shadow-lg shadow-purple-500/20"
                        >
                            Create Account
                        </button>
                    </div>
                </form>

                <div className="text-center text-sm">
                    <span className="text-gray-400">Already have an account? </span>
                    <Link href="/login" className="font-medium text-purple-400 hover:text-purple-300 transition-colors">
                        Sign in here
                    </Link>
                </div>
            </div>
        </div>
    );
}
