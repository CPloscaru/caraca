'use client';

import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import {
  Download,
  AlertTriangle,
  Image as ImageIcon,
  Video,
  FileText,
  Loader2,
} from 'lucide-react';
import type { BatchResultItem } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultType = 'image' | 'video' | 'text';

type BatchResultDisplayProps = {
  results: BatchResultItem[] | null;
  nodeLabel?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE_PATTERN = /\.(png|jpg|jpeg|webp)(\?|$)|\/api\/images\//i;
const VIDEO_PATTERN = /\.(mp4|webm)(\?|$)|\/api\/videos\//i;

function detectResultType(results: BatchResultItem[]): ResultType {
  const firstDone = results.find((r) => r.status === 'done' && r.result);
  if (!firstDone?.result) return 'text';

  const values = Object.values(firstDone.result);
  for (const val of values) {
    if (typeof val === 'string') {
      if (IMAGE_PATTERN.test(val)) return 'image';
      if (VIDEO_PATTERN.test(val)) return 'video';
    }
  }
  return 'text';
}

/** Extract the first URL-like value from a result record. */
function extractUrl(result: Record<string, unknown>): string | null {
  for (const val of Object.values(result)) {
    if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/api/'))) {
      return val;
    }
  }
  return null;
}

/** Extract a displayable text from a result record. */
function extractText(result: Record<string, unknown>): string {
  const vals = Object.values(result);
  for (const val of vals) {
    if (typeof val === 'string') return val;
  }
  return JSON.stringify(result);
}

/** Slugify a string for file naming. */
function slugify(str: string, maxLen = 30): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

/** Zero-pad index for file naming. */
function padIndex(index: number, total: number): string {
  const digits = String(total).length;
  return String(index + 1).padStart(Math.max(digits, 3), '0');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorCell({ error, inputValue }: { error: string; inputValue: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-900/30 p-2"
      title={inputValue}
    >
      <AlertTriangle className="mr-1 h-3 w-3 flex-shrink-0 text-red-400" />
      <span className="truncate text-[10px] text-red-300">
        {error.length > 50 ? error.slice(0, 50) + '...' : error}
      </span>
    </div>
  );
}

function ImageGrid({ results }: { results: BatchResultItem[] }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <div className="grid grid-cols-3 gap-1">
        {results.map((item) => {
          if (item.status !== 'done' || !item.result) {
            return (
              <ErrorCell
                key={item.index}
                error={item.error ?? 'Unknown error'}
                inputValue={item.inputValue}
              />
            );
          }
          const url = extractUrl(item.result);
          if (!url) return null;
          return (
            <button
              key={item.index}
              className="overflow-hidden rounded-md ring-1 ring-transparent transition-all hover:ring-white/20 focus:outline-none"
              title={item.inputValue}
              onClick={() => window.open(url, '_blank')}
            >
              <img
                src={url}
                alt={`Result ${item.index + 1}`}
                className="h-20 w-full object-cover"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoList({ results }: { results: BatchResultItem[] }) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {results.map((item) => {
        if (item.status !== 'done' || !item.result) {
          return (
            <ErrorCell
              key={item.index}
              error={item.error ?? 'Unknown error'}
              inputValue={item.inputValue}
            />
          );
        }
        const url = extractUrl(item.result);
        if (!url) return null;
        return (
          <div
            key={item.index}
            className="flex items-center gap-2 rounded-md bg-white/5 p-1"
            title={item.inputValue}
          >
            <video
              src={url}
              muted
              playsInline
              className="h-12 w-16 rounded object-cover"
              onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
              onMouseLeave={(e) => {
                const v = e.target as HTMLVideoElement;
                v.pause();
                v.currentTime = 0;
              }}
            />
            <span className="truncate text-xs text-gray-300">{item.inputValue}</span>
          </div>
        );
      })}
    </div>
  );
}

function TextTable({ results }: { results: BatchResultItem[] }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/10 text-left text-gray-500">
            <th className="w-8 px-1 py-0.5">#</th>
            <th className="px-1 py-0.5">Input</th>
            <th className="px-1 py-0.5">Output</th>
          </tr>
        </thead>
        <tbody>
          {results.map((item) => (
            <tr
              key={item.index}
              className="border-b border-white/5"
              title={item.inputValue}
            >
              <td className="px-1 py-0.5 text-gray-500">{item.index + 1}</td>
              <td className="max-w-[80px] truncate px-1 py-0.5 text-gray-300">
                {item.inputValue}
              </td>
              <td className="max-w-[120px] truncate px-1 py-0.5">
                {item.status === 'done' && item.result ? (
                  <span className="text-gray-300">{extractText(item.result)}</span>
                ) : (
                  <span className="text-red-300">
                    {item.error
                      ? item.error.length > 50
                        ? item.error.slice(0, 50) + '...'
                        : item.error
                      : 'Error'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download All
// ---------------------------------------------------------------------------

function useDownloadAll(
  results: BatchResultItem[],
  resultType: ResultType,
  nodeLabel?: string,
) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      const successful = results.filter((r) => r.status === 'done' && r.result);
      const total = successful.length;

      for (const item of successful) {
        const slug = slugify(item.inputValue);
        const pad = padIndex(item.index, results.length);

        if (resultType === 'image' || resultType === 'video') {
          const url = extractUrl(item.result!);
          if (!url) continue;
          const ext = resultType === 'image' ? 'png' : 'mp4';
          const resp = await fetch(url);
          const blob = await resp.blob();
          zip.file(`${pad}-${slug}.${ext}`, blob);
        } else {
          const text = extractText(item.result!);
          zip.file(`${pad}-${slug}.txt`, text);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const prefix = nodeLabel ? slugify(nodeLabel) + '-' : '';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}batch-results.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create ZIP:', err);
    } finally {
      setDownloading(false);
    }
  }, [results, resultType, nodeLabel]);

  return { downloading, handleDownload };
}

// ---------------------------------------------------------------------------
// BatchResultDisplay (main export)
// ---------------------------------------------------------------------------

export function BatchResultDisplay({ results, nodeLabel }: BatchResultDisplayProps) {
  if (!results || results.length === 0) return null;

  const resultType = detectResultType(results);
  const hasSuccessful = results.some((r) => r.status === 'done');
  const { downloading, handleDownload } = useDownloadAll(results, resultType, nodeLabel);

  const TypeIcon =
    resultType === 'image' ? ImageIcon : resultType === 'video' ? Video : FileText;

  return (
    <div className="nodrag nowheel nopan space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <TypeIcon className="h-3 w-3" />
          <span>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
        {hasSuccessful && (
          <button
            className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-gray-300 transition-colors hover:bg-white/20 disabled:opacity-50"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {downloading ? 'Zipping...' : 'Download All'}
          </button>
        )}
      </div>

      {/* Result display */}
      {resultType === 'image' && <ImageGrid results={results} />}
      {resultType === 'video' && <VideoList results={results} />}
      {resultType === 'text' && <TextTable results={results} />}
    </div>
  );
}
