# Synthetic search recovery

Meilisearch is disposable derived state. Neon/PostgreSQL remains canonical for
the synthetic `foundation-search-records` collection. The projection contains
only `id`, `canonicalVersion`, and `value`; it does not define Article fields or
ranking behavior.

## Index versions and swap

The approved live index is `<MEILISEARCH_INDEX_PREFIX>-foundation`. An operator
rebuild creates a disposable versioned index named with the `__v<timestamp>`
suffix, loads it from Neon, validates its complete document set, and atomically
swaps it with the approved live index. The previous contents remain under the
versioned name until cleanup. A failed validation or swap leaves the approved
index untouched.

Inspect the current index versions with the protected admin/indexing key:

```bash
curl -fsS -H "X-Meili-API-Key: $MEILISEARCH_ADMIN_INDEXING_KEY" \
  "$MEILISEARCH_URL/indexes"
```

## Rebuild after deletion or empty state

After checking the canonical database target, run:

```bash
pnpm run migrate:apply
pnpm run search:rebuild
```

The command reads Neon/PostgreSQL and never writes canonical records. Repeat it
after a failed or interrupted attempt; the candidate is disposable and the
bounded worker retries projection jobs. Do not delete or edit PostgreSQL rows
as part of search recovery.

## Unavailability

The server-owned `/api/search?q=...` route returns HTTP `503` with the sanitized
state `{ "status": "degraded", "code": "SEARCH_UNAVAILABLE", "results": [] }`
when Meilisearch cannot be reached. It emits the structured
`search.unavailable` failure signal without returning keys, URLs, exception
details, or a browser-owned error contract.
