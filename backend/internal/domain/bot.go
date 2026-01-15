package domain

import "encoding/json"

// BotProfile defines the personality and strategy of an AI player
type BotProfile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// RiskTolerance: 0.0 (Conservative) to 1.0 (Gambler)
	RiskTolerance float64 `json:"risk_tolerance"`
	// Aggression: 0.0 (Passive) to 1.0 (Hostile/Monopolist)
	Aggression float64 `json:"aggression"`
	// NegotiationSkill: Affects trade logic complexity
	NegotiationSkill float64 `json:"negotiation_skill"`
	Strategy         string  `json:"strategy"` // "LLM" or "HEURISTIC"
}

// BotAction represents the decision made by the AI
type BotAction struct {
	Action string `json:"action"` // e.g., "BUY_PROPERTY", "END_TURN"
	// Optional params depending on action
	Amount     int             `json:"amount,omitempty"`      // For BID, TRADE
	PropertyID string          `json:"property_id,omitempty"` // For MORTGAGE, USE
	TargetID   string          `json:"target_id,omitempty"`   // For TRADE
	Reason     string          `json:"reason"`                // AI justification (for logs/chat)
	Payload    json.RawMessage `json:"payload,omitempty"`     // Raw payload for handlers
}

// Available Personalities
var BotPersonalities = []BotProfile{
	{
		ID:               "classic",
		Name:             "Bot Clásico",
		Description:      "IA tradicional rapida. Sin personalidad compleja, juega para ganar matemáticamente.",
		RiskTolerance:    0.5,
		Aggression:       0.5,
		NegotiationSkill: 0.0,
		Strategy:         "HEURISTIC",
	},
	{
		ID:               "balanced",
		Name:             "Sr. Equilibrado (IA)",
		Description:      "Juega de forma lógica y balanceada. Busca buenos negocios sin arriesgar demasiado.",
		RiskTolerance:    0.5,
		Aggression:       0.5,
		NegotiationSkill: 0.5,
		Strategy:         "LLM",
	},
	{
		ID:               "tycoon",
		Name:             "El Magnate (IA)",
		Description:      "Agresivo y dominante. Quiere monopolios a toda costa y gasta fuerte para conseguirlos.",
		RiskTolerance:    0.8,
		Aggression:       0.9,
		NegotiationSkill: 0.7,
		Strategy:         "LLM",
	},
	{
		ID:               "saver",
		Name:             "El Ahorrador (IA)",
		Description:      "Muy conservador. Solo compra lo indispensable y evita deudas como la plaga.",
		RiskTolerance:    0.2,
		Aggression:       0.3,
		NegotiationSkill: 0.4,
		Strategy:         "LLM",
	},
	{
		ID:               "speculator",
		Name:             "El Especulador (IA)",
		Description:      "Le encantan las subastas y los intercambios. Juega con el dinero de otros.",
		RiskTolerance:    0.9,
		Aggression:       0.6,
		NegotiationSkill: 0.9,
		Strategy:         "LLM",
	},
}

func GetBotProfile(id string) BotProfile {
	for _, p := range BotPersonalities {
		if p.ID == id {
			return p
		}
	}
	// Default
	return BotPersonalities[0]
}
