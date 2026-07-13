import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '',
    '/docs',
    '/docs/architecture',
    '/docs/install',
    '/docs/convex',
    '/docs/vps',
    '/docs/desktop',
    '/docs/second-brain',
    '/docs/troubleshooting',
    '/docs/updates',
    '/docs/status',
  ]

  return paths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date('2026-07-13T00:00:00.000Z'),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/docs' ? 0.9 : 0.8,
  }))
}
