/**
 * Time and Date formatting utilities for Aura Daily Tracker
 * Respects device local time and timezone.
 * Formats:
 * - Date: DD-MM-YYYY
 * - Time: HH:MM (24-hour format, NO seconds)
 */

export function formatDate(dateInput: Date | number = new Date()): string {
  const d = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatTime(dateInput: Date | number = new Date()): string {
  const d = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  // Never display seconds for event timestamps
  return `${hours}:${minutes}`;
}

/**
 * Format duration in milliseconds for Stopwatches:
 * "HH:MM:SS" (or "HH:MM" when omitSeconds is true)
 */
export function formatDuration(ms: number, omitSeconds: boolean = false): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  if (omitSeconds) {
    return `${hStr}:${mStr}`;
  }
  return `${hStr}:${mStr}:${sStr}`;
}

/**
 * Parse DD-MM-YYYY to Date object
 */
export function parseDateStr(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date();
}

/**
 * Get start of day (00:00:00.000) for a given timestamp in device local time
 */
export function getStartOfDayMs(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Get end of day (23:59:59.999) for a given timestamp in device local time
 */
export function getEndOfDayMs(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Splits a time interval [startMs, endMs] across midnight boundaries
 * Returns array of { dateStr: 'DD-MM-YYYY', durationMs: number }
 */
export function splitDurationAcrossMidnight(
  startMs: number,
  endMs: number
): Array<{ dateStr: string; durationMs: number }> {
  if (endMs <= startMs) return [];

  const results: Array<{ dateStr: string; durationMs: number }> = [];
  let currentStart = startMs;

  while (currentStart < endMs) {
    const endOfCurrentDay = getEndOfDayMs(currentStart);
    const sliceEnd = Math.min(endMs, endOfCurrentDay + 1);
    const sliceDuration = Math.max(0, sliceEnd - currentStart);

    if (sliceDuration > 0) {
      results.push({
        dateStr: formatDate(new Date(currentStart)),
        durationMs: sliceDuration,
      });
    }

    currentStart = endOfCurrentDay + 1;
  }

  return results;
}
