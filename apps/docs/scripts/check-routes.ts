import { siteHref, siteUrl } from '../lib/site'

const host = '127.0.0.1'
const port = 4329
const baseUrl = `http://${host}:${port}`
const requiredRoutes = [
  '/',
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
const metadataRoutes = [
  { path: '/opengraph-image', contentType: 'image/png' },
  { path: '/icon.svg', contentType: 'image/svg+xml' },
  { path: '/robots.txt', contentType: 'text/plain' },
  { path: '/sitemap.xml', contentType: 'application/xml' },
]

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1]
}

function metadataValue(
  html: string,
  identifyingAttribute: 'name' | 'property' | 'rel',
  identifyingValue: string,
  valueAttribute: 'content' | 'href',
): string | undefined {
  for (const match of html.matchAll(/<(?:link|meta)\b[^>]*>/gi)) {
    const tag = match[0]
    if (attribute(tag, identifyingAttribute) === identifyingValue) {
      return attribute(tag, valueAttribute)
    }
  }

  return undefined
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const server = Bun.spawn(
  ['bun', 'run', 'start', '--hostname', host, '--port', String(port)],
  {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, NODE_ENV: 'production' },
    stdout: 'pipe',
    stderr: 'pipe',
  },
)

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The production server is still starting.
    }
    await Bun.sleep(100)
  }

  throw new Error('Timed out waiting for the Next.js production server')
}

function internalLinks(html: string): string[] {
  const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map(
    (match) => match[1] ?? '/',
  )

  return [...new Set(links)].filter(
    (href) => !href.startsWith('/_next/') && !href.startsWith('/icon'),
  )
}

try {
  await waitForServer()
  const discoveredLinks = new Set<string>()
  const renderedPages = new Map<string, string>()
  let samePageAnchorCount = 0

  for (const route of requiredRoutes) {
    const response = await fetch(`${baseUrl}${route}`)
    if (response.status !== 200) {
      throw new Error(`${route} returned ${response.status}`)
    }

    const html = await response.text()
    renderedPages.set(route, html)
    const currentLinks = [...html.matchAll(/<a\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => attribute(tag, 'aria-current') === 'page')
    if (
      currentLinks.length === 0 ||
      currentLinks.some((tag) => attribute(tag, 'href') !== route) ||
      !html.includes('current-route-label') ||
      !html.includes('>Current<')
    ) {
      throw new Error(`${route} does not expose its current route semantically and visibly`)
    }
    const canonical = metadataValue(html, 'rel', 'canonical', 'href')
    const expectedCanonical = route === '/' ? siteUrl : siteHref(route)
    if (canonical !== expectedCanonical) {
      throw new Error(
        `${route} canonical was ${canonical ?? 'missing'}, expected ${expectedCanonical}`,
      )
    }
    if (
      route === '/' &&
      (!html.includes('property="og:image"') ||
        !html.includes('name="twitter:card"'))
    ) {
      throw new Error('Home page is missing Open Graph or Twitter metadata')
    }
    if (route === '/') {
      const openGraphUrl = metadataValue(
        html,
        'property',
        'og:url',
        'content',
      )
      const openGraphImage = metadataValue(
        html,
        'property',
        'og:image',
        'content',
      )
      if (openGraphUrl !== siteUrl) {
        throw new Error(`Open Graph URL was ${openGraphUrl ?? 'missing'}`)
      }
      if (
        !openGraphImage ||
        new URL(openGraphImage).origin !== siteUrl ||
        new URL(openGraphImage).pathname !== '/opengraph-image'
      ) {
        throw new Error(
          `Open Graph image did not use ${siteUrl}: ${openGraphImage ?? 'missing'}`,
        )
      }
    }
    for (const match of html.matchAll(/href="#([^"]+)"/g)) {
      const id = decodeURIComponent(match[1] ?? '')
      if (!html.includes(`id="${id}"`)) {
        throw new Error(`${route} points to missing same-page anchor #${id}`)
      }
      samePageAnchorCount += 1
    }
    for (const href of internalLinks(html)) discoveredLinks.add(href)
    console.log(`PASS ${response.status} ${route}`)
  }

  for (const href of discoveredLinks) {
    const target = new URL(href, baseUrl)
    const response = await fetch(target)
    if (!response.ok) {
      throw new Error(`Internal link ${href} returned ${response.status}`)
    }

    if (target.hash) {
      const html = await response.text()
      const id = decodeURIComponent(target.hash.slice(1))
      if (!html.includes(`id="${id}"`)) {
        throw new Error(`Internal link ${href} points to a missing anchor`)
      }
    }
  }
  console.log(
    `PASS ${discoveredLinks.size} unique internal links and ${samePageAnchorCount} same-page anchors`,
  )
  console.log('PASS aria-current and visible current-route labels')

  for (const route of metadataRoutes) {
    const response = await fetch(`${baseUrl}${route.path}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes(route.contentType)) {
      throw new Error(
        `${route.path} returned ${response.status} with ${contentType}`,
      )
    }
    if (route.path === '/robots.txt') {
      const body = await response.text()
      if (!body.includes(`Sitemap: ${siteHref('/sitemap.xml')}`)) {
        throw new Error('/robots.txt did not advertise the canonical sitemap')
      }
    }
    if (route.path === '/sitemap.xml') {
      const body = await response.text()
      const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => match[1],
      )
      const expectedLocations = requiredRoutes.map((path) => siteHref(path))
      if (
        locations.length !== expectedLocations.length ||
        expectedLocations.some((location) => !locations.includes(location))
      ) {
        throw new Error(
          `/sitemap.xml URLs did not match ${siteUrl}: ${locations.join(', ')}`,
        )
      }
    }
    console.log(`PASS ${response.status} ${route.path} (${route.contentType})`)
  }

  const installCopy = visibleText(renderedPages.get('/docs/install') ?? '')
  const updateCopy = visibleText(renderedPages.get('/docs/updates') ?? '')
  const requiredInstallCopy = [
    'macOS arm64 DMG',
    'Android APK',
    'Linux x64 node archive',
    'Darwin operator CLI',
    'only this documentation site is hosted publicly',
    'macOS is ad-hoc signed and not notarized',
    'Android is debug-signed for direct installation',
    'It reports the configured data directory path but does not inspect that directory.',
    'does not check whether the reported path exists',
    'sudo test -d "$DATA_DIR"',
    "stat -c '%U:%G:%a'",
    'sudo -u kriyan test -w "$DATA_DIR"',
    'df -h -- "$DATA_DIR"',
    'df -i -- "$DATA_DIR"',
  ]
  for (const copy of requiredInstallCopy) {
    if (!installCopy.includes(copy)) {
      throw new Error(`/docs/install is missing truthful operator copy: ${copy}`)
    }
  }
  if (
    !updateCopy.includes('record the reported data directory path') ||
    !updateCopy.includes('Inspect storage separately.')
  ) {
    throw new Error('/docs/updates is missing the separate storage-check gate')
  }
  for (const overclaim of [
    'Checks config, Convex reachability, node health, and the configured data directory.',
    'Config, Convex, node health, and data directory checks pass.',
  ]) {
    if (installCopy.includes(overclaim) || updateCopy.includes(overclaim)) {
      throw new Error(`Docs still contain the doctor overclaim: ${overclaim}`)
    }
  }
  console.log('PASS doctor copy and Ubuntu filesystem checks')

  const operationalCopy = [...renderedPages.values()]
    .map(visibleText)
    .join(' ')
  for (const requiredCopy of [
    'The reference DigitalOcean service is healthy on the exact promoted node build.',
    'The later promotion passed',
    'deterministic Agent round trip passed',
    'No exact packaged-Tauri-to-VPS Agent proof',
    'No hosted product workspace; the public production surface is documentation only.',
    'The macOS app is ad-hoc signed, strictly sealed, Apple-silicon only, and not notarized.',
    'The Android APK is debug-signed for direct installation',
  ]) {
    if (!operationalCopy.includes(requiredCopy)) {
      throw new Error(`Docs are missing verified operational copy: ${requiredCopy}`)
    }
  }
  for (const staleCopy of [
    'No public installer is advertised here.',
    'does not publish a general download URL',
    'No general public standalone CLI/node download',
    'Android emulator, physical Android, and iOS runtime behavior remain unverified.',
    'live deployment proof pending',
    'live release proof pending',
    'No fresh Convex Cloud + Ubuntu VPS round trip is claimed yet.',
    'No production docs deployment',
    'pending fresh-cloud, host-restart, and real desktop-to-node proof',
    'No running DigitalOcean',
    'This checkpoint does not claim that live proof.',
    'None of those live claims are made by this docs checkpoint.',
    'a production Convex deployment, a verified VPS, and a desktop round trip are not claimed here.',
    'claims no clean-host release proof',
  ]) {
    if (operationalCopy.includes(staleCopy)) {
      throw new Error(`Docs contain stale operational copy: ${staleCopy}`)
    }
  }
  console.log('PASS V1 distribution, promoted VPS truth, and stale-copy regression guard')

  const missingResponse = await fetch(`${baseUrl}/outside-the-constellation`)
  const missingHtml = await missingResponse.text()
  if (
    missingResponse.status !== 404 ||
    !missingHtml.includes('outside the map')
  ) {
    throw new Error('The not-found route did not return the expected 404 page')
  }
  console.log('PASS 404 /outside-the-constellation')
} finally {
  server.kill('SIGTERM')
  await server.exited
}
