import React, { useState, useEffect } from 'react';
import { Cpu, Plug, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Terminal } from 'lucide-react';

interface AgentInfo {
  agent_id: string;
  grpc_target: string;
  domain: string;
  description: string;
  is_dynamic: boolean;
  status: string;
}

interface HotPlugPanelProps {
  onHotPlugSuccess?: () => void;
}

export const HotPlugPanel: React.FC<HotPlugPanelProps> = ({ onHotPlugSuccess }) => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isPlugging, setIsPlugging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/v1/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleHotPlugFinanceAgent = async () => {
    setIsPlugging(true);
    setMessage(null);
    setIsError(false);

    try {
      const payload = {
        agent_id: 'python-finance-agent',
        grpc_target: 'localhost:50056',
        domain: 'banking_and_finance',
        description: 'Chuyên gia tài chính ngân hàng (Python): Gói vay mua nhà, lịch trả nợ gốc lãi hàng tháng.',
        supported_intents: ['calculate_mortgage', 'compare_loan_packages'],
      };

      const res = await fetch('/api/v1/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage('Cắm nóng thành công Agent Python (:50056) mà không cần restart Gateway!');
        setIsError(false);
        await fetchAgents();
        if (onHotPlugSuccess) onHotPlugSuccess();
      } else {
        setMessage(data.error || 'Đăng ký thất bại');
        setIsError(true);
      }
    } catch (err: any) {
      setMessage(`Lỗi kết nối tới Gateway: ${err.message}`);
      setIsError(true);
    } finally {
      setIsPlugging(false);
    }
  };

  const isFinancePlugged = agents.some((a) => a.agent_id === 'python-finance-agent');

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 mb-3">
        <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          Hot-Plugging Control Panel
        </h4>
        <button
          onClick={fetchAgents}
          className="text-xs text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-700/50"
          title="Tải lại danh sách"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Cắm thêm Agent phân tán thời gian thực vào Gateway qua giao thức gRPC mà không gây gián đoạn hệ thống.
      </p>

      {/* Button to Hot Plug */}
      <div className="mb-4">
        <button
          onClick={handleHotPlugFinanceAgent}
          disabled={isPlugging || isFinancePlugged}
          className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
            isFinancePlugged
              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 active:scale-[0.98]'
          }`}
        >
          {isPlugging ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang kết nối gRPC Hub...</span>
            </>
          ) : isFinancePlugged ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Agent Tài chính Đã Cắm Nóng (Active)</span>
            </>
          ) : (
            <>
              <Plug className="w-4 h-4" />
              <span>Cắm Agent Tài chính (Port 50056)</span>
            </>
          )}
        </button>
      </div>

      {message && (
        <div
          className={`p-2.5 rounded-lg text-xs mb-3 flex items-start gap-2 border ${
            isError
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {isError ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          ) : (
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          )}
          <span>{message}</span>
        </div>
      )}

      {/* Active Agents list */}
      <div className="flex-1 overflow-y-auto pr-1">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Danh sách Agent đang cắm ({agents.length}):
        </span>

        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.agent_id}
              className={`p-2.5 rounded-lg border text-xs transition-colors ${
                agent.is_dynamic
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-slate-900/50 border-slate-700/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${agent.status === 'HEALTHY' ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                  {agent.agent_id}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    agent.is_dynamic
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {agent.grpc_target}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">{agent.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
