import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutGrid,
  List,
  Music,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { MediaItem, ResolveApiError, ResolvedMedia } from '../types/instagram';
import { extractValidInstagramUrl } from '../utils/instagramUrl';
import {
  buildCssFilterString,
  buildProxyUrl,
  downloadCarouselAsZip,
  downloadCarouselIndividually,
  downloadMediaWithFormat,
  extractAndDownloadAudio,
  isWebmEncodingSupported,
  type ExportFormat,
  type ImageExportFormat,
  type VideoExportFormat,
} from '../utils/audioExtractor';
import { DownloadProgressBar, type DownloadProgressState } from './DownloadProgressBar';

interface MediaStageProps {
  media: ResolvedMedia | null;
  isLoading: boolean;
  error: ResolveApiError | null;
  onRetry: () => void;
  onOpenSessionModal: () => void;
  onNotify: (msg: string) => void;
}

function formatDuration(sec?: number): string | null {
  if (!sec || !Number.isFinite(sec)) return null;
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMediaKindLabel(kind: ResolvedMedia['mediaType']): string {
  switch (kind) {
    case 'reel':
      return 'Reels';
    case 'carousel':
      return 'Carousel';
    case 'story':
      return 'Story';
    default:
      return 'Post';
  }
}

export const MediaStage: React.FC<MediaStageProps> = ({
  media,
  isLoading,
  error,
  onRetry,
  onOpenSessionModal,
  onNotify,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [failedThumbIds, setFailedThumbIds] = useState<Set<string>>(new Set());
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [audioStageLabel, setAudioStageLabel] = useState('');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState | null>(null);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<string, string>>({});
  const [videoFormat, setVideoFormat] = useState<VideoExportFormat>('mp4');
  const [imageFormat, setImageFormat] = useState<ImageExportFormat>('jpg');
  const [carouselViewMode, setCarouselViewMode] = useState<'grid' | 'list'>('grid');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [filterGrayscale, setFilterGrayscale] = useState(false);
  const [filterSepia, setFilterSepia] = useState(false);
  const [filterInvert, setFilterInvert] = useState(false);
  const [metaSizeBytes, setMetaSizeBytes] = useState<number | null>(null);
  const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
  const [downlinkMbps, setDownlinkMbps] = useState<number | null>(null);
  const [isProbingMeta, setIsProbingMeta] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null
  );
  const downloadAbortRef = useRef<AbortController | null>(null);
  const webmSupported = isWebmEncodingSupported();

  useEffect(() => {
    return () => {
      downloadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!media) return;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    const startIdx =
      typeof media.targetSlideIndex === 'number' &&
      media.targetSlideIndex >= 0 &&
      media.targetSlideIndex < media.items.length
        ? media.targetSlideIndex
        : 0;
    setActiveIndex(startIdx);
    setSelectedIndices(new Set([startIdx]));
    setFailedThumbIds(new Set());
    setMainImageFailed(false);
    setCopiedCaption(false);
    setAudioProgress(null);
    setAudioStageLabel('');
    setAudioError(null);
    setDownloadProgress(null);
    setSelectedVariantIds({});
    setVideoFormat('mp4');
    setImageFormat('jpg');
    setBrightness(100);
    setContrast(100);
    setFilterGrayscale(false);
    setFilterSepia(false);
    setFilterInvert(false);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [media]);

  useEffect(() => {
    setMainImageFailed(false);
    setAudioError(null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [activeIndex]);

  useEffect(() => {
    if (!media || media.items.length <= 1) return;
    const totalSlides = media.items.length;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalSlides);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [media]);

  const currentItemForProbe = media?.items[activeIndex] || media?.items[0] || null;
  const currentVariantUrlForProbe = currentItemForProbe
    ? currentItemForProbe.variants?.find((v) => v.id === selectedVariantIds[currentItemForProbe.id])?.url ||
      currentItemForProbe.variants?.[0]?.url ||
      currentItemForProbe.mediaUrl
    : null;

  useEffect(() => {
    if (!currentVariantUrlForProbe) {
      setMetaSizeBytes(null);
      setNetworkLatencyMs(null);
      setDownlinkMbps(null);
      setIsProbingMeta(false);
      return;
    }

    const controller = new AbortController();
    setIsProbingMeta(true);
    setMetaSizeBytes(null);

    const netInfo = (
      navigator as Navigator & {
        connection?: { rtt?: number; downlink?: number };
      }
    ).connection;

    const start = performance.now();
    fetch(`/api/instagram/meta?url=${encodeURIComponent(currentVariantUrlForProbe)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<{ sizeBytes?: number | null }>)
      .then((data) => {
        if (controller.signal.aborted) return;
        const measuredRtt = Math.max(1, Math.round(performance.now() - start));
        const connRtt = typeof netInfo?.rtt === 'number' && netInfo.rtt > 0 ? netInfo.rtt : null;
        const connDownlink =
          typeof netInfo?.downlink === 'number' && netInfo.downlink > 0 ? netInfo.downlink : null;

        setMetaSizeBytes(typeof data.sizeBytes === 'number' ? data.sizeBytes : null);
        setNetworkLatencyMs(connRtt ?? measuredRtt);
        setDownlinkMbps(connDownlink);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const measuredRtt = Math.max(1, Math.round(performance.now() - start));
        setMetaSizeBytes(null);
        setNetworkLatencyMs(measuredRtt);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsProbingMeta(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [currentVariantUrlForProbe]);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6" aria-live="polite">
        <div className="grid grid-cols-1 gap-8 rounded-2xl border border-[#E4E4E7] bg-white p-5 sm:p-6 dark:border-[#27272A] dark:bg-[#121216] lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="aspect-[4/3] w-full rounded-xl bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
          </div>
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="h-4 w-40 rounded bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
              <div className="h-6 w-3/4 rounded bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
              <div className="space-y-2 pt-2">
                <div className="h-3.5 w-full rounded bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
                <div className="h-3.5 w-5/6 rounded bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
                <div className="h-3.5 w-2/3 rounded bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-12 w-full rounded-xl bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
              <div className="h-12 w-full rounded-xl bg-[#F4F4F5] dark:bg-[#1A1A20] animate-pulse" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    const isAuthError = error.code === 'AUTH_REQUIRED';
    return (
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6" aria-live="assertive">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-6 sm:p-8 dark:border-[#27272A] dark:bg-[#121216]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#DC2626]/35 bg-[#DC2626]/10 dark:border-[#FF4D4D]/35 dark:bg-[#FF4D4D]/10">
                <AlertCircle className="h-5 w-5 text-[#DC2626] dark:text-[#FF4D4D]" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                  {isAuthError ? 'Diperlukan Sesi untuk Mengakses Konten Ini' : 'Gagal Mengambil Media Instagram'}
                </h2>
                <p className="mt-1.5 text-sm text-[#52525B] dark:text-[#A1A1AA] max-w-2xl leading-relaxed">
                  {error.error}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {isAuthError && (
                <button
                  type="button"
                  onClick={onOpenSessionModal}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#09090B] px-4 py-2.5 text-xs font-semibold text-[#FAFAFA] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] transition-colors whitespace-nowrap min-h-[40px] cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Atur Session Cookie</span>
                </button>
              )}
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-2.5 text-xs font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#3F3F46] transition-colors whitespace-nowrap min-h-[40px] cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Coba Lagi</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!media || media.items.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 dark:border-[#27272A] dark:bg-[#121216]">
            <ImageIcon className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA] mb-3" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">Foto & Post HD</h2>
            <p className="mt-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              Simpan foto resolusi tertinggi dari postingan publik secara langsung.
            </p>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 dark:border-[#27272A] dark:bg-[#121216]">
            <Layers className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA] mb-3" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">Carousel Multi-Slide</h2>
            <p className="mt-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              Pratinjau seluruh slide dalam filmstrip, pilih satuan atau unduh sekaligus.
            </p>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 dark:border-[#27272A] dark:bg-[#121216]">
            <Music className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA] mb-3" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">Reels & Ekstrak Audio</h2>
            <p className="mt-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              Unduh video MP4 tanpa watermark atau pisahkan trek audionya saja.
            </p>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 dark:border-[#27272A] dark:bg-[#121216]">
            <Film className="h-5 w-5 text-[#09090B] dark:text-[#FAFAFA] mb-3" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">Instagram Story</h2>
            <p className="mt-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              Dukungan Story aktif dengan opsi Session Cookie lokal yang aman.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const activeItem: MediaItem = media.items[activeIndex] || media.items[0];
  const isCarousel = media.items.length > 1;
  const durationLabel = formatDuration(activeItem.durationSec);
  const activeVariants = activeItem.variants && activeItem.variants.length > 0
    ? activeItem.variants
    : [
        {
          id: 'default',
          label:
            activeItem.width && activeItem.height
              ? `Asli (${activeItem.width}×${activeItem.height})`
              : 'Resolusi Asli',
          url: activeItem.mediaUrl,
          width: activeItem.width,
          height: activeItem.height,
        },
      ];

  const getSelectedVariant = (item: MediaItem) => {
    const variants = item.variants;
    if (!variants || variants.length === 0) return null;
    const chosenId = selectedVariantIds[item.id];
    return variants.find((v) => v.id === chosenId) || variants[0];
  };

  const selectedActiveVariant = getSelectedVariant(activeItem);
  const selectedFormat: ExportFormat =
    activeItem.type === 'video' ? videoFormat : imageFormat;

  const inlineMediaUrl = buildProxyUrl(
    activeItem.mediaUrl,
    `preview_${activeItem.id}.${activeItem.type === 'video' ? 'mp4' : 'jpg'}`,
    'inline'
  );

  const buildDownloadFilename = (item: MediaItem, idx: number, ext?: string) => {
    const extension = ext || (item.type === 'video' ? 'mp4' : 'jpg');
    const slug = media.shortcode || media.id;
    const slideSuffix = media.items.length > 1 ? `_slide_${String(idx + 1).padStart(2, '0')}` : '';
    return `lensasave_${media.authorUsername}_${slug}${slideSuffix}.${extension}`;
  };

  const startSingleDownload = async (
    item: MediaItem,
    idx: number,
    formatOverride?: ExportFormat
  ) => {
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    const chosenFormat: ExportFormat =
      formatOverride || (item.type === 'video' ? videoFormat : imageFormat);
    const chosenVariant = getSelectedVariant(item);
    const targetMediaUrl = chosenVariant?.url || item.mediaUrl;
    const filename = buildDownloadFilename(item, idx, chosenFormat);
    const id = `${item.id}_${Date.now()}`;
    const initialLabel =
      item.type === 'video'
        ? `Mengunduh video ${chosenFormat.toUpperCase()}...`
        : `Mengunduh foto ${chosenFormat.toUpperCase()}...`;

    setDownloadProgress({
      id,
      filename,
      label: initialLabel,
      receivedBytes: 0,
      totalBytes: null,
      percent: 0,
      status: 'downloading',
    });

    try {
      await downloadMediaWithFormat({
        mediaUrl: targetMediaUrl,
        filename,
        format: chosenFormat,
        filters:
          item.type === 'image'
            ? {
                brightness,
                contrast,
                grayscale: filterGrayscale,
                sepia: filterSepia,
                invert: filterInvert,
              }
            : undefined,
        signal: controller.signal,
        onProgress: ({ label, receivedBytes, totalBytes, percent }) => {
          setDownloadProgress((prev) =>
            prev && prev.id === id
              ? { ...prev, label, receivedBytes, totalBytes, percent }
              : prev
          );
        },
      });

      setDownloadProgress((prev) =>
        prev && prev.id === id
          ? { ...prev, percent: 100, status: 'completed' }
          : prev
      );
      onNotify(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      if (controller.signal.aborted) {
        setDownloadProgress((prev) =>
          prev && prev.id === id ? { ...prev, status: 'cancelled' } : prev
        );
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Gagal mengunduh berkas media.';
      setDownloadProgress((prev) =>
        prev && prev.id === id
          ? { ...prev, status: 'error', errorMessage: message }
          : prev
      );
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
      }
    }
  };

  const handleDownloadActive = () => {
    void startSingleDownload(activeItem, activeIndex, selectedFormat);
  };

  const toggleSlideSelected = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (selectedIndices.size === media.items.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(media.items.map((_, i) => i)));
    }
  };

  const handleBatchDownload = async (
    indices: number[],
    mode: 'zip' | 'individual' = 'zip'
  ) => {
    if (indices.length === 0) return;
    const sorted = [...indices].sort((a, b) => a - b);

    // Single item selected: trigger direct single-file download
    if (sorted.length === 1) {
      const idx = sorted[0];
      const item = media.items[idx];
      if (item) {
        await startSingleDownload(item, idx);
      }
      return;
    }

    const activeImageFilters = {
      brightness,
      contrast,
      grayscale: filterGrayscale,
      sepia: filterSepia,
      invert: filterInvert,
    };

    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    const batchId = `${mode}_${Date.now()}`;

    if (mode === 'individual') {
      const individualItems = sorted
        .map((idx) => {
          const item = media.items[idx];
          if (!item) return null;
          const chosenVariant = getSelectedVariant(item);
          const itemFormat: ExportFormat =
            item.type === 'video' ? videoFormat : imageFormat;
          return {
            mediaUrl: chosenVariant?.url || item.mediaUrl,
            filename: buildDownloadFilename(item, idx, itemFormat),
            format: itemFormat,
            type: item.type,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            mediaUrl: string;
            filename: string;
            format: ExportFormat;
            type: 'image' | 'video';
          } => entry !== null
        );

      setDownloadProgress({
        id: batchId,
        filename: `${individualItems.length} slide terpilih`,
        label: `Mengunduh slide 1 dari ${individualItems.length}...`,
        receivedBytes: 0,
        totalBytes: null,
        percent: 0,
        currentItem: 1,
        totalItems: individualItems.length,
        status: 'downloading',
      });

      try {
        await downloadCarouselIndividually({
          items: individualItems,
          imageFilters: activeImageFilters,
          signal: controller.signal,
          onProgress: ({ label, currentItem, totalItems, receivedBytes, totalBytes, percent }) => {
            setDownloadProgress((prev) =>
              prev && prev.id === batchId
                ? {
                    ...prev,
                    label,
                    currentItem,
                    totalItems,
                    receivedBytes,
                    totalBytes,
                    percent,
                  }
                : prev
            );
          },
        });

        if (!controller.signal.aborted) {
          setDownloadProgress((prev) =>
            prev && prev.id === batchId
              ? { ...prev, percent: 100, status: 'completed' }
              : prev
          );
          onNotify(`${individualItems.length} slide berhasil diunduh satu per satu`);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setDownloadProgress((prev) =>
            prev && prev.id === batchId ? { ...prev, status: 'cancelled' } : prev
          );
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Gagal mengunduh slide carousel satu per satu.';
        setDownloadProgress((prev) =>
          prev && prev.id === batchId
            ? { ...prev, status: 'error', errorMessage: message }
            : prev
        );
      } finally {
        if (downloadAbortRef.current === controller) {
          downloadAbortRef.current = null;
        }
      }
      return;
    }

    // Multiple items selected: bundle into a single ZIP archive
    const slug = media.shortcode || media.id;
    const zipFilename = `lensasave_${media.authorUsername}_${slug}_${sorted.length}_slide.zip`;

    const zipItems = sorted
      .map((idx) => {
        const item = media.items[idx];
        if (!item) return null;
        const chosenVariant = getSelectedVariant(item);
        const ext = item.type === 'image' ? imageFormat : 'mp4';
        return {
          mediaUrl: chosenVariant?.url || item.mediaUrl,
          filename: buildDownloadFilename(item, idx, ext),
          type: item.type,
        };
      })
      .filter(
        (entry): entry is { mediaUrl: string; filename: string; type: 'image' | 'video' } =>
          entry !== null
      );

    setDownloadProgress({
      id: batchId,
      filename: zipFilename,
      label: `Menyiapkan arsip ZIP (${zipItems.length} slide)...`,
      receivedBytes: 0,
      totalBytes: null,
      percent: 0,
      currentItem: 1,
      totalItems: zipItems.length,
      status: 'downloading',
    });

    try {
      await downloadCarouselAsZip({
        items: zipItems,
        zipFilename,
        imageFormat,
        imageFilters: activeImageFilters,
        signal: controller.signal,
        onProgress: ({ label, currentItem, totalItems, receivedBytes, totalBytes, percent }) => {
          setDownloadProgress((prev) =>
            prev && prev.id === batchId
              ? {
                  ...prev,
                  label,
                  currentItem,
                  totalItems,
                  receivedBytes,
                  totalBytes,
                  percent,
                }
              : prev
          );
        },
      });

      if (!controller.signal.aborted) {
        setDownloadProgress((prev) =>
          prev && prev.id === batchId
            ? { ...prev, percent: 100, status: 'completed' }
            : prev
        );
        onNotify(`Arsip ZIP berisi ${zipItems.length} slide berhasil diunduh`);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setDownloadProgress((prev) =>
          prev && prev.id === batchId ? { ...prev, status: 'cancelled' } : prev
        );
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Gagal membuat arsip ZIP carousel.';
      setDownloadProgress((prev) =>
        prev && prev.id === batchId
          ? { ...prev, status: 'error', errorMessage: message }
          : prev
      );
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
      }
    }
  };

  const handleCancelDownload = () => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
  };

  const handleExtractAudio = async () => {
    if (audioProgress !== null) return;
    setAudioError(null);
    setAudioProgress(5);
    setAudioStageLabel('Menyiapkan ekstraksi...');
    try {
      const base = `lensasave_${media.authorUsername}_${media.shortcode || media.id}_audio`;
      await extractAndDownloadAudio({
        mediaUrl: activeItem.mediaUrl,
        audioUrl: activeItem.audioUrl,
        filenameBase: base,
        onProgress: (pct, label) => {
          setAudioProgress(pct);
          setAudioStageLabel(label);
        },
      });
      onNotify('File audio Reels berhasil diekstrak dan diunduh');
      setTimeout(() => {
        setAudioProgress(null);
        setAudioStageLabel('');
      }, 1500);
    } catch (err) {
      setAudioProgress(null);
      setAudioStageLabel('');
      setAudioError(
        err instanceof Error ? err.message : 'Gagal mengekstrak audio dari video ini.'
      );
    }
  };

  const handleCopyCaption = async () => {
    if (!media.caption) return;
    try {
      await navigator.clipboard.writeText(media.caption);
      setCopiedCaption(true);
      onNotify('Caption berhasil disalin');
      setTimeout(() => setCopiedCaption(false), 2000);
    } catch {
      onNotify('Tidak dapat mengakses clipboard browser');
    }
  };

  const applyZoom = (nextScale: number) => {
    const clamped = Math.min(3, Math.max(0.5, Math.round(nextScale * 100) / 100));
    setZoomScale(clamped);
    if (clamped <= 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  };

  const handlePanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoomScale <= 1 || activeItem.type !== 'image' || mainImageFailed) return;
    if ((event.target as HTMLElement).closest('button, label, input, a')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    };
  };

  const handlePanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.originX + dx,
      y: panStartRef.current.originY + dy,
    });
  };

  const handlePanPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    panStartRef.current = null;
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6" aria-live="polite">
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 sm:p-6 dark:border-[#27272A] dark:bg-[#121216]">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Studio Media Viewport + Carousel Filmstrip */}
          <div className="lg:col-span-7 space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-[#09090B] dark:border-[#27272A]">
              <div
                onPointerDown={handlePanPointerDown}
                onPointerMove={handlePanPointerMove}
                onPointerUp={handlePanPointerEnd}
                onPointerCancel={handlePanPointerEnd}
                onDoubleClick={() => {
                  if (activeItem.type === 'image' && !mainImageFailed) {
                    applyZoom(zoomScale > 1 ? 1 : 2);
                  }
                }}
                className={`relative overflow-hidden bg-[#09090B] ${
                  activeItem.type === 'image' && !mainImageFailed
                    ? zoomScale > 1
                      ? isPanning
                        ? 'cursor-grabbing select-none touch-none'
                        : 'cursor-grab select-none touch-none'
                      : 'cursor-zoom-in'
                    : ''
                }`}
              >
                {activeItem.type === 'video' ? (
                  <video
                    key={inlineMediaUrl}
                    src={inlineMediaUrl}
                    poster={
                      activeItem.thumbnailUrl
                        ? buildProxyUrl(activeItem.thumbnailUrl, `poster_${activeItem.id}.jpg`, 'inline')
                        : undefined
                    }
                    controls
                    playsInline
                    preload="metadata"
                    style={{
                      filter:
                        brightness !== 100 || contrast !== 100
                          ? `brightness(${brightness}%) contrast(${contrast}%)`
                          : undefined,
                      transform:
                        zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
                    }}
                    className="max-h-[540px] w-full object-contain mx-auto bg-black origin-center transition-transform duration-150 ease-out"
                  />
                ) : mainImageFailed ? (
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-[#F4F4F5] dark:bg-[#121216] p-6 text-center">
                    <ImageIcon className="h-8 w-8 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                    <p className="text-sm font-medium text-[#09090B] dark:text-[#FAFAFA]">
                      Pratinjau gambar tidak tersedia langsung
                    </p>
                    <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
                      Gunakan tombol Unduh di sebelah kanan untuk menyimpan file HD.
                    </p>
                  </div>
                ) : (
                  <img
                    key={inlineMediaUrl}
                    src={inlineMediaUrl}
                    alt={`Media Instagram oleh @${media.authorUsername} slide ${activeIndex + 1}`}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onError={() => setMainImageFailed(true)}
                    style={{
                      filter: buildCssFilterString({
                        brightness,
                        contrast,
                        grayscale: filterGrayscale,
                        sepia: filterSepia,
                        invert: filterInvert,
                      }),
                      transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                    }}
                    className={`max-h-[540px] w-full object-contain mx-auto origin-center ${
                      isPanning ? 'transition-none' : 'transition-transform duration-150 ease-out'
                    }`}
                  />
                )}

                {isCarousel && (
                  <>
                    <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                      <label
                        className={`pointer-events-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none min-h-[34px] backdrop-blur-sm ${
                          selectedIndices.has(activeIndex)
                            ? 'border-white bg-white text-[#09090B]'
                            : 'border-white/20 bg-black/75 text-white hover:border-white/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(activeIndex)}
                          onChange={() => toggleSlideSelected(activeIndex)}
                          aria-label={`Pilih slide ${activeIndex + 1} untuk unduhan massal`}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            selectedIndices.has(activeIndex)
                              ? 'border-[#09090B] bg-[#09090B] text-white'
                              : 'border-white/50 bg-transparent'
                          }`}
                        >
                          {selectedIndices.has(activeIndex) && <Check className="h-3 w-3" />}
                        </span>
                        <span className="font-mono-tabular whitespace-nowrap">
                          Pilih Slide {String(activeIndex + 1).padStart(2, '0')} / {String(media.items.length).padStart(2, '0')}
                        </span>
                      </label>

                      <button
                        type="button"
                        disabled={downloadProgress?.status === 'downloading'}
                        onClick={() => void startSingleDownload(activeItem, activeIndex, selectedFormat)}
                        aria-label={`Unduh langsung slide ${activeIndex + 1}`}
                        title={`Unduh langsung slide ${activeIndex + 1}`}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50 transition-colors cursor-pointer min-h-[34px] backdrop-blur-sm whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Unduh Slide</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveIndex((prev) => (prev - 1 + media.items.length) % media.items.length)
                      }
                      aria-label="Slide sebelumnya"
                      className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveIndex((prev) => (prev + 1) % media.items.length)}
                      aria-label="Slide berikutnya"
                      className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {(() => {
                const safeInstagramUrl = extractValidInstagramUrl(media.sourceUrl);
                const showZoomControls = !(activeItem.type === 'image' && mainImageFailed);
                if (!safeInstagramUrl && !showZoomControls) return null;

                return (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2 text-xs dark:border-[#27272A] dark:bg-[#09090B]">
                    <div className="flex flex-wrap items-center gap-2.5 text-[#52525B] dark:text-[#A1A1AA]">
                      {safeInstagramUrl && (
                        <a
                          href={safeInstagramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 h-8 text-xs font-medium text-[#27272A] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#D4D4D8] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-[#FAFAFA]"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                          <span>Lihat di Instagram</span>
                        </a>
                      )}
                      {showZoomControls && activeItem.type === 'image' && zoomScale > 1 && (
                        <span className="text-[#52525B] dark:text-[#71717A]">Seret gambar untuk geser</span>
                      )}
                    </div>

                    {showZoomControls && (
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          disabled={zoomScale <= 0.5}
                          onClick={() => applyZoom(zoomScale - 0.25)}
                          aria-label="Perkecil pratinjau"
                          title="Perkecil pratinjau"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        <input
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.05}
                          value={zoomScale}
                          onChange={(e) => applyZoom(Number(e.target.value))}
                          aria-label="Tingkat perbesaran pratinjau"
                          className="w-24 sm:w-28 accent-[#09090B] dark:accent-[#FAFAFA] cursor-pointer"
                        />

                        <span className="w-11 text-right font-mono-tabular text-[#09090B] dark:text-[#FAFAFA]">
                          {Math.round(zoomScale * 100)}%
                        </span>

                        <button
                          type="button"
                          disabled={zoomScale >= 3}
                          onClick={() => applyZoom(zoomScale + 0.25)}
                          aria-label="Perbesar pratinjau"
                          title="Perbesar pratinjau"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        {(zoomScale !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
                          <button
                            type="button"
                            onClick={handleResetZoom}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 h-8 text-[11px] font-medium text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            <span>100%</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Brightness, Contrast & Static Image Processing Filters */}
            <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-3 dark:border-[#27272A] dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                  <span>Penyesuaian Tampilan</span>
                  <span className="text-[#52525B] dark:text-[#71717A] font-normal">
                    · {activeItem.type === 'image' ? 'Diterapkan saat unduh foto' : 'Pratinjau studio'}
                  </span>
                </div>
                {(brightness !== 100 ||
                  contrast !== 100 ||
                  (activeItem.type === 'image' &&
                    (filterGrayscale || filterSepia || filterInvert))) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrightness(100);
                      setContrast(100);
                      setFilterGrayscale(false);
                      setFilterSepia(false);
                      setFilterInvert(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="preview-brightness" className="text-[#52525B] dark:text-[#A1A1AA]">
                      Kecerahan
                    </label>
                    <span className="font-mono-tabular text-[#09090B] dark:text-[#FAFAFA]">{brightness}%</span>
                  </div>
                  <input
                    id="preview-brightness"
                    type="range"
                    min={50}
                    max={150}
                    step={1}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-[#09090B] dark:accent-[#FAFAFA] cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="preview-contrast" className="text-[#52525B] dark:text-[#A1A1AA]">
                      Kontras
                    </label>
                    <span className="font-mono-tabular text-[#09090B] dark:text-[#FAFAFA]">{contrast}%</span>
                  </div>
                  <input
                    id="preview-contrast"
                    type="range"
                    min={50}
                    max={150}
                    step={1}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-[#09090B] dark:accent-[#FAFAFA] cursor-pointer"
                  />
                </div>
              </div>

              {activeItem.type === 'image' && (
                <div className="border-t border-[#E4E4E7] dark:border-[#27272A] pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#52525B] dark:text-[#A1A1AA]">Filter Gambar</span>
                    <span className="font-mono-tabular text-[#52525B] dark:text-[#71717A]">
                      {[
                        filterGrayscale ? 'Grayscale' : null,
                        filterSepia ? 'Sepia' : null,
                        filterInvert ? 'Invert' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Normal'}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Filter pemrosesan gambar statis"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <button
                      type="button"
                      aria-pressed={!filterGrayscale && !filterSepia && !filterInvert}
                      onClick={() => {
                        setFilterGrayscale(false);
                        setFilterSepia(false);
                        setFilterInvert(false);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer ${
                        !filterGrayscale && !filterSepia && !filterInvert
                          ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                          : 'border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      aria-pressed={filterGrayscale}
                      onClick={() => setFilterGrayscale((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer ${
                        filterGrayscale
                          ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                          : 'border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      Grayscale
                    </button>
                    <button
                      type="button"
                      aria-pressed={filterSepia}
                      onClick={() => setFilterSepia((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer ${
                        filterSepia
                          ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                          : 'border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      Sepia
                    </button>
                    <button
                      type="button"
                      aria-pressed={filterInvert}
                      onClick={() => setFilterInvert((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer ${
                        filterInvert
                          ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                          : 'border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      Invert
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isCarousel && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#52525B] dark:text-[#A1A1AA]">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-[#09090B] dark:text-[#FAFAFA] cursor-pointer select-none min-h-[28px]">
                      <input
                        type="checkbox"
                        checked={selectedIndices.size === media.items.length && media.items.length > 0}
                        onChange={handleSelectAllToggle}
                        aria-label="Pilih semua slide carousel"
                        className="h-4 w-4 rounded border-[#D4D4D8] bg-white accent-[#09090B] dark:border-[#3F3F46] dark:bg-[#09090B] dark:accent-[#FAFAFA] cursor-pointer"
                      />
                      <span>
                        {selectedIndices.size === media.items.length
                          ? 'Semua Dipilih'
                          : 'Pilih Semua'}
                      </span>
                    </label>
                    <span aria-hidden="true" className="text-[#A1A1AA] dark:text-[#52525B]">·</span>
                    <span className="font-mono-tabular">
                      Slide {String(activeIndex + 1).padStart(2, '0')} / {String(media.items.length).padStart(2, '0')}
                      {' · '}
                      {selectedIndices.size} dipilih
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {selectedIndices.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIndices(new Set())}
                        className="text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:underline underline-offset-4 whitespace-nowrap cursor-pointer"
                      >
                        Bersihkan
                      </button>
                    )}

                    <div
                      role="group"
                      aria-label="Mode tampilan slide carousel"
                      className="inline-flex items-center gap-0.5 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-0.5 dark:border-[#27272A] dark:bg-[#09090B]"
                    >
                      <button
                        type="button"
                        onClick={() => setCarouselViewMode('grid')}
                        aria-label="Tampilan grid"
                        aria-pressed={carouselViewMode === 'grid'}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer min-h-[28px] ${
                          carouselViewMode === 'grid'
                            ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                            : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                        }`}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Grid</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCarouselViewMode('list')}
                        aria-label="Tampilan daftar"
                        aria-pressed={carouselViewMode === 'list'}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer min-h-[28px] ${
                          carouselViewMode === 'list'
                            ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                            : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                        }`}
                      >
                        <List className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Daftar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {carouselViewMode === 'grid' ? (
                  <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                    {media.items.map((item, idx) => {
                      const isActive = idx === activeIndex;
                      const isSelected = selectedIndices.has(idx);
                      const thumbSrc = buildProxyUrl(
                        item.thumbnailUrl || item.mediaUrl,
                        `thumb_${item.id}.jpg`,
                        'inline'
                      );
                      const hasThumbError = failedThumbIds.has(item.id);

                      return (
                        <div
                          key={item.id}
                          className={`group relative overflow-hidden rounded-lg border transition-colors ${
                            isActive
                              ? 'border-[#09090B] bg-[#F4F4F5] dark:border-[#FAFAFA] dark:bg-[#1A1A20]'
                              : isSelected
                                ? 'border-[#52525B] bg-[#FAFAFA] dark:border-[#A1A1AA] dark:bg-[#121216]'
                                : 'border-[#E4E4E7] bg-[#FAFAFA] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#09090B] dark:hover:border-[#52525B]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveIndex(idx)}
                            aria-label={`Buka slide ${idx + 1} di pratinjau`}
                            className="block aspect-square w-full overflow-hidden cursor-pointer focus-visible:outline-none"
                          >
                            {hasThumbError ? (
                              <div className="flex h-full w-full items-center justify-center bg-[#F4F4F5] dark:bg-[#1A1A20]">
                                {item.type === 'video' ? (
                                  <Film className="h-5 w-5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                                ) : (
                                  <ImageIcon className="h-5 w-5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                                )}
                              </div>
                            ) : (
                              <img
                                src={thumbSrc}
                                alt={`Thumbnail slide ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedThumbIds((prev) => new Set(prev).add(item.id))
                                }
                                className="h-full w-full object-cover"
                              />
                            )}
                          </button>

                          <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-mono-tabular text-white">
                            {idx + 1}
                          </span>

                          <label
                            title={isSelected ? `Batal pilih slide ${idx + 1}` : `Pilih slide ${idx + 1}`}
                            className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded border transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-white bg-white text-[#09090B]'
                                : 'border-white/40 bg-black/75 text-white hover:border-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSlideSelected(idx)}
                              aria-label={`Pilih slide ${idx + 1}`}
                              className="sr-only"
                            />
                            {isSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              void startSingleDownload(item, idx);
                            }}
                            aria-label={`Unduh slide ${idx + 1}`}
                            title={`Unduh slide ${idx + 1}`}
                            className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded border border-white/20 bg-black/75 text-white opacity-90 hover:bg-black transition-opacity cursor-pointer"
                          >
                            <Download className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {media.items.map((item, idx) => {
                      const isActive = idx === activeIndex;
                      const isSelected = selectedIndices.has(idx);
                      const thumbSrc = buildProxyUrl(
                        item.thumbnailUrl || item.mediaUrl,
                        `thumb_${item.id}.jpg`,
                        'inline'
                      );
                      const hasThumbError = failedThumbIds.has(item.id);
                      const slideDuration = formatDuration(item.durationSec);
                      const itemDims =
                        item.width && item.height ? `${item.width}×${item.height}` : null;

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                            isActive
                              ? 'border-[#09090B] bg-[#F4F4F5] dark:border-[#FAFAFA] dark:bg-[#1A1A20]'
                              : isSelected
                                ? 'border-[#A1A1AA] bg-white dark:border-[#71717A] dark:bg-[#121216]'
                                : 'border-[#E4E4E7] bg-[#FAFAFA] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#09090B] dark:hover:border-[#52525B]'
                          }`}
                        >
                          <label
                            title={isSelected ? `Batal pilih slide ${idx + 1}` : `Pilih slide ${idx + 1}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSlideSelected(idx)}
                              aria-label={`Pilih slide ${idx + 1}`}
                              className="h-4 w-4 rounded border-[#D4D4D8] bg-white accent-[#09090B] dark:border-[#3F3F46] dark:bg-[#121216] dark:accent-[#FAFAFA] cursor-pointer"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setActiveIndex(idx)}
                            aria-label={`Pratinjau slide ${idx + 1}`}
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E4E4E7] bg-white dark:border-[#27272A] dark:bg-[#121216] cursor-pointer"
                          >
                            {hasThumbError ? (
                              <div className="flex h-full w-full items-center justify-center bg-[#F4F4F5] dark:bg-[#1A1A20]">
                                {item.type === 'video' ? (
                                  <Film className="h-4 w-4 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                                ) : (
                                  <ImageIcon className="h-4 w-4 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                                )}
                              </div>
                            ) : (
                              <img
                                src={thumbSrc}
                                alt={`Thumbnail slide ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedThumbIds((prev) => new Set(prev).add(item.id))
                                }
                                className="h-full w-full object-cover"
                              />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA] font-mono-tabular">
                              Slide {String(idx + 1).padStart(2, '0')}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#52525B] dark:text-[#A1A1AA] font-mono-tabular">
                              <span>{item.type === 'video' ? 'Video MP4' : 'Foto HD'}</span>
                              {itemDims && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{itemDims}</span>
                                </>
                              )}
                              {slideDuration && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{slideDuration}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveIndex(idx)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap min-h-[34px] cursor-pointer ${
                                isActive
                                  ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                                  : 'border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:border-[#52525B]'
                              }`}
                            >
                              {isActive ? 'Aktif' : 'Proses'}
                            </button>
                            <button
                              type="button"
                              disabled={downloadProgress?.status === 'downloading'}
                              onClick={() => {
                                void startSingleDownload(item, idx);
                              }}
                              aria-label={`Unduh slide ${idx + 1}`}
                              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#121216] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Metadata & Download Controls */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Zero-Pill Unboxed Metadata */}
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#52525B] dark:text-[#A1A1AA]">
                  <span className="font-medium text-[#09090B] dark:text-[#FAFAFA]">@{media.authorUsername}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatMediaKindLabel(media.mediaType)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {media.items.length} {media.items.length > 1 ? 'slide' : 'berkas'}
                  </span>
                  {durationLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{durationLabel}</span>
                    </>
                  )}
                </div>

                <h2 className="mt-2 font-display text-xl font-semibold text-[#09090B] dark:text-[#FAFAFA] balance-text">
                  {media.authorFullName
                    ? `${media.authorFullName} (@${media.authorUsername})`
                    : `@${media.authorUsername}`}
                </h2>
              </div>

              {/* Caption Box */}
              <div className="border-t border-[#E4E4E7] dark:border-[#27272A] pt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-[#52525B] dark:text-[#A1A1AA]">Caption Postingan</span>
                  {media.caption && (
                    <button
                      type="button"
                      onClick={handleCopyCaption}
                      className="inline-flex items-center gap-1.5 text-xs text-[#09090B] dark:text-[#FAFAFA] hover:underline underline-offset-4 cursor-pointer"
                    >
                      {copiedCaption ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" aria-hidden="true" />
                          <span>Salin Caption</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="max-h-36 overflow-y-auto text-sm text-[#27272A] dark:text-[#D4D4D8] leading-relaxed whitespace-pre-line">
                  {media.caption || 'Tidak ada caption pada media ini.'}
                </p>
              </div>
            </div>

            {/* Resolution & Format Selector + Primary Download Actions */}
            <div className="space-y-4 border-t border-[#E4E4E7] dark:border-[#27272A] pt-5">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#52525B] dark:text-[#A1A1AA] mb-1.5">
                    <span>Resolusi Media</span>
                    {selectedActiveVariant?.width && selectedActiveVariant?.height && (
                      <span className="font-mono-tabular text-[#27272A] dark:text-[#D4D4D8]">
                        {selectedActiveVariant.width}×{selectedActiveVariant.height}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeVariants.map((variant) => {
                      const isActiveVariant =
                        (selectedActiveVariant?.id || activeVariants[0].id) === variant.id;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          disabled={downloadProgress?.status === 'downloading'}
                          onClick={() =>
                            setSelectedVariantIds((prev) => ({
                              ...prev,
                              [activeItem.id]: variant.id,
                            }))
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-mono-tabular transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer disabled:opacity-50 ${
                            isActiveVariant
                              ? 'border-[#09090B] bg-[#09090B] text-[#FAFAFA] dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B] font-medium'
                              : 'border-[#E4E4E7] bg-[#FAFAFA] text-[#52525B] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#09090B] dark:text-[#A1A1AA] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA]'
                          }`}
                        >
                          {variant.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-[#52525B] dark:text-[#A1A1AA] mb-1.5">
                    <span>Format Unduhan</span>
                    {activeItem.type === 'video' && videoFormat === 'webm' && (
                      <span className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                        Konversi di browser
                      </span>
                    )}
                  </div>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-1 dark:border-[#27272A] dark:bg-[#09090B]">
                    {activeItem.type === 'video' ? (
                      <>
                        <button
                          type="button"
                          disabled={downloadProgress?.status === 'downloading'}
                          onClick={() => setVideoFormat('mp4')}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer disabled:opacity-50 ${
                            videoFormat === 'mp4'
                              ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                              : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                          }`}
                        >
                          MP4 (Asli)
                        </button>
                        {webmSupported && (
                          <button
                            type="button"
                            disabled={downloadProgress?.status === 'downloading'}
                            onClick={() => setVideoFormat('webm')}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer disabled:opacity-50 ${
                              videoFormat === 'webm'
                                ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                                : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                            }`}
                          >
                            WEBM
                          </button>
                        )}
                      </>
                    ) : (
                      (['jpg', 'png', 'webp'] as ImageExportFormat[]).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          disabled={downloadProgress?.status === 'downloading'}
                          onClick={() => setImageFormat(fmt)}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer disabled:opacity-50 ${
                            imageFormat === fmt
                              ? 'bg-[#09090B] text-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#09090B]'
                              : 'text-[#52525B] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]'
                          }`}
                        >
                          {fmt === 'jpg' ? 'JPG (Asli)' : fmt.toUpperCase()}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {downloadProgress && (
                <DownloadProgressBar
                  state={downloadProgress}
                  onCancel={handleCancelDownload}
                  onDismiss={() => setDownloadProgress(null)}
                />
              )}

              {(() => {
                const effectiveSizeBytes = downloadProgress?.totalBytes ?? metaSizeBytes;
                const latency = networkLatencyMs;
                const formatSize = (bytes: number) => {
                  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                };

                if (isProbingMeta && effectiveSizeBytes === null) {
                  return (
                    <div className="flex items-center gap-2 text-xs text-[#52525B] dark:text-[#A1A1AA]">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Menghitung estimasi waktu unduh...</span>
                    </div>
                  );
                }

                if (effectiveSizeBytes && latency !== null) {
                  const effectiveMbps =
                    downlinkMbps && downlinkMbps > 0
                      ? downlinkMbps
                      : Math.max(1.5, Math.min(40, 1200 / Math.max(latency, 30)));
                  const totalSec = latency / 1000 + (effectiveSizeBytes * 8) / (effectiveMbps * 1_000_000);
                  const timeLabel =
                    totalSec < 1
                      ? '< 1 dtk'
                      : totalSec < 60
                        ? `~${Math.round(totalSec)} dtk`
                        : `~${Math.floor(totalSec / 60)} mnt ${Math.round(totalSec % 60)} dtk`;

                  return (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] font-mono-tabular">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Estimasi unduh:</span>
                      <span className="text-[#09090B] dark:text-[#FAFAFA] font-medium">{timeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSize(effectiveSizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span>latensi {latency} ms</span>
                    </div>
                  );
                }

                if (latency !== null) {
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#52525B] dark:text-[#A1A1AA] font-mono-tabular">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Latensi jaringan: {latency} ms</span>
                      <span aria-hidden="true">·</span>
                      <span>ukuran berkas belum tersedia dari CDN</span>
                    </div>
                  );
                }

                return null;
              })()}

              <button
                type="button"
                disabled={downloadProgress?.status === 'downloading'}
                onClick={handleDownloadActive}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#09090B] px-5 py-3.5 text-sm font-semibold text-[#FAFAFA] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[48px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-[#FAFAFA] dark:focus-visible:ring-offset-[#121216]"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>
                  {downloadProgress?.status === 'downloading'
                    ? downloadProgress.percent !== null
                      ? `Mengunduh berkas... (${downloadProgress.percent}%)`
                      : 'Mengunduh berkas...'
                    : isCarousel
                      ? `Unduh Slide ${activeIndex + 1} (${selectedFormat.toUpperCase()})`
                      : activeItem.type === 'video'
                        ? `Unduh Video ${videoFormat.toUpperCase()}`
                        : `Unduh Foto ${imageFormat.toUpperCase()}`}
                </span>
              </button>

              {isCarousel && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={selectedIndices.size === 0 || downloadProgress?.status === 'downloading'}
                      onClick={() => void handleBatchDownload(Array.from(selectedIndices), 'zip')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-3 text-xs font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap min-h-[44px] cursor-pointer"
                    >
                      {selectedIndices.size > 1 ? (
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="font-mono-tabular">
                        {selectedIndices.size > 1
                          ? `Unduh Terpilih ZIP (${selectedIndices.size})`
                          : `Unduh Terpilih (${selectedIndices.size})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={downloadProgress?.status === 'downloading'}
                      onClick={() => void handleBatchDownload(media.items.map((_, i) => i), 'zip')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-3 text-xs font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap min-h-[44px] cursor-pointer"
                    >
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono-tabular">
                        Unduh Semua ZIP ({media.items.length})
                      </span>
                    </button>
                  </div>

                  {selectedIndices.size > 1 && (
                    <button
                      type="button"
                      disabled={downloadProgress?.status === 'downloading'}
                      onClick={() =>
                        void handleBatchDownload(Array.from(selectedIndices), 'individual')
                      }
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-2.5 text-xs font-medium text-[#27272A] hover:border-[#A1A1AA] hover:text-[#09090B] dark:border-[#27272A] dark:bg-[#09090B] dark:text-[#D4D4D8] dark:hover:border-[#52525B] dark:hover:text-[#FAFAFA] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap min-h-[40px] cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono-tabular">
                        Unduh Terpilih Satu per Satu ({selectedIndices.size} file)
                      </span>
                    </button>
                  )}
                </div>
              )}

              {activeItem.type === 'video' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={audioProgress !== null}
                    onClick={handleExtractAudio}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-5 py-3 text-sm font-medium text-[#09090B] hover:border-[#A1A1AA] dark:border-[#27272A] dark:bg-[#1A1A20] dark:text-[#FAFAFA] dark:hover:border-[#52525B] disabled:opacity-75 transition-colors min-h-[46px] cursor-pointer"
                  >
                    <Music className="h-4 w-4 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                    <span>
                      {audioProgress !== null
                        ? `${audioStageLabel} (${audioProgress}%)`
                        : activeItem.audioUrl
                          ? 'Ekstrak & Unduh Audio (M4A)'
                          : 'Ekstrak & Unduh Audio Reels'}
                    </span>
                  </button>

                  {audioProgress !== null && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7] dark:bg-[#27272A]">
                      <div
                        className="h-full bg-[#09090B] dark:bg-[#FAFAFA] transition-all duration-150"
                        style={{ width: `${audioProgress}%` }}
                      />
                    </div>
                  )}

                  {audioError && (
                    <p className="text-xs text-[#DC2626] dark:text-[#FF4D4D] flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{audioError}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
