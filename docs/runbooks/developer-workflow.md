# Developer workflow contract

## Supported workstation

The supported local workstation is macOS or Linux with:

- Node.js `24.15.0` and pnpm `11.20.0`, activated through Corepack;
- Docker Desktop or Docker Engine with Docker Compose v2 for the default local
  PostgreSQL 17 compatibility service and Meilisearch;
- `curl` for the health command;
- the platform SQLite CLI (`sqlite3`) when using the optional SQLite smoke mode; and
- network access to the package registry for the first frozen installation.

AWS credentials are not needed for ordinary local frontend, Payload, seed, or
reset work. Local media is stored under `media/`, and synthetic data is the
only data available to the local seed command.

## Setup and lifecycle

From a clean checkout, run:

```bash
pnpm run setup
pnpm run start
pnpm run health
pnpm run seed
pnpm run reset
pnpm run stop
```

Setup creates `.env.local` from `.env.example` only when the file is absent,
preserves an existing file, installs with `pnpm install --frozen-lockfile`,
and regenerates Payload types. It does not print environment values. Start
runs Next.js/Payload on the host and local dependency services through the
loopback-only Compose configuration. Health waits for `/api/health` and
requires the sanitized `{"status":"ok"}` response. Stop is idempotent and
retains local dependency volumes.

`pnpm run seed` and `pnpm run reset` display the resolved local target and use
the required confirmation in `.env.local`. They remain subject to the target
guards in [`local-development.md`](local-development.md) and the protected
environment guards in [`neon-operations.md`](neon-operations.md).

## Database choices and credentials

The default is the loopback PostgreSQL 17 compatibility service:

```text
MMDC_DATABASE_MODE=postgres
DATABASE_URL=postgresql://mmdc@127.0.0.1:5432/mmdc_local
DATABASE_DIRECT_URL=postgresql://mmdc@127.0.0.1:5432/mmdc_local
```

For a local-only smoke test without Docker, an isolated SQLite compatibility
file may be selected explicitly. This does not change the shared-environment
database contract:

```bash
MMDC_COMPATIBILITY_DATABASE="file:$PWD/.mmdc/compatibility.sqlite" \
MMDC_SKIP_LOCAL_SERVICES=1 \
pnpm run start
```

An isolated Neon developer branch is an alternative to local PostgreSQL. Set
`MMDC_DATABASE_MODE=neon`, provide a `MMDC_NEON_BRANCH` beginning with
`local-`, and supply both credentials out of band: `DATABASE_URL` is the
TLS-required pooled runtime URL and `DATABASE_DIRECT_URL` is the distinct
TLS-required direct administrative URL. Never commit either credential, put
them in a fixture, or use a development, staging, production, `main`, `root`,
or shared target. The local guard visibly identifies the selected target before
seed or reset.

## Migration, worker, search, and container commands

Use these exact package commands:

```bash
pnpm run generate:types
pnpm run migrate:create
pnpm run migrate:apply
pnpm run worker
pnpm run search:rebuild
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run container:smoke
```

The worker and synthetic search runtime belong to F04; the production Dockerfile
and container smoke target belong to F06. Search rebuild reads canonical Neon
records and atomically swaps a validated versioned index. See
[`search-recovery.md`](search-recovery.md) for index version inspection,
rebuild, and unavailability recovery.

## Missing prerequisites and secret safety

Missing Node/pnpm versions, Docker, dependencies, `.env.local`, a local target,
or a production container artifact cause a nonzero result with a next action.
Errors identify names and remediation only; they do not echo passwords,
connection strings, tokens, approval values, or complete environment contents.

## Measured timings

The following timings were measured on the supported workstation profile above
with a warm pnpm store and the explicit SQLite compatibility smoke mode. They
are a local planning baseline, not a performance guarantee; rerun the commands
when the workstation, lockfile, or dependency cache changes.

| Command                      | Measured elapsed time |
| ---------------------------- | --------------------: |
| `pnpm run setup` (first run) |          13.3 seconds |
| `pnpm run setup` (repeat)    |           3.8 seconds |
| `pnpm run reset`             |           4.8 seconds |

The acceptance harness measures the same operations during every validation run
and prints the observed milliseconds. These values are rounded to one decimal
place from the 2026-08-17 acceptance run; the harness remains the authoritative
repeatability check.
