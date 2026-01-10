package service

import (
	"errors"
	"time"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/gabriel3312cl/finances-game/backend/internal/repository/postgres"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo  *postgres.UserRepository
	jwtSecret []byte
}

func NewAuthService(userRepo *postgres.UserRepository, secret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: []byte(secret),
	}
}

func (s *AuthService) Register(req domain.RegisterRequest) (*domain.User, error) {
	// 1. Validate Special Code
	valid, err := s.userRepo.ValidateSpecialCode(req.SpecialCode)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, errors.New("invalid special code")
	}

	// 2. Hash Password
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// 3. Create User
	user := &domain.User{
		Username:    req.Username,
		Password:    string(hashedBytes), // Storing hash in Password field for this internal struct
		SpecialCode: &req.SpecialCode,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	user.Password = "" // Clear hash before returning
	return user, nil
}

func (s *AuthService) Login(req domain.LoginRequest) (*domain.LoginResponse, error) {
	// 1. Get User
	user, err := s.userRepo.GetByUsername(req.Username)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	// 2. Check Password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// 3. Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, domain.AuthClaims{
		UserID:   user.ID,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	tokenString, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return nil, err
	}

	user.Password = "" // Clear hash
	return &domain.LoginResponse{
		Token: tokenString,
		User:  user,
	}, nil
}

func (s *AuthService) DeleteUser(id string) error {
	return s.userRepo.Delete(id)
}
