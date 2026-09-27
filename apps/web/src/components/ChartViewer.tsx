import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, AlertCircle } from 'lucide-react';

interface ChartViewerProps {
  chartArtifact?: any;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({ chartArtifact }) => {
  if (!chartArtifact || !chartArtifact.payload) {
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-6 h-80 flex flex-col items-center justify-center text-slate-500">
        <BarChart3 className="w-12 h-12 mb-2 stroke-[1.5] text-slate-600" />
        <p className="text-sm font-medium">Chưa có biểu đồ trực quan hóa</p>
        <p className="text-xs text-slate-600 mt-1">Biểu đồ sẽ hiển thị tự động sau khi Chart Agent sinh ChartSpec</p>
      </div>
    );
  }

  const payload = chartArtifact.payload;
  const title = payload.title || 'Biểu đồ phân tích DOM (Days on Market) & Giá Căn Hộ';
  const data = payload.chart_data || [];
  const xAxisKey = payload.x_axis || 'name';
  const yAxisKey = payload.y_axis || 'dom';

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/50">
        <div>
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            {title}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Trực quan hóa căn hộ có DOM &gt; 90 ngày (Số liệu từ Data Agent &amp; Chart Agent)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            DOM &gt; 90 ngày (Chậm bán)
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            DOM tiêu chuẩn
          </span>
        </div>
      </div>

      <div className="w-full h-72 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
            <XAxis
              dataKey={xAxisKey}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              angle={-20}
              textAnchor="end"
            />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" ngày" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '0.5rem',
                color: '#f8fafc',
                fontSize: '12px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              }}
              formatter={(val: any, name: any) => [`${val} ngày`, name === 'dom' ? 'Ngày trên thị trường (DOM)' : name]}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              formatter={(value) => (value === 'dom' ? 'Số ngày bán (DOM)' : value)}
            />
            <Bar dataKey={yAxisKey} fill="#38bdf8" radius={[4, 4, 0, 0]}>
              {data.map((entry: any, index: number) => {
                const domVal = entry[yAxisKey] || entry.dom || 0;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={domVal >= 90 ? '#f43f5e' : '#10b981'}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {chartArtifact.evidence_refs && chartArtifact.evidence_refs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono text-[11px] text-slate-400">
            Hash: {chartArtifact.content_hash?.substring(0, 16)}...
          </span>
          <span className="text-[11px] text-sky-400">
            {chartArtifact.evidence_refs.length} Bằng chứng trích xuất từ Data Warehouse
          </span>
        </div>
      )}
    </div>
  );
};
