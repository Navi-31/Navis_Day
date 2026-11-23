import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  TimerId,
  TimerActiveState,
  TimerConfig,
  TimerEvent,
  TimerRegularization,
  Expense,
  DailySummary,
  PaymentMethod,
  AccountBalances,
  BalanceTransaction,
} from '../types';
import { dbService } from '../services/database';
import { formatDate, formatTime } from '../utils/time';

export const TIMER_CONFIGS: Record<TimerId, TimerConfig> = {
  day_analysis: {
    id: 'day_analysis',
    name: 'Day Analysis',
    theme: 'gold',
    primaryColor: '#D4AF37',
    secondaryColor: '#554300',
    targetHours: 8,
  },
  bus_waiting: {
    id: 'bus_waiting',
    name: 'Bus Waiting',
    theme: 'purple',
    primaryColor: '#8B5CF6',
    secondaryColor: '#3C0091',
    targetHours: 2,
  },
  bus_travel: {
    id: 'bus_travel',
    name: 'Bus Travel',
    theme: 'purple',
    primaryColor: '#8B5CF6',
    secondaryColor: '#3C0091',
    targetHours: 3,
  },
};

interface AppContextType {
  initialized: boolean;
  activeStates: Record<TimerId, TimerActiveState>;
  displayTimes: Record<TimerId, number>; // in milliseconds
  startTimer: (timerId: TimerId) => Promise<void>;
  pauseTimer: (timerId: TimerId) => Promise<void>;
  resumeTimer: (timerId: TimerId) => Promise<void>;
  stopTimer: (timerId: TimerId) => Promise<void>;
  // Account Balances
  accountBalances: AccountBalances;
  addAccountBalance: (accountType: PaymentMethod, amount: number, note?: string) => Promise<{ success: boolean; error?: string }>;
  // Expenses
  todayExpenses: Expense[];
  todayTotalExpense: number;
  addExpense: (amount: number, reason: string, category: string, paymentMethod: PaymentMethod) => Promise<{ success: boolean; error?: string }>;
  editExpense: (expense: Expense) => Promise<{ success: boolean; error?: string }>;
  removeExpense: (id: string) => Promise<{ success: boolean; error?: string }>;
  // Daily Summary & Logs
  selectedDate: string;
  setSelectedDate: (dateStr: string) => void;
  selectedDateSummary: DailySummary | null;
  selectedDateEvents: TimerEvent[];
  selectedDateExpenses: Expense[];
  selectedDateBalanceTransactions: BalanceTransaction[];
  selectedDateRegularizations: TimerRegularization[];
  allRegularizations: TimerRegularization[];
  regularizeSession: (params: {
    sessionId?: string;
    timerId: TimerId;
    timerName: string;
    regularizedDateStr: string;
    regularizedStartMs: number;
    regularizedEndMs: number;
    reason: string;
  }) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialized, setInitialized] = useState(false);
  const [activeStates, setActiveStates] = useState<Record<TimerId, TimerActiveState>>({
    day_analysis: { timerId: 'day_analysis', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
    bus_waiting: { timerId: 'bus_waiting', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
    bus_travel: { timerId: 'bus_travel', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
  });

  const [displayTimes, setDisplayTimes] = useState<Record<TimerId, number>>({
    day_analysis: 0,
    bus_waiting: 0,
    bus_travel: 0,
  });

  const [accountBalances, setAccountBalances] = useState<AccountBalances>({ upi: 0, wallet: 0 });
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(formatDate());
  const [selectedDateSummary, setSelectedDateSummary] = useState<DailySummary | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<TimerEvent[]>([]);
  const [selectedDateExpenses, setSelectedDateExpenses] = useState<Expense[]>([]);
  const [selectedDateBalanceTransactions, setSelectedDateBalanceTransactions] = useState<BalanceTransaction[]>([]);
  const [selectedDateRegularizations, setSelectedDateRegularizations] = useState<TimerRegularization[]>([]);
  const [allRegularizations, setAllRegularizations] = useState<TimerRegularization[]>([]);

  const animFrameRef = useRef<number | null>(null);
  const activeStatesRef = useRef(activeStates);
  activeStatesRef.current = activeStates;

  // Refresh data for selected date and today (Optimized with Promise.all for high performance)
  const refreshData = useCallback(async () => {
    const todayStr = formatDate();
    try {
      const [
        tExpenses,
        summary,
        events,
        expenses,
        balances,
        bTxs,
        regs,
        allRegs,
      ] = await Promise.all([
        dbService.getExpensesForDate(todayStr),
        dbService.getDailySummary(selectedDate),
        dbService.getEventsForDate(selectedDate),
        dbService.getExpensesForDate(selectedDate),
        dbService.getAccountBalances(),
        dbService.getBalanceTransactionsForDate(selectedDate),
        dbService.getRegularizationsForDate(selectedDate),
        dbService.getAllRegularizations(),
      ]);

      setTodayExpenses(tExpenses);
      setSelectedDateSummary(summary);
      setSelectedDateEvents(events);
      setSelectedDateExpenses(expenses);
      setAccountBalances(balances);
      setSelectedDateBalanceTransactions(bTxs);
      setSelectedDateRegularizations(regs);
      setAllRegularizations(allRegs);
    } catch (err) {
      console.error('Failed to refresh data in parallel:', err);
    }
  }, [selectedDate]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await dbService.initialize();

      const states = await dbService.getAllTimerActiveStates();
      setActiveStates(states);

      // Compute initial display times
      const now = Date.now();
      const initialDisplays: Record<TimerId, number> = {
        day_analysis: 0,
        bus_waiting: 0,
        bus_travel: 0,
      };

      for (const t of ['day_analysis', 'bus_waiting', 'bus_travel'] as TimerId[]) {
        const s = states[t];
        if (s.status === 'RUNNING' && s.sessionStartTimeMs) {
          const elapsed = Math.max(0, now - s.sessionStartTimeMs);
          initialDisplays[t] = s.accumulatedDurationMs + elapsed;
        } else {
          initialDisplays[t] = s.accumulatedDurationMs;
        }
      }
      setDisplayTimes(initialDisplays);

      await refreshData();
      setInitialized(true);
    };

    init();
  }, [refreshData]);

  // High-efficiency, zero-background ticker:
  // ONLY ticks while document is visible in foreground. Stops when app is hidden/backgrounded!
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const updateTicker = () => {
      if (document.hidden) return;

      const now = Date.now();
      const newDisplays: Record<TimerId, number> = { ...displayTimes };
      let hasRunning = false;

      for (const t of ['day_analysis', 'bus_waiting', 'bus_travel'] as TimerId[]) {
        const s = activeStatesRef.current[t];
        if (s.status === 'RUNNING' && s.sessionStartTimeMs) {
          hasRunning = true;
          const elapsed = Math.max(0, now - s.sessionStartTimeMs);
          newDisplays[t] = s.accumulatedDurationMs + elapsed;
        } else {
          newDisplays[t] = s.accumulatedDurationMs;
        }
      }

      if (hasRunning) {
        setDisplayTimes(newDisplays);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // App brought back to foreground: immediately recalculate from timestamps
        updateTicker();
      }
    };

    intervalId = setInterval(updateTicker, 250);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // --- TIMER ACTIONS ---

  const startTimer = async (timerId: TimerId) => {
    // Bus timers can only be started if Day Analysis is already running or paused
    if (timerId !== 'day_analysis') {
      const dayAnalysis = activeStates['day_analysis'];
      if (dayAnalysis.status === 'IDLE') {
        alert('Please start Day Analysis first. Bus timers operate within the Day Analysis session.');
        return;
      }
    }

    const now = Date.now();
    const config = TIMER_CONFIGS[timerId];

    const newState: TimerActiveState = {
      timerId,
      status: 'RUNNING',
      sessionStartTimeMs: now,
      accumulatedDurationMs: 0,
      lastUpdatedMs: now,
    };

    setActiveStates((prev) => ({ ...prev, [timerId]: newState }));
    setDisplayTimes((prev) => ({ ...prev, [timerId]: 0 }));
    await dbService.saveTimerActiveState(newState);

    await dbService.logTimerEvent({
      timerId,
      timerName: config.name,
      eventType: 'START',
      timestampMs: now,
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      note: `${config.name} Started`,
    });

    await refreshData();
  };

  const pauseTimer = async (timerId: TimerId) => {
    const now = Date.now();
    const config = TIMER_CONFIGS[timerId];
    const current = activeStates[timerId];

    let newAccumulated = current.accumulatedDurationMs;
    if (current.status === 'RUNNING' && current.sessionStartTimeMs) {
      newAccumulated += Math.max(0, now - current.sessionStartTimeMs);
    }

    const newState: TimerActiveState = {
      timerId,
      status: 'PAUSED',
      sessionStartTimeMs: null,
      accumulatedDurationMs: newAccumulated,
      lastUpdatedMs: now,
    };

    setActiveStates((prev) => ({ ...prev, [timerId]: newState }));
    setDisplayTimes((prev) => ({ ...prev, [timerId]: newAccumulated }));
    await dbService.saveTimerActiveState(newState);

    await dbService.logTimerEvent({
      timerId,
      timerName: config.name,
      eventType: 'PAUSE',
      timestampMs: now,
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      durationMs: newAccumulated,
      note: `${config.name} Paused`,
    });

    await refreshData();
  };

  const resumeTimer = async (timerId: TimerId) => {
    // Bus timers cannot resume if Day Analysis is IDLE
    if (timerId !== 'day_analysis') {
      const dayAnalysis = activeStates['day_analysis'];
      if (dayAnalysis.status === 'IDLE') {
        alert('Day Analysis is not running. Bus timers cannot resume.');
        return;
      }
    }

    const now = Date.now();
    const config = TIMER_CONFIGS[timerId];
    const current = activeStates[timerId];

    const newState: TimerActiveState = {
      timerId,
      status: 'RUNNING',
      sessionStartTimeMs: now,
      accumulatedDurationMs: current.accumulatedDurationMs,
      lastUpdatedMs: now,
    };

    setActiveStates((prev) => ({ ...prev, [timerId]: newState }));
    await dbService.saveTimerActiveState(newState);

    await dbService.logTimerEvent({
      timerId,
      timerName: config.name,
      eventType: 'RESUME',
      timestampMs: now,
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      note: `${config.name} Resumed`,
    });

    await refreshData();
  };

  const stopTimer = async (timerId: TimerId) => {
    const now = Date.now();
    const config = TIMER_CONFIGS[timerId];
    const current = activeStates[timerId];

    let totalDuration = current.accumulatedDurationMs;
    if (current.status === 'RUNNING' && current.sessionStartTimeMs) {
      totalDuration += Math.max(0, now - current.sessionStartTimeMs);
    }

    // Record session for daily summary
    if (totalDuration > 0) {
      const sessionStart = current.sessionStartTimeMs ? current.sessionStartTimeMs - current.accumulatedDurationMs : now - totalDuration;
      await dbService.recordTimerSession(timerId, config.name, sessionStart, now);
    }

    const newState: TimerActiveState = {
      timerId,
      status: 'IDLE',
      sessionStartTimeMs: null,
      accumulatedDurationMs: 0,
      lastUpdatedMs: now,
    };

    setActiveStates((prev) => ({ ...prev, [timerId]: newState }));
    setDisplayTimes((prev) => ({ ...prev, [timerId]: 0 }));
    await dbService.saveTimerActiveState(newState);

    await dbService.logTimerEvent({
      timerId,
      timerName: config.name,
      eventType: 'STOP',
      timestampMs: now,
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      durationMs: totalDuration,
      note: `Total: ${Math.floor(totalDuration / 60000)}m`,
    });

    // Requirement 2: When Day Analysis stops, automatically finalize any active Bus Waiting or Bus Travel session!
    if (timerId === 'day_analysis') {
      const busTimerIds: TimerId[] = ['bus_waiting', 'bus_travel'];
      for (const busId of busTimerIds) {
        const busCurrent = activeStates[busId];
        if (busCurrent.status === 'RUNNING' || busCurrent.status === 'PAUSED') {
          let busDuration = busCurrent.accumulatedDurationMs;
          if (busCurrent.status === 'RUNNING' && busCurrent.sessionStartTimeMs) {
            busDuration += Math.max(0, now - busCurrent.sessionStartTimeMs);
          }

          if (busDuration > 0) {
            const busStart = busCurrent.sessionStartTimeMs
              ? busCurrent.sessionStartTimeMs - busCurrent.accumulatedDurationMs
              : now - busDuration;
            await dbService.recordTimerSession(busId, TIMER_CONFIGS[busId].name, busStart, now);
          }

          const busNewState: TimerActiveState = {
            timerId: busId,
            status: 'IDLE',
            sessionStartTimeMs: null,
            accumulatedDurationMs: 0,
            lastUpdatedMs: now,
          };

          setActiveStates((prev) => ({ ...prev, [busId]: busNewState }));
          setDisplayTimes((prev) => ({ ...prev, [busId]: 0 }));
          await dbService.saveTimerActiveState(busNewState);

          await dbService.logTimerEvent({
            timerId: busId,
            timerName: TIMER_CONFIGS[busId].name,
            eventType: 'STOP',
            timestampMs: now,
            dateStr: formatDate(now),
            timeStr: formatTime(now),
            durationMs: busDuration,
            note: `Auto-stopped on Day Analysis finish (${Math.floor(busDuration / 60000)}m)`,
          });
        }
      }
    }

    await refreshData();
  };

  // --- BALANCE & EXPENSE ACTIONS ---

  const addAccountBalance = async (
    accountType: PaymentMethod,
    amount: number,
    note?: string
  ): Promise<{ success: boolean; error?: string }> => {
    // 1. Optimistic instant balance update in UI
    const key = accountType.toLowerCase() as 'upi' | 'wallet';
    setAccountBalances((prev) => ({
      ...prev,
      [key]: prev[key] + amount,
    }));

    // 2. Persist in database
    const res = await dbService.addAccountBalance(accountType, amount, note);
    if (res.success && res.balances) {
      setAccountBalances(res.balances);
      // Background non-blocking refresh so caller never waits
      refreshData().catch(console.error);
      return { success: true };
    }

    // Rollback if DB failed
    const rollback = await dbService.getAccountBalances();
    setAccountBalances(rollback);
    return { success: false, error: res.error };
  };

  const addExpense = async (
    amount: number,
    reason: string,
    category: string = 'General',
    paymentMethod: PaymentMethod = 'UPI'
  ): Promise<{ success: boolean; error?: string }> => {
    const now = Date.now();
    const res = await dbService.saveExpense({
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      timestampMs: now,
      amount,
      reason,
      category,
      paymentMethod,
    });
    if (res.success) {
      await refreshData();
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const editExpense = async (expense: Expense): Promise<{ success: boolean; error?: string }> => {
    const res = await dbService.updateExpense(expense);
    if (res.success) {
      await refreshData();
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const removeExpense = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await dbService.deleteExpense(id);
    if (res.success) {
      await refreshData();
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const regularizeSession = async (params: {
    sessionId?: string;
    timerId: TimerId;
    timerName: string;
    regularizedDateStr: string;
    regularizedStartMs: number;
    regularizedEndMs: number;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const res = await dbService.regularizeTimerSession(params);
    if (res.success) {
      await refreshData();
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const clearAllData = async () => {
    await dbService.clearAllData();
    setActiveStates({
      day_analysis: { timerId: 'day_analysis', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
      bus_waiting: { timerId: 'bus_waiting', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
      bus_travel: { timerId: 'bus_travel', status: 'IDLE', sessionStartTimeMs: null, accumulatedDurationMs: 0, lastUpdatedMs: Date.now() },
    });
    setDisplayTimes({
      day_analysis: 0,
      bus_waiting: 0,
      bus_travel: 0,
    });
    setTodayExpenses([]);
    setAccountBalances({ upi: 0, wallet: 0 });
    await refreshData();
  };

  const todayTotalExpense = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <AppContext.Provider
      value={{
        initialized,
        activeStates,
        displayTimes,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        accountBalances,
        addAccountBalance,
        todayExpenses,
        todayTotalExpense,
        addExpense,
        editExpense,
        removeExpense,
        selectedDate,
        setSelectedDate,
        selectedDateSummary,
        selectedDateEvents,
        selectedDateExpenses,
        selectedDateBalanceTransactions,
        selectedDateRegularizations,
        allRegularizations,
        regularizeSession,
        refreshData,
        clearAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
