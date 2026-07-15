import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import { saveConfig, validateConfig } from '../../node/src/config'
import { writeProcessHealth } from '../../node/src/process-health'
import {
  runVpsCommand,
  VpsRuntimeError,
  VpsUsageError,
  type CommandResult,
  type CommandRunner,
} from '../src/vps'

const directories: string[] = []
const RELEASE_SHA = '1234567890abcdef1234567890abcdef12345678'

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

class FakeRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[] }> = []
  failScp = false
  failRemoteUpdate = false

  async run(
    command: string,
    args: string[],
    options: { env?: Record<string, string> } = {},
  ): Promise<CommandResult> {
    this.calls.push({ command, args })
    if (command === 'bash' && args[0]?.endsWith('/verify-release-archive.sh')) {
      const exported = options.env?.KRIYAN_EXPORT_TRUSTED_IDENTITY_FILE
      if (exported !== undefined) {
        await writeFile(exported, [
          `source_commit=${RELEASE_SHA}`,
          `source_tree=${'a'.repeat(40)}`,
          'source_date_epoch=1',
          `lock_sha256=${'b'.repeat(64)}`,
          `bun_version=${Bun.version}`,
          '',
        ].join('\n'))
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    }
    if (command === 'scp' && this.failScp) {
      return { exitCode: 1, stdout: '', stderr: 'transfer detail must stay private' }
    }
    if (command === 'ssh' && this.failRemoteUpdate && args.at(-1)?.includes('update.sh')) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'untrusted detail\nupdate failed at health stage (status 1); previous release restored and healthy\n',
      }
    }
    if (command === 'ssh' && args.at(-1)?.includes("'vps' 'doctor' '--local'")) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({
          ok: true,
          command: 'vps doctor',
          release: { version: RELEASE_SHA },
          service: { enabled: true, active: true },
          doctor: { config: 'pass', processHealth: 'pass', releaseIdentity: 'pass' },
        })}\n`,
        stderr: '',
      }
    }
    if (command === 'ssh' && args.at(-1)?.includes("'vps' 'status'")) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ ok: true, command: 'vps status' })}\n`,
        stderr: '',
      }
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
}

async function fixture(dataDirOverride?: string): Promise<{
  root: string
  archive: string
  checksum: string
  config: string
  dataDir: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-vps-test-'))
  directories.push(root)
  const archive = join(root, 'kriyan-release-1.tar.gz')
  await writeFile(archive, 'verified release fixture')
  const hash = new Bun.CryptoHasher('sha256').update(await Bun.file(archive).bytes()).digest('hex')
  const checksum = `${archive}.sha256`
  await writeFile(checksum, `${hash}  ${archive.split('/').at(-1)}\n`)
  const dataDir = dataDirOverride ?? join(root, 'state', 'node')
  const config = join(root, 'node.json')
  await saveConfig(config, validateConfig({
    convexUrl: 'https://example.convex.cloud',
    installationId: 'installation:vps-test',
    nodeId: 'node:vps-test',
    displayName: 'VPS test',
    protocolVersion: '1',
    dataDir,
    timezone: 'UTC',
    locale: 'en-US',
    runtime: 'fake',
  }))
  return { root, archive, checksum, config, dataDir }
}

function remoteOptions(): string[] {
  return [
    '--host', '203.0.113.10',
    '--user', 'ubuntu',
    '--port', '2222',
    '--identity', '/tmp/id_ed25519',
    '--known-hosts', '/tmp/known_hosts',
    '--host-key-policy', 'strict',
  ]
}

test('remote status makes SSH host-key and identity behavior explicit', async () => {
  const runner = new FakeRunner()
  const result = await runVpsCommand('status', remoteOptions(), { runner })
  expect(result).toMatchObject({
    ok: true,
    host: '203.0.113.10',
    transport: { user: 'ubuntu', port: 2222, hostKeyPolicy: 'strict', identity: 'explicit-file' },
  })
  const call = runner.calls[0]!
  expect(call.command).toBe('ssh')
  expect(call.args).toContain('BatchMode=yes')
  expect(call.args).toContain('IdentitiesOnly=yes')
  expect(call.args).toContain('UserKnownHostsFile=/tmp/known_hosts')
  expect(call.args).toContain('StrictHostKeyChecking=yes')
})

test('remote install verifies locally, transfers checksum and config, verifies remotely, and cleans up', async () => {
  const item = await fixture('/var/lib/kriyan/node')
  const runner = new FakeRunner()
  const result = await runVpsCommand('install', [
    ...remoteOptions(),
    '--release', item.archive,
    '--checksum', item.checksum,
    '--version', RELEASE_SHA,
    '--config', item.config,
  ], { runner, randomId: () => 'deterministic-id' })
  expect(result).toMatchObject({
    ok: true,
    host: '203.0.113.10',
    release: { version: RELEASE_SHA },
    service: { enabled: true, active: true },
  })
  expect(runner.calls.filter((call) => call.command === 'scp')).toHaveLength(4)
  expect(runner.calls.find((call) => call.command === 'bash')?.args.at(2)).toBe(RELEASE_SHA)
  expect(runner.calls.some((call) => call.args.at(-1)?.includes('sha256sum -c'))).toBe(true)
  expect(runner.calls.some((call) => call.args.at(-1)?.includes('install-transaction.sh'))).toBe(true)
  expect(runner.calls.some((call) => call.args.at(-1)?.includes('KRIYAN_TRUSTED_IDENTITY_FILE='))).toBe(true)
  expect(runner.calls.some((call) => call.args.at(-1)?.includes('/bootstrap/bin/kriyan'))).toBe(false)
  expect(runner.calls.at(-1)?.args.at(-1)).toContain("'rm' '-rf' '--' '/tmp/kriyan-transfer-deterministic-id'")
  const renderedCalls = JSON.stringify(runner.calls)
  expect(renderedCalls).not.toContain('installation:vps-test')
  expect(renderedCalls).not.toContain('example.convex.cloud')
})

test('failed transfer returns a stable error and still cleans remote staging', async () => {
  const item = await fixture('/var/lib/kriyan/node')
  const runner = new FakeRunner()
  runner.failScp = true
  await expect(runVpsCommand('install', [
    ...remoteOptions(),
    '--release', item.archive,
    '--checksum', item.checksum,
    '--version', RELEASE_SHA,
    '--config', item.config,
  ], { runner, randomId: () => 'failed-transfer' })).rejects.toBeInstanceOf(VpsRuntimeError)
  expect(runner.calls.at(-1)?.command).toBe('ssh')
  expect(runner.calls.at(-1)?.args.at(-1)).toContain('/tmp/kriyan-transfer-failed-transfer')
})

test('failed remote update reports its controlled lifecycle stage without arbitrary stderr', async () => {
  const item = await fixture('/var/lib/kriyan/node')
  const runner = new FakeRunner()
  runner.failRemoteUpdate = true
  await expect(runVpsCommand('update', [
    ...remoteOptions(),
    '--release', item.archive,
    '--checksum', item.checksum,
    '--version', RELEASE_SHA,
  ], { runner, randomId: () => 'failed-update' })).rejects.toThrow(
    'remote vps update failed: update failed at health stage (status 1); previous release restored and healthy',
  )
})

test('local status and doctor report release, systemd, and process identity without config contents', async () => {
  const item = await fixture()
  const release = join(item.root, 'opt', 'releases', RELEASE_SHA)
  await mkdir(join(release, 'bin'), { recursive: true })
  await writeFile(join(release, 'bin', 'kriyan'), '')
  await chmod(join(release, 'bin', 'kriyan'), 0o755)
  await symlink(release, join(item.root, 'opt', 'current'))
  await writeProcessHealth(item.dataDir, {
    schemaVersion: 1,
    installationId: 'installation:vps-test',
    nodeId: 'node:vps-test',
    processInstanceId: 'process:one',
    releaseId: RELEASE_SHA,
    pid: 42,
    startedAt: 1,
    heartbeatAt: 2,
    ready: true,
  })
  const runner = new FakeRunner()
  const paths = {
    optRoot: join(item.root, 'opt'),
    configPath: item.config,
    stateRoot: join(item.root, 'state'),
    systemdUnit: join(item.root, 'systemd', 'kriyan-node.service'),
    commandPath: join(item.root, 'bin', 'kriyan'),
  }
  const result = await runVpsCommand('doctor', ['--local'], {
    runner,
    platform: 'linux',
    isRoot: true,
    executablePath: join(release, 'bin', 'kriyan'),
    paths,
  })
  expect(result).toMatchObject({
    ok: true,
    release: { version: RELEASE_SHA },
    service: { enabled: true, active: true },
    doctor: { config: 'pass', processHealth: 'pass', releaseIdentity: 'pass' },
  })
  expect(JSON.stringify(result)).not.toContain('example.convex.cloud')
})

test('local repeat install, update, rollback, restart, and explicit uninstall modes have stable contracts', async () => {
  const item = await fixture()
  const release = join(item.root, 'release', 'bin')
  await mkdir(release, { recursive: true })
  const executable = join(release, 'kriyan')
  await writeFile(executable, '')
  await chmod(executable, 0o755)
  const optRelease = join(item.root, 'opt', 'releases', RELEASE_SHA)
  await mkdir(join(optRelease, 'bin'), { recursive: true })
  await symlink(optRelease, join(item.root, 'opt', 'current'))
  await writeProcessHealth(item.dataDir, {
    schemaVersion: 1,
    installationId: 'installation:vps-test',
    nodeId: 'node:vps-test',
    processInstanceId: 'process:repeat',
    releaseId: RELEASE_SHA,
    pid: 42,
    startedAt: 1,
    heartbeatAt: Date.now(),
    ready: true,
  })
  const paths = {
    optRoot: join(item.root, 'opt'),
    configPath: item.config,
    stateRoot: join(item.root, 'state'),
    systemdUnit: join(item.root, 'systemd', 'kriyan-node.service'),
    commandPath: join(item.root, 'bin', 'kriyan'),
  }
  const runner = new FakeRunner()
  const dependencies = { runner, platform: 'linux' as const, isRoot: true, executablePath: executable, paths }
  const installArgs = [
    '--local', '--release', item.archive, '--checksum', item.checksum,
    '--version', RELEASE_SHA, '--config', item.config,
  ]
  await runVpsCommand('install', installArgs, dependencies)
  await runVpsCommand('install', installArgs, dependencies)
  await runVpsCommand('update', [
    '--local', '--release', item.archive, '--checksum', item.checksum, '--version', RELEASE_SHA,
  ], dependencies)
  await runVpsCommand('rollback', ['--local', '--version', RELEASE_SHA], dependencies)
  await runVpsCommand('restart', ['--local'], dependencies)
  expect(await runVpsCommand('uninstall', ['--local', '--preserve-data'], dependencies)).toMatchObject({
    ok: true,
    data: 'preserved',
  })
  expect(await runVpsCommand('uninstall', ['--local', '--purge-data'], dependencies)).toMatchObject({
    ok: true,
    data: 'purged',
  })
  expect(runner.calls.filter((call) => call.command === 'bash' && call.args[0]?.endsWith('/install-transaction.sh'))).toHaveLength(2)
  expect(runner.calls.some((call) => call.args[0]?.endsWith('/update.sh'))).toBe(true)
  expect(runner.calls.some((call) => call.args[0]?.endsWith('/rollback.sh'))).toBe(true)
  expect(runner.calls.some((call) => call.args[0]?.endsWith('/restart.sh'))).toBe(true)
  expect(runner.calls.filter((call) => call.args[0]?.endsWith('/uninstall.sh'))).toHaveLength(2)
})

test('invalid local/remote inputs fail before any command execution', async () => {
  const runner = new FakeRunner()
  await expect(runVpsCommand('status', ['--host', '-unsafe', '--user', 'ubuntu', '--known-hosts', '/tmp/known'], { runner }))
    .rejects.toBeInstanceOf(VpsUsageError)
  await expect(runVpsCommand('uninstall', ['--local'], { runner, platform: 'linux', isRoot: true }))
    .rejects.toBeInstanceOf(VpsUsageError)
  await expect(runVpsCommand('uninstall', ['--local', '--preserve-data', '--purge-data'], { runner }))
    .rejects.toBeInstanceOf(VpsUsageError)
  for (const [flag, value] of [
    ['--host', 'example.com'],
    ['--user', 'ubuntu'],
    ['--port', '2222'],
    ['--identity', '/tmp/id'],
    ['--known-hosts', '/tmp/known'],
    ['--host-key-policy', 'accept-new'],
  ]) {
    await expect(runVpsCommand('status', ['--local', flag!, value!], {
      runner,
      platform: 'linux',
      isRoot: true,
    })).rejects.toThrow('--local cannot be combined with SSH options')
  }
  expect(runner.calls).toHaveLength(0)
})

test('install rejects a dataDir outside the configured systemd state root', async () => {
  const item = await fixture(join(tmpdir(), 'outside-kriyan-state'))
  const runner = new FakeRunner()
  const release = join(item.root, 'release', 'bin')
  await mkdir(release, { recursive: true })
  const executable = join(release, 'kriyan')
  await writeFile(executable, '')
  await chmod(executable, 0o755)

  await expect(runVpsCommand('install', [
    '--local', '--release', item.archive, '--checksum', item.checksum,
    '--version', RELEASE_SHA, '--config', item.config,
  ], {
    runner,
    platform: 'linux',
    isRoot: true,
    executablePath: executable,
    paths: {
      optRoot: join(item.root, 'opt'),
      configPath: join(item.root, 'etc', 'node.json'),
      stateRoot: join(item.root, 'state'),
      systemdUnit: join(item.root, 'systemd', 'kriyan-node.service'),
      commandPath: join(item.root, 'bin', 'kriyan'),
    },
  })).rejects.toThrow('installed config dataDir must be within')
  expect(runner.calls.some((call) => call.args[0]?.endsWith('/install.sh'))).toBe(false)
})

test('node config rejects provider tokens, deploy keys, and every unknown field', () => {
  const base = {
    convexUrl: 'https://example.convex.cloud',
    installationId: 'installation:no-secrets',
    nodeId: 'node:no-secrets',
    dataDir: '/var/lib/kriyan',
    timezone: 'UTC',
    locale: 'en-US',
    runtime: 'fake',
  }
  for (const field of ['providerToken', 'convexDeployKey', 'apiKey']) {
    expect(() => validateConfig({ ...base, [field]: 'must-not-be-accepted' })).toThrow(
      `config contains unsupported fields: ${field}`,
    )
  }
})
