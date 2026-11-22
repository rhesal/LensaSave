import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ onInstalled?: () => void }> = ({ onInstalled }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showMobileGuide, setShowMobileGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) onInstalled?.();
      return;
    }
    setShowMobileGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstallClick()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:border-[#52525B] transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA]"
      >
        {isInstallable ? (
          <Download className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
        ) : (
          <Smartphone className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
        )}
        <span>
          {isInstallable
            ? 'Pasang Aplikasi'
            : isIOS
              ? 'Pasang di iPhone'
              : 'Jalankan di HP'}
        </span>
      </button>

      {showMobileGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 dark:bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E4E4E7] bg-white p-6 shadow-2xl dark:border-[#27272A] dark:bg-[#121216]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] dark:border-[#27272A] dark:bg-[#1A1A20]">
                  <Smartphone className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="pwa-guide-title" className="font-display text-base font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                    Jalankan LensaSave di Smartphone
                  </h3>
                  <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
                    Pasang sebagai aplikasi layar utama (PWA) tanpa Play Store/App Store
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileGuide(false)}
                aria-label="Tutup panduan smartphone"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-[#1A1A20] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs text-[#27272A] dark:text-[#D4D4D8] leading-relaxed">
              <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-2 dark:border-[#27272A] dark:bg-[#09090B]">
                <p className="font-medium text-[#09090B] dark:text-[#FAFAFA]">1. Android (Chrome / Edge)</p>
                <p className="text-[#52525B] dark:text-[#A1A1AA]">
                  Buka tautan aplikasi ini di Chrome Android, ketuk menu{' '}
                  <span className="text-[#09090B] dark:text-[#FAFAFA]">⋮</span> di kanan atas, lalu pilih{' '}
                  <span className="text-[#09090B] dark:text-[#FAFAFA]">Tambahkan ke layar utama / Instal aplikasi</span>.
                  Setelah terpasang, Anda juga bisa langsung menekan{' '}
                  <span className="text-[#09090B] dark:text-[#FAFAFA]">Bagikan → LensaSave</span> dari aplikasi Instagram.
                </p>
              </div>

              <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-2 dark:border-[#27272A] dark:bg-[#09090B]">
                <p className="font-medium text-[#09090B] dark:text-[#FAFAFA] flex items-center gap-1.5">
                  <span>2. iPhone / iPad (Safari)</span>
                </p>
                <p className="text-[#52525B] dark:text-[#A1A1AA]">
                  Buka halaman ini di <span className="text-[#09090B] dark:text-[#FAFAFA]">Safari</span>, ketuk tombol{' '}
                  <span className="inline-flex items-center gap-1 text-[#09090B] dark:text-[#FAFAFA]">
                    <Share className="h-3 w-3" aria-hidden="true" /> Bagikan
                  </span>{' '}
                  di bilah bawah, lalu gulir dan pilih{' '}
                  <span className="text-[#09090B] dark:text-[#FAFAFA]">Tambahkan ke Layar Utama (Add to Home Screen)</span>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMobileGuide(false)}
              className="mt-5 w-full rounded-xl bg-[#09090B] px-4 py-2.5 text-xs font-semibold text-[#FAFAFA] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] transition-colors min-h-[42px] cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-xs font-medium text-[#09090B] shadow-xl dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA]"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#DC2626] dark:text-[#FF4D4D]" aria-hidden="true" />
      <span>Mode Offline · Riwayat lokal tetap dapat diakses</span>
    </div>
  );
};
