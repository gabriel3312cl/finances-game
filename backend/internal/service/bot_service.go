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
	cleanJSON := cleanJSON(responseStr)

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
				// Landed - Check mandatory actions first
				currentTile := s.getTile(game, bot.Position)

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

				// D. Construction Phase (Buy Buildings) - Priority over ending turn
				// Check if we own any full Monopoly and have surplus cash
				if bot.Balance > 300 { // Lower threshold to encourage building
					for _, t := range game.Board {
						if t.OwnerID != nil && *t.OwnerID == bot.UserID && t.GroupIdentifier != "" && !t.IsMortgaged {
							// Check if full group owned
							allOwned := true
							minBuild := 10 // Start high
							// Verify group ownership and find min build level
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

									if bot.Balance > cost+150 { // Keep smaller safety buffer
										return &domain.BotAction{
											Action:  "BUY_BUILDING",
											Payload: json.RawMessage(fmt.Sprintf(`{"property_id": "%s"}`, t.PropertyID)),
											Reason:  fmt.Sprintf("Inversión en casas para %s", t.Name),
										}, nil
									}
								}
							}
						}
					}
				}

				// E. Trade Proposal - Increase chance and logic
				if game.ActiveTrade == nil && rand.Float64() < 0.40 { // 40% chance to consider trade before ending turn
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

						// Try to find a property to offer (duplicate or from group I have few of)
						var offerPropID string
						for _, t := range game.Board {
							if t.OwnerID != nil && *t.OwnerID == bot.UserID && !t.IsMortgaged {
								// Offer a property I don't have full monopoly on, and is not the one I'm building?
								// Simple heuristic: Offer if I have < 50% of group
								if float64(myGroups[t.GroupIdentifier])/float64(groupSizes[t.GroupIdentifier]) < 0.5 {
									offerPropID = t.PropertyID
									break
								}
							}
						}

						// Construct Offer logic
						// If I have a property to swap, good. If not, offer CASH if rich.
						canOffer := false
						offerCash := 0
						offerProps := []string{}

						if offerPropID != "" {
							offerProps = append(offerProps, offerPropID)
							canOffer = true
							// Maybe add small cash
							if bot.Balance > 300 {
								offerCash = 50
							}
						} else if bot.Balance > target.Price*2 {
							// Cash only offer (aggressive)
							offerCash = target.Price + 100 + rand.Intn(200) // Price + premium
							canOffer = true
						}

						if canOffer {
							payload := fmt.Sprintf(`{"target_id":"%s","offer_properties":%s,"offer_cash":%d,"request_properties":["%s"],"request_cash":0}`,
								targetOwnerID, toJSONList(offerProps), offerCash, target.PropertyID)

							return &domain.BotAction{
								Action:  "INITIATE_TRADE",
								Payload: json.RawMessage(payload),
								Reason:  fmt.Sprintf("Quiero completar mi monopolio de %s", target.GroupIdentifier),
							}, nil
						}
					}
				}

				// F. End Turn
				// If I am target of pending rent, I cannot end turn until it's collected
				if game.PendingRent != nil && game.PendingRent.TargetID == bot.UserID {
					// Proactively pay rent since backend now supports it
					payload := fmt.Sprintf(`{"target_id":"%s","property_id":"%s"}`, game.PendingRent.TargetID, game.PendingRent.PropertyID)
					return &domain.BotAction{
						Action:  "PAY_RENT",
						Payload: json.RawMessage(payload),
						Reason:  "Debo pagar la renta para finalizar turno",
					}, nil
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

	return nil, fmt.Errorf("no heuristic action found")
}

func toJSONList(items []string) string {
	if len(items) == 0 {
		return "[]"
	}
	// primitive json marshal for list of strings
	b, _ := json.Marshal(items)
	return string(b)
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
func (s *BotService) GenerateChatResponse(game *domain.GameState, bot *domain.PlayerState, playerMessage string, playerName string) (string, *domain.BotAction, error) {
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

	// Property/Trade Context
	gameContext.WriteString("\nPROPIEDADES CLAVE:\n")
	for _, t := range game.Board {
		if t.Type == "PROPERTY" || t.Type == "UTILITY" || t.Type == "RAILROAD" {
			owner := "Nadie"
			if t.OwnerID != nil {
				for _, p := range game.Players {
					if p.UserID == *t.OwnerID {
						owner = p.Name
						if p.UserID == bot.UserID {
							owner = "YO"
						}
						break
					}
				}
			}
			gameContext.WriteString(fmt.Sprintf("- %s (%s): Dueño=%s, Precio=%d\n", t.Name, t.GroupIdentifier, owner, t.Price))
		}
	}

	// Build the prompt
	systemPrompt := fmt.Sprintf(`Eres un bot de IA jugando Monopoly llamado "%s".
%s

INSTRUCCIONES:
- Responde en español, con tu personalidad única
- Sé breve (1-2 oraciones máximo)
- Puedes hablar sobre estrategia, proponer tratos, bromear, o comentar el juego.

CAPACIDAD DE ACCIÓN:
Si llegas a un acuerdo con un jugador en el chat, PUEDES EJECUTARLO.
Para ejecutar una acción, incluye al final de tu mensaje un bloque JSON con la acción.
Solo usa la acción si estás SEGURO de que quieres hacerlo (ej. aceptaste una oferta explicita).

FORMATO DE RESPUESTA:
"Texto de respuesta normal aquí... [ACTION] {JSON_DE_ACCION}"

ACCIONES DISPONIBLES:
1. INICIATE_TRADE: Para proponer o aceptar un intercambio.
   { "action": "INITIATE_TRADE", "payload": { "target_id": "ID_JUGADOR", "offer_properties": ["ID_PROP1"], "offer_cash": 100, "request_properties": ["ID_PROP2"], "request_cash": 0 } }
   *NOTA*: Debes inferir los IDs correctos del contexto. Si no estás seguro, solo pide confirmación en texto.

2. ACCEPT_TRADE: Si hay una oferta activa hacia ti (revisar estado).
   { "action": "ACCEPT_TRADE", "payload": { "trade_id": "ID_TRADE" } }

CONTEXTO ACTUAL:
%s`, bot.Name, profile.Description, gameContext.String())

	userPrompt := fmt.Sprintf("El jugador '%s' (ID: %s) te envió este mensaje: \"%s\"\n\nSi acuerdas un trato, EJECÚTALO usando [ACTION] JSON. Responde:",
		playerName, userIDFromPlayerName(game, playerName), playerMessage)

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	llmReq := LLMRequest{
		Model:       "local-model",
		Messages:    messages,
		Temperature: 0.7, // Lower temp for logic reliability
		MaxTokens:   300,
		Stream:      false,
	}

	response, err := s.callLLM(llmReq)
	if err != nil {
		// Fallback
		return fallbackResponse(playerMessage), nil, nil
	}

	// Parse Response for Action
	finalText := response
	var action *domain.BotAction

	if idx := strings.Index(response, "[ACTION]"); idx != -1 {
		finalText = strings.TrimSpace(response[:idx])
		jsonPart := strings.TrimSpace(response[idx+8:]) // len("[ACTION]") == 8

		// Clean JSON
		jsonPart = cleanJSON(jsonPart)

		var act domain.BotAction
		if err := json.Unmarshal([]byte(jsonPart), &act); err == nil {
			action = &act
			// Validate payload format if needed, but GameService will handle it
		} else {
			fmt.Printf("Error parsing bot chat action: %v\nJSON: %s\n", err, jsonPart)
		}
	}

	return strings.TrimSpace(finalText), action, nil
}

func fallbackResponse(msg string) string {
	fallbacks := []string{
		"🎲 ¡Interesante! Pero ahora estoy concentrado en ganar...",
		"💰 Mmm, lo pensaré... ¿tienes algo que ofrecer?",
		"🏠 ¡Hablemos de propiedades! ¿Qué tienes en mente?",
	}
	return fallbacks[len(msg)%len(fallbacks)]
}

func userIDFromPlayerName(g *domain.GameState, name string) string {
	for _, p := range g.Players {
		if p.Name == name {
			return p.UserID
		}
	}
	return ""
}

// cleanJSON tries to extract the JSON object from a potential dirty string
func cleanJSON(input string) string {
	// 1. Remove Markdown code blocks if present
	input = strings.TrimSpace(input)
	if strings.Contains(input, "```") {
		// Try to find first ```json or ``` and last ```
		start := strings.Index(input, "```")
		end := strings.LastIndex(input, "```")
		if end > start {
			content := input[start+3 : end]
			if strings.HasPrefix(content, "json") {
				content = strings.TrimPrefix(content, "json")
			}
			input = strings.TrimSpace(content)
		}
	}

	// 2. Find first '{' and last '}'
	firstOpen := strings.Index(input, "{")
	lastClose := strings.LastIndex(input, "}")
	if firstOpen != -1 && lastClose != -1 && lastClose > firstOpen {
		input = input[firstOpen : lastClose+1]
	}

	return input
}
