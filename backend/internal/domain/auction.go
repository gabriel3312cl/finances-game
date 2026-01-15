package domain

import "time"

// AuctionState represents an active auction in the game
type AuctionState struct {
	PropertyID    string          `json:"property_id"`
	HighestBid    int             `json:"highest_bid"`
	BidderID      string          `json:"bidder_id"`     // UserID of highest bidder
	BidderName    string          `json:"bidder_name"`   // Name of highest bidder
	EndTime       time.Time       `json:"end_time"`      // When the auction ends
	LastBidTime   int64           `json:"last_bid_time"` // Timestamp of the last bid (Unix seconds)
	IsActive      bool            `json:"is_active"`
	PassedPlayers map[string]bool `json:"passed_players"` // Set of UserIDs who passed
}
