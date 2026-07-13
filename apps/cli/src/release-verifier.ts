import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import provenanceLib from '../../../packaging/scripts/provenance-lib.sh' with { type: 'text' }
import scanBinaryContent from '../../../packaging/scripts/scan-binary-content.sh' with { type: 'text' }
import verifyCanonicalArchive from '../../../packaging/scripts/verify-canonical-archive.pl' with { type: 'text' }
import verifyReleaseArchive from '../../../packaging/scripts/verify-release-archive.sh' with { type: 'text' }
import verifySafeArchive from '../../../packaging/scripts/verify-safe-archive.sh' with { type: 'text' }

import type { CommandRunner } from './vps'

const TRUSTED_SCRIPTS: ReadonlyArray<readonly [string, string, number]> = [
  ['provenance-lib.sh', provenanceLib, 0o644],
  ['scan-binary-content.sh', scanBinaryContent, 0o755],
  ['verify-canonical-archive.pl', verifyCanonicalArchive, 0o755],
  ['verify-release-archive.sh', verifyReleaseArchive, 0o755],
  ['verify-safe-archive.sh', verifySafeArchive, 0o755],
]

export async function withTrustedReleaseVerifier<T>(
  runner: CommandRunner,
  callback: (verifierPath: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-trusted-verifier-'))
  const scripts = join(root, 'packaging', 'scripts')
  try {
    await mkdir(scripts, { recursive: true, mode: 0o700 })
    for (const [name, source, mode] of TRUSTED_SCRIPTS) {
      const path = join(scripts, name)
      await writeFile(path, source, { mode })
      await chmod(path, mode)
    }
    return await callback(join(scripts, 'verify-release-archive.sh'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
