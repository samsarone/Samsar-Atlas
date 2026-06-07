# Samsar Atlas

Samsar Atlas is a Cloud Run-ready A2A gateway for Samsar video generation. It lets external agents register, buy credits, authenticate with Atlas-issued credentials, and start Samsar video workflows through a standard A2A endpoint.

Atlas is built for enterprise agent deployments:

- Public A2A discovery through `/.well-known/agent-card.json`
- Self-service agent registration through credit purchase
- Per-agent reference ids, cryptographic agent hashes, and secrets
- Firestore-backed sub-account state, billing counters, and request accounting
- Cloud Run deployment with Secret Manager for the Samsar platform API key

## Integration Flow

1. Deploy Atlas to Google Cloud Run.
2. Store `SAMSAR_API_KEY` in Google Secret Manager.
3. Let each connecting agent call `/agents/register` with the credits it wants to buy.
4. Return the Atlas `referenceId`, `agentSecret`, and checkout payload to that agent.
5. After payment succeeds, the agent uses its secret to start A2A render jobs and poll task status.

The `referenceId` is a stable public handle. It is not a credential. The `agentSecret` is the credential and is only returned when the agent is registered or when the secret is rotated.

## Hosted Endpoint

After deployment, use the Cloud Run URL printed by the deployment script:

```bash
export ATLAS_URL="https://your-samsar-atlas-service-url"
```

Use this URL to register agents, confirm payment, buy credits, and send A2A render requests.

## Requirements

- Node.js 20
- A Samsar API key for the Atlas backend service
- Google Cloud project with Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and Firestore
- A user-managed Cloud Run service account with access to Secret Manager and Firestore

## Configuration

Copy `.env.example` for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | Production | Public Atlas URL used in the Agent Card. Defaults to localhost for development. |
| `SAMSAR_API_BASE_URL` | No | Samsar API base URL. Defaults to `https://api.samsar.one`. |
| `SAMSAR_API_KEY` | Yes | Backend Samsar API key read by Atlas at runtime. |
| `ATLAS_STATE_BACKEND` | No | `firestore` for production, `memory` for local development. |
| `GOOGLE_CLOUD_PROJECT` | Firestore | Google Cloud project used by Firestore. Usually inferred on Cloud Run. |
| `FIRESTORE_AGENT_COLLECTION` | No | Firestore collection for agent state. Defaults to `samsar_atlas_agents`. |
| `ATLAS_AGENT_PROVIDER` | No | Provider name for Samsar external-user attribution. Defaults to `samsar-atlas`. |
| `ATLAS_AGENT_SECRET_BYTES` | No | Random byte length for generated agent secrets. Defaults to `32`. |
| `DEMO_STOREFRONT_PROXY_ENABLED` | No | Enables the secure proxy used by the Firebase sample storefront. Defaults to `true` in the deploy script. |
| `DEMO_STOREFRONT_AGENT_ID` | Sample | Hosted demo agent id used by the storefront proxy. The deploy script bootstraps this when omitted. |
| `DEMO_STOREFRONT_AGENT_SECRET` | Sample secret | Hosted demo agent secret. Store in Secret Manager, not in Firebase/Vite env. |
| `DEMO_STOREFRONT_ADMIN_USERNAME` | Sample | Admin username for the sample storefront. Defaults to `admin`. |
| `DEMO_STOREFRONT_ADMIN_PASSWORD` | Sample secret | Admin password for the sample storefront. The deploy script generates/stores this in Secret Manager when omitted. |
| `DEMO_STOREFRONT_ADMIN_SESSION_SECRET` | Sample secret | HMAC signing key for short-lived sample admin sessions. Generated/stored by the deploy script when omitted. |
| `DEMO_STOREFRONT_VIDEO_COLLECTION` | No | Firestore collection for sample product video state. Defaults to `atlas_demo_product_videos`. |
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

## Deploy to Cloud Run and Firebase

The deployment script builds the container, pushes it to Artifact Registry, creates or updates the `samsar-api-key` secret, prepares Firestore/IAM, deploys Cloud Run, and verifies `/health`.
By default it also deploys the sample Firebase storefront, provisions secure demo admin credentials in Secret Manager, and bootstraps the hosted demo Atlas agent when one is not already configured.

```bash
PROJECT_ID="your-gcp-project-id" \
REGION="asia-southeast1" \
SAMSAR_API_KEY="$SAMSAR_API_KEY" \
./scripts/deploy_google_cloud_run.sh
```

You can also set `ENV_FILE=/path/to/.env.production` when the production `SAMSAR_API_KEY` and overrides are stored in a file.
By default the script fetches `origin` and deploys a clean archive of the latest remote default branch, falling back to `origin/main` or `origin/master`.
Set `DEPLOY_GIT_REF=origin/main` or `DEPLOY_GIT_REF=origin/master` to pin the remote branch; set `DEPLOY_FROM_GIT=false` only when intentionally deploying the current local checkout.
Set `DEPLOY_SAMPLE_STOREFRONT=false` to deploy only the Atlas A2A server.
The storefront admin username and Secret Manager lookup command are printed at the end of the script.
The password is stored in Secret Manager as `demo-storefront-admin-password`; the hosted demo agent secret is stored separately as `demo-storefront-agent-secret` and is never embedded into the Firebase bundle.

`cloudbuild.yaml` intentionally only builds and pushes the container image. It does not contain production project ids, service URLs, service accounts, or secret names.
For full Atlas plus Firebase deployment from CI, run `scripts/deploy_google_cloud_run.sh` from a protected job with `PROJECT_ID` and `SAMSAR_API_KEY` injected as CI secrets.
For an image-only Cloud Build trigger:

```bash
gcloud builds triggers create github \
  --project "$PROJECT_ID" \
  --name=samsar-atlas-main-deploy \
  --repo-owner=samsarone \
  --repo-name=Samsar-Atlas \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --substitutions="_IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/samsar-agents/samsar-atlas:latest" \
  --service-account="projects/$PROJECT_ID/serviceAccounts/<cloud-build-service-account-email>"
```

Google Cloud must be authorized to access the GitHub repository before the trigger can be created. If you fork the repository, replace `--repo-owner` and `--repo-name`.

## Register an Agent

Set the Atlas URL from the deployment output:

```bash
export ATLAS_URL="https://your-samsar-atlas-service-url"
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

For text-to-video, send `prompt` and `duration`. Optional fields include `video_model`, `generate_outro_image`, `cta_url`, `cta_text_top`, and `cta_text_bottom`.

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET" \
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
          {
            "kind": "data",
            "data": {
              "input": {
                "prompt": "A cinematic product launch video with smooth camera motion, premium lighting, and a clean background.",
                "duration": 10,
                "generate_outro_image": true,
                "cta_url": "https://app.samsar.one",
                "cta_text_top": "CREATE YOUR NEXT VIDEO",
                "cta_text_bottom": "Start rendering with Samsar"
              }
            }
          }
        ]
      }
    }
  }'
```

Minimal copy-paste version:

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET" \
  -d '{"jsonrpc":"2.0","id":"t2v-10s-1","method":"SendMessage","params":{"metadata":{"skill":"text_to_video"},"message":{"role":"ROLE_USER","messageId":"msg-t2v-10s-1","parts":[{"kind":"data","data":{"input":{"prompt":"Create a cinematic product launch video for a new GPU line with premium lighting and smooth camera motion.","duration":10}}}]}}}'
```

## Start an Image-List-to-Video Render

For image-list-to-video, send `image_urls`. Optional fields include `prompt`, `metadata`, `video_model`, `generate_outro_image`, `cta_url`, `cta_text_top`, and `cta_text_bottom`.

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET" \
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
          {
            "kind": "data",
            "data": {
              "input": {
                "image_urls": [
                  "https://cdn.example.com/image-1.png",
                  "https://cdn.example.com/image-2.png"
                ],
                "prompt": "A polished product showcase with smooth transitions.",
                "metadata": {
                  "campaign": "spring-launch",
                  "style": "premium product showcase"
                },
                "generate_outro_image": true,
                "cta_url": "https://app.samsar.one",
                "cta_text_top": "EXPLORE THE COLLECTION",
                "cta_text_bottom": "Built with Samsar"
              }
            }
          }
        ]
      }
    }
  }'
```

Use `video_model: "VEO3.1"` only when you need the non-fast render path. The default is optimized for faster generation.

## Poll a Task

`SendMessage` returns an A2A task. Poll the returned task id until it completes:

```bash
curl -sS -X POST "$ATLAS_URL/a2a" \
  -H "content-type: application/json" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET" \
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
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET"
```

Atlas stores submitted task ids, Samsar request ids, and Samsar session ids in the authenticated agent's state record. `GetTask`, REST task polling, and cancel requests can use any of those ids. To list the tasks Atlas has recorded for the current agent:

```bash
curl -sS "$ATLAS_URL/tasks?limit=25" \
  -H "x-atlas-agent-id: $ATLAS_AGENT_ID" \
  -H "Authorization: Bearer $ATLAS_AGENT_SECRET"
```

The initial submit response may show `creditsCharged: 0` while the render is queued. Poll the task to see the latest Samsar status and any final charge metadata returned by Samsar.

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

Atlas assigns each request to the authenticated agent sub-account.

For A2A video generation, client payloads do not need Samsar model/provider settings. Atlas enforces these project defaults internally:

- Image model: NanoBanana Pro
- Inference model: Gemini 3.1 Pro
- Video model: `VEO3.1FAST` by default, with optional `video_model: "VEO3.1"`
- Backing track: Lyria3
- Text to speech: Google TTS

## Security Model

Atlas uses one backend Samsar credential and issues separate Atlas credentials to connecting agents. In production:

- Store `SAMSAR_API_KEY` in Secret Manager.
- Run Cloud Run as a user-managed service account.
- Grant that service account only Secret Manager access to `samsar-api-key` and Firestore access for agent state.
- Treat `referenceId` as a public identifier, not an authentication secret.
- Store `agentSecret` only in the connecting agent or customer-controlled secret store.
- For the Firebase sample storefront, keep the hosted demo `agentSecret` and admin password in Secret Manager. The static client only receives a short-lived admin session token after login and can only render through `/demo/storefront/*`.

## License

Samsar Atlas is released under the [MIT License](LICENSE).
