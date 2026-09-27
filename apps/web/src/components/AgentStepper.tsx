import React from 'react';
import { Database, GitCompare, Lightbulb, BarChart3, FileText, CheckCircle2, Loader2, DollarSign } from 'lucide-react';
import type { StepState, PipelineStage } from '../hooks/useAgentSSE';

interface AgentStepperProps {
  stages: Record<PipelineStage, StepState>;
  isFinanceFlow?: boolean;
}

export const AgentStepper: React.FC<AgentStepperProps> = ({ stages, isFinanceFlow }) => {
  if (isFinanceFlow) {
    const fin = stages.finance;
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span>⚡ Luồng thực thi: Agent Tài chính cắm nóng (Python gRPC :50056)</span>
        </h3>
        <div className="flex items-center gap-4 bg-slate-900/60 p-4 rounded-lg border border-slate-700">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {fin.status === 'running' ? (
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            ) : fin.status === 'completed' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : (
              <DollarSign className="w-6 h-6" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-200">Python Finance Agent</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  fin.status === 'running'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    : fin.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {fin.status === 'running' ? 'Đang tính toán' : fin.status === 'completed' ? 'Hoàn tất' : 'Chờ lệnh'}
              </span>
            </div>
            <p className="text-xs text-slate-400">gRPC Port 50056 • Pydantic Mortgage Engine</p>
            {fin.traceLogs.length > 0 && (
              <div className="mt-2 text-xs text-emerald-300/90 font-mono bg-slate-950/60 p-2 rounded border border-slate-800">
                {fin.traceLogs[fin.traceLogs.length - 1]}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    {
      id: 'data' as PipelineStage,
      title: 'Data Agent',
      port: ':50051',
      desc: 'Mock Warehouse & Snapshot',
      icon: Database,
      state: stages.data,
    },
    {
      id: 'compare_insight' as PipelineStage,
      title: 'Compare & Insight (Song song)',
      port: ':50052 & :50053',
      desc: 'Peer Benchmark & Root Cause',
      icon: GitCompare,
      secondIcon: Lightbulb,
      state: stages.compare_insight,
      isParallel: true,
    },
    {
      id: 'chart' as PipelineStage,
      title: 'Chart Agent',
      port: ':50054',
      desc: 'Recharts Spec Builder',
      icon: BarChart3,
      state: stages.chart,
    },
    {
      id: 'report' as PipelineStage,
      title: 'Report Agent',
      port: ':50055',
      desc: '6-Section Evidence Report',
      icon: FileText,
      state: stages.report,
    },
  ];

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Tiến trình Pipeline 6 LLM Agents (gRPC Backbone)
        </h3>
        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
          Evidence-Backed DAG
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const status = step.state.status;
          const isRunning = status === 'running';
          const isDone = status === 'completed';

          return (
            <div
              key={step.id}
              className={`relative rounded-xl p-3.5 border transition-all duration-300 ${
                isRunning
                  ? 'bg-amber-500/10 border-amber-500/40 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30'
                  : isDone
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-900/50 border-slate-700/50 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isRunning
                        ? 'bg-amber-500/20 text-amber-400'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  {step.isParallel && (
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isRunning
                          ? 'bg-amber-500/20 text-amber-400'
                          : isDone
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Lightbulb className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    {step.port}
                  </span>
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  ) : isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  )}
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-200 mb-0.5 flex items-center gap-1">
                <span>{idx + 1}.</span> {step.title}
              </div>
              <div className="text-[11px] text-slate-400 mb-2">{step.desc}</div>

              {/* Latest trace log preview */}
              {step.state.traceLogs.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-300 font-mono bg-slate-950/70 p-1.5 rounded border border-slate-800 line-clamp-2 leading-relaxed">
                  {step.state.traceLogs[step.state.traceLogs.length - 1]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
