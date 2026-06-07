#!/usr/bin/env bash
set -Eeuo pipefail

ATLAS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$ATLAS_DIR/.." && pwd)"
DEPLOY_FROM_GIT="${DEPLOY_FROM_GIT:-true}"
DEPLOY_GIT_REMOTE="${DEPLOY_GIT_REMOTE:-origin}"
DEPLOY_GIT_REF="${DEPLOY_GIT_REF:-}"

if [[ "$DEPLOY_FROM_GIT" == "true" && -z "${DEPLOY_GIT_SYNC_DONE:-}" ]] &&
  git -C "$ATLAS_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -z "${ENV_FILE:-}" && -f "$ATLAS_DIR/.git/.env.production" ]]; then
    export ENV_FILE="$ATLAS_DIR/.git/.env.production"
  elif [[ -n "${ENV_FILE:-}" && "$ENV_FILE" != /* ]]; then
    ENV_FILE="$(cd "$ATLAS_DIR/$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
    export ENV_FILE
  fi

  echo "Fetching latest deployment source from $DEPLOY_GIT_REMOTE..."
  git -C "$ATLAS_DIR" fetch --prune "$DEPLOY_GIT_REMOTE"

  if [[ -z "$DEPLOY_GIT_REF" ]]; then
    REMOTE_HEAD="$(git -C "$ATLAS_DIR" symbolic-ref --quiet --short "refs/remotes/$DEPLOY_GIT_REMOTE/HEAD" || true)"
    if [[ -n "$REMOTE_HEAD" ]]; then
      DEPLOY_GIT_REF="$REMOTE_HEAD"
    elif git -C "$ATLAS_DIR" rev-parse --verify "$DEPLOY_GIT_REMOTE/main" >/dev/null 2>&1; then
      DEPLOY_GIT_REF="$DEPLOY_GIT_REMOTE/main"
    elif git -C "$ATLAS_DIR" rev-parse --verify "$DEPLOY_GIT_REMOTE/master" >/dev/null 2>&1; then
      DEPLOY_GIT_REF="$DEPLOY_GIT_REMOTE/master"
    else
      echo "Could not find $DEPLOY_GIT_REMOTE/HEAD, $DEPLOY_GIT_REMOTE/main, or $DEPLOY_GIT_REMOTE/master." >&2
      echo "Set DEPLOY_GIT_REF explicitly or DEPLOY_FROM_GIT=false to deploy the current checkout." >&2
      exit 1
    fi
  fi

  if [[ -n "$DEPLOY_GIT_REF" && "$DEPLOY_GIT_REF" != */* ]] &&
    git -C "$ATLAS_DIR" rev-parse --verify "$DEPLOY_GIT_REMOTE/$DEPLOY_GIT_REF" >/dev/null 2>&1; then
    DEPLOY_GIT_REF="$DEPLOY_GIT_REMOTE/$DEPLOY_GIT_REF"
  fi

  DEPLOY_GIT_SHA="$(git -C "$ATLAS_DIR" rev-parse "$DEPLOY_GIT_REF^{commit}")"
  DEPLOY_WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/samsar-atlas-deploy.XXXXXX")"
  trap 'rm -rf "$DEPLOY_WORKTREE"' EXIT

  echo "Deploying clean source $DEPLOY_GIT_REF@${DEPLOY_GIT_SHA:0:12}"
  git -C "$ATLAS_DIR" archive "$DEPLOY_GIT_SHA" | tar -x -C "$DEPLOY_WORKTREE"
  DEPLOY_GIT_SYNC_DONE=1 \
    ATLAS_DEPLOY_SOURCE_REF="$DEPLOY_GIT_REF" \
    ATLAS_DEPLOY_SOURCE_SHA="$DEPLOY_GIT_SHA" \
    bash "$DEPLOY_WORKTREE/scripts/deploy_google_cloud_run.sh" "$@"
  exit $?
fi

if [[ -f "$WORKSPACE_DIR/cloudbuild.samsar-atlas.yaml" ]]; then
  ROOT_DIR="$WORKSPACE_DIR"
  BUILDCONFIG="$WORKSPACE_DIR/cloudbuild.samsar-atlas.yaml"
else
  ROOT_DIR="$ATLAS_DIR"
  BUILDCONFIG="$ATLAS_DIR/cloudbuild.yaml"
fi
ENV_FILE="${ENV_FILE:-$ATLAS_DIR/.git/.env.production}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
elif [[ -z "${SAMSAR_API_KEY:-}" ]]; then
  echo "Production env file not found: $ENV_FILE" >&2
  echo "Create it or export SAMSAR_API_KEY before running this script." >&2
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-southeast1}"
REPO="${REPO:-samsar-agents}"
SERVICE="${SERVICE:-samsar-atlas}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-samsar-atlas-run}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com}"
IMAGE="${IMAGE:-$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:latest}"
FIRESTORE_AGENT_COLLECTION="${FIRESTORE_AGENT_COLLECTION:-samsar_atlas_agents}"
DEPLOY_SAMPLE_STOREFRONT="${DEPLOY_SAMPLE_STOREFRONT:-true}"
DEMO_STOREFRONT_PROXY_ENABLED="${DEMO_STOREFRONT_PROXY_ENABLED:-true}"
DEMO_STOREFRONT_ADMIN_USERNAME="${DEMO_STOREFRONT_ADMIN_USERNAME:-admin}"
DEMO_STOREFRONT_VIDEO_COLLECTION="${DEMO_STOREFRONT_VIDEO_COLLECTION:-atlas_demo_product_videos}"
DEMO_STOREFRONT_INITIAL_CREDITS="${DEMO_STOREFRONT_INITIAL_CREDITS:-100}"
DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET="${DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET:-demo-storefront-admin-password}"
DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME="${DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME:-demo-storefront-admin-session-secret}"
DEMO_STOREFRONT_AGENT_SECRET_NAME="${DEMO_STOREFRONT_AGENT_SECRET_NAME:-demo-storefront-agent-secret}"
FIREBASE_HOSTING_SITE_ID="${FIREBASE_HOSTING_SITE_ID:-$PROJECT_ID}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID is required or gcloud config project must be set." >&2
  exit 1
fi

if [[ -z "${SAMSAR_API_KEY:-}" ]]; then
  echo "SAMSAR_API_KEY is missing. Set it in $ENV_FILE or export it before running this script." >&2
  exit 1
fi

echo "Deploying Samsar Atlas to project=$PROJECT_ID region=$REGION service=$SERVICE"

gcloud config set project "$PROJECT_ID" >/dev/null

retry() {
  local attempts="$1"
  shift
  local delay=3
  local i
  for ((i = 1; i <= attempts; i += 1)); do
    if "$@"; then
      return 0
    fi
    if [[ "$i" == "$attempts" ]]; then
      return 1
    fi
    sleep "$delay"
  done
}

existing_run_env_value() {
  local name="$1"
  local service_json
  service_json="$(gcloud run services describe "$SERVICE" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format=json 2>/dev/null || true)"
  if [[ -z "$service_json" ]]; then
    return 0
  fi
  printf '%s' "$service_json" |
    node -e "let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { if (!input.trim()) return; const svc = JSON.parse(input); const env = svc.spec?.template?.spec?.containers?.[0]?.env || []; const item = env.find((entry) => entry.name === process.argv[1]); process.stdout.write(item?.value || ''); });" "$name"
}

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$PROJECT_ID" >/dev/null

random_secret() {
  openssl rand -base64 30 | tr -d '\n'
}

secret_exists() {
  gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1
}

secret_latest() {
  gcloud secrets versions access latest --secret="$1" --project "$PROJECT_ID" 2>/dev/null || true
}

upsert_secret() {
  local name="$1"
  local value="$2"
  if secret_exists "$name"; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project "$PROJECT_ID" \
      --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --project "$PROJECT_ID" \
      --data-file=- \
      --replication-policy=automatic >/dev/null
  fi
}

grant_secret_access() {
  retry 10 gcloud secrets add-iam-policy-binding "$1" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
}

if ! gcloud artifacts repositories describe "$REPO" \
  --location "$REGION" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Samsar Atlas container images" \
    --project "$PROJECT_ID" >/dev/null
fi

if gcloud secrets describe samsar-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  printf '%s' "$SAMSAR_API_KEY" | gcloud secrets versions add samsar-api-key \
    --project "$PROJECT_ID" \
    --data-file=- >/dev/null
else
  printf '%s' "$SAMSAR_API_KEY" | gcloud secrets create samsar-api-key \
    --project "$PROJECT_ID" \
    --data-file=- \
    --replication-policy=automatic >/dev/null
fi

if [[ -z "${DEMO_STOREFRONT_ADMIN_PASSWORD:-}" ]]; then
  DEMO_STOREFRONT_ADMIN_PASSWORD="$(secret_latest "$DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET")"
fi
if [[ -z "${DEMO_STOREFRONT_ADMIN_PASSWORD:-}" ]]; then
  DEMO_STOREFRONT_ADMIN_PASSWORD="$(random_secret)"
fi
upsert_secret "$DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET" "$DEMO_STOREFRONT_ADMIN_PASSWORD"

if [[ -z "${DEMO_STOREFRONT_ADMIN_SESSION_SECRET:-}" ]]; then
  DEMO_STOREFRONT_ADMIN_SESSION_SECRET="$(secret_latest "$DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME")"
fi
if [[ -z "${DEMO_STOREFRONT_ADMIN_SESSION_SECRET:-}" ]]; then
  DEMO_STOREFRONT_ADMIN_SESSION_SECRET="$(random_secret)"
fi
upsert_secret "$DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME" "$DEMO_STOREFRONT_ADMIN_SESSION_SECRET"

if [[ -z "${DEMO_STOREFRONT_AGENT_SECRET:-}" ]] && secret_exists "$DEMO_STOREFRONT_AGENT_SECRET_NAME"; then
  DEMO_STOREFRONT_AGENT_SECRET="$(secret_latest "$DEMO_STOREFRONT_AGENT_SECRET_NAME")"
fi
if [[ -z "${DEMO_STOREFRONT_AGENT_ID:-}" ]]; then
  DEMO_STOREFRONT_AGENT_ID="$(existing_run_env_value DEMO_STOREFRONT_AGENT_ID)"
fi
if [[ -n "${DEMO_STOREFRONT_AGENT_SECRET:-}" ]]; then
  upsert_secret "$DEMO_STOREFRONT_AGENT_SECRET_NAME" "$DEMO_STOREFRONT_AGENT_SECRET"
fi

if ! gcloud firestore databases describe \
  --database='(default)' \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="$REGION" \
    --project "$PROJECT_ID" >/dev/null
fi

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --project "$PROJECT_ID" \
    --display-name="Samsar Atlas Cloud Run" >/dev/null
fi

retry 10 gcloud secrets add-iam-policy-binding samsar-api-key \
  --project "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

grant_secret_access "$DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET"
grant_secret_access "$DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME"
if secret_exists "$DEMO_STOREFRONT_AGENT_SECRET_NAME"; then
  grant_secret_access "$DEMO_STOREFRONT_AGENT_SECRET_NAME"
fi

retry 10 gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/datastore.user" >/dev/null

gcloud builds submit \
  --config "$BUILDCONFIG" \
  --substitutions="_IMAGE=$IMAGE" \
  "$ROOT_DIR"

EXISTING_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)' 2>/dev/null || true)"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$EXISTING_URL}"
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="https://placeholder"
fi

RUN_SECRET_ARGS="SAMSAR_API_KEY=samsar-api-key:latest,DEMO_STOREFRONT_ADMIN_PASSWORD=$DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET:latest,DEMO_STOREFRONT_ADMIN_SESSION_SECRET=$DEMO_STOREFRONT_ADMIN_SESSION_SECRET_NAME:latest"
if [[ -n "${DEMO_STOREFRONT_AGENT_SECRET:-}" ]]; then
  RUN_SECRET_ARGS="$RUN_SECRET_ARGS,DEMO_STOREFRONT_AGENT_SECRET=$DEMO_STOREFRONT_AGENT_SECRET_NAME:latest"
fi

RUN_ENV_ARGS="PUBLIC_BASE_URL=$PUBLIC_BASE_URL,SAMSAR_API_BASE_URL=${SAMSAR_API_BASE_URL:-https://api.samsar.one},SAMSAR_REQUEST_TIMEOUT_MS=${SAMSAR_REQUEST_TIMEOUT_MS:-60000},JSON_BODY_LIMIT=${JSON_BODY_LIMIT:-25mb},AGENT_CARD_DOCUMENTATION_URL=${AGENT_CARD_DOCUMENTATION_URL:-https://docs.samsar.one/v2},ATLAS_AGENT_PROVIDER=${ATLAS_AGENT_PROVIDER:-samsar-atlas},ATLAS_STATE_BACKEND=firestore,FIRESTORE_AGENT_COLLECTION=$FIRESTORE_AGENT_COLLECTION,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,DEMO_STOREFRONT_PROXY_ENABLED=$DEMO_STOREFRONT_PROXY_ENABLED,DEMO_STOREFRONT_ADMIN_USERNAME=$DEMO_STOREFRONT_ADMIN_USERNAME,DEMO_STOREFRONT_VIDEO_COLLECTION=$DEMO_STOREFRONT_VIDEO_COLLECTION,DEMO_STOREFRONT_ADMIN_SESSION_TTL_SECONDS=${DEMO_STOREFRONT_ADMIN_SESSION_TTL_SECONDS:-43200}"
if [[ -n "${DEMO_STOREFRONT_AGENT_ID:-}" ]]; then
  RUN_ENV_ARGS="$RUN_ENV_ARGS,DEMO_STOREFRONT_AGENT_ID=$DEMO_STOREFRONT_AGENT_ID"
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --service-account "$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 80 \
  --timeout 300 \
  --min-instances "${MIN_INSTANCES:-0}" \
  --max-instances "${MAX_INSTANCES:-1}" \
  --set-secrets "$RUN_SECRET_ARGS" \
  --set-env-vars "$RUN_ENV_ARGS"

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)')"

if [[ "$PUBLIC_BASE_URL" == "https://placeholder" || "$PUBLIC_BASE_URL" != "$SERVICE_URL" ]]; then
  gcloud run services update "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-env-vars "PUBLIC_BASE_URL=$SERVICE_URL" >/dev/null
fi

curl -fsS "$SERVICE_URL/health" >/dev/null

if [[ "$DEMO_STOREFRONT_PROXY_ENABLED" == "true" && ( -z "${DEMO_STOREFRONT_AGENT_ID:-}" || -z "${DEMO_STOREFRONT_AGENT_SECRET:-}" ) ]]; then
  echo "Bootstrapping demo storefront Atlas agent..."
  REGISTER_RESPONSE_FILE="$(mktemp)"
  curl -fsS -X POST "$SERVICE_URL/agents/register" \
    -H "content-type: application/json" \
    -d "{
      \"credits\": $DEMO_STOREFRONT_INITIAL_CREDITS,
      \"displayName\": \"Atlas Market Demo Agent\",
      \"email\": \"${DEMO_STOREFRONT_AGENT_EMAIL:-atlas-market-demo@example.com}\",
      \"externalAgentId\": \"atlas-market-sample-client\",
      \"metadata\": { \"source\": \"atlas-market-sample-storefront\" },
      \"success_url\": \"${DEMO_STOREFRONT_SUCCESS_URL:-$SERVICE_URL/demo/storefront/payment-status}\",
      \"cancel_url\": \"${DEMO_STOREFRONT_CANCEL_URL:-$SERVICE_URL/demo/storefront/payment-status}\"
    }" > "$REGISTER_RESPONSE_FILE"

  DEMO_STOREFRONT_AGENT_ID="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(body.credentials?.agentId || body.registration?.referenceId || '');" "$REGISTER_RESPONSE_FILE")"
  DEMO_STOREFRONT_AGENT_SECRET="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(body.credentials?.agentSecret || '');" "$REGISTER_RESPONSE_FILE")"
  DEMO_STOREFRONT_CHECKOUT_URL="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(body.checkout?.url || body.checkout?.checkout_url || body.checkout?.checkoutUrl || body.checkout?.payment_url || body.checkout?.paymentUrl || '');" "$REGISTER_RESPONSE_FILE")"
  rm -f "$REGISTER_RESPONSE_FILE"

  if [[ -z "$DEMO_STOREFRONT_AGENT_ID" || -z "$DEMO_STOREFRONT_AGENT_SECRET" ]]; then
    echo "Failed to bootstrap demo storefront agent." >&2
    exit 1
  fi

  upsert_secret "$DEMO_STOREFRONT_AGENT_SECRET_NAME" "$DEMO_STOREFRONT_AGENT_SECRET"
  grant_secret_access "$DEMO_STOREFRONT_AGENT_SECRET_NAME"

  gcloud run services update "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-secrets "DEMO_STOREFRONT_AGENT_SECRET=$DEMO_STOREFRONT_AGENT_SECRET_NAME:latest" \
    --update-env-vars "DEMO_STOREFRONT_AGENT_ID=$DEMO_STOREFRONT_AGENT_ID" >/dev/null
fi

firebase_cmd() {
  if [[ -n "${FIREBASE_CLI:-}" ]]; then
    # shellcheck disable=SC2086
    $FIREBASE_CLI "$@"
  elif command -v firebase >/dev/null 2>&1; then
    firebase "$@"
  else
    npm_config_cache="${FIREBASE_NPM_CACHE:-$ATLAS_DIR/.npm-cache}" npx --yes firebase-tools@latest "$@"
  fi
}

if [[ "$DEPLOY_SAMPLE_STOREFRONT" == "true" ]]; then
  echo "Deploying sample storefront to Firebase Hosting project=$PROJECT_ID"
  if ! firebase_cmd projects:addfirebase "$PROJECT_ID" --project "$PROJECT_ID" --non-interactive >/dev/null 2>&1; then
    echo "Firebase project setup was skipped or failed. Continuing only if the project is already Firebase-enabled." >&2
  fi
  echo "Ensuring Firebase Hosting site exists: $FIREBASE_HOSTING_SITE_ID"
  if ! firebase_cmd hosting:sites:create "$FIREBASE_HOSTING_SITE_ID" \
    --project "$PROJECT_ID" \
    --non-interactive >/dev/null 2>&1; then
    echo "Firebase Hosting site create skipped. Continuing with explicit site deployment."
  fi
  (
    cd "$ATLAS_DIR/sample-storefront"
    trap 'rm -f .env.production firebase.deploy.json' EXIT
    export npm_config_cache="${npm_config_cache:-$PWD/.npm-cache}"
    cat > .env.production <<EOF
VITE_ATLAS_BASE_URL=
VITE_DEMO_PROXY_BASE_URL=/demo/storefront
VITE_USE_DEMO_PROXY=true
VITE_USE_FIREBASE_CLIENT_STATE=false
EOF
    FIREBASE_HOSTING_SITE_ID="$FIREBASE_HOSTING_SITE_ID" node -e "const fs = require('fs'); const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8')); if (Array.isArray(config.hosting)) { config.hosting = config.hosting.map((item) => ({ ...item, site: process.env.FIREBASE_HOSTING_SITE_ID })); } else { config.hosting = { ...config.hosting, site: process.env.FIREBASE_HOSTING_SITE_ID }; } fs.writeFileSync('firebase.deploy.json', JSON.stringify(config, null, 2));"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    npm run build
    firebase_cmd deploy --config firebase.deploy.json --project "$PROJECT_ID" --only hosting,firestore:rules
  )
fi

echo "Samsar Atlas deployed: $SERVICE_URL"
if [[ -n "${ATLAS_DEPLOY_SOURCE_REF:-}" && -n "${ATLAS_DEPLOY_SOURCE_SHA:-}" ]]; then
  echo "Deployed source: $ATLAS_DEPLOY_SOURCE_REF@${ATLAS_DEPLOY_SOURCE_SHA:0:12}"
fi
echo "Sample storefront admin username: $DEMO_STOREFRONT_ADMIN_USERNAME"
echo "Sample storefront admin password secret: $DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET"
echo "Retrieve admin password: gcloud secrets versions access latest --secret=$DEMO_STOREFRONT_ADMIN_PASSWORD_SECRET --project=$PROJECT_ID"
if [[ -n "${DEMO_STOREFRONT_AGENT_ID:-}" ]]; then
  echo "Sample storefront demo agent id: $DEMO_STOREFRONT_AGENT_ID"
fi
if [[ -n "${DEMO_STOREFRONT_CHECKOUT_URL:-}" ]]; then
  echo "Complete the initial demo agent checkout: $DEMO_STOREFRONT_CHECKOUT_URL"
fi
