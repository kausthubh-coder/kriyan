const css = await Bun.file(new URL('../app/globals.css', import.meta.url)).text()

type Oklch = readonly [number, number, number]

function requireMatch(value: string, pattern: RegExp, message: string): RegExpMatchArray {
  const match = value.match(pattern)
  if (!match) throw new Error(message)
  return match
}

function tokens(block: string): Map<string, Oklch> {
  const values = new Map<string, Oklch>()
  for (const match of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)\s+([\d.]+);/g)) {
    values.set(match[1] ?? '', [Number(match[2]), Number(match[3]), Number(match[4])])
  }
  return values
}

function linearSrgb([lightness, chroma, hue]: Oklch): Oklch {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel))) as unknown as Oklch
}

function luminance(color: Oklch): number {
  const [red, green, blue] = linearSrgb(color)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: Oklch, background: Oklch): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function token(theme: Map<string, Oklch>, name: string): Oklch {
  const value = theme.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function assertContrast(
  themeName: string,
  foregroundName: string,
  backgroundName: string,
  theme: Map<string, Oklch>,
): void {
  const ratio = contrast(token(theme, foregroundName), token(theme, backgroundName))
  if (ratio < 4.5) {
    throw new Error(`${themeName} ${foregroundName}/${backgroundName} is ${ratio.toFixed(3)}:1`)
  }
  console.log(`PASS ${themeName} ${foregroundName}/${backgroundName} ${ratio.toFixed(3)}:1`)
}

const rootBlock = requireMatch(css, /^:root\s*\{([\s\S]*?)^\}/m, 'Missing light tokens')[1] ?? ''
const darkBlock = requireMatch(
  css,
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/,
  'Missing dark tokens',
)[1] ?? ''
const light = tokens(rootBlock)
const dark = new Map([...light, ...tokens(darkBlock)])

for (const [name, theme, backgrounds] of [
  ['light', light, ['bg', 'surface', 'panel']],
  ['dark', dark, ['bg', 'surface', 'panel', 'void-1']],
] as const) {
  for (const background of backgrounds) {
    assertContrast(name, 'primary-foreground', background, theme)
  }
  assertContrast(name, 'primary-ink', 'primary-fill', theme)
  assertContrast(name, 'primary-ink', 'primary-fill-hover', theme)
}

if (/--primary(?:-hover)?:/.test(css)) throw new Error('Legacy combined primary token remains')
if (/\.hero\s*\{[^}]*overflow:\s*hidden/.test(css)) throw new Error('Hero still clips overflow')
if (/\.site-shell\s*\{[^}]*overflow:/.test(css)) throw new Error('Site shell still masks overflow')

for (const [pattern, message] of [
  [/\.mobile-nav summary\s*\{[^}]*min-height:\s*44px/, 'Menu target is below 44px'],
  [/\.hero\s*\{[^}]*min-width:\s*0/, 'Hero cannot shrink intrinsically'],
  [/\.hero-copy\s*\{[^}]*min-width:\s*0/, 'Hero copy cannot shrink intrinsically'],
  [/\.release-signal\s*\{[^}]*flex-wrap:\s*wrap/, 'Release signal cannot wrap'],
  [/font-size:\s*clamp\(2\.5rem,\s*11\.5vw,\s*4\.65rem\)/, 'Phone hero type is not bounded'],
  [/\.hero h1\s*\{[^}]*overflow-wrap:\s*anywhere/, 'Hero heading lacks an emergency wrap'],
  [/\.boundary-diagram \.boundary-core span\s*\{[^}]*color:\s*oklch\(var\(--primary-ink\)\);/, 'Runtime label is translucent'],
] as const) {
  requireMatch(css, pattern, message)
}

console.log('PASS responsive CSS invariants')
