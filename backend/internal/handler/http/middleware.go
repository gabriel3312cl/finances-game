package handler

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gabriel3312cl/finances-game/backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

// Middleware to validate JWT
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization Header", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		secret := []byte(os.Getenv("JWT_SECRET"))
		token, err := jwt.ParseWithClaims(tokenString, &domain.AuthClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return secret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid Token", http.StatusUnauthorized)
			return
		}

		if claims, ok := token.Claims.(*domain.AuthClaims); ok && token.Valid {
			ctx := context.WithValue(r.Context(), "user_id", claims.UserID)
			next(w, r.WithContext(ctx))
		} else {
			http.Error(w, "Invalid Token Claims", http.StatusUnauthorized)
		}
	}
}
