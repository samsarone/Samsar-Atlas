# Samsar Atlas

Samsar Atlas is an open-source A2A 1.0 gateway for Samsar. It exposes Samsar video generation and Atlas-managed agent billing as a standards-based endpoint that other agents can discover and call.

Atlas is designed for a simple operating model: deploy one stateless container to Cloud Run, persist agent sub-account state in Firestore, publish the Agent Card, and let A2A clients invoke Samsar through a clean protocol boundary.

## What Atlas Provides

- **A2A 1.0 compatibility** through JSON-RPC and HTTP+JSON interfaces.
- **Agent Card discovery** at `/.well-known/agent-card.json`.
- **Samsar v2 coverage** for media generation, editing, task status, and agent-scoped billing.
- **Atlas-managed sub-accounts** with per-agent secrets, stable cryptographic agent hashes, and billing attribution.
- **Cloud Run deployment** with a small container footprint and no Kubernetes dependency.
- **SDK-based integration** through `samsar-js`; Atlas does not call Samsar Processor internals directly.

## Protocol Surface

Atlas exposes these public endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/agent-card.json` | A2A Agent Card discovery. |
| `POST /agents/register` | Start self-service registration by creating an Atlas-managed agent sub-account and credit checkout. |
| `GET /agents/me` | Fetch the authenticated Atlas agent profile and local billing counters. |
| `POST /agents/rotate-secret` | Rotate the authenticated Atlas agent secret. |
| `POST /agents/billing/recharge` | Create a recharge checkout for the authenticated Atlas agent. |
| `GET /agents/billing/payment-status` | Poll payment status for the authenticated Atlas agent. |
| `POST /a2a` | JSON-RPC A2A endpoint. |
| `POST /message:send` | HTTP+JSON alias for sending an A2A message. |
| `GET /tasks` | List visible Samsar tasks. |
| `GET /tasks/:id` | Fetch task status. |
| `POST /tasks/:id:cancel` | Cancel a task. |
| `POST /tasks/:id/cancel` | Cancel alias for clients that prefer slash routes. |
| `GET /health` | Runtime health check. |

Supported JSON-RPC methods:

- `SendMessage`
- `GetTask`
- `ListTasks`
- `CancelTask`
- `GetExtendedAgentCard`

Streaming and push notifications are not advertised yet. Use `SendMessage` and poll with `GetTask`.

## Skills

Atlas uses `metadata.skill` to route an A2A message to the corresponding Samsar operation.

Media skills:

- `text_to_video`
- `image_list_to_video`
- `step_text_to_video`
- `step_image_to_video`
- `translate_video`
- `clone_video`
- `regenerate_avatar`
- `add_outro_image`
- `update_outro_image`
- `update_footer_image`
- `join_videos`

Billing skills:

- `get_credits`
- `create_credits_recharge`
- `get_payment_status`

Synchronous skills return a completed A2A task immediately, with the Samsar response in the `samsar-response` data artifact. Long-running media skills return a task id that can be polled. Atlas injects the authenticated agent sub-account into every Samsar request; callers cannot choose another `external_user` in A2A payloads.

## Quickstart

From the workspace root:

```bash
npm --prefix samsar-js install
npm --prefix samsar-js run build
npm --prefix Samsar-Atlas install
SAMSAR_API_KEY="$SAMSAR_API_KEY" ATLAS_STATE_BACKEND=memory npm --prefix Samsar-Atlas run dev
```

The local service starts on `PORT`, defaulting to `8080`.

```bash
curl http://localhost:8080/health
curl http://localhost:8080/.well-known/agent-card.json
```

## Configuration

Copy `.env.example` and set:

| Variable | Required | Description |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | Yes | Public URL used in the Agent Card. |
| `SAMSAR_API_BASE_URL` | Yes | Samsar API base URL, for example `https://api.samsar.one`. |
| `SAMSAR_API_KEY` | Yes | Platform service API key used for all underlying `samsar-js` requests. |
| `SAMSAR_REQUEST_TIMEOUT_MS` | No | Upstream request timeout. Defaults to `60000`. |
| `JSON_BODY_LIMIT` | No | JSON body limit. Defaults to `25mb`. |
| `AGENT_CARD_DOCUMENTATION_URL` | No | Documentation URL included in the Agent Card. |
| `ATLAS_AGENT_PROVIDER` | No | Provider name used for Samsar external-user attribution. Defaults to `samsar-atlas`. |
| `ATLAS_AGENT_SECRET_BYTES` | No | Random byte length for generated Atlas agent secrets. Defaults to `32`. |
| `ATLAS_STATE_BACKEND` | No | `firestore` or `memory`. Defaults to `firestore` in production and `memory` otherwise. |
| `GOOGLE_CLOUD_PROJECT` | Firestore | Google Cloud project for Firestore. Cloud Run service identity can also infer this. |
| `FIRESTORE_DATABASE_ID` | No | Optional Firestore database id. |
| `FIRESTORE_AGENT_COLLECTION` | No | Firestore collection for Atlas agent records. Defaults to `samsar_atlas_agents`. |

Only `SAMSAR_API_KEY` is needed from Samsar. Atlas no longer accepts `SAMSAR_APP_KEY`, `SAMSAR_APP_SECRET`, or `SAMSAR_EXTERNAL_USER_API_KEY` because connecting agents authenticate to Atlas, not directly to Samsar.

## Agent Registration

Register each connecting agent by purchasing credits. Atlas creates a pending sub-account, creates a Samsar credit checkout for that sub-account, and returns a reference id plus a cryptographic agent secret. The agent can use the reference id for lookup, but agent calls still require the returned secret.

```bash
curl -X POST http://localhost:8080/agents/register \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Marketplace Agent",
    "email": "ops@example.com",
    "externalAgentId": "google-marketplace-agent-123",
    "credits": 2500
  }'
```

The response includes `registration.referenceId`, `agent.agentHash`, `checkout.url`, and `credentials.agentSecret`. Store the secret in the connecting agent. After the checkout is paid, poll payment status:

```bash
curl "http://localhost:8080/agents/billing/payment-status" \
  -H "x-atlas-agent-id: <referenceId>" \
  -H "x-atlas-agent-secret: <agentSecret>"
```

When the payment status succeeds, Atlas activates the sub-account. Send future A2A requests with:

```bash
Authorization: Bearer <agentSecret>
```

or:

```bash
x-atlas-agent-secret: <agentSecret>
```

You may also include `x-atlas-agent-id: <referenceId>` to avoid a credential-hash lookup. The reference id alone is not a credential.

## Example: Image List to Video

Send A2A requests with the Atlas agent secret:

```json
{
  "jsonrpc": "2.0",
  "id": "video-1",
  "method": "SendMessage",
  "params": {
    "metadata": {
      "skill": "image_list_to_video"
    },
    "message": {
      "role": "ROLE_USER",
      "messageId": "msg-video-1",
      "parts": [
        {
          "text": "Create a product launch ad."
        },
        {
          "data": {
            "input": {
              "image_urls": [
                "https://cdn.example.com/a.png",
                "https://cdn.example.com/b.png"
              ],
              "video_model": "RUNWAYML",
              "aspect_ratio": "16:9"
            }
          }
        }
      ]
    }
  }
}
```

Poll the returned task:

```json
{
  "jsonrpc": "2.0",
  "id": "status-1",
  "method": "GetTask",
  "params": {
    "id": "<task-id>"
  }
}
```

## Example: Billing

This creates a checkout link for the authenticated Atlas agent sub-account:

```json
{
  "jsonrpc": "2.0",
  "id": "billing-1",
  "method": "SendMessage",
  "params": {
    "metadata": {
      "skill": "create_credits_recharge"
    },
    "message": {
      "role": "ROLE_USER",
      "messageId": "msg-billing-1",
      "parts": [
        {
          "data": {
            "input": {
              "credits": 2500
            }
          }
        }
      ]
    }
  }
}
```

## Docker

Build from the workspace root so Docker can include the local `samsar-js` package:

```bash
docker build -f Samsar-Atlas/Dockerfile -t samsar-atlas .
```

Run locally:

```bash
docker run --rm -p 8080:8080 \
  -e PUBLIC_BASE_URL=http://localhost:8080 \
  -e SAMSAR_API_BASE_URL=https://api.samsar.one \
  -e SAMSAR_API_KEY="$SAMSAR_API_KEY" \
  -e ATLAS_STATE_BACKEND=memory \
  samsar-atlas
```

## Deploy to Cloud Run

From the workspace root, the local deploy script handles build, secrets, Firestore, IAM, Cloud Run deploy, and a health check:

```bash
Samsar-Atlas/scripts/deploy_google_cloud_run.sh
```

Recommended APAC region:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"
export REPO="samsar-agents"
export SERVICE="samsar-atlas"
export SERVICE_ACCOUNT="samsar-atlas-run@$PROJECT_ID.iam.gserviceaccount.com"
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:latest"
```

Build and push:

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud auth configure-docker "$REGION-docker.pkg.dev"

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Samsar Atlas container images"

docker build -f Samsar-Atlas/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
```

Create the platform API key secret and enable Firestore:

```bash
printf '%s' "$SAMSAR_API_KEY" | gcloud secrets create samsar-api-key \
  --data-file=- \
  --replication-policy=automatic

gcloud firestore databases create \
  --location="$REGION" \
  --database="(default)"

gcloud iam service-accounts create samsar-atlas-run \
  --display-name="Samsar Atlas Cloud Run"

gcloud secrets add-iam-policy-binding samsar-api-key \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/datastore.user"
```

Deploy with the service identity granted access to Firestore and Secret Manager:

```bash
gcloud run deploy "$SERVICE" \
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
  --min-instances 1 \
  --max-instances 5 \
  --set-secrets SAMSAR_API_KEY=samsar-api-key:latest \
  --set-env-vars PUBLIC_BASE_URL=https://placeholder,SAMSAR_API_BASE_URL=https://api.samsar.one,SAMSAR_REQUEST_TIMEOUT_MS=60000,JSON_BODY_LIMIT=25mb,ATLAS_AGENT_PROVIDER=samsar-atlas,ATLAS_STATE_BACKEND=firestore,FIRESTORE_AGENT_COLLECTION=samsar_atlas_agents
```

After deployment, update `PUBLIC_BASE_URL` to the assigned Cloud Run URL:

```bash
export SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format='value(status.url)')"

gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-env-vars PUBLIC_BASE_URL="$SERVICE_URL"
```

## Security

Atlas runs as the Samsar service principal and authenticates connecting agents with Atlas-issued secrets. Store only the secret hash in Firestore; the plaintext agent secret is returned during purchase-backed registration. For production, store `SAMSAR_API_KEY` in Secret Manager, use a user-managed Cloud Run service account, and grant that service account only the Secret Manager and Firestore permissions it needs. A public reference id is useful for routing and lookup, but it must not be treated as an authentication secret.

## License

Samsar Atlas is released under the [MIT License](LICENSE).
