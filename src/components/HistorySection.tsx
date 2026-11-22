import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Film, Image as ImageIcon, Search, Trash2 } from 'lucide-react';
import type { HistoryEntry, MediaKind } from '../types/instagram';
import { buildProxyUrl } from '../utils/audioExtractor';
import type { AutoClearDays } from '../utils/storage';

interface HistorySectionProps {
  entries: HistoryEntry[];
  autoClearDays: AutoClearDays;
  onAutoClearDaysChange: (days: AutoClearDays) => void;
  onRestore: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

type FilterTab = 'all' | 'post' | 'reel' | 'story';

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'post', label: 'Post & Carousel' },
  { key: 'reel', label: 'Reels' },
  { key: 'story', label: 'Story' },
];

const AUTO_CLEAR_OPTIONS: Array<{ value: AutoClearDays; label: string }> = [
  { value: 0, label: 'Mati' },
  { value: 7, label: '7 Hari' },
  { value: 30, label: '30 Hari' },
  { value: 90, label: '90 Hari' },
];

function formatDateLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatTypeName(kind: MediaKind): string {
  switch (kind) {
    case 'reel':
      return 'Reels';
    case 'carousel':
      return 'Carousel';
    case 'story':
      return 'Story';
    default:
      return 'Post';
  }
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  entries,
  autoClearDays,
  onAutoClearDaysChange,
  onRestore,
  onDelete,
  onClearAll,
}) => {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'post' && (entry.mediaType === 'post' || entry.mediaType === 'carousel')) ||
        entry.mediaType === filter;
      const matchesQuery =
        !q ||
        entry.authorUsername.toLowerCase().includes(q) ||
        entry.captionPreview.toLowerCase().includes(q) ||
        entry.sourceUrl.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [entries, filter, search]);

  return (
    <section id="riwayat" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 border-t border-[#E4E4E7] dark:border-[#27272A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-2xl">
            Riwayat Tautan Lokal
          </h2>
          <p className="mt-1.5 text-sm text-[#52525B] dark:text-[#A1A1AA]">
            Tersimpan otomatis di browser Anda untuk membuka ulang pratinjau tanpa menempel tautan lagi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hapus otomatis:</span>
            </span>
            <div
              role="group"
              aria-label="Pengaturan hapus otomatis riwayat"
              className="inline-flex items-center gap-1 rounded-xl border border-[#E4E4E7] bg-white p-1 dark:border-[#27272A] dark:bg-[#121216]"
            >
              {AUTO_CLEAR_OPTIONS.map((option) => {
                const active = autoClearDays === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onAutoClearDaysChange(option.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 min-h-[32px] cursor-pointer ${
                      active
                        ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                        : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-3.5 py-2 text-xs font-medium text-[#52525B] hover:border-[#DC2626]/50 hover:text-[#DC2626] dark:border-[#27272A] dark:text-[#A1A1AA] dark:hover:border-[#FF4D4D]/50 dark:hover:text-[#FF4D4D] transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bersihkan Semua</span>
            </button>
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#E4E4E7] bg-white p-1 dark:border-[#27272A] dark:bg-[#121216]">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer ${
                    active
                      ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                      : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari akun atau caption..."
              aria-label="Cari riwayat"
              className="w-full rounded-xl border border-[#E4E4E7] bg-white py-2 pl-9 pr-3 text-xs text-[#09090B] placeholder:text-[#71717A] focus:border-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:focus:border-[#FAFAFA] focus:outline-none min-h-[40px]"
            />
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#E4E4E7] bg-white p-8 text-center dark:border-[#27272A] dark:bg-[#121216]">
          <p className="text-sm font-medium text-[#09090B] dark:text-[#FAFAFA]">Belum ada riwayat tautan</p>
          <p className="mt-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA]">
            Setelah Anda mengambil Post, Reels, atau Story di atas, riwayatnya akan muncul di sini.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#E4E4E7] bg-white p-8 text-center dark:border-[#27272A] dark:bg-[#121216]">
          <p className="text-sm text-[#52525B] dark:text-[#A1A1AA]">Tidak ada riwayat yang cocok dengan filter atau pencarian Anda.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((entry) => {
            const thumbFailed = brokenThumbs.has(entry.id) || !entry.thumbnailUrl;
            const thumbUrl = entry.thumbnailUrl
              ? buildProxyUrl(entry.thumbnailUrl, `hist_${entry.id}.jpg`, 'inline')
              : '';

            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 rounded-xl border border-[#E4E4E7] bg-white p-3.5 hover:border-[#D4D4D8] dark:border-[#27272A] dark:bg-[#121216] dark:hover:border-[#3F3F46] transition-colors"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] dark:border-[#27272A] dark:bg-[#09090B]">
                  {thumbFailed ? (
                    <div className="flex h-full w-full items-center justify-center bg-[#F4F4F5] dark:bg-[#1A1A20]">
                      {entry.mediaType === 'reel' || entry.mediaType === 'story' ? (
                        <Film className="h-5 w-5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                      )}
                    </div>
                  ) : (
                    <img
                      src={thumbUrl}
                      alt={`Pratinjau @${entry.authorUsername}`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenThumbs((prev) => new Set(prev).add(entry.id))
                      }
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA]">
                    <span className="font-medium text-[#09090B] dark:text-[#FAFAFA] truncate">
                      @{entry.authorUsername}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTypeName(entry.mediaType)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{entry.itemCount} item</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{formatDateLabel(entry.savedAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#27272A] dark:text-[#D4D4D8]">
                    {entry.captionPreview}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRestore(entry)}
                    aria-label={`Buka ulang @${entry.authorUsername}`}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-3 text-xs font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#52525B] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>Buka</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    aria-label={`Hapus riwayat @${entry.authorUsername}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#DC2626] dark:text-[#71717A] dark:hover:bg-[#1A1A20] dark:hover:text-[#FF4D4D] transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
