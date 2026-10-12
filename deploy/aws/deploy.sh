#!/usr/bin/env bash
# Safely checks or deploys only the FretFlow backend on a shared EC2 host.
#   deploy/aws/deploy.sh check      # validation only; changes nothing
#   deploy/aws/deploy.sh backend    # build api, back up local DB, start db/api
#   deploy/aws/deploy.sh            # same as "backend"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${FRETFLOW_ENV_FILE:-$SCRIPT_DIR/.env}"
ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/docker-compose.yml")
MODE="${1:-backend}"

usage() {
  echo "Usage: deploy/aws/deploy.sh [check|backend]" >&2
}

if (( $# > 1 )); then
  usage
  exit 2
fi
case "$MODE" in
  check|backend) ;;
  *) usage; exit 2 ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  echo "cd deploy/aws && cp .env.example .env && chmod 600 .env, then fill in the values." >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read $ENV_FILE. Run as its owner, not with sudo." >&2
  exit 1
fi
env_mode="$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %Lp "$ENV_FILE")"
if [[ "$env_mode" != "600" ]]; then
  echo "Refusing to continue: $ENV_FILE must be mode 600 (chmod 600 $ENV_FILE)." >&2
  exit 1
fi

# Reads KEY=value without executing the file or echoing secrets.
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }

required=(
  NODE_ENV PORT DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL WEB_ORIGIN
  CLIENT_IP_HEADER EMAIL_FROM EMAIL_PROVIDER_API_KEY S3_ENDPOINT S3_REGION
  S3_BUCKET S3_UPLOAD_CHECKSUM S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY
)
missing=()
for key in "${required[@]}"; do
  [[ -n "$(env_value "$key")" ]] || missing+=("$key")
done

profiles="$(env_value COMPOSE_PROFILES)"
if [[ ",$profiles," == *,db,* ]]; then
  for key in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD; do
    [[ -n "$(env_value "$key")" ]] || missing+=("$key")
  done
fi
if (( ${#missing[@]} > 0 )); then
  echo "Refusing to continue: empty values in $ENV_FILE: ${missing[*]}" >&2
  exit 1
fi

if [[ "$(env_value NODE_ENV)" != production ]]; then
  echo "Refusing to continue: NODE_ENV must be production." >&2
  exit 1
fi
if [[ "$(env_value PORT)" != 3000 ]]; then
  echo "Refusing to continue: container PORT must remain 3000." >&2
  exit 1
fi
if [[ ",$profiles," == *,frontend,* ]]; then
  echo "Refusing to continue: deploy.sh is backend-only; remove frontend from COMPOSE_PROFILES." >&2
  exit 1
fi

database_url="$(env_value DATABASE_URL)"
if [[ "$database_url" == *"@localhost"* || "$database_url" == *"@127.0.0.1"* ]]; then
  echo "Refusing to continue: DATABASE_URL cannot use localhost inside the API container." >&2
  exit 1
fi
if [[ ",$profiles," == *,db,* && ! "$database_url" =~ ^postgres(ql)?://.+@db(:[0-9]+)?/ ]]; then
  echo "Refusing to continue: with COMPOSE_PROFILES=db, DATABASE_URL must use host 'db'." >&2
  exit 1
fi
for key in BETTER_AUTH_URL WEB_ORIGIN; do
  value="$(env_value "$key")"
  if [[ "$value" == *localhost* || "$value" == *127.0.0.1* ]]; then
    echo "Refusing to continue: $key cannot use a local-development origin." >&2
    exit 1
  fi
done
if [[ "$(env_value S3_ENDPOINT)" == *YOUR_CLOUDFLARE_ACCOUNT_ID* ]]; then
  echo "Refusing to continue: replace YOUR_CLOUDFLARE_ACCOUNT_ID in S3_ENDPOINT." >&2
  exit 1
fi
if [[ "$(env_value S3_UPLOAD_CHECKSUM)" != none ]]; then
  echo "Refusing to continue: Cloudflare R2 requires S3_UPLOAD_CHECKSUM=none." >&2
  exit 1
fi
google_client_id="$(env_value GOOGLE_CLIENT_ID)"
google_client_secret="$(env_value GOOGLE_CLIENT_SECRET)"
if [[ -n "$google_client_id" && -z "$google_client_secret" ]] || \
   [[ -z "$google_client_id" && -n "$google_client_secret" ]]; then
  echo "Refusing to continue: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together." >&2
  exit 1
fi

# Only the API loopback port is relevant to a backend-only deployment. The
# container's 3000 and PostgreSQL's 5432 are not published on the host.
api_port="$(env_value FRETFLOW_API_HOST_PORT)"
api_port="${api_port:-3100}"
reserved_ports=(22 80 443 5432 8000 8081)
if [[ ! "$api_port" =~ ^[1-9][0-9]*$ ]] || (( api_port < 1024 || api_port > 65535 )); then
  echo "Refusing to continue: FRETFLOW_API_HOST_PORT must be 1024-65535 (got '$api_port')." >&2
  exit 1
fi
for reserved in "${reserved_ports[@]}"; do
  if (( api_port == reserved )); then
    echo "Refusing to continue: FRETFLOW_API_HOST_PORT=$api_port conflicts with a reserved host port." >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required." >&2
  exit 1
fi

export FRETFLOW_ENV_FILE="$ENV_FILE"
export FRETFLOW_API_HOST_PORT="$api_port"
export FRETFLOW_IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo latest)"
"${COMPOSE[@]}" config --quiet

# A plain Compose up must not activate the future frontend service.
if "${COMPOSE[@]}" config --services | grep -qx web; then
  echo "Refusing to continue: frontend service is active in the backend Compose profile." >&2
  exit 1
fi

if [[ "$MODE" == check ]]; then
  echo "Backend deployment check passed. No containers or data were changed."
  echo "API host binding: 127.0.0.1:$api_port"
  exit 0
fi

cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
  echo "Refusing to deploy: the checkout has tracked or untracked changes." >&2
  exit 1
fi

# Detect a first-deploy collision without disturbing an already-running
# FretFlow API container. This check is available on the Ubuntu EC2 host.
existing_api_id="$("${COMPOSE[@]}" ps --all -q api 2>/dev/null || true)"
if [[ -z "$existing_api_id" ]] && command -v ss >/dev/null 2>&1; then
  if ss -H -ltn "sport = :$api_port" | grep -q .; then
    echo "Refusing to deploy: host port $api_port is already in use by another service." >&2
    exit 1
  fi
fi

echo "Building FretFlow API image tag $FRETFLOW_IMAGE_TAG (frontend is not built)"
"${COMPOSE[@]}" build api

backup_local_database() {
  [[ ",$profiles," == *,db,* ]] || return 0

  local db_id db_running project_name volume_id backup_dir backup_file db_name db_user
  db_name="$(env_value POSTGRES_DB)"
  db_user="$(env_value POSTGRES_USER)"
  db_id="$("${COMPOSE[@]}" ps --all -q db 2>/dev/null || true)"
  project_name="$("${COMPOSE[@]}" config | awk '$1 == "name:" { print $2; exit }')"
  volume_id="$(docker volume ls -q \
    --filter "label=com.docker.compose.project=$project_name" \
    --filter "label=com.docker.compose.volume=pgdata" | head -n 1)"

  if [[ -z "$db_id" && -z "$volume_id" ]]; then
    echo "No existing FretFlow DB container; skipping pre-migration backup on first deploy."
    return 0
  fi

  if [[ -z "$db_id" ]]; then
    echo "Existing FretFlow DB volume found; starting only its DB container for backup."
    "${COMPOSE[@]}" up -d db
    db_id="$("${COMPOSE[@]}" ps --all -q db)"
  else
    db_running="$(docker inspect --format '{{.State.Running}}' "$db_id")"
    if [[ "$db_running" != true ]]; then
      echo "Starting the existing FretFlow DB container for backup."
      docker start "$db_id" >/dev/null
    fi
  fi

  for _ in $(seq 1 30); do
    if docker exec "$db_id" pg_isready --username "$db_user" --dbname "$db_name" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! docker exec "$db_id" pg_isready --username "$db_user" --dbname "$db_name" >/dev/null 2>&1; then
    echo "FretFlow DB did not become ready; deployment was not started." >&2
    exit 1
  fi

  backup_dir="${FRETFLOW_BACKUP_DIR:-$REPO_ROOT/.backups/postgres}"
  install -d -m 700 "$backup_dir"
  backup_file="$backup_dir/fretflow-$(date -u +%Y%m%dT%H%M%SZ)-before-$FRETFLOW_IMAGE_TAG.dump"

  echo "Backing up the existing FretFlow database before migrations"
  if ! "${COMPOSE[@]}" exec -T db \
    pg_dump --format=custom --no-owner --no-privileges \
    --username "$db_user" --dbname "$db_name" >"$backup_file"; then
    rm -f -- "$backup_file"
    echo "Database backup failed; deployment was not started." >&2
    exit 1
  fi
  chmod 600 "$backup_file"
  echo "Database backup created: $backup_file"
}

backup_local_database

# No --remove-orphans, no down, no volume operations: only FretFlow api and its
# declared db dependency may be created or updated.
"${COMPOSE[@]}" up -d api

for _ in $(seq 1 40); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$api_port/api/health" >/dev/null; then
    echo "FretFlow API is healthy at http://127.0.0.1:$api_port/api/health"
    "${COMPOSE[@]}" ps
    echo "Backend deployment complete. Frontend and other Compose projects were not changed."
    exit 0
  fi
  sleep 3
done

echo "FretFlow API did not become healthy." >&2
"${COMPOSE[@]}" ps >&2
"${COMPOSE[@]}" logs --tail=100 api >&2
echo "Rollback the API image only:" >&2
echo "FRETFLOW_IMAGE_TAG=<previous-git-sha> docker compose --env-file $ENV_FILE -f $SCRIPT_DIR/docker-compose.yml up -d --no-deps api" >&2
exit 1
