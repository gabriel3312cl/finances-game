package service

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"strconv"
	"strings"
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
	botService     *BotService // Dependency injection
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

// SetBotService injects the bot service (circular dependency workaround)
func (s *GameService) SetBotService(bs *BotService) {
	s.botService = bs
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

// ============ CREDIT SYSTEM HELPERS ============

// initCreditProfile initializes a player's credit profile if nil
func (s *GameService) initCreditProfile(p *domain.PlayerState) {
	if p.Credit == nil {
		p.Credit = &domain.CreditProfile{
			Score:           700, // Start with "Good" credit
			LoansTaken:      0,
			LoansPaidOnTime: 0,
			RoundsInDebt:    0,
			LastLoanRound:   0,
			CurrentRound:    0,
		}
	}
}

// calculateCreditScore recalculates a player's credit score based on various factors
func (s *GameService) calculateCreditScore(game *domain.GameState, p *domain.PlayerState) int {
	s.initCreditProfile(p)
	score := 550 // Base score

	// Factor 1: Loans Paid On Time (+30 each, max +150)
	paidBonus := p.Credit.LoansPaidOnTime * 30
	if paidBonus > 150 {
		paidBonus = 150
	}
	score += paidBonus

	// Factor 2: Delinquency (-50 per round in debt after 3)
	if p.Credit.RoundsInDebt > 3 {
		score -= (p.Credit.RoundsInDebt - 3) * 50
	}

	// Factor 3: Properties Owned (+5 each, max +50)
	propsOwned := 0
	for _, ownerID := range game.PropertyOwnership {
		if ownerID == p.UserID {
			propsOwned++
		}
	}
	propBonus := propsOwned * 5
	if propBonus > 50 {
		propBonus = 50
	}
	score += propBonus

	// Factor 4: High Debt Ratio (-20 if loan > 50% of balance+loan)
	totalAssets := p.Balance + p.Loan
	if totalAssets > 0 && p.Loan > totalAssets/2 {
		score -= 20
	}

	// Clamp to valid range 300-850
	if score < 300 {
		score = 300
	}
	if score > 850 {
		score = 850
	}

	p.Credit.Score = score
	return score
}

// getInterestRate returns the interest rate based on credit score
func (s *GameService) getInterestRate(score int) int {
	switch {
	case score >= 750:
		return 5
	case score >= 700:
		return 10
	case score >= 650:
		return 15
	case score >= 550:
		return 25
	default:
		return 35
	}
}

// getCreditLimit returns the max loan amount based on credit score
func (s *GameService) getCreditLimit(score int) int {
	switch {
	case score >= 750:
		return 8000
	case score >= 700:
		return 6000
	case score >= 650:
		return 4000
	case score >= 550:
		return 2000
	default:
		return 500
	}
}

// ... existing code ...

func (s *GameService) addLog(game *domain.GameState, message string, logType string) {
	s.addLogWithMeta(game, message, logType, nil, nil)
}

func (s *GameService) addLogWithMeta(game *domain.GameState, message string, logType string, tileID *int, userID *string) {
	entry := domain.EventLog{
		Timestamp: time.Now().Unix(),
		Message:   message,
		Type:      logType,
		TileID:    tileID,
		UserID:    userID,
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
		HostID:            host.ID,
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

func (s *GameService) DeleteGame(gameID string, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	game, ok := s.games[gameID]
	if !ok {
		return errors.New("game not found")
	}

	if game.HostID != userID {
		return errors.New("unauthorized: only host can delete game")
	}

	// Delete from DB
	if err := s.gameRepo.Delete(gameID); err != nil {
		return fmt.Errorf("failed to delete game: %v", err)
	}

	// Delete from memory
	delete(s.games, gameID)
	// Optionally close websockets? handleEndGame cleans up usually.
	// For now, simple deletion. The frontend will disconnect if game is gone.

	return nil
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

func (s *GameService) AddBot(gameID string, personalityID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	game, ok := s.games[gameID]
	if !ok {
		return errors.New("game not found")
	}

	if game.Status != domain.GameStatusWaiting {
		return errors.New("cannot add bot to active game")
	}

	profile := domain.GetBotProfile(personalityID)
	botID := "BOT_" + generateGameCode() // simple unique id

	// Pick color
	colors := []string{"RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE", "CYAN", "PINK"}
	assignedColor := "GRAY"
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
		UserID:           botID,
		Name:             "[BOT] " + profile.Name,
		Balance:          1500,
		Position:         0,
		TokenColor:       assignedColor,
		IsActive:         true,
		IsBot:            true,
		BotPersonalityID: personalityID,
	})

	s.addLog(game, "Se ha unido el bot "+profile.Name, "INFO")
	s.broadcastGameState(game)
	return nil
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
		s.handleStartGame(game, userID, action.Payload)
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
	case "BUY_BUILDING":
		s.handleBuyBuilding(game, userID, action.Payload)
	case "SELL_BUILDING":
		s.handleSellBuilding(game, userID, action.Payload)
	case "MORTGAGE_PROPERTY":
		s.handleMortgageProperty(game, userID, action.Payload)
	case "UNMORTGAGE_PROPERTY":
		s.handleUnmortgageProperty(game, userID, action.Payload)
	case "SELL_PROPERTY":
		s.handleSellProperty(game, userID, action.Payload)
	case "ADD_BOT":
		s.handleAddBot(game, userID, action.Payload)
	case "DECLARE_BANKRUPTCY":
		s.handleDeclareBankruptcy(game, userID)
	case "UPDATE_PLAYER_CONFIG":
		s.handleUpdatePlayerConfig(game, userID, action.Payload)
	case "SEND_CHAT":
		s.handleSendChat(game, userID, action.Payload)
	}
}

func (s *GameService) handleUpdatePlayerConfig(game *domain.GameState, userID string, payload json.RawMessage) {
	// Allow updates only in WAITING or maybe anytime? Let's say WAITING for now to avoid confusion during game,
	// but user might want to change color mid-game if they want.
	// Requirement says "before it begins", so let's restrict to WAITING for now, or allow anytime if it doesn't break anything.
	// Allowing anytime is cooler.

	var req struct {
		TokenColor string `json:"token_color"`
		TokenShape string `json:"token_shape"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	updated := false
	for _, p := range game.Players {
		if p.UserID == userID {
			if req.TokenColor != "" {
				p.TokenColor = req.TokenColor
				updated = true
			}
			if req.TokenShape != "" {
				p.TokenShape = req.TokenShape
				updated = true
			}
			break
		}
	}

	if updated {
		// Log? Maybe not for simple cosmetic change to avoid spam
		// s.addLog(game, "Player updated config", "INFO")
		s.broadcastGameState(game)
	}
}

func (s *GameService) handleAddBot(game *domain.GameState, userID string, payload json.RawMessage) {
	// Only host can add bots
	if game.Players[0].UserID != userID {
		return
	}
	var req struct {
		PersonalityID string `json:"personality_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}
	// We call the method we just added (but we need to unlock first because AddBot locks)
	// Actually HandleAction locks. So we should NOT call AddBot public method which locks.
	// We need internal logic or refactor.
	// Best approach: Inline the logic here since we already have the lock, OR make internal addBot without lock.
	// Refactoring AddBot to use internal helpers is safer but for speed I will inline internal logic here.

	if game.Status != domain.GameStatusWaiting {
		return
	}

	profile := domain.GetBotProfile(req.PersonalityID)
	botID := "BOT_" + generateGameCode()

	// Pick color logic (simplified copy)
	colors := []string{"RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE", "CYAN", "PINK"}
	assignedColor := "GRAY"
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

	funNames := []string{
		"El Tío Richie", "Don Billetes", "IA-fortunado", "El Lobo de Wall Street",
		"Algoritmo Avaricioso", "Byte de Oro", "Millonario en Bit", "Sr. Monopolio",
		"Doña Hipoteca", "El Magnate de Silicio", "Billetera Fría", "Interés Compuesto",
		"Calculadora Humana", "Sr. Dividendos", "El Inflacionario",
	}
	randomName := funNames[rand.Intn(len(funNames))]

	game.Players = append(game.Players, &domain.PlayerState{
		UserID:           botID,
		Name:             "[BOT] " + randomName + " (" + profile.Name + ")",
		Balance:          1500,
		Position:         0,
		TokenColor:       assignedColor,
		IsActive:         true,
		IsBot:            true,
		BotPersonalityID: req.PersonalityID,
	})

	s.addLog(game, "Se ha unido el bot "+profile.Name, "INFO")
	s.broadcastGameState(game)
}

func (s *GameService) handleFinalizeAuction(game *domain.GameState) {
	if game.ActiveAuction == nil || !game.ActiveAuction.IsActive {
		return
	}
	// Check if time is actually up
	now := time.Now()
	lastBid := time.Unix(game.ActiveAuction.LastBidTime, 0)

	// Auto-Win: If > 5s passed since last bid and we have a bidder
	if game.ActiveAuction.BidderID != "" && now.Sub(lastBid) > 5*time.Second {
		s.endAuction(game)
		return
	}

	if now.After(game.ActiveAuction.EndTime) {
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
		PropertyID:    req.PropertyID,
		HighestBid:    10, // Starting bid?
		BidderID:      "",
		BidderName:    "No bids",
		EndTime:       time.Now().Add(30 * time.Second), // 30s auction
		LastBidTime:   time.Now().Unix(),
		IsActive:      true,
		PassedPlayers: make(map[string]bool),
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
	game.ActiveAuction.LastBidTime = time.Now().Unix()

	// Anti-sniping: extend if < 10s left
	timeLeft := time.Until(game.ActiveAuction.EndTime)
	if timeLeft < 10*time.Second {
		game.ActiveAuction.EndTime = time.Now().Add(10 * time.Second) // Extend time
	}

	s.addLog(game, bidderName+" ha pujado $"+strconv.Itoa(req.Amount), "INFO")
	s.broadcastGameState(game)
}

func (s *GameService) handlePassAuction(game *domain.GameState, userID string) {
	if game.ActiveAuction == nil || !game.ActiveAuction.IsActive {
		return
	}
	if game.ActiveAuction.PassedPlayers == nil {
		game.ActiveAuction.PassedPlayers = make(map[string]bool)
	}
	game.ActiveAuction.PassedPlayers[userID] = true
	s.addLog(game, "Jugador ha pasado en la subasta.", "INFO")
	// Check if only 1 player remaining? Not implementing complex logic yet.
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
			s.trackTileVisit(game, player, 0)
			s.addLog(game, "Avanzó hasta la SALIDA", "action")
		} else if target == "GO_BONUS" {
			player.Position = 0
			player.Balance += 500 // User requested 500
			s.trackTileVisit(game, player, 0)
			s.addLog(game, "Avanzó a Salida (Bonus $500)", "SUCCESS")
		} else if target == "JAIL" {
			player.InJail = true
			player.Position = 16
			s.trackTileVisit(game, player, 16)
			s.addLog(game, "Fue enviado a la Cárcel", "ALERT")
		} else if target == "-3" {
			player.Position = (player.Position - 3 + domain.BoardSize) % domain.BoardSize
			s.trackTileVisit(game, player, player.Position)
			s.addLog(game, "Retrocedió 3 espacios", "action")
		} else if target == "nearest_railroad" {
			// Find next railroad
			for i := 1; i < domain.BoardSize; i++ {
				pos := (player.Position + i) % domain.BoardSize
				if s.getLayoutType(pos) == "RAILROAD" {
					player.Position = pos
					s.trackTileVisit(game, player, pos)
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
					s.trackTileVisit(game, player, pos)
					s.addLog(game, "Avanzó a la utilidad más cercana", "action")
					break
				}
			}
		} else if target == "random_property" {
			// simplified: move next property
			player.Position = (player.Position + 1) % domain.BoardSize
			s.trackTileVisit(game, player, player.Position)
			s.addLog(game, "Avanzó (Aleatorio)", "action")
		} else if target == "last_property" {
			player.Position = domain.BoardSize - 1 // Last tile?
			s.trackTileVisit(game, player, player.Position)
			s.addLog(game, "Avanzó a la última casilla", "action")
		} else if target == "av-ossa" {
			// Need precise index lookup. For now, approximate or skip if logic not ready.
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

		// Update Board
		for i := range game.Board {
			if game.Board[i].PropertyID == game.ActiveAuction.PropertyID {
				game.Board[i].OwnerID = &winnerID
				break
			}
		}

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

	// 3. Update Board
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			game.Board[i].OwnerID = &userID
			break
		}
	}

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

	msg := "Intercambio realizado entre " + trade.OffererName + " y " + trade.TargetName
	game.LastAction = msg
	s.addLog(game, msg, "SUCCESS")
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

	actorName := "Jugador"
	for _, p := range game.Players {
		if p.UserID == userID {
			actorName = p.Name
			break
		}
	}
	msg := actorName + " rechazó/canceló el intercambio"
	game.LastAction = msg
	s.addLog(game, msg, "ALERT")
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
			s.initCreditProfile(p)
			s.calculateCreditScore(game, p)

			// Dynamic Credit Limit based on score
			creditLimit := s.getCreditLimit(p.Credit.Score)
			if p.Loan+req.Amount > creditLimit {
				s.addLog(game, p.Name+" no puede pedir más crédito (límite: $"+strconv.Itoa(creditLimit)+")", "ALERT")
				return
			}

			p.Balance += req.Amount
			p.Loan += req.Amount
			p.Credit.LoansTaken++
			p.Credit.LastLoanRound = p.Credit.CurrentRound

			interestRate := s.getInterestRate(p.Credit.Score)
			s.addLog(game, p.Name+" tomó préstamo de $"+strconv.Itoa(req.Amount)+" (Tasa: "+strconv.Itoa(interestRate)+"%)", "SUCCESS")
			break
		}
	}
	s.saveGame(game)
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
			s.initCreditProfile(p)

			if p.Loan < req.Amount {
				return // Cannot pay more than owed
			}
			if p.Balance < req.Amount {
				return // Insufficient funds
			}

			p.Balance -= req.Amount
			p.Loan -= req.Amount

			// Check if paid "on time" (within 3 rounds of taking loan)
			if p.Loan == 0 && (p.Credit.CurrentRound-p.Credit.LastLoanRound) <= 3 {
				p.Credit.LoansPaidOnTime++
				p.Credit.RoundsInDebt = 0
				s.addLog(game, p.Name+" pagó préstamo a tiempo. ¡Mejora su crédito!", "SUCCESS")
			} else {
				s.addLog(game, p.Name+" pagó $"+strconv.Itoa(req.Amount)+" de su deuda", "SUCCESS")
			}

			s.calculateCreditScore(game, p)
			break
		}
	}
	s.saveGame(game)
	s.broadcastGameState(game)
}

func (s *GameService) handleRollDice(game *domain.GameState, userID string) {
	// 0. Verify Game is Active
	if game.Status != domain.GameStatusActive {
		s.addLog(game, "El juego aún no ha comenzado", "ALERT")
		return
	}

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
		s.trackTileVisit(game, currentPlayer, newPos)

		// Check Pass Go
		var passGoMsg string
		if newPos < oldPos { // If new position is less than old position, it means player passed GO
			currentPlayer.Balance += 200
			passGoMsg = " ¡Pasó por la SALIDA! Cobra $200."

			// ===== CREDIT SYSTEM: Interest Accrual =====
			s.initCreditProfile(currentPlayer)
			currentPlayer.Credit.CurrentRound++

			if currentPlayer.Loan > 0 {
				currentPlayer.Credit.RoundsInDebt++
				rate := s.getInterestRate(currentPlayer.Credit.Score)

				// Add delinquency penalty after 3 rounds
				if currentPlayer.Credit.RoundsInDebt > 3 {
					rate += 10 // Extra 10% penalty
				}

				interest := (currentPlayer.Loan * rate) / 100

				// ===== AUTOMATIC AMORTIZATION: 15% of principal =====
				minimumPayment := currentPlayer.Loan * 15 / 100
				if minimumPayment < 50 {
					minimumPayment = 50 // Minimum $50 payment
				}
				if minimumPayment > currentPlayer.Loan {
					minimumPayment = currentPlayer.Loan
				}

				totalDeduction := interest + minimumPayment

				// Try to pay from balance (salary already added: +$200)
				if currentPlayer.Balance >= totalDeduction {
					currentPlayer.Balance -= totalDeduction
					currentPlayer.Loan -= minimumPayment
					passGoMsg += " Cuota: $" + strconv.Itoa(minimumPayment) + " + Int: $" + strconv.Itoa(interest) + "."

					// If fully paid, reward credit
					if currentPlayer.Loan <= 0 {
						currentPlayer.Loan = 0
						currentPlayer.Credit.LoansPaidOnTime++
						currentPlayer.Credit.RoundsInDebt = 0
						passGoMsg += " ¡Deuda saldada!"
					}
				} else {
					// Can't afford minimum payment - just pay interest + whatever possible
					currentPlayer.Balance -= interest
					currentPlayer.Loan += interest   // Interest still accrues
					currentPlayer.Credit.Score -= 25 // Penalty for missing minimum
					passGoMsg += " ⚠️ No alcanzó cuota mínima ($" + strconv.Itoa(minimumPayment) + "). Score -25."
				}

				s.calculateCreditScore(game, currentPlayer)
			}
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
		} else {
			// Special Tiles Logic
			switch newPos {
			case 5: // Income Tax
				currentPlayer.Balance -= 200
				desc += ". Pagó Impuesto sobre la Renta ($200)"
				s.addLog(game, currentPlayer.Name+" pagó impuesto sobre la renta ($200)", "ALERT")
			case 62: // Luxury Tax
				currentPlayer.Balance -= 100
				desc += ". Pagó Impuesto de Lujo ($100)"
				s.addLog(game, currentPlayer.Name+" pagó impuesto de lujo ($100)", "ALERT")
			case 48: // Go To Jail
				currentPlayer.Position = 16 // Jail
				currentPlayer.InJail = true
				s.trackTileVisit(game, currentPlayer, 16)
				desc += ". ¡Vaya a la Cárcel!"
				s.addLog(game, currentPlayer.Name+" fue enviado a la cárcel", "ALERT")
			}
		}

		game.LastAction = desc
		s.addLog(game, desc, "DICE")
	}

	// 5. Broadcast (Explicit End Turn required now)
	s.broadcastGameState(game)
}

func (s *GameService) handleDeclareBankruptcy(game *domain.GameState, userID string) {
	var player *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == userID {
			player = p
			break
		}
	}

	if player == nil || !player.IsActive {
		return
	}

	player.IsActive = false
	s.addLog(game, player.Name+" se ha declarado en BANCARROTA.", "ALERT")

	// Reset Assets
	for i := range game.Board {
		tile := &game.Board[i]
		if tile.OwnerID != nil && *tile.OwnerID == userID {
			tile.OwnerID = nil
			tile.IsMortgaged = false
			tile.BuildingCount = 0
			// Clear ownership map reference if strictly needed, but board is truth
			if tile.PropertyID != "" {
				delete(game.PropertyOwnership, tile.PropertyID)
			}
		}
	}

	// If it was their turn, pass it
	if game.CurrentTurnID == userID {
		s.handleEndTurn(game, userID)
	} else {
		s.broadcastGameState(game)
	}
}

func (s *GameService) handleEndTurn(game *domain.GameState, userID string) {
	if game.Status != domain.GameStatusActive || game.CurrentTurnID != userID {
		return
	}

	// Block end turn if there's pending rent to be collected from this player
	if game.PendingRent != nil && game.PendingRent.TargetID == userID {
		s.addLog(game, "No puedes terminar tu turno hasta que te cobren la renta.", "ALERT")
		s.broadcastGameState(game)
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

	// Find current index
	for i, uid := range currentOrder {
		if uid == userID {
			idx = i
			break
		}
	}

	if idx != -1 {
		// Find next ACTIVE player
		nextIdx := idx
		attempts := 0
		found := false

		for attempts < len(currentOrder) {
			nextIdx = (nextIdx + 1) % len(currentOrder)
			nextUID := currentOrder[nextIdx]

			// Check if active
			var pState *domain.PlayerState
			for _, p := range game.Players {
				if p.UserID == nextUID {
					pState = p
					break
				}
			}

			if pState != nil && pState.IsActive {
				game.CurrentTurnID = nextUID
				s.addLog(game, "El turno pasa a "+pState.Name, "INFO")
				found = true
				break
			}
			attempts++
		}

		if !found {
			// Solitare or everyone bankrupt?
			s.addLog(game, "No hay más jugadores activos.", "ALERT")
		}
	}

	// Clear Dice due to end turn
	game.Dice = [2]int{0, 0}

	// Clear temporary turn state
	game.DrawnCard = nil
	// NOTE: PendingRent is NOT cleared here - player cannot end turn until rent is collected

	s.broadcastGameState(game)
}

func (s *GameService) handleStartGame(game *domain.GameState, userID string, payload json.RawMessage) {
	// Only host can start
	if game.Status != domain.GameStatusWaiting {
		return
	}

	// Require minimum 2 players
	if len(game.Players) < 2 {
		s.addLog(game, "Se requieren al menos 2 jugadores para iniciar el juego", "ALERT")
		s.broadcastGameState(game)
		return
	}

	// Parse initial balance from payload (default 1500)
	var req struct {
		InitialBalance int `json:"initial_balance"`
	}
	if err := json.Unmarshal(payload, &req); err != nil || req.InitialBalance <= 0 {
		req.InitialBalance = 1500 // Default
	}

	// Apply initial balance to all players
	for _, p := range game.Players {
		p.Balance = req.InitialBalance
	}

	// Transition to ROLLING_ORDER phase
	game.Status = domain.GameStatusRollingOrder
	game.OrderRolls = make(map[string]int)
	game.LastAction = "¡Fase de tirada para orden de turnos!"
	s.addLog(game, "Cada jugador debe tirar los dados para determinar el orden de juego", "INFO")
	s.addLog(game, "Dinero inicial: $"+strconv.Itoa(req.InitialBalance)+" para cada jugador", "INFO")
	s.broadcastGameState(game)
}

func (s *GameService) handleRollOrder(game *domain.GameState, userID string) {
	// Verify game is in ROLLING_ORDER phase
	if game.Status != domain.GameStatusRollingOrder {
		return
	}

	// Check if player already rolled
	if _, hasRolled := game.OrderRolls[userID]; hasRolled {
		return
	}

	// Find player
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

	// Roll dice
	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	total := d1 + d2

	// Store roll
	game.OrderRolls[userID] = total
	s.addLog(game, player.Name+" sacó "+strconv.Itoa(total)+" ("+strconv.Itoa(d1)+"+"+strconv.Itoa(d2)+")", "DICE")

	// Check if all players have rolled
	if len(game.OrderRolls) == len(game.Players) {
		// Determine turn order
		type rollResult struct {
			userID string
			roll   int
			name   string
		}
		var results []rollResult
		for _, p := range game.Players {
			results = append(results, rollResult{
				userID: p.UserID,
				roll:   game.OrderRolls[p.UserID],
				name:   p.Name,
			})
		}

		// Sort by roll descending (highest first)
		sort.Slice(results, func(i, j int) bool {
			return results[i].roll > results[j].roll
		})

		// Set turn order
		game.TurnOrder = []string{}
		for _, r := range results {
			game.TurnOrder = append(game.TurnOrder, r.userID)
		}

		// Set first player
		game.CurrentTurnID = game.TurnOrder[0]

		// Transition to ACTIVE
		game.Status = domain.GameStatusActive
		game.OrderRolls = nil // Clear rolls

		s.addLog(game, "¡Orden de turnos establecido! Comienza "+results[0].name, "SUCCESS")
		game.LastAction = "El juego ha comenzado. Turno de " + results[0].name
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

	// AFTER broadcast, check if next action implies a bot move
	go s.checkBotTurn(game)
}

func (s *GameService) checkBotTurn(game *domain.GameState) {
	if s.botService == nil {
		return
	}

	// 1. Check for ROLLING_ORDER Phase
	s.mu.RLock()
	status := game.Status
	gameID := game.GameID
	s.mu.RUnlock()

	if status == domain.GameStatusRollingOrder {
		// Handle Bot Order Rolls
		// We do this asynchronously to not block
		// We find the first bot that hasn't rolled and roll for them.
		// The broadcast will trigger the next one.
		go func() {
			time.Sleep(1 * time.Second) // Delay for realism
			s.mu.Lock()
			defer s.mu.Unlock()

			// Re-fetch game safely
			g, ok := s.games[gameID]
			if !ok || g.Status != domain.GameStatusRollingOrder {
				return
			}

			// Find a bot that needs to roll
			for _, p := range g.Players {
				if p.IsBot {
					if _, hasRolled := g.OrderRolls[p.UserID]; !hasRolled {
						// Execute Roll Order
						// Note: handleRollOrder expects caller to hold lock?
						// Let's verify. handleRollOrder modifies state and calls broadcast.
						// broadcast spawns checkBotTurn.
						// It does NOT lock itself. Safe to call under lock.
						s.handleRollOrder(g, p.UserID)
						return // Only one at a time
					}
				}
			}
		}()
		return
	}

	// 1.5 Check for AUCTION Phase
	s.mu.RLock()
	hasActiveAuction := game.ActiveAuction != nil && game.ActiveAuction.IsActive
	s.mu.RUnlock()

	if hasActiveAuction {
		go func() {
			time.Sleep(2 * time.Second) // Delay for thinking

			s.mu.Lock()
			defer s.mu.Unlock()

			// Re-fetch game state safely inside the goroutine
			g, ok := s.games[gameID]
			if !ok || g.ActiveAuction == nil || !g.ActiveAuction.IsActive {
				return
			}

			// Find a bot that is NOT the current bidder and wants to bid
			var botToAct *domain.PlayerState
			for _, p := range g.Players {
				if p.IsBot && p.UserID != g.ActiveAuction.BidderID {
					// Check if this bot has already passed on this auction
					if _, passed := g.ActiveAuction.PassedPlayers[p.UserID]; !passed {
						botToAct = p
						break // Only one bot acts per cycle
					}
				}
			}

			if botToAct != nil {
				// We need to release the lock before calling executeBotTurn
				// because executeBotTurn will acquire its own lock.
				// However, since we are deferring Unlock, we can't manually unlock here.
				// The safest way is to pass a copy of the bot's state or just its ID,
				// and let executeBotTurn fetch the full player state under its own lock.
				// For now, executeBotTurn takes *domain.PlayerState, so we pass the pointer.
				// The `executeBotTurn` function itself re-fetches the game state and then
				// uses the passed `bot` pointer for `bot.Name`, `bot.UserID`, etc.
				// This is safe as long as `executeBotTurn` doesn't modify the `bot` object directly
				// without holding a lock on the game state.
				// The current `executeBotTurn` implementation does not modify the `bot` object directly.

				// Create a copy of the bot's state to avoid race conditions if the original
				// player state in `g.Players` is modified while `executeBotTurn` is running.
				botCopy := *botToAct
				s.mu.Unlock() // Manually unlock before calling executeBotTurn
				s.executeBotTurn(gameID, &botCopy)
				s.mu.Lock() // Re-acquire lock before defer unlocks it
			}
		}()
		return
	}

	// 1.6 Check for PENDING RENT that a bot creditor needs to collect
	s.mu.RLock()
	hasPendingRent := game.PendingRent != nil
	var creditorBot *domain.PlayerState
	if hasPendingRent {
		for _, p := range game.Players {
			if p.IsBot && p.UserID == game.PendingRent.CreditorID {
				creditorBot = p
				break
			}
		}
	}
	s.mu.RUnlock()

	if creditorBot != nil {
		go func() {
			time.Sleep(1 * time.Second) // Delay for realism

			s.mu.Lock()
			defer s.mu.Unlock()

			// Re-fetch game safely
			g, ok := s.games[gameID]
			if !ok || g.PendingRent == nil {
				return
			}

			// Double-check the creditor is still a bot and pending rent exists
			if g.PendingRent.CreditorID == creditorBot.UserID {
				log.Printf("Bot %s collecting rent from pending rent", creditorBot.Name)
				s.handleCollectRent(g, creditorBot.UserID)
			}
		}()
		return
	}

	// 1.7 Check for ACTIVE TRADE where target is a bot
	s.mu.RLock()
	hasActiveTrade := game.ActiveTrade != nil
	var targetBot *domain.PlayerState
	if hasActiveTrade {
		for _, p := range game.Players {
			if p.IsBot && p.UserID == game.ActiveTrade.TargetID {
				targetBot = p
				break
			}
		}
	}
	s.mu.RUnlock()

	if targetBot != nil {
		go func() {
			time.Sleep(2 * time.Second) // Delay for "thinking"

			s.mu.Lock()
			defer s.mu.Unlock()

			// Re-fetch game safely
			g, ok := s.games[gameID]
			if !ok || g.ActiveTrade == nil || g.ActiveTrade.TargetID != targetBot.UserID {
				return
			}

			trade := g.ActiveTrade

			// Simple decision: Accept if they're offering more value than requesting
			offerValue := trade.OfferCash
			requestValue := trade.RequestCash

			// Add property value estimates (rough: $200 per property)
			offerValue += len(trade.OfferPropeties) * 200
			requestValue += len(trade.RequestProperties) * 200

			// Bot personality affects decision
			profile := domain.GetBotProfile(targetBot.BotPersonalityID)
			agreeable := profile.NegotiationSkill > 0.5 || profile.RiskTolerance > 0.6

			// Accept if offer is better or bot is agreeable and it's close
			threshold := int(float64(requestValue) * 0.8)
			if offerValue > requestValue || (agreeable && offerValue >= threshold) {
				log.Printf("Bot %s accepting trade from %s", targetBot.Name, trade.OffererName)
				s.addBotThought(g, targetBot, fmt.Sprintf("✅ Acepto el trato de %s - me conviene", trade.OffererName))
				s.handleAcceptTrade(g, targetBot.UserID, nil)
			} else {
				log.Printf("Bot %s rejecting trade from %s", targetBot.Name, trade.OffererName)
				s.addBotThought(g, targetBot, fmt.Sprintf("❌ Rechazo el trato de %s - no me conviene", trade.OffererName))
				s.handleRejectTrade(g, targetBot.UserID, nil)
			}
		}()
		return
	}

	// 2. Normal Turn Logic
	s.mu.RLock()
	currentPlayerID := game.CurrentTurnID
	// ... existing logic ...
	var currentPlayer *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == currentPlayerID {
			currentPlayer = p
			break
		}
	}
	s.mu.RUnlock()

	if currentPlayer == nil || !currentPlayer.IsBot {
		return
	}

	// It is a bot's turn. Wait a bit to simulate thinking/animation
	time.Sleep(2 * time.Second)

	s.executeBotTurn(game.GameID, currentPlayer)
}

func (s *GameService) executeBotTurn(gameID string, bot *domain.PlayerState) {
	s.mu.Lock()
	game, ok := s.games[gameID]
	s.mu.Unlock() // Unlock to allow bot service to think without blocking?
	// actually bot service is just reading.
	// We need to pass a SNAPSHOT or lock inside.
	// BotService.GenerateDecision takes *GameState. Cleanest is to pass the pointer but be careful.
	// Since GenerateDecision is read-only on GameState, it should be fine if we RLock inside or just copy.
	// For MVP, we pass the game pointer.

	if !ok {
		return
	}

	action, err := s.botService.GenerateDecision(game, bot)
	if err != nil {
		log.Printf("Bot generation error: %v", err)
		// Fallback: End Turn or Roll Dice if stuck
		// To avoid infinite loops, just do nothing or force end?
		return
	}

	log.Printf("BOT ACTION [%s]: %s (%s)", bot.Name, action.Action, action.Reason)

	// Publish bot's thought to chat
	s.addBotThought(game, bot, fmt.Sprintf("🤖 %s: %s", action.Action, action.Reason))

	// Execute Action
	// We reuse existing handlers, but they expect JSON payloads.
	// We can refactor handlers to accept structs or just marshal payload.

	switch action.Action {
	case "ROLL_DICE":
		s.handleRollDice(game, bot.UserID)
	case "END_TURN":
		s.handleEndTurn(game, bot.UserID)
	case "BUY_PROPERTY":
		// Payload: { "property_id": "..." }
		// But in our current HandleBuyProperty logic, we usually infer property from position?
		// Let's check handleBuyProperty signature.
		// It takes payload used to confirm ID?
		// handleBuyProperty impl:
		// var req struct { PropertyID string } ...
		// if req.PropertyID != currentTile.PropertyID => error.
		// So we construct payload.
		currentTile := s.boardLayout[bot.Position] // ID
		// Actually boardLayout value is PropertyID or Type.
		// Better get tile object.
		// Let's just build payload conformant to API.
		// We found the property at bot position.
		payload := fmt.Sprintf(`{"property_id": "%s"}`, currentTile)
		s.handleBuyProperty(game, bot.UserID, json.RawMessage(payload))

	case "START_AUCTION":
		// payload: { "property_id": "..." }
		currentTile := s.boardLayout[bot.Position]
		payload := fmt.Sprintf(`{"property_id": "%s"}`, currentTile)
		s.handleStartAuction(game, bot.UserID, json.RawMessage(payload))

	case "DRAW_CARD":
		s.handleDrawCard(game, bot.UserID)

	case "COLLECT_RENT":
		s.handleCollectRent(game, bot.UserID)

	case "DECLARE_BANKRUPTCY":
		s.handleDeclareBankruptcy(game, bot.UserID)

	case "BID":
		// payload: { "amount": 123 }
		payload := fmt.Sprintf(`{"amount": %d}`, action.Amount)
		s.handleBid(game, bot.UserID, json.RawMessage(payload))

	case "PASS_AUCTION":
		s.handlePassAuction(game, bot.UserID)

	case "BUY_BUILDING":
		s.handleBuyBuilding(game, bot.UserID, action.Payload)

	case "SELL_BUILDING":
		// Payload should contain property_id
		s.handleSellBuilding(game, bot.UserID, action.Payload)

	case "MORTGAGE_PROPERTY":
		s.handleMortgageProperty(game, bot.UserID, action.Payload)
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

	// PARK and ATTRACTION: Use RentBase if set, minimum $25
	if tile.Type == "PARK" || tile.Type == "ATTRACTION" {
		rent := tile.RentBase
		if rent <= 0 {
			rent = 25 // Minimum rent for parks/attractions
		}
		return rent
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

func (s *GameService) trackTileVisit(game *domain.GameState, player *domain.PlayerState, pos int) {
	if game.TileVisits == nil {
		game.TileVisits = make(map[int]int)
	}
	game.TileVisits[pos]++

	if player.TileVisits == nil {
		player.TileVisits = make(map[int]int)
	}
	player.TileVisits[pos]++

	// Log movement for history tracking (Heatmap reconstruction)
	s.addLogWithMeta(game, "", "MOVEMENT", &pos, &player.UserID)
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

func (s *GameService) handleBuyBuilding(game *domain.GameState, userID string, payload json.RawMessage) {
	// 1. Verify Turn and Active Status
	if game.Status != domain.GameStatusActive || game.CurrentTurnID != userID {
		s.addLog(game, "No es tu turno.", "ALERT")
		return
	}

	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// 2. Verify Property Ownership
	ownerID, isOwned := game.PropertyOwnership[req.PropertyID]
	if !isOwned || ownerID != userID {
		s.addLog(game, "No eres dueño de esta propiedad.", "ALERT")
		return
	}

	// Find the tile logic index
	var tileIndex = -1
	var targetTile *domain.Tile
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			tileIndex = i
			targetTile = &game.Board[i]
			break
		}
	}

	if targetTile == nil || targetTile.GroupIdentifier == "" {
		s.addLog(game, "Esta propiedad no permite construcción.", "ALERT")
		return
	}

	// 3. Verify Monopoly (All properties of same group owned by user)
	// Also gather building counts for "Even Build" rule
	groupTiles := []*domain.Tile{}
	minBuildings := 5 // Start high
	maxBuildings := 0

	for i := range game.Board {
		t := &game.Board[i]
		if t.GroupIdentifier == targetTile.GroupIdentifier {
			// Check ownership
			oid, ok := game.PropertyOwnership[t.PropertyID]
			if !ok || oid != userID {
				s.addLog(game, "Debes poseer todo el grupo de color ("+targetTile.GroupIdentifier+") para construir.", "ALERT")
				return
			}
			// Check if mortgaged? (Assuming rules say no building if any in group is mortgaged is common, but let's stick to basic first.
			// Standard rules: "You cannot build on any property of that color group if any one of them is mortgaged."
			if t.IsMortgaged {
				s.addLog(game, "No puedes construir si hay propiedades hipotecadas en el grupo.", "ALERT")
				return
			}

			groupTiles = append(groupTiles, t)
			if t.BuildingCount < minBuildings {
				minBuildings = t.BuildingCount
			}
			if t.BuildingCount > maxBuildings {
				maxBuildings = t.BuildingCount
			}
		}
	}

	// 4. Validate Max Limit
	if targetTile.BuildingCount >= 5 {
		s.addLog(game, "Ya has alcanzado el límite de construcción (Hotel).", "ALERT")
		return
	}

	// 5. Validate "Even Build" Rule
	// You must build evenly. You cannot build a 2nd house on a property until ALL have 1.
	// This means targetTile.BuildingCount must be == minBuildings.
	// Example: [1, 1, 0]. min=0. Can I build on the 1s? No. Must build on the 0.
	// Example: [1, 1, 1]. min=1. Can build on any (becoming 2).
	if targetTile.BuildingCount > minBuildings {
		s.addLog(game, "Debes construir uniformemente en el grupo.", "ALERT")
		return
	}

	// 6. Check Funds
	cost := targetTile.HouseCost
	if targetTile.BuildingCount == 4 {
		cost = targetTile.HotelCost // Usually same, but good to be explicit
	}

	player := s.getPlayer(game, userID)
	if player.Balance < cost {
		s.addLog(game, "Fondos insuficientes. Costo: $"+strconv.Itoa(cost), "ALERT")
		return
	}

	// 7. Execute Purchase
	player.Balance -= cost
	targetTile.BuildingCount++

	// Log
	levelName := "Casa"
	if targetTile.BuildingCount == 5 {
		levelName = "Hotel"
	} else if targetTile.BuildingCount > 1 {
		levelName = strconv.Itoa(targetTile.BuildingCount) + " Casas"
	}

	s.addLogWithMeta(game, player.Name+" compró "+levelName+" en "+targetTile.Name, "SUCCESS", &tileIndex, &userID)
	s.saveGame(game) // Persist state
	s.broadcastGameState(game)
}

func (s *GameService) handleSellBuilding(game *domain.GameState, userID string, payload json.RawMessage) {
	// 1. Verify Turn and Active Status
	if game.Status != domain.GameStatusActive || game.CurrentTurnID != userID {
		s.addLog(game, "No es tu turno.", "ALERT")
		return
	}

	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	// 2. Verify Property Ownership
	ownerID, isOwned := game.PropertyOwnership[req.PropertyID]
	if !isOwned || ownerID != userID {
		s.addLog(game, "No eres dueño de esta propiedad.", "ALERT")
		return
	}

	// Find the tile logic index
	var tileIndex = -1
	var targetTile *domain.Tile
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			tileIndex = i
			targetTile = &game.Board[i]
			break
		}
	}

	if targetTile == nil || targetTile.BuildingCount == 0 {
		s.addLog(game, "No hay construcciones para vender.", "ALERT")
		return
	}

	// 3. Verify Even Sell (Reverse of Even Build)
	// You must sell evenly. (Max - Min <= 1).
	// To sell a house, this property must have the MAX count in the group.
	// Example: [4, 4, 3]. Can I sell on the 3? No, violates even build. Must sell on 4s.

	currentBuildings := targetTile.BuildingCount
	maxBuildings := 0

	// Scan group
	for i := range game.Board {
		t := &game.Board[i]
		if t.GroupIdentifier == targetTile.GroupIdentifier {
			// All must be owned by same user (still check for robustness)
			if t.BuildingCount > maxBuildings {
				maxBuildings = t.BuildingCount
			}
		}
	}

	if currentBuildings < maxBuildings {
		s.addLog(game, "Debes vender edificios de forma uniforme.", "ALERT")
		return
	}

	// 4. Calculate Refund (Half Price)
	refund := targetTile.HouseCost / 2
	if targetTile.BuildingCount == 5 {
		refund = targetTile.HotelCost / 2
	}

	// 5. Execute Sale
	player := s.getPlayer(game, userID)
	player.Balance += refund
	targetTile.BuildingCount--

	// Log
	remaining := targetTile.BuildingCount
	msg := player.Name + " vendió un edificio en " + targetTile.Name + ". Ahora tiene "
	if remaining == 5 {
		msg += "un Hotel." // Shouldn't happen if selling DOWN from hotel
	} else if remaining == 0 {
		msg += "0 casas."
	} else {
		msg += strconv.Itoa(remaining) + " casas."
	}

	s.addLogWithMeta(game, msg, "SUCCESS", &tileIndex, &userID)
	s.saveGame(game) // Persist state
	s.broadcastGameState(game)
}

func (s *GameService) getPlayer(game *domain.GameState, userID string) *domain.PlayerState {
	for _, p := range game.Players {
		if p.UserID == userID {
			return p
		}
	}
	return nil
}

// handleMortgageProperty allows a player to mortgage a property they own
// Rules: Cannot mortgage if property has buildings, cannot mortgage if any property in group has buildings
func (s *GameService) handleMortgageProperty(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	player := s.getPlayer(game, userID)
	if player == nil {
		return
	}

	// Verify ownership
	owner, owned := game.PropertyOwnership[req.PropertyID]
	if !owned || owner != userID {
		return
	}

	// Find tile
	var tile *domain.Tile
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			tile = &game.Board[i]
			break
		}
	}
	if tile == nil {
		return
	}

	// Check if already mortgaged
	if tile.IsMortgaged {
		return
	}

	// Rule: Cannot mortgage if this property has buildings
	if tile.BuildingCount > 0 {
		s.addLog(game, "No puedes hipotecar "+tile.Name+" mientras tenga edificios", "ALERT")
		s.broadcastGameState(game)
		return
	}

	// Rule: Cannot mortgage if any property in the same group has buildings
	if tile.GroupIdentifier != "" {
		for _, t := range game.Board {
			ownerID, isOwned := game.PropertyOwnership[t.PropertyID]
			if isOwned && ownerID == userID && t.GroupIdentifier == tile.GroupIdentifier && t.BuildingCount > 0 {
				s.addLog(game, "Debes vender las casas de "+t.Name+" antes de hipotecar "+tile.Name, "ALERT")
				s.broadcastGameState(game)
				return
			}
		}
	}

	// Execute mortgage
	tile.IsMortgaged = true
	mortgageValue := tile.MortgageValue
	if mortgageValue == 0 {
		mortgageValue = tile.Price / 2 // Default to 50% if not set
	}
	player.Balance += mortgageValue

	s.addLog(game, player.Name+" hipotecó "+tile.Name+" por $"+strconv.Itoa(mortgageValue), "ACTION")
	s.saveGame(game)
	s.broadcastGameState(game)
}

// handleUnmortgageProperty allows a player to pay off the mortgage and restore the property
// Rules: Must pay mortgage value + 10% interest
func (s *GameService) handleUnmortgageProperty(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	player := s.getPlayer(game, userID)
	if player == nil {
		return
	}

	// Verify ownership
	owner, owned := game.PropertyOwnership[req.PropertyID]
	if !owned || owner != userID {
		return
	}

	// Find tile
	var tile *domain.Tile
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			tile = &game.Board[i]
			break
		}
	}
	if tile == nil {
		return
	}

	// Check if actually mortgaged
	if !tile.IsMortgaged {
		return
	}

	// Calculate unmortgage cost (mortgage value + 10% interest)
	unmortgageCost := tile.UnmortgageValue
	if unmortgageCost == 0 {
		mortgageValue := tile.MortgageValue
		if mortgageValue == 0 {
			mortgageValue = tile.Price / 2
		}
		unmortgageCost = mortgageValue + (mortgageValue / 10) // +10%
	}

	// Check if player has enough money
	if player.Balance < unmortgageCost {
		s.addLog(game, "Fondos insuficientes para deshipotecar "+tile.Name+" ($"+strconv.Itoa(unmortgageCost)+" requeridos)", "ALERT")
		s.broadcastGameState(game)
		return
	}

	// Execute unmortgage
	tile.IsMortgaged = false
	player.Balance -= unmortgageCost

	s.addLog(game, player.Name+" deshipotecó "+tile.Name+" por $"+strconv.Itoa(unmortgageCost), "SUCCESS")
	s.saveGame(game)
	s.broadcastGameState(game)
}

// handleSellProperty allows a player to sell a property back to the bank
// Rules: Cannot sell if property has buildings, receives 50% of purchase price
func (s *GameService) handleSellProperty(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		PropertyID string `json:"property_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	player := s.getPlayer(game, userID)
	if player == nil {
		return
	}

	// Verify ownership
	owner, owned := game.PropertyOwnership[req.PropertyID]
	if !owned || owner != userID {
		return
	}

	// Find tile
	var tile *domain.Tile
	for i := range game.Board {
		if game.Board[i].PropertyID == req.PropertyID {
			tile = &game.Board[i]
			break
		}
	}
	if tile == nil {
		return
	}

	// Rule: Cannot sell if this property has buildings
	if tile.BuildingCount > 0 {
		s.addLog(game, "No puedes vender "+tile.Name+" mientras tenga edificios", "ALERT")
		s.broadcastGameState(game)
		return
	}

	// Rule: Cannot sell if any property in the same group has buildings
	if tile.GroupIdentifier != "" {
		for _, t := range game.Board {
			ownerID, isOwned := game.PropertyOwnership[t.PropertyID]
			if isOwned && ownerID == userID && t.GroupIdentifier == tile.GroupIdentifier && t.BuildingCount > 0 {
				s.addLog(game, "Debes vender las casas de "+t.Name+" antes de vender "+tile.Name, "ALERT")
				s.broadcastGameState(game)
				return
			}
		}
	}

	// Calculate sale price: 50% of property price
	salePrice := tile.Price / 2

	// If mortgaged, subtract remaining mortgage debt (player receives less)
	if tile.IsMortgaged {
		mortgageValue := tile.MortgageValue
		if mortgageValue == 0 {
			mortgageValue = tile.Price / 2
		}
		// Sale price = 50% - 0 (already got mortgage money), so just clear the mortgage
		// Actually, when selling mortgaged property:
		// - Player already got mortgage value when mortgaging
		// - Now selling for 50% of price would be double-dipping
		// Correct rule: If mortgaged, sale price = 50% price - mortgage value (could be 0 or negative)
		salePrice = salePrice - mortgageValue
		if salePrice < 0 {
			salePrice = 0
		}
	}

	// Execute sale
	player.Balance += salePrice
	delete(game.PropertyOwnership, req.PropertyID)
	tile.IsMortgaged = false // Clear mortgage status
	tile.OwnerID = nil

	s.addLog(game, player.Name+" vendió "+tile.Name+" al banco por $"+strconv.Itoa(salePrice), "ACTION")
	s.saveGame(game)
	s.broadcastGameState(game)
}

// handleSendChat processes chat messages from players
func (s *GameService) handleSendChat(game *domain.GameState, userID string, payload json.RawMessage) {
	var req struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(payload, &req); err != nil || req.Message == "" {
		return
	}

	// Find player
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

	// Create chat message
	msg := domain.ChatMessage{
		ID:         fmt.Sprintf("%d", time.Now().UnixNano()),
		PlayerID:   userID,
		PlayerName: player.Name,
		Message:    req.Message,
		Type:       "PLAYER",
		Timestamp:  time.Now().Unix(),
	}

	// Keep only last 50 messages
	game.ChatMessages = append(game.ChatMessages, msg)
	if len(game.ChatMessages) > 50 {
		game.ChatMessages = game.ChatMessages[len(game.ChatMessages)-50:]
	}

	s.broadcastGameState(game)

	// Check if any bot was mentioned with @ and respond
	gameID := game.GameID
	senderName := player.Name
	now := time.Now().Unix()
	for _, p := range game.Players {
		if !p.IsBot {
			continue
		}
		isMentioned := strings.Contains(req.Message, "@"+p.Name)
		isRepliedTo := strings.Contains(req.Message, "[Respuesta a "+p.Name+"]")

		if isMentioned || isRepliedTo {
			// Check cooldown: bot can only respond every 30 seconds
			if now-p.LastBotChatTime < 30 {
				continue // Skip this bot, still in cooldown
			}
			bot := p
			bot.LastBotChatTime = now // Update cooldown

			go func() {
				time.Sleep(2 * time.Second) // Delay for "thinking"

				// Generate response using LLM with personality (outside lock)
				var response string
				if s.botService != nil {
					s.mu.RLock()
					g, ok := s.games[gameID]
					s.mu.RUnlock()
					if ok {
						resp, err := s.botService.GenerateChatResponse(g, bot, req.Message, senderName)
						if err == nil {
							response = resp
						}
					}
				}

				// Fallback if LLM failed
				if response == "" {
					responses := []string{
						"🎲 ¡Interesante! Pero ahora estoy concentrado en ganar...",
						"💰 Mmm, lo pensaré... ¿tienes algo que ofrecer?",
						"🏠 ¡Hablemos de propiedades! ¿Qué tienes en mente?",
					}
					response = responses[time.Now().UnixNano()%int64(len(responses))]
				}

				s.mu.Lock()
				defer s.mu.Unlock()

				g, ok := s.games[gameID]
				if !ok {
					return
				}

				s.addBotThought(g, bot, response)
				s.broadcastGameState(g)
			}()
		}
	}
}

// addBotThought adds a bot's reasoning to the chat for other players to see
func (s *GameService) addBotThought(game *domain.GameState, bot *domain.PlayerState, reason string) {
	msg := domain.ChatMessage{
		ID:         fmt.Sprintf("%d", time.Now().UnixNano()),
		PlayerID:   bot.UserID,
		PlayerName: bot.Name,
		Message:    reason,
		Type:       "BOT_THOUGHT",
		Timestamp:  time.Now().Unix(),
	}
	game.ChatMessages = append(game.ChatMessages, msg)
	if len(game.ChatMessages) > 50 {
		game.ChatMessages = game.ChatMessages[len(game.ChatMessages)-50:]
	}
}
