import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const extraArgs = Bun.argv.slice(2)

if (extraArgs.includes('--file')) {
  throw new Error('check:convex-metadata owns its secure temporary output path; do not pass --file')
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'kriyan-convex-metadata-'))
const specPath = join(temporaryDirectory, 'function-spec.json')

try {
  await chmod(temporaryDirectory, 0o700)
  const metadata = Bun.spawn(
    ['bunx', 'convex', 'function-spec', ...extraArgs],
    { cwd: root, stdout: 'pipe', stderr: 'inherit' },
  )
  const output = await new Response(metadata.stdout).text()
  const metadataExit = await metadata.exited
  if (metadataExit !== 0) {
    throw new Error(`convex function-spec failed with exit code ${metadataExit}`)
  }
  await writeFile(specPath, output, { encoding: 'utf8', mode: 0o600 })

  console.log(`Validating Convex metadata with argv path: ${specPath}`)
  const validator = Bun.spawn(
    [process.execPath, 'scripts/assert-convex-function-spec.ts', specPath],
    { cwd: root, stdout: 'inherit', stderr: 'inherit' },
  )
  const validatorExit = await validator.exited
  if (validatorExit !== 0) {
    throw new Error(`Convex metadata validator failed with exit code ${validatorExit}`)
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
