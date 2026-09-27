/**
 * apps/web/src/types.ts
 * Type definitions for VDaAgent Frontend
 */

export interface AgentInfo {
  agent_id: string;
  name?: string;
  grpc_target: string;
  domain: string;
  description: string;
  is_dynamic: boolean;
  status: 'HEALTHY' | 'UNAVAILABLE' | 'CONNECTING';
  supported_intents?: string[];
}

export interface ChatMessage {
  id: string;
  session_id: string;
  agent_id: string; // 'orchestrator' | 'data-agent' | 'compare-agent' | 'insight-agent' | 'chart-agent' | 'report-agent' | 'python-finance-agent'
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifacts?: any[];
  traceLogs?: string[];
  timestamp: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface UnitDetail {
  unit_id: string;
  unit_code: string;
  building: string;
  floor_level: number;
  bedroom_count: number;
  bathroom_count: number;
  area_sqm: number;
  view_direction: string;
  launch_price_vnd: number;
  net_price_vnd: number;
  snapshot_id?: string;
  snapshot_date?: string;
  dom: number;
  status: string;
  views_count: number;
  inquiries_count: number;
  price_cut_count: number;
  current_asking_price_vnd: number;
  price_per_sqm_vnd: number;
  zone_name?: string;
  segment?: string;
  project_id?: string;
  project_name?: string;
  developer?: string;
  is_slow_moving?: boolean;
  root_causes?: Array<{
    code: string;
    title: string;
    description: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  verified_hash?: string;
  audit_timestamp?: string;
}

export type InspectorTab = 'evidence' | 'chart' | 'report' | 'dataset' | 'finance' | 'artifacts';
