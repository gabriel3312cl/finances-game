package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/gabriel3312cl/finances-game/backend/internal/service"
)

type GameHandler struct {
	gameService *service.GameService
}

func (h *GameHandler) DeleteGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	gameID := r.URL.Query().Get("id")
	if gameID == "" {
		http.Error(w, "Missing game ID", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok {
		http.Error(w, "Unauthorized: No UserID", http.StatusUnauthorized)
		return
	}

	if err := h.gameService.DeleteGame(gameID, userID); err != nil {
		if err.Error() == "unauthorized: only host can delete game" {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Game deleted successfully",
	})
}

func NewGameHandler(gameService *service.GameService) *GameHandler {
	return &GameHandler{
		gameService: gameService,
	}
}

func (h *GameHandler) CreateGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok {
		http.Error(w, "Unauthorized: No UserID", http.StatusUnauthorized)
		return
	}
	username, _ := r.Context().Value("username").(string)
	if username == "" {
		username = "Unknown"
	}

	user := &domain.User{
		ID:       userID,
		Username: username,
	}

	game, err := h.gameService.CreateGame(user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"game_id": game.GameID,
		"message": "Game created successfully",
	})
}

func (h *GameHandler) JoinGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok {
		http.Error(w, "Unauthorized: No UserID", http.StatusUnauthorized)
		return
	}
	username, _ := r.Context().Value("username").(string)
	if username == "" {
		username = "Unknown"
	}

	user := &domain.User{
		ID:       userID,
		Username: username,
	}

	game, err := h.gameService.JoinGame(req.Code, user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest) // 400 if game not found
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"game_id": game.GameID,
		"message": "Joined game successfully",
	})
}

func (h *GameHandler) GetMyGames(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("user_id").(string)
	games := h.gameService.GetGamesByUser(userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

func (h *GameHandler) GetBoard(w http.ResponseWriter, r *http.Request) {
	board := h.gameService.GetBoardConfig()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(board)
}
