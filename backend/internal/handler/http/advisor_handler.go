package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gabriel3312cl/finances-game/backend/internal/service"
)

type AdvisorHandler struct {
	advisorService *service.AdvisorService
}

func NewAdvisorHandler(advisorService *service.AdvisorService) *AdvisorHandler {
	return &AdvisorHandler{
		advisorService: advisorService,
	}
}

// Chat handles POST /api/games/{id}/advisor
func (h *AdvisorHandler) Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract game ID from URL path: /api/games/{id}/advisor
	path := r.URL.Path
	parts := strings.Split(path, "/")
	var gameID string
	for i, part := range parts {
		if part == "games" && i+1 < len(parts) {
			gameID = parts[i+1]
			break
		}
	}
	if gameID == "" {
		http.Error(w, "Game ID not found in URL", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID, ok := r.Context().Value("user_id").(string)
	if !ok {
		http.Error(w, "Unauthorized: No UserID", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req struct {
		Message string                `json:"message"`
		History []service.ChatMessage `json:"history"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		http.Error(w, "Message cannot be empty", http.StatusBadRequest)
		return
	}

	// Call advisor service
	chatReq := &service.ChatRequest{
		GameID:  gameID,
		UserID:  userID,
		Message: req.Message,
		History: req.History,
	}

	resp, err := h.advisorService.GetAdvice(chatReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ChatStream handles POST /api/games/{id}/advisor/stream (SSE streaming)
func (h *AdvisorHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract game ID from URL path: /api/games/{id}/advisor/stream
	path := r.URL.Path
	parts := strings.Split(path, "/")
	var gameID string
	for i, part := range parts {
		if part == "games" && i+1 < len(parts) {
			gameID = parts[i+1]
			break
		}
	}
	if gameID == "" {
		http.Error(w, "Game ID not found in URL", http.StatusBadRequest)
		return
	}

	// Get user ID from context
	userID, ok := r.Context().Value("user_id").(string)
	if !ok {
		http.Error(w, "Unauthorized: No UserID", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req struct {
		Message string                `json:"message"`
		History []service.ChatMessage `json:"history"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		http.Error(w, "Message cannot be empty", http.StatusBadRequest)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no") // Disable buffering for nginx

	log.Printf("[Advisor] Starting stream for game %s, user %s", gameID, userID)

	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("[Advisor] Flusher not supported for this response writer")
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Create channels for streaming
	chunkChan := make(chan string, 100)
	errChan := make(chan error, 1)

	// Start streaming in goroutine
	chatReq := &service.ChatRequest{
		GameID:  gameID,
		UserID:  userID,
		Message: req.Message,
		History: req.History,
	}

	go h.advisorService.GetAdviceStream(chatReq, chunkChan, errChan)

	// Stream chunks to client
	for {
		select {
		case chunk, ok := <-chunkChan:
			if !ok {
				// Channel closed, we're done
				w.Write([]byte("data: [DONE]\n\n"))
				flusher.Flush()
				return
			}
			// Send chunk as SSE event
			data, _ := json.Marshal(map[string]string{"content": chunk})
			w.Write([]byte("data: " + string(data) + "\n\n"))
			flusher.Flush()

		case err := <-errChan:
			if err != nil {
				data, _ := json.Marshal(map[string]string{"error": err.Error()})
				w.Write([]byte("data: " + string(data) + "\n\n"))
				flusher.Flush()
			}
			return

		case <-r.Context().Done():
			// Client disconnected
			return
		}
	}
}
