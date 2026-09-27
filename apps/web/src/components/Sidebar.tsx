/**
 * apps/web/src/components/Sidebar.tsx
 * Left column: Session switcher, Agent list with autonomous discovery, and scenario shortcuts.
 */

import React from 'react';
import {
  Building2,
  Plus,
  Activity,
  Layers,
  Database,
  GitCompare,
  Lightbulb,
  BarChart3,
  FileText,
  DollarSign,
  Sparkles,
  Terminal,
  Loader2,
} from 'lucide-react';
import { useChat } from '../context/ChatContext';

const AGENT_ICONS: Record<string, React.ReactNode> = {
  orchestrator: <Layers className="w-4 h-4 text-purple-400" />,
  'data-agent': <Database className="w-4 h-4 text-blue-400" />,
  'compare-agent': <GitCompare className="w-4 h-4 text-cyan-400" />,
  'insight-agent': <Lightbulb className="w-4 h-4 text-amber-400" />,
  'chart-agent': <BarChart3 className="w-4 h-4 text-emerald-400" />,
  'report-agent': <FileText className="w-4 h-4 text-rose-400" />,
  'python-finance-agent': <DollarSign className="w-4 h-4 text-emerald-300" />,
};

export const Sidebar: React.FC = () => {
  const {
    sessionId,
    sessions,
    activeAgent,
    agents,
    runningAgents,
    setActiveAgent,
    createNewSession,
    switchSession,
    sendMessage,
    isRunning,
  } = useChat();

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 leading-none">
              VDaAgent
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                PoC
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-1 leading-none">Real Estate Multi-Agent</p>
          </div>
        </div>

        {/* Session Switcher */}
        <div className="mt-3 flex items-center gap-2">
          <select
            value={sessionId}
            onChange={(e) => switchSession(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createNewSession}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Tạo phiên mới (Lưu phiên cũ)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Agents List (Chatbot selector) */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1">
          Danh Sách Agents ({agents.length})
        </div>

        {agents.map((agent) => {
          const isSelected = activeAgent === agent.agent_id;
          const isHealthy = agent.status === 'HEALTHY';
          const isAgentRunning = Boolean(runningAgents[agent.agent_id]);
          const icon = AGENT_ICONS[agent.agent_id] || <Layers className="w-4 h-4" />;

          return (
            <button
              key={agent.agent_id}
              onClick={() => setActiveAgent(agent.agent_id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-start gap-2.5 ${
                isSelected
                  ? 'bg-sky-500/15 border border-sky-500/30 text-white shadow-sm'
                  : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
              }`}
            >
              <div className="mt-0.5">{icon}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate text-slate-200">
                    {agent.name || agent.agent_id}
                  </span>
                  {isAgentRunning ? (
                    <span className="flex items-center gap-1 flex-shrink-0 ml-1.5" title="Agent đang thực thi...">
                      <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                    </span>
                  ) : (
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ml-1.5 ${
                        isHealthy
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                          : 'bg-slate-500'
                      }`}
                      title={isHealthy ? 'Sẵn sàng (Healthy)' : 'Chưa kết nối (Unavailable)'}
                    />
                  )}
                </div>

                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {agent.description || agent.domain}
                </p>

                {agent.is_dynamic && (
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        isAgentRunning
                          ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                          : isHealthy
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {isAgentRunning
                        ? '⚡ Đang thực thi...'
                        : isHealthy
                        ? '● Auto-Plugged'
                        : '○ Chờ service Python'}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Quick Test Scenarios */}
        <div className="pt-4 pb-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Kịch Bản Mẫu
          </div>

          <div className="space-y-1.5 mt-1">
            <button
              onClick={() => {
                setActiveAgent('orchestrator');
                sendMessage('Tại sao phân khu Sapphire có căn hộ bán chậm hơn 90 ngày?', 'orchestrator');
              }}
              disabled={isRunning}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition-colors truncate"
            >
              🚀 <strong>Hero Flow</strong> (6 Agents Sapphire)
            </button>

            <button
              onClick={() => {
                setActiveAgent('python-finance-agent');
                sendMessage('Tính gói vay 70% trong 20 năm cho căn hộ Sapphire 2.89 tỷ', 'python-finance-agent');
              }}
              disabled={isRunning}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition-colors truncate"
            >
              💰 <strong>Tài chính</strong> (Vay 70% căn 2.89 tỷ)
            </button>

            <button
              onClick={() => {
                setActiveAgent('compare-agent');
                sendMessage('So sánh căn UNIT-VH-02 với mặt bằng chung Sapphire', 'compare-agent');
              }}
              disabled={isRunning}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition-colors truncate"
            >
              📊 <strong>Đối chuẩn</strong> (UNIT-VH-02 vs Phân khu)
            </button>
          </div>
        </div>
      </div>

      {/* Autonomous Discovery Info Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between text-slate-300 font-semibold mb-1">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            Tự Động Nhận Diện
          </span>
          <span className="text-[10px] text-slate-500 font-mono">gRPC Hub</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-normal">
          Remote Python Agent tự động gửi yêu cầu kết nối tới Hub khi khởi chạy.
        </p>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
          <Terminal className="w-3 h-3 text-sky-400" />
          <span className="truncate">python .../server.py</span>
        </div>
      </div>
    </aside>
  );
};
