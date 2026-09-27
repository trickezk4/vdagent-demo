-- =====================================================================
-- VDaAgent PoC: Real Estate 4-Level Data Warehouse Schema
-- Level 1: Market -> Level 2: Project -> Level 3: Zone -> Level 4: Unit
-- Fact: fact_unit_snapshot
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Level 1: dim_markets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_markets (
    market_id TEXT PRIMARY KEY,
    market_name TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Level 2: dim_projects
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_projects (
    project_id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL REFERENCES dim_markets(market_id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    developer TEXT NOT NULL,
    launch_year INTEGER NOT NULL,
    total_units INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dim_projects_market ON dim_projects(market_id);

-- ---------------------------------------------------------------------
-- Level 3: dim_zones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_zones (
    zone_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES dim_projects(project_id) ON DELETE CASCADE,
    zone_name TEXT NOT NULL,
    segment TEXT NOT NULL, -- e.g., 'Mid-end', 'Upper-mid', 'High-end', 'Luxury'
    handover_year INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dim_zones_project ON dim_zones(project_id);

-- ---------------------------------------------------------------------
-- Level 4: dim_units
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_units (
    unit_id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL REFERENCES dim_zones(zone_id) ON DELETE CASCADE,
    unit_code TEXT NOT NULL UNIQUE,
    building TEXT NOT NULL,
    floor_level INTEGER NOT NULL,
    bedroom_count INTEGER NOT NULL,
    bathroom_count INTEGER NOT NULL DEFAULT 1,
    area_sqm REAL NOT NULL,
    view_direction TEXT NOT NULL, -- 'West', 'East-South', 'Lake', 'Internal Garden', etc.
    launch_price_vnd REAL NOT NULL,
    net_price_vnd REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dim_units_zone ON dim_units(zone_id);
CREATE INDEX IF NOT EXISTS idx_dim_units_code ON dim_units(unit_code);
CREATE INDEX IF NOT EXISTS idx_dim_units_bedroom ON dim_units(bedroom_count);
CREATE INDEX IF NOT EXISTS idx_dim_units_area ON dim_units(area_sqm);

-- ---------------------------------------------------------------------
-- Fact Table: fact_unit_snapshot
-- Captures operational snapshot metrics per unit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_unit_snapshot (
    snapshot_id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES dim_units(unit_id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,
    dom INTEGER NOT NULL, -- Days on Market
    status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD')),
    views_count INTEGER NOT NULL DEFAULT 0,
    inquiries_count INTEGER NOT NULL DEFAULT 0,
    price_cut_count INTEGER NOT NULL DEFAULT 0,
    current_asking_price_vnd REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fact_unit_id ON fact_unit_snapshot(unit_id);
CREATE INDEX IF NOT EXISTS idx_fact_dom ON fact_unit_snapshot(dom);
CREATE INDEX IF NOT EXISTS idx_fact_status ON fact_unit_snapshot(status);
