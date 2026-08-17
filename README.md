# mmdc-core

The implementation program starts in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and is decomposed into EARS tickets in [`docs/specs/tracker.md`](docs/specs/tracker.md).

```bash
./validation.sh --specs
MAX_TICKETS=1 ./loop.sh <codex-model> <reasoning-effort>
```

See [`LOOP.md`](LOOP.md) for the autonomous loop contract and safeguards.

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
