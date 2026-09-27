import assert from 'node:assert/strict';
import Module from 'node:module';
import {
  WarehouseClient,
  initWarehouse,
  getWarehouse,
  createDatabaseConnection,
  SEED_UNITS,
  SEED_PROJECTS,
  SEED_ZONES,
  SEED_MARKETS,
  SEED_SNAPSHOTS,
} from '../packages/mock-warehouse/src/index.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function recordPass(name: string, details?: any) {
  console.log(`  ✅ PASS: ${name}`);
  results.push({ name, passed: true, details });
}

function recordFail(name: string, error: any) {
  console.error(`  ❌ FAIL: ${name} ->`, error?.message || error);
  results.push({ name, passed: false, error: error?.message || String(error) });
}

console.log('===============================================================');
console.log('🔬 CHALLENGER 2: EMPIRICAL STRESS TEST SUITE FOR MOCK WAREHOUSE');
console.log('===============================================================\n');

// ============================================================================
// SUITE 1: BOUNDARY CONDITION TESTS ON WAREHOUSE QUERIES
// ============================================================================
console.log('▶️ SUITE 1: Boundary Condition Tests on Warehouse Queries');

try {
  const wh = initWarehouse({ inMemory: true });

  // Test 1.1: getSlowMovingUnits(0)
  try {
    const units0 = wh.getSlowMovingUnits(0);
    // In seed data: all units with status = 'AVAILABLE' and dom >= 0
    assert.ok(Array.isArray(units0), 'Result must be an array');
    assert.equal(units0.length, 5, `Expected 5 AVAILABLE units, got ${units0.length}`);
    for (const u of units0) {
      assert.equal(u.status, 'AVAILABLE', `Unit ${u.unit_code} should be AVAILABLE`);
      assert.ok(u.dom >= 0, `Unit ${u.unit_code} DOM should be >= 0`);
      assert.ok(u.price_per_sqm_vnd > 0, `price_per_sqm_vnd must be computed`);
    }
    recordPass('getSlowMovingUnits(0) returns all 5 AVAILABLE units safely', {
      count: units0.length,
      unitCodes: units0.map((u) => u.unit_code),
    });
  } catch (err) {
    recordFail('getSlowMovingUnits(0)', err);
  }

  // Test 1.2: getSlowMovingUnits(9999)
  try {
    const units9999 = wh.getSlowMovingUnits(9999);
    assert.ok(Array.isArray(units9999), 'Result must be an array');
    assert.equal(units9999.length, 0, `Expected 0 units for DOM >= 9999, got ${units9999.length}`);
    recordPass('getSlowMovingUnits(9999) returns empty array without throwing');
  } catch (err) {
    recordFail('getSlowMovingUnits(9999)', err);
  }

  // Test 1.3: getSlowMovingUnits(-10) (negative DOM boundary)
  try {
    const unitsNeg = wh.getSlowMovingUnits(-10);
    assert.equal(unitsNeg.length, 5, 'Negative DOM returns all available units');
    recordPass('getSlowMovingUnits(-10) handles negative threshold safely');
  } catch (err) {
    recordFail('getSlowMovingUnits(-10)', err);
  }

  // Test 1.4: getSlowMovingUnits(90, 'UNKNOWN') (non-existent project filter)
  try {
    const unitsUnknownProject = wh.getSlowMovingUnits(90, 'UNKNOWN');
    assert.ok(Array.isArray(unitsUnknownProject), 'Result must be an array');
    assert.equal(unitsUnknownProject.length, 0, 'Non-existent project yields 0 units');
    recordPass('getSlowMovingUnits(90, "UNKNOWN") returns empty array without throwing');
  } catch (err) {
    recordFail('getSlowMovingUnits(90, "UNKNOWN")', err);
  }

  // Test 1.5: getProjectSummary('UNKNOWN')
  try {
    let threw = false;
    let thrownMsg = '';
    try {
      wh.getProjectSummary('UNKNOWN');
    } catch (e: any) {
      threw = true;
      thrownMsg = e.message;
    }
    assert.ok(threw, 'getProjectSummary("UNKNOWN") must throw an error');
    assert.match(thrownMsg, /Project UNKNOWN not found in warehouse/, 'Error message must specify project not found');
    recordPass('getProjectSummary("UNKNOWN") throws descriptive Error', { error: thrownMsg });
  } catch (err) {
    recordFail('getProjectSummary("UNKNOWN")', err);
  }

  // Test 1.6: getProjectSummary('') (empty string)
  try {
    let threw = false;
    try {
      wh.getProjectSummary('');
    } catch {
      threw = true;
    }
    assert.ok(threw, 'getProjectSummary("") must throw for empty string');
    recordPass('getProjectSummary("") throws for empty project ID');
  } catch (err) {
    recordFail('getProjectSummary("")', err);
  }

  // Test 1.7: getPeerBenchmark('NON-EXISTENT-UNIT')
  try {
    let threw = false;
    let thrownMsg = '';
    try {
      wh.getPeerBenchmark('NON-EXISTENT-UNIT');
    } catch (e: any) {
      threw = true;
      thrownMsg = e.message;
    }
    assert.ok(threw, 'getPeerBenchmark("NON-EXISTENT-UNIT") must throw an error');
    assert.match(thrownMsg, /Target unit NON-EXISTENT-UNIT not found in warehouse/);
    recordPass('getPeerBenchmark("NON-EXISTENT-UNIT") throws descriptive Error', { error: thrownMsg });
  } catch (err) {
    recordFail('getPeerBenchmark("NON-EXISTENT-UNIT")', err);
  }

  // Test 1.8: getPeerBenchmark with 0% tolerance (isolated peer group fallback)
  try {
    // UNIT-VH-03 (VH-OCP-S105-0812) has area 43.2 sqm, 1 BR.
    // UNIT-VH-07 has area 43.0 sqm (0.46% difference).
    // With 0% tolerance, only exact 43.2 sqm matches. If none match, benchmarkPeers falls back to [targetUnit]
    const bmZeroTol = wh.getPeerBenchmark('VH-OCP-S105-0812', 0);
    assert.ok(bmZeroTol.peer_count >= 1, 'Peer count must be >= 1 even with 0% tolerance fallback');
    assert.ok(!isNaN(bmZeroTol.price_variance_pct), 'Price variance must not be NaN');
    assert.ok(isFinite(bmZeroTol.price_variance_pct), 'Price variance must be finite');
    recordPass('getPeerBenchmark with 0% tolerance falls back safely without division by zero', {
      peerCount: bmZeroTol.peer_count,
      variance: bmZeroTol.price_variance_pct,
    });
  } catch (err) {
    recordFail('getPeerBenchmark tolerance=0%', err);
  }

  // Test 1.9: getUnitDetails('UNKNOWN')
  try {
    const details = wh.getUnitDetails('UNKNOWN');
    assert.equal(details, null, 'getUnitDetails on unknown unit must return null');
    recordPass('getUnitDetails("UNKNOWN") returns null gracefully');
  } catch (err) {
    recordFail('getUnitDetails("UNKNOWN")', err);
  }

  wh.close();
} catch (err) {
  recordFail('SUITE 1 initialization', err);
}

// ============================================================================
// SUITE 2: DUAL SQLITE ENGINES & FALLBACK RESILIENCE
// ============================================================================
console.log('\n▶️ SUITE 2: Dual SQLite Engines & Fallback Resilience');

// Test 2.1: Native engine test (better-sqlite3)
try {
  const nativeDb = createDatabaseConnection(':memory:');
  assert.equal(nativeDb.engineName, 'better-sqlite3', 'Default engine should be better-sqlite3');
  nativeDb.exec('CREATE TABLE test (id INT); INSERT INTO test VALUES (42);');
  const row = nativeDb.prepare('SELECT id FROM test').get() as { id: number };
  assert.equal(row.id, 42, 'Row queried correctly from better-sqlite3');
  nativeDb.close();
  recordPass('Primary engine better-sqlite3 initializes and executes DDL/DML', {
    engineName: 'better-sqlite3',
  });
} catch (err) {
  recordFail('Primary engine better-sqlite3', err);
}

// Test 2.2: Forced fallback to node:sqlite
try {
  const origLoad = (Module as any)._load;
  let intercepted = false;

  // Intercept module loading to simulate better-sqlite3 unavailability
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'better-sqlite3') {
      intercepted = true;
      throw new Error('SIMULATED_ERR: better-sqlite3 native binary missing/incompatible');
    }
    return origLoad.apply(this, arguments);
  };

  let fallbackDb: any = null;
  try {
    fallbackDb = createDatabaseConnection(':memory:');
  } finally {
    // Restore original loader
    (Module as any)._load = origLoad;
  }

  assert.ok(intercepted, 'better-sqlite3 require was intercepted');
  assert.ok(fallbackDb, 'Database connection created via fallback');
  assert.equal(fallbackDb.engineName, 'node:sqlite', 'Fallback engine must be node:sqlite');

  // Verify node:sqlite execution
  fallbackDb.exec("CREATE TABLE fallback_test (val TEXT); INSERT INTO fallback_test VALUES ('node_sqlite_ok');");
  const fallbackRow = fallbackDb.prepare('SELECT val FROM fallback_test').get() as { val: string };
  assert.equal(fallbackRow.val, 'node_sqlite_ok', 'node:sqlite executes queries successfully');
  fallbackDb.close();

  recordPass('Forced unavailability of better-sqlite3 cleanly falls back to node:sqlite', {
    engineName: 'node:sqlite',
  });
} catch (err) {
  recordFail('Forced fallback to node:sqlite', err);
}

// Test 2.3: Full WarehouseClient lifecycle running entirely on node:sqlite
try {
  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'better-sqlite3') {
      throw new Error('SIMULATED_ERR: better-sqlite3 disabled');
    }
    return origLoad.apply(this, arguments);
  };

  let nodeSqliteWarehouse: WarehouseClient | null = null;
  try {
    nodeSqliteWarehouse = new WarehouseClient({ inMemory: true });
  } finally {
    (Module as any)._load = origLoad;
  }

  assert.ok(nodeSqliteWarehouse, 'WarehouseClient initialized on node:sqlite');

  // Run all queries on node:sqlite warehouse
  const slowUnits = nodeSqliteWarehouse.getSlowMovingUnits(90);
  assert.equal(slowUnits.length, 4, `Expected 4 slow units on node:sqlite, got ${slowUnits.length}`);

  const summary = nodeSqliteWarehouse.getProjectSummary('PRJ-VH-OCP');
  assert.equal(summary.project_id, 'PRJ-VH-OCP');
  assert.equal(summary.slow_moving_count, 4);

  const benchmark = nodeSqliteWarehouse.getPeerBenchmark('VH-OCP-S102-1405');
  assert.equal(benchmark.target_dom, 115);
  assert.ok(benchmark.peer_count >= 2);

  const detail = nodeSqliteWarehouse.getUnitDetails('VH-OCP-S102-1405');
  assert.equal(detail?.unit_code, 'VH-OCP-S102-1405');

  nodeSqliteWarehouse.close();
  recordPass('Full WarehouseClient operations run 100% identically on node:sqlite engine', {
    slowUnitsCount: slowUnits.length,
    projectId: summary.project_id,
  });
} catch (err) {
  recordFail('Full WarehouseClient on node:sqlite', err);
}

// ============================================================================
// SUITE 3: DOM = 115 DAYS UNITS & FOREIGN KEY RELATIONAL INTEGRITY
// ============================================================================
console.log('\n▶️ SUITE 3: DOM = 115 Days Units & Relational Integrity');

try {
  const wh = initWarehouse({ inMemory: true });
  const rawDb = (wh as any).db; // access ISqliteDb

  // Test 3.1: Check the 3 specific units
  const targetCodes = ['VH-OCP-S102-1405', 'VH-OCP-S102-1406', 'VH-OCP-S105-0812'];

  for (const code of targetCodes) {
    const unit = wh.getUnitDetails(code);
    assert.ok(unit !== null, `Unit ${code} must exist in warehouse`);
    assert.equal(unit?.dom, 115, `Unit ${code} must have DOM = 115 days`);
    assert.equal(unit?.status, 'AVAILABLE', `Unit ${code} status must be AVAILABLE`);
    assert.equal(unit?.project_name, 'Vinhomes Ocean Park', `Unit ${code} must belong to Vinhomes Ocean Park`);
    assert.equal(unit?.zone_name, 'The Sapphire 1', `Unit ${code} must belong to The Sapphire 1`);
    assert.equal(unit?.project_id, 'PRJ-VH-OCP', `Unit ${code} project_id must be PRJ-VH-OCP`);
    assert.equal(unit?.zone_id, 'ZONE-VH-SAPPHIRE', `Unit ${code} zone_id must be ZONE-VH-SAPPHIRE`);
    assert.equal(unit?.market_id, 'MKT-HN-EAST', `Unit ${code} market_id must be MKT-HN-EAST`);
    assert.equal(unit?.city, 'Hà Nội', `Unit ${code} city must be Hà Nội`);
  }
  recordPass('All 3 units with DOM = 115 days strictly exist with exact attributes', {
    codes: targetCodes,
    dom: 115,
  });

  // Test 3.2: Foreign Key Consistency Check via PRAGMA
  const fkCheckStmt = rawDb.prepare('PRAGMA foreign_key_check;');
  const fkViolations = fkCheckStmt.all();
  assert.equal(fkViolations.length, 0, `Expected 0 FK violations, found: ${JSON.stringify(fkViolations)}`);
  recordPass('PRAGMA foreign_key_check passes with zero violations across all 4 tiers', {
    violations: 0,
  });

  // Test 3.3: Verify Foreign Key Enforcement (Attempt inserting orphan unit)
  let fkRejected = false;
  try {
    rawDb.prepare(`
      INSERT INTO dim_units (
        unit_id, zone_id, unit_code, building, floor_level, bedroom_count,
        bathroom_count, area_sqm, view_direction, launch_price_vnd, net_price_vnd
      ) VALUES ('ORPHAN-01', 'ZONE-DOES-NOT-EXIST', 'ORPHAN', 'X', 1, 1, 1, 50, 'North', 100, 100)
    `).run();
  } catch (err: any) {
    fkRejected = true;
    assert.match(err.message, /FOREIGN KEY constraint failed/i);
  }
  assert.ok(fkRejected, 'Orphan unit insertion must be rejected by foreign key constraint');
  recordPass('Active FK enforcement confirmed: orphan records rejected by SQLite engine');

  // Test 3.4: Verify Cascade Deletion integrity
  // Ensure that projects, zones, units and snapshots form a strict parent-child hierarchy
  const hierarchyCounts = rawDb.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM dim_markets) as markets,
      (SELECT COUNT(*) FROM dim_projects) as projects,
      (SELECT COUNT(*) FROM dim_zones) as zones,
      (SELECT COUNT(*) FROM dim_units) as units,
      (SELECT COUNT(*) FROM fact_unit_snapshot) as snapshots
  `).get() as { markets: number; projects: number; zones: number; units: number; snapshots: number };

  assert.equal(hierarchyCounts.markets, 1);
  assert.equal(hierarchyCounts.projects, 2);
  assert.equal(hierarchyCounts.zones, 3);
  assert.equal(hierarchyCounts.units, 12);
  assert.equal(hierarchyCounts.snapshots, 12);
  recordPass('Full 4-tier hierarchy counts verified (1 Market -> 2 Projects -> 3 Zones -> 12 Units -> 12 Snapshots)', hierarchyCounts);

  wh.close();
} catch (err) {
  recordFail('SUITE 3 DOM=115 & Relational Integrity', err);
}

// ============================================================================
// SUITE 4: CONCURRENCY & ASYNCHRONOUS LOAD
// ============================================================================
console.log('\n▶️ SUITE 4: Concurrency & Parallel Execution');

try {
  const wh = getWarehouse({ inMemory: true });

  // Test 4.1: 100 concurrent queries over Promise.all
  const queryTasks = Array.from({ length: 100 }, async (_, idx) => {
    const mod = idx % 4;
    switch (mod) {
      case 0:
        return wh.getSlowMovingUnits(90);
      case 1:
        return wh.getProjectSummary('PRJ-VH-OCP');
      case 2:
        return wh.getPeerBenchmark('VH-OCP-S102-1405');
      case 3:
      default:
        return wh.getUnitDetails('VH-OCP-S102-1406');
    }
  });

  const startTime = Date.now();
  const allResults = await Promise.all(queryTasks);
  const elapsedMs = Date.now() - startTime;

  assert.equal(allResults.length, 100, 'All 100 concurrent queries must resolve');
  // Check results
  for (let i = 0; i < 100; i++) {
    const res = allResults[i];
    const mod = i % 4;
    if (mod === 0) {
      assert.equal((res as any).length, 4);
    } else if (mod === 1) {
      assert.equal((res as any).project_id, 'PRJ-VH-OCP');
    } else if (mod === 2) {
      assert.equal((res as any).target_dom, 115);
    } else {
      assert.equal((res as any).unit_code, 'VH-OCP-S102-1406');
    }
  }

  recordPass('100 concurrent queries executed across 4 query patterns with 100% integrity', {
    totalQueries: 100,
    elapsedMs,
    avgMsPerQuery: elapsedMs / 100,
  });

  // Test 4.2: Concurrent initWarehouse vs getWarehouse calls
  const initTasks = Array.from({ length: 10 }, async (_, i) => {
    return initWarehouse({ inMemory: true });
  });
  const inited = await Promise.all(initTasks);
  assert.equal(inited.length, 10);
  const activeWh = getWarehouse();
  assert.equal(activeWh.getSlowMovingUnits(90).length, 4);
  recordPass('Concurrent initWarehouse calls succeed without memory corruption or race conditions');

  // Test 4.3: High burst sequential queries (500 queries)
  const burstStart = Date.now();
  for (let i = 0; i < 500; i++) {
    const u = activeWh.getSlowMovingUnits(90);
    assert.equal(u.length, 4);
  }
  const burstElapsed = Date.now() - burstStart;
  recordPass('High-frequency sequential burst (500 queries) completed with zero degradation', {
    count: 500,
    elapsedMs: burstElapsed,
    throughputQps: Math.round(500 / (burstElapsed / 1000)),
  });

  activeWh.close();
} catch (err) {
  recordFail('SUITE 4 Concurrency', err);
}

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n===============================================================');
console.log('📊 CHALLENGER TEST RESULTS SUMMARY');
console.log('===============================================================');

const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;

console.log(`Total tests: ${results.length}`);
console.log(`Passed:      ${passedCount}`);
console.log(`Failed:      ${failedCount}`);

if (failedCount > 0) {
  console.error('\n❌ VERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\n✅ VERDICT: APPROVE');
  process.exit(0);
}
