export type TimerId = 'day_analysis' | 'bus_waiting' | 'bus_travel';

export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

export type EventType = 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'REGULARIZE';

export type PaymentMethod = 'UPI' | 'WALLET';

export interface TimerConfig {
  id: TimerId;
  name: string;
  theme: 'gold' | 'purple';
  primaryColor: string;
  secondaryColor: string;
  targetHours: number; // for dial progress percentage
}

export interface TimerActiveState {
  timerId: TimerId;
  status: TimerStatus;
  sessionStartTimeMs: number | null; // null if IDLE or PAUSED
  accumulatedDurationMs: number;
  lastUpdatedMs: number;
}

export interface TimerEvent {
  id: string;
  timerId: TimerId;
  timerName: string;
  eventType: EventType;
  timestampMs: number;
  dateStr: string; // DD-MM-YYYY
  timeStr: string; // HH:MM
  durationMs?: number;
  note?: string;
}

export interface TimerSession {
  id: string;
  timerId: TimerId;
  timerName: string;
  dateStr: string; // DD-MM-YYYY
  startMs: number;
  endMs: number;
  durationMs: number;
  isRegularized?: boolean;
  regularizationReason?: string;
}

export interface TimerRegularization {
  id: string;
  sessionId?: string;
  timerId: TimerId;
  timerName: string;
  originalDateStr?: string;
  originalStartMs?: number;
  originalEndMs?: number;
  originalDurationMs?: number;
  regularizedDateStr: string;
  regularizedStartMs: number;
  regularizedEndMs: number;
  regularizedDurationMs: number;
  reason: string;
  createdAtMs: number;
}

export interface Expense {
  id: string;
  dateStr: string; // DD-MM-YYYY
  timeStr: string; // HH:MM
  timestampMs: number;
  amount: number;
  reason: string;
  category?: string;
  paymentMethod: PaymentMethod;
}

export interface AccountBalances {
  upi: number;
  wallet: number;
}

export interface BalanceTransaction {
  id: string;
  accountType: PaymentMethod;
  transactionType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  amount: number;
  dateStr: string; // DD-MM-YYYY
  timeStr: string; // HH:MM
  timestampMs: number;
  referenceId?: string;
  note?: string;
}

export interface DailySummary {
  dateStr: string; // DD-MM-YYYY
  dayAnalysisMs: number;
  busWaitingMs: number;
  busTravelMs: number;
  totalExpense: number;
}

export interface GitHubReleaseInfo {
  tagName: string;
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  assetSize: number;
  sha256?: string;
}
