package service

import (
	"testing"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
)

// Wrapper to test internal calculateRent logic if possible,
// or we can test public GameService methods.
// Since calculateRent is private, we can't test it directly from outside package unless we are inside package service.
// This file is package service, so we can access it.

func TestCalculateRent_DiceMultiplier(t *testing.T) {
	// Setup Mock Game State
	game := &domain.GameState{
		Board:             make([]domain.Tile, 40),
		PropertyOwnership: make(map[string]string),
	}

	ownerID := "player1"

	// Define DICE_MULTIPLIER properties
	props := []string{"DM1", "DM2", "DM3", "DM4", "DM5", "DM6"}
	for i, pid := range props {
		game.Board[i] = domain.Tile{
			PropertyID: pid,
			Type:       "DICE_MULTIPLIER",
		}
	}

	// Service instance (dummy)
	s := &GameService{}

	// Helper to set ownership
	setOwnership := func(count int) {
		game.PropertyOwnership = make(map[string]string)
		for i := 0; i < count; i++ {
			game.PropertyOwnership[props[i]] = ownerID
		}
	}

	tests := []struct {
		owned int
		dice  int
		want  int
	}{
		{1, 7, 28},   // 7 * 4
		{2, 7, 70},   // 7 * 10
		{3, 5, 100},  // 5 * 20
		{4, 10, 400}, // 10 * 40
		{5, 2, 80},   // >4 default to 40x -> 2 * 40 = 80
		{0, 7, 0},    // Not owned (logic handles owned check, but calculateRent assumes owned, caller checks)
	}

	for _, tt := range tests {
		setOwnership(tt.owned)
		// We are testing the logic for the *first* property if owned
		// But calculateRent checks ownership.
		// If owned is 0, we can't really call it the same way as the loop in the function
		// implies `calculateRent` is called when `owner != nil`.
		// But let's see.
		// calculateRent signature: func (s *GameService) calculateRent(game *domain.GameState, tile *domain.Tile, diceRoll int) int
		// It checks: if !owned { return 0 }

		targetTile := &game.Board[0] // DM1

		// If we want to test "not owned", we shouldn't set ownership for DM1.
		if tt.owned == 0 {
			// Ensure map is empty for DM1
			delete(game.PropertyOwnership, "DM1")
		} else {
			// Ensure it is set
			game.PropertyOwnership["DM1"] = ownerID
		}

		got := s.calculateRent(game, targetTile, tt.dice)
		if got != tt.want {
			t.Errorf("calculateRent(owned=%d, dice=%d) = %d; want %d", tt.owned, tt.dice, got, tt.want)
		}
	}
}
