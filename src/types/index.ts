export type TimerId = 'day_analysis' | 'bus_waiting' | 'bus_travel';

export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

export type EventType = 'START' | 'PAUSE' | 'RESUME' | 'STOP';

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
}

export interface Expense {
  id: string;
  dateStr: string; // DD-MM-YYYY
  timeStr: string; // HH:MM
  timestampMs: number;
  amount: number;
  reason: string;
  category?: string;
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
