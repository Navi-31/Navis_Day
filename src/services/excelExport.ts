import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { dbService } from './database';
import { formatDate, formatDuration } from '../utils/time';

export interface ExportFilter {
  dateStr?: string; // If set, exports for that specific date; otherwise all time
}

export async function generateAndExportExcel(filter?: ExportFilter): Promise<{ success: boolean; filename: string }> {
  try {
    const isSingleDate = !!filter?.dateStr;
    const filterDateStr = filter?.dateStr;

    // 1. Fetch data
    let distinctDates = await dbService.getAllDistinctDates();
    if (isSingleDate && filterDateStr) {
      distinctDates = [filterDateStr];
    } else {
      distinctDates.sort((a, b) => {
        const [d1, m1, y1] = a.split('-').map(Number);
        const [d2, m2, y2] = b.split('-').map(Number);
        return new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
      });
    }

    // Sheet 1: Daily Summary
    const summaryRows = [];
    for (const d of distinctDates) {
      const summary = await dbService.getDailySummary(d);
      summaryRows.push({
        'Date': summary.dateStr,
        'Day Analysis': formatDuration(summary.dayAnalysisMs, true),
        'Bus Travel': formatDuration(summary.busTravelMs, true),
        'Waiting': formatDuration(summary.busWaitingMs, true),
        'Expense (INR)': summary.totalExpense,
      });
    }

    // Sheet 2: Timer Activity Log
    let events = await dbService.getAllEvents();
    if (isSingleDate && filterDateStr) {
      events = events.filter((e) => e.dateStr === filterDateStr);
    }
    const eventRows = events.map((e) => ({
      'Date': e.dateStr,
      'Time': e.timeStr,
      'Timer Name': e.timerName,
      'Event': e.eventType,
      'Duration': e.durationMs ? formatDuration(e.durationMs) : (e.note ?? '-'),
    }));

    // Sheet 3: Expense Log
    let expenses = await dbService.getAllExpenses();
    if (isSingleDate && filterDateStr) {
      expenses = expenses.filter((e) => e.dateStr === filterDateStr);
    }
    const expenseRows = expenses.map((e) => ({
      'Date': e.dateStr,
      'Time': e.timeStr,
      'Amount (INR)': e.amount,
      'Reason': e.reason,
      'Category': e.category ?? 'General',
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length > 0 ? summaryRows : [{
      'Date': '-', 'Day Analysis': '00:00', 'Bus Travel': '00:00', 'Waiting': '00:00', 'Expense (INR)': 0
    }]);
    const wsEvents = XLSX.utils.json_to_sheet(eventRows.length > 0 ? eventRows : [{
      'Date': '-', 'Time': '-', 'Timer Name': '-', 'Event': '-', 'Duration': '-'
    }]);
    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows.length > 0 ? expenseRows : [{
      'Date': '-', 'Time': '-', 'Amount (INR)': 0, 'Reason': '-', 'Category': '-'
    }]);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Summary');
    XLSX.utils.book_append_sheet(wb, wsEvents, 'Timer Activity Log');
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expense Log');

    const timestamp = formatDate().replace(/-/g, '_');
    const filename = isSingleDate && filterDateStr 
      ? `Aura_Tracker_${filterDateStr.replace(/-/g, '_')}.xlsx`
      : `Aura_Tracker_Archive_${timestamp}.xlsx`;

    // Write file
    if (Capacitor.isNativePlatform()) {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: wbout,
        directory: Directory.Cache,
      });

      await Share.share({
        title: 'Aura Daily Tracker Export',
        text: `Excel export from Aura Daily Tracker: ${filename}`,
        url: writeResult.uri,
        dialogTitle: 'Export Excel Workbook',
      });
    } else {
      XLSX.writeFile(wb, filename);
    }

    return { success: true, filename };
  } catch (error) {
    console.error('Error generating Excel file:', error);
    return { success: false, filename: '' };
  }
}
