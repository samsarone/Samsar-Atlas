import express, { type Request, type Response, type Router } from "express";
import type { SamsarClient, V2ExternalUserIdentity } from "samsar-js";
import type { AppConfig } from "../config.js";
import type { JsonObject } from "../a2a/types.js";
import { generateAgentHash, generateAgentId, generateAgentSecret, hashAgentSecret } from "./crypto.js";
import { authenticateAtlasAgent } from "./auth.js";
import { recordPaymentAccounting } from "./accounting.js";
import type { AtlasAgentRecord, AtlasAgentStore } from "./types.js";
import { toPublicAgent } from "./types.js";

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

function externalUserIdentity(config: AppConfig, agentId: string, agentHash: string, input: JsonObject): V2ExternalUserIdentity {
  const metadata = isObject(input.metadata) ? input.metadata : undefined;

  return {
    provider: config.agentProvider,
    unique_key: agentHash,
    external_user_id: agentId,
    external_app_id: getString(input.externalAppId) || getString(input.external_app_id),
    external_company_id: getString(input.externalCompanyId) || getString(input.external_company_id),
    external_account_id: getString(input.externalAccountId) || getString(input.external_account_id),
    email: getString(input.email),
    username: getString(input.username),
    display_name: getString(input.displayName) || getString(input.display_name),
    user_type: "agent",
    metadata: {
      ...(metadata ?? {}),
      atlas_agent_id: agentId,
      atlas_agent_hash: agentHash,
      external_agent_id: getString(input.externalAgentId) || getString(input.external_agent_id),
    },
  };
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

function safeRechargePayload(input: JsonObject, credits: number): JsonObject {
  return {
    credits,
    redirect_url: getString(input.redirect_url) || getString(input.redirectUrl),
    success_url: getString(input.success_url) || getString(input.successUrl),
    cancel_url: getString(input.cancel_url) || getString(input.cancelUrl),
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
}

function paymentReference(payload: JsonObject): { paymentId?: string; checkoutSessionId?: string } {
  return {
    paymentId:
      getString(payload.external_payment_id) ||
      getString(payload.externalPaymentId) ||
      getString(payload.paymentIntentId) ||
      getString(payload.payment_intent_id) ||
      getString(payload.setupIntentId) ||
      getString(payload.setup_intent_id),
    checkoutSessionId: getString(payload.checkoutSessionId) || getString(payload.checkout_session_id),
  };
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

function sendRouteError(res: Response, error: unknown): Response {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message = error instanceof Error ? error.message : "Internal server error.";
  return res.status(statusCode).json({ message });
}

export function createAgentRouter(config: AppConfig, client: SamsarClient, store: AtlasAgentStore): Router {
  const router = express.Router();

  router.post("/agents/register", async (req, res) => {
    try {
      const input = isObject(req.body) ? req.body : {};
      const credits = getNumber(input.credits ?? input.credits_to_recharge ?? input.creditsToRecharge);
      if (!credits || credits <= 0 || !Number.isInteger(credits)) {
        return res.status(400).json({ message: "credits must be a positive integer to register an Atlas agent." });
      }

      const agentId = generateAgentId();
      const agentHash = generateAgentHash();
      const agentSecret = generateAgentSecret(config.agentSecretBytes);
      const now = new Date().toISOString();
      const externalUser = externalUserIdentity(config, agentId, agentHash, input);
      const externalUserResponse = await client.createV2ExternalUser(externalUser, { externalUser });
      const rechargeResponse = await client.createV2CreditsRecharge(
        safeRechargePayload(input, credits) as never,
        { externalUser },
      );
      const rechargePayload = rechargeResponse.data as JsonObject;
      const { paymentId, checkoutSessionId } = paymentReference(rechargePayload);
      const externalUserSummary = isObject(externalUserResponse.data.external_user)
        ? externalUserResponse.data.external_user
        : isObject(externalUserResponse.data.externalUser)
          ? externalUserResponse.data.externalUser
          : null;
      const agent: AtlasAgentRecord = {
        id: agentId,
        agentHash,
        secretHash: hashAgentSecret(agentSecret),
        status: "pending_payment",
        provider: config.agentProvider,
        displayName: getString(input.displayName) || getString(input.display_name),
        email: getString(input.email),
        externalAgentId: getString(input.externalAgentId) || getString(input.external_agent_id),
        externalUser,
        externalUserSummary,
        metadata: isObject(input.metadata) ? input.metadata : undefined,
        initialCredits: credits,
        registrationPaymentId: paymentId,
        registrationCheckoutSessionId: checkoutSessionId,
        totalRequests: 0,
        creditsIncurred: 0,
        creditsPurchased: 0,
        createdAt: now,
        updatedAt: now,
      };

      await store.createAgent(agent);

      return res.status(201).json({
        agent: toPublicAgent(agent),
        credentials: {
          agentId,
          referenceId: agentId,
          agentSecret,
          bearerToken: agentSecret,
          headerName: "x-atlas-agent-secret",
          authorization: `Bearer ${agentSecret}`,
        },
        registration: {
          referenceId: agentId,
          agentHash,
          status: agent.status,
          paymentStatusUrl: `/agents/billing/payment-status${checkoutSessionId ? `?checkoutSessionId=${encodeURIComponent(checkoutSessionId)}` : ""}`,
        },
        checkout: rechargeResponse.data,
        billing: {
          externalUser: externalUserResponse.data,
          recharge: rechargeResponse.data,
        },
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/agents/me", async (req, res) => {
    try {
      const agent = await authenticateAtlasAgent(req, store, { allowPendingPayment: true });
      return res.status(200).json({ agent: toPublicAgent(agent) });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/agents/rotate-secret", async (req, res) => {
    try {
      const agent = await authenticateAtlasAgent(req, store);
      const agentSecret = generateAgentSecret(config.agentSecretBytes);
      const updatedAt = new Date().toISOString();
      await store.updateAgent(agent.id, {
        secretHash: hashAgentSecret(agentSecret),
        updatedAt,
      });

      return res.status(200).json({
        agent: toPublicAgent({
          ...agent,
          updatedAt,
        }),
        credentials: {
          agentId: agent.id,
          agentSecret,
          bearerToken: agentSecret,
          headerName: "x-atlas-agent-secret",
          authorization: `Bearer ${agentSecret}`,
        },
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/agents/billing/recharge", async (req, res) => {
    try {
      const agent = await authenticateAtlasAgent(req, store);
      const input = isObject(req.body) ? req.body : {};
      const credits = getNumber(input.credits ?? input.credits_to_recharge ?? input.creditsToRecharge);
      if (!credits || credits <= 0 || !Number.isInteger(credits)) {
        return res.status(400).json({ message: "credits must be a positive integer." });
      }

      const response = await client.createV2CreditsRecharge(
        {
          ...input,
          credits,
        },
        { externalUser: agent.externalUser },
      );
      await recordPaymentAccounting(store, agent, response.data as JsonObject);

      return res.status(200).json(response.data);
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/agents/billing/payment-status", async (req, res) => {
    try {
      const agent = await authenticateAtlasAgent(req, store, { allowPendingPayment: true });
      const requestedPayment = safePaymentPayload(req.query as JsonObject);
      const storedPayment = {
        checkoutSessionId: agent.registrationCheckoutSessionId,
        external_payment_id: agent.registrationPaymentId,
      };
      const response = await client.getV2PaymentStatus(
        hasPaymentReference(requestedPayment) ? requestedPayment : storedPayment,
        {
        externalUser: agent.externalUser,
        },
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
