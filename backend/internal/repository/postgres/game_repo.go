package postgres

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
)

type GameRepository struct {
	db *sql.DB
}

func NewGameRepository(db *sql.DB) *GameRepository {
	repo := &GameRepository{db: db}
	return repo
}

func (r *GameRepository) Save(game *domain.GameState) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Save Game State (JSON Snapshot for legacy/backup)
	stateJSON, err := json.Marshal(game)
	if err != nil {
		return err
	}
	query := `
	INSERT INTO games (id, state, active, updated_at)
	VALUES ($1, $2, $3, $4)
	ON CONFLICT (id) DO UPDATE
	SET state = $2, active = $3, updated_at = $4;
	`
	isActive := game.Status != "FINISHED"
	if _, err := tx.Exec(query, game.GameID, stateJSON, isActive, time.Now()); err != nil {
		return err
	}

	// 2. Sync Players
	// We need to ensure players exist in game_players.
	for _, p := range game.Players {
		// Skip Bots for game_players table (which requires UUID user_id)
		if p.IsBot {
			continue
		}

		// Convert inventory to JSON (if used for cards)
		// For now empty or whatever is in struct. But struct Inventory field?
		// PlayerState doesn't explicit have Inventory field in the viewed struct (it has [], but check definitions).
		// Assuming we just update balance/position/status.

		pq := `
		INSERT INTO game_players (game_id, user_id, token_color, balance, position, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (game_id, user_id) DO UPDATE
		SET balance = $4, position = $5, is_active = $6, token_color = $3;
		`
		if _, err := tx.Exec(pq, game.GameID, p.UserID, p.TokenColor, p.Balance, p.Position, p.IsActive); err != nil {
			log.Printf("Error syncing player %s: %v", p.Name, err)
			// Don't fail entire save for one player error? Or should we?
			// Let's return error to be safe.
			return err
		}
	}

	// 3. Sync Properties
	// We iterate over the Board or PropertyOwnership map.
	// PropertyOwnership is map[string]string (PropID -> OwnerID)
	// We need to update game_properties table.
	for propID, ownerID := range game.PropertyOwnership {
		// We need to find the UUID for this property?
		// The game_properties table uses 'property_id' text column (e.g. "1.1.1") which matches our map key.
		// AND 'owner_id' UUID. We have ownerID (UserID string from map).

		// Find Owner UUID
		// We assume ownerID string IS the UUID.
		var ownerUUID interface{} = nil
		if ownerID != "" {
			// If it's a BOT, we can't save it to the UUID column.
			// Currently bots have IDs starting with "BOT_".
			if len(ownerID) >= 4 && ownerID[:4] == "BOT_" {
				ownerUUID = nil
			} else {
				ownerUUID = ownerID
			}
		}

		// Upsert game_properties
		// Note: We might want to track Mortgage/Houses too if they were in the map.
		// For now, just owner.
		// To track houses/mortgage, we'd need to look up the Tile state or a separate map.
		// The `game.Board` has `Tile` structs which have `IsMortgaged`, `BuildingCount`.
		// Let's try to find the tile for this propID to get details.

		var mortgaged bool
		var houses int

		// Inefficient search, but safe for 64 tiles
		for _, tile := range game.Board {
			if tile.PropertyID == propID {
				mortgaged = tile.IsMortgaged
				houses = tile.BuildingCount
				break
			}
		}

		propQ := `
		INSERT INTO game_properties (game_id, property_id, owner_id, mortgaged, houses)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (game_id, property_id) DO UPDATE
		SET owner_id = $3, mortgaged = $4, houses = $5;
		`
		if _, err := tx.Exec(propQ, game.GameID, propID, ownerUUID, mortgaged, houses); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *GameRepository) SaveLog(gameID string, logEntry domain.EventLog) error {
	stateJSON, err := json.Marshal(logEntry)
	if err != nil {
		return err
	}

	query := `INSERT INTO game_history (game_id, action_type, details, created_at) VALUES ($1, $2, $3, $4)`
	_, err = r.db.Exec(query, gameID, logEntry.Type, stateJSON, time.Now())
	return err
}

func (r *GameRepository) LoadActive() ([]*domain.GameState, error) {
	query := `SELECT state FROM games WHERE active = TRUE`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var games []*domain.GameState
	for rows.Next() {
		var stateJSON []byte
		if err := rows.Scan(&stateJSON); err != nil {
			log.Printf("Error scanning game state: %v", err)
			continue
		}

		var game domain.GameState
		if err := json.Unmarshal(stateJSON, &game); err != nil {
			log.Printf("Error unmarshaling game state: %v", err)
			continue
		}
		games = append(games, &game)
	}
	return games, nil
}

// LoadBoardLayout fetches the board structure from the DB
func (r *GameRepository) LoadBoardLayout() (map[int]struct {
	Type       string
	PropertyID string
}, error) {
	query := `SELECT position, type, COALESCE(property_id::text, '') FROM board_layout`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	layout := make(map[int]struct {
		Type       string
		PropertyID string
	})

	for rows.Next() {
		var pos int
		var t, pid string
		if err := rows.Scan(&pos, &t, &pid); err != nil {
			continue
		}
		layout[pos] = struct {
			Type       string
			PropertyID string
		}{t, pid}
	}
	return layout, nil
}
