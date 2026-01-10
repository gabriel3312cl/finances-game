package websocket

type BroadcastMessage struct {
	GameID  string
	Payload []byte
	Sender  *Client
}

type Hub struct {
	// Registered clients map[GameID]map[Client]bool
	Clients map[string]map[*Client]bool

	// Inbound messages from the clients.
	Broadcast chan *BroadcastMessage

	// Register requests from the clients.
	Register chan *Client

	// Unregister requests from clients.
	Unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan *BroadcastMessage),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[string]map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			if h.Clients[client.GameID] == nil {
				h.Clients[client.GameID] = make(map[*Client]bool)
			}
			h.Clients[client.GameID][client] = true
		case client := <-h.Unregister:
			if clients, ok := h.Clients[client.GameID]; ok {
				if _, ok := clients[client]; ok {
					delete(clients, client)
					close(client.Send)
					if len(clients) == 0 {
						delete(h.Clients, client.GameID)
					}
				}
			}
		case message := <-h.Broadcast:
			// Broadcast only to clients in the same GameID
			if clients, ok := h.Clients[message.GameID]; ok {
				for client := range clients {
					select {
					case client.Send <- message.Payload:
					default:
						close(client.Send)
						delete(clients, client)
					}
				}
			}
		}
	}
}
