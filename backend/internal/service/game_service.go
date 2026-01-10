package service

import (
	"errors"
	"math/rand"
	"sync"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/gabriel3312cl/finances-game/backend/internal/handler/websocket"
)

type GameService struct {
	games  map[string]*domain.GameState // In-memory state for active games
	mu     sync.RWMutex
	hub    *websocket.Hub
	active map[string]bool // Is game loop running?
}

func NewGameService(hub *websocket.Hub) *GameService {
	return &GameService{
		games:  make(map[string]*domain.GameState),
		hub:    hub,
		active: make(map[string]bool),
	}
}

func (s *GameService) CreateGame(host *domain.User) (*domain.GameState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code := generateGameCode()
	game := &domain.GameState{
		GameID: code,
		Status: "WAITING",
		Board:  initializeBoard(), // We need to define this
	}

	// Add Host as Player
	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     host.ID,
		Name:       host.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: "RED", // Default, make selectable later
		IsActive:   true,
	})

	s.games[code] = game

	// TODO: Persist to DB here (omitted for brevity in this step)

	return game, nil
}

func (s *GameService) JoinGame(code string, user *domain.User) (*domain.GameState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	game, ok := s.games[code]
	if !ok {
		return nil, errors.New("game not found")
	}

	if game.Status != "WAITING" {
		return nil, errors.New("game already started")
	}

	// Check if already joined
	for _, p := range game.Players {
		if p.UserID == user.ID {
			return game, nil // Re-join
		}
	}

	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     user.ID,
		Name:       user.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: "BLUE", // Randomize or pick
		IsActive:   true,
	})

	return game, nil
}

// TODO: Move this to a utils package
func generateGameCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 4)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func initializeBoard() []domain.Tile {
	// 64 tiles placeholder
	tiles := make([]domain.Tile, 64)
	for i := 0; i < 64; i++ {
		tiles[i] = domain.Tile{
			ID:   i,
			Type: "PROPERTY",
			Name: "Unknown",
		}
	}
	// TODO: Populate active board from parsing 'distribucion de tablero.txt'
	return tiles
}
