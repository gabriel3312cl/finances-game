export type TileType = 'PROPERTY' | 'CORNER' | 'CHANCE' | 'COMMUNITY' | 'TAX' | 'UTILITY' | 'RAILROAD' | 'REST' | 'JAIL_VISIT' | 'GO_TO_JAIL' | 'FREE_PARKING';

export interface TileData {
    id: number;
    name: string;
    type: TileType;
    price?: number;
    color?: string; // CSS color or Tailwind class
    groupId?: string; // 1.1, 1.2, etc.
    rent?: number;
}

// Helper to determine grid position for 17x17 loop
// Total 64 tiles.
// 0 (Start) bottom-right.
// 1-16 bottom row (right to left).
// 17 (Jail) bottom-left.
// 18-32 left col (bottom to top).
// 33 (Free Parking) top-left.
// 34-49 top row (left to right).
// 50 (Go to Jail) top-right.
// 51-63 right col (top to bottom).
export const getGridPosition = (index: number) => {
    // We want a 17x17 grid.
    // Rows 1-17, Cols 1-17.

    // Side 1: Bottom (Index 0-16). Row 17. Col 17 -> 1.
    if (index >= 0 && index <= 16) {
        return { row: 17, col: 17 - index };
    }

    // Side 2: Left (Index 16-32). Col 1. Row 17 -> 1.
    // Note: Index 16 is corner (Bottom-Left). 17-index?
    // Let's refine.
    // 0 = 17, 17 (Bottom-Right Corner)
    // 1..15 = Bottom Edge
    // 16 = 17, 1 (Bottom-Left Corner)
    if (index > 0 && index < 16) {
        return { row: 17, col: 17 - index };
    }
    if (index === 16) return { row: 17, col: 1 };

    // Side 2: Left Edge (17..31) -> Col 1, Row 16..2
    if (index > 16 && index < 32) {
        return { row: 17 - (index - 16), col: 1 };
    }

    // Top-Left Corner (32) -> Row 1, Col 1
    if (index === 32) return { row: 1, col: 1 };

    // Side 3: Top Edge (33..47) -> Row 1, Col 2..16
    if (index > 32 && index < 48) {
        return { row: 1, col: 1 + (index - 32) };
    }

    // Top-Right Corner (48) -> Row 1, Col 17
    if (index === 48) return { row: 1, col: 17 };

    // Side 4: Right Edge (49..63) -> Col 17, Row 2..16
    if (index > 48 && index < 64) {
        return { row: 1 + (index - 48), col: 17 };
    }

    return { row: 1, col: 1 }; // Fallback
};

export const boardTiles: TileData[] = [
    { id: 0, name: 'Salida', type: 'CORNER' },
    { id: 1, name: 'Av. La Estrella', type: 'PROPERTY', price: 60, color: '#3b82f6', groupId: '1.1' }, // Blue (Cerro Navia)
    { id: 2, name: 'Arca Comunal', type: 'COMMUNITY' },
    { id: 3, name: 'Av. José Joaquín Pérez', type: 'PROPERTY', price: 60, color: '#3b82f6', groupId: '1.1' },
    { id: 4, name: 'Av. Mapocho', type: 'PROPERTY', price: 80, color: '#3b82f6', groupId: '1.1' },
    { id: 5, name: 'Impuesto sobre ingresos', type: 'TAX', price: 200 },
    { id: 6, name: 'Av. Pajaritos', type: 'PROPERTY', price: 80, color: '#ffffff', groupId: '1.2' }, // White (Maipu)
    { id: 7, name: 'Costanera Center', type: 'UTILITY', price: 180 }, // Attraction
    { id: 8, name: 'Aeropuerto AMB', type: 'RAILROAD', price: 200 },
    { id: 9, name: 'Camino a Rinconada', type: 'PROPERTY', price: 80, color: '#ffffff', groupId: '1.2' },
    { id: 10, name: 'Camino a Melipilla', type: 'PROPERTY', price: 100, color: '#ffffff', groupId: '1.2' },
    { id: 11, name: 'Parque Metropolitano', type: 'UTILITY', price: 150 }, // Park
    { id: 12, name: 'Av. La Florida', type: 'PROPERTY', price: 100, color: '#ef4444', groupId: '1.3' }, // Red (Florida)
    { id: 13, name: 'Fortuna', type: 'CHANCE' },
    { id: 14, name: 'Av. Walker Martínez', type: 'PROPERTY', price: 100, color: '#ef4444', groupId: '1.3' },
    { id: 15, name: 'Av. Trinidad', type: 'PROPERTY', price: 120, color: '#ef4444', groupId: '1.3' },

    { id: 16, name: 'Cárcel / Visita', type: 'JAIL_VISIT' }, // Corner

    { id: 17, name: 'Av. Concha y Toro', type: 'PROPERTY', price: 140, color: '#f97316', groupId: '1.4' }, // Orange
    { id: 18, name: 'Enel', type: 'UTILITY', price: 150 },
    { id: 19, name: 'Av. Camilo Henríquez', type: 'PROPERTY', price: 140, color: '#f97316', groupId: '1.4' },
    { id: 20, name: 'Av. Santa Rosa', type: 'PROPERTY', price: 160, color: '#f97316', groupId: '1.4' },
    { id: 21, name: 'Movistar Arena', type: 'UTILITY', price: 180 },
    { id: 22, name: 'Av. Macul', type: 'PROPERTY', price: 140, color: '#06b6d4', groupId: '1.5' }, // Light Blue
    { id: 23, name: 'Av. J.P. Alessandri', type: 'PROPERTY', price: 140, color: '#06b6d4', groupId: '1.5' },
    { id: 24, name: 'Terminal Alameda', type: 'RAILROAD', price: 200 },
    { id: 25, name: 'Cerro Santa Lucía', type: 'UTILITY', price: 150 },
    { id: 26, name: 'Av. Quilín', type: 'PROPERTY', price: 160, color: '#06b6d4', groupId: '1.5' },
    { id: 27, name: 'Arca Comunal', type: 'COMMUNITY' },
    { id: 28, name: 'Av. Grecia', type: 'PROPERTY', price: 180, color: '#a855f7', groupId: '1.6' }, // Purple
    { id: 29, name: 'Av. Tobalaba', type: 'PROPERTY', price: 180, color: '#a855f7', groupId: '1.6' },
    { id: 30, name: 'Aguas Andinas', type: 'UTILITY', price: 150 },
    { id: 31, name: 'Av. Oriental', type: 'PROPERTY', price: 200, color: '#a855f7', groupId: '1.6' },

    { id: 32, name: 'Parada Libre', type: 'FREE_PARKING' }, // Corner

    { id: 33, name: 'Av. Irarrázaval', type: 'PROPERTY', price: 220, color: '#eab308', groupId: '1.7' }, // Yellow
    { id: 34, name: 'WOM', type: 'UTILITY', price: 150 },
    { id: 35, name: 'Fortuna', type: 'CHANCE' },
    { id: 36, name: 'Av. Simón Bolívar', type: 'PROPERTY', price: 220, color: '#eab308', groupId: '1.7' },
    { id: 37, name: 'Av. Pedro de Valdivia', type: 'PROPERTY', price: 240, color: '#eab308', groupId: '1.7' },
    { id: 38, name: 'Estadio Nacional', type: 'UTILITY', price: 180 },
    { id: 39, name: 'Av. José Arrieta', type: 'PROPERTY', price: 260, color: '#22c55e', groupId: '1.8' }, // Green
    { id: 40, name: 'Terminal Los Héroes', type: 'RAILROAD', price: 200 },
    { id: 41, name: 'Av. Ossa', type: 'PROPERTY', price: 260, color: '#22c55e', groupId: '1.8' },
    { id: 42, name: 'Av. Príncipe de Gales', type: 'PROPERTY', price: 280, color: '#22c55e', groupId: '1.8' },
    { id: 43, name: 'Parque Forestal', type: 'UTILITY', price: 150 },
    { id: 44, name: 'Av. Eliodoro Yáñez', type: 'PROPERTY', price: 300, color: '#94a3b8', groupId: '1.9' }, // Silver/Grey
    { id: 45, name: 'Av. Salvador', type: 'PROPERTY', price: 300, color: '#94a3b8', groupId: '1.9' },
    { id: 46, name: 'Gasco', type: 'UTILITY', price: 150 },
    { id: 47, name: 'Av. Manuel Montt', type: 'PROPERTY', price: 320, color: '#94a3b8', groupId: '1.9' },

    { id: 48, name: 'Ve a la Cárcel', type: 'GO_TO_JAIL' }, // Corner

    { id: 49, name: 'Av. Apoquindo', type: 'PROPERTY', price: 300, color: '#4b5563', groupId: '1.10' }, // Grey/Dark
    { id: 50, name: 'Av. Kennedy', type: 'PROPERTY', price: 300, color: '#4b5563', groupId: '1.10' },
    { id: 51, name: 'Metro de Santiago', type: 'UTILITY', price: 150 },
    { id: 52, name: 'Arca Comunal', type: 'COMMUNITY' },
    { id: 53, name: 'Av. Tomás Moro', type: 'PROPERTY', price: 320, color: '#4b5563', groupId: '1.10' },
    { id: 54, name: 'Parque Arauco', type: 'UTILITY', price: 180 },
    { id: 55, name: 'Av. Andrés Bello', type: 'PROPERTY', price: 300, color: '#78350f', groupId: '1.11' }, // Brown
    { id: 56, name: 'Estación Central', type: 'RAILROAD', price: 200 },
    { id: 57, name: 'Transantiago', type: 'UTILITY', price: 150 },
    { id: 58, name: 'Av. Tabancura', type: 'PROPERTY', price: 300, color: '#78350f', groupId: '1.11' },
    { id: 59, name: 'Av. Manquehue', type: 'PROPERTY', price: 320, color: '#78350f', groupId: '1.11' },
    { id: 60, name: 'Fortuna', type: 'CHANCE' },
    { id: 61, name: 'Av. Los Trapenses', type: 'PROPERTY', price: 400, color: '#000000', groupId: '1.12' }, // Black
    { id: 62, name: 'Impuesto de lujo', type: 'TAX', price: 100 },
    { id: 63, name: 'Av. El Rodeo', type: 'PROPERTY', price: 400, color: '#000000', groupId: '1.12' },
];
