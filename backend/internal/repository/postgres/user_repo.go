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
	query := `INSERT INTO users (username, password_hash, special_code) VALUES ($1, $2, $3) RETURNING id, created_at`
	return r.db.QueryRow(query, u.Username, u.Password, u.SpecialCode).Scan(&u.ID, &u.CreatedAt) // Note: u.Password holds the hash in this context
}

func (r *UserRepository) GetByUsername(username string) (*domain.User, error) {
	u := &domain.User{}
	query := `SELECT id, username, password_hash, created_at FROM users WHERE username = $1`
	err := r.db.QueryRow(query, username).Scan(&u.ID, &u.Username, &u.Password, &u.CreatedAt)
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
	query := `SELECT id, username, created_at FROM users WHERE id = $1`
	err := r.db.QueryRow(query, id).Scan(&u.ID, &u.Username, &u.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return u, nil
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
