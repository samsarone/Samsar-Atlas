#!/usr/bin/env bash
set -Eeuo pipefail

ATLAS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$ATLAS_DIR/.." && pwd)"
if [[ -f "$WORKSPACE_DIR/cloudbuild.samsar-atlas.yaml" ]]; then
  ROOT_DIR="$WORKSPACE_DIR"
  BUILDCONFIG="$WORKSPACE_DIR/cloudbuild.samsar-atlas.yaml"
else
  ROOT_DIR="$ATLAS_DIR"
  BUILDCONFIG="$ATLAS_DIR/cloudbuild.yaml"
fi
ENV_FILE="${ENV_FILE:-$ATLAS_DIR/.git/.env.production}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-southeast1}"
REPO="${REPO:-samsar-agents}"
SERVICE="${SERVICE:-samsar-atlas}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-samsar-atlas-run}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com}"
IMAGE="${IMAGE:-$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:latest}"
FIRESTORE_AGENT_COLLECTION="${FIRESTORE_AGENT_COLLECTION:-samsar_atlas_agents}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID is required or gcloud config project must be set." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [[ -z "${SAMSAR_API_KEY:-}" ]]; then
  echo "SAMSAR_API_KEY is missing in $ENV_FILE" >&2
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

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  --project "$PROJECT_ID" >/dev/null

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
  --set-secrets SAMSAR_API_KEY=samsar-api-key:latest \
  --set-env-vars "PUBLIC_BASE_URL=$PUBLIC_BASE_URL,SAMSAR_API_BASE_URL=${SAMSAR_API_BASE_URL:-https://api.samsar.one},SAMSAR_REQUEST_TIMEOUT_MS=${SAMSAR_REQUEST_TIMEOUT_MS:-60000},JSON_BODY_LIMIT=${JSON_BODY_LIMIT:-25mb},AGENT_CARD_DOCUMENTATION_URL=${AGENT_CARD_DOCUMENTATION_URL:-https://docs.samsar.one/v2},ATLAS_AGENT_PROVIDER=${ATLAS_AGENT_PROVIDER:-samsar-atlas},ATLAS_STATE_BACKEND=firestore,FIRESTORE_AGENT_COLLECTION=$FIRESTORE_AGENT_COLLECTION,GOOGLE_CLOUD_PROJECT=$PROJECT_ID"

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

echo "Samsar Atlas deployed: $SERVICE_URL"
