package domain

import "time"

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"` // Hash
	CreatedAt time.Time `json:"created_at"`
}

type UserRepo interface {
	Create(u *User) error
	GetByUsername(username string) (*User, error)
	Delete(id string) error // Must cascade delete games/players
}
