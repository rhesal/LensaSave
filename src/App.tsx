import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { GuideSection } from './components/GuideSection';
import { HistorySection } from './components/HistorySection';
import { MediaStage } from './components/MediaStage';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SessionModal } from './components/SessionModal';
import { TopBar } from './components/TopBar';
import { UrlCommandBar } from './components/UrlCommandBar';
import type { HistoryEntry, ResolveApiError, ResolvedMedia } from './types/instagram';
import { extractValidInstagramUrl } from './utils/instagramUrl';
import {
  applyThemeToDocument,
  clearHistory,
  loadAutoClearDays,
  loadHistory,
  loadSessionConfig,
  loadThemeMode,
  pruneHistoryByAge,
  removeHistoryEntry,
  saveAutoClearDays,
  saveHistoryEntry,
  saveSessionConfig,
  saveThemeMode,
  type AutoClearDays,
  type SessionConfig,
  type ThemeMode,
} from './utils/storage';

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ResolveApiError | null>(null);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia | null>(null);
  const [autoClearDays, setAutoClearDays] = useState<AutoClearDays>(() => loadAutoClearDays());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(() => loadSessionConfig());
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemeMode());
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const urlRef = useRef(url);
  const isSessionModalOpenRef = useRef(isSessionModalOpen);
  const lastAutoPastedRef = useRef<string | null>(null);

  urlRef.current = url;
  isSessionModalOpenRef.current = isSessionModalOpen;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 3200);
  }, []);

  useEffect(() => {
    const tryAutoPasteFromClipboard = async () => {
      if (isSessionModalOpenRef.current) return;
      if (urlRef.current.trim().length > 0) return;
      if (!navigator.clipboard?.readText) return;

      try {
        const text = await navigator.clipboard.readText();
        const validUrl = extractValidInstagramUrl(text);
        if (validUrl && validUrl !== lastAutoPastedRef.current) {
          lastAutoPastedRef.current = validUrl;
          setUrl(validUrl);
          showToast('Tautan Instagram dari clipboard ditempel otomatis');
        }
      } catch {
        // Browser may require explicit user gesture or clipboard permission
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tryAutoPasteFromClipboard();
      }
    };

    const handleWindowFocus = () => {
      void tryAutoPasteFromClipboard();
    };

    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (isSessionModalOpenRef.current) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const pastedText = event.clipboardData?.getData('text') || '';
      const validUrl = extractValidInstagramUrl(pastedText);
      if (validUrl) {
        event.preventDefault();
        lastAutoPastedRef.current = validUrl;
        setUrl(validUrl);
        showToast('Tautan Instagram ditempel dari clipboard');
      }
    };

    void tryAutoPasteFromClipboard();
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('paste', handleGlobalPaste);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [showToast]);

  const handleResolve = useCallback(async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl ?? urlRef.current).trim();
    if (!targetUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (sessionConfig.enabled && sessionConfig.sessionId) {
        headers['X-IG-Session'] = sessionConfig.sessionId;
      }

      const response = await fetch('/api/instagram/resolve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: targetUrl }),
      });

      const payload = (await response.json()) as ResolvedMedia | ResolveApiError;

      if (!response.ok || 'error' in payload) {
        const apiError = payload as ResolveApiError;
        setError({
          error: apiError.error || 'Gagal memproses tautan Instagram.',
          code: apiError.code || 'EXTRACTION_FAILED',
        });
        setResolvedMedia(null);
        return;
      }

      setResolvedMedia(payload);
      setHistory(saveHistoryEntry(payload));
    } catch {
      setError({
        error: 'Tidak dapat terhubung ke server ekstraksi. Periksa koneksi Anda lalu coba lagi.',
        code: 'EXTRACTION_FAILED',
      });
      setResolvedMedia(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionConfig.enabled, sessionConfig.sessionId]);

  useEffect(() => {
    registerSW({ immediate: true });

    // Receive URL shared from Android Share Sheet (Web Share Target) or deep-link query params
    const params = new URLSearchParams(window.location.search);
    const sharedCandidate = params.get('url') || params.get('text') || '';
    if (sharedCandidate) {
      const validSharedUrl = extractValidInstagramUrl(sharedCandidate);
      if (validSharedUrl) {
        lastAutoPastedRef.current = validSharedUrl;
        setUrl(validSharedUrl);
        window.history.replaceState({}, '', window.location.pathname);
        void handleResolve(validSharedUrl);
      }
    }
  }, [handleResolve]);

  const handleRestoreFromHistory = (entry: HistoryEntry) => {
    setUrl(entry.sourceUrl);
    setError(null);
    setResolvedMedia(entry.data);
    document.getElementById('pengunduh')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSaveSession = (sessionId: string) => {
    const next = saveSessionConfig({ sessionId, enabled: Boolean(sessionId) });
    setSessionConfig(next);
    showToast('Session Cookie disimpan secara lokal di browser');
  };

  const handleClearSession = () => {
    const next = saveSessionConfig({ sessionId: '', enabled: false });
    setSessionConfig(next);
    showToast('Session Cookie lokal dihapus');
  };

  const handleToggleSession = (enabled: boolean) => {
    const next = saveSessionConfig({
      sessionId: sessionConfig.sessionId,
      enabled,
    });
    setSessionConfig(next);
  };

  const handleAutoClearDaysChange = (days: AutoClearDays) => {
    const savedDays = saveAutoClearDays(days);
    setAutoClearDays(savedDays);
    const { next, removedCount } = pruneHistoryByAge(history, savedDays);
    if (removedCount > 0) {
      setHistory(next);
    }
    if (savedDays === 0) {
      showToast('Hapus otomatis riwayat dinonaktifkan');
    } else if (removedCount > 0) {
      showToast(`Hapus otomatis diatur ke ${savedDays} hari · ${removedCount} riwayat lama dihapus`);
    } else {
      showToast(`Hapus otomatis riwayat diatur ke ${savedDays} hari`);
    }
  };

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(saveThemeMode(nextTheme));
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B] dark:bg-[#09090B] dark:text-[#FAFAFA] flex flex-col">
      <TopBar
        hasActiveSession={Boolean(sessionConfig.enabled && sessionConfig.sessionId)}
        historyCount={history.length}
        onOpenSessionModal={() => setIsSessionModalOpen(true)}
      />

      <main className="flex-1">
        <UrlCommandBar
          url={url}
          isLoading={isLoading}
          hasSavedSession={Boolean(sessionConfig.sessionId)}
          useSession={sessionConfig.enabled}
          theme={theme}
          onThemeChange={handleThemeChange}
          onUrlChange={setUrl}
          onSubmit={handleResolve}
          onToggleSession={handleToggleSession}
          onOpenSessionModal={() => setIsSessionModalOpen(true)}
        />

        <MediaStage
          media={resolvedMedia}
          isLoading={isLoading}
          error={error}
          onRetry={() => handleResolve()}
          onOpenSessionModal={() => setIsSessionModalOpen(true)}
          onNotify={showToast}
        />

        <HistorySection
          entries={history}
          autoClearDays={autoClearDays}
          onAutoClearDaysChange={handleAutoClearDaysChange}
          onRestore={handleRestoreFromHistory}
          onDelete={(id) => setHistory(removeHistoryEntry(id))}
          onClearAll={() => {
            setHistory(clearHistory());
            showToast('Seluruh riwayat lokal dibersihkan');
          }}
        />

        <GuideSection />
      </main>

      <footer className="border-t border-[#E4E4E7] dark:border-[#27272A] py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-[#52525B] dark:text-[#71717A] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>LensaSave · Studio Pengunduh Media Instagram</span>
          <span>Gunakan untuk pengarsipan pribadi dan hormati hak cipta kreator.</span>
        </div>
      </footer>

      <SessionModal
        isOpen={isSessionModalOpen}
        initialSessionId={sessionConfig.sessionId}
        onClose={() => setIsSessionModalOpen(false)}
        onSave={handleSaveSession}
        onClear={handleClearSession}
      />

      <OfflineIndicator />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-xs font-medium text-[#09090B] shadow-xl dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
