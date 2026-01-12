import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameStore } from '../store/gameStore';
import { API_URL } from '@/lib/auth';

// Fetch Board Layout
export const useBoardConfig = () => {
    const setBoardConfig = useGameStore((state) => state.setBoardConfig);

    return useQuery({
        queryKey: ['boardConfig'],
        queryFn: async () => {
            const response = await fetch(`${API_URL}/games/board`);
            if (!response.ok) {
                throw new Error('Failed to fetch board config');
            }
            const data = await response.json();
            setBoardConfig(data); // Sync with store
            return data;
        },
        staleTime: Infinity, // Static data mostly
    });
};

// Example for joining game (future use)
export const useJoinGame = () => {
    return useMutation({
        mutationFn: async ({ code, userId }: { code: string; userId: string }) => {
            const response = await fetch(`${API_URL}/games/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!response.ok) throw new Error('Failed to join game');
            return response.json();
        },
    });
};
