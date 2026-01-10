package domain

type Game struct {
	ID        string
	Code      string
	Players   []Player
	State     GameState
	CreatedAt int64
}

type GameState string

const (
	StateWaiting GameState = "WAITING"
	StatePlaying GameState = "PLAYING"
	StateEnded   GameState = "ENDED"
)
