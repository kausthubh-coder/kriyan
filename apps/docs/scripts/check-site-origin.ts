import { productionSiteUrl, resolveSiteUrl } from '../lib/site'

function expectEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

expectEqual(
  resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: ' https://docs.example.com/ ',
    VERCEL_URL: 'ignored-preview.vercel.app',
  }),
  'https://docs.example.com',
  'NEXT_PUBLIC_SITE_URL precedence',
)

expectEqual(
  resolveSiteUrl({
    VERCEL_ENV: 'production',
    VERCEL_URL: 'generated-project-host.vercel.app',
  }),
  productionSiteUrl,
  'production public alias fallback',
)

expectEqual(
  resolveSiteUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'current-preview.vercel.app',
  }),
  'https://current-preview.vercel.app',
  'preview VERCEL_URL fallback',
)

expectEqual(
  resolveSiteUrl({}),
  'http://127.0.0.1:3020',
  'local development fallback',
)

for (const [source, environment] of [
  ['NEXT_PUBLIC_SITE_URL path rejection', { NEXT_PUBLIC_SITE_URL: 'https://docs.example.com/path' }],
  ['VERCEL_URL path rejection', { VERCEL_URL: 'preview.vercel.app/path' }],
] as const) {
  try {
    resolveSiteUrl(environment)
    throw new Error(`${source}: expected resolution to fail`)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('without a path')) {
      throw error
    }
  }
}

console.log('PASS site origin precedence, normalization, fallback, and validation')
