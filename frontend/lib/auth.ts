export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface User {
    id: string;
    username: string;
    created_at: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export const setToken = (token: string) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token);
        document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Strict`;
    }
};

export const getToken = (): string | null => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('auth_token');
    }
    return null;
};

export const removeToken = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        document.cookie = 'auth_token=; path=/; max-age=0';
    }
};

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        removeToken();
        window.location.href = '/login';
    }

    return response;
};
