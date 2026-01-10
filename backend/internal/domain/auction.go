package domain

import "time"

// AuctionState represents an active auction in the game
type AuctionState struct {
	PropertyID string    `json:"property_id"`
	HighestBid int       `json:"highest_bid"`
	BidderID   string    `json:"bidder_id"`   // UserID of highest bidder
	BidderName string    `json:"bidder_name"` // Name of highest bidder
	EndTime    time.Time `json:"end_time"`    // When the auction ends
	IsActive   bool      `json:"is_active"`
}
