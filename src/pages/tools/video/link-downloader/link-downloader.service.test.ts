import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelDownload,
  downloadHref,
  fetchFormatCatalog,
  formatBytes,
  formatEta,
  formatSpeed,
  parseMeTubeHistory
} from './service';
import { MeTubeDownload } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('link-downloader service', () => {
  it('parses MeTube all-event queue and completed entries', () => {
    const queued: MeTubeDownload = {
      id: 'video-id',
      url: 'https://example.com/video',
      title: 'In progress',
      status: 'downloading',
      percent: 42
    };
    const completed: MeTubeDownload = {
      id: 'done-id',
      url: 'https://example.com/done',
      title: 'Finished',
      status: 'finished',
      filename: 'Finished.mp4'
    };
    const payload = JSON.stringify([
      [['https://example.com/video', queued]],
      [['https://example.com/done', completed]]
    ]);

    expect(parseMeTubeHistory(payload)).toEqual({
      queue: [queued],
      done: [completed]
    });
  });

  it('rejects an unexpected queue snapshot', () => {
    expect(() => parseMeTubeHistory({ queue: [], done: [] })).toThrow(
      'MeTube sent an unexpected queue snapshot.'
    );
  });

  it('builds app-proxied download links with encoded path segments', () => {
    expect(
      downloadHref({
        url: 'https://example.com/audio',
        download_type: 'audio',
        status: 'finished',
        filename: 'Artist Name/Track (live).mp3'
      })
    ).toBe('/api/metube/audio_download/Artist%20Name/Track%20(live).mp3');
    expect(
      downloadHref({
        url: 'https://example.com/video',
        status: 'finished'
      })
    ).toBeNull();
  });

  it('cancels a queue entry by its URL key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await cancelDownload('https://example.com/video');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/metube/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ids: ['https://example.com/video'],
          where: 'queue'
        })
      })
    );
  });

  it('reports a readable error when the backend returns non-JSON content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        }
      })
    );

    await expect(fetchFormatCatalog()).rejects.toThrow(
      'MeTube returned an unexpected response. Check that the backend is available.'
    );
  });

  it('formats progress metrics', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatSpeed(1024)).toBe('1.0 KB/s');
    expect(formatEta(125)).toBe('2m 5s left');
    expect(formatEta(Number.NaN)).toBe('');
  });
});
