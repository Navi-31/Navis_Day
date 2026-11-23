import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { dbService } from './database';
import { formatDate, formatTime, formatDuration } from '../utils/time';

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
      'Regularized': e.eventType === 'REGULARIZE' ? 'YES' : 'NO',
    }));

    // Sheet 3: Expense Log (with Payment Method)
    let expenses = await dbService.getAllExpenses();
    if (isSingleDate && filterDateStr) {
      expenses = expenses.filter((e) => e.dateStr === filterDateStr);
    }
    const expenseRows = expenses.map((e) => ({
      'Date': e.dateStr,
      'Time': e.timeStr,
      'Amount (INR)': e.amount,
      'Payment Method': e.paymentMethod || 'UPI',
      'Reason': e.reason,
      'Category': e.category ?? 'General',
    }));

    // Sheet 4: Balance Transactions (Additions & Deductions)
    let balanceTxs = await dbService.getAllBalanceTransactions();
    if (isSingleDate && filterDateStr) {
      balanceTxs = balanceTxs.filter((tx) => tx.dateStr === filterDateStr);
    }
    const balanceTxRows = balanceTxs.map((tx) => ({
      'Date': tx.dateStr,
      'Time': tx.timeStr,
      'Account Type': tx.accountType,
      'Transaction': tx.transactionType,
      'Amount (INR)': tx.amount,
      'Note / Description': tx.note || '-',
    }));

    // Sheet 5: Regularization Audit Trail
    let regularizations = await dbService.getAllRegularizations();
    if (isSingleDate && filterDateStr) {
      regularizations = regularizations.filter((r) => r.regularizedDateStr === filterDateStr);
    }
    const regRows = regularizations.map((r) => ({
      'Audit ID': r.id,
      'Date': r.regularizedDateStr,
      'Timer Name': r.timerName,
      'Start Time': formatTime(r.regularizedStartMs),
      'End Time': formatTime(r.regularizedEndMs),
      'Duration': formatDuration(r.regularizedDurationMs, true),
      'Reason for Regularization': r.reason,
      'Recorded At': new Date(r.createdAtMs).toISOString(),
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length > 0 ? summaryRows : [{
      'Date': '-', 'Day Analysis': '00:00', 'Bus Travel': '00:00', 'Waiting': '00:00', 'Expense (INR)': 0
    }]);
    const wsEvents = XLSX.utils.json_to_sheet(eventRows.length > 0 ? eventRows : [{
      'Date': '-', 'Time': '-', 'Timer Name': '-', 'Event': '-', 'Duration': '-', 'Regularized': 'NO'
    }]);
    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows.length > 0 ? expenseRows : [{
      'Date': '-', 'Time': '-', 'Amount (INR)': 0, 'Payment Method': 'UPI', 'Reason': '-', 'Category': '-'
    }]);
    const wsBalanceTxs = XLSX.utils.json_to_sheet(balanceTxRows.length > 0 ? balanceTxRows : [{
      'Date': '-', 'Time': '-', 'Account Type': '-', 'Transaction': '-', 'Amount (INR)': 0, 'Note / Description': '-'
    }]);
    const wsRegularizations = XLSX.utils.json_to_sheet(regRows.length > 0 ? regRows : [{
      'Audit ID': '-', 'Date': '-', 'Timer Name': '-', 'Start Time': '-', 'End Time': '-', 'Duration': '-', 'Reason for Regularization': '-', 'Recorded At': '-'
    }]);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Summary');
    XLSX.utils.book_append_sheet(wb, wsEvents, 'Timer Activity Log');
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expense Log');
    XLSX.utils.book_append_sheet(wb, wsBalanceTxs, 'Balance Transactions');
    XLSX.utils.book_append_sheet(wb, wsRegularizations, 'Regularization Audit');

    const timestamp = formatDate().replace(/-/g, '_');
    const filename = isSingleDate && filterDateStr 
      ? `NR_Tracker_${filterDateStr.replace(/-/g, '_')}.xlsx`
      : `NR_Tracker_Archive_${timestamp}.xlsx`;

    // Write file
    if (Capacitor.isNativePlatform()) {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: wbout,
        directory: Directory.Cache,
      });

      await Share.share({
        title: 'NR Daily Tracker Export',
        text: `Excel export from NR Daily Tracker: ${filename}`,
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
