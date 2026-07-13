type SiteEnvironment = {
  readonly NEXT_PUBLIC_SITE_URL?: string
  readonly VERCEL_ENV?: string
  readonly VERCEL_URL?: string
}

const localSiteUrl = 'http://127.0.0.1:3020'
export const productionSiteUrl = 'https://kriyan-docs.vercel.app'

function normalizeOrigin(value: string, source: string): string {
  const candidate =
    source === 'VERCEL_URL' && !value.includes('://')
      ? `https://${value}`
      : value
  const url = new URL(candidate)

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${source} must be an HTTP(S) origin without a path`)
  }

  return url.origin
}

export function resolveSiteUrl(environment: SiteEnvironment): string {
  const configuredUrl = environment.NEXT_PUBLIC_SITE_URL?.trim()
  if (configuredUrl) return normalizeOrigin(configuredUrl, 'NEXT_PUBLIC_SITE_URL')

  if (environment.VERCEL_ENV?.trim() === 'production') {
    return productionSiteUrl
  }

  const vercelUrl = environment.VERCEL_URL?.trim()
  if (vercelUrl) return normalizeOrigin(vercelUrl, 'VERCEL_URL')

  return localSiteUrl
}

export const siteUrl = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
})

export function siteHref(path: string): string {
  return new URL(path, `${siteUrl}/`).toString()
}
