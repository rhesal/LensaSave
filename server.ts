import express from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  InstagramResolveError,
  isAllowedMediaUrl,
  resolveInstagramMedia,
  safeFetchWithRedirectCheck,
  sanitizeFilename,
} from './server/instagram.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '64kb' }));

app.post('/api/instagram/resolve', async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    const headerSession = req.header('x-ig-session');
    const bodySession = typeof req.body?.sessionCookie === 'string' ? req.body.sessionCookie : undefined;
    const sessionCookie = headerSession || bodySession;

    const resolved = await resolveInstagramMedia(url, sessionCookie);
    res.json(resolved);
  } catch (err) {
    if (err instanceof InstagramResolveError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({
      error: 'Terjadi kesalahan pada server saat memproses tautan Instagram.',
      code: 'EXTRACTION_FAILED',
    });
  }
});

app.get('/api/instagram/meta', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!rawUrl || !isAllowedMediaUrl(rawUrl)) {
    res.status(400).json({ error: 'URL media tidak valid atau di luar domain CDN Instagram.' });
    return;
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: 'https://www.instagram.com/',
    'Accept-Encoding': 'identity',
  };

  try {
    let sizeBytes: number | null = null;
    const headRes = await safeFetchWithRedirectCheck(rawUrl, {
      method: 'HEAD',
      headers,
      timeoutMs: 8000,
    });

    const headLen = Number(headRes.headers.get('content-length'));
    if (headRes.ok && Number.isFinite(headLen) && headLen > 0) {
      sizeBytes = headLen;
    } else {
      const rangeRes = await safeFetchWithRedirectCheck(rawUrl, {
        method: 'GET',
        headers: { ...headers, Range: 'bytes=0-0' },
        timeoutMs: 8000,
      });
      const contentRange = rangeRes.headers.get('content-range');
      const totalMatch = contentRange?.match(/\/(\d+)$/);
      if (totalMatch?.[1]) {
        const parsed = Number(totalMatch[1]);
        if (Number.isFinite(parsed) && parsed > 0) sizeBytes = parsed;
      } else {
        const len = Number(rangeRes.headers.get('content-length'));
        if (rangeRes.ok && Number.isFinite(len) && len > 0) sizeBytes = len;
      }
      await rangeRes.body?.cancel().catch(() => undefined);
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ sizeBytes });
  } catch {
    res.json({ sizeBytes: null });
  }
});

app.get('/api/instagram/proxy', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const mode = req.query.mode === 'inline' ? 'inline' : 'download';
  const requestedFilename =
    typeof req.query.filename === 'string' ? req.query.filename : 'lensasave_media';

  if (!rawUrl || !isAllowedMediaUrl(rawUrl)) {
    res.status(400).json({ error: 'URL media tidak valid atau di luar domain CDN Instagram.' });
    return;
  }

  try {
    const forwardHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
      'Accept-Encoding': 'identity',
    };

    const rangeHeader = req.header('range');
    if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader)) {
      forwardHeaders.Range = rangeHeader;
    }

    const upstream = await safeFetchWithRedirectCheck(rawUrl, {
      headers: forwardHeaders,
      timeoutMs: 30000,
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status || 502).json({ error: 'Gagal mengunduh berkas media dari CDN.' });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=600');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const safeName = sanitizeFilename(requestedFilename);
    if (mode === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
    nodeStream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
    nodeStream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Koneksi ke CDN media Instagram terputus.' });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LensaSave server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
