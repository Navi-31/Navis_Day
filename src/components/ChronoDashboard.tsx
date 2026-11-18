import React, { useState } from 'react';
import { useApp, TIMER_CONFIGS } from '../context/AppContext';
import { formatDuration } from '../utils/time';
import { Play, Pause, Square, Plus, Receipt, IndianRupee } from 'lucide-react';

export const ChronoDashboard: React.FC = () => {
  const {
    activeStates,
    displayTimes,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    todayTotalExpense,
    addExpense,
  } = useApp();

  // Expense entry state
  const [amountInput, setAmountInput] = useState<string>('');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseReason, setExpenseReason] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('Transit');

  const handleProceedExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountInput);
    if (!isNaN(val) && val > 0) {
      setIsExpenseModalOpen(true);
    }
  };

  const handleSaveExpense = async () => {
    const val = parseFloat(amountInput);
    if (!isNaN(val) && val > 0) {
      await addExpense(val, expenseReason.trim() || 'General Expense', expenseCategory);
      setAmountInput('');
      setExpenseReason('');
      setIsExpenseModalOpen(false);
    }
  };

  // Helper for Circular SVG progress calculation
  const getProgressStroke = (ms: number, targetHours: number) => {
    const targetMs = targetHours * 3600 * 1000;
    const progress = Math.min(1, ms / targetMs);
    const circumference = 2 * Math.PI * 45; // radius 45
    const strokeDashoffset = circumference - progress * circumference;
    return { circumference, strokeDashoffset };
  };

  // Day Analysis Timer
  const dayAnalysisState = activeStates['day_analysis'];
  const dayAnalysisMs = displayTimes['day_analysis'] || 0;
  const dayStroke = getProgressStroke(dayAnalysisMs, TIMER_CONFIGS.day_analysis.targetHours);

  // Bus Waiting Timer
  const busWaitState = activeStates['bus_waiting'];
  const busWaitMs = displayTimes['bus_waiting'] || 0;
  const busWaitStroke = getProgressStroke(busWaitMs, TIMER_CONFIGS.bus_waiting.targetHours);

  // Bus Travel Timer
  const busTravelState = activeStates['bus_travel'];
  const busTravelMs = displayTimes['bus_travel'] || 0;
  const busTravelStroke = getProgressStroke(busTravelMs, TIMER_CONFIGS.bus_travel.targetHours);

  return (
    <div className="flex flex-col flex-1 w-full bg-black text-white px-4 pt-2 pb-24 overflow-y-auto no-scrollbar">
      {/* Luxury Instrument Header */}
      <div className="flex items-center justify-between py-2 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse shadow-[0_0_8px_#D4AF37]" />
          <span className="font-mono text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">
            CHRONO TELEMETRY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-[#181818] border border-[#2A2A2A] text-[10px] font-mono text-gray-400">
            TIMESTAMP RECOVERY ACTIVE
          </span>
        </div>
      </div>

      {/* Main Dial Grid */}
      <div className="flex flex-col items-center justify-center my-3 gap-4">
        {/* 1. LARGE CENTRAL DAY ANALYSIS TIMER */}
        <div className="relative flex flex-col items-center justify-center w-64 h-64 rounded-full bg-gradient-to-b from-[#141414] to-[#0a0a0a] border-2 border-[#D4AF37]/50 shadow-[0_0_35px_rgba(212,175,55,0.25)] p-4">
          {/* Circular SVG Gauge */}
          <svg className="absolute w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#222222"
              strokeWidth="4"
            />
            {/* Active Gold Arc */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="4.5"
              strokeDasharray={dayStroke.circumference}
              strokeDashoffset={dayStroke.strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>

          {/* Dial Center Content */}
          <div className="flex flex-col items-center z-10">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#D4AF37] font-bold">
              DAY ANALYSIS
            </span>
            <span className="font-mono text-3xl font-bold tracking-tight text-white my-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              {formatDuration(dayAnalysisMs)}
            </span>
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  dayAnalysisState.status === 'RUNNING'
                    ? 'bg-emerald-400 animate-ping'
                    : dayAnalysisState.status === 'PAUSED'
                    ? 'bg-amber-400'
                    : 'bg-zinc-600'
                }`}
              />
              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">
                {dayAnalysisState.status}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mt-1">
              {dayAnalysisState.status === 'IDLE' && (
                <button
                  onClick={() => startTimer('day_analysis')}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] active:scale-95 transition-all shadow-[0_0_15px_rgba(212,175,55,0.4)]"
                >
                  <Play size={14} className="fill-current" />
                  START
                </button>
              )}
              {dayAnalysisState.status === 'RUNNING' && (
                <>
                  <button
                    onClick={() => pauseTimer('day_analysis')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#2A2A2A] text-[#D4AF37] font-mono text-xs font-bold border border-[#D4AF37]/40 hover:bg-[#333] active:scale-95 transition-all"
                  >
                    <Pause size={13} className="fill-current" />
                    PAUSE
                  </button>
                  <button
                    onClick={() => stopTimer('day_analysis')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-950/80 text-red-400 font-mono text-xs font-bold border border-red-800/50 hover:bg-red-900 active:scale-95 transition-all"
                  >
                    <Square size={13} className="fill-current" />
                    STOP
                  </button>
                </>
              )}
              {dayAnalysisState.status === 'PAUSED' && (
                <>
                  <button
                    onClick={() => resumeTimer('day_analysis')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] active:scale-95 transition-all shadow-[0_0_15px_rgba(212,175,55,0.4)]"
                  >
                    <Play size={13} className="fill-current" />
                    RESUME
                  </button>
                  <button
                    onClick={() => stopTimer('day_analysis')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-950/80 text-red-400 font-mono text-xs font-bold border border-red-800/50 hover:bg-red-900 active:scale-95 transition-all"
                  >
                    <Square size={13} className="fill-current" />
                    STOP
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. DUAL SMALLER TIMERS: BUS WAITING & BUS TRAVEL */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {/* BUS WAITING */}
          <div className="relative flex flex-col items-center justify-between p-3 rounded-2xl bg-[#121212] border border-[#8B5CF6]/40 shadow-[0_4px_20px_rgba(139,92,246,0.15)]">
            <div className="relative w-28 h-28 flex items-center justify-center my-1">
              <svg className="absolute w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#222222" strokeWidth="5" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="5.5"
                  strokeDasharray={busWaitStroke.circumference}
                  strokeDashoffset={busWaitStroke.strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <div className="flex flex-col items-center z-10">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#A78BFA] font-semibold">
                  BUS WAITING
                </span>
                <span className="font-mono text-sm font-bold text-white mt-0.5">
                  {formatDuration(busWaitMs, true)}
                </span>
                <span className="font-mono text-[9px] text-gray-400 uppercase">
                  {busWaitState.status}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1 mt-1">
              {busWaitState.status === 'IDLE' && (
                <button
                  onClick={() => startTimer('bus_waiting')}
                  className="px-3 py-1 rounded-full bg-[#8B5CF6] text-white font-mono text-[11px] font-bold hover:bg-[#A78BFA] active:scale-95 shadow-[0_0_10px_rgba(139,92,246,0.4)]"
                >
                  START
                </button>
              )}
              {busWaitState.status === 'RUNNING' && (
                <>
                  <button
                    onClick={() => pauseTimer('bus_waiting')}
                    className="p-1.5 rounded-full bg-[#222] text-[#A78BFA] border border-[#8B5CF6]/50"
                  >
                    <Pause size={12} />
                  </button>
                  <button
                    onClick={() => stopTimer('bus_waiting')}
                    className="p-1.5 rounded-full bg-red-950 text-red-400 border border-red-800/50"
                  >
                    <Square size={12} />
                  </button>
                </>
              )}
              {busWaitState.status === 'PAUSED' && (
                <>
                  <button
                    onClick={() => resumeTimer('bus_waiting')}
                    className="px-2.5 py-1 rounded-full bg-[#8B5CF6] text-white font-mono text-[10px] font-bold"
                  >
                    RESUME
                  </button>
                  <button
                    onClick={() => stopTimer('bus_waiting')}
                    className="p-1.5 rounded-full bg-red-950 text-red-400 border border-red-800/50"
                  >
                    <Square size={12} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* BUS TRAVEL */}
          <div className="relative flex flex-col items-center justify-between p-3 rounded-2xl bg-[#121212] border border-[#8B5CF6]/40 shadow-[0_4px_20px_rgba(139,92,246,0.15)]">
            <div className="relative w-28 h-28 flex items-center justify-center my-1">
              <svg className="absolute w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#222222" strokeWidth="5" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="5.5"
                  strokeDasharray={busTravelStroke.circumference}
                  strokeDashoffset={busTravelStroke.strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <div className="flex flex-col items-center z-10">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#A78BFA] font-semibold">
                  BUS TRAVEL
                </span>
                <span className="font-mono text-sm font-bold text-white mt-0.5">
                  {formatDuration(busTravelMs, true)}
                </span>
                <span className="font-mono text-[9px] text-gray-400 uppercase">
                  {busTravelState.status}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1 mt-1">
              {busTravelState.status === 'IDLE' && (
                <button
                  onClick={() => startTimer('bus_travel')}
                  className="px-3 py-1 rounded-full bg-[#8B5CF6] text-white font-mono text-[11px] font-bold hover:bg-[#A78BFA] active:scale-95 shadow-[0_0_10px_rgba(139,92,246,0.4)]"
                >
                  START
                </button>
              )}
              {busTravelState.status === 'RUNNING' && (
                <>
                  <button
                    onClick={() => pauseTimer('bus_travel')}
                    className="p-1.5 rounded-full bg-[#222] text-[#A78BFA] border border-[#8B5CF6]/50"
                  >
                    <Pause size={12} />
                  </button>
                  <button
                    onClick={() => stopTimer('bus_travel')}
                    className="p-1.5 rounded-full bg-red-950 text-red-400 border border-red-800/50"
                  >
                    <Square size={12} />
                  </button>
                </>
              )}
              {busTravelState.status === 'PAUSED' && (
                <>
                  <button
                    onClick={() => resumeTimer('bus_travel')}
                    className="px-2.5 py-1 rounded-full bg-[#8B5CF6] text-white font-mono text-[10px] font-bold"
                  >
                    RESUME
                  </button>
                  <button
                    onClick={() => stopTimer('bus_travel')}
                    className="p-1.5 rounded-full bg-red-950 text-red-400 border border-red-800/50"
                  >
                    <Square size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. FIXED BOTTOM 30% EXPENSE TRACKING AREA */}
      <div className="mt-auto w-full rounded-2xl bg-gradient-to-t from-[#0e0e0e] to-[#161616] border border-[#2A2A2A] p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-[#D4AF37]" />
            <span className="font-mono text-xs uppercase tracking-wider text-gray-300 font-semibold">
              TODAY'S EXPENDITURE
            </span>
          </div>
          <div className="flex items-center text-[#D4AF37] font-mono font-bold text-lg">
            <IndianRupee size={16} />
            <span>{todayTotalExpense.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Input & Proceed */}
        <form onSubmit={handleProceedExpense} className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <IndianRupee size={16} />
            </div>
            <input
              type="number"
              step="any"
              placeholder="Amount (e.g. 150)"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white pl-9 pr-3 py-2.5 rounded-xl font-mono text-sm outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!amountInput || parseFloat(amountInput) <= 0}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all shadow-[0_0_15px_rgba(212,175,55,0.25)]"
          >
            <span>PROCEED</span>
            <Plus size={16} />
          </button>
        </form>
      </div>

      {/* Expense Confirmation & Note Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-[#D4AF37]/50 p-5 shadow-[0_0_35px_rgba(212,175,55,0.25)] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3">
              <span className="font-mono text-xs uppercase tracking-widest text-[#D4AF37] font-bold">
                EXPENSE ENTRY CONFIRMATION
              </span>
              <div className="flex items-center text-[#D4AF37] font-mono font-bold text-lg">
                <IndianRupee size={16} />
                <span>{amountInput}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">What did you spend this on?</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Metro Ticket, Coffee, Grocery"
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] text-white px-3 py-2 rounded-xl text-sm outline-none font-sans"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">Category</label>
              <div className="grid grid-cols-3 gap-1.5">
                {['Transit', 'Meals', 'Logistics', 'Supplies', 'Personal', 'General'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setExpenseCategory(cat)}
                    className={`py-1.5 rounded-lg text-xs font-mono transition-colors ${
                      expenseCategory === cat
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'bg-[#202020] text-gray-300 hover:bg-[#282828]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-300 font-mono text-xs font-semibold hover:bg-[#2a2a2a] transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSaveExpense}
                className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                SAVE EXPENSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
