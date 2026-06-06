import { FieldValue, Firestore } from "@google-cloud/firestore";
import type { AppConfig } from "../config.js";
import type { JsonObject } from "../a2a/types.js";
import type { AtlasAccountingEvent, AtlasAgentRecord, AtlasAgentStore, AtlasTaskRecord } from "./types.js";

function compactValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => compactValue(item)) as T;
  }

  if (value && typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, item] of Object.entries(value as JsonObject)) {
      if (item !== undefined) {
        output[key] = compactValue(item);
      }
    }
    return output as T;
  }

  return value;
}

class MemoryAtlasAgentStore implements AtlasAgentStore {
  private readonly agents = new Map<string, AtlasAgentRecord>();
  private readonly secretIndex = new Map<string, string>();
  private readonly eventIds = new Set<string>();
  private readonly tasks = new Map<string, AtlasTaskRecord>();
  private readonly taskIdsByAgent = new Map<string, Set<string>>();

  private taskKey(agentId: string, taskId: string): string {
    return `${agentId}:${taskId}`;
  }

  async createAgent(agent: AtlasAgentRecord): Promise<void> {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already exists: ${agent.id}`);
    }

    const stored = compactValue(agent);
    this.agents.set(agent.id, stored);
    this.secretIndex.set(agent.secretHash, agent.id);
  }

  async getAgentById(agentId: string): Promise<AtlasAgentRecord | undefined> {
    return this.agents.get(agentId);
  }

  async getAgentBySecretHash(secretHash: string): Promise<AtlasAgentRecord | undefined> {
    const agentId = this.secretIndex.get(secretHash);
    return agentId ? this.getAgentById(agentId) : undefined;
  }

  async updateAgent(agentId: string, patch: Partial<AtlasAgentRecord>): Promise<void> {
    const current = this.agents.get(agentId);
    if (!current) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (patch.secretHash && patch.secretHash !== current.secretHash) {
      this.secretIndex.delete(current.secretHash);
      this.secretIndex.set(patch.secretHash, agentId);
    }

    this.agents.set(agentId, compactValue({
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }));
  }

  async recordAccountingEvent(event: AtlasAccountingEvent): Promise<boolean> {
    if (this.eventIds.has(event.id)) {
      return false;
    }

    const current = this.agents.get(event.agentId);
    if (!current) {
      throw new Error(`Agent not found: ${event.agentId}`);
    }

    this.eventIds.add(event.id);
    this.agents.set(event.agentId, {
      ...current,
      totalRequests: current.totalRequests + (event.requestCount ?? 0),
      creditsIncurred: current.creditsIncurred + (event.creditsCharged ?? 0),
      creditsPurchased: current.creditsPurchased + (event.creditsPurchased ?? 0),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async upsertTaskRecord(task: AtlasTaskRecord): Promise<void> {
    if (!this.agents.has(task.agentId)) {
      throw new Error(`Agent not found: ${task.agentId}`);
    }

    const key = this.taskKey(task.agentId, task.taskId);
    const current = this.tasks.get(key);
    const now = new Date().toISOString();
    const stored = compactValue({
      ...current,
      ...task,
      createdAt: current?.createdAt ?? task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
    });
    this.tasks.set(key, stored);

    const taskIds = this.taskIdsByAgent.get(task.agentId) ?? new Set<string>();
    taskIds.add(task.taskId);
    this.taskIdsByAgent.set(task.agentId, taskIds);
  }

  async getTaskRecord(agentId: string, taskId: string): Promise<AtlasTaskRecord | undefined> {
    const directTask = this.tasks.get(this.taskKey(agentId, taskId));
    if (directTask) {
      return directTask;
    }

    const taskIds = this.taskIdsByAgent.get(agentId);
    if (!taskIds) {
      return undefined;
    }

    return Array.from(taskIds)
      .map((storedTaskId) => this.tasks.get(this.taskKey(agentId, storedTaskId)))
      .find((task) => (
        task?.samsarRequestId === taskId ||
        task?.samsarSessionId === taskId ||
        task?.id === taskId
      ));
  }

  async listTaskRecords(agentId: string, limit = 50): Promise<AtlasTaskRecord[]> {
    const taskIds = this.taskIdsByAgent.get(agentId);
    if (!taskIds) {
      return [];
    }

    return Array.from(taskIds)
      .map((taskId) => this.tasks.get(this.taskKey(agentId, taskId)))
      .filter((task): task is AtlasTaskRecord => Boolean(task))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
}

class FirestoreAtlasAgentStore implements AtlasAgentStore {
  private readonly firestore: Firestore;
  private readonly collectionName: string;

  constructor(config: AppConfig) {
    this.firestore = new Firestore({
      projectId: config.firestoreProjectId,
      databaseId: config.firestoreDatabaseId,
    });
    this.collectionName = config.firestoreAgentCollection;
  }

  private agents() {
    return this.firestore.collection(this.collectionName);
  }

  async createAgent(agent: AtlasAgentRecord): Promise<void> {
    await this.agents().doc(agent.id).create(compactValue(agent));
  }

  async getAgentById(agentId: string): Promise<AtlasAgentRecord | undefined> {
    const snapshot = await this.agents().doc(agentId).get();
    return snapshot.exists ? (snapshot.data() as AtlasAgentRecord) : undefined;
  }

  async getAgentBySecretHash(secretHash: string): Promise<AtlasAgentRecord | undefined> {
    const snapshot = await this.agents().where("secretHash", "==", secretHash).limit(1).get();
    const doc = snapshot.docs[0];
    return doc?.exists ? (doc.data() as AtlasAgentRecord) : undefined;
  }

  async updateAgent(agentId: string, patch: Partial<AtlasAgentRecord>): Promise<void> {
    await this.agents().doc(agentId).update(compactValue({
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }));
  }

  async recordAccountingEvent(event: AtlasAccountingEvent): Promise<boolean> {
    const agentRef = this.agents().doc(event.agentId);
    const eventRef = agentRef.collection("accounting_events").doc(event.id);
    const storedEvent = compactValue(event);

    return this.firestore.runTransaction(async (transaction) => {
      const existingEvent = await transaction.get(eventRef);
      if (existingEvent.exists) {
        return false;
      }

      transaction.create(eventRef, storedEvent);
      transaction.update(agentRef, {
        totalRequests: FieldValue.increment(event.requestCount ?? 0),
        creditsIncurred: FieldValue.increment(event.creditsCharged ?? 0),
        creditsPurchased: FieldValue.increment(event.creditsPurchased ?? 0),
        updatedAt: new Date().toISOString(),
      });
      return true;
    });
  }

  async upsertTaskRecord(task: AtlasTaskRecord): Promise<void> {
    const agentRef = this.agents().doc(task.agentId);
    const taskRef = agentRef.collection("tasks").doc(task.taskId);
    const storedTask = compactValue(task);

    await this.firestore.runTransaction(async (transaction) => {
      const existingTask = await transaction.get(taskRef);
      transaction.set(taskRef, {
        ...storedTask,
        createdAt: existingTask.exists
          ? existingTask.get("createdAt") ?? task.createdAt
          : task.createdAt,
        updatedAt: task.updatedAt ?? new Date().toISOString(),
      }, { merge: true });
      transaction.update(agentRef, {
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async getTaskRecord(agentId: string, taskId: string): Promise<AtlasTaskRecord | undefined> {
    const tasks = this.agents().doc(agentId).collection("tasks");
    const snapshot = await tasks.doc(taskId).get();
    if (snapshot.exists) {
      return snapshot.data() as AtlasTaskRecord;
    }

    const requestSnapshot = await tasks.where("samsarRequestId", "==", taskId).limit(1).get();
    const requestDoc = requestSnapshot.docs[0];
    if (requestDoc?.exists) {
      return requestDoc.data() as AtlasTaskRecord;
    }

    const sessionSnapshot = await tasks.where("samsarSessionId", "==", taskId).limit(1).get();
    const sessionDoc = sessionSnapshot.docs[0];
    return sessionDoc?.exists ? (sessionDoc.data() as AtlasTaskRecord) : undefined;
  }

  async listTaskRecords(agentId: string, limit = 50): Promise<AtlasTaskRecord[]> {
    const snapshot = await this.agents()
      .doc(agentId)
      .collection("tasks")
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AtlasTaskRecord);
  }
}

export function createAgentStore(config: AppConfig): AtlasAgentStore {
  if (config.stateBackend === "firestore") {
    return new FirestoreAtlasAgentStore(config);
  }

  return new MemoryAtlasAgentStore();
}
