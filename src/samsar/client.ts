import type { Request } from "express";
import { SamsarClient, type SamsarRequestOptions } from "samsar-js";
import type { AppConfig } from "../config.js";

const FORWARDED_AUTH_HEADERS = [
  "authorization",
  "api_key",
  "api-key",
  "x-api-key",
  "x-app-secret",
  "x-external-user-api-key",
  "x-customer-sub-account-api-key",
  "x-customer-subaccount-api-key",
  "x-samsar-customer-sub-account-api-key",
  "x-samsar-sub-account-api-key",
] as const;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim())?.trim();
  }
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function createSamsarClient(config: AppConfig): SamsarClient {
  return new SamsarClient({
    apiKey: config.samsarApiKey,
    appKey: config.samsarAppKey,
    appSecret: config.samsarAppSecret,
    externalUserApiKey: config.samsarExternalUserApiKey,
    baseUrl: config.samsarApiBaseUrl,
    timeoutMs: config.samsarRequestTimeoutMs,
  });
}

export function buildSamsarRequestOptions(req: Request): SamsarRequestOptions {
  const headers: Record<string, string> = {};

  for (const name of FORWARDED_AUTH_HEADERS) {
    const value = firstHeaderValue(req.headers[name]);
    if (value) {
      headers[name] = value;
    }
  }

  const requestId = firstHeaderValue(req.headers["x-request-id"]);
  if (requestId) {
    headers["x-request-id"] = requestId;
  }

  return { headers };
}
