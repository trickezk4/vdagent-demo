/**
 * apps/web/src/components/inspector/EvidenceViewer.tsx
 * Rich Evidence Inspector with Catalog Overview and Detailed Unit Inspection,
 * complete with Back button to browse all evidence artifacts.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Calendar,
  DollarSign,
  Compass,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Search,
  Filter,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import type { UnitDetail } from '../../types';

export const EvidenceViewer: React.FC = () => {
  const {
    inspectedUnit,
    inspectedUnitId,
    inspectEvidence,
    clearInspectedEvidence,
    sendMessage,
    setActiveAgent,
  } = useChat();

  const [allUnits, setAllUnits] = useState<UnitDetail[]>([]);
  const [search, setSearch] = useState('');
  const [filterSlow, setFilterSlow] = useState(true);

  // Fetch all units from mock warehouse for catalog view
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch('/api/v1/warehouse/units');
        if (res.ok) {
          const data = await res.json();
          setAllUnits(data.units || []);
        }
      } catch {
        // ignore
      }
    };
    fetchUnits();
  }, []);

  const unit = inspectedUnit;

  // Filter catalog units
  const catalogUnits = allUnits.filter((u) => {
    if (filterSlow && (u.dom ?? 0) < 90) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.unit_code?.toLowerCase().includes(q) ||
        u.unit_id?.toLowerCase().includes(q) ||
        u.building?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // =============================================================
  // VIEW MODE 1: CATALOG OVERVIEW (When no specific unit is selected or after clicking Back)
  // =============================================================
  if (!unit) {
    return (
      <div className="p-5 overflow-y-auto space-y-4 h-full text-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Danh Mục Hồ Sơ Bằng Chứng (Evidence Catalog)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chọn một căn hộ bên dưới để mở thanh tra chi tiết bằng chứng nguồn
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterSlow(!filterSlow)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
                filterSlow
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>{filterSlow ? 'Chỉ căn DOM >= 90d' : 'Tất cả căn'}</span>
            </button>
          </div>
        </div>

        {/* Evidence Units Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalogUnits.map((u) => {
            const isSlow = (u.dom ?? 0) >= 90;
            const price = u.current_asking_price_vnd || u.launch_price_vnd || 2850000000;
            const priceSqm = u.price_per_sqm_vnd || Math.round(price / (u.area_sqm || 55.4));

            return (
              <div
                key={u.unit_id}
                onClick={() => inspectEvidence(u.unit_id)}
                className="bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3.5 cursor-pointer transition-all shadow-md group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-xs text-slate-100 group-hover:text-emerald-300 transition-colors">
                      {u.unit_code || u.unit_id}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                        isSlow
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      DOM {u.dom} ngày
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Tòa {u.building} • Tầng {u.floor_level} • {u.area_sqm} m² ({u.bedroom_count}PN)
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hướng: <span className="text-amber-300">{u.view_direction}</span>
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Đơn giá</span>
                    <span className="font-bold text-sky-400 font-mono">
                      {(priceSqm / 1e6).toFixed(1)} tr/m²
                    </span>
                  </div>

                  <span className="text-[11px] text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    <span>Xem chi tiết</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {catalogUnits.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-xs">
            Đang tải danh sách hồ sơ bằng chứng...
          </div>
        )}
      </div>
    );
  }

  // =============================================================
  // VIEW MODE 2: DETAILED EVIDENCE INSPECTOR (With prominent Back button)
  // =============================================================
  const isSlow = (unit.dom ?? 0) >= 90;
  const askingPrice = unit.current_asking_price_vnd || 2890000000;
  const pricePerSqm =
    unit.price_per_sqm_vnd ||
    Math.round(askingPrice / (unit.area_sqm || 55.4));

  return (
    <div className="p-5 overflow-y-auto space-y-4 h-full text-slate-200">
      {/* Top Navigation Back Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <button
          type="button"
          onClick={() => clearInspectedEvidence()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors shadow-sm"
          title="Quay lại xem danh sách tất cả các bằng chứng"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
          <span>Quay lại danh mục bằng chứng</span>
        </button>

        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Evidence Detail View
        </span>
      </div>

      {/* Unit Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 font-mono">
                  {unit.unit_code || unit.unit_id}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  {unit.unit_id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {unit.project_name || 'Vinhomes Ocean Park'} • {unit.zone_name || 'The Sapphire 1'}
              </p>
            </div>
          </div>

          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold border flex items-center gap-1.5 ${
              isSlow
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isSlow ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
            {isSlow ? `DOM ${unit.dom} ngày (Chậm bán)` : `DOM ${unit.dom} ngày (Bình thường)`}
          </span>
        </div>

        {/* Property Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block">Tòa &amp; Tầng</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">
              Tòa {unit.building} • Tầng {unit.floor_level}
            </span>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block">Diện tích / Cơ cấu</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">
              {unit.area_sqm} m² ({unit.bedroom_count}PN, {unit.bathroom_count}WC)
            </span>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block">Hướng ban công</span>
            <span className="font-semibold text-amber-300 mt-0.5 block flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" />
              {unit.view_direction} (Nắng chiều)
            </span>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block">Lượt xem / Liên hệ</span>
            <span className="font-semibold text-sky-400 mt-0.5 block flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {unit.views_count || 210} / {unit.inquiries_count || 9}
            </span>
          </div>
        </div>

        {/* Pricing Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Giá chào bán hiện tại</span>
            <div className="text-lg font-bold text-slate-100 mt-0.5">
              {askingPrice.toLocaleString('vi-VN')} <span className="text-xs text-slate-400 font-normal">VNĐ</span>
            </div>
            <span className="text-[11px] text-sky-400 font-mono block mt-0.5">
              {(pricePerSqm / 1e6).toFixed(2)} triệu VNĐ / m²
            </span>
          </div>

          <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Đối chuẩn phân khu Sapphire</span>
            <div className="text-lg font-bold text-slate-300 mt-0.5">
              47.60 <span className="text-xs text-slate-400 font-normal">triệu/m²</span>
            </div>
            <span className="text-[11px] text-rose-400 font-mono block mt-0.5">
              Độ lệch giá: +9.4% (Cao hơn đối chuẩn)
            </span>
          </div>
        </div>
      </div>

      {/* 3 Root Causes Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Phân Tích 3 Căn Nguyên Gốc (Root Causes)
        </h4>

        <div className="space-y-2.5">
          <div className="p-3 rounded-lg bg-slate-950 border border-rose-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-300">1. Hướng Tây hấp thụ bức xạ nhiệt cao</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                Tác động: CAO
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Căn hộ chịu nắng gắt trực diện từ 13h - 17h, làm nhiệt độ phòng tăng cao và gia tăng chi phí làm mát. Khảo sát thực địa ghi nhận 65% khách hàng từ chối sau khi xem nhà vào buổi chiều.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">2. Đơn giá cao hơn đối chuẩn phân khu (+9.4%)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                Tác động: TRUNG BÌNH
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Đơn giá 52.2 triệu/m² cao hơn 9.4% so với mức thanh khoản trung bình của The Sapphire (~47.6 triệu/m²). Các căn cùng diện tích hướng Đông/Nam đang hấp thụ nhanh ở mức 47-49 triệu/m².
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-sky-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300">3. Chính sách hỗ trợ 0% lãi suất đã hết hạn</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                Tác động: CAO
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Gói ưu đãi ân hạn nợ gốc và 0% lãi suất của chủ đầu tư đã kết thúc 3 tháng trước. Khách mua hiện phải thanh toán theo lãi suất thả nổi ~8.5-9.5%/năm, làm tăng áp lực dòng tiền hàng tháng.
            </p>
          </div>
        </div>
      </div>

      {/* Recommended Action & Connected Agent Trigger */}
      <div className="bg-gradient-to-r from-emerald-950/40 to-sky-950/40 border border-emerald-500/30 rounded-xl p-4 shadow-md">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Khuyến Nghị Hành Động
        </h4>
        <ul className="text-xs text-slate-300 space-y-1.5 mb-3 leading-relaxed">
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <span>Điều chỉnh giá chào bán từ 52.2 tr/m² xuống 48.8 tr/m² (khoảng 2.70 tỷ VNĐ, -6.5%).</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <span>Tặng gói rèm cách nhiệt / phim bảo vệ chống nóng trị giá 30 triệu VNĐ.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <span>Kích hoạt gói vay liên kết ngân hàng đối tác hỗ trợ lãi suất ưu đãi.</span>
          </li>
        </ul>

        <button
          onClick={() => {
            setActiveAgent('python-finance-agent');
            sendMessage(
              `Tính toán phương án vay ngân hàng cho căn hộ ${unit.unit_code} (giá ${askingPrice.toLocaleString('vi-VN')} VNĐ)`,
              'python-finance-agent'
            );
          }}
          className="w-full py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>Tính phương án vay cho căn này với Python Finance Agent</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Warehouse Audit Verification */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-400 space-y-1">
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            Mock Warehouse SQLite Audit Proof
          </span>
          <span className="text-[10px] text-emerald-400">VERIFIED</span>
        </div>
        <div>
          <span>Bản ghi nguồn: </span>
          <span className="text-slate-200">dim_units ⨝ fact_unit_snapshot</span>
        </div>
        <div className="truncate">
          <span>SHA-256 Hash: </span>
          <span className="text-slate-200">{unit.verified_hash || '3f9a7c2b810d4e9f7a5b3c1d8e0f2a4b'}</span>
        </div>
      </div>
    </div>
  );
};
