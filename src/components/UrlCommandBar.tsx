import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ClipboardPaste, HelpCircle, Loader2, Moon, Sun, X } from 'lucide-react';
import { extractValidInstagramUrl } from '../utils/instagramUrl';
import type { ThemeMode } from '../utils/storage';
import { PWAInstallButton } from './PWAInstallButton';

interface UrlCommandBarProps {
  url: string;
  isLoading: boolean;
  hasSavedSession: boolean;
  useSession: boolean;
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  onUrlChange: (value: string) => void;
  onSubmit: (overrideUrl?: string) => void;
  onToggleSession: (next: boolean) => void;
  onOpenSessionModal: () => void;
}

const KEYBOARD_SHORTCUTS = [
  { keys: ['Enter'], description: 'Ambil media dari tautan di kolom' },
  { keys: ['Ctrl+V', '⌘V'], description: 'Tempel tautan Instagram otomatis' },
  { keys: ['←', '→'], description: 'Pindah slide pada pratinjau Carousel' },
  { keys: ['Esc'], description: 'Tutup dialog atau jendela bantuan' },
];

export const UrlCommandBar: React.FC<UrlCommandBarProps> = ({
  url,
  isLoading,
  hasSavedSession,
  useSession,
  theme,
  onThemeChange,
  onUrlChange,
  onSubmit,
  onToggleSession,
  onOpenSessionModal,
}) => {
  const [isShortcutHovered, setIsShortcutHovered] = useState(false);
  const [isShortcutPinned, setIsShortcutPinned] = useState(false);
  const shortcutContainerRef = useRef<HTMLDivElement | null>(null);
  const isShortcutOpen = isShortcutHovered || isShortcutPinned;

  useEffect(() => {
    if (!isShortcutOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsShortcutHovered(false);
        setIsShortcutPinned(false);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (
        shortcutContainerRef.current &&
        !shortcutContainerRef.current.contains(event.target as Node)
      ) {
        setIsShortcutHovered(false);
        setIsShortcutPinned(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isShortcutOpen]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const extracted = extractValidInstagramUrl(text);
        onUrlChange(extracted ?? text.trim());
      }
    } catch {
      // Clipboard API may require user permission; focus input cleanly instead
    }
  };

  return (
    <section id="pengunduh" className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 lg:pt-14 lg:pb-10">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-[#52525B] dark:text-[#A1A1AA] mb-3">
          Studio Pengunduh Instagram · Post · Carousel · Reels · Story
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-5xl balance-text leading-[1.12]">
          Simpan media Instagram resolusi penuh hanya dari satu tautan.
        </h1>
        <p className="mt-4 text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed max-w-2xl">
          Tempel tautan Post, Carousel multi-slide, Reels, atau Story untuk pratinjau langsung, unduh per slide, dan ekstrak trek audio Reels.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="relative flex-1 flex items-center rounded-xl border border-[#E4E4E7] bg-white focus-within:border-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:focus-within:border-[#FAFAFA] transition-colors">
            <label htmlFor="ig-url-input" className="sr-only">
              Tautan URL Instagram
            </label>
            <input
              id="ig-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://www.instagram.com/reel/... atau /p/... atau /stories/..."
              className="w-full bg-transparent px-4 py-3.5 pr-24 text-sm text-[#09090B] placeholder:text-[#71717A] dark:text-[#FAFAFA] dark:placeholder:text-[#71717A] focus:outline-none min-h-[52px]"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {url && (
                <button
                  type="button"
                  onClick={() => onUrlChange('')}
                  aria-label="Hapus tautan"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-[#1A1A20] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-1.5 text-xs font-medium text-[#09090B] hover:border-[#D4D4D8] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#3F3F46] transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA]"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                <span>Tempel</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#09090B] px-6 py-3.5 text-sm font-semibold text-[#FAFAFA] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 min-h-[52px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] dark:focus-visible:ring-[#FAFAFA] dark:focus-visible:ring-offset-[#09090B]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>Ambil Media</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 text-xs text-[#52525B] dark:text-[#A1A1AA]">
          <div className="flex flex-wrap items-center gap-2">
            <span>Format didukung:</span>
            <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">/p/</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">/reel/</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">/stories/</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">/tv/</span>

            <div
              ref={shortcutContainerRef}
              onMouseEnter={() => setIsShortcutHovered(true)}
              onMouseLeave={() => setIsShortcutHovered(false)}
              onFocus={() => setIsShortcutHovered(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsShortcutHovered(false);
                }
              }}
              className="relative inline-flex items-center ml-1"
            >
              <button
                type="button"
                aria-label="Pintasan keyboard"
                aria-expanded={isShortcutOpen}
                aria-controls="keyboard-shortcuts-tooltip"
                onClick={() => setIsShortcutPinned((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 min-h-[26px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] ${
                  isShortcutOpen
                    ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                }`}
              >
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                <span>Pintasan</span>
              </button>

              {isShortcutOpen && (
                <div
                  id="keyboard-shortcuts-tooltip"
                  role="tooltip"
                  className="absolute right-0 sm:right-auto sm:left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] sm:w-80 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-xl dark:border-[#27272A] dark:bg-[#121216]"
                >
                  <p className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA] mb-2.5">
                    Pintasan Keyboard
                  </p>
                  <ul className="space-y-2">
                    {KEYBOARD_SHORTCUTS.map((item) => (
                      <li
                        key={item.description}
                        className="flex items-center justify-between gap-3 text-[11px]"
                      >
                        <span className="text-[#52525B] dark:text-[#A1A1AA]">
                          {item.description}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {item.keys.map((keyLabel) => (
                            <kbd
                              key={keyLabel}
                              className="rounded border border-[#E4E4E7] bg-[#F4F4F5] px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium text-[#09090B] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA]"
                            >
                              {keyLabel}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasSavedSession ? (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useSession}
                  onChange={(e) => onToggleSession(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D4D4D8] bg-white accent-[#09090B] dark:border-[#3F3F46] dark:bg-[#121216] dark:accent-[#FAFAFA] cursor-pointer"
                />
                <span className="text-[#27272A] dark:text-[#D4D4D8]">
                  Gunakan Session Cookie untuk Story & akun terbatas
                </span>
              </label>
            ) : (
              <button
                type="button"
                onClick={onOpenSessionModal}
                className="text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] underline underline-offset-4 transition-colors cursor-pointer"
              >
                Perlu unduh Instagram Story? Tambahkan Session Cookie opsional
              </button>
            )}

            <PWAInstallButton />

            <div
              role="group"
              aria-label="Pilih tema tampilan"
              className="inline-flex items-center gap-0.5 rounded-lg border border-[#E4E4E7] bg-white p-0.5 dark:border-[#27272A] dark:bg-[#121216]"
            >
              <button
                type="button"
                aria-pressed={theme === 'dark'}
                onClick={() => onThemeChange('dark')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[28px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] ${
                  theme === 'dark'
                    ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                    : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                }`}
              >
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Studio Dark</span>
              </button>
              <button
                type="button"
                aria-pressed={theme === 'light'}
                onClick={() => onThemeChange('light')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[28px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA] ${
                  theme === 'light'
                    ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                    : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                }`}
              >
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Light Mode</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
};
