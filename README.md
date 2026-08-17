# mmdc-core

The implementation program starts in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and is decomposed into EARS tickets in [`docs/specs/tracker.md`](docs/specs/tracker.md).

```bash
./validation.sh --specs
MAX_TICKETS=1 ./loop.sh <codex-model> <reasoning-effort>
```

See [`LOOP.md`](LOOP.md) for the autonomous loop contract and safeguards.

## Developer command contract

Use the commands below from the repository root. `pnpm run setup` is safe to
repeat: it preserves an existing `.env.local`, uses the frozen lockfile, and
regenerates the committed Payload types. `pnpm run start` starts the host
development server when no production build exists; after `pnpm run build` it
starts the production server. `pnpm run health` checks the local health route,
and `pnpm run stop` is safe to repeat.

```bash
pnpm run setup
pnpm run start
pnpm run health
pnpm run seed
pnpm run reset
pnpm run stop
```

The complete command contract is:

| Purpose               | Command                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| Setup                 | `pnpm run setup`                                                         |
| Start / health / stop | `pnpm run start` / `pnpm run health` / `pnpm run stop`                   |
| Synthetic data        | `pnpm run seed` / `pnpm run reset`                                       |
| Payload types         | `pnpm run generate:types`                                                |
| Migrations            | `pnpm run migrate:create` / `pnpm run migrate:apply`                     |
| Worker                | `pnpm run worker`                                                        |
| Search rebuild        | `pnpm run search:rebuild`                                                |
| Tests and quality     | `pnpm run test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` |
| Container smoke       | `pnpm run container:smoke`                                               |

`worker`, `search:rebuild`, and `container:smoke` are stable entry points. They
report the owning prerequisite when F04/F06 has not supplied its runtime; no
placeholder worker, search index, or container evidence is claimed by F03-T02.

See [`docs/runbooks/developer-workflow.md`](docs/runbooks/developer-workflow.md)
for workstation prerequisites, local PostgreSQL and isolated Neon choices,
failure handling, and measured setup/reset timings.

## Quality commands

Use the pinned Node.js `24.15.0` and pnpm `11.20.0` runtime for all commands:

```bash
pnpm run format        # format repository files
pnpm run format:check  # verify formatting without changing files
pnpm run check:dependencies
pnpm run lint
pnpm run generate:types
pnpm run test
pnpm run typecheck
pnpm run build
```

`generate:types` loads the Payload configuration in build-safe mode. The production
build also completes without database credentials; database and secret validation
is reserved for runtime. Set `NEXT_PUBLIC_SITE_URL` only for browser-visible URL
configuration. `PAYLOAD_SECRET`, `DATABASE_URL`, `DATABASE_DIRECT_URL`, and
`INTERNAL_API_URL` are server-only values and must never be prefixed with
`NEXT_PUBLIC_`.
