import React, { useState } from 'react';
import { ChronoDashboard } from './components/ChronoDashboard';
import { HistoryAndExport } from './components/HistoryAndExport';
import { DataAndSettings } from './components/DataAndSettings';
import { useApp } from './context/AppContext';
import { Timer, ReceiptText, ShieldAlert, User } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chrono' | 'ledger' | 'vault'>('chrono');
  const { initialized } = useApp();

  if (!initialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono gap-3">
        <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
        <span className="text-xs uppercase tracking-widest text-[#D4AF37]">
          INITIALIZING AURA VAULT...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white overflow-hidden select-none">
      {/* FIXED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-md border-b border-[#222] safe-top">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-black border border-[#D4AF37]/60 flex items-center justify-center shadow-[0_0_12px_rgba(212,175,55,0.3)] overflow-hidden">
              <img src="/app-icon.png" alt="NR Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#D4AF37]">
                  AURA PRECISION
                </span>
              </div>
              <h1 className="font-display text-base font-bold text-white tracking-tight leading-none">
                Aura Daily Tracker
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#D4AF37] flex items-center justify-center shadow-[0_0_10px_rgba(212,175,55,0.3)]">
              <User size={15} className="text-black stroke-[2.5]" />
            </div>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex flex-col flex-1 w-full pt-14 overflow-hidden relative">
        {activeTab === 'chrono' && <ChronoDashboard />}
        {activeTab === 'ledger' && <HistoryAndExport />}
        {activeTab === 'vault' && <DataAndSettings />}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-t border-[#222] safe-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.8)]">
        <div className="flex justify-around items-center h-16 px-4">
          {/* Tab 1: Chrono */}
          <button
            onClick={() => setActiveTab('chrono')}
            className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1 transition-colors ${
              activeTab === 'chrono' ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Timer size={20} className={activeTab === 'chrono' ? 'stroke-[2.5]' : 'stroke-2'} />
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider">Chrono</span>
          </button>

          {/* Tab 2: Ledger */}
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1 transition-colors ${
              activeTab === 'ledger' ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ReceiptText size={20} className={activeTab === 'ledger' ? 'stroke-[2.5]' : 'stroke-2'} />
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider">Ledger</span>
          </button>

          {/* Tab 3: Vault / Settings */}
          <button
            onClick={() => setActiveTab('vault')}
            className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1 transition-colors ${
              activeTab === 'vault' ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldAlert size={20} className={activeTab === 'vault' ? 'stroke-[2.5]' : 'stroke-2'} />
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider">Vault</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
