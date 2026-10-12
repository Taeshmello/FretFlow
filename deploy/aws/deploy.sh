#!/usr/bin/env bash
# Builds and (re)starts FretFlow on the EC2 host from the checked-out revision.
#   deploy/aws/deploy.sh            # db (if COMPOSE_PROFILES=db) + api + web
#   deploy/aws/deploy.sh api        # backend only (db is started when enabled)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${FRETFLOW_ENV_FILE:-$SCRIPT_DIR/.env}"
ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/docker-compose.yml")
SERVICES=("$@")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  echo "cd deploy/aws && cp .env.example .env && chmod 600 .env, then fill in the values." >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read $ENV_FILE. Run as its owner or with sudo." >&2
  exit 1
fi
if [[ "$(stat -c %a "$ENV_FILE")" != "600" ]]; then
  echo "Refusing to deploy: $ENV_FILE must be mode 600 (chmod 600 $ENV_FILE)." >&2
  exit 1
fi

# Reads KEY=value without executing the file.
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }

missing=()
for key in DATABASE_URL BETTER_AUTH_SECRET EMAIL_PROVIDER_API_KEY \
  S3_ENDPOINT S3_REGION S3_BUCKET S3_UPLOAD_CHECKSUM \
  S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  [[ -n "$(env_value "$key")" ]] || missing+=("$key")
done
if [[ "$(env_value COMPOSE_PROFILES)" == *db* ]]; then
  for key in POSTGRES_USER POSTGRES_PASSWORD; do
    [[ -n "$(env_value "$key")" ]] || missing+=("$key")
  done
fi
if (( ${#missing[@]} > 0 )); then
  echo "Refusing to deploy: empty values in $ENV_FILE: ${missing[*]}" >&2
  exit 1
fi
if [[ "$(env_value S3_ENDPOINT)" == *YOUR_CLOUDFLARE_ACCOUNT_ID* ]]; then
  echo "Refusing to deploy: replace YOUR_CLOUDFLARE_ACCOUNT_ID in S3_ENDPOINT." >&2
  exit 1
fi
if [[ "$(env_value S3_UPLOAD_CHECKSUM)" != none ]]; then
  echo "Refusing to deploy: Cloudflare R2 requires S3_UPLOAD_CHECKSUM=none." >&2
  exit 1
fi

# Only loopback ports that are free on the shared EC2 host may be used. The
# container ports (3000, 80 and 5432) live inside Docker networks and do not
# conflict with host services.
api_port="$(env_value FRETFLOW_API_HOST_PORT)"
web_port="$(env_value FRETFLOW_WEB_HOST_PORT)"
api_port="${api_port:-3100}"
web_port="${web_port:-8082}"
reserved_ports=(22 80 443 5432 8000 8081)

validate_port() {
  local label="$1" port="$2" reserved
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
    echo "Refusing to deploy: $label must be an integer from 1024 to 65535 (got '$port')." >&2
    exit 1
  fi
  for reserved in "${reserved_ports[@]}"; do
    if (( port == reserved )); then
      echo "Refusing to deploy: $label=$port conflicts with a reserved host port." >&2
      exit 1
    fi
  done
}

validate_port FRETFLOW_API_HOST_PORT "$api_port"
validate_port FRETFLOW_WEB_HOST_PORT "$web_port"
if (( api_port == web_port )); then
  echo "Refusing to deploy: API and web host ports must be different." >&2
  exit 1
fi
# Make the validated values authoritative even if the caller exported an
# environment variable that would otherwise override the env file in Compose.
export FRETFLOW_API_HOST_PORT="$api_port"
export FRETFLOW_WEB_HOST_PORT="$web_port"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required." >&2
  exit 1
fi

cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
  echo "Warning: tracked files differ from the checked-out revision." >&2
fi
export FRETFLOW_ENV_FILE="$ENV_FILE"
export FRETFLOW_IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"
echo "Deploying ${SERVICES[*]:-all services} at image tag $FRETFLOW_IMAGE_TAG"

"${COMPOSE[@]}" up -d --build --remove-orphans "${SERVICES[@]}"

# The API applies migrations before listening, so allow it time to come up.
wait_for() {
  local service="$1" url="$2"
  for _ in $(seq 1 30); do
    if curl --fail --silent --max-time 3 "$url" >/dev/null; then
      echo "$service is healthy"
      return 0
    fi
    sleep 3
  done
  echo "$service did not become healthy: $url" >&2
  "${COMPOSE[@]}" ps >&2
  "${COMPOSE[@]}" logs --tail=80 "$service" >&2
  return 1
}

wants() { [[ ${#SERVICES[@]} -eq 0 ]] || [[ " ${SERVICES[*]} " == *" $1 "* ]]; }

wants api && wait_for api "http://127.0.0.1:${api_port}/api/health"
wants web && wait_for web "http://127.0.0.1:${web_port}/index.html"

"${COMPOSE[@]}" ps

echo "Done. Verify from outside: https://fretflow.iliasai.com/api/health"
echo "Rollback: FRETFLOW_IMAGE_TAG=<previous tag> docker compose --env-file $ENV_FILE -f $SCRIPT_DIR/docker-compose.yml up -d --no-build"
