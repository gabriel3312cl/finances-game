package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

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

	// Repositories
	gameRepo := postgres.NewGameRepository(db)

	// Game Service (In-memory + Persistence)
	gameService := service.NewGameService(hub, db, gameRepo)

	// Advisor Service (LLM Integration)
	llmEndpoint := os.Getenv("LLM_ENDPOINT")
	if llmEndpoint == "" {
		llmEndpoint = "http://192.168.1.8:1234/v1/chat/completions"
	}
	advisorService := service.NewAdvisorService(gameService, llmEndpoint)

	// Bot Service (AI Players)
	botService := service.NewBotService(gameService, advisorService, llmEndpoint)
	gameService.SetBotService(botService)

	// Router
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "OK")
	})

	// Auth Routes
	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)
	mux.HandleFunc("/me", handler.AuthMiddleware(userRepo, authHandler.Me))
	mux.HandleFunc("/delete-account", handler.AuthMiddleware(userRepo, authHandler.Delete))

	// Game Routes
	gameHandler := handler.NewGameHandler(gameService)
	mux.HandleFunc("/games/create", handler.AuthMiddleware(userRepo, gameHandler.CreateGame))
	mux.HandleFunc("/games/join", handler.AuthMiddleware(userRepo, gameHandler.JoinGame))
	mux.HandleFunc("/games/my", handler.AuthMiddleware(userRepo, gameHandler.GetMyGames))
	mux.HandleFunc("/games/board", gameHandler.GetBoard) // public, or auth? Game board is generic. Public is fine.

	// Advisor Routes
	advisorHandler := handler.NewAdvisorHandler(advisorService)
	mux.HandleFunc("/api/games/", handler.AuthMiddleware(userRepo, func(w http.ResponseWriter, r *http.Request) {
		// Route: /api/games/{id}/advisor/stream for SSE streaming
		if strings.HasSuffix(r.URL.Path, "advisor/stream") {
			advisorHandler.ChatStream(w, r)
			return
		}
		// Route: /api/games/{id}/advisor for regular chat
		if strings.HasSuffix(r.URL.Path, "advisor") {
			advisorHandler.Chat(w, r)
			return
		}
		http.NotFound(w, r)
	}))

	// WebSocket Route
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r, gameService)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// CORS Middleware
	corsHandler := enableCORS(mux)

	// Logger Middleware
	loggingHandler := handler.LoggingMiddleware(corsHandler)

	fmt.Printf("Starting server on port %s...\n", port)
	if err := http.ListenAndServe(":"+port, loggingHandler); err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*") // Allow all for MVP
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		// Handle preflight
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Pass original ResponseWriter to preserve Flusher interface
		next.ServeHTTP(w, r)
	})
}
