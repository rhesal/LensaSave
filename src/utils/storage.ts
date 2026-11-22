import type { HistoryEntry, ResolvedMedia } from '../types/instagram';

const HISTORY_KEY = 'lensasave_history_v1';
const SESSION_KEY = 'lensasave_session_v1';
const AUTO_CLEAR_KEY = 'lensasave_autoclear_days_v1';
const THEME_KEY = 'lensasave_theme_v1';
const MAX_HISTORY_ITEMS = 40;

export type AutoClearDays = 0 | 7 | 30 | 90;
export type ThemeMode = 'dark' | 'light';

export interface SessionConfig {
  sessionId: string;
  enabled: boolean;
}

export function loadThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', mode === 'dark' ? '#09090B' : '#FAFAFA');
  }
}

export function saveThemeMode(mode: ThemeMode): ThemeMode {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Ignore storage quota errors cleanly
  }
  applyThemeToDocument(mode);
  return mode;
}

export function loadAutoClearDays(): AutoClearDays {
  try {
    const raw = localStorage.getItem(AUTO_CLEAR_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    if (parsed === 7 || parsed === 30 || parsed === 90) return parsed;
    return 0;
  } catch {
    return 0;
  }
}

export function saveAutoClearDays(days: AutoClearDays): AutoClearDays {
  try {
    if (days === 0) {
      localStorage.removeItem(AUTO_CLEAR_KEY);
    } else {
      localStorage.setItem(AUTO_CLEAR_KEY, String(days));
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
  return days;
}

export function pruneHistoryByAge(
  entries: HistoryEntry[],
  days: AutoClearDays
): { next: HistoryEntry[]; removedCount: number } {
  if (days === 0 || entries.length === 0) {
    return { next: entries, removedCount: 0 };
  }
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const next = entries.filter((entry) => {
    const ts = new Date(entry.savedAt).getTime();
    return Number.isFinite(ts) && ts >= cutoffMs;
  });
  const removedCount = entries.length - next.length;
  if (removedCount > 0) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
  return { next, removedCount };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const days = loadAutoClearDays();
    return pruneHistoryByAge(parsed, days).next;
  } catch {
    return [];
  }
}

export function saveHistoryEntry(media: ResolvedMedia): HistoryEntry[] {
  const current = loadHistory();
  const firstItem = media.items[0];
  const newEntry: HistoryEntry = {
    id: `${media.id}_${Date.now()}`,
    sourceUrl: media.sourceUrl,
    mediaType: media.mediaType,
    authorUsername: media.authorUsername,
    captionPreview: media.caption ? media.caption.slice(0, 120) : `Media @${media.authorUsername}`,
    thumbnailUrl: firstItem?.thumbnailUrl || firstItem?.mediaUrl || '',
    itemCount: media.items.length,
    savedAt: new Date().toISOString(),
    data: media,
  };

  const deduped = current.filter((item) => item.sourceUrl !== media.sourceUrl);
  const next = [newEntry, ...deduped].slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors cleanly
  }
  return next;
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors cleanly
  }
  return next;
}

export function clearHistory(): HistoryEntry[] {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore
  }
  return [];
}

export function loadSessionConfig(): SessionConfig {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { sessionId: '', enabled: false };
    const parsed = JSON.parse(raw) as Partial<SessionConfig>;
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
      enabled: Boolean(parsed.enabled && parsed.sessionId),
    };
  } catch {
    return { sessionId: '', enabled: false };
  }
}

export function saveSessionConfig(config: SessionConfig): SessionConfig {
  const sanitized: SessionConfig = {
    sessionId: config.sessionId.trim(),
    enabled: Boolean(config.enabled && config.sessionId.trim()),
  };
  try {
    if (!sanitized.sessionId) {
      localStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Ignore
  }
  return sanitized;
}
