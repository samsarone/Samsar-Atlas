# Atlas Sample Storefront

Small Vite/Firebase demo storefront for Samsar Atlas A2A image-list-to-video.

Production uses a secure same-origin backend proxy at `/demo/storefront/*`.
The Firebase bundle never contains the Atlas demo agent secret. Admin-only
actions log in against Cloud Run, receive a short-lived signed session token,
and then call the proxy to render videos, buy credits, check payment status, and
write shared product video state.

## Run locally

```bash
npm install
npm run dev
```

Local dev proxies `/a2a`, `/tasks`, `/agents`, and `/.well-known` to `http://127.0.0.1:8080` unless `VITE_ATLAS_PROXY_TARGET` is overridden.

## Configure

Copy `.env.example` to `.env.local` for local development.

By default the app uses:

- `VITE_DEMO_PROXY_BASE_URL=/demo/storefront`
- `VITE_USE_DEMO_PROXY=true`
- `VITE_USE_FIREBASE_CLIENT_STATE=false`

Direct Atlas credentials are only for local/direct-agent testing. Do not put
production `agentSecret` values in `VITE_*` variables for Firebase Hosting.

## Deploy

Use the Atlas deployment script from the repository root:

```bash
./scripts/deploy_google_cloud_run.sh
```

The script deploys the Atlas Cloud Run service, provisions Secret Manager
secrets for the hosted demo agent/admin session, builds this Vite client, and
deploys Firebase Hosting plus Firestore rules to the same Google Cloud project.

The first run creates an Atlas demo agent and prints an initial checkout URL.
Complete that checkout, then log in to Admin with the printed admin username and
password and use Payment to activate the agent state. Later deploys reuse the
stored demo agent secret and Cloud Run `DEMO_STOREFRONT_AGENT_ID`.

Firestore rules allow public reads of rendered product video state but deny
client writes. The Cloud Run proxy writes state with service-account IAM after
admin authentication.
