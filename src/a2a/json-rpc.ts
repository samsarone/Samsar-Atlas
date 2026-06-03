import { SamsarRequestError } from "samsar-js";
import type { JsonObject, JsonRpcErrorResponse, JsonRpcId, JsonRpcRequest, JsonRpcResponse } from "./types.js";

export const JSON_RPC_VERSION = "2.0";

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as JsonRpcRequest).jsonrpc === JSON_RPC_VERSION &&
      typeof (value as JsonRpcRequest).method === "string",
  );
}

export function jsonRpcSuccess<T>(id: JsonRpcId | undefined, result: T): JsonRpcResponse<T> {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    result,
  };
}

export function jsonRpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

function statusToJsonRpcCode(status: number | undefined): number {
  if (status === 400) {
    return -32602;
  }
  if (status === 401 || status === 403) {
    return -32001;
  }
  if (status === 404) {
    return -32004;
  }
  if (status === 402) {
    return -32002;
  }
  return -32000;
}

export function errorToJsonRpc(id: JsonRpcId | undefined, error: unknown): JsonRpcErrorResponse {
  if (error instanceof SamsarRequestError) {
    return jsonRpcError(id, statusToJsonRpcCode(error.status), error.message, {
      status: error.status,
      body: error.body,
      headers: error.headers,
      url: error.url,
      creditsCharged: error.creditsCharged,
      creditsRemaining: error.creditsRemaining,
    });
  }

  if (error instanceof Error) {
    return jsonRpcError(id, -32602, error.message);
  }

  return jsonRpcError(id, -32000, "Internal A2A wrapper error.", error);
}

export function asParams(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
