import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  TimerId,
  TimerActiveState,
  TimerConfig,
  TimerEvent,
  Expense,
  DailySummary,
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
  // Expenses
  todayExpenses: Expense[];
  todayTotalExpense: number;
  addExpense: (amount: number, reason: string, category?: string) => Promise<void>;
  editExpense: (expense: Expense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  // Daily Summary
  selectedDate: string;
  setSelectedDate: (dateStr: string) => void;
  selectedDateSummary: DailySummary | null;
  selectedDateEvents: TimerEvent[];
  selectedDateExpenses: Expense[];
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

  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(formatDate());
  const [selectedDateSummary, setSelectedDateSummary] = useState<DailySummary | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<TimerEvent[]>([]);
  const [selectedDateExpenses, setSelectedDateExpenses] = useState<Expense[]>([]);

  const animFrameRef = useRef<number | null>(null);
  const activeStatesRef = useRef(activeStates);
  activeStatesRef.current = activeStates;

  // Refresh data for selected date and today
  const refreshData = useCallback(async () => {
    const todayStr = formatDate();
    const tExpenses = await dbService.getExpensesForDate(todayStr);
    setTodayExpenses(tExpenses);

    const summary = await dbService.getDailySummary(selectedDate);
    setSelectedDateSummary(summary);

    const events = await dbService.getEventsForDate(selectedDate);
    setSelectedDateEvents(events);

    const expenses = await dbService.getExpensesForDate(selectedDate);
    setSelectedDateExpenses(expenses);
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

    // Record session for daily summary (splitting across midnight if it crossed midnight)
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

    await refreshData();
  };

  // --- EXPENSE ACTIONS ---

  const addExpense = async (amount: number, reason: string, category: string = 'General') => {
    const now = Date.now();
    await dbService.saveExpense({
      dateStr: formatDate(now),
      timeStr: formatTime(now),
      timestampMs: now,
      amount,
      reason,
      category,
    });
    await refreshData();
  };

  const editExpense = async (expense: Expense) => {
    await dbService.updateExpense(expense);
    await refreshData();
  };

  const removeExpense = async (id: string) => {
    await dbService.deleteExpense(id);
    await refreshData();
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
