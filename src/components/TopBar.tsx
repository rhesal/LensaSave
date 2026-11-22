import React from 'react';
import { KeyRound } from 'lucide-react';

interface TopBarProps {
  hasActiveSession: boolean;
  historyCount: number;
  onOpenSessionModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  hasActiveSession,
  historyCount,
  onOpenSessionModal,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E4E7] bg-[#FAFAFA]/95 dark:border-[#27272A] dark:bg-[#09090B]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        <a
          href="#pengunduh"
          className="font-display text-lg font-bold tracking-tight text-[#09090B] dark:text-[#FAFAFA] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] rounded-sm"
        >
          LensaSave
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#52525B] dark:text-[#A1A1AA]">
          <a
            href="#pengunduh"
            className="hover:text-[#09090B] dark:hover:text-[#FAFAFA] transition-colors whitespace-nowrap shrink-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] rounded-sm"
          >
            Pengunduh
          </a>
          <a
            href="#riwayat"
            className="hover:text-[#09090B] dark:hover:text-[#FAFAFA] transition-colors whitespace-nowrap shrink-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] rounded-sm"
          >
            Riwayat{historyCount > 0 ? ` (${historyCount})` : ''}
          </a>
          <a
            href="#cara-pakai"
            className="hover:text-[#09090B] dark:hover:text-[#FAFAFA] transition-colors whitespace-nowrap shrink-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] rounded-sm"
          >
            Cara Pakai
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenSessionModal}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-white px-4 py-2 text-xs font-medium text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:bg-[#1A1A20] dark:hover:border-[#3F3F46] transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA]"
          >
            <KeyRound className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
            <span>{hasActiveSession ? 'Sesi Aktif' : 'Pengaturan Sesi'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
