import type { MetadataRoute } from 'next'

import { siteHref } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: siteHref('/sitemap.xml'),
  }
}
