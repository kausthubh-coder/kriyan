# Worker facade trust boundary

The `worker:*` mutations are public Convex functions so a standalone Bun
`ConvexClient` can call them. They are separate from browser-facing command,
read, and projection modules, but this first self-hosted core intentionally has
no central authentication or security-token protocol.

An installation ID, node ID, capability string, revision, or lease is not a
secret and must not be described as one. Operational worker mutations validate:

- the installation exists;
- the node is registered, online, not revoked, and has the `reminders`
  capability;
- the supplied cooperative timestamp is within the 60-second heartbeat window;
- the node owns an unexpired lease for the exact installation/job/run; and
- expected revisions and ordered event sequences still match.

These checks protect state-machine integrity and catch stale/cooperating worker
processes. They do not defend a public deployment URL against a malicious
caller. Until real enrollment/authentication is designed, operators must keep
the Convex deployment and worker process inside their local/self-hosted trust
boundary and avoid sharing the deployment URL. Do not add a hard-coded or
cosmetic bearer token and call it secure.

Explicit limits: heartbeats expire after 60 seconds; leases are at most 30
seconds; list pages are at most 100 records; claims examine at most 64 queued,
64 leased, and 64 running candidates; an event batch contains 1-32 events, each
payload is at most 16,384 characters, and aggregate payload is at most 65,536
characters. Development seed/reset functions are internal Convex mutations and
are absent from the public client API.
