package service

import (
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"sync"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/gabriel3312cl/finances-game/backend/internal/handler/websocket"
)

type GameService struct {
	games  map[string]*domain.GameState // In-memory state for active games
	mu     sync.RWMutex
	hub    *websocket.Hub
	active map[string]bool
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
		GameID:        code,
		Status:        "WAITING",
		Board:         initializeBoard(),
		Players:       []*domain.PlayerState{},
		CurrentTurnID: host.ID, // Host starts? Or random.
	}

	// Add Host
	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     host.ID,
		Name:       host.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: "RED",
		IsActive:   true,
	})

	s.games[code] = game
	return game, nil
}

func (s *GameService) JoinGame(code string, user *domain.User) (*domain.GameState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	game, ok := s.games[code]
	if !ok {
		return nil, errors.New("game not found")
	}

	// Check if already joined
	for _, p := range game.Players {
		if p.UserID == user.ID {
			return game, nil
		}
	}

	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     user.ID,
		Name:       user.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: "BLUE", // TODO: Dynamic colors
		IsActive:   true,
	})

	// Broadcast update to room
	s.broadcastGameState(game)

	return game, nil
}

// HandleAction processes WebSocket messages
func (s *GameService) HandleAction(gameID string, userID string, message []byte) {
	var action struct {
		Action  string          `json:"action"`
		Payload json.RawMessage `json:"payload"`
	}

	if err := json.Unmarshal(message, &action); err != nil {
		log.Printf("Invalid message format: %v", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	game, ok := s.games[gameID]
	if !ok {
		return
	}

	switch action.Action {
	case "ROLL_DICE":
		s.handleRollDice(game, userID)
	}
}

func (s *GameService) handleRollDice(game *domain.GameState, userID string) {
	// 1. Verify Turn
	if game.CurrentTurnID != userID {
		// Ignore if not their turn
		// return
	}

	// 2. Roll Dice
	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	game.Dice = [2]int{d1, d2}
	total := d1 + d2

	// 3. Move Player
	var currentPlayer *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == userID {
			currentPlayer = p
			break
		}
	}

	if currentPlayer != nil {
		newPos := (currentPlayer.Position + total) % 64
		currentPlayer.Position = newPos
		game.LastAction = currentPlayer.Name + " rolled " + string(total)
	}

	// 4. Next Turn (Round Robin)
	// Find index of current player
	idx := -1
	for i, p := range game.Players {
		if p.UserID == userID {
			idx = i
			break
		}
	}
	if idx != -1 {
		nextIdx := (idx + 1) % len(game.Players)
		game.CurrentTurnID = game.Players[nextIdx].UserID
	}

	// 5. Broadcast
	s.broadcastGameState(game)
}

func (s *GameService) broadcastGameState(game *domain.GameState) {
	data, _ := json.Marshal(struct {
		Type    string            `json:"type"`
		Payload *domain.GameState `json:"payload"`
	}{
		Type:    "GAME_STATE",
		Payload: game,
	})

	s.hub.Broadcast <- &websocket.BroadcastMessage{
		GameID:  game.GameID,
		Payload: data,
	}
}

func generateGameCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 4)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func initializeBoard() []domain.Tile {
	tiles := make([]domain.Tile, 64)
	for i := 0; i < 64; i++ {
		tiles[i] = domain.Tile{
			ID:   i,
			Type: "PROPERTY",
			Name: "Unknown",
		}
	}
	return tiles
}
