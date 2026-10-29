import { io, Socket } from 'socket.io-client';
import {
  AddDownloadPayload,
  MeTubeDownload,
  MeTubeFormatCatalog,
  MeTubeHistory
} from './types';

const apiBasePath = '/api/metube';

export type MeTubeServiceErrorCode =
  | 'backendUnavailable'
  | 'unexpectedResponse'
  | 'requestFailed';

export class MeTubeServiceError extends Error {
  constructor(
    readonly code: MeTubeServiceErrorCode,
    readonly status?: number
  ) {
    super(code);
    this.name = 'MeTubeServiceError';
  }
}

export function createMeTubeSocket(): Socket {
  return io({ path: `${apiBasePath}/socket.io` });
}

export function parseMeTubeHistory(payload: unknown): MeTubeHistory {
  const parsed =
    typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;

  if (!Array.isArray(parsed) || parsed.length < 2) {
    throw new Error('MeTube sent an unexpected queue snapshot.');
  }

  const readEntries = (value: unknown): MeTubeDownload[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (
        Array.isArray(entry) &&
        entry.length > 1 &&
        typeof entry[1] === 'object' &&
        entry[1] !== null
      ) {
        return [entry[1] as MeTubeDownload];
      }
      return [];
    });
  };

  return {
    queue: readEntries(parsed[0]),
    done: readEntries(parsed[1])
  };
}

export function partitionCompletedDownloads(
  downloads: MeTubeDownload[],
  currentSessionKeys: Set<string>
): { currentSession: MeTubeDownload[]; history: MeTubeDownload[] } {
  return downloads.reduce(
    (partition, download) => {
      if (download.status === 'error') return partition;

      const key = download.url || download.id || '';
      if (key && currentSessionKeys.has(key)) {
        partition.currentSession.push(download);
      } else {
        partition.history.push(download);
      }
      return partition;
    },
    { currentSession: [] as MeTubeDownload[], history: [] as MeTubeDownload[] }
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBasePath}/${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers
      }
    });
  } catch {
    throw new MeTubeServiceError('backendUnavailable');
  }

  let body: T & { status?: string; msg?: string };
  try {
    body = (await response.json()) as T & { status?: string; msg?: string };
  } catch {
    throw new MeTubeServiceError('unexpectedResponse');
  }

  if (!response.ok || body?.status === 'error') {
    if (body?.msg) throw new Error(body.msg);
    throw new MeTubeServiceError('requestFailed', response.status);
  }

  return body;
}

export function fetchFormatCatalog(): Promise<MeTubeFormatCatalog> {
  return requestJson('formats');
}

export function fetchDownloadHistory(): Promise<{
  queue: MeTubeDownload[];
  done: MeTubeDownload[];
  pending?: MeTubeDownload[];
}> {
  return requestJson('history');
}

export function addDownload(payload: AddDownloadPayload) {
  return requestJson<{ status: string; msg?: string }>('add', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function retryDownload(id: string) {
  return requestJson<{ status: string; msg?: string }>('retry', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
}

export function cancelDownload(url: string) {
  return requestJson<{ status: string; msg?: string }>('delete', {
    method: 'POST',
    body: JSON.stringify({ ids: [url], where: 'queue' })
  });
}

export function downloadHref(download: MeTubeDownload): string | null {
  if (!download.filename) return null;

  const route =
    download.download_type === 'audio' ? 'audio_download' : 'download';
  const filename = download.filename
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `${apiBasePath}/${route}/${filename}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  const value = formatBytes(bytesPerSecond);
  return value ? `${value}/s` : '';
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}
