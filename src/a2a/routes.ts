import type { Request, Response, Router } from "express";
import express from "express";
import type { SamsarClient, V2RequestOptions } from "samsar-js";
import type { AppConfig } from "../config.js";
import { authenticateAtlasAgent } from "../agents/auth.js";
import { recordTaskAccounting } from "../agents/accounting.js";
import type { AtlasAgentRecord, AtlasAgentStore } from "../agents/types.js";
import { buildSamsarRequestOptions } from "../samsar/client.js";
import { buildAgentCard } from "./agent-card.js";
import { cancelTask, getTask, listTasks, sendMessage } from "./adapter.js";
import { asParams, errorToJsonRpc, isJsonRpcRequest, jsonRpcError, jsonRpcSuccess } from "./json-rpc.js";
import type { JsonObject, JsonRpcRequest, MessageSendParams, TaskQueryParams } from "./types.js";

const SUPPORTED_A2A_VERSIONS = new Set(["1.0", "1.0.0"]);

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

function statusFromError(error: unknown): number {
  return error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
}

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string" && item.trim())?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requestedA2AVersion(req: Request): string | undefined {
  return firstValue(req.headers["a2a-version"]) || firstValue(req.query["A2A-Version"]) || firstValue(req.query.a2aVersion);
}

function unsupportedA2AVersion(req: Request): string | undefined {
  const version = requestedA2AVersion(req);
  return version && !SUPPORTED_A2A_VERSIONS.has(version) ? version : undefined;
}

function sendUnsupportedVersion(res: Response, version: string): Response {
  return res.status(400).type("application/problem+json").json({
    type: "https://a2a-protocol.org/errors/version-not-supported",
    title: "A2A version not supported",
    status: 400,
    detail: `Unsupported A2A-Version: ${version}`,
    supportedVersions: Array.from(SUPPORTED_A2A_VERSIONS),
  });
}

async function dispatchJsonRpc(client: SamsarClient, store: AtlasAgentStore, req: Request, rpc: JsonRpcRequest) {
  const params = asParams(rpc.params);

  switch (rpc.method) {
    case "GetExtendedAgentCard":
      return jsonRpcSuccess(rpc.id, buildAgentCard(req.app.locals.config as AppConfig));
    case "SendStreamingMessage":
    case "SubscribeToTask":
      return jsonRpcError(rpc.id, -32010, `${rpc.method} is not enabled. Use SendMessage plus GetTask polling.`);
    case "SendMessage":
      {
        const agent = await authenticateAtlasAgent(req, store);
        const task = await sendMessage(client, params as unknown as MessageSendParams, mergeOptions(req, agent));
        await recordTaskAccounting(store, agent, task, "send_message");
        return jsonRpcSuccess(rpc.id, { task });
      }
    case "GetTask":
      {
        const agent = await authenticateAtlasAgent(req, store);
        const task = await getTask(client, params as TaskQueryParams, mergeOptions(req, agent));
        await recordTaskAccounting(store, agent, task, "get_task");
        return jsonRpcSuccess(rpc.id, task);
      }
    case "CancelTask":
      {
        const agent = await authenticateAtlasAgent(req, store);
        const task = await cancelTask(client, params as TaskQueryParams, mergeOptions(req, agent));
        await recordTaskAccounting(store, agent, task, "cancel_task");
        return jsonRpcSuccess(rpc.id, task);
      }
    case "ListTasks":
      {
        const agent = await authenticateAtlasAgent(req, store);
        return jsonRpcSuccess(rpc.id, await listTasks(client, mergeOptions(req, agent)));
      }
    default:
      return jsonRpcError(rpc.id, -32601, `Unsupported A2A method: ${rpc.method}`);
  }
}

function taskIdFromRequest(req: Request): string | undefined {
  const regexParam = Array.isArray(req.params) ? undefined : req.params[0];
  return req.params.id || regexParam || (req.query.id as string | undefined);
}

export function createA2ARouter(config: AppConfig, client: SamsarClient, store: AtlasAgentStore): Router {
  const router = express.Router();
  router.use((req, _res, next) => {
    req.app.locals.config = config;
    next();
  });

  router.get("/.well-known/agent-card.json", (_req, res) => {
    res.status(200).json(buildAgentCard(config));
  });

  router.get("/.well-known/agent.json", (_req, res) => {
    res.status(200).json(buildAgentCard(config));
  });

  router.post("/a2a", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return res
        .status(400)
        .json(jsonRpcError(req.body?.id, -32011, `Unsupported A2A-Version: ${unsupportedVersion}`, {
          supportedVersions: Array.from(SUPPORTED_A2A_VERSIONS),
        }));
    }

    if (!isJsonRpcRequest(req.body)) {
      return res.status(400).json(jsonRpcError(null, -32600, "Invalid JSON-RPC 2.0 A2A request."));
    }

    try {
      const response = await dispatchJsonRpc(client, store, req, req.body);
      return res.status("error" in response ? 400 : 200).json(response);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(req.body.id, error));
    }
  });

  async function handleSendMessageRest(req: Request, res: Response) {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const agent = await authenticateAtlasAgent(req, store);
      const params = (req.body?.params ?? req.body) as MessageSendParams;
      const task = await sendMessage(client, params, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "send_message");
      return res.status(200).type("application/a2a+json").json({ task });
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(null, error));
    }
  }

  router.post(/^\/message:send$/, handleSendMessageRest);

  router.get("/tasks", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const agent = await authenticateAtlasAgent(req, store);
      return res.status(200).type("application/a2a+json").json(await listTasks(client, mergeOptions(req, agent)));
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(null, error));
    }
  });

  router.get("/tasks/:id", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const agent = await authenticateAtlasAgent(req, store);
      const id = taskIdFromRequest(req);
      const task = await getTask(client, { id }, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "get_task");
      return res.status(200).type("application/a2a+json").json(task);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(null, error));
    }
  });

  router.post(/^\/tasks\/([^/]+):cancel$/, async (req: Request, res: Response) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const agent = await authenticateAtlasAgent(req, store);
      const id = taskIdFromRequest(req);
      const task = await cancelTask(client, { id }, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "cancel_task");
      return res.status(200).type("application/a2a+json").json(task);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(null, error));
    }
  });

  router.post("/tasks/:id/cancel", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const agent = await authenticateAtlasAgent(req, store);
      const id = taskIdFromRequest(req);
      const task = await cancelTask(client, { id }, mergeOptions(req, agent));
      await recordTaskAccounting(store, agent, task, "cancel_task");
      return res.status(200).type("application/a2a+json").json(task);
    } catch (error) {
      return res.status(statusFromError(error)).json(errorToJsonRpc(null, error));
    }
  });

  router.post(/^\/message:stream$/, (_req: Request, res: Response) => {
    res.status(501).json({
      message: "A2A streaming is not enabled. Use SendMessage plus GetTask polling.",
    });
  });

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "samsar-atlas",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
