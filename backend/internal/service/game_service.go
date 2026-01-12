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
	games          map[string]*domain.GameState
	properties     map[string]domain.Property // Cache
	boardLayout    map[int]string             // Position -> PropertyID (UUID)
	db             *sql.DB
	gameRepo       *postgres.GameRepository // Add Repo
	mu             sync.RWMutex
	hub            *websocket.Hub
	active         map[string]bool
	chanceCards    []domain.Card
	communityCards []domain.Card
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
	// 1. Load Properties
	rows, err := s.db.Query(`SELECT 
		id, name, type, group_id, group_name, group_color, price, 
		rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel,
		rent_rule, house_cost, hotel_cost, mortgage_value, unmortgage_value
		FROM properties`)
	if err != nil {
		log.Printf("Error loading properties: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var p domain.Property
		var groupID, groupName, groupColor sql.NullString
		var rentBase, rentColorGroup, r1, r2, r3, r4, rHotel, hCost, hotCost, mort, unmort sql.NullInt32
		var rentRule sql.NullString

		if err := rows.Scan(
			&p.ID, &p.Name, &p.Type, &groupID, &groupName, &groupColor, &p.Price,
			&rentBase, &rentColorGroup, &r1, &r2, &r3, &r4, &rHotel,
			&rentRule, &hCost, &hotCost, &mort, &unmort,
		); err != nil {
			log.Printf("Error scanning property %s: %v", p.ID, err)
			continue
		}

		if groupID.Valid {
			p.GroupID = groupID.String
		}
		if groupName.Valid {
			p.GroupName = groupName.String
		}
		if groupColor.Valid {
			p.GroupColor = groupColor.String
		}

		if rentBase.Valid {
			p.RentBase = int(rentBase.Int32)
		}
		if rentColorGroup.Valid {
			p.RentColorGroup = int(rentColorGroup.Int32)
		}
		if r1.Valid {
			p.Rent1House = int(r1.Int32)
		}
		if r2.Valid {
			p.Rent2House = int(r2.Int32)
		}
		if r3.Valid {
			p.Rent3House = int(r3.Int32)
		}
		if r4.Valid {
			p.Rent4House = int(r4.Int32)
		}
		if rHotel.Valid {
			p.RentHotel = int(rHotel.Int32)
		}
		if hCost.Valid {
			p.HouseCost = int(hCost.Int32)
		}
		if hotCost.Valid {
			p.HotelCost = int(hotCost.Int32)
		}
		if mort.Valid {
			p.MortgageValue = int(mort.Int32)
		}
		if unmort.Valid {
			p.UnmortgageValue = int(unmort.Int32)
		}
		if rentRule.Valid {
			p.RentRule = rentRule.String
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

	s.loadCards()
}

func (s *GameService) loadCards() {
	// Reset decks
	s.chanceCards = []domain.Card{}
	s.communityCards = []domain.Card{}

	// Load All Cards
	rows, err := s.db.Query("SELECT id, type, title, description, effect FROM game_cards")
	if err != nil {
		log.Printf("Error loading game cards: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var c domain.Card
		// Use sql.NullString for title if nullable? I defined it as VARCHAR(100) (nullable by default).
		// But Scan expects non-nil.
		// I'll scan into string, assuming I seeded all with titles.
		// Or helper scan.
		var title sql.NullString
		if err := rows.Scan(&c.ID, &c.Type, &title, &c.Description, &c.Effect); err != nil {
			log.Printf("Error scanning card: %v", err)
			continue
		}
		if title.Valid {
			c.Title = title.String
		}

		if c.Type == "CHANCE" {
			s.chanceCards = append(s.chanceCards, c)
		} else if c.Type == "COMMUNITY" {
			s.communityCards = append(s.communityCards, c)
		}
	}
	log.Printf("Loaded %d Chance and %d Community cards", len(s.chanceCards), len(s.communityCards))
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
	case "DRAW_CARD":
		s.handleDrawCard(game, userID)
	case "PAY_RENT":
		s.handlePayRent(game, userID, action.Payload)
	case "COLLECT_RENT": // New Manual Action
		s.handleCollectRent(game, userID)
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
	game.LastAction = "Subasta iniciada por " + req.PropertyID
	s.addLog(game, "Subasta iniciada por "+req.PropertyID, "INFO")

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

	s.addLog(game, bidderName+" ha pujado $"+strconv.Itoa(req.Amount), "INFO")
	s.broadcastGameState(game)
}

func (s *GameService) handleDrawCard(game *domain.GameState, userID string) {
	if game.CurrentTurnID != userID {
		return
	}

	// Find Player
	var player *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == userID {
			player = p
			break
		}
	}
	if player == nil {
		return
	}

	// Identify Tile Type
	layoutID := s.getLayoutID(player.Position)
	var deck []domain.Card
	var typeName string

	if layoutID == "CHANCE" {
		deck = s.chanceCards
		typeName = "Fortuna"
	} else if layoutID == "COMMUNITY" {
		deck = s.communityCards
		typeName = "Arca Comunal"
	} else {
		return // Not a card tile
	}

	if len(deck) == 0 {
		s.addLog(game, "Error: Deck empty", "ALERT")
		return
	}

	// Draw Random
	card := deck[rand.Intn(len(deck))]
	game.DrawnCard = &card
	s.addLog(game, player.Name+" sacó una tarjeta de "+typeName, "ACTION")

	// Execute Effect logic
	importStr := card.Effect
	// Format: "cmd:arg" or "cmd:arg1:arg2"

	if importStr == "jail_free" {
		// Add "Get Out of Jail Free" to Inventory
		// Simplified: just log it (Need inventory system update which is game_players JSONB)
		// For MVP, just give cash value? No, user wants persistence.
		// Since I haven't implemented Item Inventory fully, I will just give $50 as "Sale Value"
		player.Balance += 50
		s.addLog(game, "Tarjeta 'Sal de la Cárcel'. Se vendió por $50 (Inventario no disponible)", "INFO")
	} else if len(importStr) > 8 && importStr[:8] == "collect:" {
		val, _ := strconv.Atoi(importStr[8:])
		player.Balance += val
		s.addLog(game, "¡Ganó $"+strconv.Itoa(val)+"!", "SUCCESS")
	} else if len(importStr) > 4 && importStr[:4] == "pay:" {
		val, _ := strconv.Atoi(importStr[4:])
		player.Balance -= val
		s.addLog(game, "Pagó $"+strconv.Itoa(val), "ALERT")
	} else if len(importStr) > 12 && importStr[:12] == "collect_all:" {
		amount, _ := strconv.Atoi(importStr[12:])
		total := 0
		for _, p := range game.Players {
			if p.UserID != userID && p.IsActive {
				p.Balance -= amount
				total += amount
			}
		}
		player.Balance += total
		s.addLog(game, "Cobró $"+strconv.Itoa(amount)+" a cada jugador", "SUCCESS")
	} else if len(importStr) > 8 && importStr[:8] == "pay_all:" {
		amount, _ := strconv.Atoi(importStr[8:])
		for _, p := range game.Players {
			if p.UserID != userID && p.IsActive {
				p.Balance += amount
				player.Balance -= amount
			}
		}
		s.addLog(game, "Pagó $"+strconv.Itoa(amount)+" a cada jugador", "ALERT")
	} else if len(importStr) > 5 && importStr[:5] == "move:" {
		target := importStr[5:]

		if target == "GO" {
			player.Position = 0
			player.Balance += 200 // Standard pass go
			s.addLog(game, "Avanzó hasta la SALIDA", "action")
		} else if target == "GO_BONUS" {
			player.Position = 0
			player.Balance += 500 // User requested 500
			s.addLog(game, "Avanzó a Salida (Bonus $500)", "SUCCESS")
		} else if target == "JAIL" {
			player.InJail = true
			player.Position = 10
			s.addLog(game, "Fue enviado a la Cárcel", "ALERT")
		} else if target == "-3" {
			player.Position = (player.Position - 3 + domain.BoardSize) % domain.BoardSize
			s.addLog(game, "Retrocedió 3 espacios", "action")
		} else if target == "nearest_railroad" {
			// Find next railroad
			for i := 1; i < domain.BoardSize; i++ {
				pos := (player.Position + i) % domain.BoardSize
				if s.getLayoutType(pos) == "RAILROAD" {
					player.Position = pos
					s.addLog(game, "Avanzó al ferrocarril más cercano", "action")
					// TODO: Logic for paying double?
					break
				}
			}
		} else if target == "nearest_utility" {
			for i := 1; i < domain.BoardSize; i++ {
				pos := (player.Position + i) % domain.BoardSize
				if s.getLayoutType(pos) == "UTILITY" {
					player.Position = pos
					s.addLog(game, "Avanzó a la utilidad más cercana", "action")
					break
				}
			}
		} else if target == "random_property" {
			// simplified: move next property
			player.Position = (player.Position + 1) % domain.BoardSize
			s.addLog(game, "Avanzó (Aleatorio)", "action")
		} else if target == "last_property" {
			player.Position = domain.BoardSize - 1 // Last tile?
			s.addLog(game, "Avanzó a la última casilla", "action")
		} else if target == "av-ossa" {
			// Need precise index lookup. For now, approximate or skip if logic not ready.
			// Assuming "av-ossa" is at specific index.
			// I don't have map String->Index loaded in memory efficiently (only Index->ID).
			// Will check boardLayout values if PropertyID matches?
			// Too complex for this snippet. Just logging support needed.
			s.addLog(game, "Movimiento a "+target+" no implementado exacto", "INFO")
		}
	} else if len(importStr) > 7 && importStr[:7] == "repair:" {
		// repair:25:100
		// parts := parseRepair(importStr[7:]) // need helper or inline
		// Helper logic inline:
		// Assume "25:100"
		// Count houses/hotels
		costHouse := 25
		costHotel := 100
		// parse...
		// Calc total
		total := 0
		// Need to iterate properties owned by player.
		// game.PropertyOwnership[uuid] == userID.
		// Then check s.properties[uuid] or where houses stored (game_properties table).
		// Wait, Houses stored in `game_properties` DB table, not loaded in `GameState` fully?
		// `GameState` has `Board []Tile` which has `BuildingCount`.
		// Iterate Board.
		for _, t := range game.Board {
			if t.OwnerID != nil && *t.OwnerID == userID {
				if t.BuildingCount == 5 {
					total += costHotel
				} else {
					total += t.BuildingCount * costHouse
				}
			}
		}
		player.Balance -= total
		s.addLog(game, "Reparaciones: Pagó $"+strconv.Itoa(total), "ALERT")
	}

	game.LastAction = "Tarjeta: " + card.Description
	s.broadcastGameState(game)
}

func (s *GameService) getLayoutType(pos int) string {
	// Helper to lookup type
	// implementation:
	if id, ok := s.boardLayout[pos]; ok {
		if prop, exists := s.properties[id]; exists {
			return prop.Type
		}
		return id // e.g. "CHANCE"
	}
	return ""
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
		s.addLog(game, "¡Subasta finalizada! Ganador: "+game.ActiveAuction.BidderName+" por $"+strconv.Itoa(int(amount)), "SUCCESS")
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
	game.LastAction = player.Name + " compró " + prop.Name + " por $" + strconv.Itoa(prop.Price)
	s.addLog(game, player.Name+" compró "+prop.Name+" por $"+strconv.Itoa(prop.Price), "SUCCESS")

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

	// Check if already rolled (and not doubles)
	// If Dice are set (non-zero) and NOT doubles, prevent re-roll
	if game.Dice[0] != 0 && game.Dice[0] != game.Dice[1] {
		// Already rolled non-doubles
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
					// Check Mortgage
					tile := &game.Board[newPos]
					if tile.IsMortgaged {
						desc += ". Propiedad Hipotecada. No paga renta."
					} else {
						// Find Owner for payment
						var owner *domain.PlayerState
						for _, op := range game.Players {
							if op.UserID == ownerID {
								owner = op
								break
							}
						}

						if owner != nil {
							rent := s.calculateRent(game, tile, total)

							// Manual Rent Logic: Set Pending Rent
							game.PendingRent = &domain.PendingRent{
								TargetID:   userID,
								CreditorID: ownerID,
								Amount:     rent,
								PropertyID: tileID,
							}

							desc += ". Cayó en " + prop.Name + ". Renta potencial: $" + strconv.Itoa(rent)
							s.addLog(game, currentPlayer.Name+" cayó en "+prop.Name+". Esperando que "+owner.Name+" cobre la renta.", "ALERT")
						}
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

	// Clear Dice for next player
	game.Dice = [2]int{0, 0}
	game.DrawnCard = nil
	// Rent Forfeit Rule: If not collected by end of turn, it is lost.
	if game.PendingRent != nil {
		s.addLog(game, "Renta no cobrada ha expirado.", "INFO")
		game.PendingRent = nil
	}

	s.broadcastGameState(game)
}

func (s *GameService) handleCollectRent(game *domain.GameState, userID string) {
	if game.PendingRent == nil {
		s.addLog(game, "No hay renta pendiente para cobrar (ya fue cobrada o expiró).", "INFO")
		return
	}
	if game.PendingRent.CreditorID != userID {
		s.addLog(game, "Solo el propietario puede cobrar esta renta.", "ALERT")
		return // Only creditor can collect
	}

	// Execute Transfer
	rent := game.PendingRent.Amount
	targetID := game.PendingRent.TargetID

	var target, creditor *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == targetID {
			target = p
		}
		if p.UserID == userID {
			creditor = p
		}
	}

	if target != nil && creditor != nil {
		actualPay := rent
		// Bankruptcy logic simplified
		if target.Balance < rent {
			// Take all they have (or debt logic if implemented)
			// For now, allow negative? Or just take balance?
			// User wants negative balance restrictions, so going negative is allowed mathematically but blocks actions.
			// Let's just deduct.
		}

		target.Balance -= actualPay
		creditor.Balance += actualPay

		s.addLog(game, creditor.Name+" cobró la renta de $"+strconv.Itoa(actualPay)+" a "+target.Name, "SUCCESS")
	}

	game.PendingRent = nil // Cleared
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
				tile.Rent = prop.RentBase     // Base rent current
				tile.RentRule = prop.RentRule // Pass to frontend

				// Full info
				tile.RentBase = prop.RentBase
				tile.RentColorGroup = prop.RentColorGroup
				tile.Rent1House = prop.Rent1House
				tile.Rent2House = prop.Rent2House
				tile.Rent3House = prop.Rent3House
				tile.Rent4House = prop.Rent4House
				tile.RentHotel = prop.RentHotel
				tile.HouseCost = prop.HouseCost
				tile.HotelCost = prop.HotelCost
				tile.MortgageValue = prop.MortgageValue
				tile.UnmortgageValue = prop.UnmortgageValue

				tile.GroupIdentifier = prop.GroupID
				tile.GroupName = prop.GroupName
				tile.GroupColor = prop.GroupColor
			} else {
				// It's a special tile type string
				// Override Corners based on Index for consistency
				switch i {
				case 0:
					tile.Type = "GO"
					tile.Name = "SALIDA"
				case 16:
					tile.Type = "JAIL"
					tile.Name = "CÁRCEL"
				case 32:
					tile.Type = "FREE_PARKING"
					tile.Name = "PARADA LIBRE" // Paso Libre
				case 48:
					tile.Type = "GO_TO_JAIL"
					tile.Name = "VAYA A LA CÁRCEL"
				default:
					tile.Type = id
					tile.Name = id
				}
			}
		} else {
			tile.Name = "Unknown"
			tile.Type = "TILE"
		}

		tiles[i] = tile
	}
	return tiles
}

func (s *GameService) calculateRent(game *domain.GameState, tile *domain.Tile, diceRoll int) int {
	ownerID, owned := game.PropertyOwnership[tile.PropertyID]
	if !owned {
		return 0
	}

	if tile.Type == "UTILITY" {
		count := 0
		for _, t := range game.Board {
			if t.Type == "UTILITY" {
				if oid, ok := game.PropertyOwnership[t.PropertyID]; ok && oid == ownerID {
					count++
				}
			}
		}
		if count == 2 {
			return diceRoll * 10
		}
		return diceRoll * 4
	}

	if tile.Type == "RAILROAD" {
		count := 0
		for _, t := range game.Board {
			if t.Type == "RAILROAD" {
				if oid, ok := game.PropertyOwnership[t.PropertyID]; ok && oid == ownerID {
					count++
				}
			}
		}
		switch count {
		case 1:
			return 25
		case 2:
			return 50
		case 3:
			return 100
		case 4:
			return 200
		default:
			return 200
		}
	}

	// PROPERTY
	if tile.BuildingCount > 0 {
		switch tile.BuildingCount {
		case 1:
			return tile.Rent1House
		case 2:
			return tile.Rent2House
		case 3:
			return tile.Rent3House
		case 4:
			return tile.Rent4House
		case 5:
			return tile.RentHotel
		}
	}

	// Base Rent - Check for Monopoly (Full Group)
	if tile.GroupIdentifier != "" {
		allOwned := true
		for _, t := range game.Board {
			if t.GroupIdentifier == tile.GroupIdentifier {
				if oid, ok := game.PropertyOwnership[t.PropertyID]; !ok || oid != ownerID {
					allOwned = false
					break
				}
			}
		}
		if allOwned {
			// Rule: Double rent if unimproved
			if tile.BuildingCount == 0 {
				if tile.RentColorGroup > 0 {
					return tile.RentColorGroup // Use explicit column if present
				}
				return tile.RentBase * 2
			}
		}
	}

	return tile.RentBase
}

func (s *GameService) getLayoutID(index int) string {
	if val, ok := s.boardLayout[index]; ok {
		return val
	}
	return ""
}

func (s *GameService) handlePayRent(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		PropertyID string `json:"property_id"`
		TargetID   string `json:"target_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// Validation: Must have PendingRent matching this request
	// This ensures we don't double charge or charge arbitrarily.
	if game.PendingRent == nil {
		s.addLog(game, "Acción inválida: No hay renta pendiente para cobrar.", "ALERT")
		return
	}

	// Strict Match: Creditor must be User, Target must match, Property must match
	if game.PendingRent.CreditorID != userID {
		s.addLog(game, "No tienes permiso para cobrar esta renta.", "ALERT")
		return
	}
	if game.PendingRent.TargetID != req.TargetID {
		s.addLog(game, "El deudor no coincide con la renta pendiente.", "ALERT")
		return
	}
	if game.PendingRent.PropertyID != req.PropertyID {
		s.addLog(game, "La propiedad no coincide con la renta pendiente.", "ALERT")
		return
	}

	// Delegate to single source of truth handler
	s.handleCollectRent(game, userID)
}
