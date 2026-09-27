/**
 * apps/web/src/components/chat/MessageItem.tsx
 * Renders individual chat message with markdown, clickable evidence badges, and artifact links.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Terminal,
  BarChart3,
  FileText,
  DollarSign,
  Database,
  ExternalLink,
} from 'lucide-react';
import type { ChatMessage } from '../../types';
import { useChat } from '../../context/ChatContext';

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orchestrator: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'data-agent': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'compare-agent': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'insight-agent': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  'chart-agent': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'report-agent': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
  'python-finance-agent': { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/40' },
};

export const MessageItem: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const { inspectEvidence, openArtifact, setActiveAgent } = useChat();
  const [showTraces, setShowTraces] = useState(false);

  const isUser = message.role === 'user';
  const theme = AGENT_COLORS[message.agent_id] || AGENT_COLORS.orchestrator;
  const traces = message.traceLogs || [];

  // Parse evidence references like [Evidence-REF: UNIT-VH-02] or [UNIT-VH-02]
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');

    return lines.map((line, lIdx) => {
      // Split by evidence tags e.g. [Evidence-REF: ...] or [UNIT-VH-...]
      const tokens = line.split(/(\[Evidence-REF:[^\]]+\]|\[UNIT-[^\]]+\])/g);

      const renderLineContent = () => (
        <>
          {tokens.map((token, tIdx) => {
            if (token.startsWith('[Evidence-REF:') || token.startsWith('[UNIT-')) {
              const cleanId = token.replace(/\[|\]/g, '');
              return (
                <button
                  key={tIdx}
                  type="button"
                  onClick={() => inspectEvidence(cleanId)}
                  className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-medium hover:bg-emerald-500/30 active:scale-95 transition-all shadow-sm"
                  title="Bấm để mở thanh tra bằng chứng gốc từ Mock Warehouse"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{cleanId}</span>
                </button>
              );
            }

            // Bold styling: **text**
            const boldParts = token.split(/(\*\*[^*]+\*\*)/g);
            return (
              <span key={tIdx}>
                {boldParts.map((bPart, bIdx) => {
                  if (bPart.startsWith('**') && bPart.endsWith('**')) {
                    return (
                      <strong key={bIdx} className="font-semibold text-slate-100">
                        {bPart.slice(2, -2)}
                      </strong>
                    );
                  }
                  return bPart;
                })}
              </span>
            );
          })}
        </>
      );

      // Section Headings
      if (line.startsWith('# ')) {
        return (
          <h2 key={lIdx} className="text-base font-bold text-slate-100 mt-3 mb-1.5 pb-1 border-b border-slate-700/60">
            {line.replace('# ', '')}
          </h2>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={lIdx} className="text-sm font-bold text-sky-400 mt-2.5 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            {line.replace('## ', '')}
          </h3>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h4 key={lIdx} className="text-xs font-semibold text-slate-200 mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={lIdx} className="text-xs text-slate-300 ml-4 mb-1 list-disc leading-relaxed">
            {renderLineContent()}
          </li>
        );
      }

      return (
        <p key={lIdx} className="text-xs text-slate-300 mb-1.5 leading-relaxed">
          {renderLineContent()}
        </p>
      );
    });
  };

  if (isUser) {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
          <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          <div className="text-[10px] text-sky-200/80 text-right mt-1 font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 flex flex-col items-start max-w-3xl">
      {/* Agent Identity Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border ${theme.bg} ${theme.text} ${theme.border}`}
        >
          {message.agent_id}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Message Bubble */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl rounded-tl-sm p-4 shadow-lg text-slate-200">
        {/* Collapsible Traces / Thought process grouped by agent */}
        {traces.length > 0 && (
          <div className="mb-3 border-b border-slate-800/80 pb-2">
            <button
              type="button"
              onClick={() => setShowTraces(!showTraces)}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors font-mono"
            >
              {showTraces ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span>💭 Quá trình suy luận Chain-of-Thought (CoT) &amp; Thực thi ({traces.length} bước)</span>
            </button>

            {showTraces && (
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                {(() => {
                  const grouped: Record<string, string[]> = {};
                  for (const trace of traces) {
                    let agentKey = 'orchestrator';
                    if (trace.toLowerCase().includes('data-agent') || trace.includes('[DataAgent]')) agentKey = 'data-agent';
                    else if (trace.toLowerCase().includes('compare-agent') || trace.includes('[CompareAgent]')) agentKey = 'compare-agent';
                    else if (trace.toLowerCase().includes('insight-agent') || trace.includes('[InsightAgent]')) agentKey = 'insight-agent';
                    else if (trace.toLowerCase().includes('chart-agent') || trace.includes('[ChartAgent]')) agentKey = 'chart-agent';
                    else if (trace.toLowerCase().includes('report-agent') || trace.includes('[ReportAgent]')) agentKey = 'report-agent';
                    else if (trace.toLowerCase().includes('finance') || trace.includes('Python')) agentKey = 'python-finance-agent';

                    if (!grouped[agentKey]) grouped[agentKey] = [];
                    grouped[agentKey].push(trace);
                  }

                  return Object.entries(grouped).map(([agentKey, logs]) => (
                    <div key={agentKey} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono">
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
                        <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          [{agentKey}]
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveAgent(agentKey)}
                          className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-0.5"
                        >
                          <span>Xem chatbox riêng</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <div className="space-y-1 text-slate-400">
                        {logs.map((log, lIdx) => {
                          const isCoT = log.includes('CoT') || log.includes('💭');
                          return (
                            <div
                              key={lIdx}
                              className={`leading-snug ${isCoT ? 'text-amber-200/90 bg-amber-500/5 p-1 rounded' : ''}`}
                            >
                              <span className="text-slate-600 mr-1">&gt;</span>
                              {log}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* Formatted Content */}
        <div className="space-y-0.5">{renderFormattedText(message.content)}</div>

        {/* Attached Artifact Quick Buttons */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2">
            {message.artifacts.map((art, idx) => {
              const type = art.artifact_type;
              if (type === 'chart_spec') {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openArtifact('chart')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mở Biểu Đồ Recharts</span>
                  </button>
                );
              }
              if (type === 'report') {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openArtifact('report')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    <span>Mở Báo Cáo 6 Phần</span>
                  </button>
                );
              }
              if (type === 'finance_plan') {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openArtifact('finance')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs transition-colors"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mở Phương Án Tài Chính</span>
                  </button>
                );
              }
              if (type === 'dataset') {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openArtifact('dataset')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs transition-colors"
                  >
                    <Database className="w-3.5 h-3.5 text-blue-400" />
                    <span>Mở Bảng Kho Dữ Liệu</span>
                  </button>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
