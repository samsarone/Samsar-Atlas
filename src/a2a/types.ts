export type JsonObject = Record<string, unknown>;
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: JsonObject;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcErrorResponse;

export type A2ARole = "ROLE_USER" | "ROLE_AGENT" | "user" | "agent";
export type A2ATaskState =
  | "TASK_STATE_UNSPECIFIED"
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_AUTH_REQUIRED";

export interface A2ATextPart {
  kind?: "text";
  text: string;
  metadata?: JsonObject;
}

export interface A2AFilePart {
  kind?: "file";
  file?: {
    name?: string;
    mimeType?: string;
    uri?: string;
    data?: string;
    bytes?: string;
  };
  url?: string;
  raw?: string;
  filename?: string;
  mediaType?: string;
  metadata?: JsonObject;
}

export interface A2ADataPart {
  kind?: "data";
  data: JsonObject;
  metadata?: JsonObject;
}

export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

export interface A2AMessage {
  kind?: "message";
  role: A2ARole;
  parts: A2APart[];
  messageId?: string;
  taskId?: string;
  contextId?: string;
  metadata?: JsonObject;
}

export interface A2ATaskStatus {
  state: A2ATaskState;
  message?: A2AMessage;
  timestamp?: string;
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: JsonObject;
}

export interface A2ATask {
  kind?: "task";
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: JsonObject;
}

export interface MessageSendParams {
  message: A2AMessage;
  configuration?: JsonObject;
  metadata?: JsonObject;
}

export interface TaskQueryParams {
  id?: string;
  taskId?: string;
  metadata?: JsonObject;
}

export interface AgentCard {
  name: string;
  description: string;
  provider: {
    organization: string;
    url: string;
  };
  version: string;
  documentationUrl?: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    extendedAgentCard: boolean;
  };
  securitySchemes?: JsonObject;
  securityRequirements?: JsonObject[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
  }>;
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: "JSONRPC" | "GRPC" | "HTTP+JSON" | string;
    protocolVersion: string;
    tenant?: string;
  }>;
}
