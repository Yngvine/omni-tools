import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tabs,
  Tab,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import ToolContent from '@components/ToolContent';
import { ToolComponentProps } from '@tools/defineTool';
import {
  addDownload,
  cancelDownload,
  createMeTubeSocket,
  downloadHref,
  fetchDownloadHistory,
  fetchFormatCatalog,
  formatBytes,
  formatEta,
  formatSpeed,
  MeTubeServiceError,
  partitionCompletedDownloads,
  parseMeTubeHistory,
  retryDownload
} from './service';
import {
  MeTubeDownload,
  MeTubeFormatCatalog,
  MeTubeFormatOption,
  MeTubeDownloadType
} from './types';

type JobTab = 'queue' | 'finished' | 'failed' | 'history';
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
type DownloaderErrorKey =
  | 'linkDownloader.errors.optionsUnavailable'
  | 'linkDownloader.errors.addFailed'
  | 'linkDownloader.errors.retryFailed'
  | 'linkDownloader.errors.cancelFailed'
  | 'linkDownloader.errors.historyUnavailable';

const jobStatusColors: Record<
  string,
  'default' | 'primary' | 'success' | 'error' | 'warning'
> = {
  queued: 'default',
  pending: 'default',
  scheduled: 'warning',
  preparing: 'primary',
  downloading: 'primary',
  postprocessing: 'primary',
  finished: 'success',
  error: 'error'
};

const activeStatuses = new Set(['preparing', 'downloading', 'postprocessing']);

function getErrorMessage(
  error: unknown,
  t: TFunction<'video'>,
  fallbackKey: DownloaderErrorKey
): string {
  if (error instanceof MeTubeServiceError) {
    if (error.code === 'backendUnavailable') {
      return t('linkDownloader.errors.backendUnavailable');
    }
    if (error.code === 'unexpectedResponse') {
      return t('linkDownloader.errors.unexpectedResponse');
    }
    return t('linkDownloader.errors.requestFailed', {
      status: String(error.status ?? '')
    });
  }
  return error instanceof Error ? error.message : t(fallbackKey);
}

function parseEventValue<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function itemKey(item: MeTubeDownload): string {
  return item.url || item.id || '';
}

function upsertDownload(
  items: MeTubeDownload[],
  download: MeTubeDownload
): MeTubeDownload[] {
  const key = itemKey(download);
  if (!key) return items;

  const existingIndex = items.findIndex((item) => itemKey(item) === key);
  if (existingIndex < 0) return [download, ...items];

  const updated = [...items];
  updated[existingIndex] = { ...updated[existingIndex], ...download };
  return updated;
}

function withoutDownload(
  items: MeTubeDownload[],
  key: string
): MeTubeDownload[] {
  return items.filter((item) => itemKey(item) !== key && item.id !== key);
}

function JobRow({
  download,
  onCancel,
  onRetry,
  canceling,
  retrying
}: {
  download: MeTubeDownload;
  onCancel?: (download: MeTubeDownload) => void;
  onRetry?: (download: MeTubeDownload) => void;
  canceling?: boolean;
  retrying?: boolean;
}) {
  const { t } = useTranslation('video');
  const isActive = activeStatuses.has(download.status);
  const percent = Math.max(0, Math.min(100, download.percent ?? 0));
  const fileHref = downloadHref(download);
  const eta = formatEta(download.eta ?? Number.NaN);
  const metrics = [
    formatSpeed(download.speed ?? 0),
    eta ? `${eta} ${t('linkDownloader.eta.left')}` : '',
    formatBytes(download.size ?? 0)
  ].filter(Boolean);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
              {download.title || download.filename || download.url}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[download.download_type, download.format, download.quality]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              variant="outlined"
              color={jobStatusColors[download.status] ?? 'default'}
              label={t(`linkDownloader.status.${download.status}`, {
                defaultValue: download.status
              })}
            />
            {fileHref && (
              <Button
                component="a"
                href={fileHref}
                download
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
              >
                {t('linkDownloader.download')}
              </Button>
            )}
            {onRetry && (
              <Button
                size="small"
                onClick={() => onRetry(download)}
                disabled={!download.url || retrying}
                startIcon={<ReplayIcon />}
              >
                {t('linkDownloader.retry')}
              </Button>
            )}
            {onCancel && (
              <Tooltip title={t('linkDownloader.cancel')}>
                <span>
                  <IconButton
                    aria-label={t('linkDownloader.cancelItem', {
                      title: download.title || t('linkDownloader.download')
                    })}
                    onClick={() => onCancel(download)}
                    disabled={!download.url || canceling}
                    size="small"
                    color="inherit"
                  >
                    <CloseIcon />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {isActive && (
          <Box>
            <LinearProgress
              variant={
                download.percent == null ? 'indeterminate' : 'determinate'
              }
              value={percent}
              aria-label={t('linkDownloader.progressLabel', {
                title: download.title || t('linkDownloader.download')
              })}
            />
            <Stack direction="row" justifyContent="space-between" mt={0.5}>
              <Typography variant="caption" color="text.secondary">
                {download.percent == null
                  ? t('linkDownloader.inProgress')
                  : `${Math.round(percent)}%`}
              </Typography>
              {metrics.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {metrics.join(' · ')}
                </Typography>
              )}
            </Stack>
          </Box>
        )}

        {download.status === 'error' && download.msg && (
          <Typography variant="body2" color="error">
            {download.msg}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

export default function LinkDownloader({ title }: ToolComponentProps) {
  const { t } = useTranslation('video');
  const [url, setUrl] = useState('');
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [format, setFormat] = useState('any');
  const [codec, setCodec] = useState('auto');
  const [quality, setQuality] = useState('best');
  const [catalog, setCatalog] = useState<MeTubeFormatCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [jobs, setJobs] = useState({
    queue: [] as MeTubeDownload[],
    done: [] as MeTubeDownload[]
  });
  const sessionCompletedKeys = useRef(new Set<string>());
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancelingUrl, setCancelingUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<JobTab>('queue');

  const downloadTypes = (catalog?.download_type.options ?? []).filter(
    (item) => item.id === 'video' || item.id === 'audio'
  );
  const selectedType = downloadTypes.find((item) => item.id === downloadType);
  const formatOptions = selectedType?.format.options ?? [];
  const selectedFormat = formatOptions.find((item) => item.id === format);
  const qualityOptions = selectedFormat?.quality?.options ?? [];

  useEffect(() => {
    let active = true;
    const socket = createMeTubeSocket();

    const replaceJobs = (history: {
      queue: MeTubeDownload[];
      done: MeTubeDownload[];
    }) => {
      setJobs(history);
      setHistoryError(null);
    };

    socket.on('connect', () => {
      setConnection('connected');
      setHistoryError(null);
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('error'));
    socket.on('all', (payload: unknown) => {
      try {
        replaceJobs(parseMeTubeHistory(payload));
      } catch {
        setHistoryError(t('linkDownloader.errors.invalidQueue'));
      }
    });
    socket.on('added', (payload: unknown) => {
      try {
        const download = parseEventValue<MeTubeDownload>(payload);
        setJobs((current) => ({
          ...current,
          queue: upsertDownload(current.queue, download)
        }));
      } catch {
        setHistoryError(t('linkDownloader.errors.unreadableJob'));
      }
    });
    socket.on('updated', (payload: unknown) => {
      try {
        const download = parseEventValue<MeTubeDownload>(payload);
        setJobs((current) => ({
          ...current,
          queue: upsertDownload(current.queue, download)
        }));
      } catch {
        setHistoryError(t('linkDownloader.errors.unreadableProgress'));
      }
    });
    socket.on('completed', (payload: unknown) => {
      try {
        const download = parseEventValue<MeTubeDownload>(payload);
        const key = itemKey(download);
        if (download.status === 'finished' && key) {
          sessionCompletedKeys.current.add(key);
        }
        setJobs((current) => ({
          queue: withoutDownload(current.queue, key),
          done: upsertDownload(current.done, download)
        }));
      } catch {
        setHistoryError(t('linkDownloader.errors.unreadableCompletion'));
      }
    });
    socket.on('canceled', (payload: unknown) => {
      const key = parseEventValue<string>(payload);
      setJobs((current) => ({
        ...current,
        queue: withoutDownload(current.queue, key)
      }));
    });
    socket.on('cleared', (payload: unknown) => {
      const key = parseEventValue<string>(payload);
      sessionCompletedKeys.current.delete(key);
      setJobs((current) => ({
        ...current,
        done: withoutDownload(current.done, key)
      }));
    });

    fetchFormatCatalog()
      .then((result) => {
        if (active) {
          setCatalog(result);
          setCatalogError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogError(
            getErrorMessage(
              error,
              t,
              'linkDownloader.errors.optionsUnavailable'
            )
          );
        }
      });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [t]);

  useEffect(() => {
    if (!catalog) return;
    const typeOptions = catalog.download_type.options.filter(
      (item) => item.id === 'video' || item.id === 'audio'
    );
    const type =
      typeOptions.find((item) => item.id === downloadType) ?? typeOptions[0];
    if (!type) return;

    const defaultFormat = type.format.options.find(
      (item) => item.id === type.format.default
    );
    setDownloadType(type.id as 'video' | 'audio');
    setCodec(type.codec?.default ?? 'auto');
    setFormat(type.format.default);
    setQuality(defaultFormat?.quality?.default ?? 'best');
  }, [catalog, downloadType]);

  const handleDownload = async () => {
    if (!url.trim() || !selectedType || !selectedFormat) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await addDownload({
        url: url.trim(),
        download_type: downloadType,
        codec,
        format,
        quality,
        auto_start: true
      });
      setFeedback({
        type: 'success',
        message: result.msg || t('linkDownloader.feedback.added')
      });
      setUrl('');
      setTab('queue');
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, t, 'linkDownloader.errors.addFailed')
      });
    } finally {
      setSubmitting(false);
    }
  };

  const refreshHistory = async () => {
    setRefreshing(true);
    try {
      const history = await fetchDownloadHistory();
      setJobs({
        queue: [...history.queue, ...(history.pending ?? [])],
        done: history.done
      });
      setHistoryError(null);
    } catch (error) {
      setHistoryError(
        getErrorMessage(error, t, 'linkDownloader.errors.historyUnavailable')
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleRetry = async (download: MeTubeDownload) => {
    if (!download.url) return;
    setRetryingId(download.url);
    setFeedback(null);
    try {
      const result = await retryDownload(download.url);
      setFeedback({
        type: 'success',
        message: result.msg || t('linkDownloader.feedback.retryQueued')
      });
      setTab('queue');
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, t, 'linkDownloader.errors.retryFailed')
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleCancel = async (download: MeTubeDownload) => {
    if (!download.url) return;
    setCancelingUrl(download.url);
    setFeedback(null);
    try {
      const result = await cancelDownload(download.url);
      setFeedback({
        type: 'success',
        message: result.msg || t('linkDownloader.feedback.canceled')
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, t, 'linkDownloader.errors.cancelFailed')
      });
    } finally {
      setCancelingUrl(null);
    }
  };

  const handleTypeChange = (nextType: MeTubeDownloadType) => {
    const nextFormat = nextType.format.options.find(
      (item) => item.id === nextType.format.default
    );
    setDownloadType(nextType.id as 'video' | 'audio');
    setCodec(nextType.codec?.default ?? 'auto');
    setFormat(nextType.format.default);
    setQuality(nextFormat?.quality?.default ?? 'best');
  };

  const handleFormatChange = (nextFormat: MeTubeFormatOption) => {
    setFormat(nextFormat.id);
    setQuality(nextFormat.quality?.default ?? 'best');
  };

  const { currentSession: finishedJobs, history: historicalJobs } =
    partitionCompletedDownloads(jobs.done, sessionCompletedKeys.current);
  const failedJobs = jobs.done.filter((item) => item.status === 'error');
  const visibleJobs =
    tab === 'queue'
      ? jobs.queue
      : tab === 'finished'
        ? finishedJobs
        : tab === 'failed'
          ? failedJobs
          : historicalJobs;

  return (
    <ToolContent
      title={title}
      initialValues={{}}
      getGroups={null}
      compute={() => {}}
      inputComponent={
        <Stack
          component="form"
          spacing={2}
          sx={{ p: 2 }}
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void handleDownload();
          }}
        >
          <TextField
            label={t('linkDownloader.url')}
            placeholder={t('linkDownloader.urlPlaceholder')}
            type="url"
            required
            fullWidth
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {catalogError && <Alert severity="error">{catalogError}</Alert>}
          {selectedType && (
            <Stack spacing={2}>
              <TextField
                select
                label={t('linkDownloader.downloadType')}
                value={downloadType}
                onChange={(event) => {
                  const nextType = downloadTypes.find(
                    (item) => item.id === event.target.value
                  );
                  if (nextType) handleTypeChange(nextType);
                }}
              >
                {downloadTypes.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {t(`linkDownloader.choices.${item.id}`, {
                      defaultValue: item.text
                    })}
                  </MenuItem>
                ))}
              </TextField>
              {selectedType.codec && selectedType.codec.options.length > 1 && (
                <TextField
                  select
                  label={t('linkDownloader.codec')}
                  value={codec}
                  onChange={(event) => setCodec(event.target.value)}
                >
                  {selectedType.codec.options.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {t(`linkDownloader.choices.${item.id}`, {
                        defaultValue: item.text
                      })}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                select
                label={t('linkDownloader.format')}
                value={format}
                onChange={(event) => {
                  const nextFormat = formatOptions.find(
                    (item) => item.id === event.target.value
                  );
                  if (nextFormat) handleFormatChange(nextFormat);
                }}
              >
                {formatOptions.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {t(`linkDownloader.choices.${item.id}`, {
                      defaultValue: item.text
                    })}
                  </MenuItem>
                ))}
              </TextField>
              {qualityOptions.length > 1 && (
                <TextField
                  select
                  label={t('linkDownloader.quality')}
                  value={quality}
                  onChange={(event) => setQuality(event.target.value)}
                >
                  {qualityOptions.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {t(`linkDownloader.choices.${item.id}`, {
                        defaultValue: item.text
                      })}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={
              submitting || !url.trim() || !selectedType || !selectedFormat
            }
          >
            {submitting
              ? t('linkDownloader.adding')
              : t('linkDownloader.addDownload')}
          </Button>
          {feedback && (
            <Alert severity={feedback.type}>{feedback.message}</Alert>
          )}
        </Stack>
      }
      resultComponent={
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Box>
              <Typography variant="h6">
                {t('linkDownloader.downloads')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('linkDownloader.downloadsDescription')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                color={connection === 'connected' ? 'success' : 'default'}
                label={
                  connection === 'connected'
                    ? t('linkDownloader.connection.live')
                    : connection === 'connecting'
                      ? t('linkDownloader.connection.connecting')
                      : t('linkDownloader.connection.offline')
                }
              />
              <Tooltip title={t('linkDownloader.refresh')}>
                <span>
                  <IconButton
                    aria-label={t('linkDownloader.refresh')}
                    onClick={() => void refreshHistory()}
                    disabled={refreshing}
                    size="small"
                  >
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>

          {connection !== 'connected' && (
            <Alert severity={connection === 'error' ? 'warning' : 'info'}>
              {connection === 'connecting'
                ? t('linkDownloader.connection.connectingMessage')
                : t('linkDownloader.connection.unavailableMessage')}
            </Alert>
          )}
          {historyError && <Alert severity="warning">{historyError}</Alert>}

          <Tabs
            value={tab}
            onChange={(_, value: JobTab) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label={t('linkDownloader.tabs.label')}
          >
            <Tab
              value="queue"
              label={t('linkDownloader.tabs.queue', {
                count: jobs.queue.length
              })}
            />
            <Tab
              value="finished"
              label={t('linkDownloader.tabs.currentSession', {
                count: finishedJobs.length
              })}
            />
            <Tab
              value="failed"
              label={t('linkDownloader.tabs.failed', {
                count: failedJobs.length
              })}
            />
            <Tab
              value="history"
              label={t('linkDownloader.tabs.history', {
                count: historicalJobs.length
              })}
            />
          </Tabs>

          {visibleJobs.length > 0 ? (
            <Stack spacing={1}>
              {visibleJobs.map((download) => (
                <JobRow
                  key={itemKey(download)}
                  download={download}
                  onCancel={tab === 'queue' ? handleCancel : undefined}
                  onRetry={tab === 'failed' ? handleRetry : undefined}
                  canceling={cancelingUrl === download.url}
                  retrying={retryingId === download.url}
                />
              ))}
            </Stack>
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: 3, borderRadius: 1, textAlign: 'center' }}
            >
              <Typography color="text.secondary">
                {tab === 'queue'
                  ? t('linkDownloader.empty.queue')
                  : tab === 'finished'
                    ? t('linkDownloader.empty.completed')
                    : tab === 'failed'
                      ? t('linkDownloader.empty.failed')
                      : t('linkDownloader.empty.history')}
              </Typography>
            </Paper>
          )}
        </Stack>
      }
    />
  );
}
