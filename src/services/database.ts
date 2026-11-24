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
  TimerRegularization,
  Expense,
  DailySummary,
  TimerId,
  PaymentMethod,
  AccountBalances,
  BalanceTransaction,
} from '../types';
import { formatDate, formatTime, formatDuration, splitDurationAcrossMidnight } from '../utils/time';

const DB_NAME = 'aura_tracker_db';
const SCHEMA_VERSION = 2;

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
    // Purge any legacy sample/mock seed data
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
        duration_ms INTEGER NOT NULL,
        is_regularized INTEGER DEFAULT 0,
        regularization_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        category TEXT,
        payment_method TEXT NOT NULL DEFAULT 'UPI'
      );

      CREATE TABLE IF NOT EXISTS account_balances (
        id TEXT PRIMARY KEY,
        balance REAL NOT NULL DEFAULT 0,
        last_updated_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS balance_transactions (
        id TEXT PRIMARY KEY,
        account_type TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        reference_id TEXT,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS timer_regularizations (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        timer_id TEXT NOT NULL,
        timer_name TEXT NOT NULL,
        original_date_str TEXT,
        original_start_ms INTEGER,
        original_end_ms INTEGER,
        original_duration_ms INTEGER,
        regularized_date_str TEXT NOT NULL,
        regularized_start_ms INTEGER NOT NULL,
        regularized_end_ms INTEGER NOT NULL,
        regularized_duration_ms INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_date ON timer_events (date_str);
      CREATE INDEX IF NOT EXISTS idx_sessions_date ON timer_sessions (date_str);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date_str);
      CREATE INDEX IF NOT EXISTS idx_bal_tx_date ON balance_transactions (date_str);
      CREATE INDEX IF NOT EXISTS idx_regularizations_date ON timer_regularizations (regularized_date_str);
    `;

    await this.db.execute(createTablesSQL);

    // Safe ALTER TABLE for existing databases
    try {
      await this.db.execute("ALTER TABLE expenses ADD COLUMN payment_method TEXT DEFAULT 'UPI'");
    } catch {
      // Column already exists
    }
    try {
      await this.db.execute("ALTER TABLE timer_sessions ADD COLUMN is_regularized INTEGER DEFAULT 0");
    } catch {
      // Column already exists
    }
    try {
      await this.db.execute("ALTER TABLE timer_sessions ADD COLUMN regularization_reason TEXT");
    } catch {
      // Column already exists
    }

    // Default account balances if not already present
    const now = Date.now();
    await this.db.run(
      'INSERT OR IGNORE INTO account_balances (id, balance, last_updated_ms) VALUES (?, ?, ?)',
      ['upi', 0, now]
    );
    await this.db.run(
      'INSERT OR IGNORE INTO account_balances (id, balance, last_updated_ms) VALUES (?, ?, ?)',
      ['wallet', 0, now]
    );

    await this.db.run(
      'INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [SCHEMA_VERSION, now]
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

    const balancesKey = this.webStorageKeyPrefix + 'account_balances';
    if (!localStorage.getItem(balancesKey)) {
      localStorage.setItem(balancesKey, JSON.stringify({ upi: 0, wallet: 0 }));
    }

    const txKey = this.webStorageKeyPrefix + 'balance_transactions';
    if (!localStorage.getItem(txKey)) {
      localStorage.setItem(txKey, JSON.stringify([]));
    }

    const regKey = this.webStorageKeyPrefix + 'timer_regularizations';
    if (!localStorage.getItem(regKey)) {
      localStorage.setItem(regKey, JSON.stringify([]));
    }

    // Backfill paymentMethod on existing expenses in web storage
    const expKey = this.webStorageKeyPrefix + 'expenses';
    const storedExp = localStorage.getItem(expKey);
    if (storedExp) {
      try {
        const expenses: Expense[] = JSON.parse(storedExp);
        let modified = false;
        expenses.forEach((e) => {
          if (!e.paymentMethod) {
            e.paymentMethod = 'UPI';
            modified = true;
          }
        });
        if (modified) {
          localStorage.setItem(expKey, JSON.stringify(expenses));
        }
      } catch {
        // ignore
      }
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
          state.lastUpdatedMs,
        ]
      );
    } else {
      const key = `${this.webStorageKeyPrefix}timer_state_${state.timerId}`;
      localStorage.setItem(key, JSON.stringify(state));
    }
  }

  // --- TIMER EVENTS ---

  public async logTimerEvent(event: Omit<TimerEvent, 'id'> & { id?: string }): Promise<void> {
    const eventId = event.id ?? 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    if (this.isNative && this.db) {
      await this.db.run(
        `INSERT INTO timer_events 
         (id, timer_id, timer_name, event_type, timestamp_ms, date_str, time_str, duration_ms, note) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          event.timerId,
          event.timerName,
          event.eventType,
          event.timestampMs,
          event.dateStr,
          event.timeStr,
          event.durationMs ?? null,
          event.note ?? null,
        ]
      );
    } else {
      const events = await this.getAllEvents();
      events.push({ ...event, id: eventId });
      localStorage.setItem(
        this.webStorageKeyPrefix + 'timer_events',
        JSON.stringify(events)
      );
    }
  }

  public async getEventsForDate(dateStr: string): Promise<TimerEvent[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_events WHERE date_str = ? ORDER BY timestamp_ms DESC',
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
          durationMs: r.duration_ms !== null ? Number(r.duration_ms) : undefined,
          note: r.note,
        }));
      }
      return [];
    } else {
      const all = await this.getAllEvents();
      return all.filter((e) => e.dateStr === dateStr).sort((a, b) => b.timestampMs - a.timestampMs);
    }
  }

  public async getAllEvents(): Promise<TimerEvent[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_events ORDER BY timestamp_ms DESC'
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
          durationMs: r.duration_ms !== null ? Number(r.duration_ms) : undefined,
          note: r.note,
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'timer_events');
      return data ? JSON.parse(data) : [];
    }
  }

  // --- TIMER SESSIONS ---

  public async recordTimerSession(
    timerId: TimerId,
    timerName: string,
    startMs: number,
    endMs: number
  ): Promise<void> {
    const slices = splitDurationAcrossMidnight(startMs, endMs);
    for (const slice of slices) {
      if (slice.durationMs <= 0) continue;
      const sessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      if (this.isNative && this.db) {
        await this.db.run(
          `INSERT INTO timer_sessions 
           (id, timer_id, timer_name, date_str, start_ms, end_ms, duration_ms, is_regularized, regularization_reason) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
          [sessionId, timerId, timerName, slice.dateStr, startMs, endMs, slice.durationMs]
        );
      } else {
        const sessions = await this.getAllSessions();
        sessions.push({
          id: sessionId,
          timerId,
          timerName,
          dateStr: slice.dateStr,
          startMs,
          endMs,
          durationMs: slice.durationMs,
          isRegularized: false,
        });
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
          isRegularized: Boolean(r.is_regularized),
          regularizationReason: r.regularization_reason || undefined,
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
          isRegularized: Boolean(r.is_regularized),
          regularizationReason: r.regularization_reason || undefined,
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'timer_sessions');
      return data ? JSON.parse(data) : [];
    }
  }

  // --- REGULARIZATION ---

  public async regularizeTimerSession(params: {
    sessionId?: string;
    timerId: TimerId;
    timerName: string;
    regularizedDateStr: string;
    regularizedStartMs: number;
    regularizedEndMs: number;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (params.regularizedEndMs <= params.regularizedStartMs) {
      return { success: false, error: 'End time must be strictly after start time.' };
    }
    if (!params.reason.trim()) {
      return { success: false, error: 'Reason for regularization is required.' };
    }

    const regularizedDurationMs = params.regularizedEndMs - params.regularizedStartMs;
    const regId = 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const now = Date.now();

    let originalSession: TimerSession | null = null;
    if (params.sessionId) {
      const allSessions = await this.getAllSessions();
      originalSession = allSessions.find((s) => s.id === params.sessionId) || null;
    }

    const regRecord: TimerRegularization = {
      id: regId,
      sessionId: params.sessionId,
      timerId: params.timerId,
      timerName: params.timerName,
      originalDateStr: originalSession?.dateStr,
      originalStartMs: originalSession?.startMs,
      originalEndMs: originalSession?.endMs,
      originalDurationMs: originalSession?.durationMs,
      regularizedDateStr: params.regularizedDateStr,
      regularizedStartMs: params.regularizedStartMs,
      regularizedEndMs: params.regularizedEndMs,
      regularizedDurationMs,
      reason: params.reason.trim(),
      createdAtMs: now,
    };

    if (this.isNative && this.db) {
      try {
        // Save audit trail
        await this.db.run(
          `INSERT INTO timer_regularizations 
           (id, session_id, timer_id, timer_name, original_date_str, original_start_ms, original_end_ms, original_duration_ms, regularized_date_str, regularized_start_ms, regularized_end_ms, regularized_duration_ms, reason, created_at_ms) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            regRecord.id,
            regRecord.sessionId ?? null,
            regRecord.timerId,
            regRecord.timerName,
            regRecord.originalDateStr ?? null,
            regRecord.originalStartMs ?? null,
            regRecord.originalEndMs ?? null,
            regRecord.originalDurationMs ?? null,
            regRecord.regularizedDateStr,
            regRecord.regularizedStartMs,
            regRecord.regularizedEndMs,
            regRecord.regularizedDurationMs,
            regRecord.reason,
            regRecord.createdAtMs,
          ]
        );

        if (params.sessionId) {
          // Update existing session
          await this.db.run(
            `UPDATE timer_sessions 
             SET date_str = ?, start_ms = ?, end_ms = ?, duration_ms = ?, is_regularized = 1, regularization_reason = ? 
             WHERE id = ?`,
            [
              params.regularizedDateStr,
              params.regularizedStartMs,
              params.regularizedEndMs,
              regularizedDurationMs,
              params.reason.trim(),
              params.sessionId,
            ]
          );
        } else {
          // Insert new regularized session
          const newSessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          await this.db.run(
            `INSERT INTO timer_sessions 
             (id, timer_id, timer_name, date_str, start_ms, end_ms, duration_ms, is_regularized, regularization_reason) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              newSessionId,
              params.timerId,
              params.timerName,
              params.regularizedDateStr,
              params.regularizedStartMs,
              params.regularizedEndMs,
              regularizedDurationMs,
              params.reason.trim(),
            ]
          );
        }

        // Add audit trail event to activity log
        const eventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        await this.db.run(
          `INSERT INTO timer_events 
           (id, timer_id, timer_name, event_type, timestamp_ms, date_str, time_str, duration_ms, note) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventId,
            params.timerId,
            params.timerName,
            'REGULARIZE',
            now,
            params.regularizedDateStr,
            formatTime(params.regularizedStartMs),
            regularizedDurationMs,
            `Regularized: ${params.reason.trim()} (${formatDuration(regularizedDurationMs, true)})`,
          ]
        );

      } catch (err) {
        console.error('Failed to regularize session:', err);
        return { success: false, error: (err as Error).message };
      }
    } else {
      // Web fallback
      const regList = await this.getAllRegularizations();
      regList.push(regRecord);
      localStorage.setItem(this.webStorageKeyPrefix + 'timer_regularizations', JSON.stringify(regList));

      const sessions = await this.getAllSessions();
      if (params.sessionId) {
        const idx = sessions.findIndex((s) => s.id === params.sessionId);
        if (idx !== -1) {
          sessions[idx] = {
            ...sessions[idx],
            dateStr: params.regularizedDateStr,
            startMs: params.regularizedStartMs,
            endMs: params.regularizedEndMs,
            durationMs: regularizedDurationMs,
            isRegularized: true,
            regularizationReason: params.reason.trim(),
          };
        }
      } else {
        sessions.push({
          id: 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          timerId: params.timerId,
          timerName: params.timerName,
          dateStr: params.regularizedDateStr,
          startMs: params.regularizedStartMs,
          endMs: params.regularizedEndMs,
          durationMs: regularizedDurationMs,
          isRegularized: true,
          regularizationReason: params.reason.trim(),
        });
      }
      localStorage.setItem(this.webStorageKeyPrefix + 'timer_sessions', JSON.stringify(sessions));

      await this.logTimerEvent({
        timerId: params.timerId,
        timerName: params.timerName,
        eventType: 'REGULARIZE',
        timestampMs: now,
        dateStr: params.regularizedDateStr,
        timeStr: formatTime(params.regularizedStartMs),
        durationMs: regularizedDurationMs,
        note: `Regularized: ${params.reason.trim()} (${formatDuration(regularizedDurationMs, true)})`,
      });
    }

    return { success: true };
  }

  public async getAllRegularizations(): Promise<TimerRegularization[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM timer_regularizations ORDER BY created_at_ms DESC'
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          sessionId: r.session_id,
          timerId: r.timer_id as TimerId,
          timerName: r.timer_name,
          originalDateStr: r.original_date_str,
          originalStartMs: r.original_start_ms !== null ? Number(r.original_start_ms) : undefined,
          originalEndMs: r.original_end_ms !== null ? Number(r.original_end_ms) : undefined,
          originalDurationMs: r.original_duration_ms !== null ? Number(r.original_duration_ms) : undefined,
          regularizedDateStr: r.regularized_date_str,
          regularizedStartMs: Number(r.regularized_start_ms),
          regularizedEndMs: Number(r.regularized_end_ms),
          regularizedDurationMs: Number(r.regularized_duration_ms),
          reason: r.reason,
          createdAtMs: Number(r.created_at_ms),
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'timer_regularizations');
      return data ? JSON.parse(data) : [];
    }
  }

  public async getRegularizationsForDate(dateStr: string): Promise<TimerRegularization[]> {
    const all = await this.getAllRegularizations();
    return all.filter((r) => r.regularizedDateStr === dateStr);
  }

  // --- ACCOUNT BALANCES & TRANSACTIONS ---

  public async getAccountBalances(): Promise<AccountBalances> {
    if (this.isNative && this.db) {
      const res = await this.db.query('SELECT id, balance FROM account_balances');
      let upi = 0;
      let wallet = 0;
      if (res.values) {
        for (const row of res.values) {
          if (row.id === 'upi') upi = Number(row.balance);
          if (row.id === 'wallet') wallet = Number(row.balance);
        }
      }
      return { upi, wallet };
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'account_balances');
      return data ? JSON.parse(data) : { upi: 0, wallet: 0 };
    }
  }

  public async addAccountBalance(
    accountType: PaymentMethod,
    amount: number,
    note?: string
  ): Promise<{ success: boolean; balances?: AccountBalances; error?: string }> {
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero.' };
    }

    const accId = accountType.toLowerCase();
    const now = Date.now();
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);
    const txId = 'tx_' + now + '_' + Math.random().toString(36).substr(2, 6);

    if (this.isNative && this.db) {
      try {
        await this.db.run(
          `UPDATE account_balances 
           SET balance = balance + ?, last_updated_ms = ? 
           WHERE id = ?`,
          [amount, now, accId]
        );

        await this.db.run(
          `INSERT INTO balance_transactions 
           (id, account_type, transaction_type, amount, date_str, time_str, timestamp_ms, reference_id, note) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          [txId, accountType, 'CREDIT', amount, dateStr, timeStr, now, note?.trim() || 'Manual Balance Addition']
        );

        const balances = await this.getAccountBalances();
        return { success: true, balances };
      } catch (err) {
        console.error('Failed to add balance:', err);
        return { success: false, error: (err as Error).message };
      }
    } else {
      const balances = await this.getAccountBalances();
      if (accountType === 'UPI') balances.upi += amount;
      else balances.wallet += amount;

      localStorage.setItem(this.webStorageKeyPrefix + 'account_balances', JSON.stringify(balances));

      const txList = await this.getAllBalanceTransactions();
      txList.push({
        id: txId,
        accountType,
        transactionType: 'CREDIT',
        amount,
        dateStr,
        timeStr,
        timestampMs: now,
        note: note?.trim() || 'Manual Balance Addition',
      });
      localStorage.setItem(this.webStorageKeyPrefix + 'balance_transactions', JSON.stringify(txList));

      return { success: true, balances };
    }
  }

  public async getAllBalanceTransactions(): Promise<BalanceTransaction[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM balance_transactions ORDER BY timestamp_ms DESC'
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          accountType: r.account_type as PaymentMethod,
          transactionType: r.transaction_type as 'CREDIT' | 'DEBIT' | 'REVERSAL',
          amount: Number(r.amount),
          dateStr: r.date_str,
          timeStr: r.time_str,
          timestampMs: Number(r.timestamp_ms),
          referenceId: r.reference_id,
          note: r.note,
        }));
      }
      return [];
    } else {
      const data = localStorage.getItem(this.webStorageKeyPrefix + 'balance_transactions');
      return data ? JSON.parse(data) : [];
    }
  }

  public async getBalanceTransactionsForDate(dateStr: string): Promise<BalanceTransaction[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM balance_transactions WHERE date_str = ? ORDER BY timestamp_ms DESC',
        [dateStr]
      );
      if (res.values) {
        return res.values.map((r) => ({
          id: r.id,
          accountType: r.account_type as PaymentMethod,
          transactionType: r.transaction_type as 'CREDIT' | 'DEBIT' | 'REVERSAL',
          amount: Number(r.amount),
          dateStr: r.date_str,
          timeStr: r.time_str,
          timestampMs: Number(r.timestamp_ms),
          referenceId: r.reference_id,
          note: r.note,
        }));
      }
      return [];
    } else {
      const all = await this.getAllBalanceTransactions();
      return all.filter((tx) => tx.dateStr === dateStr).sort((a, b) => b.timestampMs - a.timestampMs);
    }
  }

  // --- EXPENSES WITH ATOMIC BALANCE INTEGRATION ---

  public async saveExpense(
    expense: Omit<Expense, 'id'>
  ): Promise<{ success: boolean; expense?: Expense; error?: string }> {
    const balances = await this.getAccountBalances();
    const method = expense.paymentMethod || 'UPI';
    const accId = method.toLowerCase();
    const available = method === 'UPI' ? balances.upi : balances.wallet;

    if (expense.amount > available) {
      return {
        success: false,
        error: `Insufficient ${method} balance. (Available: ₹${available.toLocaleString('en-IN')}, Required: ₹${expense.amount.toLocaleString('en-IN')})`,
      };
    }

    const fullExpense: Expense = {
      ...expense,
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      paymentMethod: method,
    };
    const now = fullExpense.timestampMs;
    const txId = 'tx_' + now + '_' + Math.random().toString(36).substr(2, 6);

    if (this.isNative && this.db) {
      try {
        // 1. Deduct balance
        await this.db.run(
          `UPDATE account_balances 
           SET balance = balance - ?, last_updated_ms = ? 
           WHERE id = ?`,
          [fullExpense.amount, now, accId]
        );

        // 2. Record balance transaction
        await this.db.run(
          `INSERT INTO balance_transactions 
           (id, account_type, transaction_type, amount, date_str, time_str, timestamp_ms, reference_id, note) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            txId,
            method,
            'DEBIT',
            fullExpense.amount,
            fullExpense.dateStr,
            fullExpense.timeStr,
            now,
            fullExpense.id,
            `Expense: ${fullExpense.reason}`,
          ]
        );

        // 3. Save expense
        await this.db.run(
          `INSERT INTO expenses 
           (id, date_str, time_str, timestamp_ms, amount, reason, category, payment_method) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fullExpense.id,
            fullExpense.dateStr,
            fullExpense.timeStr,
            fullExpense.timestampMs,
            fullExpense.amount,
            fullExpense.reason,
            fullExpense.category ?? 'General',
            method,
          ]
        );

        return { success: true, expense: fullExpense };
      } catch (err) {
        console.error('Failed to save expense with balance deduction:', err);
        return { success: false, error: (err as Error).message };
      }
    } else {
      // Web fallback
      if (method === 'UPI') balances.upi -= fullExpense.amount;
      else balances.wallet -= fullExpense.amount;
      localStorage.setItem(this.webStorageKeyPrefix + 'account_balances', JSON.stringify(balances));

      const txList = await this.getAllBalanceTransactions();
      txList.push({
        id: txId,
        accountType: method,
        transactionType: 'DEBIT',
        amount: fullExpense.amount,
        dateStr: fullExpense.dateStr,
        timeStr: fullExpense.timeStr,
        timestampMs: now,
        referenceId: fullExpense.id,
        note: `Expense: ${fullExpense.reason}`,
      });
      localStorage.setItem(this.webStorageKeyPrefix + 'balance_transactions', JSON.stringify(txList));

      const expenses = await this.getAllExpenses();
      expenses.push(fullExpense);
      localStorage.setItem(this.webStorageKeyPrefix + 'expenses', JSON.stringify(expenses));

      return { success: true, expense: fullExpense };
    }
  }

  public async updateExpense(
    updatedExpense: Expense
  ): Promise<{ success: boolean; error?: string }> {
    const allExpenses = await this.getAllExpenses();
    const existing = allExpenses.find((e) => e.id === updatedExpense.id);
    if (!existing) {
      return { success: false, error: 'Expense record not found.' };
    }

    const currentBalances = await this.getAccountBalances();
    const oldMethod = existing.paymentMethod || 'UPI';
    const newMethod = updatedExpense.paymentMethod || 'UPI';
    const now = Date.now();

    // Check balance validity
    if (oldMethod === newMethod) {
      const netDeduction = updatedExpense.amount - existing.amount;
      const currentAvailable = oldMethod === 'UPI' ? currentBalances.upi : currentBalances.wallet;
      if (netDeduction > currentAvailable) {
        return {
          success: false,
          error: `Insufficient ${newMethod} balance for increased amount. (Available: ₹${currentAvailable.toLocaleString('en-IN')}, Extra needed: ₹${netDeduction.toLocaleString('en-IN')})`,
        };
      }
    } else {
      // Different payment methods: old source gets refunded, new source gets full deduction
      const newAvailable = newMethod === 'UPI' ? currentBalances.upi : currentBalances.wallet;
      if (updatedExpense.amount > newAvailable) {
        return {
          success: false,
          error: `Insufficient ${newMethod} balance. (Available: ₹${newAvailable.toLocaleString('en-IN')}, Required: ₹${updatedExpense.amount.toLocaleString('en-IN')})`,
        };
      }
    }

    if (this.isNative && this.db) {
      try {
        // 1. Refund old deduction
        await this.db.run(
          `UPDATE account_balances 
           SET balance = balance + ?, last_updated_ms = ? 
           WHERE id = ?`,
          [existing.amount, now, oldMethod.toLowerCase()]
        );

        // 2. Deduct new amount
        await this.db.run(
          `UPDATE account_balances 
           SET balance = balance - ?, last_updated_ms = ? 
           WHERE id = ?`,
          [updatedExpense.amount, now, newMethod.toLowerCase()]
        );

        // 3. Log balance transaction
        const txId = 'tx_' + now + '_' + Math.random().toString(36).substr(2, 6);
        await this.db.run(
          `INSERT INTO balance_transactions 
           (id, account_type, transaction_type, amount, date_str, time_str, timestamp_ms, reference_id, note) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            txId,
            newMethod,
            'DEBIT',
            updatedExpense.amount,
            updatedExpense.dateStr,
            updatedExpense.timeStr,
            now,
            updatedExpense.id,
            `Expense Update: ${updatedExpense.reason}`,
          ]
        );

        // 4. Update expenses row
        await this.db.run(
          `UPDATE expenses 
           SET date_str = ?, time_str = ?, timestamp_ms = ?, amount = ?, reason = ?, category = ?, payment_method = ? 
           WHERE id = ?`,
          [
            updatedExpense.dateStr,
            updatedExpense.timeStr,
            updatedExpense.timestampMs,
            updatedExpense.amount,
            updatedExpense.reason,
            updatedExpense.category ?? 'General',
            newMethod,
            updatedExpense.id,
          ]
        );

        return { success: true };
      } catch (err) {
        console.error('Failed to update expense with balance adjustment:', err);
        return { success: false, error: (err as Error).message };
      }
    } else {
      // Web fallback
      if (oldMethod === 'UPI') currentBalances.upi += existing.amount;
      else currentBalances.wallet += existing.amount;

      if (newMethod === 'UPI') currentBalances.upi -= updatedExpense.amount;
      else currentBalances.wallet -= updatedExpense.amount;

      localStorage.setItem(this.webStorageKeyPrefix + 'account_balances', JSON.stringify(currentBalances));

      const txList = await this.getAllBalanceTransactions();
      txList.push({
        id: 'tx_' + now + '_' + Math.random().toString(36).substr(2, 6),
        accountType: newMethod,
        transactionType: 'DEBIT',
        amount: updatedExpense.amount,
        dateStr: updatedExpense.dateStr,
        timeStr: updatedExpense.timeStr,
        timestampMs: now,
        referenceId: updatedExpense.id,
        note: `Expense Update: ${updatedExpense.reason}`,
      });
      localStorage.setItem(this.webStorageKeyPrefix + 'balance_transactions', JSON.stringify(txList));

      const idx = allExpenses.findIndex((e) => e.id === updatedExpense.id);
      if (idx !== -1) {
        allExpenses[idx] = updatedExpense;
        localStorage.setItem(this.webStorageKeyPrefix + 'expenses', JSON.stringify(allExpenses));
      }

      return { success: true };
    }
  }

  public async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    const allExpenses = await this.getAllExpenses();
    const existing = allExpenses.find((e) => e.id === id);
    if (!existing) {
      return { success: false, error: 'Expense not found.' };
    }

    const method = existing.paymentMethod || 'UPI';
    const now = Date.now();
    const txId = 'tx_' + now + '_' + Math.random().toString(36).substr(2, 6);

    if (this.isNative && this.db) {
      try {
        // 1. Refund balance
        await this.db.run(
          `UPDATE account_balances 
           SET balance = balance + ?, last_updated_ms = ? 
           WHERE id = ?`,
          [existing.amount, now, method.toLowerCase()]
        );

        // 2. Log reversal transaction
        await this.db.run(
          `INSERT INTO balance_transactions 
           (id, account_type, transaction_type, amount, date_str, time_str, timestamp_ms, reference_id, note) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            txId,
            method,
            'REVERSAL',
            existing.amount,
            formatDate(now),
            formatTime(now),
            now,
            id,
            `Refund on Deletion: ${existing.reason}`,
          ]
        );

        // 3. Delete from expenses
        await this.db.run('DELETE FROM expenses WHERE id = ?', [id]);

        return { success: true };
      } catch (err) {
        console.error('Failed to delete expense and refund balance:', err);
        return { success: false, error: (err as Error).message };
      }
    } else {
      // Web fallback
      const balances = await this.getAccountBalances();
      if (method === 'UPI') balances.upi += existing.amount;
      else balances.wallet += existing.amount;
      localStorage.setItem(this.webStorageKeyPrefix + 'account_balances', JSON.stringify(balances));

      const txList = await this.getAllBalanceTransactions();
      txList.push({
        id: txId,
        accountType: method,
        transactionType: 'REVERSAL',
        amount: existing.amount,
        dateStr: formatDate(now),
        timeStr: formatTime(now),
        timestampMs: now,
        referenceId: id,
        note: `Refund on Deletion: ${existing.reason}`,
      });
      localStorage.setItem(this.webStorageKeyPrefix + 'balance_transactions', JSON.stringify(txList));

      const filtered = allExpenses.filter((e) => e.id !== id);
      localStorage.setItem(this.webStorageKeyPrefix + 'expenses', JSON.stringify(filtered));

      return { success: true };
    }
  }

  public async getExpensesForDate(dateStr: string): Promise<Expense[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM expenses WHERE date_str = ? ORDER BY timestamp_ms DESC',
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
          paymentMethod: (r.payment_method as PaymentMethod) || 'UPI',
        }));
      }
      return [];
    } else {
      const all = await this.getAllExpenses();
      return all.filter((e) => e.dateStr === dateStr).sort((a, b) => b.timestampMs - a.timestampMs);
    }
  }

  public async getAllExpenses(): Promise<Expense[]> {
    if (this.isNative && this.db) {
      const res = await this.db.query(
        'SELECT * FROM expenses ORDER BY timestamp_ms DESC'
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
          paymentMethod: (r.payment_method as PaymentMethod) || 'UPI',
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
      timerRegularizations: await this.getAllRegularizations(),
      expenses: await this.getAllExpenses(),
      accountBalances: await this.getAccountBalances(),
      balanceTransactions: await this.getAllBalanceTransactions(),
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
               (id, timer_id, timer_name, date_str, start_ms, end_ms, duration_ms, is_regularized, regularization_reason) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                s.id,
                s.timerId,
                s.timerName,
                s.dateStr,
                s.startMs,
                s.endMs,
                s.durationMs,
                s.isRegularized ? 1 : 0,
                s.regularizationReason || null,
              ]
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

      if (Array.isArray(data.timerRegularizations)) {
        for (const reg of data.timerRegularizations) {
          if (this.isNative && this.db) {
            await this.db.run(
              `INSERT OR REPLACE INTO timer_regularizations 
               (id, session_id, timer_id, timer_name, original_date_str, original_start_ms, original_end_ms, original_duration_ms, regularized_date_str, regularized_start_ms, regularized_end_ms, regularized_duration_ms, reason, created_at_ms) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                reg.id,
                reg.sessionId ?? null,
                reg.timerId,
                reg.timerName,
                reg.originalDateStr ?? null,
                reg.originalStartMs ?? null,
                reg.originalEndMs ?? null,
                reg.originalDurationMs ?? null,
                reg.regularizedDateStr,
                reg.regularizedStartMs,
                reg.regularizedEndMs,
                reg.regularizedDurationMs,
                reg.reason,
                reg.createdAtMs,
              ]
            );
          }
        }
        if (!this.isNative) {
          localStorage.setItem(
            this.webStorageKeyPrefix + 'timer_regularizations',
            JSON.stringify(data.timerRegularizations)
          );
        }
      }

      if (Array.isArray(data.expenses)) {
        for (const exp of data.expenses) {
          if (this.isNative && this.db) {
            await this.db.run(
              `INSERT OR REPLACE INTO expenses 
               (id, date_str, time_str, timestamp_ms, amount, reason, category, payment_method) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                exp.id,
                exp.dateStr,
                exp.timeStr,
                exp.timestampMs,
                exp.amount,
                exp.reason,
                exp.category ?? 'General',
                exp.paymentMethod || 'UPI',
              ]
            );
          } else {
            const expenses = await this.getAllExpenses();
            if (!expenses.some((ex) => ex.id === exp.id)) {
              expenses.push(exp);
              localStorage.setItem(
                this.webStorageKeyPrefix + 'expenses',
                JSON.stringify(expenses)
              );
            }
          }
        }
      }

      if (data.accountBalances && typeof data.accountBalances === 'object') {
        const upi = Number(data.accountBalances.upi || 0);
        const wallet = Number(data.accountBalances.wallet || 0);
        const now = Date.now();
        if (this.isNative && this.db) {
          await this.db.run(
            'INSERT OR REPLACE INTO account_balances (id, balance, last_updated_ms) VALUES (?, ?, ?)',
            ['upi', upi, now]
          );
          await this.db.run(
            'INSERT OR REPLACE INTO account_balances (id, balance, last_updated_ms) VALUES (?, ?, ?)',
            ['wallet', wallet, now]
          );
        } else {
          localStorage.setItem(
            this.webStorageKeyPrefix + 'account_balances',
            JSON.stringify({ upi, wallet })
          );
        }
      }

      if (Array.isArray(data.balanceTransactions)) {
        if (this.isNative && this.db) {
          for (const tx of data.balanceTransactions) {
            await this.db.run(
              `INSERT OR REPLACE INTO balance_transactions 
               (id, account_type, transaction_type, amount, date_str, time_str, timestamp_ms, reference_id, note) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                tx.id,
                tx.accountType,
                tx.transactionType,
                tx.amount,
                tx.dateStr,
                tx.timeStr,
                tx.timestampMs,
                tx.referenceId ?? null,
                tx.note ?? null,
              ]
            );
          }
        } else {
          localStorage.setItem(
            this.webStorageKeyPrefix + 'balance_transactions',
            JSON.stringify(data.balanceTransactions)
          );
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
    const now = Date.now();
    if (this.isNative && this.db) {
      try {
        await this.db.run('DELETE FROM expenses');
        await this.db.run('DELETE FROM timer_events');
        await this.db.run('DELETE FROM timer_sessions');
        await this.db.run('DELETE FROM timer_regularizations');
        await this.db.run('DELETE FROM balance_transactions');
        await this.db.run(`
          UPDATE timer_active_state
          SET status = 'IDLE', session_start_ms = NULL, accumulated_ms = 0, last_updated_ms = ?
        `, [now]);
        await this.db.run(
          'UPDATE account_balances SET balance = 0, last_updated_ms = ?',
          [now]
        );
      } catch (err) {
        console.error('Failed to clear all data in SQLite:', err);
      }
    }

    try {
      localStorage.removeItem(this.webStorageKeyPrefix + 'expenses');
      localStorage.removeItem(this.webStorageKeyPrefix + 'timer_events');
      localStorage.removeItem(this.webStorageKeyPrefix + 'timer_sessions');
      localStorage.removeItem(this.webStorageKeyPrefix + 'timer_regularizations');
      localStorage.removeItem(this.webStorageKeyPrefix + 'balance_transactions');
      localStorage.setItem(this.webStorageKeyPrefix + 'account_balances', JSON.stringify({ upi: 0, wallet: 0 }));

      for (const timerId of ['day_analysis', 'bus_waiting', 'bus_travel'] as TimerId[]) {
        localStorage.setItem(
          this.webStorageKeyPrefix + 'active_state_' + timerId,
          JSON.stringify({
            timerId,
            status: 'IDLE',
            sessionStartTimeMs: null,
            accumulatedDurationMs: 0,
            lastUpdatedMs: now,
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
