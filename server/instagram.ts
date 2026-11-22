import net from 'node:net';
import type { MediaItem, MediaKind, MediaVariant, ResolvedMedia } from '../src/types/instagram.ts';

const IG_APP_ID = '936619743392459';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export class InstagramResolveError extends Error {
  status: number;
  code: 'INVALID_URL' | 'AUTH_REQUIRED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'EXTRACTION_FAILED';

  constructor(
    message: string,
    status: number,
    code: 'INVALID_URL' | 'AUTH_REQUIRED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'EXTRACTION_FAILED'
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ParsedInstagramTarget {
  kind: 'post' | 'reel' | 'story' | 'highlight';
  canonicalUrl: string;
  shortcode?: string;
  username?: string;
  storyId?: string;
  highlightId?: string;
  targetSlideIndex?: number;
}

const ALLOWED_IG_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'i.instagram.com',
  'instagr.am',
  'www.instagr.am',
]);

export function isAllowedMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (net.isIP(host) !== 0) return false;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    return (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'cdninstagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host === 'fbcdn.net' ||
      host.endsWith('.fbcdn.net')
    );
  } catch {
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+/, '');
  return cleaned.slice(0, 120) || 'lensasave_media';
}

export function parseInstagramUrl(rawUrl: string): ParsedInstagramTarget {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new InstagramResolveError('Masukkan tautan URL Instagram terlebih dahulu.', 400, 'INVALID_URL');
  }

  let normalizedInput = trimmed;
  if (!/^https?:\/\//i.test(normalizedInput)) {
    normalizedInput = `https://${normalizedInput}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedInput);
  } catch {
    throw new InstagramResolveError(
      'Format URL tidak valid. Contoh: https://www.instagram.com/reel/...',
      400,
      'INVALID_URL'
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InstagramResolveError('Hanya tautan HTTP/HTTPS Instagram yang didukung.', 400, 'INVALID_URL');
  }
  if (parsed.username || parsed.password) {
    throw new InstagramResolveError('Format URL tidak diizinkan.', 400, 'INVALID_URL');
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_IG_HOSTS.has(host)) {
    throw new InstagramResolveError(
      'Tautan harus berasal dari domain resmi instagram.com atau instagr.am.',
      400,
      'INVALID_URL'
    );
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new InstagramResolveError(
      'Tautan mengarah ke beranda Instagram. Tempel tautan Post, Reels, atau Story spesifik.',
      400,
      'INVALID_URL'
    );
  }

  // /stories/highlights/{id}
  if (segments[0] === 'stories' && segments[1] === 'highlights' && segments[2]) {
    const highlightId = segments[2].replace(/[^0-9]/g, '');
    if (!highlightId) {
      throw new InstagramResolveError('ID Highlight Instagram tidak valid.', 400, 'INVALID_URL');
    }
    return {
      kind: 'highlight',
      highlightId,
      canonicalUrl: `https://www.instagram.com/stories/highlights/${highlightId}/`,
    };
  }

  // /stories/{username}/{storyId?}
  if (segments[0] === 'stories' && segments[1]) {
    const username = segments[1].replace(/[^a-zA-Z0-9._]/g, '');
    const storyId = segments[2] ? segments[2].replace(/[^0-9]/g, '') : undefined;
    if (!username) {
      throw new InstagramResolveError('Nama pengguna pada tautan Story tidak valid.', 400, 'INVALID_URL');
    }
    return {
      kind: 'story',
      username,
      storyId: storyId || undefined,
      canonicalUrl: storyId
        ? `https://www.instagram.com/stories/${username}/${storyId}/`
        : `https://www.instagram.com/stories/${username}/`,
    };
  }

  // /p/{shortcode}, /reel/{shortcode}, /reels/{shortcode}, /tv/{shortcode}
  // or /{username}/p/{shortcode}, /{username}/reel/{shortcode}
  let typeSegmentIndex = -1;
  if (['p', 'reel', 'reels', 'tv'].includes(segments[0])) {
    typeSegmentIndex = 0;
  } else if (segments.length >= 3 && ['p', 'reel', 'reels', 'tv'].includes(segments[1])) {
    typeSegmentIndex = 1;
  }

  if (typeSegmentIndex !== -1 && segments[typeSegmentIndex + 1]) {
    const segType = segments[typeSegmentIndex];
    const shortcode = segments[typeSegmentIndex + 1].replace(/[^a-zA-Z0-9_-]/g, '');
    if (!shortcode) {
      throw new InstagramResolveError('Kode postingan Instagram tidak ditemukan dalam tautan.', 400, 'INVALID_URL');
    }
    const rawImgIndex = parsed.searchParams.get('img_index');
    const parsedImgIndex = rawImgIndex ? Number(rawImgIndex) : NaN;
    const targetSlideIndex =
      Number.isInteger(parsedImgIndex) && parsedImgIndex >= 1 ? parsedImgIndex - 1 : undefined;
    const kind = segType === 'p' ? 'post' : 'reel';
    return {
      kind,
      shortcode,
      targetSlideIndex,
      canonicalUrl: `https://www.instagram.com/${segType === 'p' ? 'p' : 'reel'}/${shortcode}/`,
    };
  }

  throw new InstagramResolveError(
    'Format tautan belum dikenali. Gunakan tautan Post (/p/...), Reels (/reel/...), atau Story (/stories/...).',
    400,
    'INVALID_URL'
  );
}

export function shortcodeToMediaId(shortcode: string): string {
  // Instagram media shortcodes represent the first 11 chars if standard; strip suffix if any
  const clean = shortcode.slice(0, 11);
  let id = 0n;
  for (const char of clean) {
    const idx = SHORTCODE_ALPHABET.indexOf(char);
    if (idx === -1) break;
    id = id * 64n + BigInt(idx);
  }
  return id.toString();
}

export function sanitizeSessionCookie(rawCookie?: string): string | undefined {
  if (!rawCookie) return undefined;
  const trimmed = rawCookie.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return undefined;

  // Allow user to paste either raw sessionid value or full "sessionid=...;" cookie
  const match = trimmed.match(/sessionid=([^;\s]+)/i);
  const value = (match ? match[1] : trimmed).replace(/[;\s]+/g, '');
  if (!value || value.length < 10) return undefined;
  return `sessionid=${value}`;
}

export async function safeFetchWithRedirectCheck(
  initialUrl: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, ...fetchInit } = init;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= 3; hop += 1) {
    if (!isAllowedMediaUrl(currentUrl)) {
      throw new InstagramResolveError('Domain tujuan tidak termasuk daftar host yang diizinkan.', 400, 'INVALID_URL');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        ...fetchInit,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return response;
        const resolved = new URL(location, currentUrl).toString();
        if (!isAllowedMediaUrl(resolved)) {
          throw new InstagramResolveError('Pengalihan URL menuju host di luar batas aman.', 400, 'INVALID_URL');
        }
        currentUrl = resolved;
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new InstagramResolveError('Terlalu banyak pengalihan saat menghubungi server Instagram.', 502, 'EXTRACTION_FAILED');
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeJsonStringEscapes(input: string): string {
  return input
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n');
}

function extractBalancedJsonObject(text: string, markerRegex: RegExp): Record<string, any> | null {
  const match = markerRegex.exec(text);
  if (!match) return null;
  const startSearch = match.index + match[0].length;
  const braceStart = text.indexOf('{', startSearch);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(braceStart, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function extractDashAudioUrl(dashXml?: string): string | undefined {
  if (!dashXml) return undefined;
  const audioSetMatch = dashXml.match(/<AdaptationSet[^>]*contentType="audio"[\s\S]*?<\/AdaptationSet>/i)
    || dashXml.match(/<Representation[^>]*mimeType="audio\/mp4"[\s\S]*?<\/Representation>/i);
  if (!audioSetMatch) return undefined;
  const baseUrlMatch = audioSetMatch[0].match(/<BaseURL>([\s\S]*?)<\/BaseURL>/i);
  if (!baseUrlMatch?.[1]) return undefined;
  const url = decodeHtmlEntities(baseUrlMatch[1].trim());
  return isAllowedMediaUrl(url) ? url : undefined;
}

function pickBestCandidate(candidates?: Array<{ url?: string; width?: number; height?: number }>) {
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const sorted = [...candidates]
    .filter((c) => c?.url && isAllowedMediaUrl(c.url))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  return sorted[0];
}

function buildVariantsFromCandidates(
  candidates?: Array<{ url?: string; width?: number; height?: number }>
): MediaVariant[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const sorted = [...candidates]
    .filter((c): c is { url: string; width?: number; height?: number } => Boolean(c?.url && isAllowedMediaUrl(c.url)))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));

  const seenKeys = new Set<string>();
  const variants: MediaVariant[] = [];

  for (const cand of sorted) {
    const dimsKey = cand.width && cand.height ? `${cand.width}x${cand.height}` : cand.url;
    if (seenKeys.has(dimsKey)) continue;
    seenKeys.add(dimsKey);
    const dimsLabel = cand.width && cand.height ? `${cand.width}×${cand.height}` : `Opsi ${variants.length + 1}`;
    variants.push({
      id: `v_${variants.length}`,
      label: variants.length === 0 ? `HD (${dimsLabel})` : dimsLabel,
      url: cand.url,
      width: cand.width,
      height: cand.height,
    });
    if (variants.length >= 4) break;
  }

  return variants;
}

function buildVariantsFromDisplayResources(
  resources?: Array<{ src?: string; config_width?: number; config_height?: number }>,
  fallbackUrl?: string,
  fallbackW?: number,
  fallbackH?: number
): MediaVariant[] {
  const candidates: Array<{ url?: string; width?: number; height?: number }> = Array.isArray(resources)
    ? resources.map((r) => ({ url: r.src, width: r.config_width, height: r.config_height }))
    : [];
  if (fallbackUrl) {
    candidates.push({ url: fallbackUrl, width: fallbackW, height: fallbackH });
  }
  return buildVariantsFromCandidates(candidates);
}

function mapApiV1ItemToResolved(
  item: Record<string, any>,
  target: ParsedInstagramTarget
): ResolvedMedia | null {
  if (!item) return null;

  const username = item.user?.username || target.username || 'instagram_user';
  const fullName = item.user?.full_name || undefined;
  const avatar = item.user?.profile_pic_url && isAllowedMediaUrl(item.user.profile_pic_url)
    ? item.user.profile_pic_url
    : undefined;
  const caption = item.caption?.text || '';
  const timestamp = item.taken_at ? new Date(Number(item.taken_at) * 1000).toISOString() : undefined;

  const items: MediaItem[] = [];

  if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
    item.carousel_media.forEach((slide: Record<string, any>, idx: number) => {
      const bestVideo = pickBestCandidate(slide.video_versions);
      const bestImg = pickBestCandidate(slide.image_versions2?.candidates);
      if (bestVideo?.url) {
        items.push({
          id: String(slide.id || `${item.id}_${idx}`),
          index: idx,
          type: 'video',
          mediaUrl: bestVideo.url,
          thumbnailUrl: bestImg?.url || bestVideo.url,
          audioUrl: extractDashAudioUrl(slide.video_dash_manifest),
          width: bestVideo.width || slide.original_width,
          height: bestVideo.height || slide.original_height,
          durationSec: slide.video_duration ? Number(slide.video_duration) : undefined,
          variants: buildVariantsFromCandidates(slide.video_versions),
        });
      } else if (bestImg?.url) {
        items.push({
          id: String(slide.id || `${item.id}_${idx}`),
          index: idx,
          type: 'image',
          mediaUrl: bestImg.url,
          thumbnailUrl: bestImg.url,
          width: bestImg.width || slide.original_width,
          height: bestImg.height || slide.original_height,
          variants: buildVariantsFromCandidates(slide.image_versions2?.candidates),
        });
      }
    });
  } else {
    const bestVideo = pickBestCandidate(item.video_versions);
    const bestImg = pickBestCandidate(item.image_versions2?.candidates);
    if (bestVideo?.url) {
      items.push({
        id: String(item.id || item.pk || '0'),
        index: 0,
        type: 'video',
        mediaUrl: bestVideo.url,
        thumbnailUrl: bestImg?.url || bestVideo.url,
        audioUrl: extractDashAudioUrl(item.video_dash_manifest),
        width: bestVideo.width || item.original_width,
        height: bestVideo.height || item.original_height,
        durationSec: item.video_duration ? Number(item.video_duration) : undefined,
        variants: buildVariantsFromCandidates(item.video_versions),
      });
    } else if (bestImg?.url) {
      items.push({
        id: String(item.id || item.pk || '0'),
        index: 0,
        type: 'image',
        mediaUrl: bestImg.url,
        thumbnailUrl: bestImg.url,
        width: bestImg.width || item.original_width,
        height: bestImg.height || item.original_height,
        variants: buildVariantsFromCandidates(item.image_versions2?.candidates),
      });
    }
  }

  if (items.length === 0) return null;

  let mediaType: MediaKind = 'post';
  if (target.kind === 'story' || target.kind === 'highlight') {
    mediaType = 'story';
  } else if (items.length > 1) {
    mediaType = 'carousel';
  } else if (items[0].type === 'video' || target.kind === 'reel' || item.product_type === 'clips') {
    mediaType = 'reel';
  }

  return {
    id: String(item.id || item.pk || target.shortcode || Date.now()),
    sourceUrl: target.canonicalUrl,
    mediaType,
    shortcode: item.code || target.shortcode,
    authorUsername: username,
    authorFullName: fullName,
    authorAvatarUrl: avatar,
    caption,
    timestamp,
    items,
    targetSlideIndex:
      typeof target.targetSlideIndex === 'number' && target.targetSlideIndex < items.length
        ? target.targetSlideIndex
        : undefined,
  };
}

function mapShortcodeMediaToResolved(
  media: Record<string, any>,
  target: ParsedInstagramTarget
): ResolvedMedia | null {
  if (!media) return null;

  const username = media.owner?.username || 'instagram_user';
  const fullName = media.owner?.full_name || undefined;
  const avatar =
    media.owner?.profile_pic_url && isAllowedMediaUrl(media.owner.profile_pic_url)
      ? media.owner.profile_pic_url
      : undefined;
  const caption =
    media.edge_media_to_caption?.edges?.[0]?.node?.text ||
    media.caption?.text ||
    '';
  const timestamp = media.taken_at_timestamp
    ? new Date(Number(media.taken_at_timestamp) * 1000).toISOString()
    : undefined;

  const items: MediaItem[] = [];
  const sidecarEdges = media.edge_sidecar_to_children?.edges;

  if (Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
    sidecarEdges.forEach((edge: { node?: Record<string, any> }, idx: number) => {
      const node = edge?.node;
      if (!node) return;
      const isVid = Boolean(node.is_video && node.video_url);
      const mediaUrl = isVid ? node.video_url : node.display_url;
      const thumbUrl = node.display_url || mediaUrl;
      if (mediaUrl && isAllowedMediaUrl(mediaUrl)) {
        const w = node.dimensions?.width;
        const h = node.dimensions?.height;
        items.push({
          id: String(node.id || `${media.id || 's'}_${idx}`),
          index: idx,
          type: isVid ? 'video' : 'image',
          mediaUrl,
          thumbnailUrl: isAllowedMediaUrl(thumbUrl) ? thumbUrl : mediaUrl,
          audioUrl: extractDashAudioUrl(node.dash_info?.video_dash_manifest),
          width: w,
          height: h,
          durationSec: node.video_duration ? Number(node.video_duration) : undefined,
          variants: isVid
            ? buildVariantsFromCandidates([{ url: mediaUrl, width: w, height: h }])
            : buildVariantsFromDisplayResources(node.display_resources, mediaUrl, w, h),
        });
      }
    });
  } else {
    const isVid = Boolean(media.is_video && media.video_url);
    const mediaUrl = isVid ? media.video_url : media.display_url;
    const thumbUrl = media.display_url || mediaUrl;
    if (mediaUrl && isAllowedMediaUrl(mediaUrl)) {
      const w = media.dimensions?.width;
      const h = media.dimensions?.height;
      items.push({
        id: String(media.id || target.shortcode || '0'),
        index: 0,
        type: isVid ? 'video' : 'image',
        mediaUrl,
        thumbnailUrl: isAllowedMediaUrl(thumbUrl) ? thumbUrl : mediaUrl,
        audioUrl: extractDashAudioUrl(media.dash_info?.video_dash_manifest),
        width: w,
        height: h,
        durationSec: media.video_duration ? Number(media.video_duration) : undefined,
        variants: isVid
          ? buildVariantsFromCandidates([{ url: mediaUrl, width: w, height: h }])
          : buildVariantsFromDisplayResources(media.display_resources, mediaUrl, w, h),
      });
    }
  }

  if (items.length === 0) return null;

  let mediaType: MediaKind = 'post';
  if (items.length > 1) mediaType = 'carousel';
  else if (items[0].type === 'video' || target.kind === 'reel' || media.product_type === 'clips') {
    mediaType = 'reel';
  }

  return {
    id: String(media.id || target.shortcode || Date.now()),
    sourceUrl: target.canonicalUrl,
    mediaType,
    shortcode: media.shortcode || target.shortcode,
    authorUsername: username,
    authorFullName: fullName,
    authorAvatarUrl: avatar,
    caption,
    timestamp,
    items,
    targetSlideIndex:
      typeof target.targetSlideIndex === 'number' && target.targetSlideIndex < items.length
        ? target.targetSlideIndex
        : undefined,
  };
}

function buildHeaders(cookie?: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Sec-Fetch-Site': 'same-origin',
    ...extra,
  };
  if (cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

async function tryApiV1MediaInfo(
  shortcode: string,
  cookie?: string
): Promise<ResolvedMedia | null> {
  if (!cookie) return null;
  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId || mediaId === '0') return null;

  const res = await safeFetchWithRedirectCheck(
    `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
    {
      headers: buildHeaders(cookie, {
        'X-IG-App-ID': IG_APP_ID,
        Accept: '*/*',
        Referer: `https://www.instagram.com/p/${shortcode}/`,
      }),
    }
  );

  if (!res.ok) return null;
  const json = (await res.json()) as { items?: Array<Record<string, any>> };
  const first = json?.items?.[0];
  if (!first) return null;
  return mapApiV1ItemToResolved(first, {
    kind: first.product_type === 'clips' ? 'reel' : 'post',
    shortcode,
    canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
  });
}

const EMBED_SSR_UA =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function extractContextJsonShortcodeMedia(html: string): Record<string, any> | null {
  const ctxMatch = html.match(/"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!ctxMatch?.[1]) return null;
  try {
    const unescaped = JSON.parse(`"${ctxMatch[1]}"`) as string;
    const parsed = JSON.parse(unescaped) as Record<string, any>;
    const shortcodeMedia =
      parsed?.gql_data?.shortcode_media ||
      parsed?.shortcode_media ||
      null;
    return shortcodeMedia && typeof shortcodeMedia === 'object' ? shortcodeMedia : null;
  } catch {
    return null;
  }
}

function parseEmbedHtmlToResolved(
  html: string,
  target: ParsedInstagramTarget
): { media: ResolvedMedia; fromStructuredJson: boolean } | null {
  const contextMedia = extractContextJsonShortcodeMedia(html);
  if (contextMedia) {
    const mapped = mapShortcodeMediaToResolved(contextMedia, target);
    if (mapped) return { media: mapped, fromStructuredJson: true };
  }

  // Check for unescaped JSON payloads inside embed script tags
  const xdtItems = extractBalancedJsonObject(html, /"xdt_api__v1__media__shortcode__web_info"\s*:/);
  if (Array.isArray(xdtItems?.items) && xdtItems.items[0]) {
    const mapped = mapApiV1ItemToResolved(xdtItems.items[0], target);
    if (mapped) return { media: mapped, fromStructuredJson: true };
  }

  const additionalData = extractBalancedJsonObject(
    html,
    /window\.__additionalDataLoaded\s*\(\s*['"]extra['"]\s*,/
  );
  if (additionalData?.shortcode_media) {
    const mapped = mapShortcodeMediaToResolved(additionalData.shortcode_media, target);
    if (mapped) return { media: mapped, fromStructuredJson: true };
  }

  const gqlData = extractBalancedJsonObject(html, /"gql_data"\s*:/);
  if (gqlData?.shortcode_media) {
    const mapped = mapShortcodeMediaToResolved(gqlData.shortcode_media, target);
    if (mapped) return { media: mapped, fromStructuredJson: true };
  }

  const directShortcodeMedia = extractBalancedJsonObject(html, /"shortcode_media"\s*:/);
  if (directShortcodeMedia) {
    const mapped = mapShortcodeMediaToResolved(directShortcodeMedia, target);
    if (mapped) return { media: mapped, fromStructuredJson: true };
  }

  // Fallback: Parse embedded DOM tags from embed/captioned HTML
  const videoMatch = html.match(/<video[^>]+src="([^"]+)"/i)
    || html.match(/"video_url"\s*:\s*"([^"]+)"/i);
  const imgMatch = html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/i)
    || html.match(/"display_url"\s*:\s*"([^"]+)"/i);

  const rawVideoUrl = videoMatch?.[1] ? decodeJsonStringEscapes(decodeHtmlEntities(videoMatch[1])) : undefined;
  const rawImgUrl = imgMatch?.[1] ? decodeJsonStringEscapes(decodeHtmlEntities(imgMatch[1])) : undefined;

  const validVideoUrl = rawVideoUrl && isAllowedMediaUrl(rawVideoUrl) ? rawVideoUrl : undefined;
  const validImgUrl = rawImgUrl && isAllowedMediaUrl(rawImgUrl) ? rawImgUrl : undefined;

  if (!validVideoUrl && !validImgUrl) return null;

  const usernameMatch = html.match(/class="[^"]*UsernameText[^"]*"[^>]*>([^<]+)</i);
  const captionMatch = html.match(/<div class="Caption"[\s\S]*?<a class="CaptionUsername"[\s\S]*?<\/a>([\s\S]*?)<div class="CaptionComments"/i);

  const captionText = captionMatch?.[1]
    ? decodeHtmlEntities(captionMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim())
    : '';

  const mediaUrl = validVideoUrl || validImgUrl!;
  const thumbUrl = validImgUrl || mediaUrl;

  return {
    fromStructuredJson: false,
    media: {
      id: target.shortcode || 'post',
      sourceUrl: target.canonicalUrl,
      mediaType: validVideoUrl ? (target.kind === 'reel' ? 'reel' : 'post') : 'post',
      shortcode: target.shortcode,
      authorUsername: usernameMatch?.[1]?.trim() || 'instagram_user',
      caption: captionText,
      items: [
        {
          id: `${target.shortcode || 'post'}_0`,
          index: 0,
          type: validVideoUrl ? 'video' : 'image',
          mediaUrl,
          thumbnailUrl: thumbUrl,
        },
      ],
    },
  };
}

async function tryEmbedExtraction(
  target: ParsedInstagramTarget,
  cookie?: string
): Promise<{ media: ResolvedMedia; fromStructuredJson: boolean } | null> {
  if (!target.shortcode) return null;
  const embedUrl = `https://www.instagram.com/p/${target.shortcode}/embed/captioned/`;

  // 1. Request SSR embed HTML (Instagram serves full contextJSON + sidecar slides cleanly)
  const ssrHeaders: Record<string, string> = {
    'User-Agent': EMBED_SSR_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  };
  if (cookie) {
    ssrHeaders.Cookie = cookie;
  }

  const ssrRes = await safeFetchWithRedirectCheck(embedUrl, { headers: ssrHeaders }).catch(() => null);
  let fallbackResult: { media: ResolvedMedia; fromStructuredJson: boolean } | null = null;

  if (ssrRes?.ok) {
    const ssrHtml = await ssrRes.text();
    const parsedSsr = parseEmbedHtmlToResolved(ssrHtml, target);
    if (parsedSsr?.fromStructuredJson) {
      return parsedSsr;
    }
    if (parsedSsr) {
      fallbackResult = parsedSsr;
    }
  }

  // 2. Fallback to standard desktop embed request if SSR probe didn't yield structured JSON
  const desktopRes = await safeFetchWithRedirectCheck(embedUrl, {
    headers: buildHeaders(cookie, {
      Referer: 'https://www.instagram.com/',
    }),
  }).catch(() => null);

  if (desktopRes?.ok) {
    const desktopHtml = await desktopRes.text();
    const parsedDesktop = parseEmbedHtmlToResolved(desktopHtml, target);
    if (parsedDesktop?.fromStructuredJson) {
      return parsedDesktop;
    }
    if (!fallbackResult && parsedDesktop) {
      fallbackResult = parsedDesktop;
    }
  }

  return fallbackResult;
}

async function tryPublicGraphQL(
  target: ParsedInstagramTarget,
  cookie?: string
): Promise<ResolvedMedia | null> {
  if (!target.shortcode) return null;
  const docIds = ['8845758582119845', '10015901848480474'];

  for (const docId of docIds) {
    try {
      const body = new URLSearchParams({
        variables: JSON.stringify({ shortcode: target.shortcode }),
        doc_id: docId,
      });

      const res = await safeFetchWithRedirectCheck('https://www.instagram.com/graphql/query', {
        method: 'POST',
        headers: buildHeaders(cookie, {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-IG-App-ID': IG_APP_ID,
          'X-FB-LSD': 'AVqbxe3J_YA',
          Referer: target.canonicalUrl,
          Accept: '*/*',
        }),
        body: body.toString(),
      });

      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: { xdt_shortcode_media?: Record<string, any>; shortcode_media?: Record<string, any> };
      };
      const media = json?.data?.xdt_shortcode_media || json?.data?.shortcode_media;
      if (media) {
        const mapped = mapShortcodeMediaToResolved(media, target);
        if (mapped) return mapped;
      }
    } catch {
      // Continue to next doc_id or fallback strategy
    }
  }
  return null;
}

async function tryDirectHtmlPageExtraction(
  target: ParsedInstagramTarget,
  cookie?: string
): Promise<ResolvedMedia | null> {
  if (!target.shortcode) return null;
  const res = await safeFetchWithRedirectCheck(target.canonicalUrl, {
    headers: buildHeaders(cookie, {
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    }),
  });
  if (!res.ok) return null;
  const html = await res.text();

  const xdtItems = extractBalancedJsonObject(html, /"xdt_api__v1__media__shortcode__web_info"\s*:/);
  if (Array.isArray(xdtItems?.items) && xdtItems.items[0]) {
    const mapped = mapApiV1ItemToResolved(xdtItems.items[0], target);
    if (mapped) return mapped;
  }

  const shortcodeMedia = extractBalancedJsonObject(html, /"shortcode_media"\s*:/);
  if (shortcodeMedia) {
    const mapped = mapShortcodeMediaToResolved(shortcodeMedia, target);
    if (mapped) return mapped;
  }

  // OpenGraph meta tag fallback
  const ogVideo = html.match(/<meta[^>]+property="og:video(?::secure_url)?"[^>]+content="([^"]+)"/i)?.[1];
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1];
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1];

  const cleanVideo = ogVideo ? decodeHtmlEntities(ogVideo) : undefined;
  const cleanImage = ogImage ? decodeHtmlEntities(ogImage) : undefined;
  const validVideo = cleanVideo && isAllowedMediaUrl(cleanVideo) ? cleanVideo : undefined;
  const validImage = cleanImage && isAllowedMediaUrl(cleanImage) ? cleanImage : undefined;

  if (!validVideo && !validImage) return null;

  const authorMatch = ogTitle?.match(/@([a-zA-Z0-9._]+)/) || ogDesc?.match(/-\s*([a-zA-Z0-9._]+)\s+on\s+Instagram/i);

  return {
    id: target.shortcode,
    sourceUrl: target.canonicalUrl,
    mediaType: validVideo ? (target.kind === 'reel' ? 'reel' : 'post') : 'post',
    shortcode: target.shortcode,
    authorUsername: authorMatch?.[1] || 'instagram_user',
    caption: ogDesc ? decodeHtmlEntities(ogDesc) : '',
    items: [
      {
        id: `${target.shortcode}_0`,
        index: 0,
        type: validVideo ? 'video' : 'image',
        mediaUrl: validVideo || validImage!,
        thumbnailUrl: validImage || validVideo!,
      },
    ],
  };
}

async function resolveStoryOrHighlight(
  target: ParsedInstagramTarget,
  cookie?: string
): Promise<ResolvedMedia> {
  if (!cookie) {
    throw new InstagramResolveError(
      'Instagram Story memerlukan Session Cookie (sessionid) opsional agar dapat diakses. Buka Pengaturan Sesi untuk menambahkan sessionid Anda.',
      401,
      'AUTH_REQUIRED'
    );
  }

  let reelId = '';
  let resolvedUsername = target.username || 'instagram_user';
  let resolvedFullName: string | undefined;
  let resolvedAvatar: string | undefined;

  if (target.kind === 'highlight' && target.highlightId) {
    reelId = `highlight:${target.highlightId}`;
  } else if (target.username) {
    const profileRes = await safeFetchWithRedirectCheck(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(target.username)}`,
      {
        headers: buildHeaders(cookie, {
          'X-IG-App-ID': IG_APP_ID,
          Accept: '*/*',
          Referer: 'https://www.instagram.com/',
        }),
      }
    );

    if (profileRes.status === 401 || profileRes.status === 403) {
      throw new InstagramResolveError(
        'Session Cookie kedaluwarsa atau tidak valid. Perbarui sessionid di Pengaturan Sesi.',
        401,
        'AUTH_REQUIRED'
      );
    }

    if (!profileRes.ok) {
      throw new InstagramResolveError(
        `Tidak dapat menemukan profil @${target.username} di Instagram.`,
        404,
        'NOT_FOUND'
      );
    }

    const profileJson = (await profileRes.json()) as {
      data?: { user?: { id?: string; username?: string; full_name?: string; profile_pic_url?: string } };
    };
    const user = profileJson?.data?.user;
    if (!user?.id) {
      throw new InstagramResolveError(
        `Akun @${target.username} tidak ditemukan atau sesi tidak memiliki akses.`,
        404,
        'NOT_FOUND'
      );
    }

    reelId = user.id;
    resolvedUsername = user.username || target.username;
    resolvedFullName = user.full_name;
    if (user.profile_pic_url && isAllowedMediaUrl(user.profile_pic_url)) {
      resolvedAvatar = user.profile_pic_url;
    }
  }

  const storyRes = await safeFetchWithRedirectCheck(
    `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`,
    {
      headers: buildHeaders(cookie, {
        'X-IG-App-ID': IG_APP_ID,
        Accept: '*/*',
        Referer: target.canonicalUrl,
      }),
    }
  );

  if (storyRes.status === 401 || storyRes.status === 403) {
    throw new InstagramResolveError(
      'Sesi tidak diizinkan mengakses Story ini. Pastikan Session Cookie valid dan akun tidak dikunci.',
      401,
      'AUTH_REQUIRED'
    );
  }

  if (!storyRes.ok) {
    throw new InstagramResolveError(
      'Gagal mengambil data Instagram Story saat ini. Coba lagi beberapa saat.',
      502,
      'EXTRACTION_FAILED'
    );
  }

  const storyJson = (await storyRes.json()) as {
    reels_media?: Array<{
      user?: { username?: string; full_name?: string; profile_pic_url?: string };
      items?: Array<Record<string, any>>;
    }>;
    reels?: Record<string, { items?: Array<Record<string, any>> }>;
  };

  const reelObj = storyJson?.reels_media?.[0] || storyJson?.reels?.[reelId];
  const rawItems = reelObj?.items || [];

  if (rawItems.length === 0) {
    throw new InstagramResolveError(
      `Tidak ada Story aktif yang tersedia untuk @${resolvedUsername} (atau akun bersifat privat dan belum Anda ikuti).`,
      404,
      'NOT_FOUND'
    );
  }

  const mappedItems: MediaItem[] = [];
  let targetSlideIndex = 0;

  rawItems.forEach((rawItem: Record<string, any>, idx: number) => {
    const bestVideo = pickBestCandidate(rawItem.video_versions);
    const bestImg = pickBestCandidate(rawItem.image_versions2?.candidates);
    const pk = String(rawItem.pk || rawItem.id || idx);
    if (target.storyId && pk.startsWith(target.storyId)) {
      targetSlideIndex = mappedItems.length;
    }

    if (bestVideo?.url) {
      mappedItems.push({
        id: pk,
        index: mappedItems.length,
        type: 'video',
        mediaUrl: bestVideo.url,
        thumbnailUrl: bestImg?.url || bestVideo.url,
        audioUrl: extractDashAudioUrl(rawItem.video_dash_manifest),
        width: bestVideo.width || rawItem.original_width,
        height: bestVideo.height || rawItem.original_height,
        durationSec: rawItem.video_duration ? Number(rawItem.video_duration) : undefined,
        variants: buildVariantsFromCandidates(rawItem.video_versions),
      });
    } else if (bestImg?.url) {
      mappedItems.push({
        id: pk,
        index: mappedItems.length,
        type: 'image',
        mediaUrl: bestImg.url,
        thumbnailUrl: bestImg.url,
        width: bestImg.width || rawItem.original_width,
        height: bestImg.height || rawItem.original_height,
        variants: buildVariantsFromCandidates(rawItem.image_versions2?.candidates),
      });
    }
  });

  if (mappedItems.length === 0) {
    throw new InstagramResolveError('Media Story tidak ditemukan atau format belum didukung.', 404, 'NOT_FOUND');
  }

  return {
    id: target.storyId || reelId,
    sourceUrl: target.canonicalUrl,
    mediaType: 'story',
    authorUsername: storyJson?.reels_media?.[0]?.user?.username || resolvedUsername,
    authorFullName: storyJson?.reels_media?.[0]?.user?.full_name || resolvedFullName,
    authorAvatarUrl: resolvedAvatar,
    caption: `Story @${resolvedUsername}`,
    timestamp: rawItems[targetSlideIndex]?.taken_at
      ? new Date(Number(rawItems[targetSlideIndex].taken_at) * 1000).toISOString()
      : undefined,
    items: mappedItems,
    targetSlideIndex,
  };
}

export async function resolveInstagramMedia(
  rawUrl: string,
  rawSessionCookie?: string
): Promise<ResolvedMedia> {
  const target = parseInstagramUrl(rawUrl);
  const cookie = sanitizeSessionCookie(rawSessionCookie);

  if (target.kind === 'story' || target.kind === 'highlight') {
    return resolveStoryOrHighlight(target, cookie);
  }

  const shortcode = target.shortcode!;

  // 1. Authenticated API v1 when session cookie is provided
  if (cookie) {
    const apiV1 = await tryApiV1MediaInfo(shortcode, cookie).catch(() => null);
    if (apiV1) return apiV1;
  }

  // 2. Public Embed endpoint (works cleanly for public Posts, Carousels, Reels)
  const fromEmbed = await tryEmbedExtraction(target, cookie).catch(() => null);
  if (fromEmbed && (fromEmbed.fromStructuredJson || fromEmbed.media.items.length > 1)) {
    return fromEmbed.media;
  }

  // 3. Public GraphQL endpoint (preserves full multi-slide edge_sidecar_to_children)
  const fromGraphql = await tryPublicGraphQL(target, cookie).catch(() => null);
  if (fromGraphql) return fromGraphql;

  // 4. Direct HTML page & OpenGraph fallback
  const fromHtml = await tryDirectHtmlPageExtraction(target, cookie).catch(() => null);
  if (fromHtml) return fromHtml;

  // 5. Fallback to 1-item DOM embed match if GraphQL & HTML did not resolve
  if (fromEmbed) return fromEmbed.media;

  if (!cookie) {
    throw new InstagramResolveError(
      'Media tidak dapat diambil secara publik (mungkin akun privat, dibatasi usia, atau sedang dibatasi Instagram). Coba tambahkan Session Cookie opsional di Pengaturan Sesi.',
      401,
      'AUTH_REQUIRED'
    );
  }

  throw new InstagramResolveError(
    'Postingan tidak ditemukan atau tautan sudah kedaluwarsa. Pastikan tautan benar dan akun dapat diakses oleh sesi Anda.',
    404,
    'NOT_FOUND'
  );
}
