import type { A2AArtifact, A2ATask, JsonObject } from "../a2a/types.js";
import type { AtlasAccountingEvent, AtlasAgentRecord, AtlasAgentStore } from "./types.js";

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

function samsarResponsePayload(task: A2ATask): JsonObject {
  const artifacts = task.artifacts ?? [];
  const responseArtifact = artifacts.find((artifact: A2AArtifact) => artifact.name === "samsar-response");
  const responsePart = responseArtifact?.parts.find((part) => "data" in part && isObject(part.data));
  return responsePart && "data" in responsePart && isObject(responsePart.data) ? responsePart.data : {};
}

function paymentIdFromPayload(payload: JsonObject): string | undefined {
  return (
    getString(payload.external_payment_id) ||
    getString(payload.externalPaymentId) ||
    getString(payload.checkoutSessionId) ||
    getString(payload.checkout_session_id) ||
    getString(payload.paymentIntentId) ||
    getString(payload.payment_intent_id) ||
    getString(payload.setupIntentId) ||
    getString(payload.setup_intent_id)
  );
}

function paymentStatusFromPayload(payload: JsonObject): string | undefined {
  return (
    getString(payload.status) ||
    getString(payload.paymentStatus) ||
    getString(payload.payment_status) ||
    getString(payload.checkoutStatus) ||
    getString(payload.checkout_status)
  );
}

function creditsPurchasedFromPayload(payload: JsonObject): number | undefined {
  return (
    getNumber(payload.creditsPurchased) ??
    getNumber(payload.credits_purchased) ??
    getNumber(payload.credits) ??
    getNumber(payload.creditsToAdd) ??
    getNumber(payload.credits_to_add)
  );
}

function isPaidStatus(status: string | undefined): boolean {
  return Boolean(status && ["paid", "complete", "completed", "succeeded", "success"].includes(status.toLowerCase()));
}

async function recordEvent(store: AtlasAgentStore, event: Omit<AtlasAccountingEvent, "createdAt">): Promise<void> {
  await store.recordAccountingEvent({
    ...event,
    createdAt: new Date().toISOString(),
  });
}

export async function recordTaskAccounting(
  store: AtlasAgentStore,
  agent: AtlasAgentRecord,
  task: A2ATask,
  action: string,
): Promise<void> {
  const payload = samsarResponsePayload(task);
  const metadata = isObject(task.metadata) ? task.metadata : {};
  const samsarRequestId =
    getString(metadata.samsarRequestId) ||
    getString(payload.request_id) ||
    getString(payload.requestId) ||
    getString(payload.session_id) ||
    getString(payload.sessionId) ||
    task.id;
  const baseMetadata = {
    action,
    taskState: task.status.state,
    samsarStatus: getString(metadata.samsarStatus) || getString(payload.status),
  };

  if (action === "send_message") {
    await recordEvent(store, {
      id: `request:${agent.id}:${task.id}`,
      type: "request",
      agentId: agent.id,
      taskId: task.id,
      samsarRequestId,
      requestCount: 1,
      metadata: baseMetadata,
    });
  }

  const creditsCharged = getNumber(metadata.creditsCharged) ?? getNumber(payload.creditsCharged) ?? getNumber(payload.credits_charged);
  if (creditsCharged && creditsCharged > 0) {
    await recordEvent(store, {
      id: `charge:${agent.id}:${samsarRequestId}:${creditsCharged}`,
      type: "charge",
      agentId: agent.id,
      taskId: task.id,
      samsarRequestId,
      creditsCharged,
      metadata: baseMetadata,
    });
  }

  await recordPaymentAccounting(store, agent, payload);
}

export async function recordPaymentAccounting(
  store: AtlasAgentStore,
  agent: AtlasAgentRecord,
  payload: JsonObject,
): Promise<void> {
  const paymentId = paymentIdFromPayload(payload);
  if (!paymentId) {
    return;
  }

  const status = paymentStatusFromPayload(payload);
  const creditsPurchased = creditsPurchasedFromPayload(payload);

  await recordEvent(store, {
    id: `payment-status:${agent.id}:${paymentId}:${status ?? "unknown"}`,
    type: "payment_status",
    agentId: agent.id,
    paymentId,
    paymentStatus: status,
    metadata: payload,
  });

  if (isPaidStatus(status) && creditsPurchased && creditsPurchased > 0) {
    await recordEvent(store, {
      id: `payment-succeeded:${agent.id}:${paymentId}`,
      type: "payment_succeeded",
      agentId: agent.id,
      paymentId,
      paymentStatus: status,
      creditsPurchased,
      metadata: payload,
    });
  }
}
