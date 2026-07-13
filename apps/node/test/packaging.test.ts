import { readFile } from 'node:fs/promises'

import { expect, test } from 'bun:test'

test('systemd service is unprivileged, hardened, and drains on SIGTERM', async () => {
  const unit = await readFile('packaging/systemd/kriyan-node.service', 'utf8')
  expect(unit).toContain('User=kriyan')
  expect(unit).toContain('Group=kriyan')
  expect(unit).toContain('NoNewPrivileges=true')
  expect(unit).toContain('ProtectSystem=strict')
  expect(unit).toContain('KillSignal=SIGTERM')
  expect(unit).toContain('TimeoutStopSec=45s')
  expect(unit).not.toContain('User=root')
})

test('install and update paths are interruption-safe and rollback-capable', async () => {
  const install = await readFile('packaging/scripts/install.sh', 'utf8')
  const update = await readFile('packaging/scripts/update.sh', 'utf8')
  expect(install).toContain('.partial.$$')
  expect(install).toContain("trap 'rm -rf")
  expect(install).toContain('install --frozen-lockfile --production')
  expect(update).toContain('previous=$(readlink -f')
  expect(update).toContain('previous release restored')
})
