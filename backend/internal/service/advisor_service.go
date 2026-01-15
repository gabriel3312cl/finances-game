package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
)

// AdvisorService handles AI-powered game advice
type AdvisorService struct {
	llmEndpoint string
	gameService *GameService
	httpClient  *http.Client
}

// ChatMessage represents a message in the conversation
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the request to the advisor
type ChatRequest struct {
	GameID  string        `json:"game_id"`
	UserID  string        `json:"user_id"`
	Message string        `json:"message"`
	History []ChatMessage `json:"history"`
}

// ChatResponse is the response from the advisor
type ChatResponse struct {
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// LLMRequest is the request format for LLM Studio
type LLMRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
	Stream      bool          `json:"stream"`
}

// LLMResponse is the response format from LLM Studio
type LLMResponse struct {
	ID      string `json:"id"`
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// NewAdvisorService creates a new advisor service
func NewAdvisorService(gameService *GameService, llmEndpoint string) *AdvisorService {
	return &AdvisorService{
		llmEndpoint: llmEndpoint,
		gameService: gameService,
		httpClient: &http.Client{
			Timeout: 60 * time.Second, // LLM can be slow
		},
	}
}

// GetAdvice processes a user message and returns AI advice
func (s *AdvisorService) GetAdvice(req *ChatRequest) (*ChatResponse, error) {
	// Get game state
	s.gameService.mu.RLock()
	game, exists := s.gameService.games[req.GameID]
	s.gameService.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("game not found: %s", req.GameID)
	}

	// Build system prompt with game context
	systemPrompt := s.buildSystemPrompt(game, req.UserID)

	// Build messages array
	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
	}

	// Add conversation history
	for _, msg := range req.History {
		messages = append(messages, msg)
	}

	// Add current user message
	messages = append(messages, ChatMessage{
		Role:    "user",
		Content: req.Message,
	})

	// Call LLM
	llmReq := LLMRequest{
		Model:       "local-model", // LLM Studio uses this by default
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   1024,
		Stream:      false,
	}

	response, err := s.callLLM(llmReq)
	if err != nil {
		return nil, fmt.Errorf("LLM error: %w", err)
	}

	return &ChatResponse{
		Message: response,
	}, nil
}

// CheckHealth checks if the LLM service is reachable
func (s *AdvisorService) CheckHealth() bool {
	// Simple GET request to models endpoint or similar fast endpoint
	// LLM Studio usually has /v1/models
	url := strings.TrimSuffix(s.llmEndpoint, "/chat/completions") + "/models"

	// If llmEndpoint is just base url, adjust.
	// Assuming standard OpenAI compatible endpoint: "http://host:port/v1/chat/completions"
	// We want "http://host:port/v1/models"

	resp, err := s.httpClient.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// buildSystemPrompt creates the system prompt with game context
func (s *AdvisorService) buildSystemPrompt(game *domain.GameState, userID string) string {
	var sb strings.Builder

	sb.WriteString(`Eres un asesor profesional de Monopoly con décadas de experiencia en estrategia financiera y negociación. Tu rol es ayudar al jugador a tomar las mejores decisiones BASÁNDOTE ÚNICAMENTE EN LOS DATOS PROPORCIONADOS.

DIRECTRICES CRÍTICAS:
- Responde siempre en español
- Sé conciso pero informativo (máximo 3-4 oraciones por respuesta)
- SOLO usa la información proporcionada abajo - NO inventes datos
- Si un dato dice "NO" o "false", créelo literalmente
- Advierte sobre riesgos financieros cuando sea necesario
- Sugiere negociaciones estratégicas con otros jugadores

`)

	// Find the player
	var player *domain.PlayerState
	for _, p := range game.Players {
		if p.UserID == userID {
			player = p
			break
		}
	}

	if player == nil {
		sb.WriteString("ERROR: No se pudo encontrar al jugador en la partida.\n")
		return sb.String()
	}

	// Get current tile name
	currentTileName := "Desconocida"
	for _, tile := range game.Board {
		if tile.ID == player.Position {
			currentTileName = tile.Name
			break
		}
	}

	// Calculate net worth
	netWorth := player.Balance
	totalPropertyValue := 0
	totalRentPotential := 0

	// Player status - VERY EXPLICIT
	sb.WriteString("╔══════════════════════════════════════╗\n")
	sb.WriteString("║      DATOS DEL JUGADOR (TÚ)          ║\n")
	sb.WriteString("╚══════════════════════════════════════╝\n")
	sb.WriteString(fmt.Sprintf("Nombre: %s\n", player.Name))
	sb.WriteString(fmt.Sprintf("Balance en efectivo: $%d\n", player.Balance))
	sb.WriteString(fmt.Sprintf("Posición actual: Casilla #%d - %s\n", player.Position, currentTileName))

	// EXPLICIT Jail status
	if player.InJail {
		sb.WriteString("🔒 ESTADO CÁRCEL: SÍ - Estás EN LA CÁRCEL\n")
	} else {
		sb.WriteString("✅ ESTADO CÁRCEL: NO - Estás LIBRE, no estás en la cárcel\n")
	}

	// Loan details
	if player.Loan > 0 {
		sb.WriteString(fmt.Sprintf("⚠️ PRÉSTAMO ACTIVO: $%d\n", player.Loan))
		if player.Credit != nil {
			interestRate := s.getInterestRate(player.Credit.Score)
			interestAmount := int(float64(player.Loan) * interestRate)
			sb.WriteString(fmt.Sprintf("   - Tasa de interés: %.1f%%\n", interestRate*100))
			sb.WriteString(fmt.Sprintf("   - Interés por ronda: $%d\n", interestAmount))
		}
	} else {
		sb.WriteString("✅ Sin préstamos activos\n")
	}

	// Credit details
	if player.Credit != nil {
		sb.WriteString(fmt.Sprintf("\n📊 PERFIL CREDITICIO:\n"))
		sb.WriteString(fmt.Sprintf("   - Score de crédito: %d/850\n", player.Credit.Score))
		sb.WriteString(fmt.Sprintf("   - Préstamos tomados históricos: %d\n", player.Credit.LoansTaken))
		sb.WriteString(fmt.Sprintf("   - Préstamos pagados a tiempo: %d\n", player.Credit.LoansPaidOnTime))
		sb.WriteString(fmt.Sprintf("   - Rondas consecutivas en deuda: %d\n", player.Credit.RoundsInDebt))
	}

	// Player properties with FULL DETAILS
	sb.WriteString("\n╔══════════════════════════════════════╗\n")
	sb.WriteString("║      TUS PROPIEDADES                 ║\n")
	sb.WriteString("╚══════════════════════════════════════╝\n")

	playerProps := []string{}
	groupCounts := make(map[string]int) // Group -> owned count
	groupTotals := make(map[string]int) // Group -> total in group

	// Count total properties per group
	for _, tile := range game.Board {
		if tile.GroupIdentifier != "" && tile.Type == "PROPERTY" {
			groupTotals[tile.GroupIdentifier]++
		}
	}

	for propID, ownerID := range game.PropertyOwnership {
		if ownerID == userID {
			for _, tile := range game.Board {
				if tile.PropertyID == propID {
					groupCounts[tile.GroupIdentifier]++

					propInfo := fmt.Sprintf("• %s\n", tile.Name)
					propInfo += fmt.Sprintf("     Grupo: %s | Precio: $%d | Valor hipoteca: $%d\n", tile.GroupName, tile.Price, tile.MortgageValue)

					if tile.BuildingCount == 0 {
						propInfo += fmt.Sprintf("     Renta base: $%d | Renta con grupo completo: $%d\n", tile.RentBase, tile.RentColorGroup)
					} else if tile.BuildingCount < 5 {
						currentRent := tile.RentBase
						switch tile.BuildingCount {
						case 1:
							currentRent = tile.Rent1House
						case 2:
							currentRent = tile.Rent2House
						case 3:
							currentRent = tile.Rent3House
						case 4:
							currentRent = tile.Rent4House
						}
						propInfo += fmt.Sprintf("     🏠 %d casas | Renta actual: $%d\n", tile.BuildingCount, currentRent)
					} else {
						propInfo += fmt.Sprintf("     🏨 HOTEL | Renta actual: $%d\n", tile.RentHotel)
					}

					if tile.IsMortgaged {
						propInfo += "     ⚠️ HIPOTECADA - No genera renta\n"
					} else {
						totalPropertyValue += tile.Price
						if tile.BuildingCount > 0 {
							switch tile.BuildingCount {
							case 1:
								totalRentPotential += tile.Rent1House
							case 2:
								totalRentPotential += tile.Rent2House
							case 3:
								totalRentPotential += tile.Rent3House
							case 4:
								totalRentPotential += tile.Rent4House
							case 5:
								totalRentPotential += tile.RentHotel
							}
						} else {
							totalRentPotential += tile.RentBase
						}
					}

					playerProps = append(playerProps, propInfo)
					break
				}
			}
		}
	}

	if len(playerProps) == 0 {
		sb.WriteString("❌ No tienes ninguna propiedad.\n")
	} else {
		for _, p := range playerProps {
			sb.WriteString(p)
		}
		sb.WriteString(fmt.Sprintf("\n📈 RESUMEN DE PROPIEDADES:\n"))
		sb.WriteString(fmt.Sprintf("   - Total propiedades: %d\n", len(playerProps)))
		sb.WriteString(fmt.Sprintf("   - Valor total de propiedades: $%d\n", totalPropertyValue))
		sb.WriteString(fmt.Sprintf("   - Potencial de renta por visita: ~$%d\n", totalRentPotential/max(1, len(playerProps))))

		// Check for monopolies
		for group, count := range groupCounts {
			total := groupTotals[group]
			if count == total && total > 0 {
				sb.WriteString(fmt.Sprintf("   - ⭐ MONOPOLIO: Tienes todas las propiedades de %s\n", group))
			} else if count > 0 {
				sb.WriteString(fmt.Sprintf("   - %s: %d/%d propiedades\n", group, count, total))
			}
		}
	}

	netWorth += totalPropertyValue

	// Other players summary
	sb.WriteString("\n╔══════════════════════════════════════╗\n")
	sb.WriteString("║      OTROS JUGADORES                 ║\n")
	sb.WriteString("╚══════════════════════════════════════╝\n")
	for _, p := range game.Players {
		if p.UserID != userID {
			propCount := 0
			propValue := 0
			for propID, ownerID := range game.PropertyOwnership {
				if ownerID == p.UserID {
					propCount++
					for _, tile := range game.Board {
						if tile.PropertyID == propID && !tile.IsMortgaged {
							propValue += tile.Price
						}
					}
				}
			}
			status := ""
			if p.InJail {
				status = " [🔒 EN CÁRCEL]"
			}
			sb.WriteString(fmt.Sprintf("• %s: $%d efectivo, %d propiedades (~$%d)%s\n", p.Name, p.Balance, propCount, propValue, status))
		}
	}

	// Recent events (last 5 for clarity)
	sb.WriteString("\n📜 ÚLTIMOS EVENTOS:\n")
	logStart := 0
	if len(game.Logs) > 5 {
		logStart = len(game.Logs) - 5
	}
	for i := logStart; i < len(game.Logs); i++ {
		sb.WriteString(fmt.Sprintf("- %s\n", game.Logs[i].Message))
	}

	// Current game status
	sb.WriteString("\n🎮 ESTADO ACTUAL DEL TURNO:\n")
	currentPlayerName := s.getPlayerName(game, game.CurrentTurnID)
	if game.CurrentTurnID == userID {
		sb.WriteString(">>> ES TU TURNO <<<\n")
	} else {
		sb.WriteString(fmt.Sprintf("Turno de: %s\n", currentPlayerName))
	}
	sb.WriteString(fmt.Sprintf("Último resultado de dados: %d + %d = %d\n", game.Dice[0], game.Dice[1], game.Dice[0]+game.Dice[1]))

	if game.ActiveAuction != nil {
		sb.WriteString(fmt.Sprintf("🔨 SUBASTA ACTIVA: Oferta actual $%d\n", game.ActiveAuction.HighestBid))
	}

	if game.PendingRent != nil {
		sb.WriteString(fmt.Sprintf("💰 RENTA PENDIENTE DE COBRO: $%d\n", game.PendingRent.Amount))
	}

	// Net worth summary
	sb.WriteString(fmt.Sprintf("\n💎 TU PATRIMONIO NETO ESTIMADO: $%d\n", netWorth-player.Loan))

	return sb.String()
}

// getInterestRate returns the interest rate based on credit score
func (s *AdvisorService) getInterestRate(score int) float64 {
	if score >= 750 {
		return 0.05
	} else if score >= 670 {
		return 0.10
	} else if score >= 580 {
		return 0.15
	} else if score >= 500 {
		return 0.25
	}
	return 0.35
}

func (s *AdvisorService) getPlayerName(game *domain.GameState, userID string) string {
	for _, p := range game.Players {
		if p.UserID == userID {
			return p.Name
		}
	}
	return "Desconocido"
}

// callLLM makes a request to the LLM Studio API
func (s *AdvisorService) callLLM(req LLMRequest) (string, error) {
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

	if llmResp.Error != nil {
		return "", fmt.Errorf("LLM error: %s", llmResp.Error.Message)
	}

	if len(llmResp.Choices) == 0 {
		return "", fmt.Errorf("no response from LLM")
	}

	return llmResp.Choices[0].Message.Content, nil
}

// LLMStreamChunk represents a streaming chunk from LLM
type LLMStreamChunk struct {
	ID      string `json:"id"`
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
}

// GetAdviceStream processes a user message and streams AI advice
func (s *AdvisorService) GetAdviceStream(req *ChatRequest, chunkChan chan<- string, errChan chan<- error) {
	defer close(chunkChan)
	defer close(errChan)

	// Get game state
	s.gameService.mu.RLock()
	game, exists := s.gameService.games[req.GameID]
	s.gameService.mu.RUnlock()

	if !exists {
		errChan <- fmt.Errorf("game not found: %s", req.GameID)
		return
	}

	// Build system prompt with game context
	systemPrompt := s.buildSystemPrompt(game, req.UserID)

	// Build messages array
	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
	}

	// Add conversation history
	for _, msg := range req.History {
		messages = append(messages, msg)
	}

	// Add current user message
	messages = append(messages, ChatMessage{
		Role:    "user",
		Content: req.Message,
	})

	// Call LLM with streaming enabled
	llmReq := LLMRequest{
		Model:       "local-model",
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   1024,
		Stream:      true, // Enable streaming
	}

	jsonData, err := json.Marshal(llmReq)
	if err != nil {
		errChan <- fmt.Errorf("failed to marshal request: %w", err)
		return
	}

	httpReq, err := http.NewRequest("POST", s.llmEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		errChan <- fmt.Errorf("failed to create request: %w", err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")

	// Use a client without timeout for streaming
	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		errChan <- fmt.Errorf("failed to call LLM: %w", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		errChan <- fmt.Errorf("LLM returned status %d: %s", resp.StatusCode, string(body))
		return
	}

	// Read streaming response
	reader := resp.Body
	buf := make([]byte, 1024)
	var partialData string

	for {
		n, err := reader.Read(buf)
		if err != nil {
			if err == io.EOF {
				break
			}
			errChan <- fmt.Errorf("error reading stream: %w", err)
			return
		}

		partialData += string(buf[:n])
		lines := strings.Split(partialData, "\n")

		// Process complete lines
		for i := 0; i < len(lines)-1; i++ {
			line := strings.TrimSpace(lines[i])
			if line == "" || line == "data: [DONE]" {
				continue
			}

			if strings.HasPrefix(line, "data: ") {
				jsonStr := strings.TrimPrefix(line, "data: ")
				var chunk LLMStreamChunk
				if err := json.Unmarshal([]byte(jsonStr), &chunk); err != nil {
					continue // Skip malformed chunks
				}

				if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
					chunkChan <- chunk.Choices[0].Delta.Content
				}
			}
		}

		// Keep the last incomplete line
		partialData = lines[len(lines)-1]
	}
}
