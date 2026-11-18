import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Expense } from '../types';
import { formatDate, formatDuration } from '../utils/time';
import { generateAndExportExcel } from '../services/excelExport';
import {
  FileDown,
  Calendar,
  Hourglass,
  Clock,
  Bus,
  IndianRupee,
  Play,
  Pause,
  Square,
  Receipt,
  Edit2,
  Trash2,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

export const HistoryAndExport: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    selectedDateSummary,
    selectedDateEvents,
    selectedDateExpenses,
    editExpense,
    removeExpense,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'timers' | 'expenses'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Edit Expense modal
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

  // Date selection helper: generate last 7 days chips
  const [dateChips, setDateChips] = useState<Array<{ label: string; day: number; month: string; dateStr: string }>>([]);

  useEffect(() => {
    const chips = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayNum = d.getDate();
      const monthStr = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      let label = `${dayNum} ${monthStr}`;
      if (i === 0) label = 'Today';
      else if (i === 1) label = "Y'day";
      else label = d.toLocaleString('en-US', { weekday: 'short' });

      chips.push({
        label,
        day: dayNum,
        month: monthStr,
        dateStr: formatDate(d),
      });
    }
    setDateChips(chips);
  }, []);

  const handleExport = async (singleDate: boolean = false) => {
    setIsExporting(true);
    setExportNotice(null);
    const result = await generateAndExportExcel(singleDate ? { dateStr: selectedDate } : undefined);
    setIsExporting(false);
    if (result.success) {
      setExportNotice(`Generated: ${result.filename}`);
      setTimeout(() => setExportNotice(null), 5000);
    }
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditReason(exp.reason);
  };

  const handleSaveEdit = async () => {
    if (editingExpense) {
      const parsedAmount = parseFloat(editAmount);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        await editExpense({
          ...editingExpense,
          amount: parsedAmount,
          reason: editReason.trim() || 'General Expense',
        });
        setEditingExpense(null);
      }
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Delete this expense transaction?')) {
      await removeExpense(id);
    }
  };

  // Combine timer events and expenses into a unified timeline
  interface TimelineItem {
    id: string;
    type: 'timer' | 'expense';
    timestampMs: number;
    timeStr: string;
    title: string;
    badge: string;
    subtitle: string;
    amount?: number;
    expenseObj?: Expense;
    icon: 'play' | 'pause' | 'stop' | 'receipt' | 'bus';
  }

  const timelineItems: TimelineItem[] = [];

  if (activeFilter === 'all' || activeFilter === 'timers') {
    selectedDateEvents.forEach((ev) => {
      let iconType: 'play' | 'pause' | 'stop' | 'bus' = 'play';
      if (ev.eventType === 'PAUSE') iconType = 'pause';
      else if (ev.eventType === 'STOP') iconType = 'stop';
      else if (ev.timerId === 'bus_travel') iconType = 'bus';

      timelineItems.push({
        id: ev.id,
        type: 'timer',
        timestampMs: ev.timestampMs,
        timeStr: ev.timeStr,
        title: ev.timerName,
        badge: ev.eventType,
        subtitle: ev.note || (ev.durationMs ? `Duration: ${formatDuration(ev.durationMs, true)}` : 'Event Logged'),
        icon: iconType,
      });
    });
  }

  if (activeFilter === 'all' || activeFilter === 'expenses') {
    selectedDateExpenses.forEach((exp) => {
      timelineItems.push({
        id: exp.id,
        type: 'expense',
        timestampMs: exp.timestampMs,
        timeStr: exp.timeStr,
        title: exp.reason,
        badge: exp.category || 'EXPENSE',
        subtitle: `${exp.category || 'Expense'} · ${exp.timeStr}`,
        amount: exp.amount,
        expenseObj: exp,
        icon: 'receipt',
      });
    });
  }

  // Sort descending or ascending by time
  timelineItems.sort((a, b) => a.timestampMs - b.timestampMs);

  return (
    <div className="flex flex-col flex-1 w-full bg-black text-white px-4 pt-2 pb-24 overflow-y-auto no-scrollbar">
      {/* SECTION 1: HEADER & LUXURY CALENDAR VAULT */}
      <div className="flex flex-col gap-2 pt-1 pb-2 border-b border-[#2A2A2A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#D4AF37] text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
              history_toggle_off
            </span>
            <span className="font-mono text-xs tracking-widest text-[#D4AF37] uppercase font-bold">
              DAILY HISTORY &amp; VAULT
            </span>
          </div>
          {/* Custom Date Picker */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1A1A1A] border border-[#333]">
            <Calendar size={12} className="text-[#D4AF37]" />
            <input
              type="date"
              value={(() => {
                const parts = selectedDate.split('-');
                if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
                return '';
              })()}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split('-');
                  setSelectedDate(`${d}-${m}-${y}`);
                }
              }}
              className="bg-transparent text-[11px] font-mono text-gray-300 outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Horizontal Chrono Date Dial Strip */}
        <div className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar">
          {dateChips.map((chip) => {
            const isSelected = chip.dateStr === selectedDate;
            return (
              <button
                key={chip.dateStr}
                onClick={() => setSelectedDate(chip.dateStr)}
                type="button"
                className={`flex flex-col items-center justify-center min-w-[70px] py-2 px-1 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-[#181818] text-[#D4AF37] border border-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.25)]'
                    : 'bg-[#111111] text-gray-400 border border-[#222] hover:text-white'
                }`}
              >
                <span className={`font-mono text-[10px] uppercase font-bold tracking-wider ${isSelected ? 'text-[#D4AF37]' : 'text-gray-400'}`}>
                  {chip.label}
                </span>
                <span className={`font-display text-lg leading-tight font-bold ${isSelected ? 'text-[#D4AF37]' : 'text-gray-200'}`}>
                  {chip.day}
                </span>
                <span className="font-mono text-[9px] text-gray-500 uppercase">{chip.month}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Luxury Circular Mini-Metric Telemetry Rings */}
      <div className="my-3">
        <div className="bg-[#121212] rounded-2xl p-4 border border-[#262626] shadow-[0_4px_24px_rgba(0,0,0,0.8)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#D4AF37]" />
              <span className="font-mono text-[11px] tracking-wider uppercase text-gray-400 font-semibold">
                Calibrated Daily Totals ({selectedDate})
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest uppercase">
              Verified Vault
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Metric 1: Day Analysis */}
            <div className="bg-[#0a0a0a] rounded-xl p-2.5 flex items-center gap-2.5 border border-[#1e1e1e]">
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <Hourglass size={18} className="text-[#D4AF37]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] text-gray-400 truncate uppercase">Day Analysis</span>
                <span className="font-mono text-base text-white font-bold tracking-tight">
                  {formatDuration(selectedDateSummary?.dayAnalysisMs || 0, true)}
                </span>
              </div>
            </div>

            {/* Metric 2: Bus Waiting */}
            <div className="bg-[#0a0a0a] rounded-xl p-2.5 flex items-center gap-2.5 border border-[#1e1e1e]">
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <Clock size={18} className="text-[#A78BFA]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] text-gray-400 truncate uppercase">Bus Waiting</span>
                <span className="font-mono text-base text-[#A78BFA] font-bold tracking-tight">
                  {formatDuration(selectedDateSummary?.busWaitingMs || 0, true)}
                </span>
              </div>
            </div>

            {/* Metric 3: Bus Travel */}
            <div className="bg-[#0a0a0a] rounded-xl p-2.5 flex items-center gap-2.5 border border-[#1e1e1e]">
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <Bus size={18} className="text-[#A78BFA]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] text-gray-400 truncate uppercase">Bus Travel</span>
                <span className="font-mono text-base text-[#A78BFA] font-bold tracking-tight">
                  {formatDuration(selectedDateSummary?.busTravelMs || 0, true)}
                </span>
              </div>
            </div>

            {/* Metric 4: Daily Expenditure */}
            <div className="bg-[#0a0a0a] rounded-xl p-2.5 flex items-center gap-2.5 border border-[#1e1e1e]">
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <IndianRupee size={18} className="text-[#D4AF37]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] text-gray-400 truncate uppercase">Expenditure</span>
                <span className="font-mono text-base text-[#D4AF37] font-bold tracking-tight">
                  ₹{(selectedDateSummary?.totalExpense || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: THREE-WORKSHEET EXCEL EXPORT SECTION */}
      <div className="my-2">
        <div className="bg-[#121212] rounded-2xl p-4 border border-[#D4AF37]/40 shadow-[0_8px_32px_rgba(212,175,55,0.12)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#1e1e1e] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                <FileDown size={16} />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs text-white tracking-wider font-bold">
                  EXPORT TO EXCEL (.XLSX)
                </span>
                <span className="font-mono text-[10px] text-gray-400">
                  Three-tier relational ledger dataset
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#D4AF37] font-mono text-[10px] font-semibold">
              v3.4 PRO
            </span>
          </div>

          {/* 3 Distinct Sheet Badges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 bg-[#0a0a0a] p-2 rounded-xl border border-[#202020]">
              <span className="px-2 py-0.5 rounded bg-[#1c1c1c] text-[#D4AF37] font-mono text-[10px] font-bold border border-[#D4AF37]/30">
                SHEET 1
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-gray-200 font-semibold truncate">Daily Summary Table</span>
                <span className="font-mono text-[9px] text-gray-400 truncate">
                  Date · Day Analysis · Bus Travel · Waiting · Expense
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-[#0a0a0a] p-2 rounded-xl border border-[#202020]">
              <span className="px-2 py-0.5 rounded bg-[#1c1c1c] text-[#A78BFA] font-mono text-[10px] font-bold border border-[#8B5CF6]/30">
                SHEET 2
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-gray-200 font-semibold truncate">Timer Activity Chrono-Log</span>
                <span className="font-mono text-[9px] text-gray-400 truncate">
                  Date · Time · Timer Name · Event (START/PAUSE/RESUME/STOP)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-[#0a0a0a] p-2 rounded-xl border border-[#202020]">
              <span className="px-2 py-0.5 rounded bg-[#1c1c1c] text-[#D4AF37] font-mono text-[10px] font-bold border border-[#D4AF37]/30">
                SHEET 3
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-gray-200 font-semibold truncate">Financial Expense Ledger</span>
                <span className="font-mono text-[9px] text-gray-400 truncate">
                  Date · Time · Amount (INR) · Detailed Reason
                </span>
              </div>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleExport(false)}
              disabled={isExporting}
              className="flex-1 py-3 px-3 rounded-xl bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] transition-all flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(212,175,55,0.25)] active:scale-[0.98]"
            >
              <FileDown size={16} />
              <span>EXPORT ALL HISTORY (.XLSX)</span>
            </button>
            <button
              onClick={() => handleExport(true)}
              disabled={isExporting}
              className="py-3 px-3 rounded-xl bg-[#202020] text-gray-200 border border-[#333] font-mono text-xs font-semibold hover:bg-[#282828] active:scale-[0.98] transition-all"
            >
              <span>DAY ONLY</span>
            </button>
          </div>

          {/* Toast / Notice */}
          {exportNotice && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-center font-mono text-xs text-[#D4AF37] animate-pulse">
              <CheckCircle2 size={14} />
              <span>{exportNotice}</span>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: DETAILED CHRONOLOGICAL EVENT LOGS */}
      <div className="my-2 flex flex-col gap-2.5">
        {/* Filter Tabs */}
        <div className="flex items-center justify-between p-1 bg-[#121212] border border-[#222] rounded-xl">
          <button
            onClick={() => setActiveFilter('all')}
            className={`flex-1 py-1.5 rounded-lg font-mono text-xs uppercase transition-colors ${
              activeFilter === 'all'
                ? 'bg-[#222] text-[#D4AF37] font-bold shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                : 'text-gray-400 font-medium hover:text-white'
            }`}
          >
            All ({selectedDateEvents.length + selectedDateExpenses.length})
          </button>
          <button
            onClick={() => setActiveFilter('timers')}
            className={`flex-1 py-1.5 rounded-lg font-mono text-xs uppercase transition-colors ${
              activeFilter === 'timers'
                ? 'bg-[#222] text-[#D4AF37] font-bold shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                : 'text-gray-400 font-medium hover:text-white'
            }`}
          >
            Timers ({selectedDateEvents.length})
          </button>
          <button
            onClick={() => setActiveFilter('expenses')}
            className={`flex-1 py-1.5 rounded-lg font-mono text-xs uppercase transition-colors ${
              activeFilter === 'expenses'
                ? 'bg-[#222] text-[#D4AF37] font-bold shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                : 'text-gray-400 font-medium hover:text-white'
            }`}
          >
            Ledger ({selectedDateExpenses.length})
          </button>
        </div>

        {/* Master Timeline List */}
        <div className="flex flex-col gap-2">
          {timelineItems.length === 0 ? (
            <div className="py-8 text-center text-gray-500 font-mono text-xs">
              No activity recorded for {selectedDate}.
            </div>
          ) : (
            timelineItems.map((item) => (
              <div
                key={item.id}
                className="bg-[#121212] border border-[#222] rounded-xl p-3 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      item.type === 'expense'
                        ? 'bg-[#1a1528] text-[#A78BFA] border border-[#8B5CF6]/30'
                        : item.badge === 'START' || item.badge === 'RESUME'
                        ? 'bg-[#1e1c12] text-[#D4AF37] border border-[#D4AF37]/30'
                        : item.badge === 'STOP'
                        ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                        : 'bg-[#181818] text-gray-400'
                    }`}
                  >
                    {item.type === 'expense' ? (
                      <Receipt size={16} />
                    ) : item.badge === 'START' || item.badge === 'RESUME' ? (
                      <Play size={15} className="fill-current" />
                    ) : item.badge === 'PAUSE' ? (
                      <Pause size={15} className="fill-current" />
                    ) : (
                      <Square size={15} className="fill-current" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-sans font-bold text-sm text-gray-100 truncate">
                        {item.title}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                          item.badge === 'START' || item.badge === 'RESUME'
                            ? 'bg-[#D4AF37]/20 text-[#D4AF37]'
                            : item.badge === 'STOP'
                            ? 'bg-red-950 text-red-400'
                            : item.badge === 'PAUSE'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-[#8B5CF6]/20 text-[#A78BFA]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-gray-400 truncate">
                      {item.subtitle}
                    </span>
                  </div>
                </div>

                {/* Right Column: Time or Expense Amount + Edit/Delete */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.type === 'expense' && item.amount !== undefined ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#A78BFA]">
                        ₹{item.amount.toLocaleString('en-IN')}
                      </span>
                      {item.expenseObj && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleOpenEdit(item.expenseObj!)}
                            className="p-1 text-gray-400 hover:text-white transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(item.expenseObj!.id)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="font-mono text-xs font-bold text-[#D4AF37]">
                      {item.timeStr}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-[#8B5CF6]/50 p-5 shadow-[0_0_35px_rgba(139,92,246,0.25)] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <span className="font-mono text-xs uppercase tracking-widest text-[#A78BFA] font-bold">
              EDIT EXPENSE TRANSACTION
            </span>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">Amount (INR)</label>
              <input
                type="number"
                step="any"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#8B5CF6] text-white px-3 py-2 rounded-xl text-sm outline-none font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">Reason / Description</label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#8B5CF6] text-white px-3 py-2 rounded-xl text-sm outline-none"
              />
            </div>
            <div className="flex gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-300 font-mono text-xs font-semibold hover:bg-[#2a2a2a]"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#8B5CF6] text-white font-mono text-xs font-bold hover:bg-[#A78BFA] shadow-[0_0_15px_rgba(139,92,246,0.3)]"
              >
                UPDATE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
