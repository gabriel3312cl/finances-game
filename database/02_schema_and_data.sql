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
    id VARCHAR(255) PRIMARY KEY, -- Widened to 255
    code VARCHAR(50), -- Widened
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    state TEXT, -- Stores JSON State blob (was VARCHAR causing truncation)
    active BOOLEAN DEFAULT TRUE,
    current_turn_player_id UUID,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Game Players (Session Participants)
CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE, -- Match games.id
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_color TEXT, -- Unlimited length for CSS
    balance BIGINT DEFAULT 1500,
    position INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    is_bankrupt BOOLEAN DEFAULT FALSE,
    inventory JSONB DEFAULT '[]',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);

-- Properties State (Per Game)
CREATE TABLE IF NOT EXISTS game_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE, -- Match games.id
    property_id VARCHAR(255) NOT NULL, -- Widened
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Changed to match UserID logic
    mortgaged BOOLEAN DEFAULT FALSE,
    houses INT DEFAULT 0,
    hotels INT DEFAULT 0,
    UNIQUE(game_id, property_id)
);

-- Audit/History Logs
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE, -- Match games.id
    player_id UUID REFERENCES game_players(id) ON DELETE CASCADE,
    action_type VARCHAR(255) NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Loans Table
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(255) REFERENCES games(id) ON DELETE CASCADE, -- Match games.id
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) UNIQUE, -- For easier lookups/seeding (e.g. 'av-la-estrella')
    group_id VARCHAR(50),    -- Can keep as string "1.1" or change to UUID of a 'groups' table later
    group_name VARCHAR(100), -- e.g. "Cerro Navia"
    group_color VARCHAR(50), -- e.g. "#3b82f6"
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'PROPERTY',
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
TRUNCATE properties CASCADE;

-- Board Layout (Defines which property is at which index)
CREATE TABLE IF NOT EXISTS board_layout (
    position INT PRIMARY KEY, -- 0 to 63
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL -- PROPERTY, CORNER, CHANCE, ETC.
);
TRUNCATE board_layout;

-- Helper to insert property and layout
-- We will use a DO block or simple INSERTs with subqueries if possible, or just raw values if we generate UUIDs.
-- EASIEST: Generate specific UUIDs for seeding so we can link them? 
-- OR: Use the 'slug' to link them.

-- 1. Insert Properties (using helper slugs for linking)
-- GROUP 1.1 (Blue - Cerro Navia)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-la-estrella', '1.1', 'Cerro Navia', '#3b82f6', 'Av. La Estrella', 'PROPERTY', 60, 2, 4, 10, 2, 3, 4, 150, 50, 50, 30, 33),
('av-jose-joaquin-perez', '1.1', 'Cerro Navia', '#3b82f6', 'Av. José Joaquín Pérez', 'PROPERTY', 60, 2, 4, 10, 2, 3, 4, 150, 50, 50, 30, 33),
('av-mapocho', '1.1', 'Cerro Navia', '#3b82f6', 'Av. Mapocho', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 40, 44);

-- GROUP 1.2 (White - Maipu)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-pajaritos', '1.2', 'Maipú', '#ffffff', 'Av. Pajaritos', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 60, 66),
('camino-a-rinconada', '1.2', 'Maipú', '#ffffff', 'Camino a Rinconada', 'PROPERTY', 80, 4, 8, 20, 2, 3, 4, 450, 50, 50, 50, 55),
('camino-a-melipilla', '1.2', 'Maipú', '#ffffff', 'Camino a Melipilla', 'PROPERTY', 100, 8, 16, 40, 2, 3, 4, 600, 50, 50, 50, 55);

-- GROUP 1.3 (Red - La Florida)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-la-florida', '1.3', 'La Florida', '#ef4444', 'Av. La Florida', 'PROPERTY', 100, 6, 12, 30, 2, 3, 4, 550, 50, 50, 50, 55),
('av-walker-martinez', '1.3', 'La Florida', '#ef4444', 'Av. Walker Martínez', 'PROPERTY', 100, 6, 12, 30, 2, 3, 4, 550, 50, 50, 50, 55),
('av-trinidad', '1.3', 'La Florida', '#ef4444', 'Av. Trinidad', 'PROPERTY', 120, 8, 16, 40, 2, 3, 4, 600, 50, 50, 60, 66);

-- GROUP 1.4 (Orange - Puente Alto)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-concha-y-toro', '1.4', 'Puente Alto', '#f97316', 'Av. Concha y Toro', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77),
('av-camilo-henriquez', '1.4', 'Puente Alto', '#f97316', 'Av. Camilo Henríquez', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77),
('av-santa-rosa', '1.4', 'Puente Alto', '#f97316', 'Av. Santa Rosa', 'PROPERTY', 160, 12, 24, 60, 2, 3, 4, 900, 100, 100, 80, 88);

-- GROUP 1.5 (Light Blue - Macul)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-macul', '1.5', 'Macul', '#06b6d4', 'Av. Macul', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77),
('av-jp-alessandri', '1.5', 'Macul', '#06b6d4', 'Av. J.P. Alessandri', 'PROPERTY', 140, 10, 20, 50, 2, 3, 4, 750, 100, 100, 70, 77),
('av-quilin', '1.5', 'Macul', '#06b6d4', 'Av. Quilín', 'PROPERTY', 160, 12, 24, 60, 2, 3, 4, 900, 100, 100, 80, 88);

-- GROUP 1.6 (Purple - Peñalolén)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-grecia', '1.6', 'Peñalolén', '#a855f7', 'Av. Grecia', 'PROPERTY', 180, 14, 28, 70, 2, 3, 4, 950, 100, 100, 90, 99),
('av-tobalaba', '1.6', 'Peñalolén', '#a855f7', 'Av. Tobalaba', 'PROPERTY', 180, 14, 28, 70, 2, 3, 4, 950, 100, 100, 90, 99),
('av-oriental', '1.6', 'Peñalolén', '#a855f7', 'Av. Oriental', 'PROPERTY', 200, 16, 32, 80, 2, 3, 4, 1000, 100, 100, 100, 110);

-- GROUP 1.7 (Yellow - Ñuñoa)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-irarrazaval', '1.7', 'Ñuñoa', '#eab308', 'Av. Irarrázaval', 'PROPERTY', 220, 18, 36, 90, 2, 3, 4, 1050, 150, 150, 110, 121),
('av-simon-bolivar', '1.7', 'Ñuñoa', '#eab308', 'Av. Simón Bolívar', 'PROPERTY', 220, 18, 36, 90, 2, 3, 4, 1050, 150, 150, 110, 121),
('av-pedro-de-valdivia', '1.7', 'Ñuñoa', '#eab308', 'Av. Pedro de Valdivia', 'PROPERTY', 240, 20, 40, 100, 2, 3, 4, 1100, 150, 150, 120, 132);

-- GROUP 1.8 (Green - La Reina)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-jose-arrieta', '1.8', 'La Reina', '#22c55e', 'Av. José Arrieta', 'PROPERTY', 260, 22, 44, 110, 2, 3, 4, 1150, 150, 150, 130, 143),
('av-ossa', '1.8', 'La Reina', '#22c55e', 'Av. Ossa', 'PROPERTY', 260, 22, 44, 110, 2, 3, 4, 1150, 150, 150, 130, 143),
('av-principe-de-gales', '1.8', 'La Reina', '#22c55e', 'Av. Príncipe de Gales', 'PROPERTY', 280, 24, 48, 120, 2, 3, 4, 1200, 150, 150, 140, 154);

-- GROUP 1.9 (Silver - Providencia)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-eliodoro-yanez', '1.9', 'Providencia', '#94a3b8', 'Av. Eliodoro Yáñez', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-salvador', '1.9', 'Providencia', '#94a3b8', 'Av. Salvador', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-manuel-montt', '1.9', 'Providencia', '#94a3b8', 'Av. Manuel Montt', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176);

-- GROUP 1.10 (Dark Grey - Las Condes)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-apoquindo', '1.10', 'Las Condes', '#4b5563', 'Av. Apoquindo', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-kennedy', '1.10', 'Las Condes', '#4b5563', 'Av. Kennedy', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-tomas-moro', '1.10', 'Las Condes', '#4b5563', 'Av. Tomás Moro', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176);

-- GROUP 1.11 (Brown - Vitacura)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-andres-bello', '1.11', 'Vitacura', '#78350f', 'Av. Andrés Bello', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-tabancura', '1.11', 'Vitacura', '#78350f', 'Av. Tabancura', 'PROPERTY', 300, 26, 52, 130, 2, 3, 4, 1275, 200, 200, 150, 165),
('av-manquehue', '1.11', 'Vitacura', '#78350f', 'Av. Manquehue', 'PROPERTY', 320, 28, 56, 150, 2, 3, 4, 1400, 200, 200, 160, 176);

-- GROUP 1.12 (Black - Lo Barnechea)
INSERT INTO properties (slug, group_id, group_name, group_color, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES 
('av-los-trapenses', '1.12', 'Lo Barnechea', '#000000', 'Av. Los Trapenses', 'PROPERTY', 400, 50, 100, 200, 2, 3, 4, 2000, 200, 200, 200, 220),
('av-el-rodeo', '1.12', 'Lo Barnechea', '#000000', 'Av. El Rodeo', 'PROPERTY', 400, 50, 100, 200, 2, 3, 4, 2000, 200, 200, 200, 220);

-- RAILROADS (Group 2.x)
INSERT INTO properties (slug, group_id, name, type, price, rent_base, mortgage_value, unmortgage_value) VALUES 
('aeropuerto-amb', '2.1', 'Aeropuerto Arturo Merino Benítez', 'RAILROAD', 200, 25, 100, 110),
('terminal-alameda', '2.2', 'Terminal Alameda', 'RAILROAD', 200, 25, 100, 110),
('terminal-los-heroes', '2.3', 'Terminal Los Héroes', 'RAILROAD', 200, 25, 100, 110),
('estacion-central', '2.4', 'Estación Central', 'RAILROAD', 200, 25, 100, 110);

-- UTILITIES (Group 3.x, 4.x, 5.x)
INSERT INTO properties (slug, group_id, name, type, price, rent_base, mortgage_value, unmortgage_value) VALUES 
('enel', '3.1', 'Enel', 'UTILITY', 150, 0, 75, 83),
('aguas-andinas', '3.2', 'Aguas Andinas', 'UTILITY', 150, 0, 75, 83),
('wom', '3.3', 'WOM', 'UTILITY', 150, 0, 75, 83),
('gasco', '3.4', 'Gasco', 'UTILITY', 150, 0, 75, 83),
('metro-santiago', '3.5', 'Metro de Santiago', 'UTILITY', 150, 0, 75, 83),
('transantiago', '3.6', 'Transantiago', 'UTILITY', 150, 0, 75, 83),
('costanera-center', '4.1', 'Costanera Center', 'UTILITY', 180, 0, 90, 99),
('movistar-arena', '4.2', 'Movistar Arena', 'UTILITY', 180, 0, 90, 99),
('estadio-nacional', '4.3', 'Estadio Nacional', 'UTILITY', 180, 0, 90, 99),
('parque-arauco', '4.4', 'Parque Arauco', 'UTILITY', 180, 0, 90, 99),
('parque-metropolitano', '5.1', 'Parque Metropolitano', 'UTILITY', 150, 0, 75, 83),
('cerro-santa-lucia', '5.2', 'Cerro Santa Lucía', 'UTILITY', 150, 0, 75, 83),
('parque-forestal', '5.3', 'Parque Forestal', 'UTILITY', 150, 0, 75, 83);


-- SEED BOARD LAYOUT (Mapping Position -> UUID)
-- We select UUID from properties by slug
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
(24, 'RAILROAD', (SELECT id FROM properties WHERE slug='terminal-alameda')),
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
