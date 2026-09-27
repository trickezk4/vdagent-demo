import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockWarehouse,
  querySlowMovingUnits,
  SEED_UNITS,
} from '../fixtures/mock-warehouse-fixture.js';

describe('Tier 1: FEAT-W01 & FEAT-W02 - SQLite Mock Warehouse Schema & Slow-Moving Queries', () => {
  it('should initialize 4-tier schema and seed all tables', () => {
    const db = createMockWarehouse();

    // Verify Market table
    const markets = db.prepare('SELECT * FROM dim_markets').all() as any[];
    assert.equal(markets.length, 1);
    assert.equal(markets[0].market_id, 'MKT-HAN');
    assert.match(markets[0].market_name, /Hà Nội/);

    // Verify Project table
    const projects = db.prepare('SELECT * FROM dim_projects').all() as any[];
    assert.equal(projects.length, 1);
    assert.equal(projects[0].project_name, 'Vinhomes Ocean Park');
    assert.equal(projects[0].developer, 'Vingroup');

    // Verify Zones table (Sapphire 1 and Sapphire 2)
    const zones = db.prepare('SELECT * FROM dim_zones').all() as any[];
    assert.equal(zones.length, 2);

    // Verify Units table (10 units minimum)
    const units = db.prepare('SELECT * FROM dim_units').all() as any[];
    assert.ok(
      units.length >= 10,
      `Expected at least 10 units in warehouse, got: ${units.length}`
    );
    assert.equal(units.length, SEED_UNITS.length);

    // Verify Fact table
    const snapshots = db.prepare('SELECT * FROM fact_unit_snapshot').all() as any[];
    assert.equal(snapshots.length, units.length);
  });

  it('should query units with DOM > 90 days and find exactly 3 slow-moving units with DOM = 115', () => {
    const db = createMockWarehouse();
    const slowMoving = querySlowMovingUnits(db, 90);

    // Assert count
    assert.equal(
      slowMoving.length,
      3,
      `Expected exactly 3 units with DOM > 90, got: ${slowMoving.length}`
    );

    // Assert that every returned unit has DOM = 115
    for (const unit of slowMoving) {
      assert.equal(
        unit.dom,
        115,
        `Expected unit ${unit.unit_code} to have DOM = 115, got: ${unit.dom}`
      );
      assert.equal(unit.project_name, 'Vinhomes Ocean Park');
      assert.match(unit.zone_name, /Sapphire/);
      assert.ok(unit.list_price > 0);
      assert.ok(unit.net_price > 0);
    }

    // Verify unit IDs
    const unitIds = slowMoving.map((u) => u.unit_id);
    assert.ok(unitIds.includes('UNIT-VHOP-S1-01'));
    assert.ok(unitIds.includes('UNIT-VHOP-S1-02'));
    assert.ok(unitIds.includes('UNIT-VHOP-S2-05'));
  });

  it('should return empty array when filtering for non-existent DOM threshold', () => {
    const db = createMockWarehouse();
    const result = querySlowMovingUnits(db, 999);
    assert.equal(result.length, 0);
  });

  it('should calculate accurate average DOM for slow-moving units', () => {
    const db = createMockWarehouse();
    const slowMoving = querySlowMovingUnits(db, 90);
    const sumDom = slowMoving.reduce((acc, u) => acc + u.dom, 0);
    const avgDom = sumDom / slowMoving.length;

    assert.equal(avgDom, 115);
  });
});
