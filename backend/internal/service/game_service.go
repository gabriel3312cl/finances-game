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
	"github.com/gabriel3312cl/finances-game/backend/internal/repository/postgres"
)

type GameService struct {
	games       map[string]*domain.GameState
	properties  map[string]domain.Property // Cache
	boardLayout map[int]string             // Position -> PropertyID (UUID)
	db          *sql.DB
	gameRepo    *postgres.GameRepository // Add Repo
	mu          sync.RWMutex
	hub         *websocket.Hub
	active      map[string]bool
}

func NewGameService(hub *websocket.Hub, db *sql.DB, gameRepo *postgres.GameRepository) *GameService {
	s := &GameService{
		games:       make(map[string]*domain.GameState),
		properties:  make(map[string]domain.Property),
		boardLayout: make(map[int]string),
		db:          db,
		gameRepo:    gameRepo,
		hub:         hub,
		active:      make(map[string]bool),
	}
	s.loadPropertiesAndLayout()
	s.loadActiveGames() // Load from DB
	return s
}

func (s *GameService) loadActiveGames() {
	games, err := s.gameRepo.LoadActive()
	if err != nil {
		log.Printf("Error loading active games: %v", err)
		return
	}
	for _, g := range games {
		s.games[g.GameID] = g
		log.Printf("Restored game: %s", g.GameID)
	}
}

// ... existing code ...

func (s *GameService) addLog(game *domain.GameState, message string, logType string) {
	entry := domain.EventLog{
		Timestamp: time.Now().Unix(),
		Message:   message,
		Type:      logType,
	}
	game.Logs = append(game.Logs, entry)
	game.LastAction = message // Keep legacy field for now

	// Persist Log Immediately
	go func() {
		if err := s.gameRepo.SaveLog(game.GameID, entry); err != nil {
			log.Printf("Error saving log: %v", err)
		}
	}()
}

func (s *GameService) saveGame(game *domain.GameState) {
	// Trim logs if too long
	if len(game.Logs) > 100 {
		game.Logs = game.Logs[len(game.Logs)-100:]
	}

	// Helper to save async so we don't block
	go func(g *domain.GameState) {
		if err := s.gameRepo.Save(g); err != nil {
			log.Printf("Error saving game %s: %v", g.GameID, err)
		}
	}(game)
}

func (s *GameService) GetGamesByUser(userID string) []*domain.GameState {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*domain.GameState
	for _, g := range s.games {
		for _, p := range g.Players {
			if p.UserID == userID {
				result = append(result, g)
				break
			}
		}
	}
	return result
}

func (s *GameService) CreateGame(host *domain.User) (*domain.GameState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code := generateGameCode()
	game := &domain.GameState{
		GameID:            code,
		Status:            domain.GameStatusWaiting,
		Board:             s.initializeBoard(),
		Players:           []*domain.PlayerState{},
		PropertyOwnership: make(map[string]string),
		TileVisits:        make(map[int]int),
		CurrentTurnID:     host.ID,
		Logs:              []domain.EventLog{},
		TurnOrder:         []string{},
	}

	game.Players = append(game.Players, &domain.PlayerState{
		UserID:     host.ID,
		Name:       host.Username,
		Balance:    1500,
		Position:   0,
		TokenColor: "RED",
		IsActive:   true,
	})

	s.games[code] = game
	s.saveGame(game) // Save
	return game, nil
}

func (s *GameService) loadPropertiesAndLayout() {
	// 1. Load Properties
	rows, err := s.db.Query("SELECT id, name, type, price, rent_base FROM properties")
	if err != nil {
		log.Printf("Error loading properties: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var p domain.Property
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Price, &p.RentBase); err != nil {
			continue
		}
		s.properties[p.ID] = p
		count++
	}
	log.Printf("Loaded %d properties", count)

	// 2. Load Board Layout
	layout, err := s.gameRepo.LoadBoardLayout()
	if err != nil {
		log.Printf("Error loading board layout: %v", err)
		return
	}

	for pos, item := range layout {
		// We map Position -> PropertyID (UUID)
		// If PropertyID is empty (e.g. Corner), we might store Type?
		// For getLayoutID compatibility, let's store PropertyID if exists, else "TYPE"
		if item.PropertyID != "" {
			s.boardLayout[pos] = item.PropertyID
		} else {
			s.boardLayout[pos] = item.Type // e.g. "CORNER", "TAX"
		}
	}
	log.Printf("Loaded %d layout items", len(s.boardLayout))
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
	case "JOIN_GAME":
		// Just broadcast state to ensure client has it
		s.broadcastGameState(game)
	case "START_GAME":
		s.handleStartGame(game, userID)
	case "ROLL_ORDER":
		s.handleRollOrder(game, userID)
	case "ROLL_DICE":
		s.handleRollDice(game, userID)
	case "END_TURN":
		s.handleEndTurn(game, userID)
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
	case "FINALIZE_AUCTION":
		s.handleFinalizeAuction(game)
	}
}

func (s *GameService) handleFinalizeAuction(game *domain.GameState) {
	if game.ActiveAuction == nil || !game.ActiveAuction.IsActive {
		return
	}
	// Check if time is actually up
	if time.Now().After(game.ActiveAuction.EndTime) {
		s.endAuction(game)
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
	game.LastAction = "Subasta iniciada por " + req.PropertyID // Better to use Name if available

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
		// Assign Property
		game.PropertyOwnership[game.ActiveAuction.PropertyID] = winnerID
		
		game.LastAction = "¡Subasta finalizada! Ganador: " + game.ActiveAuction.BidderName
	} else {
		game.LastAction = "¡Subasta finalizada! Sin ofertas."
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
	game.LastAction = player.Name + " compró " + prop.Name + " por $" + strconv.Itoa(prop.Price) // Fix string cast

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

	game.LastAction = offererName + " propuso un intercambio a " + targetName
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
		game.LastAction = "Intercambio fallido: Fondos insuficientes"
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

	game.LastAction = "Intercambio aceptado entre " + trade.OffererName + " y " + trade.TargetName
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

	game.LastAction = "Intercambio cancelado/rechazado"
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
			game.LastAction = p.Name + " tomó un préstamo de $" + strconv.Itoa(req.Amount)
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
			game.LastAction = p.Name + " pagó el préstamo: $" + strconv.Itoa(req.Amount)
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
			passGoMsg = " ¡Pasó por la SALIDA! Cobra $200."
		}

		// Check Tile
		// 4. Update Log with result
		desc := currentPlayer.Name + " lanzó " + strconv.Itoa(total) + passGoMsg // Fix int to str

		// Check Tile
		propID := s.getLayoutID(newPos)
		prop, isProperty := s.properties[propID]

		tileID := propID // For consistency with old code

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
						desc += ". Cayó en " + prop.Name + " (Propiedad de " + owner.Name + "). Pagó $" + strconv.Itoa(actualPay)
						s.addLog(game, currentPlayer.Name+" pagó $"+strconv.Itoa(actualPay)+" de renta a "+owner.Name, "ALERT")
					}
				} else {
					desc += ". Cayó en su propia propiedad."
				}
			} else {
				desc += ". Cayó en " + prop.Name + " (Sin dueño)"
			}
		}

		game.LastAction = desc
		s.addLog(game, desc, "DICE")
	}

	// 5. Broadcast (Explicit End Turn required now)
	s.broadcastGameState(game)
}

func (s *GameService) handleEndTurn(game *domain.GameState, userID string) {
	if game.Status != domain.GameStatusActive || game.CurrentTurnID != userID {
		return
	}

	// Simple Next Turn Logic using TurnOrder if available, else standard order
	idx := -1
	currentOrder := game.TurnOrder
	// If TurnOrder is empty (legacy games), rebuild it
	if len(currentOrder) == 0 {
		for _, p := range game.Players {
			currentOrder = append(currentOrder, p.UserID)
		}
		game.TurnOrder = currentOrder
	}

	for i, uid := range currentOrder {
		if uid == userID {
			idx = i
			break
		}
	}

	if idx != -1 {
		nextIdx := (idx + 1) % len(currentOrder)
		game.CurrentTurnID = currentOrder[nextIdx]

		// Find Next Player Name
		var nextName string
		for _, p := range game.Players {
			if p.UserID == game.CurrentTurnID {
				nextName = p.Name
				break
			}
		}
		s.addLog(game, "El turno pasa a "+nextName, "INFO")
	}

	s.broadcastGameState(game)
}

func (s *GameService) handleStartGame(game *domain.GameState, userID string) {
	// Only Host can start? For now anyone.
	if game.Status != domain.GameStatusWaiting {
		return
	}
	if len(game.Players) < 2 {
		return // Minimum 2 players
	}

	game.Status = domain.GameStatusRollingOrder
	s.addLog(game, "¡Juego Iniciado! Los jugadores deben lanzar dados para el orden.", "INFO")

	// Reset any previous state if needed
	game.TurnOrder = []string{}
	// Note: We use PropertyOwnership as "Rolled Value" temporary storage?
	// Or define a new map/struct?
	// Simplified: We can store their roll in "Position" temporarily since they are all at 0 anyway?
	// No, that messes up GO.
	// Let's us use LastAction or a temp map log?
	// Actually, easier to just add a temporary map or repurpose something.
	// Let's repurpose 'TileVisits' key -1 -> Map[UserID]RollValue? No.
	// We'll just filter logs or add a field if we really need to persistence.
	// For MVP, we trust the logs or frontend state? No, backend must know.
	// Let's assume we proceed immediately.

	s.broadcastGameState(game)
}

// Temporary storage for order rolls (in memory). Ideally should be in DB/GameState
var orderRolls = make(map[string]map[string]int) // GameID -> UserID -> Roll

func (s *GameService) handleRollOrder(game *domain.GameState, userID string) {
	if game.Status != domain.GameStatusRollingOrder {
		return
	}

	// Check if already rolled
	if orderRolls[game.GameID] == nil {
		orderRolls[game.GameID] = make(map[string]int)
	}
	if _, ok := orderRolls[game.GameID][userID]; ok {
		return
	}

	roll := rand.Intn(12) + 2 // 2-12
	orderRolls[game.GameID][userID] = roll

	s.addLog(game, getPlayerName(game, userID)+" lanzó "+strconv.Itoa(roll)+" para iniciativa.", "INFO")

	// Check if all rolled
	if len(orderRolls[game.GameID]) == len(game.Players) {
		// All rolled, determine order
		// Sort players by Roll descending
		rolls := orderRolls[game.GameID]

		// Create a slice of struct to sort
		type pRoll struct {
			UID  string
			Roll int
		}
		var sorted []pRoll
		for uid, r := range rolls {
			sorted = append(sorted, pRoll{uid, r})
		}

		// Simple Bubble Sort
		for i := 0; i < len(sorted); i++ {
			for j := 0; j < len(sorted)-i-1; j++ {
				if sorted[j].Roll < sorted[j+1].Roll {
					sorted[j], sorted[j+1] = sorted[j+1], sorted[j]
				}
			}
		}

		// Set Order
		game.TurnOrder = []string{}
		for _, pr := range sorted {
			game.TurnOrder = append(game.TurnOrder, pr.UID)
		}

		game.CurrentTurnID = game.TurnOrder[0]
		game.Status = domain.GameStatusActive
		s.addLog(game, "¡Orden de turno determinado! "+getPlayerName(game, game.CurrentTurnID)+" comienza.", "SUCCESS")

		// Cleanup
		delete(orderRolls, game.GameID)
	}

	s.broadcastGameState(game)
}

func getPlayerName(game *domain.GameState, userID string) string {
	for _, p := range game.Players {
		if p.UserID == userID {
			return p.Name
		}
	}
	return "Unknown"
}

func (s *GameService) broadcastGameState(game *domain.GameState) {
	s.saveGame(game) // Persist every update

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

func (s *GameService) GetBoardConfig() []domain.Tile {
	return s.initializeBoard()
}

func (s *GameService) initializeBoard() []domain.Tile {
	tiles := make([]domain.Tile, 64)
	for i := 0; i < 64; i++ {
		// Look up layout
		id, ok := s.boardLayout[i]

		var tile domain.Tile
		tile.ID = i
		tile.PropertyID = id

		if ok {
			// Check if it's a property
			if prop, exists := s.properties[id]; exists {
				tile.Name = prop.Name
				tile.Type = prop.Type
				tile.Price = prop.Price
				tile.Rent = prop.RentBase // Base rent for config
				tile.GroupIdentifier = prop.GroupID
				tile.GroupName = prop.GroupName
				tile.GroupColor = prop.GroupColor
			} else {
				// It's a special tile type string
				tile.Type = id
				tile.Name = id // e.g. "GO", "CHANCE"
			}
		} else {
			tile.Name = "Unknown"
			tile.Type = "TILE"
		}

		tiles[i] = tile
	}
	return tiles
}

func (s *GameService) getLayoutID(index int) string {
	if val, ok := s.boardLayout[index]; ok {
		return val
	}
	return ""
}
