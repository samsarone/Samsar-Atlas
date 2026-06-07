export interface AppConfig {
  port: number;
  publicBaseUrl: string;
  samsarApiBaseUrl: string;
  samsarApiKey: string;
  samsarRequestTimeoutMs: number;
  jsonBodyLimit: string;
  documentationUrl?: string;
  agentProvider: string;
  agentSecretBytes: number;
  stateBackend: "firestore" | "memory";
  firestoreProjectId?: string;
  firestoreDatabaseId?: string;
  firestoreAgentCollection: string;
  demoStorefrontProxyEnabled: boolean;
  demoStorefrontAgentId?: string;
  demoStorefrontAgentSecret?: string;
  demoStorefrontAdminUsername?: string;
  demoStorefrontAdminPassword?: string;
  demoStorefrontAdminSessionSecret?: string;
  demoStorefrontVideoCollection: string;
  demoStorefrontAdminSessionTtlSeconds: number;
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readBoolean(value: string | undefined, fallback = false): boolean {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function loadConfig(): AppConfig {
  const publicBaseUrl = trimTrailingSlash(
    optionalString(process.env.PUBLIC_BASE_URL) || `http://localhost:${process.env.PORT || 8080}`,
  );
  const samsarApiBaseUrl = trimTrailingSlash(
    optionalString(process.env.SAMSAR_API_BASE_URL) || "https://api.samsar.one",
  );
  const samsarApiKey = optionalString(process.env.SAMSAR_API_KEY);

  if (!samsarApiKey) {
    throw new Error("SAMSAR_API_KEY is required. Atlas uses one platform API key and issues its own per-agent credentials.");
  }

  const configuredStateBackend = optionalString(process.env.ATLAS_STATE_BACKEND);
  const stateBackend =
    configuredStateBackend === "memory" || configuredStateBackend === "firestore"
      ? configuredStateBackend
      : process.env.NODE_ENV === "production"
        ? "firestore"
        : "memory";

  return {
    port: readInteger(process.env.PORT, 8080),
    publicBaseUrl,
    samsarApiBaseUrl,
    samsarApiKey,
    samsarRequestTimeoutMs: readInteger(process.env.SAMSAR_REQUEST_TIMEOUT_MS, 60000),
    jsonBodyLimit: optionalString(process.env.JSON_BODY_LIMIT) || "25mb",
    documentationUrl: optionalString(process.env.AGENT_CARD_DOCUMENTATION_URL),
    agentProvider: optionalString(process.env.ATLAS_AGENT_PROVIDER) || "samsar-atlas",
    agentSecretBytes: readPositiveInteger(process.env.ATLAS_AGENT_SECRET_BYTES, 32),
    stateBackend,
    firestoreProjectId: optionalString(process.env.GOOGLE_CLOUD_PROJECT) || optionalString(process.env.GCLOUD_PROJECT),
    firestoreDatabaseId: optionalString(process.env.FIRESTORE_DATABASE_ID),
    firestoreAgentCollection: optionalString(process.env.FIRESTORE_AGENT_COLLECTION) || "samsar_atlas_agents",
    demoStorefrontProxyEnabled: readBoolean(process.env.DEMO_STOREFRONT_PROXY_ENABLED),
    demoStorefrontAgentId: optionalString(process.env.DEMO_STOREFRONT_AGENT_ID),
    demoStorefrontAgentSecret: optionalString(process.env.DEMO_STOREFRONT_AGENT_SECRET),
    demoStorefrontAdminUsername: optionalString(process.env.DEMO_STOREFRONT_ADMIN_USERNAME),
    demoStorefrontAdminPassword: optionalString(process.env.DEMO_STOREFRONT_ADMIN_PASSWORD),
    demoStorefrontAdminSessionSecret: optionalString(process.env.DEMO_STOREFRONT_ADMIN_SESSION_SECRET),
    demoStorefrontVideoCollection:
      optionalString(process.env.DEMO_STOREFRONT_VIDEO_COLLECTION) || "atlas_demo_product_videos",
    demoStorefrontAdminSessionTtlSeconds: readPositiveInteger(
      process.env.DEMO_STOREFRONT_ADMIN_SESSION_TTL_SECONDS,
      60 * 60 * 12,
    ),
  };
}
