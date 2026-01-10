@echo off
echo Starting Finances Game in DEVELOPMENT mode...

echo Starting Database...
docker compose up -d

echo Waiting for DB...
timeout /t 3 /nobreak >nul

echo Starting Backend (Port 8080)...
start "Backend API" cmd /k "cd backend && go run cmd/api/main.go"

echo Starting Frontend (Port 80)...
:: Note: Port 80 might require Admin privileges on Windows
start "Frontend App" cmd /k "cd frontend && npm run dev -- -p 80"

echo Development environment started!
