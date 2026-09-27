/**
 * apps/web/src/components/inspector/Inspector.tsx
 * Right column: Tabbed Inspector panel housing Evidence, Charts, Reports, Data Warehouse, and Finance views.
 */

import React from 'react';
import {
  ShieldCheck,
  BarChart3,
  FileText,
  Database,
  DollarSign,
  Layers,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { EvidenceViewer } from './EvidenceViewer';
import { ChartViewer } from './ChartViewer';
import { ReportViewer } from './ReportViewer';
import { DatasetTable } from './DatasetTable';
import { FinanceViewer } from './FinanceViewer';

export const Inspector: React.FC = () => {
  const { inspectorTab, setInspectorTab, inspectedUnitId } = useChat();

  const tabs: Array<{
    id: 'evidence' | 'chart' | 'report' | 'dataset' | 'finance';
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      id: 'evidence',
      label: 'Bằng Chứng',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
      badge: inspectedUnitId ? inspectedUnitId : undefined,
    },
    {
      id: 'chart',
      label: 'Biểu Đồ',
      icon: <BarChart3 className="w-3.5 h-3.5 text-sky-400" />,
    },
    {
      id: 'report',
      label: 'Báo Cáo',
      icon: <FileText className="w-3.5 h-3.5 text-rose-400" />,
    },
    {
      id: 'dataset',
      label: 'Kho Dữ Liệu',
      icon: <Database className="w-3.5 h-3.5 text-blue-400" />,
    },
    {
      id: 'finance',
      label: 'Tài Chính',
      icon: <DollarSign className="w-3.5 h-3.5 text-emerald-300" />,
    },
  ];

  return (
    <aside className="w-full lg:w-[480px] xl:w-[560px] bg-slate-900 border-l border-slate-800 flex flex-col h-screen select-none">
      {/* Inspector Tabs Header */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {tabs.map((t) => {
            const isActive = inspectorTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setInspectorTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.badge && (
                  <span className="text-[10px] font-mono px-1 rounded bg-emerald-500/20 text-emerald-300 ml-0.5">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Panel */}
      <div className="flex-1 overflow-hidden relative">
        {inspectorTab === 'evidence' && <EvidenceViewer />}
        {inspectorTab === 'chart' && <ChartViewer />}
        {inspectorTab === 'report' && <ReportViewer />}
        {inspectorTab === 'dataset' && <DatasetTable />}
        {inspectorTab === 'finance' && <FinanceViewer />}
      </div>
    </aside>
  );
};
