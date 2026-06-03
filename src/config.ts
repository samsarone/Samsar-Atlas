export interface AppConfig {
  port: number;
  publicBaseUrl: string;
  samsarApiBaseUrl: string;
  samsarApiKey?: string;
  samsarAppKey?: string;
  samsarAppSecret?: string;
  samsarExternalUserApiKey?: string;
  samsarRequestTimeoutMs: number;
  jsonBodyLimit: string;
  documentationUrl?: string;
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
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

  return {
    port: readInteger(process.env.PORT, 8080),
    publicBaseUrl,
    samsarApiBaseUrl,
    samsarApiKey: optionalString(process.env.SAMSAR_API_KEY),
    samsarAppKey: optionalString(process.env.SAMSAR_APP_KEY),
    samsarAppSecret: optionalString(process.env.SAMSAR_APP_SECRET),
    samsarExternalUserApiKey: optionalString(process.env.SAMSAR_EXTERNAL_USER_API_KEY),
    samsarRequestTimeoutMs: readInteger(process.env.SAMSAR_REQUEST_TIMEOUT_MS, 60000),
    jsonBodyLimit: optionalString(process.env.JSON_BODY_LIMIT) || "25mb",
    documentationUrl: optionalString(process.env.AGENT_CARD_DOCUMENTATION_URL),
  };
}
