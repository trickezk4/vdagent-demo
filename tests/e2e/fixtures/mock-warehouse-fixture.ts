import { DatabaseSync } from 'node:sqlite';

export interface UnitSnapshotRecord {
  unit_id: string;
  unit_code: string;
  zone_name: string;
  project_name: string;
  bedroom_count: number;
  area_sqm: number;
  list_price: number;
  net_price: number;
  dom: number;
  status: string;
}

export const WAREHOUSE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dim_markets (
  market_id TEXT PRIMARY KEY,
  market_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Vietnam'
);

CREATE TABLE IF NOT EXISTS dim_projects (
  project_id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  developer TEXT NOT NULL,
  address TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES dim_markets(market_id)
);

CREATE TABLE IF NOT EXISTS dim_zones (
  zone_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  zone_code TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES dim_projects(project_id)
);

CREATE TABLE IF NOT EXISTS dim_units (
  unit_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  unit_code TEXT NOT NULL UNIQUE,
  unit_type TEXT NOT NULL,
  bedroom_count INT NOT NULL,
  area_sqm REAL NOT NULL,
  floor_number INT NOT NULL,
  orientation TEXT NOT NULL,
  list_price REAL NOT NULL,
  net_price REAL NOT NULL,
  FOREIGN KEY (zone_id) REFERENCES dim_zones(zone_id)
);

CREATE TABLE IF NOT EXISTS fact_unit_snapshot (
  snapshot_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  status TEXT NOT NULL,
  dom INT NOT NULL,
  price_variance_pct REAL NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES dim_units(unit_id)
);
`;

export const SEED_UNITS = [
  // 3 Slow-moving units with DOM = 115 days (> 90 days)
  {
    unit_id: 'UNIT-VHOP-S1-01',
    zone_id: 'ZONE-VHOP-SAPPHIRE-1',
    unit_code: 'S1.02-12A08',
    unit_type: '2PN+1',
    bedroom_count: 2,
    area_sqm: 64.5,
    floor_number: 13,
    orientation: 'North-West (Tây Bắc, nắng gắt)',
    list_price: 3600000000,
    net_price: 3500000000,
    dom: 115,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S1-02',
    zone_id: 'ZONE-VHOP-SAPPHIRE-1',
    unit_code: 'S1.05-0402',
    unit_type: '3PN',
    bedroom_count: 3,
    area_sqm: 80.2,
    floor_number: 4,
    orientation: 'West (Tây)',
    list_price: 4500000000,
    net_price: 4350000000,
    dom: 115,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S2-05',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.01-0810',
    unit_type: '2PN',
    bedroom_count: 2,
    area_sqm: 55.0,
    floor_number: 8,
    orientation: 'North (Bắc)',
    list_price: 2900000000,
    net_price: 2850000000,
    dom: 115,
    status: 'AVAILABLE',
  },
  // Normal moving units (DOM <= 90 days)
  {
    unit_id: 'UNIT-VHOP-S1-03',
    zone_id: 'ZONE-VHOP-SAPPHIRE-1',
    unit_code: 'S1.01-1506',
    unit_type: '1PN',
    bedroom_count: 1,
    area_sqm: 43.0,
    floor_number: 15,
    orientation: 'South-East (Đông Nam, mát mẻ)',
    list_price: 2200000000,
    net_price: 2150000000,
    dom: 45,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S1-04',
    zone_id: 'ZONE-VHOP-SAPPHIRE-1',
    unit_code: 'S1.02-2005',
    unit_type: '2PN',
    bedroom_count: 2,
    area_sqm: 54.8,
    floor_number: 20,
    orientation: 'South-East (Đông Nam)',
    list_price: 3100000000,
    net_price: 3050000000,
    dom: 30,
    status: 'SOLD',
  },
  {
    unit_id: 'UNIT-VHOP-S2-01',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.02-1002',
    unit_type: 'Studio',
    bedroom_count: 0,
    area_sqm: 32.0,
    floor_number: 10,
    orientation: 'South (Nam)',
    list_price: 1500000000,
    net_price: 1480000000,
    dom: 20,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S2-02',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.03-1808',
    unit_type: '2PN',
    bedroom_count: 2,
    area_sqm: 63.5,
    floor_number: 18,
    orientation: 'East (Đông)',
    list_price: 3400000000,
    net_price: 3300000000,
    dom: 60,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S2-03',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.04-2201',
    unit_type: '3PN',
    bedroom_count: 3,
    area_sqm: 79.5,
    floor_number: 22,
    orientation: 'North-East (Đông Bắc)',
    list_price: 4300000000,
    net_price: 4200000000,
    dom: 75,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S2-04',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.05-0909',
    unit_type: '2PN+1',
    bedroom_count: 2,
    area_sqm: 68.0,
    floor_number: 9,
    orientation: 'South-West (Tây Nam)',
    list_price: 3750000000,
    net_price: 3680000000,
    dom: 85,
    status: 'AVAILABLE',
  },
  {
    unit_id: 'UNIT-VHOP-S2-06',
    zone_id: 'ZONE-VHOP-SAPPHIRE-2',
    unit_code: 'S2.06-1111',
    unit_type: 'Studio',
    bedroom_count: 0,
    area_sqm: 31.5,
    floor_number: 11,
    orientation: 'East (Đông)',
    list_price: 1450000000,
    net_price: 1420000000,
    dom: 15,
    status: 'AVAILABLE',
  },
];

/**
 * Creates an in-memory SQLite warehouse populated with the 4-tier hierarchy
 * and 10 sample units.
 */
export function createMockWarehouse(): DatabaseSync {
  const db = new DatabaseSync(':memory:');

  // Execute schema DDL
  db.exec(WAREHOUSE_SCHEMA_SQL);

  // Seed Market
  db.prepare(`
    INSERT INTO dim_markets (market_id, market_name, city, country)
    VALUES ('MKT-HAN', 'Hà Nội Real Estate Market', 'Hà Nội', 'Vietnam')
  `).run();

  // Seed Project
  db.prepare(`
    INSERT INTO dim_projects (project_id, market_id, project_name, developer, address)
    VALUES ('PRJ-VHOP', 'MKT-HAN', 'Vinhomes Ocean Park', 'Vingroup', 'Gia Lâm, Hà Nội')
  `).run();

  // Seed Zones
  db.prepare(`
    INSERT INTO dim_zones (zone_id, project_id, zone_name, zone_code)
    VALUES 
      ('ZONE-VHOP-SAPPHIRE-1', 'PRJ-VHOP', 'Phân khu Sapphire 1', 'SAPPHIRE-1'),
      ('ZONE-VHOP-SAPPHIRE-2', 'PRJ-VHOP', 'Phân khu Sapphire 2', 'SAPPHIRE-2')
  `).run();

  // Seed Units & Fact Snapshots
  const insertUnit = db.prepare(`
    INSERT INTO dim_units (
      unit_id, zone_id, unit_code, unit_type, bedroom_count, area_sqm,
      floor_number, orientation, list_price, net_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSnapshot = db.prepare(`
    INSERT INTO fact_unit_snapshot (
      snapshot_id, unit_id, snapshot_date, status, dom, price_variance_pct
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const u of SEED_UNITS) {
    insertUnit.run(
      u.unit_id,
      u.zone_id,
      u.unit_code,
      u.unit_type,
      u.bedroom_count,
      u.area_sqm,
      u.floor_number,
      u.orientation,
      u.list_price,
      u.net_price
    );

    const priceVar = ((u.net_price - u.list_price) / u.list_price) * 100;
    insertSnapshot.run(
      `SNAP-${u.unit_id}`,
      u.unit_id,
      '2026-09-26',
      u.status,
      u.dom,
      Number(priceVar.toFixed(2))
    );
  }

  return db;
}

/**
 * Query units filtered by Days on Market (DOM) threshold.
 */
export function querySlowMovingUnits(db: DatabaseSync, domThreshold = 90): UnitSnapshotRecord[] {
  const query = `
    SELECT 
      u.unit_id,
      u.unit_code,
      z.zone_name,
      p.project_name,
      u.bedroom_count,
      u.area_sqm,
      u.list_price,
      u.net_price,
      f.dom,
      f.status
    FROM fact_unit_snapshot f
    JOIN dim_units u ON f.unit_id = u.unit_id
    JOIN dim_zones z ON u.zone_id = z.zone_id
    JOIN dim_projects p ON z.project_id = p.project_id
    WHERE f.dom > ?
    ORDER BY f.dom DESC
  `;

  return db.prepare(query).all(domThreshold) as unknown as UnitSnapshotRecord[];
}
