# Samsar Atlas

Samsar Atlas is a standalone A2A 1.0 wrapper for Samsar Processor v2 routes.

The service exposes an A2A Agent Card and protocol endpoints, then calls Samsar Processor through `samsar-js` v2 methods. It does not call `samsar_processor` routes directly.
The deployment harness is Cloud Run only.

## Endpoints

- `GET /.well-known/agent-card.json`
- `POST /a2a` for JSON-RPC A2A methods
- `POST /message:send` HTTP+JSON alias
- `GET /tasks/:id`
- `GET /tasks`
- `POST /tasks/:id:cancel`
- `GET /health`

Supported JSON-RPC methods:

- `SendMessage`
- `GetTask`
- `ListTasks`
- `CancelTask`
- `GetExtendedAgentCard`

Streaming and push notifications are intentionally not advertised yet. Use `SendMessage` and poll with `GetTask`.

Supported video skills:

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

Supported billing, login, and account skills:

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

## Configuration

Copy `.env.example` and set:

- `PUBLIC_BASE_URL`: public URL for this wrapper. Used in the Agent Card.
- `SAMSAR_API_BASE_URL`: Samsar Processor base URL, for example `https://api.samsar.one` or `http://samsar-processor:3002`.
- Optional service credentials: `SAMSAR_API_KEY`, `SAMSAR_APP_KEY`, `SAMSAR_APP_SECRET`, `SAMSAR_EXTERNAL_USER_API_KEY`.

If service credentials are not configured, the wrapper forwards caller auth headers to `samsar-js`.

## Message Format

Clients must identify the Samsar skill explicitly through `params.metadata.skill`, message metadata, or a data part.

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "SendMessage",
  "params": {
    "metadata": {
      "skill": "image_list_to_video"
    },
    "message": {
      "role": "ROLE_USER",
      "messageId": "msg-1",
      "parts": [
        {
          "text": "Create a product launch ad."
        },
        {
          "data": {
            "input": {
              "image_urls": ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
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

The response is `{ "task": { ... } }`; the task `id` is the Samsar `request_id` / `session_id`. Poll:

```json
{
  "jsonrpc": "2.0",
  "id": "req-2",
  "method": "GetTask",
  "params": {
    "id": "<task-id>"
  }
}
```

Synchronous billing/login skills return a completed A2A task immediately, with the Samsar response in the `samsar-response` data artifact.

Example billing request:

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

Example login request:

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

## Local Development

From the workspace root:

```bash
npm --prefix samsar-js install
npm --prefix samsar-js run build
npm --prefix Samsar-Atlas install
npm --prefix Samsar-Atlas run dev
```

## Docker

Build from the workspace root, not from `Samsar-Atlas`, so the local `samsar-js` dependency is available:

```bash
docker build -f Samsar-Atlas/Dockerfile -t samsar-atlas .
```

Run:

```bash
docker run --rm -p 8080:8080 \
  -e PUBLIC_BASE_URL=http://localhost:8080 \
  -e SAMSAR_API_BASE_URL=https://api.samsar.one \
  -e SAMSAR_API_KEY="$SAMSAR_API_KEY" \
  samsar-atlas
```

## Cloud Run

Build and push an image from the workspace root, so Docker can include the local `samsar-js` package:

```bash
docker build -f Samsar-Atlas/Dockerfile \
  -t us-docker.pkg.dev/PROJECT_ID/REPOSITORY/samsar-atlas:latest .

docker push us-docker.pkg.dev/PROJECT_ID/REPOSITORY/samsar-atlas:latest

gcloud run deploy samsar-atlas \
  --image us-docker.pkg.dev/PROJECT_ID/REPOSITORY/samsar-atlas:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PUBLIC_BASE_URL=https://YOUR_CLOUD_RUN_URL,SAMSAR_API_BASE_URL=https://api.samsar.one
```

For production, store Samsar credentials in Secret Manager and mount them as environment variables.
