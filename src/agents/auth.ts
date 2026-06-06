import type { Request } from "express";
import type { AtlasAgentRecord, AtlasAgentStore } from "./types.js";
import { hashAgentSecret, verifyAgentSecret } from "./crypto.js";

export class AtlasAgentAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AtlasAgentAuthError";
    this.statusCode = statusCode;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim())?.trim();
  }
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  const header = firstHeaderValue(value);
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function extractAgentSecret(req: Request): string | undefined {
  return firstHeaderValue(req.headers["x-atlas-agent-secret"]) || bearerToken(req.headers.authorization);
}

export function extractAgentId(req: Request): string | undefined {
  return firstHeaderValue(req.headers["x-atlas-agent-id"]);
}

export async function authenticateAtlasAgent(
  req: Request,
  store: AtlasAgentStore,
  options: { allowPendingPayment?: boolean } = {},
): Promise<AtlasAgentRecord> {
  const secret = extractAgentSecret(req);
  if (!secret) {
    throw new AtlasAgentAuthError("Atlas agent credentials are required.");
  }

  const agentId = extractAgentId(req);
  const secretHash = hashAgentSecret(secret);
  const agent = agentId ? await store.getAgentById(agentId) : await store.getAgentBySecretHash(secretHash);

  if (!agent || !agent.secretHash || !verifyAgentSecret(secret, agent.secretHash)) {
    throw new AtlasAgentAuthError("Invalid Atlas agent credentials.");
  }

  if (agent.status !== "active" && !(options.allowPendingPayment && agent.status === "pending_payment")) {
    throw new AtlasAgentAuthError("Atlas agent is not active.", 403);
  }

  const lastAuthenticatedAt = new Date().toISOString();
  await store.updateAgent(agent.id, { lastAuthenticatedAt });

  return {
    ...agent,
    lastAuthenticatedAt,
  };
}
