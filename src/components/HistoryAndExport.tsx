import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Expense, TimerId, PaymentMethod } from '../types';
import { formatDate, formatTime, formatDuration, parseDateStr } from '../utils/time';
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
  Sparkles,
  RotateCcw,
  History,
  X,
  Smartphone,
  Wallet,
  Plus,
} from 'lucide-react';

export const HistoryAndExport: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    selectedDateSummary,
    selectedDateEvents,
    selectedDateExpenses,
    selectedDateBalanceTransactions,
    allRegularizations,
    accountBalances,
    editExpense,
    removeExpense,
    regularizeSession,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'timers' | 'expenses'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Predefined expense reasons (Requirement 1 & 4)
  const PREDEFINED_REASONS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
  type PredefinedReason = (typeof PREDEFINED_REASONS)[number];

  // Edit Expense modal
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editSelectedReason, setEditSelectedReason] = useState<PredefinedReason | 'Custom' | null>(null);
  const [editCustomReason, setEditCustomReason] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('UPI');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Regularize modal state
  const [isRegularizeModalOpen, setIsRegularizeModalOpen] = useState(false);
  const [regularizeTimerId, setRegularizeTimerId] = useState<TimerId>('day_analysis');
  const [regularizeDate, setRegularizeDate] = useState<string>(selectedDate);
  const [regularizeStartTime, setRegularizeStartTime] = useState<string>('09:00');
  const [regularizeEndTime, setRegularizeEndTime] = useState<string>('17:00');
  const [regularizeReason, setRegularizeReason] = useState<string>('');
  const [regularizeError, setRegularizeError] = useState<string | null>(null);
  const [isSubmittingRegularize, setIsSubmittingRegularize] = useState(false);

  // Audit Trail modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

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
    if (['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(exp.reason)) {
      setEditSelectedReason(exp.reason as PredefinedReason);
      setEditCustomReason('');
    } else {
      setEditSelectedReason('Custom');
      setEditCustomReason(exp.reason);
    }
    setEditPaymentMethod(exp.paymentMethod || 'UPI');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingExpense || isSavingEdit) return;
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError('Please enter a valid amount.');
      return;
    }

    let finalReason = '';
    if (editSelectedReason === 'Custom') {
      if (!editCustomReason.trim()) {
        setEditError('Please enter a custom reason.');
        return;
      }
      finalReason = editCustomReason.trim();
    } else if (editSelectedReason) {
      finalReason = editCustomReason.trim() ? editCustomReason.trim() : editSelectedReason;
    } else if (editCustomReason.trim()) {
      finalReason = editCustomReason.trim();
    } else {
      setEditError('Please select Breakfast, Lunch, Dinner, Snack or enter a Custom Reason.');
      return;
    }

    // Validate balance
    const oldMethod = editingExpense.paymentMethod || 'UPI';
    const newMethod = editPaymentMethod;
    if (oldMethod === newMethod) {
      const net = parsedAmount - editingExpense.amount;
      const avail = newMethod === 'UPI' ? accountBalances.upi : accountBalances.wallet;
      if (net > avail) {
        setEditError(`Insufficient ${newMethod} balance. (Short by ₹${(net - avail).toLocaleString('en-IN')})`);
        return;
      }
    } else {
      const avail = newMethod === 'UPI' ? accountBalances.upi : accountBalances.wallet;
      if (parsedAmount > avail) {
        setEditError(`Insufficient ${newMethod} balance. (Available: ₹${avail.toLocaleString('en-IN')})`);
        return;
      }
    }

    setIsSavingEdit(true);
    setEditError(null);

    const res = await editExpense({
      ...editingExpense,
      amount: parsedAmount,
      reason: finalReason,
      category: editSelectedReason || 'Expense',
      paymentMethod: editPaymentMethod,
    });
    setIsSavingEdit(false);

    if (res.success) {
      setEditingExpense(null);
    } else {
      setEditError(res.error || 'Failed to update expense');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Delete this expense transaction? The amount will be refunded to your balance.')) {
      const res = await removeExpense(id);
      if (!res.success) {
        alert(res.error || 'Failed to delete expense');
      }
    }
  };

  const handleOpenRegularize = () => {
    setRegularizeDate(selectedDate);
    setRegularizeTimerId('day_analysis');
    setRegularizeStartTime('09:00');
    setRegularizeEndTime('17:00');
    setRegularizeReason('');
    setRegularizeError(null);
    setIsRegularizeModalOpen(true);
  };

  const handleSaveRegularize = async () => {
    if (isSubmittingRegularize) return;
    if (!regularizeReason.trim()) {
      setRegularizeError('Reason for regularization is mandatory.');
      return;
    }

    // Convert regularizeDate + times to ms
    const [startH, startM] = regularizeStartTime.split(':').map(Number);
    const [endH, endM] = regularizeEndTime.split(':').map(Number);

    const dateObj = parseDateStr(regularizeDate);
    const startObj = new Date(dateObj);
    startObj.setHours(startH, startM, 0, 0);

    const endObj = new Date(dateObj);
    endObj.setHours(endH, endM, 0, 0);

    const startMs = startObj.getTime();
    let endMs = endObj.getTime();

    if (endMs <= startMs) {
      setRegularizeError('End time must be strictly after start time.');
      return;
    }

    setIsSubmittingRegularize(true);
    setRegularizeError(null);

    const timerName =
      regularizeTimerId === 'day_analysis'
        ? 'Day Analysis'
        : regularizeTimerId === 'bus_waiting'
        ? 'Bus Waiting'
        : 'Bus Travel';

    const res = await regularizeSession({
      timerId: regularizeTimerId,
      timerName,
      regularizedDateStr: regularizeDate,
      regularizedStartMs: startMs,
      regularizedEndMs: endMs,
      reason: regularizeReason.trim(),
    });

    setIsSubmittingRegularize(false);

    if (res.success) {
      setIsRegularizeModalOpen(false);
      setExportNotice('Timer record regularized successfully.');
      setTimeout(() => setExportNotice(null), 4000);
    } else {
      setRegularizeError(res.error || 'Failed to regularize timer record.');
    }
  };

  // Helper to compute duration for regularize modal
  const computePreviewDuration = () => {
    const [sH, sM] = regularizeStartTime.split(':').map(Number);
    const [eH, eM] = regularizeEndTime.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return '00:00:00';
    const totalStartM = sH * 60 + sM;
    const totalEndM = eH * 60 + eM;
    if (totalEndM <= totalStartM) return 'Invalid (End <= Start)';
    const diffMs = (totalEndM - totalStartM) * 60 * 1000;
    return formatDuration(diffMs);
  };

  // Combine timer events, expenses, and balance transactions into a unified reverse chronological timeline
  interface TimelineItem {
    id: string;
    type: 'timer' | 'expense' | 'balance';
    timestampMs: number;
    timeStr: string;
    title: string;
    badge: string;
    subtitle: string;
    amount?: number;
    paymentMethod?: PaymentMethod;
    expenseObj?: Expense;
    isRegularized?: boolean;
    regularizationReason?: string;
    icon: 'play' | 'pause' | 'stop' | 'receipt' | 'bus' | 'regularize' | 'smartphone' | 'wallet' | 'plus';
  }

  const timelineItems: TimelineItem[] = [];

  if (activeFilter === 'all' || activeFilter === 'timers') {
    selectedDateEvents.forEach((ev) => {
      let iconType: 'play' | 'pause' | 'stop' | 'bus' | 'regularize' = 'play';
      if (ev.eventType === 'PAUSE') iconType = 'pause';
      else if (ev.eventType === 'STOP') iconType = 'stop';
      else if (ev.eventType === 'REGULARIZE') iconType = 'regularize';
      else if (ev.timerId === 'bus_travel') iconType = 'bus';

      const isReg = ev.eventType === 'REGULARIZE';

      timelineItems.push({
        id: ev.id,
        type: 'timer',
        timestampMs: ev.timestampMs,
        timeStr: ev.timeStr,
        title: ev.timerName,
        badge: ev.eventType,
        subtitle: ev.note || (ev.durationMs ? `Duration: ${formatDuration(ev.durationMs, true)}` : 'Event Logged'),
        isRegularized: isReg,
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
        subtitle: `${exp.category || 'Expense'} · ${exp.timeStr} via ${exp.paymentMethod || 'UPI'}`,
        amount: exp.amount,
        paymentMethod: exp.paymentMethod || 'UPI',
        expenseObj: exp,
        icon: 'receipt',
      });
    });

    if (selectedDateBalanceTransactions) {
      selectedDateBalanceTransactions.forEach((tx) => {
        if (tx.transactionType === 'CREDIT') {
          timelineItems.push({
            id: tx.id,
            type: 'balance',
            timestampMs: tx.timestampMs,
            timeStr: tx.timeStr,
            title: `${tx.accountType === 'UPI' ? 'UPI' : 'Wallet'} Balance Added`,
            badge: '+ BALANCE',
            subtitle: `${tx.note ? tx.note + ' · ' : ''}${tx.accountType} · ${tx.timeStr}`,
            amount: tx.amount,
            icon: tx.accountType === 'UPI' ? 'smartphone' : 'wallet',
          });
        } else if (tx.transactionType === 'REVERSAL') {
          timelineItems.push({
            id: tx.id,
            type: 'balance',
            timestampMs: tx.timestampMs,
            timeStr: tx.timeStr,
            title: 'Expense Refunded',
            badge: 'REFUND',
            subtitle: `${tx.note ? tx.note + ' · ' : ''}${tx.accountType} · ${tx.timeStr}`,
            amount: tx.amount,
            icon: 'plus',
          });
        }
      });
    }
  }

  // Sort reverse chronological: NEWEST activity first
  // Secondary: deterministic unique ID tiebreaker
  timelineItems.sort((a, b) => {
    if (b.timestampMs !== a.timestampMs) {
      return b.timestampMs - a.timestampMs;
    }
    return b.id.localeCompare(a.id);
  });

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

          <div className="flex items-center gap-1.5">
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

      {/* Action Bar: REGULARIZE & AUDIT TRAIL (Requirement 1) */}
      <div className="flex items-center gap-2 my-2.5">
        <button
          onClick={handleOpenRegularize}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-[#1c1a10] to-[#252010] border border-[#D4AF37]/60 text-[#D4AF37] font-mono text-xs font-bold hover:bg-[#2e2715] active:scale-95 transition-all shadow-[0_0_12px_rgba(212,175,55,0.15)]"
        >
          <RotateCcw size={13} className="text-[#D4AF37]" />
          <span>REGULARIZE TIMER</span>
        </button>

        <button
          onClick={() => setIsAuditModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#141414] border border-[#333] text-gray-300 font-mono text-xs font-semibold hover:border-gray-500 active:scale-95 transition-all"
        >
          <History size={13} className="text-[#A78BFA]" />
          <span>AUDIT ({allRegularizations.length})</span>
        </button>
      </div>

      {/* Luxury Circular Mini-Metric Telemetry Rings */}
      <div className="my-1.5">
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

      {/* SECTION 2: EXCEL EXPORT SECTION */}
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
                  Relational dataset with payment methods &amp; balances
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#D4AF37] font-mono text-[10px] font-semibold">
              XLSX
            </span>
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
        {(() => {
          const balanceTxCount = selectedDateBalanceTransactions
            ? selectedDateBalanceTransactions.filter((tx) => tx.transactionType !== 'DEBIT').length
            : 0;
          const ledgerCount = selectedDateExpenses.length + balanceTxCount;
          const totalCount = selectedDateEvents.length + ledgerCount;

          return (
            <div className="flex items-center justify-between p-1 bg-[#121212] border border-[#222] rounded-xl">
              <button
                onClick={() => setActiveFilter('all')}
                className={`flex-1 py-1.5 rounded-lg font-mono text-xs uppercase transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-[#222] text-[#D4AF37] font-bold shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                    : 'text-gray-400 font-medium hover:text-white'
                }`}
              >
                All ({totalCount})
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
                Ledger ({ledgerCount})
              </button>
            </div>
          );
        })()}

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
                      item.type === 'balance'
                        ? 'bg-[#13281a] text-emerald-400 border border-emerald-500/30'
                        : item.type === 'expense'
                        ? 'bg-[#1a1528] text-[#A78BFA] border border-[#8B5CF6]/30'
                        : item.badge === 'REGULARIZE'
                        ? 'bg-[#2c1d38] text-[#D4AF37] border border-[#D4AF37]/50'
                        : item.badge === 'START' || item.badge === 'RESUME'
                        ? 'bg-[#1e1c12] text-[#D4AF37] border border-[#D4AF37]/30'
                        : item.badge === 'STOP'
                        ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                        : 'bg-[#181818] text-gray-400'
                    }`}
                  >
                    {item.icon === 'smartphone' ? (
                      <Smartphone size={15} className="text-emerald-400" />
                    ) : item.icon === 'wallet' ? (
                      <Wallet size={15} className="text-emerald-400" />
                    ) : item.icon === 'plus' ? (
                      <Plus size={15} className="text-emerald-400" />
                    ) : item.type === 'expense' ? (
                      <Receipt size={16} />
                    ) : item.badge === 'REGULARIZE' ? (
                      <RotateCcw size={15} className="text-[#D4AF37]" />
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
                          item.type === 'balance'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                            : item.badge === 'REGULARIZE'
                            ? 'bg-gradient-to-r from-[#D4AF37]/30 to-[#8B5CF6]/30 text-[#D4AF37] border border-[#D4AF37]/40'
                            : item.badge === 'START' || item.badge === 'RESUME'
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

                {/* Right Column: Time or Expense/Balance Amount + Edit/Delete */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.type === 'balance' && item.amount !== undefined ? (
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm font-bold text-emerald-400">
                        +₹{item.amount.toLocaleString('en-IN')}
                      </span>
                      <span className="font-mono text-[9px] text-[#D4AF37]">
                        {item.timeStr}
                      </span>
                    </div>
                  ) : item.type === 'expense' && item.amount !== undefined ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-sm font-bold text-[#A78BFA]">
                          ₹{item.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="font-mono text-[9px] text-[#D4AF37]">
                          {item.paymentMethod || 'UPI'}
                        </span>
                      </div>
                      {item.expenseObj && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleOpenEdit(item.expenseObj!)}
                            className="p-1 text-gray-400 hover:text-white transition-colors"
                            aria-label="Edit Expense"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(item.expenseObj!.id)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                            aria-label="Delete Expense"
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

      {/* Regularize Timer Modal (Requirement 1) */}
      {isRegularizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-[#D4AF37]/60 p-5 shadow-[0_0_35px_rgba(212,175,55,0.25)] flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-1.5">
                <RotateCcw size={16} className="text-[#D4AF37]" />
                <span className="font-mono text-xs uppercase tracking-widest text-[#D4AF37] font-bold">
                  REGULARIZE TIMER RECORD
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRegularizeModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {regularizeError && (
              <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs font-mono">
                {regularizeError}
              </div>
            )}

            {/* Timer Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-gray-400 uppercase">Select Stopwatch</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'day_analysis', name: 'Day Analysis' },
                  { id: 'bus_waiting', name: 'Bus Waiting' },
                  { id: 'bus_travel', name: 'Bus Travel' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRegularizeTimerId(t.id as TimerId)}
                    className={`py-1.5 px-1 rounded-xl text-xs font-mono transition-all text-center ${
                      regularizeTimerId === t.id
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'bg-[#1c1c1c] text-gray-300 border border-[#2a2a2a]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Input */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-gray-400 uppercase">Date (DD-MM-YYYY)</label>
              <input
                type="text"
                value={regularizeDate}
                onChange={(e) => setRegularizeDate(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white px-3 py-1.5 rounded-xl text-xs outline-none font-mono"
              />
            </div>

            {/* Start & End Times */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-gray-400 uppercase">Start Time (HH:MM)</label>
                <input
                  type="time"
                  value={regularizeStartTime}
                  onChange={(e) => setRegularizeStartTime(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white px-3 py-1.5 rounded-xl text-xs outline-none font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-gray-400 uppercase">End Time (HH:MM)</label>
                <input
                  type="time"
                  value={regularizeEndTime}
                  onChange={(e) => setRegularizeEndTime(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white px-3 py-1.5 rounded-xl text-xs outline-none font-mono"
                />
              </div>
            </div>

            {/* Computed Duration Preview */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#0a0a0a] border border-[#222]">
              <span className="font-mono text-xs text-gray-400">Calculated Duration:</span>
              <span className="font-mono text-xs text-[#D4AF37] font-bold">
                {computePreviewDuration()}
              </span>
            </div>

            {/* Mandatory Reason */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-gray-400 uppercase">
                Reason for Regularization <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Forgot to start timer at office, power interruption, adjusted meeting schedule"
                value={regularizeReason}
                onChange={(e) => setRegularizeReason(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white p-2 rounded-xl text-xs outline-none font-sans resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setIsRegularizeModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-300 font-mono text-xs font-semibold hover:bg-[#2a2a2a]"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isSubmittingRegularize || !regularizeReason.trim()}
                onClick={handleSaveRegularize}
                className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] disabled:opacity-40 transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                {isSubmittingRegularize ? 'SAVING...' : 'APPLY REGULARIZATION'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal (Requirement 1) */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-md max-h-[85vh] rounded-2xl bg-[#141414] border border-[#8B5CF6]/50 p-5 shadow-[0_0_35px_rgba(139,92,246,0.25)] flex flex-col gap-3.5 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <History size={16} className="text-[#A78BFA]" />
                <span className="font-mono text-xs uppercase tracking-widest text-[#A78BFA] font-bold">
                  REGULARIZATION AUDIT TRAIL
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-2.5 no-scrollbar">
              {allRegularizations.length === 0 ? (
                <div className="py-8 text-center text-gray-500 font-mono text-xs">
                  No regularization audit records found. All sessions are original.
                </div>
              ) : (
                allRegularizations.map((reg) => (
                  <div
                    key={reg.id}
                    className="p-3 rounded-xl bg-[#0a0a0a] border border-[#222] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[#D4AF37] font-bold">
                        {reg.timerName}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">
                        Date: {reg.regularizedDateStr}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-gray-300">
                      <span>
                        Time: {formatTime(reg.regularizedStartMs)} - {formatTime(reg.regularizedEndMs)}
                      </span>
                      <span className="text-[#A78BFA] font-bold">
                        Duration: {formatDuration(reg.regularizedDurationMs, true)}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-300 font-sans bg-[#141414] p-2 rounded-lg border border-[#222]">
                      <span className="text-gray-400 font-mono text-[10px] block">Reason:</span>
                      {reg.reason}
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-gray-500 pt-0.5">
                      <span>Audit ID: {reg.id}</span>
                      <span>Adjusted: {new Date(reg.createdAtMs).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#2A2A2A] flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-[#222] text-gray-300 font-mono text-xs font-semibold hover:bg-[#2a2a2a]"
              >
                CLOSE AUDIT TRAIL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Expense Modal with Balance Recalculation (Requirement 4 & 7) */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-sm max-h-[85vh] rounded-2xl bg-[#141414] border border-[#8B5CF6]/50 shadow-[0_0_35px_rgba(139,92,246,0.25)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] p-4 pb-2.5 flex-shrink-0">
              <span className="font-mono text-xs uppercase tracking-widest text-[#A78BFA] font-bold">
                EDIT EXPENSE TRANSACTION
              </span>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3.5 no-scrollbar">
              {editError && (
                <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs font-mono">
                  {editError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-gray-400">Amount (INR)</label>
                <input
                  type="number"
                  step="any"
                  value={editAmount}
                  onChange={(e) => {
                    setEditAmount(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#8B5CF6] text-white px-3 py-2 rounded-xl text-sm outline-none font-mono"
                />
              </div>

              {/* Payment Method Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-gray-400">Payment Source</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditPaymentMethod('UPI');
                      setEditError(null);
                    }}
                    className={`flex flex-col p-2 rounded-xl border text-left ${
                      editPaymentMethod === 'UPI'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]'
                        : 'border-[#2A2A2A] bg-[#0c0c0c] text-gray-400'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold">UPI</span>
                    <span className="font-mono text-[9px]">Avail: ₹{accountBalances.upi.toLocaleString('en-IN')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditPaymentMethod('WALLET');
                      setEditError(null);
                    }}
                    className={`flex flex-col p-2 rounded-xl border text-left ${
                      editPaymentMethod === 'WALLET'
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-[#A78BFA]'
                        : 'border-[#2A2A2A] bg-[#0c0c0c] text-gray-400'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold">WALLET</span>
                    <span className="font-mono text-[9px]">Avail: ₹{accountBalances.wallet.toLocaleString('en-IN')}</span>
                  </button>
                </div>
              </div>

              {/* Predefined Expense Reason Chips (Requirement 1 & 4) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-gray-300 font-semibold">Expense Reason</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PREDEFINED_REASONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setEditSelectedReason(opt);
                        if (editError) setEditError(null);
                      }}
                      className={`py-2 px-0.5 rounded-xl text-xs font-mono font-bold transition-all text-center ${
                        editSelectedReason === opt
                          ? 'bg-[#D4AF37] text-black shadow-[0_0_12px_rgba(212,175,55,0.4)] border border-[#D4AF37]'
                          : 'bg-[#1e1e1e] text-gray-300 border border-[#333] hover:border-gray-500 hover:text-white'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEditSelectedReason('Custom');
                      if (editError) setEditError(null);
                    }}
                    className={`py-2 px-0.5 rounded-xl text-xs font-mono font-bold transition-all text-center ${
                      editSelectedReason === 'Custom'
                        ? 'bg-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.4)] border border-[#8B5CF6]'
                        : 'bg-[#1e1e1e] text-gray-400 border border-[#333] hover:border-[#8B5CF6]/50 hover:text-white'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Custom Reason Text Input (Requirement 2, 3, 4) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-gray-300 font-semibold flex items-center gap-1">
                    <span>Custom Reason</span>
                    {editSelectedReason === 'Custom' && (
                      <span className="text-red-400 font-bold">*</span>
                    )}
                  </label>
                  {editSelectedReason && editSelectedReason !== 'Custom' && (
                    <span className="text-[10px] font-mono text-gray-400">Optional for {editSelectedReason}</span>
                  )}
                  {editSelectedReason === 'Custom' && (
                    <span className="text-[10px] font-mono text-[#A78BFA]">Mandatory</span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder={
                    editSelectedReason === 'Custom'
                      ? 'Enter custom reason (mandatory)...'
                      : editSelectedReason
                      ? `Optional details for ${editSelectedReason}...`
                      : 'Select an option above or enter custom reason...'
                  }
                  value={editCustomReason}
                  onFocus={() => {
                    if (!editSelectedReason) {
                      setEditSelectedReason('Custom');
                    }
                  }}
                  onChange={(e) => {
                    setEditCustomReason(e.target.value);
                    if (!editSelectedReason) {
                      setEditSelectedReason('Custom');
                    }
                    if (editError) setEditError(null);
                  }}
                  className={`w-full bg-[#0a0a0a] border text-white px-3 py-2 rounded-xl text-sm outline-none font-sans transition-colors ${
                    editSelectedReason === 'Custom'
                      ? 'border-[#8B5CF6] focus:border-[#A78BFA]'
                      : 'border-[#333] focus:border-[#D4AF37]'
                  }`}
                />
              </div>
            </div>

            <div className="flex gap-2 p-3.5 border-t border-[#2A2A2A] bg-[#141414] flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-300 font-mono text-xs font-semibold hover:bg-[#2a2a2a]"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={
                  isSavingEdit ||
                  !editAmount ||
                  parseFloat(editAmount) <= 0 ||
                  !(
                    (editSelectedReason && editSelectedReason !== 'Custom') ||
                    (editSelectedReason === 'Custom' && editCustomReason.trim().length > 0) ||
                    editCustomReason.trim().length > 0
                  )
                }
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#8B5CF6] text-white font-mono text-xs font-bold hover:bg-[#A78BFA] shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all disabled:opacity-40"
              >
                {isSavingEdit ? 'UPDATING...' : 'UPDATE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
