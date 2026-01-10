package handler

import "net/http"

type WebSocketHandler struct {
	// hub *Hub
}

func NewWebSocketHandler() *WebSocketHandler {
	return &WebSocketHandler{}
}

func (h *WebSocketHandler) HandleConnections(w http.ResponseWriter, r *http.Request) {
	// Upgrade connection
}
