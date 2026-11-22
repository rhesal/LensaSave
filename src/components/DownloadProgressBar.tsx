import React from 'react';
import { AlertCircle, CheckCircle2, Download, X } from 'lucide-react';

export interface DownloadProgressState {
  id: string;
  filename: string;
  label: string;
  receivedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  currentItem?: number;
  totalItems?: number;
  status: 'downloading' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
}

interface DownloadProgressBarProps {
  state: DownloadProgressState;
  onCancel: () => void;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export const DownloadProgressBar: React.FC<DownloadProgressBarProps> = ({
  state,
  onCancel,
  onDismiss,
}) => {
  const isDownloading = state.status === 'downloading';
  const isCompleted = state.status === 'completed';
  const isError = state.status === 'error';
  const isCancelled = state.status === 'cancelled';

  const statusText = isDownloading
    ? state.label
    : isCompleted
      ? 'Unduhan selesai'
      : isCancelled
        ? 'Unduhan dibatalkan'
        : state.errorMessage || 'Unduhan gagal';

  const byteSummary = state.totalBytes
    ? `${formatBytes(state.receivedBytes)} / ${formatBytes(state.totalBytes)}`
    : `${formatBytes(state.receivedBytes)} diunduh`;

  const displayPercent = isCompleted
    ? 100
    : state.percent !== null
      ? state.percent
      : null;

  return (
    <div
      role="region"
      aria-label="Progres unduhan berkas"
      aria-live="polite"
      className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-3 dark:border-[#27272A] dark:bg-[#09090B]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-[#09090B] dark:text-[#FAFAFA] shrink-0 mt-0.5" aria-hidden="true" />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-[#DC2626] dark:text-[#FF4D4D] shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 text-[#09090B] dark:text-[#FAFAFA] shrink-0 mt-0.5" aria-hidden="true" />
          )}

          <div className="min-w-0">
            <p
              className={`text-xs font-medium ${
                isError ? 'text-[#DC2626] dark:text-[#FF4D4D]' : 'text-[#09090B] dark:text-[#FAFAFA]'
              }`}
            >
              {statusText}
            </p>
            <p className="mt-0.5 truncate text-xs font-mono-tabular text-[#52525B] dark:text-[#A1A1AA]">
              {state.filename}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {displayPercent !== null && (
            <span className="text-xs font-mono-tabular font-medium text-[#09090B] dark:text-[#FAFAFA]">
              {displayPercent}%
            </span>
          )}
          {isDownloading ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#27272A] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#D4D4D8] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer min-h-[32px]"
            >
              Batalkan
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Tutup status unduhan"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#E4E4E7] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-[#1A1A20] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayPercent ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-[#E4E4E7] dark:bg-[#27272A]"
      >
        {isDownloading && displayPercent === null ? (
          <div className="h-full w-1/3 rounded-full bg-[#09090B] dark:bg-[#FAFAFA] animate-studio-indeterminate" />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-150 ease-out ${
              isError || isCancelled
                ? 'bg-[#DC2626] dark:bg-[#FF4D4D]'
                : 'bg-[#09090B] dark:bg-[#FAFAFA]'
            }`}
            style={{ width: `${displayPercent ?? 0}%` }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#52525B] dark:text-[#A1A1AA]">
        <span>{byteSummary}</span>
        {typeof state.currentItem === 'number' && typeof state.totalItems === 'number' && state.totalItems > 1 && (
          <span>
            Slide {state.currentItem} dari {state.totalItems}
          </span>
        )}
      </div>
    </div>
  );
};
