import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';

interface SessionModalProps {
  isOpen: boolean;
  initialSessionId: string;
  onClose: () => void;
  onSave: (sessionId: string) => void;
  onClear: () => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  initialSessionId,
  onClose,
  onSave,
  onClear,
}) => {
  const [value, setValue] = useState(initialSessionId);
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    setValue(initialSessionId);
  }, [initialSessionId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(value.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 dark:bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E4E4E7] bg-white p-6 shadow-2xl dark:border-[#27272A] dark:bg-[#121216]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] dark:border-[#27272A] dark:bg-[#1A1A20]">
              <KeyRound className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="session-modal-title" className="font-display text-lg font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                Pengaturan Session Cookie (Opsional)
              </h2>
              <p className="text-xs text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                Untuk mengakses Instagram Story dan postingan terbatas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan sesi"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-[#1A1A20] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div>
            <label htmlFor="sessionid-input" className="block text-sm font-medium text-[#09090B] dark:text-[#FAFAFA] mb-1.5">
              Nilai Cookie <span className="font-mono-tabular text-[#52525B] dark:text-[#A1A1AA]">sessionid</span>
            </label>
            <div className="relative flex items-center rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] focus-within:border-[#09090B] dark:border-[#27272A] dark:bg-[#09090B] dark:focus-within:border-[#FAFAFA]">
              <input
                id="sessionid-input"
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Tempel nilai sessionid dari cookie instagram.com..."
                className="w-full bg-transparent px-3.5 py-3 pr-11 text-sm font-mono-tabular text-[#09090B] placeholder:text-[#71717A] dark:text-[#FAFAFA] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowValue((prev) => !prev)}
                aria-label={showValue ? 'Sembunyikan cookie' : 'Tampilkan cookie'}
                className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] cursor-pointer"
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-2 text-xs text-[#52525B] dark:border-[#27272A] dark:bg-[#09090B] dark:text-[#A1A1AA] leading-relaxed">
            <p className="font-medium text-[#09090B] dark:text-[#FAFAFA]">Cara mendapatkan nilai sessionid:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Buka <span className="text-[#09090B] dark:text-[#FAFAFA]">instagram.com</span> di browser dan pastikan sudah masuk ke akun Anda.</li>
              <li>Buka DevTools (<span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">F12</span>) lalu pilih tab <span className="text-[#09090B] dark:text-[#FAFAFA]">Application</span> &gt; <span className="text-[#09090B] dark:text-[#FAFAFA]">Cookies</span> &gt; <span className="text-[#09090B] dark:text-[#FAFAFA]">https://www.instagram.com</span>.</li>
              <li>Salin nilai pada baris bernama <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">sessionid</span> dan tempel di kolom atas.</li>
            </ol>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-[#52525B] dark:text-[#A1A1AA]">
            <ShieldCheck className="h-4 w-4 text-[#09090B] dark:text-[#FAFAFA] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Cookie disimpan hanya di penyimpanan lokal browser Anda dan dikirim hanya saat permintaan ekstraksi berlangsung tanpa pernah dicatat di server.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
            {initialSessionId ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] px-3.5 py-2 text-xs font-medium text-[#DC2626] dark:text-[#FF4D4D] hover:bg-[#DC2626]/10 dark:hover:bg-[#FF4D4D]/10 transition-colors cursor-pointer min-h-[40px]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hapus Sesi</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-xs font-medium text-[#09090B] hover:bg-[#F4F4F5] dark:border-[#27272A] dark:text-[#FAFAFA] dark:hover:bg-[#1A1A20] transition-colors cursor-pointer min-h-[40px]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!value.trim()}
                className="rounded-lg bg-[#09090B] px-5 py-2 text-xs font-semibold text-[#FAFAFA] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[40px]"
              >
                Simpan & Aktifkan
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
