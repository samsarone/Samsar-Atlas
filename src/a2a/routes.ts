import type { Request, Response, Router } from "express";
import express from "express";
import type { SamsarClient, V2RequestOptions } from "samsar-js";
import type { AppConfig } from "../config.js";
import { buildSamsarRequestOptions } from "../samsar/client.js";
import { buildAgentCard } from "./agent-card.js";
import { cancelTask, getTask, listTasks, sendMessage } from "./adapter.js";
import { asParams, errorToJsonRpc, isJsonRpcRequest, jsonRpcError, jsonRpcSuccess } from "./json-rpc.js";
import type { JsonObject, JsonRpcRequest, MessageSendParams, TaskQueryParams } from "./types.js";

const SUPPORTED_A2A_VERSIONS = new Set(["1.0", "1.0.0"]);

function mergeOptions(req: Request, overrides: Partial<V2RequestOptions> = {}): V2RequestOptions {
  const baseOptions = buildSamsarRequestOptions(req);
  return {
    ...baseOptions,
    ...overrides,
    headers: {
      ...(baseOptions.headers ?? {}),
      ...(overrides.headers ?? {}),
    },
  };
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

async function dispatchJsonRpc(client: SamsarClient, req: Request, rpc: JsonRpcRequest) {
  const baseOptions = mergeOptions(req);
  const params = asParams(rpc.params);

  switch (rpc.method) {
    case "SendMessage":
      return jsonRpcSuccess(rpc.id, {
        task: await sendMessage(client, params as unknown as MessageSendParams, baseOptions),
      });
    case "GetTask":
      return jsonRpcSuccess(rpc.id, await getTask(client, params as TaskQueryParams, baseOptions));
    case "CancelTask":
      return jsonRpcSuccess(rpc.id, await cancelTask(client, params as TaskQueryParams, baseOptions));
    case "ListTasks":
      return jsonRpcSuccess(rpc.id, await listTasks(client, baseOptions));
    case "GetExtendedAgentCard":
      return jsonRpcSuccess(rpc.id, buildAgentCard(req.app.locals.config as AppConfig));
    case "SendStreamingMessage":
    case "SubscribeToTask":
      return jsonRpcError(rpc.id, -32010, `${rpc.method} is not enabled. Use SendMessage plus GetTask polling.`);
    default:
      return jsonRpcError(rpc.id, -32601, `Unsupported A2A method: ${rpc.method}`);
  }
}

function taskIdFromRequest(req: Request): string | undefined {
  const regexParam = Array.isArray(req.params) ? undefined : req.params[0];
  return req.params.id || regexParam || (req.query.id as string | undefined);
}

export function createA2ARouter(config: AppConfig, client: SamsarClient): Router {
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
      const response = await dispatchJsonRpc(client, req, req.body);
      return res.status("error" in response ? 400 : 200).json(response);
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(req.body.id, error));
    }
  });

  async function handleSendMessageRest(req: Request, res: Response) {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const params = (req.body?.params ?? req.body) as MessageSendParams;
      const task = await sendMessage(client, params, mergeOptions(req));
      return res.status(200).type("application/a2a+json").json({ task });
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(null, error));
    }
  }

  router.post(/^\/message:send$/, handleSendMessageRest);

  router.get("/tasks", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      return res.status(200).type("application/a2a+json").json(await listTasks(client, mergeOptions(req)));
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(null, error));
    }
  });

  router.get("/tasks/:id", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const id = taskIdFromRequest(req);
      return res.status(200).type("application/a2a+json").json(await getTask(client, { id }, mergeOptions(req)));
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(null, error));
    }
  });

  router.post(/^\/tasks\/([^/]+):cancel$/, async (req: Request, res: Response) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const id = taskIdFromRequest(req);
      return res.status(200).type("application/a2a+json").json(await cancelTask(client, { id }, mergeOptions(req)));
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(null, error));
    }
  });

  router.post("/tasks/:id/cancel", async (req, res) => {
    const unsupportedVersion = unsupportedA2AVersion(req);
    if (unsupportedVersion) {
      return sendUnsupportedVersion(res, unsupportedVersion);
    }

    try {
      const id = taskIdFromRequest(req);
      return res.status(200).type("application/a2a+json").json(await cancelTask(client, { id }, mergeOptions(req)));
    } catch (error) {
      return res.status(500).json(errorToJsonRpc(null, error));
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
