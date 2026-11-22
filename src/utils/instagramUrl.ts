const ALLOWED_IG_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am',
]);

export function extractValidInstagramUrl(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Match explicit URL inside text or bare instagram domain
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/[^\s"'<>]+/i
  );
  if (!urlMatch?.[0]) return null;

  let candidate = urlMatch[0].replace(/[),.;!?]+$/, '');
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!ALLOWED_IG_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const isPostOrReel =
      (['p', 'reel', 'reels', 'tv'].includes(segments[0]) && Boolean(segments[1])) ||
      (segments.length >= 3 && ['p', 'reel', 'reels', 'tv'].includes(segments[1]) && Boolean(segments[2]));

    const isStoryOrHighlight =
      segments[0] === 'stories' && Boolean(segments[1]);

    if (!isPostOrReel && !isStoryOrHighlight) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
