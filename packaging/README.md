# Kriyan node deployment

Round 1 runs the source release with an installed Bun runtime on Ubuntu 24.04 x64. It does not claim a universal standalone binary. The service runs as the unprivileged `kriyan` user, keeps config in `/etc/kriyan/node.json` (`0600`, owned by `root:kriyan`) and private state in `/var/lib/kriyan`.

## Build and stage

```sh
bun install --frozen-lockfile
bun run typecheck:node
bun run test:node
packaging/scripts/build-release.sh /tmp/kriyan-node-SHA.tar.gz
```

On the VPS, install Bun from its official installer as root into a version-pinned shared path, place the release archive in `/tmp`, then:

```sh
sudo KRIYAN_VERSION=SHA packaging/scripts/install.sh /tmp/kriyan-node-SHA.tar.gz
sudo install -o root -g kriyan -m 0640 node.json /etc/kriyan/node.json
sudo systemctl enable --now kriyan-node
sudo systemctl status kriyan-node --no-pager
sudo journalctl -u kriyan-node --since '10 minutes ago' --no-pager
sudo -u kriyan /usr/local/bin/bun /opt/kriyan/current/apps/cli/src/main.ts doctor --config /etc/kriyan/node.json
```

`node.json` contains identifiers and the Convex development URL, never provider credentials. Pi credentials remain in the service user's local Pi auth store. Do not copy `.env.local`, transcripts, or raw workspaces into a release.

## Update, rollback, health, and recovery

`update.sh` atomically switches `/opt/kriyan/current` and restores the previous symlink if restart/health fails. `rollback.sh VERSION` selects an already installed release. `backup.sh` creates and validates a private archive; `restore.sh` intentionally restores into a caller-selected temporary directory for inspection before any live replacement.

After a host reboot, prove `systemctl is-enabled`, `systemctl is-active`, `kriyan doctor`, a submitted reminder command, and one completed run. A DigitalOcean API connection alone is not SSH authority or service proof.
