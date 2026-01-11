package service

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"strconv"
	"sync"
	"time"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/gabriel3312cl/finances-game/backend/internal/handler/websocket"
)

type GameService struct {
	games      map[string]*domain.GameState
	properties map[string]domain.Property // Cache
	db         *sql.DB
	mu         sync.RWMutex
	hub        *websocket.Hub
	active     map[string]bool
}

func NewGameService(hub *websocket.Hub, db *sql.DB) *GameService {
	s := &GameService{
		games:      make(map[string]*domain.GameState),
		properties: make(map[string]domain.Property),
		db:         db,
		hub:        hub,
		active:     make(map[string]bool),
	}
	s.loadProperties()
	return s
}

func (s *GameService) loadProperties() {
	rows, err := s.db.Query("SELECT id, name, type, price, rent_base FROM properties")
	if err != nil {
		log.Printf("Error loading properties: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var p domain.Property
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Price, &p.RentBase); err != nil {
			continue
		}
		s.properties[p.ID] = p
	}
	log.Printf("Loaded %d properties", len(s.properties))
}

func (s *GameService) CreateGame(host *domain.User) (*domain.GameState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code := generateGameCode()
	game := &domain.GameState{
		GameID:            code,
		Status:            "WAITING",
		Board:             initializeBoard(),
		Players:           []*domain.PlayerState{},
		PropertyOwnership: make(map[string]string),
		TileVisits:        make(map[int]int),
		CurrentTurnID:     host.ID, // Host starts? Or random.
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

	// Assign Random Color from available pool (simplified)
	colors := []string{"RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE", "CYAN", "PINK"}
	assignedColor := "BLUE"
	// Find unused color
	usedColors := make(map[string]bool)
	for _, p := range game.Players {
		usedColors[p.TokenColor] = true
	}
	for _, c := range colors {
		if !usedColors[c] {
			assignedColor = c
			break
		}
	}

	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     user.ID,
		Name:       user.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: assignedColor,
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
	case "START_AUCTION":
		s.handleStartAuction(game, userID, action.Payload)
	case "BID":
		s.handleBid(game, userID, action.Payload)
	case "BUY_PROPERTY":
		s.handleBuyProperty(game, userID, action.Payload)
	case "TAKE_LOAN":
		s.handleTakeLoan(game, userID, action.Payload)
	case "PAY_LOAN":
		s.handlePayLoan(game, userID, action.Payload)
	case "INITIATE_TRADE":
		s.handleInitiateTrade(game, userID, action.Payload)
	case "ACCEPT_TRADE":
		s.handleAcceptTrade(game, userID, action.Payload)
	case "REJECT_TRADE":
		s.handleRejectTrade(game, userID, action.Payload)
	}
}

func (s *GameService) handleStartAuction(game *domain.GameState, userID string, payload json.RawMessage) {
	// Only current player can start auction? Or anyone for unowned property?
	// For now, assume current player triggers it instead of buying.

	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// Validation: Verify property is not owned (omitted for speed, trusting frontend/rules for now)

	game.ActiveAuction = &domain.AuctionState{
		PropertyID: req.PropertyID,
		HighestBid: 10, // Starting bid?
		BidderID:   "",
		BidderName: "No bids",
		EndTime:    time.Now().Add(30 * time.Second), // 30s auction
		IsActive:   true,
	}
	game.LastAction = "Auction started for " + req.PropertyID // Better to use Name if available

	s.broadcastGameState(game)
}

func (s *GameService) handleBid(game *domain.GameState, userID string, payload json.RawMessage) {
	if game.ActiveAuction == nil || !game.ActiveAuction.IsActive {
		return
	}

	// Check expiry
	if time.Now().After(game.ActiveAuction.EndTime) {
		s.endAuction(game)
		return
	}

	var req struct {
		Amount int `json:"amount"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// Validate Bid
	if req.Amount <= game.ActiveAuction.HighestBid {
		return
	}

	// Find Bidder Name
	var bidderName string
	for _, p := range game.Players {
		if p.UserID == userID {
			if int64(p.Balance) < int64(req.Amount) {
				return // Insufficient funds
			}
			bidderName = p.Name
			break
		}
	}

	game.ActiveAuction.HighestBid = req.Amount
	game.ActiveAuction.BidderID = userID
	game.ActiveAuction.BidderName = bidderName

	// Anti-sniping: extend if < 10s left
	timeLeft := time.Until(game.ActiveAuction.EndTime)
	if timeLeft < 10*time.Second {
		game.ActiveAuction.EndTime = game.ActiveAuction.EndTime.Add(10 * time.Second)
	}

	s.broadcastGameState(game)
}

func (s *GameService) endAuction(game *domain.GameState) {
	if game.ActiveAuction == nil || !game.ActiveAuction.IsActive {
		return
	}

	winnerID := game.ActiveAuction.BidderID
	amount := int64(game.ActiveAuction.HighestBid)

	if winnerID != "" {
		// Deduct Balance & Assign Property
		for _, p := range game.Players {
			if p.UserID == winnerID {
				p.Balance -= int(amount)
				break
			}
		}
		game.LastAction = "Auction ended! Winner: " + game.ActiveAuction.BidderName
	} else {
		game.LastAction = "Auction ended! No bids."
	}

	game.ActiveAuction = nil
	s.broadcastGameState(game)
}

func (s *GameService) handleBuyProperty(game *domain.GameState, userID string, payload json.RawMessage) {
	// 1. Validate
	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	prop, exists := s.properties[req.PropertyID]
	if !exists {
		return
	}

	// Check if owned
	if _, owned := game.PropertyOwnership[req.PropertyID]; owned {
		return // Already owned
	}

	// Check Player
	var player *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == userID {
			player = p
			break
		}
	}
	if player == nil || player.Balance < int(prop.Price) {
		return // Insufficient funds
	}

	// 2. Execute Purchase
	player.Balance -= int(prop.Price)
	game.PropertyOwnership[req.PropertyID] = userID
	game.LastAction = player.Name + " bought " + prop.Name + " for $" + strconv.Itoa(prop.Price) // Fix string cast

	// 3. Update Board UI (optional, if Board stores ownership too)
	// We need to map PropertyID to Tile Index if we want to show it on board array
	// For now, Frontend can look up PropertyOwnership map.

	s.broadcastGameState(game)
}

func (s *GameService) handleInitiateTrade(game *domain.GameState, userID string, payload json.RawMessage) {
	// Only one trade at a time to keep it simple
	if game.ActiveTrade != nil {
		return
	}

	var req domain.TradeOffer
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// Basic Validation
	if req.TargetID == "" || req.TargetID == userID {
		return
	}

	// Fill names
	var offererName, targetName string
	for _, p := range game.Players {
		if p.UserID == userID {
			offererName = p.Name
		}
		if p.UserID == req.TargetID {
			targetName = p.Name
		}
	}

	game.ActiveTrade = &domain.TradeOffer{
		ID:                strconv.Itoa(int(time.Now().Unix())),
		OffererID:         userID,
		OffererName:       offererName,
		TargetID:          req.TargetID,
		TargetName:        targetName,
		OfferPropeties:    req.OfferPropeties,
		OfferCash:         req.OfferCash,
		RequestProperties: req.RequestProperties,
		RequestCash:       req.RequestCash,
		Status:            "PENDING",
	}

	game.LastAction = offererName + " proposed a trade to " + targetName
	s.broadcastGameState(game)
}

func (s *GameService) handleAcceptTrade(game *domain.GameState, userID string, payload json.RawMessage) {
	if game.ActiveTrade == nil || game.ActiveTrade.TargetID != userID {
		return
	}

	trade := game.ActiveTrade

	// Execute Swap
	// 1. Money Transfer
	var offerer, target *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == trade.OffererID {
			offerer = p
		}
		if p.UserID == trade.TargetID {
			target = p
		}
	}

	if offerer == nil || target == nil {
		game.ActiveTrade = nil
		return
	}

	// Verify Cash funds
	if offerer.Balance < int(trade.OfferCash) || target.Balance < int(trade.RequestCash) {
		game.LastAction = "Trade failed: Insufficient funds"
		game.ActiveTrade = nil
		s.broadcastGameState(game)
		return
	}

	// Transfer Cash
	offerer.Balance -= int(trade.OfferCash)
	target.Balance += int(trade.OfferCash)

	target.Balance -= int(trade.RequestCash)
	offerer.Balance += int(trade.RequestCash)

	// 2. Property Transfer
	// TODO: Verify ownership again for safety? Assuming UI is correct for now.
	for _, propID := range trade.OfferPropeties {
		if game.PropertyOwnership[propID] == trade.OffererID {
			game.PropertyOwnership[propID] = trade.TargetID
		}
	}
	for _, propID := range trade.RequestProperties {
		if game.PropertyOwnership[propID] == trade.TargetID {
			game.PropertyOwnership[propID] = trade.OffererID
		}
	}

	game.LastAction = "Trade accepted between " + trade.OffererName + " and " + trade.TargetName
	game.ActiveTrade = nil
	s.broadcastGameState(game)
}

func (s *GameService) handleRejectTrade(game *domain.GameState, userID string, payload json.RawMessage) {
	if game.ActiveTrade == nil {
		return
	}
	// Only Target or Offerer can cancel/reject
	if userID != game.ActiveTrade.TargetID && userID != game.ActiveTrade.OffererID {
		return
	}

	game.LastAction = "Trade cancelled/rejected"
	game.ActiveTrade = nil
	s.broadcastGameState(game)
}

func (s *GameService) handleTakeLoan(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		Amount int `json:"amount"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	if req.Amount <= 0 {
		return
	}

	for _, p := range game.Players {
		if p.UserID == userID {
			// Limit Check (Simple cap of 5000 for now)
			if p.Loan+req.Amount > 5000 {
				return
			}
			p.Balance += int(req.Amount)
			p.Loan += req.Amount
			game.LastAction = p.Name + " took a loan of $" + strconv.Itoa(req.Amount)
			break
		}
	}
	s.broadcastGameState(game)
}

func (s *GameService) handlePayLoan(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		Amount int `json:"amount"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	if req.Amount <= 0 {
		return
	}

	for _, p := range game.Players {
		if p.UserID == userID {
			if p.Loan < req.Amount {
				return // Cannot pay more than owed
			}
			if p.Balance < int(req.Amount) {
				return // Insufficient funds
			}

			p.Balance -= int(req.Amount)
			p.Loan -= req.Amount
			game.LastAction = p.Name + " repaid loan: $" + strconv.Itoa(req.Amount)
			break
		}
	}
	s.broadcastGameState(game)
}

func (s *GameService) handleRollDice(game *domain.GameState, userID string) {
	// 1. Verify Turn
	// 1. Verify Turn
	if game.CurrentTurnID != userID {
		// Ignore if not their turn
		return
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
		oldPos := currentPlayer.Position
		newPos := (currentPlayer.Position + total) % 64
		currentPlayer.Position = newPos

		// Track Visits
		if game.TileVisits == nil {
			game.TileVisits = make(map[int]int)
		}
		game.TileVisits[newPos]++

		// Check Pass Go
		var passGoMsg string
		if newPos < oldPos { // If new position is less than old position, it means player passed GO
			currentPlayer.Balance += 200
			passGoMsg = " Passed GO! Collects $200."
		}

		// Check Tile
		tileID := getLayoutID(newPos)
		prop, isProperty := s.properties[tileID]

		desc := currentPlayer.Name + " rolled " + strconv.Itoa(total) + passGoMsg // Fix int to str

		if isProperty {
			ownerID, isOwned := game.PropertyOwnership[tileID]
			if isOwned {
				if ownerID != userID {
					// PAY RENT
					rent := prop.RentBase // Base rent for now
					// Find Owner
					var owner *domain.PlayerState
					for _, op := range game.Players {
						if op.UserID == ownerID {
							owner = op
							break
						}
					}

					if owner != nil {
						// Transfer
						actualPay := rent
						if currentPlayer.Balance < rent {
							actualPay = currentPlayer.Balance // Bankruptcy logic later
						}
						currentPlayer.Balance -= actualPay
						owner.Balance += actualPay
						desc += ". Landed on " + prop.Name + " (Owned by " + owner.Name + "). Paid $" + strconv.Itoa(actualPay)
					}
				} else {
					desc += ". Landed on own property."
				}
			} else {
				desc += ". Landed on Unowned " + prop.Name
			}
		}

		game.LastAction = desc
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

func getLayoutID(index int) string {
	layout := []string{
		"GO", // 0
		"1.1.1", "COMMUNITY_CHEST", "1.1.2", "1.1.3", "TAX_INCOME", "1.2.1", "4.1", "2.1", "1.2.2", "1.2.3", "5.1", "1.3.1", "CHANCE", "1.3.2", "1.3.3",
		"JAIL", // 16
		"1.4.1", "3.1", "1.4.2", "1.4.3", "4.2", "1.5.1", "1.5.2", "2.2", "5.2", "1.5.3", "COMMUNITY_CHEST", "1.6.1", "1.6.2", "3.2", "1.6.3",
		"FREE_PARKING", // 32
		"1.7.1", "3.3", "CHANCE", "1.7.2", "1.7.3", "4.3", "1.8.1", "2.3", "1.8.2", "1.8.3", "5.3", "1.9.1", "1.9.2", "3.4", "1.9.3",
		"GO_TO_JAIL", // 48
		"1.10.1", "1.10.2", "3.5", "COMMUNITY_CHEST", "1.10.3", "4.4", "1.11.1", "2.4", "3.6", "1.11.2", "1.11.3", "CHANCE", "1.12.1", "TAX_LUXURY", "1.12.2",
	}
	if index >= 0 && index < len(layout) {
		return layout[index]
	}
	return ""
}
