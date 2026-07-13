import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

import { canonicalJson, sha256 } from './ids'

interface JournalRecord {
  schemaVersion: 1
  target: string
  temporary: string
  contentHash: string
}

export class StaleHashError extends Error {
  readonly code = 'STALE_HASH'
}

async function existingHash(path: string): Promise<string | null> {
  try {
    return sha256(await readFile(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export class AtomicFileStore {
  private readonly root: string
  private readonly journalRoot: string

  constructor(root: string) {
    this.root = resolve(root)
    this.journalRoot = join(this.root, '.journal')
  }

  resolvePath(relativePath: string): string {
    const absolute = resolve(this.root, relativePath)
    const child = relative(this.root, absolute)
    if (child.startsWith('..') || child === '' || child.includes('\u0000')) {
      throw new Error('path must stay inside the vault')
    }
    return absolute
  }

  async hash(relativePath: string): Promise<string | null> {
    return await existingHash(this.resolvePath(relativePath))
  }

  async write(relativePath: string, content: string, expectedHash?: string | null): Promise<string> {
    const target = this.resolvePath(relativePath)
    const currentHash = await existingHash(target)
    if (expectedHash !== undefined && currentHash !== expectedHash) {
      throw new StaleHashError(`expected ${expectedHash ?? 'missing'} but found ${currentHash ?? 'missing'}`)
    }
    const contentHash = sha256(content)
    if (currentHash === contentHash) return contentHash

    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await mkdir(this.journalRoot, { recursive: true, mode: 0o700 })
    const nonce = crypto.randomUUID()
    const temporary = `${target}.${nonce}.tmp`
    const journal = join(this.journalRoot, `${nonce}.json`)
    const record: JournalRecord = {
      schemaVersion: 1,
      target: relative(this.root, target),
      temporary: relative(this.root, temporary),
      contentHash,
    }

    const temporaryHandle = await open(temporary, 'wx', 0o600)
    try {
      await temporaryHandle.writeFile(content)
      await temporaryHandle.sync()
    } finally {
      await temporaryHandle.close()
    }
    let journalReady = false
    try {
      const journalHandle = await open(journal, 'wx', 0o600)
      try {
        await journalHandle.writeFile(`${canonicalJson(record)}\n`)
        await journalHandle.sync()
        journalReady = true
      } finally {
        await journalHandle.close()
      }
      await rename(temporary, target)
      await rm(journal, { force: true })
    } catch (error) {
      if (!journalReady) {
        await rm(temporary, { force: true })
        await rm(journal, { force: true })
      }
      throw error
    }
    return contentHash
  }

  async recover(): Promise<number> {
    const entries = await readdir(this.journalRoot).catch(() => [])
    let recovered = 0
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.json')) continue
      const journal = join(this.journalRoot, entry)
      try {
        const record = JSON.parse(await readFile(journal, 'utf8')) as JournalRecord
        if (record.schemaVersion !== 1) throw new Error('unsupported journal')
        const target = this.resolvePath(record.target)
        const temporary = this.resolvePath(record.temporary)
        const temporaryHash = await existingHash(temporary)
        const targetHash = await existingHash(target)
        if (temporaryHash === record.contentHash) {
          await mkdir(dirname(target), { recursive: true, mode: 0o700 })
          await rename(temporary, target)
          recovered += 1
        } else if (targetHash !== record.contentHash) {
          await rm(temporary, { force: true })
        }
      } finally {
        await rm(journal, { force: true })
      }
    }
    return recovered
  }

  async exists(relativePath: string): Promise<boolean> {
    return await stat(this.resolvePath(relativePath)).then(() => true).catch(() => false)
  }
}
