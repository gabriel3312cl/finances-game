package domain

type GameState struct {
	GameID        string         `json:"game_id"`
	Players       []*PlayerState `json:"players"`
	Board         []Tile         `json:"board"`
	CurrentTurnID string         `json:"current_turn_id"` // UserID
	Status        string         `json:"status"`          // WAITING, PLAYING, ENDED
	Dice          [2]int         `json:"dice"`
	LastAction    string         `json:"last_action"` // Log description
}

type PlayerState struct {
	UserID     string `json:"user_id"`
	Name       string `json:"name"`
	TokenColor string `json:"token_color"`
	Balance    int    `json:"balance"`
	Position   int    `json:"position"` // 0-63 (assuming 17x17 board loop)
	InJail     bool   `json:"in_jail"`
	IsActive   bool   `json:"is_active"`
}

type Tile struct {
	ID              int     `json:"id"`
	Type            string  `json:"type"` // PROPERTY, CHANCE, TAX, CORNER, UTILITY, RAILROAD
	Name            string  `json:"name"`
	OwnerID         *string `json:"owner_id,omitempty"`
	Price           int     `json:"price,omitempty"`
	Rent            int     `json:"rent,omitempty"`
	GroupIdentifier string  `json:"group_identifier,omitempty"` // Color or Group ID
	BuildingCount   int     `json:"building_count"`             // 0-4 houses, 5 = hotel
	IsMortgaged     bool    `json:"is_mortgaged"`
}

// Initial board size for 17x17 square loop
// 4 sides * 16 spaces + 4 corners? No.
// If side length is 17 tiles.
// Top: 17
// Right: 17
// Bottom: 17
// Left: 17
// Total tiles = 17 + 15 + 17 + 15 = 64 tiles.
const BoardSize = 64
