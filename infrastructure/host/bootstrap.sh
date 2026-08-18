#!/usr/bin/env bash
set -Eeuo pipefail

# MMDC development-host bootstrap.  The script is deliberately independent of
# application source: the host runs the reviewed OCI image supplied through
# deployment state and never compiles the working tree.

readonly BOOTSTRAP_VERSION='F08-T02-bootstrap-v1'
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_ROOT="${MMDC_BOOTSTRAP_SOURCE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
readonly DEST_ROOT="${MMDC_BOOTSTRAP_ROOT:-/}"
readonly TEST_MODE="${MMDC_BOOTSTRAP_TEST:-0}"

die() {
  printf 'mmdc host bootstrap: %s\n' "$*" >&2
  exit 1
}

dest() {
  local relative="$1"
  if [[ "$DEST_ROOT" == '/' ]]; then
    printf '/%s' "$relative"
  else
    printf '%s/%s' "${DEST_ROOT%/}" "$relative"
  fi
}

require_file() {
  [[ -f "$1" ]] || die "required version-controlled file is missing: $1"
}

if [[ "$TEST_MODE" != '1' && "$(id -u)" != '0' ]]; then
  die 'must run as root on a host; use MMDC_BOOTSTRAP_TEST=1 only for an isolated disposable test root'
fi

for required in \
  "$SOURCE_ROOT/infrastructure/compose/shared.yml" \
  "$SOURCE_ROOT/infrastructure/compose/production.yml" \
  "$SOURCE_ROOT/infrastructure/compose/Caddyfile" \
  "$SOURCE_ROOT/infrastructure/host/mmdc-pull-agent.sh" \
  "$SOURCE_ROOT/infrastructure/host/mmdc-neon-backup.sh"; do
  require_file "$required"
done

grep -qE '^[[:space:]]*caddy:' "$SOURCE_ROOT/infrastructure/compose/production.yml" ||
  die 'reviewed production Compose definition has no Caddy service'
grep -q 'Caddyfile' "$SOURCE_ROOT/infrastructure/compose/production.yml" ||
  die 'reviewed production Compose definition does not mount the Caddy configuration'

if [[ "$SOURCE_ROOT" == "$DEST_ROOT" ]]; then
  die 'source and destination roots must be different'
fi

readonly ETC_MMDC="$(dest etc/mmdc)"
readonly COMPOSE_DIR="$ETC_MMDC/compose"
readonly SYSTEMD_DIR="$(dest etc/systemd/system)"
readonly LOGROTATE_DIR="$(dest etc/logrotate.d)"
readonly LIBEXEC_DIR="$(dest usr/local/libexec)"

install -d -m 0700 "$ETC_MMDC" "$ETC_MMDC/secrets"
install -d -m 0755 "$COMPOSE_DIR" "$SYSTEMD_DIR" "$LIBEXEC_DIR" "$LOGROTATE_DIR"

install_packages() {
  local -a packages=(
    ca-certificates
    curl
    gnupg
    jq
    logrotate
    postgresql-client
    docker-ce
    docker-ce-cli
    containerd.io
    docker-buildx-plugin
    docker-compose-plugin
  )

  # A production Ubuntu host receives Docker from the reviewed Docker
  # repository.  The isolated test mode supplies command shims and must never
  # contact a package mirror.
  if [[ "$TEST_MODE" == '1' ]]; then
    apt-get update
    apt-get install -y "${packages[@]}"
    return
  fi

  local keyring list_file os_id codename architecture
  keyring="$(dest etc/apt/keyrings/docker.asc)"
  list_file="$(dest etc/apt/sources.list.d/docker.list)"
  install -d -m 0755 "$(dest etc/apt/keyrings)" "$(dest etc/apt/sources.list.d)"
  if [[ ! -s "$keyring" ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$keyring"
    chmod 0644 "$keyring"
  fi
  if [[ ! -s "$list_file" ]]; then
    [[ -r /etc/os-release ]] || die 'Ubuntu release metadata is missing'
    # shellcheck disable=SC1091
    . /etc/os-release
    os_id="${ID:-}"
    codename="${VERSION_CODENAME:-}"
    [[ "$os_id" == 'ubuntu' && -n "$codename" ]] || die 'only Ubuntu with VERSION_CODENAME is supported'
    architecture="$(dpkg --print-architecture)"
    printf 'deb [arch=%s signed-by=%s] https://download.docker.com/linux/ubuntu %s stable\n' \
      "$architecture" "$keyring" "$codename" >"$list_file"
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
}

install_packages
command -v docker >/dev/null 2>&1 || die 'Docker Engine is not installed'
docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is not installed'

systemctl daemon-reload
systemctl enable --now docker

install -m 0644 "$SOURCE_ROOT/infrastructure/compose/shared.yml" "$COMPOSE_DIR/shared.yml"
install -m 0644 "$SOURCE_ROOT/infrastructure/compose/production.yml" "$COMPOSE_DIR/production.yml"
install -m 0644 "$SOURCE_ROOT/infrastructure/compose/Caddyfile" "$COMPOSE_DIR/Caddyfile"
install -m 0750 "$SOURCE_ROOT/infrastructure/host/mmdc-pull-agent.sh" "$LIBEXEC_DIR/mmdc-pull-agent"
install -m 0750 "$SOURCE_ROOT/infrastructure/host/mmdc-neon-backup.sh" "$LIBEXEC_DIR/mmdc-neon-backup"

# These files are deliberately populated by an approved secret-delivery step
# outside the repository.  The bootstrap creates the protected destinations,
# but never places a secret value in source, user data, output, or logs.
write_protected_file() {
  local destination="$1" source_file="$2"
  if [[ -n "$source_file" ]]; then
    [[ -f "$source_file" ]] || die "secret-delivery file is missing: $source_file"
    case "$source_file" in
      "$SOURCE_ROOT"/*) die 'secret-delivery files must not live under the version-controlled source root' ;;
    esac
    install -m 0600 "$source_file" "$destination"
  elif [[ ! -e "$destination" ]]; then
    install -m 0600 /dev/null "$destination"
  else
    chmod 0600 "$destination"
  fi
}

write_protected_file "$ETC_MMDC/runtime.env" "${MMDC_RUNTIME_ENV_SOURCE:-}"
write_protected_file "$ETC_MMDC/pull.env" "${MMDC_PULL_ENV_SOURCE:-}"
write_protected_file "$ETC_MMDC/backup.env" "${MMDC_BACKUP_ENV_SOURCE:-}"

cat >"$ETC_MMDC/pull-agent.env" <<'EOF'
# Non-secret bootstrap defaults. Secret delivery is external to this file.
MMDC_PULL_AGENT_MODE=readiness-only
MMDC_DEPLOYMENT_STATE_OBJECT=desired.json
MMDC_COMPOSE_DIR=/etc/mmdc/compose
MMDC_RUNTIME_ENV_FILE=/etc/mmdc/runtime.env
EOF
chmod 0600 "$ETC_MMDC/pull-agent.env"

cat >"$SYSTEMD_DIR/mmdc-pull-agent.service" <<'EOF'
[Unit]
Description=MMDC pull deployment agent bootstrap readiness
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=root
Group=root
EnvironmentFile=-/etc/mmdc/pull-agent.env
ExecStart=/usr/local/libexec/mmdc-pull-agent --check
RemainAfterExit=yes
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/mmdc

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SYSTEMD_DIR/mmdc-pull-agent.service"

# This writes /etc/logrotate.d/mmdc on a real host.
cat >"$LOGROTATE_DIR/mmdc" <<'EOF'
/var/log/mmdc/*.log {
  daily
  rotate 14
  missingok
  notifempty
  compress
  delaycompress
  create 0640 root adm
}
EOF
chmod 0644 "$LOGROTATE_DIR/mmdc"
install -d -m 0750 "$(dest var/log/mmdc)"

systemctl daemon-reload
systemctl enable mmdc-pull-agent.service
systemctl start mmdc-pull-agent.service

printf 'mmdc host bootstrap %s complete; runtime secrets remain external and no application source was built\n' "$BOOTSTRAP_VERSION"
