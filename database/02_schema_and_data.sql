-- 02_schema_and_data.sql
-- Combined schema and seed data for the Finances Game
-- ROBUST VERSION: Can run on empty DB or update existing DB.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SCHEMAS ===============================================================

-- Valid Registration Codes (MOVED TO TOP for FK dependency)
CREATE TABLE IF NOT EXISTS valid_codes (
    code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    special_code VARCHAR(20) REFERENCES valid_codes(code), -- RESTORED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    balance INT DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    token_color VARCHAR(20) DEFAULT 'RED',
    token_shape VARCHAR(20) DEFAULT 'CUBE'
);
-- Migration: Add special_code if missing (for existing DBs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS special_code VARCHAR(20) REFERENCES valid_codes(code);
-- Migration: Add updated_at if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_color VARCHAR(20) DEFAULT 'RED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_shape VARCHAR(20) DEFAULT 'CUBE';


-- Game Rooms
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,
    created_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'WAITING', -- WAITING, IN_PROGRESS, FINISHED
    current_turn_index INT DEFAULT 0,  -- Index in the players array/list
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    max_players INT DEFAULT 6
);

-- Players (Join Table)
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    game_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    color VARCHAR(20), -- Piece color
    position INT DEFAULT 0, -- Board position (0-63)
    balance INT DEFAULT 1500, -- Initial money
    is_bankrupt BOOLEAN DEFAULT FALSE,
    jail_turns INT DEFAULT 0,   -- strict counter for jail
    in_jail BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, game_id)
);

-- Game Cards (Chance / Community Chest)
CREATE TABLE IF NOT EXISTS game_cards (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'CHANCE' or 'COMMUNITY'
    title VARCHAR(100),       -- Optional title from user JSON
    description TEXT NOT NULL,
    effect TEXT NOT NULL      -- "move:GO", "pay:50", etc.
);
-- Migration: Add column if missing (for existing DBs)
ALTER TABLE game_cards ADD COLUMN IF NOT EXISTS title VARCHAR(100);

-- Games Table (Active Sessions)
CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(50),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    state TEXT,
    active BOOLEAN DEFAULT TRUE,
    current_turn_player_id UUID,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);

-- Game Players (Session Participants)
CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_color TEXT,
    balance BIGINT DEFAULT 1500,
    position INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    is_bankrupt BOOLEAN DEFAULT FALSE,
    inventory JSONB DEFAULT '[]',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);

-- Properties Table
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) UNIQUE, 
    group_id VARCHAR(50),    
    group_name VARCHAR(100), 
    group_color VARCHAR(50), 
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'PROPERTY',
    rent_rule VARCHAR(50) DEFAULT 'STANDARD', -- NEW: STANDARD, DICE_MULTIPLIER, TRANSPORT_COUNT
    price INT,
    rent_base INT,
    rent_color_group INT,
    rent_1_house INT,
    rent_2_house INT,
    rent_3_house INT,
    rent_4_house INT,
    rent_hotel INT,
    house_cost INT,
    hotel_cost INT,
    mortgage_value INT,
    unmortgage_value INT
);
-- Migration: Add rent_rule if missing
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rent_rule VARCHAR(50) DEFAULT 'STANDARD';

-- Properties State (Per Game)
CREATE TABLE IF NOT EXISTS game_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE, -- Match games.id
    property_id VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mortgaged BOOLEAN DEFAULT FALSE,
    houses INT DEFAULT 0,
    hotels INT DEFAULT 0,
    UNIQUE(game_id, property_id)
);

-- Board Layout
CREATE TABLE IF NOT EXISTS board_layout (
    position INT PRIMARY KEY, -- 0 to 63
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL -- PROPERTY, CORNER, CHANCE, ETC.
);

-- Game History
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    action_type VARCHAR(255) NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_history_game_id ON game_history(game_id);

-- Loans
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE,
    lender_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    borrower_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    principal_amount BIGINT NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    installments_count INT NOT NULL,
    installments_paid INT DEFAULT 0,
    amount_per_installment BIGINT NOT NULL,
    next_payment_due TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Auctions
CREATE TABLE IF NOT EXISTS auctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    property_id UUID, 
    highest_bid INT DEFAULT 0,
    highest_bidder UUID REFERENCES players(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 2. SEED DATA =============================================================

-- Clear existing seed data to prevent duplicates (since we re-insert)
TRUNCATE valid_codes CASCADE;
-- Use CASCADE on valid_codes because users.special_code might reference it
-- Only truncate game_cards if we want to reset them to default
TRUNCATE game_cards;
TRUNCATE board_layout;
TRUNCATE properties CASCADE;


-- Valid Codes
INSERT INTO valid_codes (code, description) VALUES ('BETA123', 'Default beta access code') ON CONFLICT DO NOTHING;

-- Game Cards
INSERT INTO game_cards (type, title, description, effect) VALUES
-- CHANCE
('CHANCE', 'Multa', 'Multa por exceso de velocidad (Paga 15m)', 'pay:15'),
('CHANCE', 'Reparaciones', 'Haz reparaciones generales en todas tus propiedades: Paga 25m/casa, 100m/hotel', 'repair:25:100'),
('CHANCE', 'Avanza Avenida', 'Avanza a Avenida Aleatoria (Si pasas Salida cobra 200m)', 'move:random_property'),
('CHANCE', 'Avanza Transporte', 'Avanza al Transporte más cercano (Si tiene dueño paga doble)', 'move:nearest_railroad'),
('CHANCE', 'Pase Gratis', 'Sal de la cárcel gratis', 'jail_free'),
('CHANCE', 'Avanza Servicio', 'Avanza al Servicio más cercano (Si tiene dueño tira dados y paga 10x)', 'move:nearest_utility'),
('CHANCE', 'Prestamo', 'Por cumplimiento de préstamo, cobra 150m)', 'collect:150'),
('CHANCE', 'Salida', 'Avanza hasta la Salida (Cobra 500m)', 'move:GO_BONUS'),
('CHANCE', 'Presidente', 'Elegido Presidente del Consejo. Paga 50m a cada jugador', 'pay_all:50'),
('CHANCE', 'Dividendos', 'El banco te paga un dividendo de 50m', 'collect:50'),
('CHANCE', 'Retroceder', 'Retrocede 3 casillas', 'move:-3'),
('CHANCE', 'Ultima Casilla', 'Avanza hasta la última casilla de propiedad', 'move:last_property'),
('CHANCE', 'Carcel', 'Ve a la Cárcel', 'move:JAIL'),

-- COMMUNITY CHEST
('COMMUNITY', 'Seguro', 'Seguro de vida vence. Cobra 100m', 'collect:100'),
('COMMUNITY', 'Salida', 'Avanza hasta la Salida (Cobra 200m)', 'move:GO'),
('COMMUNITY', 'Gastos', 'Gastos escolares. Paga 50m', 'pay:50'),
('COMMUNITY', 'Herencia', 'Herencia misteriosa. Cobra 100m', 'collect:100'),
('COMMUNITY', 'Carcel', 'Ve a la Cárcel', 'move:JAIL'),
('COMMUNITY', 'Adopcion', 'Adoptas un perrito. Paga 50m', 'pay:50'),
('COMMUNITY', 'Facturas', 'Facturas de hospital. Paga 100m', 'pay:100'),
('COMMUNITY', 'Pase Gratis', 'Sal de la cárcel gratis', 'jail_free'),
('COMMUNITY', 'Reparaciones', 'Reparaciones viales: 40m/casa, 115m/hotel', 'repair:40:115'),
('COMMUNITY', 'Error Bancario', 'Error bancario a tu favor. Cobra 200m', 'collect:200'),
('COMMUNITY', 'Cumpleaños', 'Es tu cumpleaños. Cobra 10m de cada jugador', 'collect_all:10'),
('COMMUNITY', 'Concurso', 'Segundo premio en concurso de belleza. Cobra 10m', 'collect:10'),
('COMMUNITY', 'Acciones', 'Venta de acciones. Cobra 50m', 'collect:50'),
('COMMUNITY', 'Impuestos', 'Devolución de impuestos. Cobra 20m', 'collect:20'),
('COMMUNITY', 'Honorarios', 'Honorarios de consultoría. Cobra 25m', 'collect:25'),
('COMMUNITY', 'Vacaciones', 'Fondo vacacional. Cobra 100m', 'collect:100');


-- 1. Insert Properties (5 Railroads now)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, rent_rule, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES
-- 1.1 Cerro Navia
('av-la-estrella', '1.1', 'Cerro Navia', '#3b82f6', 'Av. La Estrella', 'PROPERTY', 'STANDARD', 60, 2, 4, 10, 30, 90, 160, 250, 50, 50, 30, 33),
('av-jose-joaquin-perez', '1.1', 'Cerro Navia', '#3b82f6', 'Av. José Joaquín Pérez', 'PROPERTY', 'STANDARD', 60, 2, 4, 10, 30, 90, 160, 250, 50, 50, 30, 33),
('av-mapocho', '1.1', 'Cerro Navia', '#3b82f6', 'Av. Mapocho', 'PROPERTY', 'STANDARD', 80, 4, 8, 20, 60, 180, 320, 450, 50, 50, 40, 44),
-- 1.2 Maipu
('av-pajaritos', '1.2', 'Maipú', '#ffffff', 'Av. Pajaritos', 'PROPERTY', 'STANDARD', 80, 4, 8, 20, 60, 180, 320, 450, 50, 50, 60, 66),
('camino-a-rinconada', '1.2', 'Maipú', '#ffffff', 'Camino a Rinconada', 'PROPERTY', 'STANDARD', 80, 4, 8, 20, 60, 180, 320, 450, 50, 50, 50, 55),
('camino-a-melipilla', '1.2', 'Maipú', '#ffffff', 'Camino a Melipilla', 'PROPERTY', 'STANDARD', 100, 8, 16, 40, 100, 300, 450, 600, 50, 50, 50, 55),
-- 1.3 La Florida
('av-la-florida', '1.3', 'La Florida', '#ef4444', 'Av. La Florida', 'PROPERTY', 'STANDARD', 100, 6, 12, 30, 90, 270, 400, 550, 50, 50, 50, 55),
('av-walker-martinez', '1.3', 'La Florida', '#ef4444', 'Av. Walker Martínez', 'PROPERTY', 'STANDARD', 100, 6, 12, 30, 90, 270, 400, 550, 50, 50, 50, 55),
('av-trinidad', '1.3', 'La Florida', '#ef4444', 'Av. Trinidad', 'PROPERTY', 'STANDARD', 120, 8, 16, 40, 100, 300, 450, 600, 50, 50, 60, 66),
-- 1.4 Puente Alto
('av-concha-y-toro', '1.4', 'Puente Alto', '#f97316', 'Av. Concha y Toro', 'PROPERTY', 'STANDARD', 140, 10, 20, 50, 150, 450, 625, 750, 100, 100, 70, 77),
('av-camilo-henriquez', '1.4', 'Puente Alto', '#f97316', 'Av. Camilo Henríquez', 'PROPERTY', 'STANDARD', 140, 10, 20, 50, 150, 450, 625, 750, 100, 100, 70, 77),
('av-santa-rosa', '1.4', 'Puente Alto', '#f97316', 'Av. Santa Rosa', 'PROPERTY', 'STANDARD', 160, 12, 24, 60, 180, 500, 700, 900, 100, 100, 80, 88),
-- 1.5 Macul
('av-macul', '1.5', 'Macul', '#06b6d4', 'Av. Macul', 'PROPERTY', 'STANDARD', 140, 10, 20, 50, 150, 450, 625, 750, 100, 100, 70, 77),
('av-jp-alessandri', '1.5', 'Macul', '#06b6d4', 'Av. J.P. Alessandri', 'PROPERTY', 'STANDARD', 140, 10, 20, 50, 150, 450, 625, 750, 100, 100, 70, 77),
('av-quilin', '1.5', 'Macul', '#06b6d4', 'Av. Quilín', 'PROPERTY', 'STANDARD', 160, 12, 24, 60, 180, 500, 700, 900, 100, 100, 80, 88),
-- 1.6 Penalolen
('av-grecia', '1.6', 'Peñalolén', '#a855f7', 'Av. Grecia', 'PROPERTY', 'STANDARD', 180, 14, 28, 70, 200, 550, 750, 950, 100, 100, 90, 99),
('av-tobalaba', '1.6', 'Peñalolén', '#a855f7', 'Av. Tobalaba', 'PROPERTY', 'STANDARD', 180, 14, 28, 70, 200, 550, 750, 950, 100, 100, 90, 99),
('av-oriental', '1.6', 'Peñalolén', '#a855f7', 'Av. Oriental', 'PROPERTY', 'STANDARD', 200, 16, 32, 80, 220, 600, 800, 1000, 100, 100, 100, 110),
-- 1.7 Nunoa
('av-irarrazaval', '1.7', 'Ñuñoa', '#eab308', 'Av. Irarrázaval', 'PROPERTY', 'STANDARD', 220, 18, 36, 90, 250, 700, 875, 1050, 150, 150, 110, 121),
('av-simon-bolivar', '1.7', 'Ñuñoa', '#eab308', 'Av. Simón Bolívar', 'PROPERTY', 'STANDARD', 220, 18, 36, 90, 250, 700, 875, 1050, 150, 150, 110, 121),
('av-pedro-de-valdivia', '1.7', 'Ñuñoa', '#eab308', 'Av. Pedro de Valdivia', 'PROPERTY', 'STANDARD', 240, 20, 40, 100, 300, 750, 925, 1100, 150, 150, 120, 132),
-- 1.8 La Reina
('av-jose-arrieta', '1.8', 'La Reina', '#22c55e', 'Av. José Arrieta', 'PROPERTY', 'STANDARD', 260, 22, 44, 110, 330, 800, 975, 1150, 150, 150, 130, 143),
('av-ossa', '1.8', 'La Reina', '#22c55e', 'Av. Ossa', 'PROPERTY', 'STANDARD', 260, 22, 44, 110, 330, 800, 975, 1150, 150, 150, 130, 143),
('av-principe-de-gales', '1.8', 'La Reina', '#22c55e', 'Av. Príncipe de Gales', 'PROPERTY', 'STANDARD', 280, 24, 48, 120, 360, 850, 1025, 1200, 150, 150, 140, 154),
-- 1.9 Providencia
('av-eliodoro-yanez', '1.9', 'Providencia', '#94a3b8', 'Av. Eliodoro Yáñez', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-salvador', '1.9', 'Providencia', '#94a3b8', 'Av. Salvador', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-manuel-montt', '1.9', 'Providencia', '#94a3b8', 'Av. Manuel Montt', 'PROPERTY', 'STANDARD', 320, 28, 56, 150, 450, 1000, 1200, 1400, 200, 200, 160, 176),
-- 1.10 Las Condes
('av-apoquindo', '1.10', 'Las Condes', '#4b5563', 'Av. Apoquindo', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-kennedy', '1.10', 'Las Condes', '#4b5563', 'Av. Kennedy', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-tomas-moro', '1.10', 'Las Condes', '#4b5563', 'Av. Tomás Moro', 'PROPERTY', 'STANDARD', 320, 28, 56, 150, 450, 1000, 1200, 1400, 200, 200, 160, 176),
-- 1.11 Vitacura
('av-andres-bello', '1.11', 'Vitacura', '#78350f', 'Av. Andrés Bello', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-tabancura', '1.11', 'Vitacura', '#78350f', 'Av. Tabancura', 'PROPERTY', 'STANDARD', 300, 26, 52, 130, 390, 900, 1100, 1275, 200, 200, 150, 165),
('av-manquehue', '1.11', 'Vitacura', '#78350f', 'Av. Manquehue', 'PROPERTY', 'STANDARD', 320, 28, 56, 150, 450, 1000, 1200, 1400, 200, 200, 160, 176),
-- 1.12 Lo Barnechea
('av-los-trapenses', '1.12', 'Lo Barnechea', '#000000', 'Av. Los Trapenses', 'PROPERTY', 'STANDARD', 400, 50, 100, 200, 600, 1400, 1700, 2000, 200, 200, 200, 220),
('av-el-rodeo', '1.12', 'Lo Barnechea', '#000000', 'Av. El Rodeo', 'PROPERTY', 'STANDARD', 400, 50, 100, 200, 600, 1400, 1700, 2000, 200, 200, 200, 220),
-- Railroads (5 Total now)
('aeropuerto-amb', '2.1', null, null, 'Aeropuerto Arturo Merino Benítez', 'RAILROAD', 'TRANSPORT_COUNT', 200, 25, null, null, null, null, null, null, null, null, 100, 110),
('terminal-alameda', '2.2', null, null, 'Terminal Alameda', 'RAILROAD', 'TRANSPORT_COUNT', 200, 25, null, null, null, null, null, null, null, null, 100, 110),
('terminal-los-heroes', '2.3', null, null, 'Terminal Los Héroes', 'RAILROAD', 'TRANSPORT_COUNT', 200, 25, null, null, null, null, null, null, null, null, 100, 110),
('estacion-central', '2.4', null, null, 'Estación Central', 'RAILROAD', 'TRANSPORT_COUNT', 200, 25, null, null, null, null, null, null, null, null, 100, 110),
('terminal-san-borja', '2.5', null, null, 'Terminal San Borja', 'RAILROAD', 'TRANSPORT_COUNT', 200, 25, null, null, null, null, null, null, null, null, 100, 110), -- NEW 5th
-- Utilities
('enel', '3.1', null, null, 'Enel', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('aguas-andinas', '3.2', null, null, 'Aguas Andinas', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('wom', '3.3', null, null, 'WOM', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('gasco', '3.4', null, null, 'Gasco', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('metro-santiago', '3.5', null, null, 'Metro de Santiago', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('transantiago', '3.6', null, null, 'Transantiago', 'UTILITY', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('costanera-center', '4.1', null, null, 'Costanera Center', 'ATTRACTION', 'DICE_MULTIPLIER', 180, 0, null, null, null, null, null, null, null, null, 90, 99),
('movistar-arena', '4.2', null, null, 'Movistar Arena', 'ATTRACTION', 'DICE_MULTIPLIER', 180, 0, null, null, null, null, null, null, null, null, 90, 99),
('estadio-nacional', '4.3', null, null, 'Estadio Nacional', 'ATTRACTION', 'DICE_MULTIPLIER', 180, 0, null, null, null, null, null, null, null, null, 90, 99),
('parque-arauco', '4.4', null, null, 'Parque Arauco', 'ATTRACTION', 'DICE_MULTIPLIER', 180, 0, null, null, null, null, null, null, null, null, 90, 99),
('parque-metropolitano', '5.1', null, null, 'Parque Metropolitano', 'PARK', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('cerro-santa-lucia', '5.2', null, null, 'Cerro Santa Lucía', 'PARK', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('parque-forestal', '5.3', null, null, 'Parque Forestal', 'PARK', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83),
('parque-ohiggins', '5.4', null, null, 'Parque O''Higgins', 'PARK', 'DICE_MULTIPLIER', 150, 0, null, null, null, null, null, null, null, null, 75, 83);

-- 2. Insert Board Layout (re-linking by slug)
INSERT INTO board_layout (position, type, property_id) VALUES 
(0, 'CORNER', NULL), -- Salida
(1, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-la-estrella')),
(2, 'COMMUNITY', NULL),
(3, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-jose-joaquin-perez')),
(4, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-mapocho')),
(5, 'TAX', NULL), -- Impuesto
(6, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-pajaritos')),
(7, 'UTILITY', (SELECT id FROM properties WHERE slug='costanera-center')),
(8, 'RAILROAD', (SELECT id FROM properties WHERE slug='aeropuerto-amb')),
(9, 'PROPERTY', (SELECT id FROM properties WHERE slug='camino-a-rinconada')),
(10, 'PROPERTY', (SELECT id FROM properties WHERE slug='camino-a-melipilla')),
(11, 'UTILITY', (SELECT id FROM properties WHERE slug='parque-metropolitano')),
(12, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-la-florida')),
(13, 'CHANCE', NULL),
(14, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-walker-martinez')),
(15, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-trinidad')),
(16, 'CORNER', NULL), -- Carcel
(17, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-concha-y-toro')),
(18, 'UTILITY', (SELECT id FROM properties WHERE slug='enel')),
(19, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-camilo-henriquez')),
(20, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-santa-rosa')),
(21, 'UTILITY', (SELECT id FROM properties WHERE slug='movistar-arena')),
(22, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-macul')),
(23, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-jp-alessandri')),
(24, 'RAILROAD', (SELECT id FROM properties WHERE slug='terminal-san-borja')), -- FIXED
(25, 'UTILITY', (SELECT id FROM properties WHERE slug='cerro-santa-lucia')),
(26, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-quilin')),
(27, 'COMMUNITY', NULL),
(28, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-grecia')),
(29, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-tobalaba')),
(30, 'UTILITY', (SELECT id FROM properties WHERE slug='aguas-andinas')),
(31, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-oriental')),
(32, 'CORNER', NULL), -- Parada Libre
(33, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-irarrazaval')),
(34, 'UTILITY', (SELECT id FROM properties WHERE slug='wom')),
(35, 'CHANCE', NULL),
(36, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-simon-bolivar')),
(37, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-pedro-de-valdivia')),
(38, 'UTILITY', (SELECT id FROM properties WHERE slug='estadio-nacional')),
(39, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-jose-arrieta')),
(40, 'RAILROAD', (SELECT id FROM properties WHERE slug='terminal-los-heroes')),
(41, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-ossa')),
(42, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-principe-de-gales')),
(43, 'UTILITY', (SELECT id FROM properties WHERE slug='parque-forestal')),
(44, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-eliodoro-yanez')),
(45, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-salvador')),
(46, 'UTILITY', (SELECT id FROM properties WHERE slug='gasco')),
(47, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-manuel-montt')),
(48, 'CORNER', NULL), -- Ve a la carcel
(49, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-apoquindo')),
(50, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-kennedy')),
(51, 'UTILITY', (SELECT id FROM properties WHERE slug='metro-santiago')),
(52, 'COMMUNITY', NULL),
(53, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-tomas-moro')),
(54, 'UTILITY', (SELECT id FROM properties WHERE slug='parque-arauco')),
(55, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-andres-bello')),
(56, 'RAILROAD', (SELECT id FROM properties WHERE slug='estacion-central')),
(57, 'UTILITY', (SELECT id FROM properties WHERE slug='transantiago')),
(58, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-tabancura')),
(59, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-manquehue')),
(60, 'CHANCE', NULL),
(61, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-los-trapenses')),
(62, 'TAX', NULL), -- Impuesto Lujo
(63, 'PROPERTY', (SELECT id FROM properties WHERE slug='av-el-rodeo'));
