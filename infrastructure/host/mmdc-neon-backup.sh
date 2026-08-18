#!/usr/bin/env bash
set -Eeuo pipefail

# Host wrapper for the approved logical-backup boundary.  It accepts only the
# direct Neon URL and never prints that URL or any credential-bearing error.

fail() {
  printf 'mmdc Neon backup: %s\n' "$*" >&2
  exit 1
}

direct_url="${DATABASE_DIRECT_URL:-}"
output_path="${NEON_BACKUP_OUTPUT:-}"
[[ -n "$direct_url" ]] || fail 'DATABASE_DIRECT_URL is required'
[[ "$direct_url" == *'sslmode=require'* ]] || fail 'DATABASE_DIRECT_URL must require TLS'
[[ -z "${DATABASE_URL:-}" || "$DATABASE_URL" != "$direct_url" ]] || fail 'pooled DATABASE_URL cannot be used for backup'
[[ "$output_path" == /* ]] || fail 'NEON_BACKUP_OUTPUT must be an absolute path'
command -v pg_dump >/dev/null 2>&1 || fail 'pg_dump is unavailable; install postgresql-client'

umask 077
pg_dump --format=custom --file="$output_path" "$direct_url"
printf 'mmdc Neon logical backup written to %s\n' "$output_path"
