# Samsar Atlas

Samsar Atlas is a Cloud Run-ready A2A gateway for Samsar video generation. It lets external agents register, buy credits, authenticate with Atlas-issued credentials, and call Samsar video workflows without receiving the platform `SAMSAR_API_KEY`.

Atlas is built for enterprise agent deployments:

- Public A2A discovery through `/.well-known/agent-card.json`
- Self-service agent registration through credit purchase
- Per-agent reference ids, cryptographic agent hashes, and secrets
- Firestore-backed sub-account state, billing counters, and request accounting
- Cloud Run deployment with Secret Manager for the Samsar platform API key
- `samsar-js` as the only Samsar integration layer

## Integration Flow

1. Deploy Atlas to Google Cloud Run.
2. Store `SAMSAR_API_KEY` in Google Secret Manager.
3. Let each connecting agent call `/agents/register` with the credits it wants to buy.
4. Return the Atlas `referenceId`, `agentSecret`, and checkout payload to that agent.
5. After payment succeeds, the agent uses its secret to start A2A render jobs and poll task status.

The `referenceId` is a stable public handle. It is not a credential. The `agentSecret` is the credential and is only returned when the agent is registered or when the secret is rotated.

## Requirements

- Node.js 20
- A Samsar platform API key
- Google Cloud project with Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and Firestore
- A user-managed Cloud Run service account with access to Secret Manager and Firestore

Only `SAMSAR_API_KEY` is required from Samsar. Atlas does not require `SAMSAR_APP_KEY`, `SAMSAR_APP_SECRET`, or `SAMSAR_EXTERNAL_USER_API_KEY`.

## Configuration

Copy `.env.example` for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | Production | Public Atlas URL used in the Agent Card. Defaults to localhost for development. |
| `SAMSAR_API_BASE_URL` | No | Samsar API base URL. Defaults to `https://api.samsar.one`. |
| `SAMSAR_API_KEY` | Yes | Platform key used by Atlas for underlying `samsar-js` requests. |
| `ATLAS_STATE_BACKEND` | No | `firestore` for production, `memory` for local development. |
| `GOOGLE_CLOUD_PROJECT` | Firestore | Google Cloud project used by Firestore. Usually inferred on Cloud Run. |
| `FIRESTORE_AGENT_COLLECTION` | No | Firestore collection for agent state. Defaults to `samsar_atlas_agents`. |
| `ATLAS_AGENT_PROVIDER` | No | Provider name for Samsar external-user attribution. Defaults to `samsar-atlas`. |
| `ATLAS_AGENT_SECRET_BYTES` | No | Random byte length for generated agent secrets. Defaults to `32`. |
| `SAMSAR_REQUEST_TIMEOUT_MS` | No | Upstream request timeout. Defaults to `60000`. |
| `JSON_BODY_LIMIT` | No | Express JSON body limit. Defaults to `25mb`. |
| `AGENT_CARD_DOCUMENTATION_URL` | No | Documentation URL published in the Agent Card. |

## Local Development

```bash
npm install
npm run typecheck
PUBLIC_BASE_URL=http://localhost:8080 \
SAMSAR_API_KEY="$SAMSAR_API_KEY" \
ATLAS_STATE_BACKEND=memory \
npm run dev
```

The service listens on `PORT`, defaulting to `8080`.

```bash
curl http://localhost:8080/health
curl http://localhost:8080/.well-known/agent-card.json
```

## Deploy to Cloud Run

The deployment script builds the container, pushes it to Artifact Registry, creates or updates the `samsar-api-key` secret, prepares Firestore/IAM, deploys Cloud Run, and verifies `/health`.

```bash
PROJECT_ID="your-gcp-project-id" \
REGION="asia-southeast1" \
SAMSAR_API_KEY="$SAMSAR_API_KEY" \
./scripts/deploy_google_cloud_run.sh
```

For push-to-deploy, connect this GitHub repository to Cloud Build and use `cloudbuild.yaml`. The build file deploys the container to Cloud Run and reads the platform key from Secret Manager:

```bash
gcloud builds triggers create github \
  --project "$PROJECT_ID" \
  --name=samsar-atlas-main-deploy \
  --repo-owner=samsarone \
  --repo-name=Samsar-Atlas \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/<cloud-build-service-account-email>"
```

Google Cloud must be authorized to access the GitHub repository before the trigger can be created. If you fork the repository, replace `--repo-owner` and `--repo-name`.

## Register an Agent

Set the Atlas URL:

```bash
export ATLAS_URL="https://your-atlas-service.run.app"
```

Registering an agent requires a positive credit purchase. Atlas creates the agent sub-account in `pending_payment` status and returns a checkout payload.

```bash
curl -sS -X POST "$ATLAS_URL/agents/register" \
  -H "content-type: application/json" \
  -d '{
    "displayName": "Marketplace Agent",
    "email": "agent@example.com",
    "externalAgentId": "google-marketplace-agent-123",
    "credits": 2500
  }'
```

The response includes:

- `registration.referenceId`: stable Atlas id for the agent
- `agent.agentHash`: cryptographic public agent hash
- `credentials.agentSecret`: secret used to authenticate agent calls
- `checkout`: Samsar checkout/payment payload for the credit purchase

Store `credentials.agentSecret` securely. Atlas stores only its hash.

## Confirm Payment

After the user pays the checkout, poll payment status. Atlas activates the agent when Samsar reports a successful payment.

```bash
export ATLAS_AGENT_ID="<referenceId>"
export ATLAS_AGENT_SECRET="<agentSecret>"

curl -sS "$ATLAS_URL/agents/billing/payment-status" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET"
```

An agent must be `active` before it can start render jobs.

## Buy More Credits

Active agents can create another credit checkout:

```bash
curl -sS -X POST "$ATLAS_URL/agents/billing/recharge" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET" \
  -d '{ "credits": 2500 }'
```

## Start a Text-to-Video Render

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET" \
  -d '{
    "jsonrpc": "2.0",
    "id": "t2v-1",
    "method": "SendMessage",
    "params": {
      "metadata": { "skill": "text_to_video" },
      "message": {
        "role": "ROLE_USER",
        "messageId": "msg-t2v-1",
        "parts": [
          { "text": "Create a cinematic 10 second product launch video." },
          {
            "data": {
              "input": {
                "prompt": "A cinematic product launch video with smooth camera motion, premium lighting, and a clean background.",
                "video_model": "RUNWAYML",
                "aspect_ratio": "16:9"
              }
            }
          }
        ]
      }
    }
  }'
```

## Start an Image-List-to-Video Render

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET" \
  -d '{
    "jsonrpc": "2.0",
    "id": "il2v-1",
    "method": "SendMessage",
    "params": {
      "metadata": { "skill": "image_list_to_video" },
      "message": {
        "role": "ROLE_USER",
        "messageId": "msg-il2v-1",
        "parts": [
          { "text": "Create a product showcase video from these images." },
          {
            "data": {
              "input": {
                "image_urls": [
                  "https://cdn.example.com/image-1.png",
                  "https://cdn.example.com/image-2.png"
                ],
                "prompt": "A polished product showcase with smooth transitions.",
                "video_model": "RUNWAYML",
                "aspect_ratio": "16:9"
              }
            }
          }
        ]
      }
    }
  }'
```

`Authorization: Bearer <agentSecret>` can be used instead of `x-atlas-agent-secret`.

## Poll a Task

`SendMessage` returns an A2A task. Poll the returned task id until it completes:

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET" \
  -d '{
    "jsonrpc": "2.0",
    "id": "status-1",
    "method": "GetTask",
    "params": {
      "id": "<task-id>"
    }
  }'
```

REST-style polling is also available:

```bash
curl -sS "$ATLAS_URL/tasks/<task-id>" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "x-atlas-agent-secret: $ATLAS_AGENT_SECRET"
```

## Protocol Reference

Public endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/agent-card.json` | A2A Agent Card discovery. |
| `GET /.well-known/agent.json` | Alternate Agent Card discovery route. |
| `POST /agents/register` | Register a pending agent and create initial credit checkout. |
| `GET /agents/me` | Fetch authenticated agent profile and billing counters. |
| `POST /agents/rotate-secret` | Rotate authenticated agent secret. |
| `POST /agents/billing/recharge` | Create recharge checkout for an active agent. |
| `GET /agents/billing/payment-status` | Poll payment status and activate paid agents. |
| `POST /a2a` | JSON-RPC A2A endpoint. |
| `POST /message:send` | HTTP+JSON A2A send endpoint. |
| `GET /tasks` | List visible Samsar tasks. |
| `GET /tasks/:id` | Fetch task status. |
| `POST /tasks/:id:cancel` | Cancel task. |
| `POST /tasks/:id/cancel` | Cancel task alias. |
| `GET /health` | Health check. |

Supported JSON-RPC methods:

- `SendMessage`
- `GetTask`
- `ListTasks`
- `CancelTask`
- `GetExtendedAgentCard`

Streaming and push notifications are not advertised. Use `SendMessage` and poll with `GetTask`.

Supported Atlas-managed skills:

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
- `get_credits`
- `create_credits_recharge`
- `get_payment_status`

Atlas injects the authenticated agent sub-account into every Samsar request. A2A callers cannot override `external_user`.

## Security Model

Atlas runs as the Samsar service principal. Connecting agents authenticate to Atlas with Atlas-issued secrets. In production:

- Store `SAMSAR_API_KEY` in Secret Manager.
- Run Cloud Run as a user-managed service account.
- Grant that service account only Secret Manager access to `samsar-api-key` and Firestore access for agent state.
- Treat `referenceId` as a public identifier, not an authentication secret.
- Store `agentSecret` only in the connecting agent or customer-controlled secret store.

## License

Samsar Atlas is released under the [MIT License](LICENSE).
