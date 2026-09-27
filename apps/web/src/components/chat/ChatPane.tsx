/**
 * apps/web/src/components/chat/ChatPane.tsx
 * Center column: Conversation stream with the active agent chatbot and composer.
 * Displays structured multi-agent step progress in Orchestrator and live token streaming in individual agents.
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Layers,
  Database,
  GitCompare,
  Lightbulb,
  BarChart3,
  FileText,
  DollarSign,
  Bot,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';

const AGENT_HEADER_ICONS: Record<string, React.ReactNode> = {
  orchestrator: <Layers className="w-5 h-5 text-purple-400" />,
  'data-agent': <Database className="w-5 h-5 text-blue-400" />,
  'compare-agent': <GitCompare className="w-5 h-5 text-cyan-400" />,
  'insight-agent': <Lightbulb className="w-5 h-5 text-amber-400" />,
  'chart-agent': <BarChart3 className="w-5 h-5 text-emerald-400" />,
  'report-agent': <FileText className="w-5 h-5 text-rose-400" />,
  'python-finance-agent': <DollarSign className="w-5 h-5 text-emerald-300" />,
};

const PIPELINE_STEPS = [
  { id: 'data-agent', name: 'Data Agent (:50051)', title: 'Khai thác Kho Dữ Liệu SQLite' },
  { id: 'compare-agent', name: 'Compare Agent (:50052)', title: 'Đối chuẩn Giỏ hàng Phân khu' },
  { id: 'insight-agent', name: 'Insight Agent (:50053)', title: 'Phân tích 3 Căn nguyên Gốc' },
  { id: 'chart-agent', name: 'Chart Agent (:50054)', title: 'Khởi tạo Biểu đồ Recharts' },
  { id: 'report-agent', name: 'Report Agent (:50055)', title: 'Tổng hợp Báo cáo 6 Phần' },
];

export const ChatPane: React.FC = () => {
  const {
    activeAgent,
    agents,
    messages,
    isRunning,
    runningAgents,
    activeTraces,
    agentTraces,
    setActiveAgent,
  } = useChat();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [typingToken, setTypingToken] = useState('...');

  const currentAgent = agents.find((a) => a.agent_id === activeAgent) || {
    agent_id: activeAgent,
    name: activeAgent,
    grpc_target: '',
    description: 'Chuyên gia AI',
    status: 'HEALTHY',
    is_dynamic: false,
    domain: 'analytics',
  };

  const isCurrentAgentRunning = Boolean(runningAgents[activeAgent]);

  // Filter messages for current agent (orchestrator shows orchestrator or all if none)
  const agentMessages = messages.filter(
    (m) => m.agent_id === activeAgent || (activeAgent === 'orchestrator' && m.agent_id === 'orchestrator')
  );

  // Animated cursor / token generator preview
  useEffect(() => {
    if (!isCurrentAgentRunning) return;
    const tokens = [
      'Đang kết nối gRPC server...',
      'Đang nạp dữ liệu phân tích...',
      'Đang đối soát bảng fact_unit_snapshot...',
      'Đang tính toán các chỉ số thống kê...',
      'Đang tổng hợp câu trả lời chi tiết...',
    ];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % tokens.length;
      setTypingToken(tokens[idx]);
    }, 1500);
    return () => clearInterval(interval);
  }, [isCurrentAgentRunning]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages.length, activeTraces.length, isRunning, isCurrentAgentRunning]);

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-950 min-w-0">
      {/* Agent Chat Header */}
      <header className="px-6 py-3.5 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-800 border border-slate-700">
            {AGENT_HEADER_ICONS[activeAgent] || <Bot className="w-5 h-5 text-sky-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">{currentAgent.name || currentAgent.agent_id}</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                {currentAgent.grpc_target || 'Internal Core'}
              </span>
              {currentAgent.is_dynamic && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Dynamic Hot-Plug
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">{currentAgent.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCurrentAgentRunning ? (
            <span className="flex items-center gap-1.5 text-xs text-sky-400 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang xử lý</span>
            </span>
          ) : (
            <>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  currentAgent.status === 'HEALTHY'
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-xs text-slate-400 font-mono">
                {currentAgent.status === 'HEALTHY' ? 'Available' : 'Offline'}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {agentMessages.length === 0 && !isCurrentAgentRunning && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3 text-slate-600">
              {AGENT_HEADER_ICONS[activeAgent] || <Bot className="w-7 h-7" />}
            </div>
            <h3 className="text-sm font-semibold text-slate-300">
              Bắt đầu trò chuyện với {currentAgent.name || currentAgent.agent_id}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
              Mỗi agent là một chuyên gia độc lập có khả năng trả lời truy vấn, trích xuất dữ liệu, hoặc thực thi nhiệm vụ theo đúng nghiệp vụ chuyên môn.
            </p>
          </div>
        )}

        {/* Existing Messages for this Agent */}
        {agentMessages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}

        {/* ======================================================== */}
        {/* CASE 1: Orchestrator is Running -> Show Grouped Agent Process */}
        {/* ======================================================== */}
        {activeAgent === 'orchestrator' && isRunning && (
          <div className="my-4 p-4 rounded-xl bg-slate-900/95 border border-sky-500/30 shadow-xl text-slate-300 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                <span>Quy trình điều phối thực thi theo từng Agent (DAG Pipeline):</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Live SSE</span>
            </div>

            {/* Individual Agent Execution Cards */}
            <div className="space-y-2">
              {PIPELINE_STEPS.map((step) => {
                const isStepRunning = Boolean(runningAgents[step.id]);
                const stepTraces = activeTraces.filter(
                  (t) =>
                    t.agent_id === step.id ||
                    t.step.toLowerCase().includes(step.id.replace('-agent', ''))
                );
                const hasFinished = !isStepRunning && stepTraces.length > 0;

                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-lg border text-xs transition-all ${
                      isStepRunning
                        ? 'bg-sky-950/30 border-sky-500/50 shadow-sm'
                        : hasFinished
                        ? 'bg-slate-950/70 border-slate-800'
                        : 'bg-slate-950/30 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        {isStepRunning ? (
                          <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                        ) : hasFinished ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-600" />
                        )}
                        <span className={isStepRunning ? 'text-sky-300' : hasFinished ? 'text-slate-200' : 'text-slate-500'}>
                          {step.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          • {step.title}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveAgent(step.id)}
                        className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 font-mono"
                      >
                        <span>Mở chatbox riêng</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* Step-specific traces */}
                    {stepTraces.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
                        {stepTraces.slice(-3).map((t, idx) => (
                          <div key={idx} className="truncate">
                            <span className="text-slate-600 mr-1">&gt;</span>
                            {t.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 2: Individual Agent is Running -> Live Reasoning CoT Streaming Preview */}
        {/* ======================================================== */}
        {activeAgent !== 'orchestrator' && isCurrentAgentRunning && (
          <div className="my-4 p-4 rounded-xl bg-slate-900/95 border border-sky-500/40 shadow-2xl text-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                <span>{currentAgent.name} đang suy luận Chain-of-Thought (CoT)...</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                Live CoT Streaming
              </span>
            </div>

            {/* Token Generator Visualizer */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-sky-300/90 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
              <span className="italic">{typingToken}</span>
              <span className="inline-block w-2 h-4 bg-sky-400 animate-pulse" />
            </div>

            {/* Live CoT Traces for this specific agent */}
            {agentTraces[activeAgent] && agentTraces[activeAgent].length > 0 && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-[11px] bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <div className="text-[10px] font-bold text-amber-400/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <span>💭 Các bước suy luận (Reasoning Steps):</span>
                </div>
                {agentTraces[activeAgent].map((t, idx) => {
                  const isCoT = t.message.includes('CoT') || t.message.includes('💭');
                  return (
                    <div
                      key={idx}
                      className={`leading-relaxed ${
                        isCoT ? 'text-amber-200/90 bg-amber-500/5 p-1 rounded border-l-2 border-amber-400/60' : 'text-slate-400'
                      }`}
                    >
                      <span className="text-slate-600 mr-1">&gt;</span>
                      {t.message}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer Input Form */}
      <Composer />
    </div>
  );
};
