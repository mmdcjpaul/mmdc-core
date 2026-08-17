#!/usr/bin/env bash
set -uo pipefail
export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
server_pid=""
fixture_root=""

fail() {
  printf 'F01-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if [ -n "$fixture_root" ]; then
    rm -rf "$fixture_root"
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

expect_failure() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "$description was accepted, but should be rejected"
  fi
}

require_command node
require_command pnpm
require_command curl

# R02/R04: the live runtime and package policy are exact, and their failure
# paths are tested against isolated temporary manifests.
if ! pnpm run check:runtime; then
  fail 'the pinned Node.js/pnpm runtime check failed'
fi
if ! pnpm run check:policy; then
  fail 'the scaffold package and path policy check failed'
fi

if npm_config_user_agent='npm/10.0.0 node/v24.15.0 darwin arm64 workspaces/false' \
  node scripts/check-runtime.mjs --package-manager >/dev/null 2>&1; then
  fail 'runtime policy did not reject npm as the package manager'
fi
if ! rg -Fq "process.versions.node" scripts/check-runtime.mjs \
  || ! rg -Fq "expectedNode = '24.15.0'" scripts/check-runtime.mjs; then
  fail 'runtime policy does not compare the detected Node version with 24.15.0'
fi

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f01-t01.XXXXXX")"
mkdir -p "$fixture_root/src/app/(frontend)" "$fixture_root/src/app/(payload)"
cp package.json pnpm-lock.yaml .nvmrc .node-version next.config.mjs tsconfig.json \
  postcss.config.mjs tailwind.config.ts eslint.config.mjs "$fixture_root/"
cp src/app/'(frontend)'/page.tsx "$fixture_root/src/app/(frontend)/page.tsx"
: > "$fixture_root/src/app/(payload)/.gitkeep"

mutate_manifest() {
  local field="$1" value="$2"
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const field = process.argv[2];
    const value = process.argv[3];
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    if (field.includes(".")) {
      const [section, name] = field.split(".");
      manifest[section][name] = value;
    } else {
      manifest[field] = value;
    }
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  ' "$fixture_root/package.json" "$field" "$value"
}

mutate_manifest 'dependencies.react' '19.2.7'
expect_failure 'changed React pin' node scripts/check-scaffold-policy.mjs --root "$fixture_root"
cp package.json "$fixture_root/package.json"

mutate_manifest 'dependencies.next' '^16.3.1'
expect_failure 'Next version range' node scripts/check-scaffold-policy.mjs --root "$fixture_root"
cp package.json "$fixture_root/package.json"

mutate_manifest packageManager 'npm@10.0.0'
expect_failure 'wrong package manager' node scripts/check-scaffold-policy.mjs --root "$fixture_root"
cp package.json "$fixture_root/package.json"

mkdir -p "$fixture_root/pages"
: > "$fixture_root/pages/index.tsx"
expect_failure 'Pages Router file' node scripts/check-scaffold-policy.mjs --root "$fixture_root"
rm -rf "$fixture_root/pages"

# R03 and the lockfile acceptance criterion: a frozen install must succeed and
# neither declarative input may be rewritten by it.
before_manifest="$(sha256sum package.json)"
before_lockfile="$(sha256sum pnpm-lock.yaml)"
if ! pnpm install --frozen-lockfile; then
  fail 'frozen installation failed'
fi
after_manifest="$(sha256sum package.json)"
after_lockfile="$(sha256sum pnpm-lock.yaml)"
[ "$before_manifest" = "$after_manifest" ] || fail 'frozen install changed package.json'
[ "$before_lockfile" = "$after_lockfile" ] || fail 'frozen install changed pnpm-lock.yaml'

# R01 and the available quality checks: prove the configured toolchain can
# lint, typecheck, and produce the standalone production build.
if ! pnpm run lint; then
  fail 'lint failed'
fi
if ! pnpm run typecheck; then
  fail 'typecheck failed'
fi
if ! pnpm run build; then
  fail 'production build failed'
fi

# R01 and the frontend acceptance criterion: start the built App Router
# application and assert the rendered response contains the shell content.
server_log="$(mktemp "${TMPDIR:-/tmp}/mmdc-f01-t01-server.XXXXXX")"
pnpm start >"$server_log" 2>&1 &
server_pid=$!
ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/ >"${server_log}.html" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  fail 'frontend server did not become ready'
elif ! rg -Fq 'Website foundation' "${server_log}.html" || ! rg -Fq 'MMDC' "${server_log}.html"; then
  fail 'frontend smoke response does not contain the minimal App Router shell'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F01-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F01-T01 acceptance: exact-version scaffold, frozen install, checks, build, and frontend smoke passed\n'
