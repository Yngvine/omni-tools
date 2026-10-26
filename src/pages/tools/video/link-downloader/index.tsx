import React, { useState } from 'react';
import { Box, Button, TextField, MenuItem, Alert, Stack } from '@mui/material';
import ToolContent from '@components/ToolContent';
import { ToolComponentProps } from '@tools/defineTool';

export default function LinkDownloader({ title }: ToolComponentProps) {
  const [url, setUrl] = useState('');
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [format, setFormat] = useState('mp4');
  const [quality, setQuality] = useState('best');
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!url) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/metube/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          download_type: downloadType,
          format: downloadType === 'audio' ? 'mp3' : format,
          quality,
          auto_start: true
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setStatus({
          type: 'success',
          msg: 'Added to queue! Click "Open Completed Files" once finished.'
        });
        setUrl('');
      } else {
        setStatus({ type: 'error', msg: data.msg || 'Failed to queue link.' });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: 'Could not reach MeTube backend.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolContent
      title={title}
      initialValues={{}}
      getGroups={null}
      compute={() => {}}
      inputComponent={
        <Stack spacing={2} sx={{ p: 2 }}>
          <TextField
            label="Video or Audio URL (YouTube, etc.)"
            fullWidth
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Type"
              value={downloadType}
              onChange={(e) =>
                setDownloadType(e.target.value as 'video' | 'audio')
              }
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="video">Video (MP4)</MenuItem>
              <MenuItem value="audio">Audio Only (MP3)</MenuItem>
            </TextField>
            <TextField
              select
              label="Quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="best">Best</MenuItem>
              <MenuItem value="1080">1080p</MenuItem>
              <MenuItem value="720">720p</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={handleDownload}
              disabled={loading || !url}
            >
              {loading ? 'Queueing...' : 'Download Link'}
            </Button>
            <Button
              variant="outlined"
              href="/api/metube/download/"
              target="_blank"
            >
              Open Completed Files
            </Button>
          </Stack>
          {status && <Alert severity={status.type}>{status.msg}</Alert>}
        </Stack>
      }
    />
  );
}
