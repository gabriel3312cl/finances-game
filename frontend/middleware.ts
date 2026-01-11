import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value;
    const { pathname } = request.nextUrl;

    // 1. Protected Routes (Dashboard, Game)
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/game')) {
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // 2. Public Auth Routes (Login, Register) - Redirect to dashboard if already logged in
    if (pathname === '/login' || pathname === '/register' || pathname === '/') {
        if (token) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/login', '/register', '/dashboard/:path*', '/game/:path*'],
};
