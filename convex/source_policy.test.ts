import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const convexRoot = resolve(import.meta.dirname)
const generatedApiPath = resolve(convexRoot, '_generated/api.d.ts')

function sourceModules(directory = convexRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '_generated' ? [] : sourceModules(absolute)
    }
    if (
      !entry.name.endsWith('.ts')
      || entry.name.endsWith('.test.ts')
      || entry.name.endsWith('.d.ts')
      || entry.name === 'schema.ts'
    ) return []
    return [relative(convexRoot, absolute).replace(/\.ts$/, '').replaceAll('\\', '/')]
  }).sort()
}

describe('Convex source policy', () => {
  test('uses only legal Convex module path components', () => {
    const invalid = sourceModules().filter((modulePath) =>
      modulePath.split('/').some((component) => !/^[A-Za-z0-9_.]+$/.test(component)),
    )
    expect(invalid).toEqual([])
  })

  test('commits generated API bindings for every source module', () => {
    const generated = readFileSync(generatedApiPath, 'utf8')
    const boundModules = [...generated.matchAll(/import type \* as \w+ from "\.\.\/([^";]+)\.js";/g)]
      .map((match) => match[1])
      .sort()
    expect(boundModules).toEqual(sourceModules())
  })
})
