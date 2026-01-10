-- 2. Schema Definitions
-- Run this script SECOND, ensuring you are connected to 'finances_game'

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Valid Registration Codes
CREATE TABLE IF NOT EXISTS valid_codes (
    code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    special_code VARCHAR(20) REFERENCES valid_codes(code), -- Enforce FK
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
    property_id VARCHAR(50) NOT NULL, -- ID from rules (e.g., 1.1.1)
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

-- Default Data
INSERT INTO valid_codes (code, description) VALUES ('BETA123', 'Default beta access code') ON CONFLICT DO NOTHING;


-- Community Chest Cards
CREATE TABLE IF NOT EXISTS community_chest_cards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    action TEXT
);
TRUNCATE community_chest_cards RESTART IDENTITY;
INSERT INTO community_chest_cards (title, description, action) VALUES ('el seguro de vida', 'te reporta beneficios', 'cobra 100m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('avanza a la salida', 'avanza hasta la salida', 'cobra 200m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('gastos escolares', 'gastos escolares', 'paga 50m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('herencia misteriosa', 'recibes una herencia misteriosa', 'cobra 100m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('ve a la carcel', 've directamente a la carcel, no pases por la salida ni cobres 200m', 'encarcelado');
INSERT INTO community_chest_cards (title, description, action) VALUES ('adopcion', 'adoptas un perrito', 'paga 50m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('facturas', 'facturas de hospital', 'paga 100m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('pase gratis', 'sal de la carcel gratis, puedes vender o intercambiar esta tarjeta, o guardarla hasta que la necesites', 'salir de la carsel, se puede guardar en el inventario');
INSERT INTO community_chest_cards (title, description, action) VALUES ('reparaciones viales', 'debes hacer reparaciones viales', 'por cada casa, paga 40m, por cada hotel, paga 115m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('error bancario', 'error bancario a tu favor', 'cobra 200m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('cumpleaños', 'es tu cumpleaños', 'cobra 10m a cada jugador');
INSERT INTO community_chest_cards (title, description, action) VALUES ('concurso de belleza', 'has ganado el segundo premio en un concurso de belleza', 'cobra 10m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('acciones', 'por venta de acciones', 'cobra 50m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('impuestos', 'devolucion de impuestos', 'cobra 20m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('honorarios', 'honorarios de consultoria', 'cobra 25m');
INSERT INTO community_chest_cards (title, description, action) VALUES ('vacaciones', 'el fondo vacacional te reporta beneficios', 'cobra 100');

-- Chance Cards
CREATE TABLE IF NOT EXISTS chance_cards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    action TEXT
);
TRUNCATE chance_cards RESTART IDENTITY;
INSERT INTO chance_cards (title, description, action) VALUES ('multa', 'multa por exceso de velocidad', 'paga 15m');
INSERT INTO chance_cards (title, description, action) VALUES ('reparaciones generales', 'haz reparaciones generales en todas tus propiedades', 'por cada casa, paga 25m, por cada hotel, paga 100m');
INSERT INTO chance_cards (title, description, action) VALUES ('avanza a (avenida aleatoria)', 'avanza a (avenida aleatoria), si pasas por la salida, cobra 200m', 'avanzar a avenida aleatoria, si pasa por la salida, cobra 200m');
INSERT INTO chance_cards (title, description, action) VALUES ('avanza a un transporte', 'avanza hacia (transporte aleatorio), si no tiene dueño, puedes comprarlo al banco, si tiene dueño, paga el doble de la renta, si pasas por la salida, cobra 200m', 'avanzar a transporte aleatorio, si no tiene dueño comprarla, si tiene dueño, pagar el doble de renta, si pasa por la salida, cobra 200m');
INSERT INTO chance_cards (title, description, action) VALUES ('pase gratis', 'sal de la carcel gratis, puedes intercambiar o vender esta tarjeta, o guardarla hasta que la necesites', 'salir de la carsel, se puede guardar en el inventario');
INSERT INTO chance_cards (title, description, action) VALUES ('avanza hacia un servicio', 'avanza hasta el servicio publico mas cercano, si no tiene dueño, puedes comprarlo al banco, si tiene dueño, tira los dados y paga al dueño un total de diez veces la cantidad mostrada, si pasas por la salida, cobra 200m', 'avanzar al servicio mas cercano, si no tiene dueño comprarla, si tiene dueño,tira los dados y paga al dueño un total de diez veces la cantidad mostrada, si pasa por la salida, cobra 200m');
INSERT INTO chance_cards (title, description, action) VALUES ('prestamo', 'por cumplimiento en el pago del prestamo de construccion, cobra 150m', 'cobrar 150m');
INSERT INTO chance_cards (title, description, action) VALUES ('avanzar a la salida', 'avanza hasta la salida', 'cobra 500m');
INSERT INTO chance_cards (title, description, action) VALUES ('presidente', 'has sido elegido presidente del consejo de administracion', 'paga a cada jugador 50m');
INSERT INTO chance_cards (title, description, action) VALUES ('dividendos', 'el banco te paga un dividendo de 50m', 'cobra 50m');
INSERT INTO chance_cards (title, description, action) VALUES ('retroceder', 'retrocede tres casillas', 'retrocede 3 casillas');
INSERT INTO chance_cards (title, description, action) VALUES ('avanza hasta (la ultima casilla de propiedad)', 'avanza hasta (la ultima casilla de propiedad)', 'avanza hasta la ultima casilla de propiedad');
INSERT INTO chance_cards (title, description, action) VALUES ('a la carcel', 've a la carcel, directamente, no pases por la salida ni cobres 200m', 've a la carcel');

-- Properties
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    group_id VARCHAR(50),
    name VARCHAR(255),
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
    unmortgage_value INT,
    type VARCHAR(50) DEFAULT 'PROPERTY'
);
TRUNCATE properties;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.1.1', 'Av. La Estrella', 'PROPERTY', 60, 2, 4, 10, 2, 3, 4, 150, 50, 50, 30, 33) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.1.2', 'Av. José Joaquín Pérez', 'PROPERTY', 60, 2, 4, 10, 2, 3, 4, 150, 50, 50, 30, 33) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.1.3', 'Av. Mapocho', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 40, 44) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.2.1', 'Av. Pajaritos', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 60, 66) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.2.2', 'Camino a Rinconada', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 50, 55) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.2.3', 'Camino a Melipilla', 'PROPERTY', 100, 8, 16, 40, 2, 3, 4, 600, 50, 50, 50, 55) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.3.1', 'Av. La Florida', 'PROPERTY', 100, 6, 12, 30, 2, 3, 4, 550, 50, 50, 50, 55) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.3.2', 'Av. Walker Martínez', 'PROPERTY', 100, 6, 12, 30, 2, 3, 4, 550, 50, 50, 50, 55) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.3.3', 'Av. Trinidad', 'PROPERTY', 120, 8, 16, 40, 2, 3, 4, 600, 50, 50, 60, 66) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.4.1', 'Av. Concha y Toro', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.4.2', 'Av. Camilo Henríquez', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.4.3', 'Av. Santa Rosa', 'PROPERTY', 160, 12, 24, 60, 2, 3, 4, 900, 100, 100, 80, 88) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.5.1', 'Av. Macul', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.5.2', 'Av. José Pedro Alessandri', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.5.3', 'Av. Quilin', 'PROPERTY', 160, 12, 24, 60, 2, 3, 4, 900, 100, 100, 80, 88) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.6.1', 'Av. Grecia', 'PROPERTY', 180, 14, 28, 70, 2, 3, 4, 950, 100, 100, 90, 99) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.6.2', 'Av. Tobalaba', 'PROPERTY', 180, 14, 28, 70, 2, 3, 4, 950, 100, 100, 90, 99) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.6.3', 'Av. Oriental', 'PROPERTY', 200, 16, 32, 80, 2, 3, 4, 1000, 100, 100, 100, 110) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.7.1', 'Av. Irarrázaval', 'PROPERTY', 220, 18, 36, 90, 2, 3, 4, 1050, 150, 150, 110, 121) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.7.2', 'Av. Simón Bolívar', 'PROPERTY', 220, 18, 36, 90, 2, 3, 4, 1050, 150, 150, 110, 121) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.7.3', 'Av. Pedro de Valdivia', 'PROPERTY', 240, 20, 40, 100, 2, 3, 4, 1100, 150, 150, 120, 132) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.8.1', 'Av. José Arrieta', 'PROPERTY', 260, 22, 44, 110, 2, 3, 4, 1150, 150, 150, 130, 143) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.8.2', 'Av. Ossa', 'PROPERTY', 260, 22, 44, 110, 2, 3, 4, 1150, 150, 150, 130, 143) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.8.3', 'Av. Príncipe de Gales', 'PROPERTY', 280, 24, 48, 120, 2, 3, 4, 1200, 150, 150, 140, 154) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.9.1', 'Av. Eliodoro Yáñez', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.9.2', 'Av. Salvador', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.9.3', 'Av. Manuel Montt', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.10.1', 'Av. Apoquindo', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.10.2', 'Av. Kennedy', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.10.3', 'Av. Tomás Moro', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.11.1', 'Av. Andrés Bello', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.11.2', 'Av. Tabancura', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.11.3', 'Av. Manquehue', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.12.1', 'Av. Los Trapenses', 'PROPERTY', 400, 50, 100, 200, 2, 3, 4, 2000, 200, 200, 200, 220) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('1.12.2', 'Av. El Rodeo', 'PROPERTY', 400, 50, 100, 200, 2, 3, 4, 2000, 200, 200, 200, 220) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('2.1', 'Aeropuerto Arturo Merino Benítez', 'RAILROAD', 200, 25, 0, 0, 0, 0, 0, 0, 0, 0, 100, 110) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('2.2', 'Terminal Alameda', 'RAILROAD', 200, 25, 0, 0, 0, 0, 0, 0, 0, 0, 100, 110) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('2.3', 'Terminal Los Héroes', 'RAILROAD', 200, 25, 0, 0, 0, 0, 0, 0, 0, 0, 100, 110) ON CONFLICT(id) DO NOTHING;
INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('2.4', 'Estación Central', 'RAILROAD', 200, 25, 0, 0, 0, 0, 0, 0, 0, 0, 100, 110) ON CONFLICT(id) DO NOTHING;
