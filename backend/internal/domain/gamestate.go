package domain

type GameState struct {
	GameID            string            `json:"game_id"`
	Players           []*PlayerState    `json:"players"`
	Board             []Tile            `json:"board"`
	CurrentTurnID     string            `json:"current_turn_id"` // UserID
	Status            string            `json:"status"`          // WAITING, ROLLING_ORDER, ACTIVE, FINISHED
	Dice              [2]int            `json:"dice"`
	LastAction        string            `json:"last_action"` // Log description
	ActiveAuction     *AuctionState     `json:"active_auction,omitempty"`
	ActiveTrade       *TradeOffer       `json:"active_trade,omitempty"`
	PropertyOwnership map[string]string `json:"property_ownership"` // PropertyID -> OwnerUserID
	TileVisits        map[int]int       `json:"tile_visits"`        // TileIndex -> VisitCount
	Logs              []EventLog        `json:"logs"`
	TurnOrder         []string          `json:"turn_order"` // UserIDs in order
	DrawnCard         *Card             `json:"drawn_card,omitempty"`
}

type Card struct {
	ID          int    `json:"id"`
	Type        string `json:"type"` // CHANCE, COMMUNITY
	Title       string `json:"title"`
	Description string `json:"description"`
	Effect      string `json:"effect"` // e.g. "move:10", "pay:50", "collect:200"
}

type EventLog struct {
	Timestamp int64  `json:"timestamp"`
	Message   string `json:"message"`
	Type      string `json:"type"` // INFO, ACTION, ALERT, DICE
}

const (
	GameStatusWaiting      = "WAITING"
	GameStatusRollingOrder = "ROLLING_ORDER"
	GameStatusActive       = "ACTIVE"
	GameStatusFinished     = "FINISHED"
)

type TradeOffer struct {
	ID                string   `json:"id"`
	OffererID         string   `json:"offerer_id"`
	OffererName       string   `json:"offerer_name"`
	TargetID          string   `json:"target_id"`
	TargetName        string   `json:"target_name"`
	OfferPropeties    []string `json:"offer_properties"`
	OfferCash         int      `json:"offer_cash"`
	RequestProperties []string `json:"request_properties"`
	RequestCash       int      `json:"request_cash"`
	Status            string   `json:"status"` // PENDING, ACCEPTED, REJECTED
}

type PlayerState struct {
	UserID     string `json:"user_id"`
	Name       string `json:"name"`
	TokenColor string `json:"token_color"`
	Balance    int    `json:"balance"`
	Position   int    `json:"position"` // 0-63 (assuming 17x17 board loop)
	InJail     bool   `json:"in_jail"`
	IsActive   bool   `json:"is_active"`
	Loan       int    `json:"loan"`
}

type Tile struct {
	ID              int     `json:"id"`
	Type            string  `json:"type"` // PROPERTY, CHANCE, TAX, CORNER, UTILITY, RAILROAD
	Name            string  `json:"name"`
	RentRule        string  `json:"rent_rule"`
	PropertyID      string  `json:"property_id,omitempty"` // UUID
	OwnerID         *string `json:"owner_id,omitempty"`
	Price           int     `json:"price,omitempty"`
	Rent            int     `json:"rent,omitempty"`
	RentBase        int     `json:"rent_base,omitempty"`
	RentColorGroup  int     `json:"rent_color_group,omitempty"`
	Rent1House      int     `json:"rent_1_house,omitempty"`
	Rent2House      int     `json:"rent_2_house,omitempty"`
	Rent3House      int     `json:"rent_3_house,omitempty"`
	Rent4House      int     `json:"rent_4_house,omitempty"`
	RentHotel       int     `json:"rent_hotel,omitempty"`
	HouseCost       int     `json:"house_cost,omitempty"`
	HotelCost       int     `json:"hotel_cost,omitempty"`
	MortgageValue   int     `json:"mortgage_value,omitempty"`
	UnmortgageValue int     `json:"unmortgage_value,omitempty"`
	GroupIdentifier string  `json:"group_identifier,omitempty"` // Color or Group ID
	GroupName       string  `json:"group_name,omitempty"`
	GroupColor      string  `json:"group_color,omitempty"`
	BuildingCount   int     `json:"building_count"` // 0-4 houses, 5 = hotel
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
