import JSZip from 'jszip';

export function buildProxyUrl(
  mediaUrl: string,
  filename: string,
  mode: 'inline' | 'download' = 'inline'
): string {
  const params = new URLSearchParams({
    url: mediaUrl,
    filename,
    mode,
  });
  return `/api/instagram/proxy?${params.toString()}`;
}

export function triggerProxyDownload(mediaUrl: string, filename: string): void {
  const href = buildProxyUrl(mediaUrl, filename, 'download');
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch += 1) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function fetchWithProgress(
  url: string,
  onProgress: (percent: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Gagal mengunduh stream media dari server.');
  }

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : 0;

  if (!response.body) {
    const buf = await response.arrayBuffer();
    onProgress(100);
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      if (totalBytes > 0) {
        onProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
      }
    }
  }

  const merged = new Uint8Array(receivedBytes);
  let position = 0;
  for (const chunk of chunks) {
    merged.set(chunk, position);
    position += chunk.byteLength;
  }
  onProgress(100);
  return merged.buffer;
}

export async function downloadMediaWithProgress(params: {
  mediaUrl: string;
  filename: string;
  signal?: AbortSignal;
  onProgress: (info: {
    receivedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  }) => void;
}): Promise<void> {
  const { mediaUrl, filename, signal, onProgress } = params;
  const proxyUrl = buildProxyUrl(mediaUrl, filename, 'inline');

  const response = await fetch(proxyUrl, { signal });
  if (!response.ok) {
    throw new Error('Gagal mengunduh berkas media dari server.');
  }

  const totalHeader = response.headers.get('content-length');
  const parsedTotal = totalHeader ? Number(totalHeader) : NaN;
  const totalBytes = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  onProgress({
    receivedBytes: 0,
    totalBytes,
    percent: totalBytes ? 0 : null,
  });

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: contentType });
    onProgress({
      receivedBytes: buffer.byteLength,
      totalBytes: totalBytes ?? buffer.byteLength,
      percent: 100,
    });
    triggerBlobDownload(blob, filename);
    return;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      const percent = totalBytes
        ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
        : null;
      onProgress({ receivedBytes, totalBytes, percent });
    }
  }

  const merged = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const blob = new Blob([merged.buffer], { type: contentType });
  onProgress({
    receivedBytes,
    totalBytes: totalBytes ?? receivedBytes,
    percent: 100,
  });
  triggerBlobDownload(blob, filename);
}

export type VideoExportFormat = 'mp4' | 'webm';
export type ImageExportFormat = 'jpg' | 'png' | 'webp';
export type ExportFormat = VideoExportFormat | ImageExportFormat;

export function isWebmEncodingSupported(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  return (
    MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ||
    MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ||
    MediaRecorder.isTypeSupported('video/webm')
  );
}

async function fetchBlobWithProgress(
  mediaUrl: string,
  filename: string,
  signal: AbortSignal | undefined,
  onProgress: (info: {
    receivedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  }) => void
): Promise<Blob> {
  const proxyUrl = buildProxyUrl(mediaUrl, filename, 'inline');
  const response = await fetch(proxyUrl, { signal });
  if (!response.ok) {
    throw new Error('Gagal mengunduh berkas media dari server.');
  }

  const totalHeader = response.headers.get('content-length');
  const parsedTotal = totalHeader ? Number(totalHeader) : NaN;
  const totalBytes = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress({
      receivedBytes: buffer.byteLength,
      totalBytes: totalBytes ?? buffer.byteLength,
      percent: 100,
    });
    return new Blob([buffer], { type: contentType });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      const percent = totalBytes
        ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
        : null;
      onProgress({ receivedBytes, totalBytes, percent });
    }
  }

  const merged = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob([merged.buffer], { type: contentType });
}

export interface MediaVisualFilters {
  brightness: number;
  contrast: number;
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
}

export function buildCssFilterString(filters?: MediaVisualFilters): string | undefined {
  if (!filters) return undefined;
  const parts: string[] = [];
  if (filters.brightness !== 100) {
    parts.push(`brightness(${filters.brightness}%)`);
  }
  if (filters.contrast !== 100) {
    parts.push(`contrast(${filters.contrast}%)`);
  }
  if (filters.grayscale) {
    parts.push('grayscale(100%)');
  }
  if (filters.sepia) {
    parts.push('sepia(100%)');
  }
  if (filters.invert) {
    parts.push('invert(100%)');
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

async function convertImageBlob(
  sourceBlob: Blob,
  targetFormat: 'jpg' | 'png' | 'webp',
  filters?: MediaVisualFilters
): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D tidak tersedia untuk konversi gambar.');
    }
    const filterStr = buildCssFilterString(filters);
    if (filterStr) {
      ctx.filter = filterStr;
    }
    ctx.drawImage(bitmap, 0, 0);
    const mimeType =
      targetFormat === 'png'
        ? 'image/png'
        : targetFormat === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    const quality = targetFormat === 'jpg' ? 0.94 : 0.92;
    const converted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality)
    );
    if (!converted) {
      throw new Error(`Gagal mengonversi gambar ke format ${targetFormat.toUpperCase()}.`);
    }
    return converted;
  } finally {
    bitmap.close();
  }
}

async function convertVideoBlobToWebm(
  sourceBlob: Blob,
  signal: AbortSignal | undefined,
  onConvertProgress: (percent: number) => void
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  let audioCtx: AudioContext | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve();
      const onError = () => reject(new Error('Gagal memuat video untuk konversi WEBM.'));
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
    });

    const captureFn =
      (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
        .captureStream ||
      (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;

    if (!captureFn) {
      throw new Error('Browser ini tidak mendukung konversi video ke WEBM.');
    }

    const rawStream = captureFn.call(video);
    const tracks: MediaStreamTrack[] = [...rawStream.getVideoTracks()];

    // Route audio silently through Web Audio API so capture preserves audio without playing out loud
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
      const sourceNode = audioCtx.createMediaElementSource(video);
      const destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);
      tracks.push(...destNode.stream.getAudioTracks());
    } catch {
      tracks.push(...rawStream.getAudioTracks());
    }

    const combinedStream = new MediaStream(tracks);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      const cleanupListeners = () => {
        signal?.removeEventListener('abort', handleAbort);
      };

      const handleAbort = () => {
        if (recorder.state !== 'inactive') recorder.stop();
        video.pause();
        cleanupListeners();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal?.addEventListener('abort', handleAbort, { once: true });

      recorder.onstop = () => {
        cleanupListeners();
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };

      recorder.onerror = () => {
        cleanupListeners();
        reject(new Error('Terjadi kesalahan saat merekam stream WEBM.'));
      };

      video.ontimeupdate = () => {
        if (video.duration > 0 && Number.isFinite(video.duration)) {
          onConvertProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
        }
      };

      video.onended = () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.start(250);
      void video.play().catch((err) => {
        if (recorder.state !== 'inactive') recorder.stop();
        cleanupListeners();
        reject(err instanceof Error ? err : new Error('Gagal memutar stream untuk konversi WEBM.'));
      });
    });

    return resultBlob;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
    if (audioCtx) {
      await audioCtx.close().catch(() => undefined);
    }
  }
}

export async function downloadMediaWithFormat(params: {
  mediaUrl: string;
  filename: string;
  format: ExportFormat;
  filters?: MediaVisualFilters;
  signal?: AbortSignal;
  onProgress: (info: {
    label: string;
    receivedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  }) => void;
}): Promise<void> {
  const { mediaUrl, filename, format, filters, signal, onProgress } = params;
  const hasActiveImageFilters = Boolean(buildCssFilterString(filters));

  if (format === 'mp4' || (format === 'jpg' && !hasActiveImageFilters)) {
    await downloadMediaWithProgress({
      mediaUrl,
      filename,
      signal,
      onProgress: ({ receivedBytes, totalBytes, percent }) => {
        onProgress({
          label: format === 'mp4' ? 'Mengunduh video MP4...' : 'Mengunduh foto JPG...',
          receivedBytes,
          totalBytes,
          percent,
        });
      },
    });
    return;
  }

  // Download original source first before client-side conversion / filter baking
  const isVideoTarget = format === 'webm';
  const sourceBlob = await fetchBlobWithProgress(
    mediaUrl,
    filename,
    signal,
    ({ receivedBytes, totalBytes, percent }) => {
      const scaledPercent =
        percent !== null ? Math.round(percent * (isVideoTarget ? 0.45 : 0.75)) : null;
      onProgress({
        label: isVideoTarget ? 'Mengunduh sumber MP4...' : 'Mengunduh sumber gambar...',
        receivedBytes,
        totalBytes,
        percent: scaledPercent,
      });
    }
  );

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (format === 'jpg' || format === 'png' || format === 'webp') {
    onProgress({
      label: hasActiveImageFilters
        ? `Menerapkan filter & mengemas ${format.toUpperCase()}...`
        : `Mengonversi ke ${format.toUpperCase()}...`,
      receivedBytes: sourceBlob.size,
      totalBytes: sourceBlob.size,
      percent: 85,
    });
    const converted = await convertImageBlob(sourceBlob, format, filters);
    onProgress({
      label: `File ${format.toUpperCase()} siap`,
      receivedBytes: converted.size,
      totalBytes: converted.size,
      percent: 100,
    });
    triggerBlobDownload(converted, filename);
    return;
  }

  // Video MP4 -> WEBM conversion
  onProgress({
    label: 'Mengonversi video ke WEBM...',
    receivedBytes: sourceBlob.size,
    totalBytes: sourceBlob.size,
    percent: 48,
  });

  const webmBlob = await convertVideoBlobToWebm(sourceBlob, signal, (convPct) => {
    onProgress({
      label: 'Mengonversi video ke WEBM...',
      receivedBytes: sourceBlob.size,
      totalBytes: sourceBlob.size,
      percent: Math.min(99, 48 + Math.round(convPct * 0.51)),
    });
  });

  onProgress({
    label: 'Video WEBM siap',
    receivedBytes: webmBlob.size,
    totalBytes: webmBlob.size,
    percent: 100,
  });
  triggerBlobDownload(webmBlob, filename);
}

export async function downloadCarouselAsZip(params: {
  items: Array<{ mediaUrl: string; filename: string; type?: 'image' | 'video' }>;
  zipFilename: string;
  imageFormat?: ImageExportFormat;
  imageFilters?: MediaVisualFilters;
  signal?: AbortSignal;
  onProgress: (info: {
    label: string;
    currentItem: number;
    totalItems: number;
    receivedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  }) => void;
}): Promise<void> {
  const {
    items,
    zipFilename,
    imageFormat = 'jpg',
    imageFilters,
    signal,
    onProgress,
  } = params;
  const zip = new JSZip();
  const totalItems = items.length;
  const hasActiveImageFilters = Boolean(buildCssFilterString(imageFilters));
  let cumulativeBytes = 0;

  for (let i = 0; i < totalItems; i += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { mediaUrl, filename, type } = items[i];
    const proxyUrl = buildProxyUrl(mediaUrl, filename, 'inline');
    const response = await fetch(proxyUrl, { signal });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh slide ${i + 1} (${filename}).`);
    }

    const totalHeader = response.headers.get('content-length');
    const parsedTotal = totalHeader ? Number(totalHeader) : NaN;
    const itemTotalBytes = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

    let itemBytes = 0;
    let fileBuffer: Uint8Array<ArrayBuffer>;

    if (!response.body) {
      const arr = await response.arrayBuffer();
      fileBuffer = new Uint8Array(arr);
      itemBytes = fileBuffer.byteLength;
      cumulativeBytes += itemBytes;
      const overallPct = Math.min(88, Math.round(((i + 1) / totalItems) * 88));
      onProgress({
        label: `Mengambil slide ${i + 1} dari ${totalItems}...`,
        currentItem: i + 1,
        totalItems,
        receivedBytes: cumulativeBytes,
        totalBytes: null,
        percent: overallPct,
      });
    } else {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          itemBytes += value.byteLength;
          cumulativeBytes += value.byteLength;
          const itemFraction = itemTotalBytes ? Math.min(1, itemBytes / itemTotalBytes) : 0.5;
          const overallPct = Math.min(
            88,
            Math.round(((i + itemFraction) / totalItems) * 88)
          );
          onProgress({
            label: `Mengambil slide ${i + 1} dari ${totalItems}...`,
            currentItem: i + 1,
            totalItems,
            receivedBytes: cumulativeBytes,
            totalBytes: null,
            percent: overallPct,
          });
        }
      }
      fileBuffer = new Uint8Array(itemBytes);
      let pos = 0;
      for (const chunk of chunks) {
        fileBuffer.set(chunk, pos);
        pos += chunk.byteLength;
      }
    }

    if (type === 'image' && (hasActiveImageFilters || imageFormat !== 'jpg')) {
      const sourceBlob = new Blob([fileBuffer], { type: 'image/jpeg' });
      const convertedBlob = await convertImageBlob(sourceBlob, imageFormat, imageFilters);
      const convertedArrayBuffer = await convertedBlob.arrayBuffer();
      zip.file(filename, new Uint8Array(convertedArrayBuffer));
    } else {
      zip.file(filename, fileBuffer);
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onProgress({
    label: 'Mengemas arsip ZIP...',
    currentItem: totalItems,
    totalItems,
    receivedBytes: cumulativeBytes,
    totalBytes: cumulativeBytes,
    percent: 90,
  });

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => {
      if (signal?.aborted) return;
      const pct = Math.min(99, 90 + Math.round(meta.percent * 0.09));
      onProgress({
        label: 'Mengemas arsip ZIP...',
        currentItem: totalItems,
        totalItems,
        receivedBytes: cumulativeBytes,
        totalBytes: cumulativeBytes,
        percent: pct,
      });
    }
  );

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onProgress({
    label: 'Arsip ZIP siap',
    currentItem: totalItems,
    totalItems,
    receivedBytes: zipBlob.size,
    totalBytes: zipBlob.size,
    percent: 100,
  });

  triggerBlobDownload(zipBlob, zipFilename);
}

export async function downloadCarouselIndividually(params: {
  items: Array<{
    mediaUrl: string;
    filename: string;
    format: ExportFormat;
    type: 'image' | 'video';
  }>;
  imageFilters?: MediaVisualFilters;
  signal?: AbortSignal;
  onProgress: (info: {
    label: string;
    currentItem: number;
    totalItems: number;
    receivedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  }) => void;
}): Promise<void> {
  const { items, imageFilters, signal, onProgress } = params;
  const totalItems = items.length;
  let completedBytes = 0;

  for (let i = 0; i < totalItems; i += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const entry = items[i];
    let lastItemBytes = 0;

    await downloadMediaWithFormat({
      mediaUrl: entry.mediaUrl,
      filename: entry.filename,
      format: entry.format,
      filters: entry.type === 'image' ? imageFilters : undefined,
      signal,
      onProgress: ({ receivedBytes, totalBytes, percent }) => {
        lastItemBytes = Math.max(lastItemBytes, receivedBytes);
        const itemFraction = percent !== null ? percent / 100 : 0.5;
        const overallPct = Math.min(
          100,
          Math.round(((i + itemFraction) / totalItems) * 100)
        );
        onProgress({
          label: `Mengunduh slide ${i + 1} dari ${totalItems}...`,
          currentItem: i + 1,
          totalItems,
          receivedBytes: completedBytes + receivedBytes,
          totalBytes: totalBytes !== null && totalItems === 1 ? totalBytes : null,
          percent: overallPct,
        });
      },
    });

    completedBytes += lastItemBytes;
    if (i < totalItems - 1 && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export async function extractAndDownloadAudio(params: {
  mediaUrl: string;
  audioUrl?: string;
  filenameBase: string;
  onProgress: (percent: number, stageLabel: string) => void;
}): Promise<void> {
  const { mediaUrl, audioUrl, filenameBase, onProgress } = params;

  // Prefer native DASH M4A audio stream if Instagram provided one
  if (audioUrl) {
    onProgress(15, 'Mengunduh trek audio asli...');
    const proxyUrl = buildProxyUrl(audioUrl, `${filenameBase}.m4a`, 'inline');
    const buffer = await fetchWithProgress(proxyUrl, (pct) => {
      onProgress(Math.max(15, pct), 'Mengunduh trek audio asli...');
    });
    const blob = new Blob([buffer], { type: 'audio/mp4' });
    triggerBlobDownload(blob, `${filenameBase}.m4a`);
    onProgress(100, 'Audio M4A siap');
    return;
  }

  // Otherwise decode MP4 audio track directly in browser and package as WAV
  onProgress(10, 'Memuat stream video Reels...');
  const proxyVideoUrl = buildProxyUrl(mediaUrl, `${filenameBase}.mp4`, 'inline');
  const mp4Buffer = await fetchWithProgress(proxyVideoUrl, (pct) => {
    onProgress(10 + Math.round(pct * 0.55), 'Memuat stream video Reels...');
  });

  onProgress(72, 'Mengekstrak trek audio...');
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(mp4Buffer.slice(0));
    onProgress(90, 'Mengemas file audio...');
    const wavBlob = encodeAudioBufferToWav(decoded);
    triggerBlobDownload(wavBlob, `${filenameBase}.wav`);
    onProgress(100, 'Audio WAV siap');
  } catch {
    throw new Error('Video Reels ini tidak memiliki trek audio yang dapat diekstrak.');
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
