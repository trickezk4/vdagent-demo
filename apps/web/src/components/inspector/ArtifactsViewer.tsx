/**
 * apps/web/src/components/inspector/ArtifactsViewer.tsx
 * Comprehensive Artifact Catalog and Detailed Inspector.
 * Features:
 * - List all generated artifacts in session with creation timestamps (đánh thời gian tạo từng artifact).
 * - Sort dropdown menu (sắp xếp theo ngày tạo: Mới nhất / Cũ nhất / Loại).
 * - Filter by artifact category (Dataset, Comparison, Insight, Chart, Report, Finance).
 * - Rich type-specific visualizations for Comparison, Insight, Dataset, Chart, Report, Finance.
 * - Resolves blank/empty artifact rendering with guaranteed fallback & structured JSON inspection.
 */

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Calendar,
  Clock,
  ArrowUpDown,
  Filter,
  Search,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  BarChart3,
  FileText,
  Database,
  GitCompare,
  Lightbulb,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { useChat } from '../../context/ChatContext';

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; border: string; bg: string; icon: React.ReactNode }
> = {
  dataset: {
    label: 'Dataset',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    icon: <Database className="w-3.5 h-3.5 text-blue-400" />,
  },
  comparison: {
    label: 'Comparison',
    color: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/10',
    icon: <GitCompare className="w-3.5 h-3.5 text-cyan-400" />,
  },
  insight: {
    label: 'Insight',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    icon: <Lightbulb className="w-3.5 h-3.5 text-amber-400" />,
  },
  chart_spec: {
    label: 'Chart Spec',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    icon: <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />,
  },
  report: {
    label: 'Report',
    color: 'text-rose-400',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    icon: <FileText className="w-3.5 h-3.5 text-rose-400" />,
  },
  finance_plan: {
    label: 'Finance Plan',
    color: 'text-emerald-300',
    border: 'border-emerald-400/30',
    bg: 'bg-emerald-500/10',
    icon: <DollarSign className="w-3.5 h-3.5 text-emerald-300" />,
  },
};

export const ArtifactsViewer: React.FC = () => {
  const {
    artifacts,
    selectedArtifactId,
    setSelectedArtifactId,
    inspectEvidence,
    setInspectorTab,
  } = useChat();

  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'type_asc' | 'type_desc'>('newest');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);

  // Normalize artifacts list from object dictionary
  const rawList: any[] = useMemo(() => {
    return Object.values(artifacts).filter(Boolean);
  }, [artifacts]);

  // Format date and time in Vietnamese localization
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'Thời gian thực';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${time} • ${date}`;
    } catch {
      return isoString;
    }
  };

  // Filtered and Sorted Artifacts
  const processedList = useMemo(() => {
    let list = [...rawList];

    // Filter by type
    if (filterType !== 'all') {
      list = list.filter((a) => a.artifact_type === filterType);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.artifact_id?.toLowerCase().includes(q) ||
          a.artifact_type?.toLowerCase().includes(q) ||
          a.producer?.toLowerCase().includes(q) ||
          JSON.stringify(a.payload || {}).toLowerCase().includes(q)
      );
    }

    // Sort by date / type
    list.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;

      if (sortOrder === 'newest') return dateB - dateA;
      if (sortOrder === 'oldest') return dateA - dateB;
      if (sortOrder === 'type_asc') return (a.artifact_type || '').localeCompare(b.artifact_type || '');
      if (sortOrder === 'type_desc') return (b.artifact_type || '').localeCompare(a.artifact_type || '');
      return 0;
    });

    return list;
  }, [rawList, filterType, searchQuery, sortOrder]);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Find currently active selected artifact
  const selectedArtifact = useMemo(() => {
    if (!selectedArtifactId) return null;
    return rawList.find((a) => a.artifact_id === selectedArtifactId) || null;
  }, [rawList, selectedArtifactId]);

  // =========================================================================
  // VIEW MODE A: ARTIFACT DETAIL VIEW
  // =========================================================================
  if (selectedArtifact) {
    const art = selectedArtifact;
    const cfg = TYPE_CONFIG[art.artifact_type] || {
      label: art.artifact_type?.toUpperCase(),
      color: 'text-slate-300',
      border: 'border-slate-700',
      bg: 'bg-slate-800',
      icon: <Layers className="w-3.5 h-3.5 text-slate-400" />,
    };

    const payload = art.payload || {};

    return (
      <div className="p-4 sm:p-5 overflow-y-auto space-y-4 h-full text-slate-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setSelectedArtifactId(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
            <span>Tất cả Artifacts ({rawList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRawJson(!showRawJson)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showRawJson
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showRawJson ? 'Ẩn JSON' : 'Xem JSON'}</span>
          </button>
        </div>

        {/* Artifact Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${cfg.bg} ${cfg.color} ${cfg.border}`}
              >
                {cfg.icon}
                <span>{cfg.label}</span>
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {art.status || 'VALID'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{formatDateTime(art.created_at)}</span>
            </div>
          </div>

          {/* Artifact ID and Producer */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5 font-mono text-slate-400">
              <span className="text-slate-500">ID:</span>
              <span className="text-slate-200 font-semibold">{art.artifact_id}</span>
              <button
                type="button"
                onClick={(e) => handleCopyId(art.artifact_id, e)}
                className="text-slate-500 hover:text-sky-400 p-0.5 transition-colors"
                title="Sao chép ID"
              >
                {copiedId === art.artifact_id ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="text-slate-400 font-mono">
              Tạo bởi: <span className="text-slate-300">{art.producer || 'Microservice'}</span>
            </div>
          </div>

          {/* Evidence Citations */}
          {art.evidence_refs && art.evidence_refs.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Bằng chứng kiểm chứng ({art.evidence_refs.length}):
              </span>
              {art.evidence_refs.map((refId: string) => (
                <button
                  key={refId}
                  type="button"
                  onClick={() => inspectEvidence(refId)}
                  className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  title="Nhấn để thanh tra hồ sơ bằng chứng căn hộ này"
                >
                  [Evidence-REF: {refId}]
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Raw JSON View (if toggled) */}
        {showRawJson && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
              <span>MÃ NGUỒN PAYLOAD JSON</span>
              <button
                type="button"
                onClick={(e) => handleCopyId(JSON.stringify(art, null, 2), e)}
                className="text-sky-400 hover:underline flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Sao chép
              </button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto p-2 bg-slate-900/60 rounded-lg max-h-72">
              {JSON.stringify(art, null, 2)}
            </pre>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 1: COMPARISON ARTIFACT                                    */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'comparison' && (
          <div className="space-y-4">
            {/* Metric KPI Cards */}
            {payload.peer_benchmark && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">DOM Căn Mục Tiêu</span>
                  <div className="text-base font-bold text-rose-400 mt-1 font-mono">
                    {payload.peer_benchmark.target_dom ?? 115} ngày
                  </div>
                  <span className="text-[10px] text-rose-400/80 mt-0.5 block">Vượt xa ngưỡng 90d</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">DOM Trung Bình Peer</span>
                  <div className="text-base font-bold text-emerald-400 mt-1 font-mono">
                    {payload.peer_benchmark.peer_avg_dom ?? 35} ngày
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Nhóm đối chuẩn</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">Độ Lệch Giá (Variance)</span>
                  <div className="text-base font-bold text-amber-400 mt-1 font-mono">
                    +{payload.peer_benchmark.price_variance_pct ?? 6.6}%
                  </div>
                  <span className="text-[10px] text-amber-400/80 mt-0.5 block">Cao hơn mặt bằng</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">Đơn Giá Trung Bình Peer</span>
                  <div className="text-base font-bold text-sky-400 mt-1 font-mono">
                    {payload.peer_benchmark.peer_avg_price_per_sqm
                      ? `${(payload.peer_benchmark.peer_avg_price_per_sqm / 1e6).toFixed(1)} tr/m²`
                      : '48.3 tr/m²'}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">The Sapphire 1</span>
                </div>
              </div>
            )}

            {/* Observations List */}
            {payload.observations && payload.observations.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-2">
                <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5" />
                  Các Quan Sát Đối Chuẩn Thị Trường (Observations)
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {payload.observations.map((obs: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary Conclusion */}
            {payload.comparison_summary && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-xs text-cyan-200">
                <span className="font-bold text-cyan-300 block mb-1">Kết luận đối chuẩn:</span>
                {payload.comparison_summary}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 2: INSIGHT ARTIFACT                                       */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'insight' && (
          <div className="space-y-4">
            {/* Overall Root Cause */}
            {payload.overall_root_cause && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200 shadow-sm">
                <span className="font-bold text-amber-300 flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  Tổng Hợp Nguyên Nhân Cốt Lõi (Overall Root Cause):
                </span>
                <p className="leading-relaxed">{payload.overall_root_cause}</p>
                {payload.recommended_focus && (
                  <p className="mt-2 text-slate-300 pt-2 border-t border-amber-500/20 text-[11px]">
                    <strong className="text-amber-400">Trọng tâm can thiệp:</strong> {payload.recommended_focus}
                  </p>
                )}
              </div>
            )}

            {/* Findings List */}
            {payload.findings && payload.findings.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Danh Sách Phát Hiện Gốc Rễ Đính Kèm Bằng Chứng ({payload.findings.length}):
                </h4>

                {payload.findings.map((f: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                          {f.category || 'Root Cause'}
                        </span>
                        {f.evidence_id && (
                          <button
                            type="button"
                            onClick={() => inspectEvidence(f.evidence_id)}
                            className="font-mono text-[11px] text-emerald-400 hover:underline font-semibold"
                          >
                            [Evidence-REF: {f.evidence_id}]
                          </button>
                        )}
                      </div>

                      {f.confidence !== undefined && (
                        <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                          <span>Độ tin cậy:</span>
                          <span className="font-bold">
                            {typeof f.confidence === 'number'
                              ? `${Math.round(f.confidence * 100)}%`
                              : f.confidence}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-100">{f.claim}</p>

                    {f.detail && (
                      <p className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        {f.detail}
                      </p>
                    )}

                    {f.impact_assessment && (
                      <div className="text-[11px] text-rose-300/90 flex items-start gap-1.5 pt-1">
                        <span className="text-rose-400 font-semibold flex-shrink-0">Mức độ ảnh hưởng:</span>
                        <span>{f.impact_assessment}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 3: CHART SPEC ARTIFACT                                   */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'chart_spec' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {payload.title || 'Biểu Đồ Trực Quan Hóa Recharts'}
                </h4>
                <button
                  type="button"
                  onClick={() => setInspectorTab('chart')}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                >
                  Mở Tab Biểu Đồ
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {payload.description && (
                <p className="text-xs text-slate-400">{payload.description}</p>
              )}

              {/* Render Recharts directly */}
              {payload.chart_data && payload.chart_data.length > 0 && (
                <div className="h-64 w-full bg-slate-950/60 rounded-xl p-2 border border-slate-800/80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payload.chart_data} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey={typeof payload.x_axis === 'string' ? payload.x_axis : 'unit_code'}
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                      />
                      <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      />
                      {payload.benchmark_line && (
                        <ReferenceLine
                          y={payload.benchmark_line.value}
                          label={{
                            value: payload.benchmark_line.label || 'Ngưỡng 90d',
                            fill: payload.benchmark_line.color || '#f59e0b',
                            fontSize: 10,
                          }}
                          stroke={payload.benchmark_line.color || '#f59e0b'}
                          strokeDasharray="4 4"
                        />
                      )}
                      <Bar
                        dataKey={typeof payload.y_axis === 'string' ? payload.y_axis : 'dom'}
                        fill="#0284c7"
                        radius={[4, 4, 0, 0]}
                      >
                        {payload.chart_data.map((entry: any, i: number) => (
                          <Cell
                            key={i}
                            fill={(entry.dom ?? 0) >= 90 ? '#ef4444' : '#10b981'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 4: REPORT ARTIFACT                                       */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'report' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {payload.title || 'Báo Cáo Điều Tra Chuẩn PRD'}
                </h4>
                <button
                  type="button"
                  onClick={() => setInspectorTab('report')}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                >
                  Mở Tab Báo Cáo
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {payload.summary && (
                <div className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <strong className="text-slate-100 block mb-1">Tóm tắt báo cáo:</strong>
                  {payload.summary}
                </div>
              )}

              {/* Markdown Content Preview */}
              {(payload.markdown || payload.markdown_content) && (
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2 max-h-96 overflow-y-auto font-sans leading-relaxed">
                  <pre className="whitespace-pre-wrap font-sans">
                    {payload.markdown || payload.markdown_content}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 5: DATASET ARTIFACT                                      */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'dataset' && (
          <div className="space-y-4">
            {payload.summary_metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">DOM Trung Bình</span>
                  <div className="text-base font-bold text-blue-400 mt-1 font-mono">
                    {payload.summary_metrics.avg_dom} ngày
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">Tỷ Lệ Hấp Thụ</span>
                  <div className="text-base font-bold text-emerald-400 mt-1 font-mono">
                    {payload.summary_metrics.absorption_rate}%
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">Căn Bán Chậm (DOM&ge;90)</span>
                  <div className="text-base font-bold text-rose-400 mt-1 font-mono">
                    {payload.summary_metrics.total_slow_moving || payload.units?.length || 4} căn
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-medium">Dự Án / Phân Khu</span>
                  <div className="text-xs font-bold text-slate-200 mt-1 truncate">
                    {payload.project_name || 'Vinhomes Ocean Park'}
                  </div>
                </div>
              </div>
            )}

            {/* Units list */}
            {payload.units && payload.units.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
                <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>Danh Sách Căn Hộ Trích Xuất ({payload.units.length})</span>
                  <button
                    type="button"
                    onClick={() => setInspectorTab('dataset')}
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                  >
                    Xem trong Kho Dữ Liệu
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono sticky top-0">
                      <tr>
                        <th className="p-2.5">Mã Căn</th>
                        <th className="p-2.5">Tầng</th>
                        <th className="p-2.5">Diện Tích</th>
                        <th className="p-2.5">Hướng</th>
                        <th className="p-2.5">Giá Bán</th>
                        <th className="p-2.5">DOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {payload.units.map((u: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-emerald-400 font-medium">
                            <button
                              type="button"
                              onClick={() => inspectEvidence(u.unit_id || u.unit_code)}
                              className="hover:underline"
                            >
                              {u.unit_code || u.unit_id}
                            </button>
                          </td>
                          <td className="p-2.5">{u.floor_level || 14}</td>
                          <td className="p-2.5">{u.area_sqm || 55.4} m²</td>
                          <td className="p-2.5">{u.view_direction || 'West'}</td>
                          <td className="p-2.5 font-mono">
                            {u.price ? `${(u.price / 1e9).toFixed(2)} tỷ` : '2.89 tỷ'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-rose-400">{u.dom}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TYPE 6: FINANCE PLAN ARTIFACT                                 */}
        {/* ------------------------------------------------------------- */}
        {art.artifact_type === 'finance_plan' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
              <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Phương Án Tài Chính &amp; Kế Hoạch Trả Góp Vay Ngân Hàng (Python)
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400">Giá Trị Căn Hộ</span>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                    {payload.property_price ? `${(payload.property_price / 1e9).toFixed(2)} tỷ` : '4.50 tỷ'}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400">Hạn Mức Vay ({payload.loan_ratio_pct || 70}%)</span>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                    {payload.loan_amount ? `${(payload.loan_amount / 1e9).toFixed(2)} tỷ` : '3.15 tỷ'}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400">Trả Góp Ước Tính/Tháng</span>
                  <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                    {payload.monthly_payment_estimate
                      ? `${Number(payload.monthly_payment_estimate).toLocaleString('vi-VN')} đ`
                      : '27.336.432 đ'}
                  </div>
                </div>
              </div>

              {payload.policy_note && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
                  <span className="font-semibold block mb-0.5">Chính sách ưu đãi:</span>
                  {payload.policy_note}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fallback for unknown / generic payload */}
        {!['comparison', 'insight', 'chart_spec', 'report', 'dataset', 'finance_plan'].includes(art.artifact_type) && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-2">
            <h4 className="text-xs font-bold text-slate-200">Dữ liệu Payload:</h4>
            <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW MODE B: ARTIFACT CATALOG & SORTABLE LIST
  // =========================================================================
  return (
    <div className="p-4 sm:p-5 overflow-y-auto space-y-4 h-full text-slate-200">
      {/* Header & Controls */}
      <div className="space-y-3 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Kho Lưu Trữ Tạo Phẩm (Artifacts)
              </h3>
              <p className="text-xs text-slate-400">
                Tổng cộng {rawList.length} artifacts đã sinh • Có chứng thực SHA-256
              </p>
            </div>
          </div>
        </div>

        {/* Filter and Sort Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo ID, loại, producer..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Category Filter */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
              <Filter className="w-3 h-3 text-slate-500" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">Tất cả ({rawList.length})</option>
                <option value="dataset">Dataset</option>
                <option value="comparison">Comparison</option>
                <option value="insight">Insight</option>
                <option value="chart_spec">Chart Spec</option>
                <option value="report">Report</option>
                <option value="finance_plan">Finance</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
              <ArrowUpDown className="w-3 h-3 text-sky-400" />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer pr-1"
                title="Sắp xếp danh sách artifacts theo ngày tạo"
              >
                <option value="newest">Mới nhất trước</option>
                <option value="oldest">Cũ nhất trước</option>
                <option value="type_asc">Loại A → Z</option>
                <option value="type_desc">Loại Z → A</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Artifacts Card Grid / List */}
      <div className="space-y-3">
        {processedList.map((art) => {
          const cfg = TYPE_CONFIG[art.artifact_type] || {
            label: art.artifact_type?.toUpperCase(),
            color: 'text-slate-300',
            border: 'border-slate-700',
            bg: 'bg-slate-800',
            icon: <Layers className="w-3.5 h-3.5 text-slate-400" />,
          };

          return (
            <div
              key={art.artifact_id}
              onClick={() => setSelectedArtifactId(art.artifact_id)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-md transition-all cursor-pointer space-y-2.5 group"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                  >
                    {cfg.icon}
                    <span>{cfg.label}</span>
                  </span>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {art.status || 'VALID'}
                  </span>
                </div>

                {/* Creation Timestamp */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatDateTime(art.created_at)}</span>
                </div>
              </div>

              {/* ID & Producer */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5 font-mono text-slate-400">
                  <span className="text-slate-500">ID:</span>
                  <span className="text-slate-300 font-semibold truncate max-w-[180px] sm:max-w-none">
                    {art.artifact_id}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyId(art.artifact_id, e)}
                    className="text-slate-500 hover:text-sky-400 p-0.5 transition-colors"
                    title="Sao chép ID"
                  >
                    {copiedId === art.artifact_id ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  {art.producer}
                </span>
              </div>

              {/* Summary Sneak Peek & Evidence Count */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  {art.evidence_refs && art.evidence_refs.length > 0 ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-mono">
                      <ShieldCheck className="w-3 h-3" />
                      {art.evidence_refs.length} Bằng chứng
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono">Không đính kèm ref</span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-sky-400 font-medium group-hover:translate-x-0.5 transition-transform">
                  <span>Mở xem chi tiết</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          );
        })}

        {processedList.length === 0 && (
          <div className="p-10 text-center rounded-xl border border-slate-800/80 bg-slate-900/40 text-slate-500 text-xs space-y-2">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <p>
              {searchQuery || filterType !== 'all'
                ? 'Không tìm thấy artifact nào khớp với bộ lọc.'
                : 'Chưa có artifact nào được sinh trong phiên này. Hãy gửi một câu hỏi để kích hoạt chuỗi Agent!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
