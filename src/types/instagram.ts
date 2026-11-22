export type MediaKind = 'post' | 'reel' | 'carousel' | 'story';

export interface MediaVariant {
  id: string;
  label: string;
  url: string;
  width?: number;
  height?: number;
}

export interface MediaItem {
  id: string;
  index: number;
  type: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl: string;
  audioUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  variants?: MediaVariant[];
}

export interface ResolvedMedia {
  id: string;
  sourceUrl: string;
  mediaType: MediaKind;
  shortcode?: string;
  authorUsername: string;
  authorFullName?: string;
  authorAvatarUrl?: string;
  caption: string;
  timestamp?: string;
  items: MediaItem[];
  targetSlideIndex?: number;
}

export interface HistoryEntry {
  id: string;
  sourceUrl: string;
  mediaType: MediaKind;
  authorUsername: string;
  captionPreview: string;
  thumbnailUrl: string;
  itemCount: number;
  savedAt: string;
  data: ResolvedMedia;
}

export interface ResolveApiError {
  error: string;
  code?: 'INVALID_URL' | 'AUTH_REQUIRED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'EXTRACTION_FAILED';
}
