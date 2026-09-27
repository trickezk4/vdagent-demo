export interface MarketRecord {
  market_id: string;
  market_name: string;
  city: string;
  region: string;
}

export interface ProjectRecord {
  project_id: string;
  market_id: string;
  project_name: string;
  developer: string;
  launch_year: number;
  total_units: number;
}

export interface ZoneRecord {
  zone_id: string;
  project_id: string;
  zone_name: string;
  segment: string;
  handover_year: number;
}

export interface UnitRecord {
  unit_id: string;
  zone_id: string;
  unit_code: string;
  building: string;
  floor_level: number;
  bedroom_count: number;
  bathroom_count: number;
  area_sqm: number;
  view_direction: string;
  launch_price_vnd: number;
  net_price_vnd: number;
}

export interface UnitSnapshotRecord {
  snapshot_id: string;
  unit_id: string;
  snapshot_date: string;
  dom: number;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  views_count: number;
  inquiries_count: number;
  price_cut_count: number;
  current_asking_price_vnd: number;
}

export interface UnitWithSnapshot extends UnitRecord {
  snapshot_id: string;
  snapshot_date: string;
  dom: number;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  views_count: number;
  inquiries_count: number;
  price_cut_count: number;
  current_asking_price_vnd: number;
  price_per_sqm_vnd: number;
  zone_name: string;
  segment: string;
  project_id: string;
  project_name: string;
  developer: string;
  market_id: string;
  market_name: string;
  city: string;
}

export interface ProjectSummaryMetrics {
  project_id: string;
  project_name: string;
  developer: string;
  total_units: number;
  available_units: number;
  sold_units: number;
  reserved_units: number;
  slow_moving_count: number;
  absorption_rate: number;      // (sold_units / total_units) * 100
  avg_dom: number;              // Average DOM across available units
  avg_dom_slow_moving: number;  // Average DOM of slow-moving units (e.g. 115)
  avg_price_per_sqm: number;
}

export interface PeerBenchmarkResult {
  target_unit: UnitWithSnapshot;
  target_dom: number;
  target_price_per_sqm: number;
  peer_count: number;
  peer_avg_dom: number;
  peer_avg_price_per_sqm: number;
  price_variance_pct: number;
  peer_units: UnitWithSnapshot[];
}

export interface WarehouseOptions {
  dbPath?: string;
  inMemory?: boolean;
  forceRecreate?: boolean;
}
