package postgres

import (
	"database/sql"
	"errors"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(u *domain.User) error {
	// Defaults if empty
	if u.TokenColor == "" {
		u.TokenColor = "RED"
	}
	if u.TokenShape == "" {
		u.TokenShape = "CUBE"
	}
	query := `INSERT INTO users (username, password_hash, special_code, token_color, token_shape) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.db.QueryRow(query, u.Username, u.Password, u.SpecialCode, u.TokenColor, u.TokenShape).Scan(&u.ID, &u.CreatedAt)
}

func (r *UserRepository) GetByUsername(username string) (*domain.User, error) {
	u := &domain.User{}
	query := `SELECT id, username, password_hash, created_at, COALESCE(token_color, 'RED'), COALESCE(token_shape, 'CUBE') FROM users WHERE username = $1`
	err := r.db.QueryRow(query, username).Scan(&u.ID, &u.Username, &u.Password, &u.CreatedAt, &u.TokenColor, &u.TokenShape)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) GetByID(id string) (*domain.User, error) {
	u := &domain.User{}
	query := `SELECT id, username, created_at, COALESCE(token_color, 'RED'), COALESCE(token_shape, 'CUBE') FROM users WHERE id = $1`
	err := r.db.QueryRow(query, id).Scan(&u.ID, &u.Username, &u.CreatedAt, &u.TokenColor, &u.TokenShape)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) UpdateTokenConfig(userID, color, shape string) error {
	_, err := r.db.Exec(`UPDATE users SET token_color = $1, token_shape = $2 WHERE id = $3`, color, shape, userID)
	return err
}

func (r *UserRepository) ValidateSpecialCode(code string) (bool, error) {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM valid_codes WHERE code = $1 AND is_active = TRUE)`
	err := r.db.QueryRow(query, code).Scan(&exists)
	return exists, err
}

func (r *UserRepository) Delete(id string) error {
	// Cascade delete is handled by DB schema
	_, err := r.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}
