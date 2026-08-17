# Local development services

Next.js and Payload run on the host so that `next dev` keeps fast refresh. The
Compose file provides only the local Meilisearch service and, when selected,
the PostgreSQL 17 compatibility service:

```bash
cp .env.example .env.local
node scripts/local-services.mjs validate
node scripts/local-services.mjs up
```

The default database mode is `postgres`. It targets the loopback-only Compose
service at `mmdc_local`. Set `MMDC_DATABASE_MODE=neon` only for an isolated
Neon branch whose `MMDC_NEON_BRANCH` starts with `local-`; the pooled and direct
URLs must be supplied explicitly. Shared development, staging, production,
root, main, and similarly named targets are refused by the local guard.

Before `pnpm run seed` or `pnpm run reset`, the application prints the resolved
target and requires the matching confirmation value:

```text
MMDC_DATABASE_TARGET_CONFIRMATION=local:postgres:local-postgres-compatibility
```

This is an acknowledgement of the displayed target, not a credential. It is
not committed to an environment file with a shared target.

Ports bind to `127.0.0.1` by default. A deliberate non-loopback override must
use the wrapper and the documented confirmation:

```bash
MMDC_LOCAL_SERVICE_BIND_ADDRESS=0.0.0.0 \
MMDC_NON_LOOPBACK_CONFIRMATION=I_UNDERSTAND_NON_LOOPBACK_LOCAL_SERVICES \
node scripts/local-services.mjs config
```

Local media uses the repository `media/` directory and synthetic fixtures. No
AWS credentials, S3 bucket, or shared-environment data is needed for this mode.
Stop services with `node scripts/local-services.mjs down`.
