package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	handler "github.com/gabriel3312cl/finances-game/backend/internal/handler/http"
	"github.com/gabriel3312cl/finances-game/backend/internal/handler/websocket"
	"github.com/gabriel3312cl/finances-game/backend/internal/repository/postgres"
	"github.com/gabriel3312cl/finances-game/backend/internal/service"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using defaults")
	}

	// Database Connection
	dbInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))

	db, err := sql.Open("postgres", dbInfo)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err = db.Ping(); err != nil {
		log.Fatal("Could not connect to database:", err)
	}
	fmt.Println("Connected to Database")

	// Dependencies
	jwtSecret := os.Getenv("JWT_SECRET")
	userRepo := postgres.NewUserRepository(db)
	authService := service.NewAuthService(userRepo, jwtSecret)

	// Auth Handler
	authHandler := handler.NewAuthHandler(authService)

	// WebSocket Hub
	hub := websocket.NewHub()
	go hub.Run()

	// Game Service (In-memory for now)
	gameService := service.NewGameService(hub, db)

	// Router
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "OK")
	})

	// Auth Routes
	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)
	mux.HandleFunc("/me", handler.AuthMiddleware(authHandler.Me))
	mux.HandleFunc("/delete-account", handler.AuthMiddleware(authHandler.Delete))

	// WebSocket Route
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r, gameService)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Starting server on port %s...\n", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}
