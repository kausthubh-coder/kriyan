import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import provenanceLib from '../../../packaging/scripts/provenance-lib.sh' with { type: 'text' }
import scanBinaryContent from '../../../packaging/scripts/scan-binary-content.sh' with { type: 'text' }
import verifyCanonicalArchive from '../../../packaging/scripts/verify-canonical-archive.pl' with { type: 'text' }
import verifyReleaseArchive from '../../../packaging/scripts/verify-release-archive.sh' with { type: 'text' }
import verifySafeArchive from '../../../packaging/scripts/verify-safe-archive.sh' with { type: 'text' }

import type { CommandRunner } from './vps'

declare const KRIYAN_TRUSTED_SOURCE_COMMIT: string
declare const KRIYAN_TRUSTED_SOURCE_TREE: string
declare const KRIYAN_TRUSTED_SOURCE_EPOCH: string
declare const KRIYAN_TRUSTED_LOCK_SHA256: string
declare const KRIYAN_TRUSTED_BUN_VERSION: string

interface TrustedReleaseIdentity {
  sourceCommit: string
  sourceTree: string
  sourceDateEpoch: string
  lockSha256: string
  bunVersion: string
}

function embeddedTrustedReleaseIdentity(): TrustedReleaseIdentity | null {
  if (
    typeof KRIYAN_TRUSTED_SOURCE_COMMIT === 'undefined' ||
    typeof KRIYAN_TRUSTED_SOURCE_TREE === 'undefined' ||
    typeof KRIYAN_TRUSTED_SOURCE_EPOCH === 'undefined' ||
    typeof KRIYAN_TRUSTED_LOCK_SHA256 === 'undefined' ||
    typeof KRIYAN_TRUSTED_BUN_VERSION === 'undefined'
  ) return null
  return {
    sourceCommit: KRIYAN_TRUSTED_SOURCE_COMMIT,
    sourceTree: KRIYAN_TRUSTED_SOURCE_TREE,
    sourceDateEpoch: KRIYAN_TRUSTED_SOURCE_EPOCH,
    lockSha256: KRIYAN_TRUSTED_LOCK_SHA256,
    bunVersion: KRIYAN_TRUSTED_BUN_VERSION,
  }
}

const TRUSTED_SCRIPTS: ReadonlyArray<readonly [string, string, number]> = [
  ['provenance-lib.sh', provenanceLib, 0o644],
  ['scan-binary-content.sh', scanBinaryContent, 0o755],
  ['verify-canonical-archive.pl', verifyCanonicalArchive, 0o755],
  ['verify-release-archive.sh', verifyReleaseArchive, 0o755],
  ['verify-safe-archive.sh', verifySafeArchive, 0o755],
]

export async function withTrustedReleaseVerifier<T>(
  runner: CommandRunner,
  callback: (
    verifierPath: string,
    options: { env?: Record<string, string> },
    exportedIdentityPath: string,
  ) => Promise<T>,
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
    const embedded = embeddedTrustedReleaseIdentity()
    const exportedIdentityPath = join(root, 'verified-release-identity.manifest')
    if (embedded === null) {
      return await callback(join(scripts, 'verify-release-archive.sh'), {
        env: {
          KRIYAN_TRUSTED_IDENTITY_FILE: '',
          KRIYAN_EXPORT_TRUSTED_IDENTITY_FILE: exportedIdentityPath,
        },
      }, exportedIdentityPath)
    }
    const identityPath = join(root, 'trusted-release-identity.manifest')
    await writeFile(identityPath, [
      `source_commit=${embedded.sourceCommit}`,
      `source_tree=${embedded.sourceTree}`,
      `source_date_epoch=${embedded.sourceDateEpoch}`,
      `lock_sha256=${embedded.lockSha256}`,
      `bun_version=${embedded.bunVersion}`,
      '',
    ].join('\n'), { mode: 0o600 })
    return await callback(join(scripts, 'verify-release-archive.sh'), {
      env: {
        KRIYAN_TRUSTED_IDENTITY_FILE: identityPath,
        KRIYAN_EXPORT_TRUSTED_IDENTITY_FILE: exportedIdentityPath,
      },
    }, exportedIdentityPath)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
