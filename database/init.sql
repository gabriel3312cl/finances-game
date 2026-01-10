-- Database Initialization Script

-- 1. Setup Database and User
-- Note: You might need to run this part as a superuser first if the DB doesn't exist.
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'finances_user') THEN

      CREATE ROLE finances_user WITH LOGIN PASSWORD 'secure_password_123';
   END IF;
END
$do$;

-- Drop and recreate database (optional, for fresh start)
-- DROP DATABASE IF EXISTS finances_game;
-- CREATE DATABASE finances_game OWNER finances_user;

-- Gran permissions (Connect to specific DB)
-- GRANT ALL PRIVILEGES ON DATABASE finances_game TO finances_user;

-- \c finances_game finances_user;

-- 2. Schema Definitions

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    special_code VARCHAR(20) UNIQUE, -- For registration gate
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Games Table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(4) UNIQUE NOT NULL, -- 4-char join code
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    state VARCHAR(20) DEFAULT 'WAITING', -- WAITING, PLAYING, ENDED
    current_turn_player_id UUID, -- References a player in the game
    settings JSONB DEFAULT '{}', -- Custom currency, starting money, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Game Players (Session Participants)
CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_color VARCHAR(20),
    balance BIGINT DEFAULT 1500, -- Default monopoly money
    position INT DEFAULT 0, -- Board position index (0-39)
    is_bankrupt BOOLEAN DEFAULT FALSE,
    inventory JSONB DEFAULT '[]', -- Properties, cards
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);

-- Properties State (Per Game)
CREATE TABLE IF NOT EXISTS game_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    property_id INT NOT NULL, -- ID from rules (e.g., 1.1.1)
    owner_id UUID REFERENCES game_players(id) ON DELETE SET NULL, -- Player ID
    mortgaged BOOLEAN DEFAULT FALSE,
    houses INT DEFAULT 0,
    hotels INT DEFAULT 0,
    UNIQUE(game_id, property_id)
);

-- Audit/History Logs
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- ROLL_DICE, BUY, PAY_RENT, ETC
    details JSONB NOT NULL, -- Dice result: {d1: 3, d2: 4}, Amount: 200, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Loans Table
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    lender_id UUID REFERENCES game_players(id) ON DELETE CASCADE, -- NULL if Bank
    borrower_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    principal_amount BIGINT NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    installments_count INT NOT NULL,
    installments_paid INT DEFAULT 0,
    amount_per_installment BIGINT NOT NULL,
    next_payment_due TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, PAID, DEFAULTED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_games_code ON games(code);
CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_history_game_id ON game_history(game_id);
