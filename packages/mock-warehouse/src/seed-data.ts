import type { MarketRecord, ProjectRecord, ZoneRecord, UnitRecord, UnitSnapshotRecord } from './types.js';
import type { ISqliteDb } from './driver.js';

export const SEED_MARKETS: MarketRecord[] = [
  {
    market_id: 'MKT-HN-EAST',
    market_name: 'Hà Nội - Khu Đông',
    city: 'Hà Nội',
    region: 'Miền Bắc',
  },
];

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    project_id: 'PRJ-VH-OCP',
    market_id: 'MKT-HN-EAST',
    project_name: 'Vinhomes Ocean Park',
    developer: 'Vingroup',
    launch_year: 2019,
    total_units: 12000,
  },
  {
    project_id: 'PRJ-MAS-WF',
    market_id: 'MKT-HN-EAST',
    project_name: 'Masteri Waterfront',
    developer: 'Masterise Homes',
    launch_year: 2020,
    total_units: 3800,
  },
];

export const SEED_ZONES: ZoneRecord[] = [
  {
    zone_id: 'ZONE-VH-SAPPHIRE',
    project_id: 'PRJ-VH-OCP',
    zone_name: 'The Sapphire 1',
    segment: 'Mid-end',
    handover_year: 2020,
  },
  {
    zone_id: 'ZONE-VH-RUBY',
    project_id: 'PRJ-VH-OCP',
    zone_name: 'The Ruby',
    segment: 'Upper-mid',
    handover_year: 2021,
  },
  {
    zone_id: 'ZONE-MAS-WF',
    project_id: 'PRJ-MAS-WF',
    zone_name: 'Masteri Waterfront - Miami',
    segment: 'High-end',
    handover_year: 2022,
  },
];

export const SEED_UNITS: UnitRecord[] = [
  // -------------------------------------------------------------
  // SAPPHIRE 1: 3 Slow-moving Units with DOM = 115 days
  // -------------------------------------------------------------
  {
    unit_id: 'UNIT-VH-01',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S102-1405',
    building: 'S1.02',
    floor_level: 14,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 55.4,
    view_direction: 'West',
    launch_price_vnd: 2850000000,
    net_price_vnd: 2700000000,
  },
  {
    unit_id: 'UNIT-VH-02',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S102-1406',
    building: 'S1.02',
    floor_level: 14,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 55.4,
    view_direction: 'West',
    launch_price_vnd: 2890000000,
    net_price_vnd: 2750000000,
  },
  {
    unit_id: 'UNIT-VH-03',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S105-0812',
    building: 'S1.05',
    floor_level: 8,
    bedroom_count: 1,
    bathroom_count: 1,
    area_sqm: 43.2,
    view_direction: 'West-North',
    launch_price_vnd: 2150000000,
    net_price_vnd: 2050000000,
  },
  // Additional slow-moving unit
  {
    unit_id: 'UNIT-VH-04',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S108-1902',
    building: 'S1.08',
    floor_level: 19,
    bedroom_count: 3,
    bathroom_count: 2,
    area_sqm: 75.6,
    view_direction: 'South-West',
    launch_price_vnd: 3800000000,
    net_price_vnd: 3600000000,
  },
  // -------------------------------------------------------------
  // SAPPHIRE 1: Benchmark Fast-moving Units
  // -------------------------------------------------------------
  {
    unit_id: 'UNIT-VH-05',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S101-0908',
    building: 'S1.01',
    floor_level: 9,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 54.8,
    view_direction: 'South-East',
    launch_price_vnd: 2600000000,
    net_price_vnd: 2480000000,
  },
  {
    unit_id: 'UNIT-VH-06',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S103-1204',
    building: 'S1.03',
    floor_level: 12,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 55.4,
    view_direction: 'Lake',
    launch_price_vnd: 2720000000,
    net_price_vnd: 2600000000,
  },
  {
    unit_id: 'UNIT-VH-07',
    zone_id: 'ZONE-VH-SAPPHIRE',
    unit_code: 'VH-OCP-S106-1510',
    building: 'S1.06',
    floor_level: 15,
    bedroom_count: 1,
    bathroom_count: 1,
    area_sqm: 43.0,
    view_direction: 'Internal Garden',
    launch_price_vnd: 1980000000,
    net_price_vnd: 1900000000,
  },
  // -------------------------------------------------------------
  // THE RUBY: Upper-Mid Units
  // -------------------------------------------------------------
  {
    unit_id: 'UNIT-VH-08',
    zone_id: 'ZONE-VH-RUBY',
    unit_code: 'VH-OCP-R101-0805',
    building: 'R1.01',
    floor_level: 8,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 68.5,
    view_direction: 'East-South',
    launch_price_vnd: 3600000000,
    net_price_vnd: 3450000000,
  },
  {
    unit_id: 'UNIT-VH-09',
    zone_id: 'ZONE-VH-RUBY',
    unit_code: 'VH-OCP-R102-1602',
    building: 'R1.02',
    floor_level: 16,
    bedroom_count: 3,
    bathroom_count: 2,
    area_sqm: 82.0,
    view_direction: 'Lake',
    launch_price_vnd: 4500000000, // 4.5 tỷ target
    net_price_vnd: 4300000000,
  },
  {
    unit_id: 'UNIT-VH-10',
    zone_id: 'ZONE-VH-RUBY',
    unit_code: 'VH-OCP-R103-1008',
    building: 'R1.03',
    floor_level: 10,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 65.0,
    view_direction: 'City',
    launch_price_vnd: 3400000000,
    net_price_vnd: 3250000000,
  },
  // -------------------------------------------------------------
  // MASTERI WATERFRONT: High-end Units
  // -------------------------------------------------------------
  {
    unit_id: 'UNIT-MAS-01',
    zone_id: 'ZONE-MAS-WF',
    unit_code: 'MAS-WF-M1-1205',
    building: 'M1',
    floor_level: 12,
    bedroom_count: 2,
    bathroom_count: 2,
    area_sqm: 62.0,
    view_direction: 'Ocean Lake',
    launch_price_vnd: 4200000000,
    net_price_vnd: 4050000000,
  },
  {
    unit_id: 'UNIT-MAS-02',
    zone_id: 'ZONE-MAS-WF',
    unit_code: 'MAS-WF-M2-1808',
    building: 'M2',
    floor_level: 18,
    bedroom_count: 1,
    bathroom_count: 1,
    area_sqm: 48.0,
    view_direction: 'Internal Pool',
    launch_price_vnd: 3200000000,
    net_price_vnd: 3050000000,
  },
];

export const SEED_SNAPSHOTS: UnitSnapshotRecord[] = [
  // Slow-moving units (DOM = 115)
  {
    snapshot_id: 'SNAP-VH-01',
    unit_id: 'UNIT-VH-01',
    snapshot_date: '2026-09-01',
    dom: 115,
    status: 'AVAILABLE',
    views_count: 240,
    inquiries_count: 12,
    price_cut_count: 0,
    current_asking_price_vnd: 2850000000,
  },
  {
    snapshot_id: 'SNAP-VH-02',
    unit_id: 'UNIT-VH-02',
    snapshot_date: '2026-09-01',
    dom: 115,
    status: 'AVAILABLE',
    views_count: 210,
    inquiries_count: 9,
    price_cut_count: 0,
    current_asking_price_vnd: 2890000000,
  },
  {
    snapshot_id: 'SNAP-VH-03',
    unit_id: 'UNIT-VH-03',
    snapshot_date: '2026-09-01',
    dom: 115,
    status: 'AVAILABLE',
    views_count: 185,
    inquiries_count: 8,
    price_cut_count: 0,
    current_asking_price_vnd: 2150000000,
  },
  {
    snapshot_id: 'SNAP-VH-04',
    unit_id: 'UNIT-VH-04',
    snapshot_date: '2026-09-01',
    dom: 98,
    status: 'AVAILABLE',
    views_count: 130,
    inquiries_count: 6,
    price_cut_count: 0,
    current_asking_price_vnd: 3800000000,
  },
  // Normal/Benchmark units
  {
    snapshot_id: 'SNAP-VH-05',
    unit_id: 'UNIT-VH-05',
    snapshot_date: '2026-09-01',
    dom: 38,
    status: 'SOLD',
    views_count: 580,
    inquiries_count: 45,
    price_cut_count: 1,
    current_asking_price_vnd: 2600000000,
  },
  {
    snapshot_id: 'SNAP-VH-06',
    unit_id: 'UNIT-VH-06',
    snapshot_date: '2026-09-01',
    dom: 32,
    status: 'SOLD',
    views_count: 620,
    inquiries_count: 58,
    price_cut_count: 0,
    current_asking_price_vnd: 2720000000,
  },
  {
    snapshot_id: 'SNAP-VH-07',
    unit_id: 'UNIT-VH-07',
    snapshot_date: '2026-09-01',
    dom: 45,
    status: 'RESERVED',
    views_count: 410,
    inquiries_count: 30,
    price_cut_count: 0,
    current_asking_price_vnd: 1980000000,
  },
  {
    snapshot_id: 'SNAP-VH-08',
    unit_id: 'UNIT-VH-08',
    snapshot_date: '2026-09-01',
    dom: 40,
    status: 'SOLD',
    views_count: 490,
    inquiries_count: 36,
    price_cut_count: 0,
    current_asking_price_vnd: 3600000000,
  },
  {
    snapshot_id: 'SNAP-VH-09',
    unit_id: 'UNIT-VH-09',
    snapshot_date: '2026-09-01',
    dom: 48,
    status: 'AVAILABLE',
    views_count: 310,
    inquiries_count: 22,
    price_cut_count: 0,
    current_asking_price_vnd: 4500000000,
  },
  {
    snapshot_id: 'SNAP-VH-10',
    unit_id: 'UNIT-VH-10',
    snapshot_date: '2026-09-01',
    dom: 42,
    status: 'SOLD',
    views_count: 440,
    inquiries_count: 34,
    price_cut_count: 0,
    current_asking_price_vnd: 3400000000,
  },
  {
    snapshot_id: 'SNAP-MAS-01',
    unit_id: 'UNIT-MAS-01',
    snapshot_date: '2026-09-01',
    dom: 35,
    status: 'SOLD',
    views_count: 520,
    inquiries_count: 41,
    price_cut_count: 0,
    current_asking_price_vnd: 4200000000,
  },
  {
    snapshot_id: 'SNAP-MAS-02',
    unit_id: 'UNIT-MAS-02',
    snapshot_date: '2026-09-01',
    dom: 28,
    status: 'SOLD',
    views_count: 480,
    inquiries_count: 39,
    price_cut_count: 0,
    current_asking_price_vnd: 3200000000,
  },
];

export function seedWarehouse(db: ISqliteDb): void {
  // Seed markets
  const insertMarket = db.prepare(`
    INSERT OR REPLACE INTO dim_markets (market_id, market_name, city, region)
    VALUES (?, ?, ?, ?)
  `);
  for (const m of SEED_MARKETS) {
    insertMarket.run(m.market_id, m.market_name, m.city, m.region);
  }

  // Seed projects
  const insertProject = db.prepare(`
    INSERT OR REPLACE INTO dim_projects (project_id, market_id, project_name, developer, launch_year, total_units)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const p of SEED_PROJECTS) {
    insertProject.run(p.project_id, p.market_id, p.project_name, p.developer, p.launch_year, p.total_units);
  }

  // Seed zones
  const insertZone = db.prepare(`
    INSERT OR REPLACE INTO dim_zones (zone_id, project_id, zone_name, segment, handover_year)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const z of SEED_ZONES) {
    insertZone.run(z.zone_id, z.project_id, z.zone_name, z.segment, z.handover_year);
  }

  // Seed units
  const insertUnit = db.prepare(`
    INSERT OR REPLACE INTO dim_units (
      unit_id, zone_id, unit_code, building, floor_level, bedroom_count, 
      bathroom_count, area_sqm, view_direction, launch_price_vnd, net_price_vnd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const u of SEED_UNITS) {
    insertUnit.run(
      u.unit_id,
      u.zone_id,
      u.unit_code,
      u.building,
      u.floor_level,
      u.bedroom_count,
      u.bathroom_count,
      u.area_sqm,
      u.view_direction,
      u.launch_price_vnd,
      u.net_price_vnd
    );
  }

  // Seed snapshots
  const insertSnapshot = db.prepare(`
    INSERT OR REPLACE INTO fact_unit_snapshot (
      snapshot_id, unit_id, snapshot_date, dom, status, views_count, 
      inquiries_count, price_cut_count, current_asking_price_vnd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of SEED_SNAPSHOTS) {
    insertSnapshot.run(
      s.snapshot_id,
      s.unit_id,
      s.snapshot_date,
      s.dom,
      s.status,
      s.views_count,
      s.inquiries_count,
      s.price_cut_count,
      s.current_asking_price_vnd
    );
  }
}
