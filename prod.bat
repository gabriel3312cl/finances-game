@echo off
echo Starting Finances Game in PRODUCTION mode...

echo Starting Database...
docker compose up -d

echo Building Backend...
cd backend
go build -o bin/server.exe cmd/api/main.go
if %errorlevel% neq 0 (
    echo Backend build failed!
    pause
    exit /b %errorlevel%
)
cd ..

echo Building Frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    pause
    exit /b %errorlevel%
)
cd ..

echo Starting Backend (Port 8080)...
start "Backend API" cmd /k "cd backend && bin\server.exe"

echo Starting Frontend (Port 80)...
start "Frontend App" cmd /k "cd frontend && npm start -- -p 80"

echo Production environment started!
