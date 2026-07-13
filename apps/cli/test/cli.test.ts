import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import { MemoryControlPlane } from '../../node/test/memory-plane'
import { runCli } from '../src/cli'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function capture() {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: { out: (value: string) => stdout.push(value), err: (value: string) => stderr.push(value) },
  }
}

test('setup is noninteractive and writes a validated private config', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-cli-'))
  directories.push(directory)
  const config = join(directory, 'node.json')
  const output = capture()
  const code = await runCli(
    [
      'setup',
      '--convex-url',
      'https://example.convex.cloud',
      '--installation-id',
      'installation:test',
      '--node-id',
      'node:test',
      '--data-dir',
      join(directory, 'data'),
      '--config',
      config,
    ],
    { io: output.io },
  )
  expect(code).toBe(0)
  expect(JSON.parse(output.stdout[0]!)).toMatchObject({ ok: true, command: 'setup' })
  expect((await Bun.file(config).stat()).mode & 0o777).toBe(0o600)
})

test('invalid setup uses stderr and stable usage exit code', async () => {
  const output = capture()
  const code = await runCli(['setup', '--convex-url', 'http://public.example'], { io: output.io })
  expect(code).toBe(2)
  expect(output.stdout).toEqual([])
  expect(JSON.parse(output.stderr[0]!)).toMatchObject({ ok: false })
})

test('pair, doctor, and submit emit JSON without prompts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-cli-'))
  directories.push(directory)
  const config = join(directory, 'node.json')
  const setup = capture()
  await runCli(
    [
      'setup', '--convex-url', 'https://example.convex.cloud',
      '--installation-id', 'installation:test', '--node-id', 'node:test',
      '--data-dir', join(directory, 'data'), '--config', config,
    ],
    { io: setup.io },
  )
  const plane = new MemoryControlPlane()
  const pair = capture()
  expect(await runCli(['pair', '--config', config], { io: pair.io, plane: () => plane })).toBe(0)
  const doctor = capture()
  expect(await runCli(['doctor', '--config', config], { io: doctor.io, plane: () => plane })).toBe(0)
  const submit = capture()
  expect(
    await runCli(
      ['submit', '--text', 'remind me to practice Korean', '--config', config],
      { io: submit.io, plane: () => plane, now: () => 42 },
    ),
  ).toBe(0)
  expect(JSON.parse(submit.stdout[0]!)).toMatchObject({ ok: true, command: 'submit', created: true })
})
