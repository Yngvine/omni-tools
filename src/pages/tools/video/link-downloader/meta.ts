import { defineTool } from '@tools/defineTool';
import { lazy } from 'react';

export const tool = defineTool('video', {
  i18n: {
    name: 'video:linkDownloader.title',
    description: 'video:linkDownloader.description',
    shortDescription: 'video:linkDownloader.shortDescription',
    longDescription: 'video:linkDownloader.longDescription'
  },
  path: 'link-downloader',
  icon: '',
  keywords: ['link', 'downloader'],
  component: lazy(() => import('./index'))
});
