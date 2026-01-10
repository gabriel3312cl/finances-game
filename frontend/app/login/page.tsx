'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL, setToken } from '@/lib/auth';
import Link from 'next/link';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!res.ok) {
                throw new Error(await res.text() || 'Login failed');
            }

            const data = await res.json();
            setToken(data.token);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black text-white">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700 shadow-2xl">
                <div className="text-center">
                    <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                        Welcome Back
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">Sign in to resume your empire</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="username" className="sr-only">Username</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-500 text-gray-100 rounded-lg bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm transition-all"
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
                                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-500 text-gray-100 rounded-lg bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm transition-all"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-400 text-sm text-center">{error}</div>}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transform hover:scale-[1.02] transition-all duration-200 shadow-lg shadow-emerald-500/20"
                        >
                            Sign in
                        </button>
                    </div>
                </form>

                <div className="text-center text-sm">
                    <span className="text-gray-400">Don't have an account? </span>
                    <Link href="/register" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                        Register here
                    </Link>
                </div>
            </div>
        </div>
    );
}
