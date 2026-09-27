/**
 * apps/web/src/App.tsx
 * Top-level application shell wiring 3-column layout:
 * [Sidebar] -> [ChatPane per Agent] -> [Inspector for Evidence / Charts / Reports]
 */

import React from 'react';
import { ChatProvider } from './context/ChatContext';
import { Sidebar } from './components/Sidebar';
import { ChatPane } from './components/chat/ChatPane';
import { Inspector } from './components/inspector/Inspector';

export function App() {
  return (
    <ChatProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
        {/* Column 1: Sidebar (Agents & Sessions) */}
        <Sidebar />

        {/* Column 2: Center ChatPane for the active agent */}
        <ChatPane />

        {/* Column 3: Right Inspector (Evidence, Charts, Reports, Warehouse, Finance) */}
        <Inspector />
      </div>
    </ChatProvider>
  );
}

export default App;
