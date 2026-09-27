/**
 * apps/web/src/components/inspector/Inspector.tsx
 * Right column: Tabbed Inspector panel housing Artifacts Catalog, Evidence, Charts, Reports, Data Warehouse, and Finance views.
 * Responsive design: Slide-over drawer on mobile/tablet (<1280px) and persistent panel on desktop.
 */

import React from 'react';
import {
  ShieldCheck,
  BarChart3,
  FileText,
  Database,
  DollarSign,
  Layers,
  X,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { ArtifactsViewer } from './ArtifactsViewer';
import { EvidenceViewer } from './EvidenceViewer';
import { ChartViewer } from './ChartViewer';
import { ReportViewer } from './ReportViewer';
import { DatasetTable } from './DatasetTable';
import { FinanceViewer } from './FinanceViewer';
import type { InspectorTab } from '../../types';

export const Inspector: React.FC = () => {
  const {
    inspectorTab,
    setInspectorTab,
    inspectedUnitId,
    artifacts,
    isInspectorOpen,
    setIsInspectorOpen,
  } = useChat();

  const tabs: Array<{
    id: InspectorTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      id: 'artifacts',
      label: 'Artifacts',
      icon: <Layers className="w-3.5 h-3.5 text-amber-400" />,
      badge: Object.keys(artifacts).length > 0 ? String(Object.keys(artifacts).length) : undefined,
    },
    {
      id: 'evidence',
      label: 'Bằng Chứng',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
      badge: inspectedUnitId ? inspectedUnitId : undefined,
    },
    {
      id: 'report',
      label: 'Báo Cáo',
      icon: <FileText className="w-3.5 h-3.5 text-rose-400" />,
    },
    {
      id: 'chart',
      label: 'Biểu Đồ',
      icon: <BarChart3 className="w-3.5 h-3.5 text-sky-400" />,
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

  if (!isInspectorOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile/Tablet Backdrop Overlay (<1280px) */}
      <div
        onClick={() => setIsInspectorOpen(false)}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-30 xl:hidden"
        aria-hidden="true"
      />

      {/* Inspector Panel Shell */}
      <aside className="fixed xl:static top-0 right-0 z-40 w-full sm:w-[480px] xl:w-[500px] 2xl:w-[560px] bg-slate-900 border-l border-slate-800 flex flex-col h-screen select-none shadow-2xl xl:shadow-none transition-transform duration-200">
        {/* Inspector Tabs Header */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 custom-scrollbar flex-1">
            {tabs.map((t) => {
              const isActive = inspectorTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInspectorTab(t.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {t.badge && (
                    <span className="text-[10px] font-mono px-1 rounded bg-sky-500/20 text-sky-300 ml-0.5">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={() => setIsInspectorOpen(false)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors ml-1"
            title="Đóng thanh tra"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-hidden relative">
          {inspectorTab === 'artifacts' && <ArtifactsViewer />}
          {inspectorTab === 'evidence' && <EvidenceViewer />}
          {inspectorTab === 'chart' && <ChartViewer />}
          {inspectorTab === 'report' && <ReportViewer />}
          {inspectorTab === 'dataset' && <DatasetTable />}
          {inspectorTab === 'finance' && <FinanceViewer />}
        </div>
      </aside>
    </>
  );
};
