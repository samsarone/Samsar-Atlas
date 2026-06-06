import type { Request } from "express";
import { SamsarClient, type SamsarRequestOptions } from "samsar-js";
import type { AppConfig } from "../config.js";

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
    baseUrl: config.samsarApiBaseUrl,
    timeoutMs: config.samsarRequestTimeoutMs,
  });
}

export function buildSamsarRequestOptions(req: Request): SamsarRequestOptions {
  const headers: Record<string, string> = {};

  const requestId = firstHeaderValue(req.headers["x-request-id"]);
  if (requestId) {
    headers["x-request-id"] = requestId;
  }

  return { headers };
}
