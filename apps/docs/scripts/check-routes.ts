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
  let samePageAnchorCount = 0

  for (const route of requiredRoutes) {
    const response = await fetch(`${baseUrl}${route}`)
    if (response.status !== 200) {
      throw new Error(`${route} returned ${response.status}`)
    }

    const html = await response.text()
    if (
      route === '/' &&
      (!html.includes('property="og:image"') ||
        !html.includes('name="twitter:card"'))
    ) {
      throw new Error('Home page is missing Open Graph or Twitter metadata')
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

  for (const route of metadataRoutes) {
    const response = await fetch(`${baseUrl}${route.path}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes(route.contentType)) {
      throw new Error(
        `${route.path} returned ${response.status} with ${contentType}`,
      )
    }
    console.log(`PASS ${response.status} ${route.path} (${route.contentType})`)
  }

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
