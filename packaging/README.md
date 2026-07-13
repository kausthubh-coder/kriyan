# Kriyan node deployment

The primary Ubuntu 24.04 x64 artifact is a Bun standalone Linux x64 executable. The source archive is supplemental for audit/debugging. The service runs as the unprivileged `kriyan` user, keeps config in `/etc/kriyan/node.json` (`0640`, owned by `root:kriyan`) and private state in `/var/lib/kriyan`.

## Build and stage

```sh
bun install --frozen-lockfile
bun run typecheck:node
bun run test:node
packaging/scripts/build-isolated.sh SHA /tmp/kriyan-build-1
packaging/scripts/build-isolated.sh SHA /tmp/kriyan-build-2
packaging/scripts/compare-builds.sh /tmp/kriyan-build-1 /tmp/kriyan-build-2 /tmp/kriyan-reproducibility.txt
packaging/scripts/build-release.sh /tmp/kriyan-node-SHA.tar.gz \
  /tmp/kriyan-build-1/kriyan-node-linux-x64 \
  /tmp/kriyan-build-1/kriyan-linux-x64 SHA \
  /tmp/kriyan-build-1/provenance.manifest
```

The release builder uses Bun's compatibility target `bun-linux-x64-baseline` for
both Linux executables and `bun-darwin-arm64` for the operator CLI. All three
are standalone executables with dotenv, bunfig, tsconfig, and package metadata
autoload disabled. The VPS does not need Bun or Node installed.

For a convenience build from one exact Git checkpoint:

```sh
bun run build:standalone
file dist/kriyan-node-linux-x64 dist/kriyan-linux-x64 dist/kriyan-darwin-arm64
packaging/scripts/verify-operator-build.sh \
  dist/kriyan-darwin-arm64 SHA dist/operator-provenance.manifest
```

The convenience build retains `provenance.manifest` and
`operator-provenance.manifest` beside the binaries so the exact-SHA verification
commands remain independently executable after the isolated build directory is
removed.

## Operator CLI

The macOS operator uses system `ssh` and `scp`; it never accepts cloud-provider
tokens or Convex deploy keys. A strict known-hosts file is required for remote
operations. `--host-key-policy accept-new` is an explicit opt-in for a newly
created host; `StrictHostKeyChecking=no` is never used.

```sh
dist/kriyan-darwin-arm64 vps install \
  --host 203.0.113.10 --user ubuntu --port 22 \
  --identity ~/.ssh/id_ed25519 --known-hosts ~/.ssh/known_hosts \
  --host-key-policy strict \
  --release /tmp/kriyan-release.tar.gz \
  --checksum /tmp/kriyan-release.tar.gz.sha256 \
  --version SOURCE_COMMIT --config /tmp/node.json

dist/kriyan-darwin-arm64 vps status \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts
dist/kriyan-darwin-arm64 vps doctor \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts
dist/kriyan-darwin-arm64 vps update \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts \
  --release /tmp/kriyan-release.tar.gz \
  --checksum /tmp/kriyan-release.tar.gz.sha256 --version SOURCE_COMMIT
dist/kriyan-darwin-arm64 vps rollback \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts \
  --version PREVIOUS_SOURCE_COMMIT
dist/kriyan-darwin-arm64 vps restart \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts
dist/kriyan-darwin-arm64 vps uninstall \
  --host 203.0.113.10 --user ubuntu --known-hosts ~/.ssh/known_hosts \
  --preserve-data
```

Help is the explicit plaintext exception. Every operational command writes one
JSON object. Usage/config errors exit `2`, transfer or service failures exit `1`,
and healthy success exits `0`. Install and update verify the archive checksum
and bind `--version` to the exact commit identity embedded in the separately
obtained operator. That identity includes the commit, tree, commit epoch,
lockfile hash, and Bun policy from the trusted build. The operator transfers the
archive, its SHA-256, and the independently derived identity over authenticated
SSH. The host checks the SHA-256 before extracting and passes the transferred
identity to the archive verifier inside the lifecycle transaction. The
bootstrap files from the archive are therefore never their own trust root: the
trusted operator approves the exact bytes first, and SSH plus SHA-256 binds
those same bytes to the host. Temporary transfer material is removed on success
and failure.

The Linux executable owns the same lifecycle with `vps <action> --local`.
Local maintenance requires root and rejects all SSH-only flags. Installed
`node.json` files must keep `dataDir` at or below `/var/lib/kriyan`, matching the
systemd writable-state confinement; ordinary developer configs remain flexible.
`vps uninstall` always requires exactly one of
`--preserve-data` or `--purge-data`; preserve mode never removes
`/var/lib/kriyan`.

Direct local release verification outside a Git checkout is accepted only when
the executing CLI was obtained separately and embeds the requested trusted
identity. A source-mode CLI instead derives all identity fields from the
requested commit in its trusted local repository. If neither source is
available, verification fails closed. `KRIYAN_TRUSTED_IDENTITY_FILE` is an
internal lifecycle handoff; ambient values cannot replace a compiled
operator's wrapper-owned mode-`0600` identity.

The CLI above is the normal install path. For low-level recovery, place the
verified release archive in `/tmp`, then:

```sh
sudo KRIYAN_VERSION=SHA \
  KRIYAN_TRUSTED_IDENTITY_FILE=/secure/operator-derived-identity.manifest \
  packaging/scripts/install-transaction.sh /tmp/kriyan-node-SHA.tar.gz node.json
sudo systemctl status kriyan-node --no-pager
sudo journalctl -u kriyan-node --since '10 minutes ago' --no-pager
sudo -u kriyan /opt/kriyan/current/bin/kriyan doctor --config /etc/kriyan/node.json
```

`node.json` contains identifiers, explicit IANA `timezone` and BCP 47 `locale`, and the Convex development URL, never provider credentials. Pi credentials remain in the service user's local Pi auth store. Do not copy `.env.local`, transcripts, or raw workspaces into a release.

## Update, rollback, health, and recovery

`update.sh` and `rollback.sh` transactionally switch `/opt/kriyan/current`, the
release environment, and the versioned systemd unit. Any daemon-reload,
restart, active-state, or health failure restores the complete prior state,
reloads systemd, restarts it, and requires the prior release to become healthy.
Health requires a heartbeat newer than the restart boundary from a different
process instance running the provenance-derived release identity, followed by a
stability window; an old fresh heartbeat cannot pass. `backup.sh` creates and
validates a private archive; `restore.sh` applies the same traversal, duplicate,
link, and file-type safety checks as install before restoring into a
caller-selected empty temporary directory.

The isolated builder writes `git archive` to a file before extracting it, avoiding the macOS `pipefail`/SIGPIPE exit-141 path. It installs from the exact commit's `bun.lock`, normalizes logical and physical aliases for the repository, source, build, output, `TMPDIR`, and `HOME`, and compiles regular stable-basename bundle files rather than `/dev/stdin`. Both Linux x64 ELFs are scanned for macOS `/var`/`/private/var` and `/tmp`/`/private/tmp` aliases, private user/home/worktree paths, builder literals, and known secret environment values.

`build-release.sh` accepts only executable Linux x64 ELFs whose hashes, commit, tree, lockfile, epoch, target, and Bun version match the strict provenance manifest. The finished archive is extracted and both packaged ELFs are identified, hashed, and scanned again. Release archives are sorted PAX-free ustar with root `0/0` ownership, normalized `0644`/`0755` modes, every mtime set to the commit `SOURCE_DATE_EPOCH`, and a `gzip -n` header. Two archives made from the same fixed ELF inputs and manifest must be byte-identical. Always compare two independent Bun builds and report their generated verdict honestly; Bun 1.3.14 ELF byte equality is measured but is not a release acceptance gate.

After a host reboot, prove `systemctl is-enabled`, `systemctl is-active`, `kriyan doctor`, a submitted reminder command, and one completed run. A DigitalOcean API connection alone is not SSH authority or service proof.
