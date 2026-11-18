import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import {
  TimerActiveState,
  TimerEvent,
  TimerSession,
  Expense,
  DailySummary,
  TimerId,
} from '../types';
import { formatDate, splitDurationAcrossMidnight } from '../utils/time';

const DB_NAME = 'aura_tracker_db';
const SCHEMA_VERSION = 1;

class DatabaseService {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isNative: boolean = false;
  private initialized: boolean = false;

  // Fallback memory/localStorage state when in browser development mode
  private webStorageKeyPrefix = 'aura_db_';

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    this.isNative = Capacitor.isNativePlatform();

    if (this.isNative) {
      try {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
        const ret = await this.sqlite.checkConnectionsConsistency();
        const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;

        if (ret.result && isConn) {
          this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
        } else {
          this.db = await this.sqlite.createConnection(
            DB_NAME,
            false,
            'no-encryption',
            SCHEMA_VERSION,
            false
          );
        }

        await this.db.open();
        await this.applyMigrationsNative();
      } catch (err) {
        console.warn('Native SQLite init fallback to web store:', err);
        this.isNative = false;
        await this.applyMigrationsWeb();
      }
    } else {
      await this.applyMigrationsWeb();
    }

    // Ensure default timer rows exist
    await this.ensureDefaultTimerStates();
    // Purge any legacy sample/mock seed data (such as the initial ₹1,450 expense entries)
    await this.purgeMockSeedData();
    this.initialized = true;
  }

  // --- MIGRATIONS ---

  private async applyMigrationsNative(): Promise<void> {
    if (!this.db) return;

    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS timer_active_state (
        timer_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        session_start_ms INTEGER,
        accumulated_ms INTEGER NOT NULL DEFAULT 0,
        last_updated_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS timer_events (
        id TEXT PRIMARY KEY,
        timer_id TEXT NOT NULL,
        timer_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        duration_ms INTEGER,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS timer_sessions (
        id TEXT PRIMARY KEY,
        timer_id TEXT NOT NULL,
        timer_name TEXT NOT NULL,
        date_str TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        category TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_date ON timer_events (date_str);
      CREATE INDEX IF NOT EXISTS idx_sessions_date ON timer_sessions (date_str);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date_str);
    `;

    await this.db.execute(createTablesSQL);
    await this.db.run(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [SCHEMA_VERSION, Date.now()]
    );
  }

  private async applyMigrationsWeb(): Promise<void> {
    const migrationsKey = this.webStorageKeyPrefix + 'schema_migrations';
    if (!localStorage.getItem(migrationsKey)) {
      localStorage.setItem(
        migrationsKey,
        JSON.stringify([{ version: SCHEMA_VERSION, applied_at: Date.now() }])
      );
    }
  }

  private async ensureDefaultTimerStates(): Promise<void> {
    const timers: TimerId[] = ['day_analysis', 'bus_waiting', 'bus_travel'];
    for (const t of timers) {
      const existing = await this.getTimerActiveState(t);
      if (!existing) {
        await this.saveTimerActiveState({
          timerId: t,
          status: 'IDLE',
          sessionStartTimeMs: null,
          accumulatedDurationMs: 0,
          lastUpdatedMs: Date.now(),
        });
      }
    }
  }

  // --- TIMER ACTIVE STATE ---

  public async getTimerActiveState(timerId: TimerId): Promise<TimerActiveState | null> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_active_state WHERE timer_id = ?',
        [timerId]
      );
      if (res.values && res.values.length > 0) {
        const row = res.values[0];
        return {
          timerId: row.timer_id as TimerId,
          status: row.status,
          sessionStartTimeMs: row.session_start_ms !== null ? Number(row.session_start_ms) : null,
          accumulatedDurationMs: Number(row.accumulated_ms || 0),
          lastUpdatedMs: Number(row.last_updated_ms),
        };
      }
      return null;
    } else {
      const key = `${this.webStorageKeyPrefix}timer_state_${timerId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    }
  }

  public async getAllTimerActiveStates(): Promise<Record<TimerId, TimerActiveState>> {
    const result = {} as Record<TimerId, TimerActiveState>;
    const timers: TimerId[] = ['day_analysis', 'bus_waiting', 'bus_travel'];
    for (const t of timers) {
      const state = await this.getTimerActiveState(t);
      if (state) {
        result[t] = state;
      } else {
        result[t] = {
          timerId: t,
          status: 'IDLE',
          sessionStartTimeMs: null,
          accumulatedDurationMs: 0,
          lastUpdatedMs: Date.now(),
        };
      }
    }
    return result;
  }

  public async saveTimerActiveState(state: TimerActiveState): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.run(
        `INSERT OR REPLACE INTO timer_active_state 
         (timer_id, status, session_start_ms, accumulated_ms, last_updated_ms) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          state.timerId,
          state.status,
          state.sessionStartTimeMs,
          state.accumulatedDurationMs,
          Date.now(),
        ]
      );
    } else {
      const key = `${this.webStorageKeyPrefix}timer_state_${state.timerId}`;
      localStorage.setItem(key, JSON.stringify(state));
    }
  }

  // --- TIMER EVENTS ---

  public async logTimerEvent(event: Omit<TimerEvent, 'id'>): Promise<TimerEvent> {
    const fullEvent: TimerEvent = {
      ...event,
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    };

    if (this.isNative && this.db) {
      await this.db.run(
        `INSERT INTO timer_events 
         (id, timer_id, timer_name, event_type, timestamp_ms, date_str, time_str, duration_ms, note) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fullEvent.id,
          fullEvent.timerId,
          fullEvent.timerName,
          fullEvent.eventType,
          fullEvent.timestampMs,
          fullEvent.dateStr,
          fullEvent.timeStr,
          fullEvent.durationMs ?? null,
          fullEvent.note ?? null,
        ]
      );
    } else {
      const events = await this.getAllEvents();
      events.push(fullEvent);
      localStorage.setItem(
        this.webStorageKeyPrefix + 'timer_events',
        JSON.stringify(events)
      );
    }

    return fullEvent;
  }

  public async getEventsForDate(dateStr: string): Promise<TimerEvent[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_events WHERE date_str = ? ORDER BY timestamp_ms ASC',
        [dateStr]
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          timerId: r.timer_id as TimerId,
          timerName: r.timer_name,
          eventType: r.event_type,
          timestampMs: Number(r.timestamp_ms),
          dateStr: r.date_str,
          timeStr: r.time_str,
          durationMs: r.duration_ms ? Number(r.duration_ms) : undefined,
          note: r.note,
        }));
      }
      return [];
    } else {
      const all = await this.getAllEvents();
      return all.filter((e) => e.dateStr === dateStr).sort((a, b) => a.timestampMs - b.timestampMs);
    }
  }

  public async getAllEvents(): Promise<TimerEvent[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_events ORDER BY timestamp_ms ASC'
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          timerId: r.timer_id as TimerId,
          timerName: r.timer_name,
          eventType: r.event_type,
          timestampMs: Number(r.timestamp_ms),
          dateStr: r.date_str,
          timeStr: r.time_str,
          durationMs: r.duration_ms ? Number(r.duration_ms) : undefined,
          note: r.note,
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'timer_events');
      return data ? JSON.parse(data) : [];
    }
  }

  // --- TIMER SESSIONS (FOR ACCURATE DAILY SUMMARY INCLUDING MIDNIGHT SPLITS) ---

  public async recordTimerSession(
    timerId: TimerId,
    timerName: string,
    startMs: number,
    endMs: number
  ): Promise<void> {
    if (endMs <= startMs) return;

    // Split across midnight
    const slices = splitDurationAcrossMidnight(startMs, endMs);

    for (const slice of slices) {
      const session: TimerSession = {
        id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        timerId,
        timerName,
        dateStr: slice.dateStr,
        startMs,
        endMs,
        durationMs: slice.durationMs,
      };

      if (this.isNative && this.db) {
        await this.db.run(
          `INSERT INTO timer_sessions 
           (id, timer_id, timer_name, date_str, start_ms, end_ms, duration_ms) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            session.id,
            session.timerId,
            session.timerName,
            session.dateStr,
            session.startMs,
            session.endMs,
            session.durationMs,
          ]
        );
      } else {
        const sessions = await this.getAllSessions();
        sessions.push(session);
        localStorage.setItem(
          this.webStorageKeyPrefix + 'timer_sessions',
          JSON.stringify(sessions)
        );
      }
    }
  }

  public async getSessionsForDate(dateStr: string): Promise<TimerSession[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_sessions WHERE date_str = ? ORDER BY start_ms ASC',
        [dateStr]
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          timerId: r.timer_id as TimerId,
          timerName: r.timer_name,
          dateStr: r.date_str,
          startMs: Number(r.start_ms),
          endMs: Number(r.end_ms),
          durationMs: Number(r.duration_ms),
        }));
      }
      return [];
    } else {
      const all = await this.getAllSessions();
      return all.filter((s) => s.dateStr === dateStr);
    }
  }

  public async getAllSessions(): Promise<TimerSession[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_sessions ORDER BY start_ms ASC'
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          timerId: r.timer_id as TimerId,
          timerName: r.timer_name,
          dateStr: r.date_str,
          startMs: Number(r.start_ms),
          endMs: Number(r.end_ms),
          durationMs: Number(r.duration_ms),
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'timer_sessions');
      return data ? JSON.parse(data) : [];
    }
  }

  // --- EXPENSES ---

  public async saveExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    const fullExpense: Expense = {
      ...expense,
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    };

    if (this.isNative && this.db) {
      await this.db.run(
        `INSERT INTO expenses 
         (id, date_str, time_str, timestamp_ms, amount, reason, category) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fullExpense.id,
          fullExpense.dateStr,
          fullExpense.timeStr,
          fullExpense.timestampMs,
          fullExpense.amount,
          fullExpense.reason,
          fullExpense.category ?? 'General',
        ]
      );
    } else {
      const expenses = await this.getAllExpenses();
      expenses.push(fullExpense);
      localStorage.setItem(
        this.webStorageKeyPrefix + 'expenses',
        JSON.stringify(expenses)
      );
    }

    return fullExpense;
  }

  public async updateExpense(expense: Expense): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.run(
        `UPDATE expenses 
         SET date_str = ?, time_str = ?, timestamp_ms = ?, amount = ?, reason = ?, category = ? 
         WHERE id = ?`,
        [
          expense.dateStr,
          expense.timeStr,
          expense.timestampMs,
          expense.amount,
          expense.reason,
          expense.category ?? 'General',
          expense.id,
        ]
      );
    } else {
      const expenses = await this.getAllExpenses();
      const idx = expenses.findIndex((e) => e.id === expense.id);
      if (idx !== -1) {
        expenses[idx] = expense;
        localStorage.setItem(
          this.webStorageKeyPrefix + 'expenses',
          JSON.stringify(expenses)
        );
      }
    }
  }

  public async deleteExpense(id: string): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.run('DELETE FROM expenses WHERE id = ?', [id]);
    } else {
      const expenses = await this.getAllExpenses();
      const filtered = expenses.filter((e) => e.id !== id);
      localStorage.setItem(
        this.webStorageKeyPrefix + 'expenses',
        JSON.stringify(filtered)
      );
    }
  }

  public async getExpensesForDate(dateStr: string): Promise<Expense[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM expenses WHERE date_str = ? ORDER BY timestamp_ms ASC',
        [dateStr]
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          dateStr: r.date_str,
          timeStr: r.time_str,
          timestampMs: Number(r.timestamp_ms),
          amount: Number(r.amount),
          reason: r.reason,
          category: r.category,
        }));
      }
      return [];
    } else {
      const all = await this.getAllExpenses();
      return all.filter((e) => e.dateStr === dateStr).sort((a, b) => a.timestampMs - b.timestampMs);
    }
  }

  public async getAllExpenses(): Promise<Expense[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM expenses ORDER BY timestamp_ms ASC'
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          dateStr: r.date_str,
          timeStr: r.time_str,
          timestampMs: Number(r.timestamp_ms),
          amount: Number(r.amount),
          reason: r.reason,
          category: r.category,
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'expenses');
      return data ? JSON.parse(data) : [];
    }
  }

  // --- DAILY SUMMARY CALCULATION ---

  public async getDailySummary(dateStr: string): Promise<DailySummary> {
    const sessions = await this.getSessionsForDate(dateStr);
    const expenses = await this.getExpensesForDate(dateStr);

    let dayAnalysisMs = 0;
    let busWaitingMs = 0;
    let busTravelMs = 0;

    for (const s of sessions) {
      if (s.timerId === 'day_analysis') dayAnalysisMs += s.durationMs;
      else if (s.timerId === 'bus_waiting') busWaitingMs += s.durationMs;
      else if (s.timerId === 'bus_travel') busTravelMs += s.durationMs;
    }

    // Also include live running timer for today if dateStr is today!
    const todayStr = formatDate();
    if (dateStr === todayStr) {
      const activeStates = await this.getAllTimerActiveStates();
      for (const t of ['day_analysis', 'bus_waiting', 'bus_travel'] as TimerId[]) {
        const state = activeStates[t];
        let liveExtra = state.accumulatedDurationMs;
        if (state.status === 'RUNNING' && state.sessionStartTimeMs) {
          liveExtra += Math.max(0, Date.now() - state.sessionStartTimeMs);
        }
        if (t === 'day_analysis') dayAnalysisMs = Math.max(dayAnalysisMs, liveExtra);
        else if (t === 'bus_waiting') busWaitingMs = Math.max(busWaitingMs, liveExtra);
        else if (t === 'bus_travel') busTravelMs = Math.max(busTravelMs, liveExtra);
      }
    }

    const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);

    return {
      dateStr,
      dayAnalysisMs,
      busWaitingMs,
      busTravelMs,
      totalExpense,
    };
  }

  public async getAllDistinctDates(): Promise<string[]> {
    const dateSet = new Set<string>();
    dateSet.add(formatDate());

    const sessions = await this.getAllSessions();
    sessions.forEach((s) => dateSet.add(s.dateStr));

    const events = await this.getAllEvents();
    events.forEach((e) => dateSet.add(e.dateStr));

    const expenses = await this.getAllExpenses();
    expenses.forEach((e) => dateSet.add(e.dateStr));

    return Array.from(dateSet);
  }

  // --- APP SETTINGS ---

  public async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    if (this.isNative && this.db) {
      const res = await this.db.query('SELECT value FROM app_settings WHERE key = ?', [key]);
      if (res.values && res.values.length > 0) {
        return res.values[0].value;
      }
      return defaultValue;
    } else {
      const val = localStorage.getItem(this.webStorageKeyPrefix + 'setting_' + key);
      return val !== null ? val : defaultValue;
    }
  }

  public async setSetting(key: string, value: string): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.run(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    } else {
      localStorage.setItem(this.webStorageKeyPrefix + 'setting_' + key, value);
    }
  }

  // --- BACKUP & RESTORE ---

  public async exportBackupJson(): Promise<string> {
    const backup = {
      version: SCHEMA_VERSION,
      exportedAt: Date.now(),
      dateStr: formatDate(),
      timerActiveStates: await this.getAllTimerActiveStates(),
      timerEvents: await this.getAllEvents(),
      timerSessions: await this.getAllSessions(),
      expenses: await this.getAllExpenses(),
    };
    return JSON.stringify(backup, null, 2);
  }

  public async restoreBackupJson(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;

      if (data.timerActiveStates) {
        for (const t of Object.keys(data.timerActiveStates) as TimerId[]) {
          await this.saveTimerActiveState(data.timerActiveStates[t]);
        }
      }

      if (Array.isArray(data.timerEvents)) {
        for (const ev of data.timerEvents) {
          await this.logTimerEvent(ev);
        }
      }

      if (Array.isArray(data.timerSessions)) {
        for (const s of data.timerSessions) {
          if (this.isNative && this.db) {
            await this.db.run(
              `INSERT OR REPLACE INTO timer_sessions 
               (id, timer_id, timer_name, date_str, start_ms, end_ms, duration_ms) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [s.id, s.timerId, s.timerName, s.dateStr, s.startMs, s.endMs, s.durationMs]
            );
          } else {
            const sessions = await this.getAllSessions();
            if (!sessions.some((ex) => ex.id === s.id)) {
              sessions.push(s);
              localStorage.setItem(
                this.webStorageKeyPrefix + 'timer_sessions',
                JSON.stringify(sessions)
              );
            }
          }
        }
      }

      if (Array.isArray(data.expenses)) {
        for (const exp of data.expenses) {
          await this.saveExpense(exp);
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return false;
    }
  }

  // Purge all legacy sample mock data so user has an entirely clean slate
  public async purgeMockSeedData(): Promise<void> {
    const mockReasons = [
      'Morning Metro Bus Ticket',
      'Project Lunch Meeting',
      'Hardware Supplies & Return',
    ];
    const mockNotes = [
      'Focus Sprint Initialized',
      'Platform Terminal 4',
      'Interval: 00:45',
    ];

    if (this.isNative && this.db) {
      try {
        const placeholders = mockReasons.map(() => '?').join(',');
        await this.db.run(
          `DELETE FROM expenses WHERE reason IN (${placeholders}) OR amount IN (120, 450, 880)`,
          mockReasons
        );

        const notePlaceholders = mockNotes.map(() => '?').join(',');
        await this.db.run(
          `DELETE FROM timer_events WHERE note IN (${notePlaceholders})`,
          mockNotes
        );

        await this.db.run(
          `DELETE FROM timer_sessions WHERE (timer_id = 'bus_waiting' AND duration_ms = 2700000) OR (timer_id = 'bus_travel' AND duration_ms = 5400000)`
        );
      } catch (err) {
        console.error('Failed to purge mock seed data from native SQLite:', err);
      }
    }

    // Also clean web localStorage fallback
    try {
      const expKey = this.webStorageKeyPrefix + 'expenses';
      const storedExp = localStorage.getItem(expKey);
      if (storedExp) {
        const expenses: Expense[] = JSON.parse(storedExp);
        const filtered = expenses.filter(
          (e) => !mockReasons.includes(e.reason) && ![120, 450, 880].includes(e.amount)
        );
        localStorage.setItem(expKey, JSON.stringify(filtered));
      }

      const evtKey = this.webStorageKeyPrefix + 'timer_events';
      const storedEvt = localStorage.getItem(evtKey);
      if (storedEvt) {
        const events: TimerEvent[] = JSON.parse(storedEvt);
        const filtered = events.filter((e) => !mockNotes.includes(e.note || ''));
        localStorage.setItem(evtKey, JSON.stringify(filtered));
      }

      const sessKey = this.webStorageKeyPrefix + 'timer_sessions';
      const storedSess = localStorage.getItem(sessKey);
      if (storedSess) {
        const sessions: TimerSession[] = JSON.parse(storedSess);
        const filtered = sessions.filter(
          (s) =>
            !(s.timerId === 'bus_waiting' && s.durationMs === 2700000) &&
            !(s.timerId === 'bus_travel' && s.durationMs === 5400000)
        );
        localStorage.setItem(sessKey, JSON.stringify(filtered));
      }
    } catch (e) {
      console.error('Failed to purge mock seed data from web storage:', e);
    }
  }

  // Completely wipe all database tables to erase everything
  public async clearAllData(): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run('DELETE FROM expenses');
        await this.db.run('DELETE FROM timer_events');
        await this.db.run('DELETE FROM timer_sessions');
        await this.db.run(`
          UPDATE timer_active_state
          SET status = 'IDLE', session_start_ms = NULL, accumulated_ms = 0, last_updated_ms = ?
        `, [Date.now()]);
      } catch (err) {
        console.error('Failed to clear all data in SQLite:', err);
      }
    }

    try {
      localStorage.removeItem(this.webStorageKeyPrefix + 'expenses');
      localStorage.removeItem(this.webStorageKeyPrefix + 'timer_events');
      localStorage.removeItem(this.webStorageKeyPrefix + 'timer_sessions');
      for (const timerId of ['day_analysis', 'bus_waiting', 'bus_travel'] as TimerId[]) {
        localStorage.setItem(
          this.webStorageKeyPrefix + 'active_state_' + timerId,
          JSON.stringify({
            timerId,
            status: 'IDLE',
            sessionStartTimeMs: null,
            accumulatedDurationMs: 0,
            lastUpdatedMs: Date.now(),
          })
        );
      }
    } catch (e) {
      console.error('Failed to clear all data in localStorage:', e);
    }
  }

  // Deprecated seeder - now purely no-op to ensure expenses start at ₹0
  public async seedInitialDataIfEmpty(): Promise<void> {
    return;
  }
}

export const dbService = new DatabaseService();
