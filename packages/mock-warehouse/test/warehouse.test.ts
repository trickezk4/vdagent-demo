import { getWarehouse, initWarehouse } from '../src/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runWarehouseTests() {
  console.log('--- Starting Mock Warehouse Test Suite ---');

  // Test 1: Initialize in-memory warehouse
  const warehouse = initWarehouse({ inMemory: true });
  assert(!!warehouse, 'Warehouse instance initialized');

  // Test 2: Query slow-moving units with DOM >= 90
  const slowUnits = warehouse.getSlowMovingUnits(90);
  assert(slowUnits.length >= 3, `Found ${slowUnits.length} slow-moving units (expected >= 3)`);

  // Test 3: Verify the specific 3 units with DOM = 115
  const dom115Units = slowUnits.filter((u) => u.dom === 115);
  assert(dom115Units.length >= 3, `Found ${dom115Units.length} units with DOM = 115 days (expected >= 3)`);

  const expectedCodes = ['VH-OCP-S102-1405', 'VH-OCP-S102-1406', 'VH-OCP-S105-0812'];
  for (const code of expectedCodes) {
    const found = slowUnits.some((u) => u.unit_code === code || u.unit_id === code);
    assert(found, `Target slow unit code '${code}' exists in query result`);
  }

  // Test 4: Project Summary Metrics
  const summary = warehouse.getProjectSummary('PRJ-VH-OCP');
  assert(summary.project_id === 'PRJ-VH-OCP', 'Summary project ID matches');
  assert(summary.slow_moving_count >= 3, `Summary slow moving count is ${summary.slow_moving_count}`);
  assert(summary.absorption_rate > 0, `Absorption rate is ${summary.absorption_rate}%`);
  assert(summary.avg_dom_slow_moving >= 110, `Avg DOM of slow units is ${summary.avg_dom_slow_moving}`);

  // Test 5: Peer Benchmark for target unit
  const benchmark = warehouse.getPeerBenchmark('VH-OCP-S102-1405');
  assert(benchmark.target_dom === 115, 'Target unit DOM is 115');
  assert(benchmark.peer_count >= 2, `Peer unit count is ${benchmark.peer_count}`);
  assert(benchmark.peer_avg_dom < 50, `Peer average DOM is ${benchmark.peer_avg_dom} days (expected < 50)`);
  assert(typeof benchmark.price_variance_pct === 'number', 'Price variance calculated');

  // Test 6: Unit details retrieval
  const unitDetail = warehouse.getUnitDetails('VH-OCP-S102-1405');
  assert(unitDetail !== null, 'Unit details fetched successfully');
  assert(unitDetail?.view_direction === 'West', 'Unit view direction is West');
  assert(unitDetail?.project_name === 'Vinhomes Ocean Park', 'Hierarchy joins project name');
  assert(unitDetail?.zone_name === 'The Sapphire 1', 'Hierarchy joins zone name');

  console.log('--- All Mock Warehouse Tests Passed Successfully! ---');
  warehouse.close();
}

runWarehouseTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
