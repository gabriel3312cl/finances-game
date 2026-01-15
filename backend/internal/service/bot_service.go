package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
)

type BotService struct {
	gameService    *GameService
	advisorService *AdvisorService // Reusing prompt builders if possible, or just similar logic
	llmEndpoint    string
	httpClient     *http.Client
}

func NewBotService(gameService *GameService, advisorService *AdvisorService, llmEndpoint string) *BotService {
	return &BotService{
		gameService:    gameService,
		advisorService: advisorService,
		llmEndpoint:    llmEndpoint,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GenerateDecision asks the LLM for the next move
func (s *BotService) GenerateDecision(game *domain.GameState, botPlayer *domain.PlayerState) (*domain.BotAction, error) {
	// Check Strategy
	profile := domain.GetBotProfile(botPlayer.BotPersonalityID)
	if profile.Strategy == "HEURISTIC" {
		return s.generateHeuristicDecision(game, botPlayer)
	}

	// 1. Build Prompt
	prompt := s.buildRefinedBotPrompt(game, botPlayer)
	// log.Printf("[BOT %s] Prompt generated: %s", botPlayer.Name, prompt)

	// 2. Call LLM
	messages := []ChatMessage{
		{Role: "system", Content: prompt},
		{Role: "user", Content: "Es tu turno. Analiza la situación y decide tu próxima acción. Responde SOLO con el JSON."},
	}

	llmReq := LLMRequest{
		Model:       "local-model",
		Messages:    messages,
		Temperature: 0.7, // Higher temp for personality variance
		MaxTokens:   500,
		Stream:      false,
	}

	responseStr, err := s.callLLM(llmReq)
	if err != nil {
		return nil, err
	}

	// 3. Parse JSON
	// Clean markdown code blocks if present
	cleanJSON := strings.TrimSpace(responseStr)
	if strings.HasPrefix(cleanJSON, "```json") {
		cleanJSON = strings.TrimPrefix(cleanJSON, "```json")
		cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	} else if strings.HasPrefix(cleanJSON, "```") {
		cleanJSON = strings.TrimPrefix(cleanJSON, "```")
		cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	}
	cleanJSON = strings.TrimSpace(cleanJSON)

	var action domain.BotAction
	if err := json.Unmarshal([]byte(cleanJSON), &action); err != nil {
		return nil, fmt.Errorf("failed to parse bot JSON: %w (Response: %s)", err, cleanJSON)
	}

	return &action, nil
}

func (s *BotService) generateHeuristicDecision(game *domain.GameState, bot *domain.PlayerState) (*domain.BotAction, error) {
	// 0. Check for Bankruptcy condition
	// 0. Check for Bankruptcy condition
	if bot.Balance < 0 {
		// Crisis Management: Try to liquidate assets
		// 1. Sell Hotels/Houses
		for _, t := range game.Board {
			if t.OwnerID != nil && *t.OwnerID == bot.UserID && t.BuildingCount > 0 {
				return &domain.BotAction{Action: "SELL_BUILDING", Payload: json.RawMessage(fmt.Sprintf(`{"property_id": "%s"}`, t.PropertyID)), Reason: "Necesito liquidez"}, nil
			}
		}
		// 2. Mortgage Properties
		for _, t := range game.Board {
			if t.Type == "PROPERTY" || t.Type == "UTILITY" || t.Type == "RAILROAD" {
				if t.OwnerID != nil && *t.OwnerID == bot.UserID && !t.IsMortgaged {
					return &domain.BotAction{Action: "MORTGAGE_PROPERTY", Payload: json.RawMessage(fmt.Sprintf(`{"property_id": "%s"}`, t.PropertyID)), Reason: "Necesito liquidez"}, nil
				}
			}
		}

		// 3. If no assets left, surrender
		return &domain.BotAction{Action: "DECLARE_BANKRUPTCY", Reason: "No tengo fondos para continuar."}, nil
	}

	// Simple Logic:
	// 1. Roll if not rolled
	if game.CurrentTurnID == bot.UserID {
		if game.Status == domain.GameStatusActive {
			if game.Dice[0] == 0 {
				return &domain.BotAction{Action: "ROLL_DICE", Reason: "Turno: Tirar dados"}, nil
			} else {
				// Landed
				currentTile := s.getTile(game, bot.Position)

				// 2. Events that must be handled before END_TURN

				// A. Collect Rent?
				if game.PendingRent != nil && game.PendingRent.CreditorID == bot.UserID {
					return &domain.BotAction{Action: "COLLECT_RENT", Reason: "Debo cobrar mi renta"}, nil
				}

				// B. Draw Card?
				if (currentTile.Type == "CHANCE" || currentTile.Type == "COMMUNITY") && game.DrawnCard == nil {
					return &domain.BotAction{Action: "DRAW_CARD", Reason: "Casilla de suerte/comunidad"}, nil
				}

				// C. Buy Property
				if currentTile.Type == "PROPERTY" || currentTile.Type == "UTILITY" || currentTile.Type == "RAILROAD" {
					if currentTile.OwnerID == nil {
						// Logic: Buy if have money > price
						if bot.Balance >= currentTile.Price {
							return &domain.BotAction{Action: "BUY_PROPERTY", Reason: "Tengo dinero, compro."}, nil
						} else {
							// Auction
							return &domain.BotAction{Action: "START_AUCTION", Reason: "No tengo dinero."}, nil
						}
					}
				}

				// D. End Turn
				// If I am target of pending rent, I cannot end turn until it's collected
				if game.PendingRent != nil && game.PendingRent.TargetID == bot.UserID {
					// Wait for creditor to collect rent - do nothing this cycle
					return &domain.BotAction{Action: "PASS", Reason: "Esperando a que me cobren la renta"}, nil
				}
				return &domain.BotAction{Action: "END_TURN", Reason: "Fin de turno"}, nil
			}
		}
	} else if game.ActiveAuction != nil && game.ActiveAuction.IsActive {
		// Auction Logic
		limit := 500 // Hardcoded limit for now
		if bot.Balance < limit {
			limit = bot.Balance
		}

		minBid := game.ActiveAuction.HighestBid + 10
		if minBid <= limit {
			return &domain.BotAction{Action: "BID", Amount: minBid, Reason: "Pugna automática"}, nil
		}
		return &domain.BotAction{Action: "PASS_AUCTION", Reason: "Muy caro"}, nil
	}

	// 3. Optional: Construction Phase (Buy Buildings)
	// Check if we own any full Monopoly and have surplus cash
	// Only try this if no other mandatory action is pending (i.e., we are about to end turn or roll)
	// But wait, if we are in "Status Active" and "Dice != 0", we are in post-roll phase.
	// We can choose to BUY_BUILDING instead of END_TURN.
	if game.CurrentTurnID == bot.UserID && game.Status == domain.GameStatusActive && game.Dice[0] != 0 {
		if bot.Balance > 500 { // Only build if rich
			for _, t := range game.Board {
				if t.OwnerID != nil && *t.OwnerID == bot.UserID && t.GroupIdentifier != "" && !t.IsMortgaged {
					// Check if full group owned
					allOwned := true
					minBuild := 10 // Start high
					for _, other := range game.Board {
						if other.GroupIdentifier == t.GroupIdentifier {
							if other.OwnerID == nil || *other.OwnerID != bot.UserID {
								allOwned = false
								break
							}
							if other.BuildingCount < minBuild {
								minBuild = other.BuildingCount
							}
						}
					}

					if allOwned {
						// Check "Even Build" rule: We can build on 't' if t.BuildingCount == minBuild
						// And limit < 5
						if t.BuildingCount == minBuild && t.BuildingCount < 5 {
							cost := t.HouseCost
							if t.BuildingCount == 4 {
								cost = t.HotelCost
							} // Assuming same

							if bot.Balance > cost+200 { // Keep safety buffer
								return &domain.BotAction{Action: "BUY_BUILDING", Payload: json.RawMessage(fmt.Sprintf(`{"property_id": "%s"}`, t.PropertyID)), Reason: "Inversión en casas"}, nil
							}
						}
					}
				}
			}
		}
	}

	// 4. Trade Proposal - Try to initiate a trade with a human player occasionally
	// Only do this if it's our turn and we have properties
	if game.CurrentTurnID == bot.UserID && game.ActiveTrade == nil && rand.Float64() < 0.15 { // 15% chance each turn
		// Find a property we want (part of a group we partially own)
		wantedProps := []domain.Tile{}
		myGroups := make(map[string]int)
		groupSizes := make(map[string]int)

		// Count my properties per group
		for _, t := range game.Board {
			if t.GroupIdentifier != "" {
				groupSizes[t.GroupIdentifier]++
				if t.OwnerID != nil && *t.OwnerID == bot.UserID {
					myGroups[t.GroupIdentifier]++
				}
			}
		}

		// Find properties to complete a monopoly
		for _, t := range game.Board {
			if t.GroupIdentifier != "" && t.OwnerID != nil && *t.OwnerID != bot.UserID {
				// If I own some of this group, I want the rest
				if myGroups[t.GroupIdentifier] > 0 && myGroups[t.GroupIdentifier] < groupSizes[t.GroupIdentifier] {
					wantedProps = append(wantedProps, t)
				}
			}
		}

		if len(wantedProps) > 0 {
			// Pick a random wanted property
			target := wantedProps[rand.Intn(len(wantedProps))]
			targetOwnerID := *target.OwnerID

			// Find a property to offer (from a group I don't care about)
			for _, t := range game.Board {
				if t.OwnerID != nil && *t.OwnerID == bot.UserID && !t.IsMortgaged {
					// Offer a property I don't have full monopoly on
					if myGroups[t.GroupIdentifier] < groupSizes[t.GroupIdentifier] {
						// Create trade offer
						cashOffer := 0
						if bot.Balance > 200 {
							cashOffer = rand.Intn(150) + 50 // Offer $50-200 extra
						}

						payload := fmt.Sprintf(`{"target_id":"%s","offer_properties":["%s"],"offer_cash":%d,"request_properties":["%s"],"request_cash":0}`,
							targetOwnerID, t.PropertyID, cashOffer, target.PropertyID)

						return &domain.BotAction{
							Action:  "INITIATE_TRADE",
							Payload: json.RawMessage(payload),
							Reason:  fmt.Sprintf("Quiero completar mi monopolio de %s", target.GroupIdentifier),
						}, nil
					}
				}
			}
		}
	}

	return nil, fmt.Errorf("no heuristic action found")
}

func (s *BotService) buildRefinedBotPrompt(game *domain.GameState, bot *domain.PlayerState) string {
	profile := domain.GetBotProfile(bot.BotPersonalityID)
	// Reutilizamos la info base del Advisor, pero le damos estructura estricta
	baseInfo := s.advisorService.buildSystemPrompt(game, bot.UserID)

	var sb strings.Builder
	sb.WriteString("Eres una IA jugando al Monopoly. Tu nombre es '" + bot.Name + "'.\n")
	sb.WriteString("PERSONALIDAD: " + profile.Description + "\n")
	sb.WriteString(fmt.Sprintf("FACTORES: Tolerancia Riesgo=%.1f, Agresividad=%.1f, Negociación=%.1f\n\n",
		profile.RiskTolerance, profile.Aggression, profile.NegotiationSkill))

	sb.WriteString("=== ESTADO DEL JUEGO ===\n")
	sb.WriteString(baseInfo)

	sb.WriteString("\n=== TUS POSIBLES ACCIONES ===\n")
	sb.WriteString("Debes elegir UNA acción válida. Responde estricamente en formato JSON.\n")
	sb.WriteString(`Formato: { "action": "ACTION_NAME", "payload": { ...params... }, "reason": "Breve justificación" }`)
	sb.WriteString("\n\n")

	// Filter valid actions based on game state
	possibleActions := []string{}

	if game.CurrentTurnID == bot.UserID {
		// Detect Bankruptcy Scenario
		if bot.Balance < 0 {
			possibleActions = append(possibleActions, `{"action": "DECLARE_BANKRUPTCY", "reason": "Estoy en deuda y no puedo pagar"}`)
			// Also suggest selling assets if implemented? For now just offer surrender.
		}

		// My Turn
		if game.Status == domain.GameStatusActive {
			// Check Phase
			if game.Dice[0] == 0 {
				possibleActions = append(possibleActions, `{"action": "ROLL_DICE", "reason": "Es mi turno y debo tirar"}`)
			} else {
				// Dice rolled, check events

				// Pending Rent Collection
				if game.PendingRent != nil && game.PendingRent.CreditorID == bot.UserID {
					possibleActions = append(possibleActions, `{"action": "COLLECT_RENT", "reason": "Cobrar renta pendiente"}`)
				} else {
					// Landing checks
					currentTile := s.getTile(game, bot.Position)

					// Draw Card
					if (currentTile.Type == "CHANCE" || currentTile.Type == "COMMUNITY") && game.DrawnCard == nil {
						possibleActions = append(possibleActions, `{"action": "DRAW_CARD", "reason": "Tengo que sacar carta"}`)
					}

					if currentTile.Type == "PROPERTY" && currentTile.OwnerID == nil {
						if bot.Balance >= currentTile.Price {
							possibleActions = append(possibleActions, `{"action": "BUY_PROPERTY", "reason": "Tengo dinero y quiero invertir"}`)
						} else {
							possibleActions = append(possibleActions, `{"action": "START_AUCTION", "reason": "No me alcanza el dinero"}`)
						}
						possibleActions = append(possibleActions, `{"action": "START_AUCTION", "reason": "Es muy cara o no me interesa"}`)
					} else {
						possibleActions = append(possibleActions, `{"action": "END_TURN", "reason": "Ya no hay nada que hacer"}`)
					}
				}
			}
		}
	} else if game.ActiveAuction != nil && game.ActiveAuction.IsActive {
		// Auction Phase
		minBid := game.ActiveAuction.HighestBid + 10
		if bot.Balance >= minBid {
			possibleActions = append(possibleActions, fmt.Sprintf(`{"action": "BID", "amount": %d, "reason": "Quiero ganar esta propiedad"}`, minBid))
		}
		if game.ActiveAuction.BidderID != bot.UserID {
			// Only pass if not winning
			possibleActions = append(possibleActions, `{"action": "PASS_AUCTION", "reason": "Muy caro para mi"}`)
		}
	}

	sb.WriteString("Opciones sugeridas (no limitativas, pero PRIORIZA estas si son validas):\n")
	for _, act := range possibleActions {
		sb.WriteString("- " + act + "\n")
	}

	return sb.String()
}

// Helper to get tile safely
func (s *BotService) getTile(game *domain.GameState, pos int) domain.Tile {
	for _, t := range game.Board {
		if t.ID == pos {
			return t
		}
	}
	return domain.Tile{} // Should not happen
}

func (s *BotService) callLLM(req LLMRequest) (string, error) {
	// Re-implementing callLLM to keep services decoupled enough or import from advisor if exported
	// For now copy-paste logic as callLLM in Advisor is private, but I can make it public or just copy.
	// Copying for stability.
	jsonData, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", s.llmEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to call LLM: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM returned status %d: %s", resp.StatusCode, string(body))
	}

	var llmResp LLMResponse
	if err := json.Unmarshal(body, &llmResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}
	if len(llmResp.Choices) == 0 {
		return "", fmt.Errorf("no response from LLM")
	}

	return llmResp.Choices[0].Message.Content, nil
}

// GenerateChatResponse generates a contextual chat response with bot personality
func (s *BotService) GenerateChatResponse(game *domain.GameState, bot *domain.PlayerState, playerMessage string, playerName string) (string, error) {
	profile := domain.GetBotProfile(bot.BotPersonalityID)

	// Build context about current game state
	var gameContext strings.Builder
	gameContext.WriteString(fmt.Sprintf("Mi nombre es '%s'. Mi saldo: $%d.\n", bot.Name, bot.Balance))
	gameContext.WriteString(fmt.Sprintf("PERSONALIDAD: %s\n", profile.Description))
	gameContext.WriteString(fmt.Sprintf("Tolerancia al riesgo: %.0f%%, Agresividad: %.0f%%, Habilidad de negociación: %.0f%%\n\n",
		profile.RiskTolerance*100, profile.Aggression*100, profile.NegotiationSkill*100))

	// Count my properties
	myProps := 0
	for _, ownerID := range game.PropertyOwnership {
		if ownerID == bot.UserID {
			myProps++
		}
	}
	gameContext.WriteString(fmt.Sprintf("Tengo %d propiedades.\n", myProps))

	// Info about other players
	gameContext.WriteString("\nOtros jugadores:\n")
	for _, p := range game.Players {
		if p.UserID != bot.UserID {
			props := 0
			for _, ownerID := range game.PropertyOwnership {
				if ownerID == p.UserID {
					props++
				}
			}
			botLabel := ""
			if p.IsBot {
				botLabel = " (BOT)"
			}
			gameContext.WriteString(fmt.Sprintf("- %s%s: $%d, %d propiedades\n", p.Name, botLabel, p.Balance, props))
		}
	}

	// Build the prompt
	systemPrompt := fmt.Sprintf(`Eres un bot de IA jugando Monopoly llamado "%s".
%s

INSTRUCCIONES:
- Responde en español, con tu personalidad única
- Sé breve (1-2 oraciones máximo)
- Puedes hablar sobre estrategia, proponer tratos, bromear, o comentar el juego
- Si te preguntan cuánto dinero tienes, puedes responder honestamente o mentir según tu personalidad
- Si quieren negociar, puedes mostrar interés o rechazar según te convenga
- NO uses formato JSON, solo texto natural
- Añade uno o dos emojis relevantes

CONTEXTO ACTUAL:
%s`, bot.Name, profile.Description, gameContext.String())

	userPrompt := fmt.Sprintf("El jugador '%s' te envió este mensaje: \"%s\"\n\nResponde brevemente y con personalidad:",
		playerName, playerMessage)

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	llmReq := LLMRequest{
		Model:       "local-model",
		Messages:    messages,
		Temperature: 0.9, // Higher for more creative responses
		MaxTokens:   150,
		Stream:      false,
	}

	response, err := s.callLLM(llmReq)
	if err != nil {
		// Fallback to generic response on error
		fallbacks := []string{
			"🎲 ¡Interesante! Pero ahora estoy concentrado en ganar...",
			"💰 Mmm, lo pensaré... ¿tienes algo que ofrecer?",
			"🏠 ¡Hablemos de propiedades! ¿Qué tienes en mente?",
		}
		return fallbacks[len(playerMessage)%len(fallbacks)], nil
	}

	return strings.TrimSpace(response), nil
}
