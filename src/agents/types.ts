import type { V2ExternalUserIdentity } from "samsar-js";
import type { A2ATaskState, JsonObject } from "../a2a/types.js";

export type AtlasAgentStatus = "pending_payment" | "active" | "revoked";
export type AtlasAccountingEventType = "request" | "charge" | "payment_created" | "payment_succeeded" | "payment_status";

export interface AtlasAgentRecord {
  id: string;
  agentHash: string;
  secretHash: string;
  status: AtlasAgentStatus;
  provider: string;
  displayName?: string;
  email?: string;
  externalAgentId?: string;
  externalUser: V2ExternalUserIdentity;
  externalUserSummary?: JsonObject | null;
  metadata?: JsonObject;
  initialCredits?: number;
  registrationPaymentId?: string;
  registrationCheckoutSessionId?: string;
  activatedAt?: string;
  totalRequests: number;
  creditsIncurred: number;
  creditsPurchased: number;
  createdAt: string;
  updatedAt: string;
  lastAuthenticatedAt?: string;
}

export interface AtlasAccountingEvent {
  id: string;
  type: AtlasAccountingEventType;
  agentId: string;
  taskId?: string;
  samsarRequestId?: string;
  paymentId?: string;
  paymentStatus?: string;
  requestCount?: number;
  creditsCharged?: number;
  creditsPurchased?: number;
  metadata?: JsonObject;
  createdAt: string;
}

export interface AtlasTaskRecord {
  id: string;
  agentId: string;
  taskId: string;
  contextId: string;
  samsarRequestId: string;
  samsarSessionId: string;
  state: A2ATaskState;
  samsarStatus?: string;
  creditsCharged?: number;
  lastAction?: string;
  latestTask?: JsonObject;
  metadata?: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAtlasAgent {
  id: string;
  agentHash: string;
  status: AtlasAgentStatus;
  provider: string;
  displayName?: string;
  email?: string;
  externalAgentId?: string;
  externalUser: V2ExternalUserIdentity;
  externalUserSummary?: JsonObject | null;
  metadata?: JsonObject;
  initialCredits?: number;
  registrationPaymentId?: string;
  registrationCheckoutSessionId?: string;
  activatedAt?: string;
  billing: {
    totalRequests: number;
    creditsIncurred: number;
    creditsPurchased: number;
  };
  createdAt: string;
  updatedAt: string;
  lastAuthenticatedAt?: string;
}

export interface AtlasAgentStore {
  createAgent(agent: AtlasAgentRecord): Promise<void>;
  getAgentById(agentId: string): Promise<AtlasAgentRecord | undefined>;
  getAgentBySecretHash(secretHash: string): Promise<AtlasAgentRecord | undefined>;
  updateAgent(agentId: string, patch: Partial<AtlasAgentRecord>): Promise<void>;
  recordAccountingEvent(event: AtlasAccountingEvent): Promise<boolean>;
  upsertTaskRecord(task: AtlasTaskRecord): Promise<void>;
  getTaskRecord(agentId: string, taskId: string): Promise<AtlasTaskRecord | undefined>;
  listTaskRecords(agentId: string, limit?: number): Promise<AtlasTaskRecord[]>;
}

export function toPublicAgent(agent: AtlasAgentRecord): PublicAtlasAgent {
  return {
    id: agent.id,
    agentHash: agent.agentHash,
    status: agent.status,
    provider: agent.provider,
    displayName: agent.displayName,
    email: agent.email,
    externalAgentId: agent.externalAgentId,
    externalUser: agent.externalUser,
    externalUserSummary: agent.externalUserSummary,
    metadata: agent.metadata,
    initialCredits: agent.initialCredits,
    registrationPaymentId: agent.registrationPaymentId,
    registrationCheckoutSessionId: agent.registrationCheckoutSessionId,
    activatedAt: agent.activatedAt,
    billing: {
      totalRequests: agent.totalRequests,
      creditsIncurred: agent.creditsIncurred,
      creditsPurchased: agent.creditsPurchased,
    },
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    lastAuthenticatedAt: agent.lastAuthenticatedAt,
  };
}
