import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbService } from '../services/database';
import {
  checkForAppUpdates,
  CURRENT_VERSION_NAME,
  CURRENT_VERSION_CODE,
} from '../services/updateChecker';
import { GitHubReleaseInfo } from '../types';
import {
  ShieldCheck,
  RefreshCw,
  Download,
  Database,
  Upload,
  HardDriveDownload,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
} from 'lucide-react';

export const DataAndSettings: React.FC = () => {
  const { refreshData, clearAllData } = useApp();

  // GitHub Settings
  const [repoOwner, setRepoOwner] = useState<string>('nithy');
  const [repoName, setRepoName] = useState<string>("Navis_Day");
  const [githubToken, setGithubToken] = useState<string>('');

  // Update Checker State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    updateAvailable: boolean;
    currentVersion: string;
    release?: GitHubReleaseInfo;
    message?: string;
  } | null>(null);

  // Backup / Restore Status
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const owner = await dbService.getSetting('github_owner', 'nithy');
      const repo = await dbService.getSetting('github_repo', 'Navis_Day');
      const token = await dbService.getSetting('github_token', '');
      setRepoOwner(owner);
      setRepoName(repo);
      setGithubToken(token);
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    await dbService.setSetting('github_owner', repoOwner.trim());
    await dbService.setSetting('github_repo', repoName.trim());
    await dbService.setSetting('github_token', githubToken.trim());
    setBackupNotice('GitHub configuration saved.');
    setTimeout(() => setBackupNotice(null), 3000);
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateResult(null);
    const res = await checkForAppUpdates(repoOwner, repoName, githubToken);
    setIsCheckingUpdate(false);
    setUpdateResult(res);
  };

  const handleExportBackup = async () => {
    try {
      const jsonStr = await dbService.exportBackupJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NR_Database_Backup_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setBackupNotice('Database backup archive exported.');
      setTimeout(() => setBackupNotice(null), 4000);
    } catch (e) {
      alert('Failed to export backup: ' + (e as Error).message);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = await dbService.restoreBackupJson(content);
        if (ok) {
          setBackupNotice('Database successfully restored from backup.');
          await refreshData();
          setTimeout(() => setBackupNotice(null), 4000);
        } else {
          alert('Invalid backup file format.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = async () => {
    if (confirm('Permanently delete all timer sessions, events, and expense records? This action cannot be undone.')) {
      await clearAllData();
      setBackupNotice('All records have been erased completely.');
      setTimeout(() => setBackupNotice(null), 4000);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full bg-black text-white px-4 pt-2 pb-24 overflow-y-auto no-scrollbar gap-4">
      {/* Title */}
      <div className="flex items-center justify-between py-2 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-[#D4AF37]" />
          <span className="font-mono text-xs uppercase tracking-widest text-[#D4AF37] font-bold">
            DATA MANAGEMENT &amp; UPDATES
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-[#181818] border border-[#2A2A2A] text-[10px] font-mono text-gray-400">
          OFFLINE-FIRST
        </span>
      </div>

      {/* Notice Banner */}
      {backupNotice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1e1c12] border border-[#D4AF37] text-xs font-mono text-[#D4AF37] animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{backupNotice}</span>
        </div>
      )}

      {/* SECTION 1: MANUAL IN-APP UPDATE CHECKER */}
      <div className="rounded-2xl bg-[#121212] border border-[#D4AF37]/40 p-4 shadow-[0_4px_24px_rgba(212,175,55,0.12)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-[#D4AF37]" />
            <span className="font-mono text-xs uppercase tracking-wider text-white font-bold">
              APP VERSION &amp; GITHUB UPDATES
            </span>
          </div>
          <span className="font-mono text-xs text-[#D4AF37] font-bold">
            {CURRENT_VERSION_NAME} (Build {CURRENT_VERSION_CODE})
          </span>
        </div>

        <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
          Checks the latest release on GitHub manually. No background polling or notification services run.
        </p>

        {/* GitHub Repository Config */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-gray-400 uppercase">GitHub Owner</label>
            <input
              type="text"
              value={repoOwner}
              onChange={(e) => setRepoOwner(e.target.value)}
              placeholder="e.g. nithy"
              className="bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-gray-400 uppercase">Repository Name</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="e.g. aura-daily-tracker"
              className="bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-gray-400 uppercase">
            Personal Token (Optional - for private repositories)
          </label>
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_xxxx (stored only in local SQLite)"
            className="bg-[#0a0a0a] border border-[#333] focus:border-[#D4AF37] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSaveSettings}
            className="px-3 py-2 rounded-xl bg-[#202020] border border-[#333] text-gray-200 font-mono text-xs hover:bg-[#282828] transition-colors"
          >
            Save Repo Info
          </button>
          <button
            onClick={handleCheckUpdates}
            disabled={isCheckingUpdate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#D4AF37] text-black font-mono text-xs font-bold hover:bg-[#F5D061] transition-all shadow-[0_0_15px_rgba(212,175,55,0.25)] active:scale-95"
          >
            <RefreshCw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
            <span>{isCheckingUpdate ? 'CHECKING GITHUB...' : 'CHECK FOR UPDATES'}</span>
          </button>
        </div>

        {/* Update Check Results */}
        {updateResult && (
          <div className="mt-2 p-3 rounded-xl bg-[#0a0a0a] border border-[#333] flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {updateResult.updateAvailable ? (
                <AlertCircle size={16} className="text-[#D4AF37]" />
              ) : (
                <ShieldCheck size={16} className="text-emerald-400" />
              )}
              <span className="font-mono text-xs font-bold text-gray-200">
                {updateResult.message}
              </span>
            </div>

            {updateResult.release && (
              <div className="flex flex-col gap-1 pt-1 border-t border-[#222]">
                <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
                  <span>Latest: {updateResult.release.tagName}</span>
                  <span>Size: {(updateResult.release.assetSize / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
                <div className="text-xs text-gray-300 font-sans bg-[#141414] p-2 rounded-lg max-h-24 overflow-y-auto no-scrollbar whitespace-pre-wrap">
                  {updateResult.release.releaseNotes}
                </div>

                {updateResult.updateAvailable && (
                  <a
                    href={updateResult.release.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-black font-mono text-xs font-bold hover:bg-emerald-400 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  >
                    <Download size={14} />
                    <span>DOWNLOAD AND INSTALL APK</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: DATABASE BACKUP & RESTORE */}
      <div className="rounded-2xl bg-[#121212] border border-[#2A2A2A] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <HardDriveDownload size={18} className="text-[#8B5CF6]" />
          <span className="font-mono text-xs uppercase tracking-wider text-white font-bold">
            LOCAL DATABASE PRESERVATION
          </span>
        </div>
        <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
          All timestamps, sessions, logs, and expenses are stored strictly on-device in SQLite. No cloud account or external database required.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Export Backup */}
          <button
            onClick={handleExportBackup}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#181818] border border-[#8B5CF6]/50 text-[#A78BFA] font-mono text-xs font-bold hover:bg-[#222] transition-colors"
          >
            <Download size={14} />
            <span>BACKUP JSON</span>
          </button>

          {/* Import Backup */}
          <label className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#181818] border border-[#333] text-gray-300 font-mono text-xs font-bold hover:bg-[#222] cursor-pointer transition-colors">
            <Upload size={14} />
            <span>RESTORE JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Danger Zone: Erase All Data */}
      <div className="rounded-2xl bg-[#140808] border border-red-900/60 p-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(239,68,68,0.1)]">
        <div className="flex items-center gap-2">
          <Trash2 size={18} className="text-red-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-red-400 font-bold">
            ERASE ALL APP DATA
          </span>
        </div>
        <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
          Completely erase all stopwatches, session intervals, activity logs, and expense records from local SQLite storage. Resets to a clean blank slate.
        </p>

        <button
          onClick={handleClearAllData}
          type="button"
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-950/80 border border-red-700/80 text-red-200 font-mono text-xs font-bold hover:bg-red-900 active:scale-95 transition-all shadow-[0_0_15px_rgba(220,38,38,0.25)]"
        >
          <Trash2 size={14} />
          <span>ERASE ENTIRE DATABASE</span>
        </button>
      </div>

      {/* Battery & Architecture Telemetry Info */}
      <div className="rounded-2xl bg-[#0d0d0d] border border-[#1e1e1e] p-4 flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase text-[#D4AF37] font-bold tracking-wider">
          BATTERY &amp; LIFECYCLE METRICS
        </span>
        <div className="flex flex-col gap-1 text-[11px] font-mono text-gray-400">
          <div className="flex justify-between">
            <span>Foreground Service:</span>
            <span className="text-emerald-400 font-semibold">Disabled (0% Background Drain)</span>
          </div>
          <div className="flex justify-between">
            <span>Background Notifications:</span>
            <span className="text-emerald-400 font-semibold">None (Explicitly Prohibited)</span>
          </div>
          <div className="flex justify-between">
            <span>Timer Mechanism:</span>
            <span className="text-gray-300 font-semibold">Wall-Clock Epoch Math</span>
          </div>
          <div className="flex justify-between">
            <span>Persistence:</span>
            <span className="text-gray-300 font-semibold">SQLite On-Device ACID</span>
          </div>
        </div>
      </div>
    </div>
  );
};
