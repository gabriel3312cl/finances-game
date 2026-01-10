package websocket

import (
	"log"
	"net/http"
)

// GameService interface wrapper to avoid circular dependency if we import service package here.
// But better to define an Interface here or pass a specific method.
type GameServiceManager interface {
	// Methods if needed
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request, gameService GameServiceManager) {
	gameID := r.URL.Query().Get("game_id")
	userID := r.URL.Query().Get("user_id")

	if gameID == "" || userID == "" {
		http.Error(w, "Missing game_id or user_id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		Hub:    hub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		GameID: gameID,
		UserID: userID,
	}

	client.Hub.Register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.WritePump()
	go client.ReadPump()
}
