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

Place the verified release archive in `/tmp`, then:

```sh
sudo KRIYAN_VERSION=SHA packaging/scripts/install.sh /tmp/kriyan-node-SHA.tar.gz
sudo install -o root -g kriyan -m 0640 node.json /etc/kriyan/node.json
sudo systemctl enable --now kriyan-node
sudo systemctl status kriyan-node --no-pager
sudo journalctl -u kriyan-node --since '10 minutes ago' --no-pager
sudo -u kriyan /opt/kriyan/current/bin/kriyan doctor --config /etc/kriyan/node.json
```

`node.json` contains identifiers, explicit IANA `timezone` and BCP 47 `locale`, and the Convex development URL, never provider credentials. Pi credentials remain in the service user's local Pi auth store. Do not copy `.env.local`, transcripts, or raw workspaces into a release.

## Update, rollback, health, and recovery

`update.sh` atomically switches `/opt/kriyan/current` and restores the previous symlink if restart/health fails. Health requires a heartbeat newer than the restart boundary from a different process instance running the expected release, followed by a stability window; an old fresh heartbeat cannot pass. `rollback.sh VERSION` applies the same identity gate to an already installed release. `backup.sh` creates and validates a private archive; `restore.sh` applies the same traversal, duplicate, link, and file-type safety checks as install before restoring into a caller-selected empty temporary directory.

The isolated builder writes `git archive` to a file before extracting it, avoiding the macOS `pipefail`/SIGPIPE exit-141 path. It installs from the exact commit's `bun.lock`, normalizes logical and physical aliases for the repository, source, build, output, `TMPDIR`, and `HOME`, and compiles regular stable-basename bundle files rather than `/dev/stdin`. Both Linux x64 ELFs are scanned for macOS `/var`/`/private/var` and `/tmp`/`/private/tmp` aliases, private user/home/worktree paths, builder literals, and known secret environment values.

`build-release.sh` accepts only executable Linux x64 ELFs whose hashes, commit, tree, lockfile, epoch, target, and Bun version match the strict provenance manifest. The finished archive is extracted and both packaged ELFs are identified, hashed, and scanned again. Release archives are sorted PAX-free ustar with root `0/0` ownership, normalized `0644`/`0755` modes, every mtime set to the commit `SOURCE_DATE_EPOCH`, and a `gzip -n` header. Two archives made from the same fixed ELF inputs and manifest must be byte-identical. Always compare two independent Bun builds and report their generated verdict honestly; Bun 1.3.14 ELF byte equality is measured but is not a release acceptance gate.

After a host reboot, prove `systemctl is-enabled`, `systemctl is-active`, `kriyan doctor`, a submitted reminder command, and one completed run. A DigitalOcean API connection alone is not SSH authority or service proof.
