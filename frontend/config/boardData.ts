export type TileType = 'PROPERTY' | 'CORNER' | 'CHANCE' | 'COMMUNITY' | 'TAX' | 'UTILITY' | 'RAILROAD' | 'REST' | 'JAIL_VISIT' | 'GO_TO_JAIL' | 'FREE_PARKING';

export interface TileData {
    id: number;
    name: string;
    type: TileType;
    price?: number;
    color?: string; // CSS color or Tailwind class
    groupId?: string; // 1.1, 1.2, etc. (Deprecated in UI, use groupName)
    groupName?: string; // e.g., "Cerro Navia"
    buildingCount?: number;
    // Extended Rent Info
    rent_base?: number;
    rent_color_group?: number;
    rent_1_house?: number;
    rent_2_house?: number;
    rent_3_house?: number;
    rent_4_house?: number;
    rent_hotel?: number;
    house_cost?: number;
    hotel_cost?: number;
    mortgage_value?: number;
    rent?: number;
    propertyId?: string; // Backend ID (e.g. 1.1.1)
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

// Hardcoded boardTiles removed favor of API data.

// Color Map by Group ID for Dynamic Loading

