/**
 * apps/web/src/components/inspector/DatasetTable.tsx
 * Interactive SQLite warehouse units table with DOM filter and click-to-inspect.
 */

import React, { useState, useEffect } from 'react';
import { Database, Filter, Search, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import type { UnitDetail } from '../../types';

export const DatasetTable: React.FC = () => {
  const { inspectEvidence } = useChat();
  const [units, setUnits] = useState<UnitDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [slowOnly, setSlowOnly] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch('/api/v1/warehouse/units');
        if (res.ok) {
          const data = await res.json();
          setUnits(data.units || []);
        }
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    };
    fetchUnits();
  }, []);

  const filtered = units.filter((u) => {
    if (slowOnly && (u.dom ?? 0) < 90) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.unit_code?.toLowerCase().includes(q) ||
        u.unit_id?.toLowerCase().includes(q) ||
        u.building?.toLowerCase().includes(q) ||
        u.zone_name?.toLowerCase().includes(q) ||
        u.view_direction?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-5 flex flex-col h-full overflow-hidden text-slate-200">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Kho Dữ Liệu BĐS (SQLite Mock Warehouse)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Bảng liên kết <span className="font-mono text-sky-400">dim_units</span> ⨝ <span className="font-mono text-sky-400">fact_unit_snapshot</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Slow only toggle */}
          <button
            type="button"
            onClick={() => setSlowOnly(!slowOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              slowOnly
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Chỉ căn DOM &ge; 90d</span>
          </button>

          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã căn, tòa..."
              className="w-36 sm:w-44 bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto mt-3 rounded-xl border border-slate-800 bg-slate-900/50 shadow-inner">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900 text-slate-400 text-[11px] uppercase tracking-wider sticky top-0 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Mã Căn</th>
              <th className="py-2.5 px-3">Tòa / Tầng</th>
              <th className="py-2.5 px-3">Diện Tích</th>
              <th className="py-2.5 px-3">Hướng</th>
              <th className="py-2.5 px-3">DOM</th>
              <th className="py-2.5 px-3">Giá Chào Bán</th>
              <th className="py-2.5 px-3">Đơn Giá / m²</th>
              <th className="py-2.5 px-3 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {filtered.map((u) => {
              const isSlow = (u.dom ?? 0) >= 90;
              const priceVnd = u.current_asking_price_vnd || u.launch_price_vnd || 2850000000;
              const priceSqm =
                u.price_per_sqm_vnd ||
                Math.round(priceVnd / (u.area_sqm || 55.4));

              return (
                <tr
                  key={u.unit_id}
                  onClick={() => inspectEvidence(u.unit_id)}
                  className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3 font-semibold text-slate-200">
                    <span className="flex items-center gap-1.5">
                      {isSlow && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                      {u.unit_code || u.unit_id}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">
                    {u.building} - Tầng {u.floor_level}
                  </td>
                  <td className="py-2 px-3 text-slate-300">{u.area_sqm} m²</td>
                  <td className="py-2 px-3 text-slate-400">{u.view_direction}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        isSlow
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {u.dom} ngày
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-200">
                    {(priceVnd / 1e9).toFixed(2)} tỷ
                  </td>
                  <td className="py-2 px-3 text-sky-400">
                    {(priceSqm / 1e6).toFixed(1)} tr/m²
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        inspectEvidence(u.unit_id);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>Xem bằng chứng</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-500 text-xs">
            Không tìm thấy căn hộ nào khớp với bộ lọc.
          </div>
        )}
      </div>
    </div>
  );
};
