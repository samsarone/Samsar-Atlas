import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import type { Request, Response, Router } from "express";
import express from "express";
import type { SamsarClient, V2RequestOptions } from "samsar-js";
import type { AppConfig } from "../config.js";
import { recordPaymentAccounting, recordTaskAccounting } from "../agents/accounting.js";
import type { AtlasAgentRecord, AtlasAgentStore } from "../agents/types.js";
import { toPublicAgent } from "../agents/types.js";
import { verifyAgentSecret } from "../agents/crypto.js";
import { buildSamsarRequestOptions } from "../samsar/client.js";
import { getTask, sendMessage } from "../a2a/adapter.js";
import { asParams, errorToJsonRpc, isJsonRpcRequest, jsonRpcError, jsonRpcSuccess } from "../a2a/json-rpc.js";
import type { JsonObject, JsonRpcRequest, MessageSendParams, TaskQueryParams } from "../a2a/types.js";

const localProductVideos = new Map<string, JsonObject>();
let firestoreClient: Firestore | undefined;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string" && item.trim())?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function statusFromError(error: unknown): number {
  return error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
}

function sendRouteError(res: Response, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Internal server error.";
  return res.status(statusFromError(error)).json({ message });
}

function safePaymentPayload(input: JsonObject): JsonObject {
  return {
    checkoutSessionId: getString(input.checkoutSessionId) || getString(input.checkout_session_id),
    paymentIntentId: getString(input.paymentIntentId) || getString(input.payment_intent_id),
    setupIntentId: getString(input.setupIntentId) || getString(input.setup_intent_id),
    external_payment_id: getString(input.external_payment_id) || getString(input.externalPaymentId),
  };
}

function hasPaymentReference(input: JsonObject): boolean {
  return Boolean(
    getString(input.checkoutSessionId) ||
      getString(input.checkout_session_id) ||
      getString(input.paymentIntentId) ||
      getString(input.payment_intent_id) ||
      getString(input.setupIntentId) ||
      getString(input.setup_intent_id) ||
      getString(input.external_payment_id) ||
      getString(input.externalPaymentId),
  );
}

function paymentSucceeded(payload: JsonObject): boolean {
  const status =
    getString(payload.status) ||
    getString(payload.paymentStatus) ||
    getString(payload.payment_status) ||
    getString(payload.checkoutStatus) ||
    getString(payload.checkout_status);

  return Boolean(status && ["paid", "complete", "completed", "succeeded", "success"].includes(status.toLowerCase()));
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function adminAuthUnavailable(config: AppConfig): string | undefined {
  if (!config.demoStorefrontAdminUsername || !config.demoStorefrontAdminPassword) {
    return "Demo storefront admin credentials are not configured.";
  }
  if (!config.demoStorefrontAdminSessionSecret) {
    return "Demo storefront admin session secret is not configured.";
  }
  return undefined;
}

function signAdminToken(config: AppConfig, username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    sub: username,
    scope: "demo-storefront-admin",
    iat: now,
    exp: now + config.demoStorefrontAdminSessionTtlSeconds,
    nonce: randomBytes(8).toString("hex"),
  }));
  const signature = createHmac("sha256", config.demoStorefrontAdminSessionSecret as string)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyAdminToken(config: AppConfig, token: string): JsonObject | undefined {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature || !config.demoStorefrontAdminSessionSecret) {
    return undefined;
  }

  const expectedSignature = createHmac("sha256", config.demoStorefrontAdminSessionSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as JsonObject;
    const expiresAt = typeof parsed.exp === "number" ? parsed.exp : 0;
    const username = getString(parsed.sub);
    const scope = getString(parsed.scope);
    if (!username || !config.demoStorefrontAdminUsername || username !== config.demoStorefrontAdminUsername) {
      return undefined;
    }
    if (scope !== "demo-storefront-admin" || expiresAt <= Math.floor(Date.now() / 1000)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function bearerToken(req: Request): string | undefined {
  const authHeader = firstValue(req.headers.authorization);
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function requireDemoAdmin(req: Request, config: AppConfig): JsonObject {
  const unavailable = adminAuthUnavailable(config);
  if (unavailable) {
    const error = new Error(unavailable);
    (error as Error & { statusCode: number }).statusCode = 503;
    throw error;
  }

  const payload = verifyAdminToken(config, bearerToken(req) || "");
  if (!payload) {
    const error = new Error("Demo storefront admin authentication is required.");
    (error as Error & { statusCode: number }).statusCode = 401;
    throw error;
  }
  return payload;
}

function getFirestoreClient(config: AppConfig): Firestore {
  if (!firestoreClient) {
    firestoreClient = new Firestore({
      projectId: config.firestoreProjectId,
      databaseId: config.firestoreDatabaseId,
    });
  }
  return firestoreClient;
}

function productVideoCollection(config: AppConfig) {
  return getFirestoreClient(config).collection(config.demoStorefrontVideoCollection);
}

async function listProductVideoState(config: AppConfig): Promise<Record<string, JsonObject>> {
  if (config.stateBackend !== "firestore") {
    return Object.fromEntries(localProductVideos.entries());
  }

  const snapshot = await productVideoCollection(config).get();
  const output: Record<string, JsonObject> = {};
  snapshot.forEach((doc) => {
    output[doc.id] = doc.data() as JsonObject;
  });
  return output;
}

async function saveProductVideoState(config: AppConfig, productId: string, payload: JsonObject): Promise<JsonObject> {
  const state = {
    ...payload,
    productId,
    updatedAt: new Date().toISOString(),
  };

  if (config.stateBackend !== "firestore") {
    localProductVideos.set(productId, state);
    return state;
  }

  await productVideoCollection(config).doc(productId).set(state, { merge: true });
  return state;
}

function demoProxyUnavailable(config: AppConfig): string | undefined {
  if (!config.demoStorefrontProxyEnabled) {
    return "Demo storefront proxy is not enabled.";
  }
  if (!config.demoStorefrontAgentId || !config.demoStorefrontAgentSecret) {
    return "Demo storefront agent credentials are not configured.";
  }
  return undefined;
}

async function authenticateDemoAgent(
  config: AppConfig,
  store: AtlasAgentStore,
  options: { allowPendingPayment?: boolean } = {},
): Promise<AtlasAgentRecord> {
  const unavailable = demoProxyUnavailable(config);
  if (unavailable) {
    const error = new Error(unavailable);
    (error as Error & { statusCode: number }).statusCode = 503;
    throw error;
  }

  const agent = await store.getAgentById(config.demoStorefrontAgentId as string);
  if (!agent || !verifyAgentSecret(config.demoStorefrontAgentSecret as string, agent.secretHash)) {
    const error = new Error("Configured demo storefront agent credentials are invalid.");
    (error as Error & { statusCode: number }).statusCode = 503;
    throw error;
  }

  if (agent.status !== "active" && !(options.allowPendingPayment && agent.status === "pending_payment")) {
    const error = new Error("Configured demo storefront agent is not active.");
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }

  const lastAuthenticatedAt = new Date().toISOString();
  await store.updateAgent(agent.id, { lastAuthenticatedAt });
  return {
    ...agent,
    lastAuthenticatedAt,
  };
}

function mergeOptions(req: Request, agent: AtlasAgentRecord, overrides: Partial<V2RequestOptions> = {}): V2RequestOptions {
  const baseOptions = buildSamsarRequestOptions(req);
  return {
    ...baseOptions,
    externalUser: agent.externalUser,
    ...overrides,
    headers: {
      ...(baseOptions.headers ?? {}),
      ...(overrides.headers ?? {}),
    },
  };
}

function normalizedSkill(params: MessageSendParams): string | undefined {
  const metadata = isObject(params.metadata) ? params.metadata : {};
  const messageMetadata = isObject(params.message?.metadata) ? params.message.metadata : {};
  const dataParts = Array.isArray(params.message?.parts)
    ? params.message.parts
        .filter((part) => isObject(part) && "data" in part && isObject((part as { data?: unknown }).data))
        .map((part) => (part as { data: JsonObject }).data)
    : [];
  const inputParts = dataParts.map((part) => (isObject(part.input) ? part.input : part));
  const raw =
    getString(metadata.skill) ||
    getString(metadata.samsar_skill) ||
    getString(metadata.route) ||
    getString(messageMetadata.skill) ||
    getString(messageMetadata.samsar_skill) ||
    dataParts.map((part) => getString(part.skill) || getString(part.samsar_skill) || getString(part.route)).find(Boolean) ||
    inputParts.map((part) => getString(part.skill) || getString(part.samsar_skill) || getString(part.route)).find(Boolean);

  return raw?.replace(/[./-]/g, "_").toLowerCase();
}

function isAllowedSendMessage(params: MessageSendParams): boolean {
  const skill = normalizedSkill(params);
  return skill === "image_list_to_video" || skill === "create_video_from_image_list" || skill === "image_to_video";
}

async function dispatchDemoJsonRpc(
  config: AppConfig,
  client: SamsarClient,
  store: AtlasAgentStore,
  req: Request,
  rpc: JsonRpcRequest,
) {
  const params = asParams(rpc.params);

  switch (rpc.method) {
    case "SendMessage": {
      const messageParams = params as unknown as MessageSendParams;
      if (!isAllowedSendMessage(messageParams)) {
        return jsonRpcError(rpc.id, -32602, "Demo storefront proxy only permits image_list_to_video SendMessage requests.");
      }
      const agent = await authenticateDemoAgent(config, store);
      const task = await sendMessage(client, messageParams, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "demo_storefront_send_message");
      return jsonRpcSuccess(rpc.id, { task });
    }
    case "GetTask": {
      const agent = await authenticateDemoAgent(config, store, { allowPendingPayment: true });
      const task = await getTask(client, params as TaskQueryParams, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "demo_storefront_get_task");
      return jsonRpcSuccess(rpc.id, { task });
    }
    default:
      return jsonRpcError(rpc.id, -32601, `Demo storefront proxy does not support A2A method: ${rpc.method}`);
  }
}

export function createDemoStorefrontRouter(config: AppConfig, client: SamsarClient, store: AtlasAgentStore): Router {
  const router = express.Router();

  router.get("/demo/storefront/config", (_req, res) => {
    res.status(200).json({
      enabled: config.demoStorefrontProxyEnabled,
      configured: Boolean(config.demoStorefrontAgentId && config.demoStorefrontAgentSecret),
      agentId: config.demoStorefrontAgentId || null,
      adminConfigured: Boolean(
        config.demoStorefrontAdminUsername &&
          config.demoStorefrontAdminPassword &&
          config.demoStorefrontAdminSessionSecret,
      ),
    });
  });

  router.post("/demo/storefront/admin/login", (req, res) => {
    try {
      const unavailable = adminAuthUnavailable(config);
      if (unavailable) {
        return res.status(503).json({ message: unavailable });
      }

      const input = isObject(req.body) ? req.body : {};
      const username = getString(input.username);
      const password = getString(input.password);
      const valid =
        Boolean(username && password) &&
        timingSafeStringEqual(username as string, config.demoStorefrontAdminUsername as string) &&
        timingSafeStringEqual(password as string, config.demoStorefrontAdminPassword as string);

      if (!valid) {
        return res.status(401).json({ message: "Invalid demo storefront admin credentials." });
      }

      return res.status(200).json({
        token: signAdminToken(config, username as string),
        expiresIn: config.demoStorefrontAdminSessionTtlSeconds,
        username,
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/demo/storefront/admin/me", (req, res) => {
    try {
      const session = requireDemoAdmin(req, config);
      return res.status(200).json({
        username: session.sub,
        exp: session.exp,
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/demo/storefront/product-videos", async (_req, res) => {
    try {
      return res.status(200).json(await listProductVideoState(config));
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.put("/demo/storefront/product-videos/:productId", async (req, res) => {
    try {
      requireDemoAdmin(req, config);
      const body = isObject(req.body) ? req.body : {};
      return res.status(200).json(await saveProductVideoState(config, req.params.productId, body));
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/demo/storefront/agent", async (_req, res) => {
    try {
      requireDemoAdmin(_req, config);
      const agent = await authenticateDemoAgent(config, store, { allowPendingPayment: true });
      return res.status(200).json({ agent: toPublicAgent(agent) });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/demo/storefront/a2a", async (req, res) => {
    try {
      requireDemoAdmin(req, config);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(req.body?.id, error));
    }

    if (!isJsonRpcRequest(req.body)) {
      return res.status(400).json(jsonRpcError(null, -32600, "Invalid JSON-RPC 2.0 A2A request."));
    }

    try {
      const response = await dispatchDemoJsonRpc(config, client, store, req, req.body);
      return res.status("error" in response ? 400 : 200).json(response);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(req.body.id, error));
    }
  });

  router.get("/demo/storefront/tasks/:id", async (req, res) => {
    try {
      requireDemoAdmin(req, config);
      const agent = await authenticateDemoAgent(config, store, { allowPendingPayment: true });
      const task = await getTask(client, { id: req.params.id }, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "demo_storefront_get_task");
      return res.status(200).json(task);
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/demo/storefront/recharge", async (req, res) => {
    try {
      requireDemoAdmin(req, config);
      const agent = await authenticateDemoAgent(config, store);
      const input = isObject(req.body) ? req.body : {};
      const credits = getNumber(input.credits ?? input.credits_to_recharge ?? input.creditsToRecharge);
      if (!credits || credits <= 0 || !Number.isInteger(credits)) {
        return res.status(400).json({ message: "credits must be a positive integer." });
      }

      const response = await client.createV2CreditsRecharge(
        {
          ...input,
          credits,
        } as never,
        { externalUser: agent.externalUser },
      );
      await recordPaymentAccounting(store, agent, response.data as JsonObject);

      return res.status(200).json(response.data);
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/demo/storefront/payment-status", async (req, res) => {
    try {
      requireDemoAdmin(req, config);
      const agent = await authenticateDemoAgent(config, store, { allowPendingPayment: true });
      const requestedPayment = safePaymentPayload(req.query as JsonObject);
      const storedPayment = {
        checkoutSessionId: agent.registrationCheckoutSessionId,
        external_payment_id: agent.registrationPaymentId,
      };
      const response = await client.getV2PaymentStatus(
        (hasPaymentReference(requestedPayment) ? requestedPayment : storedPayment) as never,
        { externalUser: agent.externalUser },
      );
      await recordPaymentAccounting(store, agent, response.data as JsonObject);
      const paymentPayload = response.data as JsonObject;
      const activatedAt = new Date().toISOString();
      const updatedAgent =
        agent.status === "pending_payment" && paymentSucceeded(paymentPayload)
          ? {
              ...agent,
              status: "active" as const,
              activatedAt,
              updatedAt: activatedAt,
            }
          : agent;

      if (updatedAgent !== agent) {
        await store.updateAgent(agent.id, {
          status: "active",
          activatedAt,
          updatedAt: activatedAt,
        });
      }

      return res.status(200).json({
        ...response.data,
        agent: toPublicAgent(updatedAgent),
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  return router;
}
