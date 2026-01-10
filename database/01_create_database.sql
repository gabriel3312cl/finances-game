-- 1. Setup Database and User
-- Run this script FIRST while connected to 'postgres'

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
DROP DATABASE IF EXISTS finances_game;
CREATE DATABASE finances_game OWNER finances_user;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE finances_game TO finances_user;

-- AFTER RUNNING THIS:
-- 1. Disconnect from 'postgres'
-- 2. Connect to the new 'finances_game' database
-- 3. Run '02_schema_and_data.sql'
