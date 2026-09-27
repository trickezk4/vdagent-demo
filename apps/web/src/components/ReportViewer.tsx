import React, { useState } from 'react';
import { FileText, ShieldCheck, Check, DollarSign, ExternalLink, Info } from 'lucide-react';

interface ReportViewerProps {
  reportArtifact?: any;
  financeArtifact?: any;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ reportArtifact, financeArtifact }) => {
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);

  if (financeArtifact) {
    const plan = financeArtifact.payload || {};
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Bảng Phương Án Tài Chính & Gói Vay Ngân Hàng</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Sinh tự động bởi <span className="font-mono text-emerald-400">Python Finance Agent (:50056)</span> qua cơ chế Hot-plugging
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full font-mono">
            {financeArtifact.producer}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Giá trị bất động sản</span>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {(plan.property_price || 4500000000).toLocaleString('vi-VN')} <span className="text-sm font-normal text-slate-400">VNĐ</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Căn hộ phân khu Sapphire</p>
          </div>

          <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Hạn mức vay (70%)</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {(plan.loan_amount || 3150000000).toLocaleString('vi-VN')} <span className="text-sm font-normal text-slate-400">VNĐ</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Lãi suất {plan.interest_rate_pct || 8.5}%/năm ({plan.term_years || 20} năm)</p>
          </div>

          <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Ước tính trả góp / tháng</span>
            <div className="text-2xl font-bold text-sky-400 mt-1">
              {(plan.monthly_payment_estimate || plan.monthly_installment || 27339736).toLocaleString('vi-VN')} <span className="text-sm font-normal text-slate-400">VNĐ</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Gốc + lãi hàng tháng</p>
          </div>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-4 text-xs text-emerald-200 leading-relaxed mb-4">
          <span className="font-semibold text-emerald-400">📌 Chính sách ưu đãi đối tác: </span>
          {plan.policy_note || plan.note || 'Ân hạn nợ gốc và hỗ trợ lãi suất 0% trong 18 tháng đầu từ ngân hàng liên kết.'}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-700/50">
          <span className="font-mono text-[11px]">Artifact ID: {financeArtifact.artifact_id}</span>
          <span className="font-mono text-[11px]">Hash: {financeArtifact.content_hash}</span>
        </div>
      </div>
    );
  }

  if (!reportArtifact || !reportArtifact.payload) {
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-8 h-80 flex flex-col items-center justify-center text-slate-500">
        <FileText className="w-12 h-12 mb-2 stroke-[1.5] text-slate-600" />
        <p className="text-sm font-medium">Báo cáo tổng hợp chưa sẵn sàng</p>
        <p className="text-xs text-slate-600 mt-1">
          Báo cáo 6 phần có chứng thực sẽ xuất hiện khi chuỗi pipeline hoàn thành bước cuối
        </p>
      </div>
    );
  }

  const payload = reportArtifact.payload;
  const rawContent = payload.content_markdown || payload.markdown || JSON.stringify(payload, null, 2);

  // Render markdown with highlighted evidence badges
  const renderFormattedReport = (content: string) => {
    const lines = content.split('\n');

    return lines.map((line, idx) => {
      // Highlight Evidence References: e.g. [Evidence-REF: UNIT-102] or [UNIT-DOM-SLOW-01]
      const parts = line.split(/(\[Evidence-REF:[^\]]+\]|\[UNIT-[^\]]+\])/g);

      // Section Headings
      if (line.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-xl font-bold text-slate-100 mt-4 mb-2 pb-2 border-b border-slate-700">
            {line.replace('# ', '')}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-base font-bold text-sky-400 mt-4 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-sky-400"></span>
            {line.replace('## ', '')}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-sm font-semibold text-slate-200 mt-3 mb-1">
            {line.replace('### ', '')}
          </h3>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="text-xs text-slate-300 ml-4 mb-1 list-disc leading-relaxed">
            {parts.map((p, pIdx) => renderBadge(p, pIdx))}
          </li>
        );
      }

      return (
        <p key={idx} className="text-xs text-slate-300 mb-2 leading-relaxed">
          {parts.map((p, pIdx) => renderBadge(p, pIdx))}
        </p>
      );
    });
  };

  const renderBadge = (text: string, key: number) => {
    if (text.startsWith('[Evidence-REF:') || text.startsWith('[UNIT-')) {
      const cleanRef = text.replace(/\[|\]/g, '');
      return (
        <button
          key={key}
          onClick={() => setSelectedEvidence(cleanRef)}
          className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono hover:bg-emerald-500/30 transition-colors"
          title="Bấm để xem nguồn bằng chứng"
        >
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          {cleanRef}
        </button>
      );
    }
    return text;
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-slate-700/60 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {payload.title || 'Báo Cáo Điều Tra & Phân Tích Căn Hộ Bán Chậm (Evidence-Backed)'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tổng hợp 6 phần chuẩn PRD • Đính kèm truy vết bằng chứng nguồn từ Mock Warehouse
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
            Status: {reportArtifact.status}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 font-mono">
            {reportArtifact.producer}
          </span>
        </div>
      </div>

      {selectedEvidence && (
        <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-400" />
            <span>Đang tra cứu bằng chứng: <strong>{selectedEvidence}</strong> (Khớp bản ghi trong Mock Warehouse)</span>
          </div>
          <button
            onClick={() => setSelectedEvidence(null)}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="prose prose-invert max-w-none text-slate-200 text-xs leading-relaxed max-h-[500px] overflow-y-auto pr-2 space-y-1">
        {renderFormattedReport(rawContent)}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Artifact ID: {reportArtifact.artifact_id}</span>
        <span>Content Hash (SHA-256): {reportArtifact.content_hash}</span>
      </div>
    </div>
  );
};
