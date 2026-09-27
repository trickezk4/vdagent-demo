/**
 * apps/web/src/components/inspector/FinanceViewer.tsx
 * Mortgage calculation & loan amortization schedule viewer produced by Python Finance Agent.
 */

import React from 'react';
import { DollarSign, Percent, Calendar, ShieldAlert, Sparkles, Building2 } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

export const FinanceViewer: React.FC = () => {
  const { artifacts, sendMessage } = useChat();

  const financeArt = artifacts.finance_plan;
  const plan = financeArt?.payload || {
    property_price: 2890000000,
    loan_amount: 2023000000,
    loan_ratio_pct: 70,
    interest_rate_pct: 8.5,
    term_years: 20,
    monthly_payment_estimate: 17565430,
    policy_note:
      'Gói vay mua nhà thương mại liên kết ngân hàng. Ân hạn nợ gốc 12 tháng đầu, lãi suất thả nổi biên độ 3.5% sau thời gian ưu đãi.',
  };

  const propertyPrice = plan.property_price || 2890000000;
  const loanAmount = plan.loan_amount || propertyPrice * 0.7;
  const monthly = plan.monthly_payment_estimate || 17565430;

  return (
    <div className="p-5 overflow-y-auto space-y-4 h-full text-slate-200">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Phương Án Tài Chính &amp; Gói Vay Ngân Hàng
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sinh tự động bởi <span className="font-mono text-emerald-400">Python Finance Agent (:50056)</span> qua cơ chế Hot-plugging
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
          gRPC :50056
        </span>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">Giá trị bất động sản</span>
          <div className="text-xl font-bold text-slate-100 mt-1">
            {propertyPrice.toLocaleString('vi-VN')} <span className="text-xs text-slate-400 font-normal">VNĐ</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Căn hộ phân khu Sapphire</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">
            Hạn mức vay ({plan.loan_ratio_pct || 70}%)
          </span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {loanAmount.toLocaleString('vi-VN')} <span className="text-xs text-slate-400 font-normal">VNĐ</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Lãi suất {plan.interest_rate_pct || 8.5}%/năm ({plan.term_years || 20} năm)
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">Ước tính trả góp / tháng</span>
          <div className="text-xl font-bold text-sky-400 mt-1">
            {monthly.toLocaleString('vi-VN')} <span className="text-xs text-slate-400 font-normal">VNĐ</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Gốc + lãi bình quân</span>
        </div>
      </div>

      {/* Policy Note Box */}
      <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200 leading-relaxed">
        <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Chính Sách Hỗ Trợ Đề Xuất
        </h4>
        <p className="text-slate-300">
          {plan.policy_note ||
            'Gói vay ưu đãi liên kết ngân hàng: Hỗ trợ ân hạn nợ gốc 12 tháng đầu, lãi suất cố định 8.5%/năm trong 2 năm đầu tiên.'}
        </p>
      </div>

      {/* Quick Recalculate Prompts */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
        <span className="text-slate-400 font-medium block">Thử nghiệm các gói vay khác với Python Agent:</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => sendMessage('Tính gói vay 80% trong 25 năm cho căn hộ Sapphire 2.89 tỷ', 'python-finance-agent')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Vay 80% • Thời hạn 25 năm
          </button>
          <button
            type="button"
            onClick={() => sendMessage('Tính gói vay 50% trong 15 năm cho căn hộ Sapphire 2.89 tỷ', 'python-finance-agent')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Vay 50% • Thời hạn 15 năm
          </button>
        </div>
      </div>
    </div>
  );
};
