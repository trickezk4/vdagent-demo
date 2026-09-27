import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, type ISqliteDb } from './driver.js';
import { seedWarehouse } from './seed-data.js';
import type {
  WarehouseOptions,
  UnitWithSnapshot,
  ProjectSummaryMetrics,
  PeerBenchmarkResult,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback embedded DDL in case schema.sql file is missing or not copied in build dist
const EMBEDDED_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dim_markets (
    market_id TEXT PRIMARY KEY,
    market_name TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS dim_zones (
    zone_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES dim_projects(project_id) ON DELETE CASCADE,
    zone_name TEXT NOT NULL,
    segment TEXT NOT NULL,
    handover_year INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dim_zones_project ON dim_zones(project_id);

CREATE TABLE IF NOT EXISTS dim_units (
    unit_id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL REFERENCES dim_zones(zone_id) ON DELETE CASCADE,
    unit_code TEXT NOT NULL UNIQUE,
    building TEXT NOT NULL,
    floor_level INTEGER NOT NULL,
    bedroom_count INTEGER NOT NULL,
    bathroom_count INTEGER NOT NULL DEFAULT 1,
    area_sqm REAL NOT NULL,
    view_direction TEXT NOT NULL,
    launch_price_vnd REAL NOT NULL,
    net_price_vnd REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dim_units_zone ON dim_units(zone_id);
CREATE INDEX IF NOT EXISTS idx_dim_units_code ON dim_units(unit_code);
CREATE INDEX IF NOT EXISTS idx_dim_units_bedroom ON dim_units(bedroom_count);
CREATE INDEX IF NOT EXISTS idx_dim_units_area ON dim_units(area_sqm);

CREATE TABLE IF NOT EXISTS fact_unit_snapshot (
    snapshot_id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES dim_units(unit_id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,
    dom INTEGER NOT NULL,
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
`;

export class WarehouseClient {
  private db: ISqliteDb | null = null;

  constructor(options?: WarehouseOptions) {
    if (options) {
      this.init(options);
    }
  }

  public init(options: WarehouseOptions = {}): void {
    const dbPath = options.inMemory !== false && !options.dbPath ? ':memory:' : options.dbPath || ':memory:';
    this.db = createDatabaseConnection(dbPath);

    // Load and execute schema
    let schemaSql = '';
    const candidatePaths = [
      path.resolve(__dirname, 'schema.sql'),
      path.resolve(__dirname, '../src/schema.sql'),
      path.resolve(__dirname, '../../packages/mock-warehouse/src/schema.sql'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          schemaSql = fs.readFileSync(p, 'utf-8');
          break;
        } catch {
          // Continue to next candidate
        }
      }
    }

    if (!schemaSql) {
      schemaSql = EMBEDDED_SCHEMA_SQL;
    }

    this.db.exec(schemaSql);

    // Seed data
    seedWarehouse(this.db);
  }

  private ensureConnected(): ISqliteDb {
    if (!this.db) {
      this.init({ inMemory: true });
    }
    return this.db!;
  }

  public getSlowMovingUnits(domThreshold: number = 90, projectId?: string): UnitWithSnapshot[] {
    const db = this.ensureConnected();
    const sql = `
      SELECT 
        u.*, 
        f.snapshot_id, f.snapshot_date, f.dom, f.status, f.views_count, 
        f.inquiries_count, f.price_cut_count, f.current_asking_price_vnd,
        ROUND(f.current_asking_price_vnd / u.area_sqm, 2) AS price_per_sqm_vnd,
        z.zone_name, z.segment, 
        p.project_id, p.project_name, p.developer,
        m.market_id, m.market_name, m.city
      FROM fact_unit_snapshot f
      JOIN dim_units u ON f.unit_id = u.unit_id
      JOIN dim_zones z ON u.zone_id = z.zone_id
      JOIN dim_projects p ON z.project_id = p.project_id
      JOIN dim_markets m ON p.market_id = m.market_id
      WHERE f.dom >= ? AND f.status = 'AVAILABLE'
        AND (? IS NULL OR p.project_id = ?)
      ORDER BY f.dom DESC, f.current_asking_price_vnd DESC;
    `;
    const stmt = db.prepare(sql);
    return stmt.all(domThreshold, projectId ?? null, projectId ?? null) as UnitWithSnapshot[];
  }

  public getProjectSummary(projectId: string = 'PRJ-VH-OCP'): ProjectSummaryMetrics {
    const db = this.ensureConnected();

    const sqlProject = `
      SELECT project_id, project_name, developer, total_units
      FROM dim_projects
      WHERE project_id = ?;
    `;
    const project = db.prepare(sqlProject).get(projectId) as
      | {
          project_id: string;
          project_name: string;
          developer: string;
          total_units: number;
        }
      | undefined;

    if (!project) {
      throw new Error(`Project ${projectId} not found in warehouse`);
    }

    const sqlMetrics = `
      SELECT 
        COUNT(DISTINCT u.unit_id) AS sample_total,
        SUM(CASE WHEN f.status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available_units,
        SUM(CASE WHEN f.status = 'SOLD' THEN 1 ELSE 0 END) AS sold_units,
        SUM(CASE WHEN f.status = 'RESERVED' THEN 1 ELSE 0 END) AS reserved_units,
        SUM(CASE WHEN f.dom >= 90 AND f.status = 'AVAILABLE' THEN 1 ELSE 0 END) AS slow_moving_count,
        ROUND(AVG(CASE WHEN f.status = 'AVAILABLE' THEN f.dom END), 1) AS avg_dom,
        ROUND(AVG(CASE WHEN f.dom >= 90 AND f.status = 'AVAILABLE' THEN f.dom END), 1) AS avg_dom_slow_moving,
        ROUND(AVG(f.current_asking_price_vnd / u.area_sqm), 2) AS avg_price_per_sqm
      FROM dim_units u
      JOIN dim_zones z ON u.zone_id = z.zone_id
      JOIN fact_unit_snapshot f ON u.unit_id = f.unit_id
      WHERE z.project_id = ?;
    `;
    const metrics = db.prepare(sqlMetrics).get(projectId) as {
      sample_total: number;
      available_units: number;
      sold_units: number;
      reserved_units: number;
      slow_moving_count: number;
      avg_dom: number;
      avg_dom_slow_moving: number;
      avg_price_per_sqm: number;
    };

    const sampleTotal = metrics.sample_total || 1;
    const soldUnits = metrics.sold_units || 0;
    const absorptionRate = Math.round((soldUnits / sampleTotal) * 1000) / 10;

    return {
      project_id: project.project_id,
      project_name: project.project_name,
      developer: project.developer,
      total_units: metrics.sample_total,
      available_units: metrics.available_units || 0,
      sold_units: soldUnits,
      reserved_units: metrics.reserved_units || 0,
      slow_moving_count: metrics.slow_moving_count || 0,
      absorption_rate: absorptionRate,
      avg_dom: metrics.avg_dom || 0,
      avg_dom_slow_moving: metrics.avg_dom_slow_moving || 115,
      avg_price_per_sqm: metrics.avg_price_per_sqm || 0,
    };
  }

  public getPeerBenchmark(unitIdOrCode: string, tolerancePct: number = 10): PeerBenchmarkResult {
    const targetUnit = this.getUnitDetails(unitIdOrCode);
    if (!targetUnit) {
      throw new Error(`Target unit ${unitIdOrCode} not found in warehouse`);
    }

    const minArea = targetUnit.area_sqm * (1 - tolerancePct / 100);
    const maxArea = targetUnit.area_sqm * (1 + tolerancePct / 100);

    const db = this.ensureConnected();
    const sqlPeers = `
      SELECT 
        u.*, 
        f.snapshot_id, f.snapshot_date, f.dom, f.status, f.views_count, 
        f.inquiries_count, f.price_cut_count, f.current_asking_price_vnd,
        ROUND(f.current_asking_price_vnd / u.area_sqm, 2) AS price_per_sqm_vnd,
        z.zone_name, z.segment, 
        p.project_id, p.project_name, p.developer,
        m.market_id, m.market_name, m.city
      FROM dim_units u
      JOIN dim_zones z ON u.zone_id = z.zone_id
      JOIN dim_projects p ON z.project_id = p.project_id
      JOIN dim_markets m ON p.market_id = m.market_id
      JOIN fact_unit_snapshot f ON u.unit_id = f.unit_id
      WHERE u.unit_id != ?
        AND u.bedroom_count = ?
        AND u.area_sqm BETWEEN ? AND ?
        AND p.project_id = ?
      ORDER BY f.dom ASC;
    `;

    const peers = db.prepare(sqlPeers).all(
      targetUnit.unit_id,
      targetUnit.bedroom_count,
      minArea,
      maxArea,
      targetUnit.project_id
    ) as UnitWithSnapshot[];

    // Prioritize sold/benchmark peers if available, otherwise use all peers
    const soldPeers = peers.filter((p) => p.status === 'SOLD');
    const benchmarkPeers = soldPeers.length > 0 ? soldPeers : peers.length > 0 ? peers : [targetUnit];

    const peerAvgDom = Math.round(
      benchmarkPeers.reduce((acc, p) => acc + p.dom, 0) / benchmarkPeers.length
    );
    const peerAvgPricePerSqm = Math.round(
      benchmarkPeers.reduce((acc, p) => acc + p.price_per_sqm_vnd, 0) / benchmarkPeers.length
    );

    const targetPricePerSqm = targetUnit.price_per_sqm_vnd;
    const priceVariancePct =
      Math.round(((targetPricePerSqm - peerAvgPricePerSqm) / peerAvgPricePerSqm) * 1000) / 10;

    return {
      target_unit: targetUnit,
      target_dom: targetUnit.dom,
      target_price_per_sqm: targetPricePerSqm,
      peer_count: benchmarkPeers.length,
      peer_avg_dom: peerAvgDom,
      peer_avg_price_per_sqm: peerAvgPricePerSqm,
      price_variance_pct: priceVariancePct,
      peer_units: benchmarkPeers,
    };
  }

  public getUnitDetails(unitIdOrCode: string): UnitWithSnapshot | null {
    const db = this.ensureConnected();
    const sql = `
      SELECT 
        u.*, 
        f.snapshot_id, f.snapshot_date, f.dom, f.status, f.views_count, 
        f.inquiries_count, f.price_cut_count, f.current_asking_price_vnd,
        ROUND(f.current_asking_price_vnd / u.area_sqm, 2) AS price_per_sqm_vnd,
        z.zone_name, z.segment, 
        p.project_id, p.project_name, p.developer,
        m.market_id, m.market_name, m.city
      FROM dim_units u
      JOIN dim_zones z ON u.zone_id = z.zone_id
      JOIN dim_projects p ON z.project_id = p.project_id
      JOIN dim_markets m ON p.market_id = m.market_id
      JOIN fact_unit_snapshot f ON u.unit_id = f.unit_id
      WHERE u.unit_id = ? OR u.unit_code = ?
      LIMIT 1;
    `;
    const res = db.prepare(sql).get(unitIdOrCode, unitIdOrCode);
    return (res as UnitWithSnapshot) || null;
  }

  public getAllUnits(): UnitWithSnapshot[] {
    const db = this.ensureConnected();
    const sql = `
      SELECT 
        u.*, 
        f.snapshot_id, f.snapshot_date, f.dom, f.status, f.views_count, 
        f.inquiries_count, f.price_cut_count, f.current_asking_price_vnd,
        ROUND(f.current_asking_price_vnd / u.area_sqm, 2) AS price_per_sqm_vnd,
        z.zone_name, z.segment, 
        p.project_id, p.project_name, p.developer,
        m.market_id, m.market_name, m.city
      FROM dim_units u
      JOIN dim_zones z ON u.zone_id = z.zone_id
      JOIN dim_projects p ON z.project_id = p.project_id
      JOIN dim_markets m ON p.market_id = m.market_id
      JOIN fact_unit_snapshot f ON u.unit_id = f.unit_id
      ORDER BY u.unit_code ASC;
    `;
    return db.prepare(sql).all() as UnitWithSnapshot[];
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance for immediate use
let defaultInstance: WarehouseClient | null = null;

export function getWarehouse(options?: WarehouseOptions): WarehouseClient {
  if (!defaultInstance) {
    defaultInstance = new WarehouseClient(options || { inMemory: true });
  }
  return defaultInstance;
}

export function initWarehouse(options?: WarehouseOptions): WarehouseClient {
  if (defaultInstance) {
    defaultInstance.close();
  }
  defaultInstance = new WarehouseClient(options || { inMemory: true });
  return defaultInstance;
}
