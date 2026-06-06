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
  };
}
