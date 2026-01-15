package domain

import "time"

// Updating User struct to include SpecialCode field used in repo
type User struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	Password    string    `json:"-"` // Hash
	SpecialCode *string   `json:"-"` // Pointer to allow nulls if needed, though schema enforces FK
	TokenColor  string    `json:"token_color"`
	TokenShape  string    `json:"token_shape"`
	CreatedAt   time.Time `json:"created_at"`
}

type UserRepo interface {
	Create(u *User) error
	GetByUsername(username string) (*User, error)
	ValidateSpecialCode(code string) (bool, error)
	Delete(id string) error
}
