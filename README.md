# Samsar Atlas

Samsar Atlas is an open-source A2A 1.0 gateway for Samsar. It exposes Samsar video, billing, login, and account workflows as a standards-based agent endpoint that other agents can discover and call.

Atlas is designed for a simple operating model: deploy one stateless container to Cloud Run, publish the Agent Card, and let A2A clients invoke Samsar through a clean protocol boundary.

## What Atlas Provides

- **A2A 1.0 compatibility** through JSON-RPC and HTTP+JSON interfaces.
- **Agent Card discovery** at `/.well-known/agent-card.json`.
- **Samsar v2 coverage** for media generation, editing, billing, login, app keys, user credits, usage logs, and external-user registration.
- **Cloud Run deployment** with a small container footprint and no Kubernetes dependency.
- **SDK-based integration** through `samsar-js`; Atlas does not call Samsar Processor internals directly.

## Protocol Surface

Atlas exposes these public endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/agent-card.json` | A2A Agent Card discovery. |
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

Billing, login, and account skills:

- `get_credits`
- `create_credits_recharge`
- `grant_credits`
- `get_payment_status`
- `create_login_token`
- `create_user_recharge_credits`
- `refresh_user_token`
- `create_user_app_key`
- `get_user_app_key`
- `refresh_user_app_key`
- `revoke_user_app_key`
- `get_user_credits`
- `get_user_usage_logs`
- `get_user_payment_status`
- `create_external_user`

Synchronous skills return a completed A2A task immediately, with the Samsar response in the `samsar-response` data artifact. Long-running media skills return a task id that can be polled.

## Quickstart

From the workspace root:

```bash
npm --prefix samsar-js install
npm --prefix samsar-js run build
npm --prefix Samsar-Atlas install
npm --prefix Samsar-Atlas run dev
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
| `SAMSAR_API_KEY` | No | Service API key. If omitted, Atlas forwards caller auth headers. |
| `SAMSAR_APP_KEY` | No | Optional Samsar APP_KEY credential. |
| `SAMSAR_APP_SECRET` | No | Secret paired with `SAMSAR_APP_KEY`. |
| `SAMSAR_EXTERNAL_USER_API_KEY` | No | Optional external-user API key. |
| `SAMSAR_REQUEST_TIMEOUT_MS` | No | Upstream request timeout. Defaults to `60000`. |
| `JSON_BODY_LIMIT` | No | JSON body limit. Defaults to `25mb`. |
| `AGENT_CARD_DOCUMENTATION_URL` | No | Documentation URL included in the Agent Card. |

## Example: Image List to Video

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

## Example: Login Token

```json
{
  "jsonrpc": "2.0",
  "id": "login-1",
  "method": "SendMessage",
  "params": {
    "metadata": {
      "skill": "create_login_token"
    },
    "message": {
      "role": "ROLE_USER",
      "messageId": "msg-login-1",
      "parts": [
        {
          "data": {
            "input": {
              "redirect": "https://example.com/samsar/callback"
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
  samsar-atlas
```

## Deploy to Cloud Run

Recommended APAC region:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"
export REPO="samsar-agents"
export SERVICE="samsar-atlas"
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

Deploy:

```bash
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 80 \
  --timeout 300 \
  --min-instances 1 \
  --max-instances 5 \
  --set-env-vars PUBLIC_BASE_URL=https://placeholder,SAMSAR_API_BASE_URL=https://api.samsar.one,SAMSAR_REQUEST_TIMEOUT_MS=60000,JSON_BODY_LIMIT=25mb
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

Atlas can run in two modes:

- **Forwarded credentials:** callers send Samsar auth headers and Atlas forwards them upstream.
- **Service credentials:** Atlas is configured with a Samsar API key or app key and acts as the service principal.

For public demos, prefer forwarded credentials or a limited test key. If `--allow-unauthenticated` is enabled and `SAMSAR_API_KEY` is configured, public callers may consume that key's credits.

For production, store credentials in Secret Manager and mount them as environment variables.

## License

Samsar Atlas is released under the [MIT License](LICENSE).
