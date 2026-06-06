import { randomUUID } from "node:crypto";
import {
  SamsarClient,
  type SamsarResult,
  type V2ExternalUserIdentity,
  type V2RequestOptions,
} from "samsar-js";
import type {
  A2AArtifact,
  A2ADataPart,
  A2AFilePart,
  A2AMessage,
  A2APart,
  A2ATask,
  A2ATaskState,
  JsonObject,
  MessageSendParams,
  TaskQueryParams,
} from "./types.js";

const TERMINAL_STATES = new Set<A2ATaskState>([
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);
const SKILL_ALIASES: Record<string, string> = {
  account_create_external_user: "create_external_user",
  account_get_usage_logs: "get_user_usage_logs",
  account_usage_logs: "get_user_usage_logs",
  app_key_create: "create_user_app_key",
  app_key_get: "get_user_app_key",
  app_key_refresh: "refresh_user_app_key",
  app_key_revoke: "revoke_user_app_key",
  billing_create_recharge: "create_credits_recharge",
  billing_get_credits: "get_credits",
  billing_get_payment_status: "get_payment_status",
  billing_grant_credits: "grant_credits",
  billing_payment_status: "get_payment_status",
  billing_user_payment_status: "get_user_payment_status",
  create_app_key: "create_user_app_key",
  create_credits_recharge: "create_credits_recharge",
  create_external_user: "create_external_user",
  create_login_token: "create_login_token",
  create_user_app_key: "create_user_app_key",
  create_user_recharge: "create_user_recharge_credits",
  create_user_recharge_credits: "create_user_recharge_credits",
  create_video_from_text: "text_to_video",
  video_text_to_video: "text_to_video",
  text_to_video: "text_to_video",
  create_video_from_image_list: "image_list_to_video",
  image_to_video: "image_list_to_video",
  image_list_to_video: "image_list_to_video",
  step_text_to_video: "step_text_to_video",
  video_step_text_to_video: "step_text_to_video",
  step_image_to_video: "step_image_to_video",
  video_step_image_to_video: "step_image_to_video",
  translate_video: "translate_video",
  retranslate_video: "translate_video",
  clone_video: "clone_video",
  video_clone: "clone_video",
  regenerate_avatar: "regenerate_avatar",
  update_outro_image: "update_outro_image",
  add_outro_image: "add_outro_image",
  update_footer_image: "update_footer_image",
  join_videos: "join_videos",
  get_app_key: "get_user_app_key",
  get_credits: "get_credits",
  get_payment_status: "get_payment_status",
  get_usage_logs: "get_user_usage_logs",
  get_user_app_key: "get_user_app_key",
  get_user_credits: "get_user_credits",
  get_user_payment_status: "get_user_payment_status",
  get_user_usage_logs: "get_user_usage_logs",
  grant_credits: "grant_credits",
  login_create_token: "create_login_token",
  login_refresh_token: "refresh_user_token",
  payment_status: "get_payment_status",
  recharge_credits: "create_credits_recharge",
  refresh_app_key: "refresh_user_app_key",
  refresh_token: "refresh_user_token",
  refresh_user_app_key: "refresh_user_app_key",
  refresh_user_token: "refresh_user_token",
  revoke_app_key: "revoke_user_app_key",
  revoke_user_app_key: "revoke_user_app_key",
  user_credits: "get_user_credits",
  user_payment_status: "get_user_payment_status",
  user_recharge_credits: "create_user_recharge_credits",
};

const SYNCHRONOUS_SKILLS = new Set([
  "create_external_user",
  "create_login_token",
  "create_credits_recharge",
  "grant_credits",
  "get_credits",
  "get_payment_status",
  "create_user_recharge_credits",
  "refresh_user_token",
  "create_user_app_key",
  "get_user_app_key",
  "refresh_user_app_key",
  "revoke_user_app_key",
  "get_user_credits",
  "get_user_usage_logs",
  "get_user_payment_status",
]);

const MANAGED_SUBACCOUNT_DISABLED_SKILLS = new Set([
  "create_external_user",
  "create_login_token",
  "grant_credits",
  "create_user_recharge_credits",
  "refresh_user_token",
  "create_user_app_key",
  "get_user_app_key",
  "refresh_user_app_key",
  "revoke_user_app_key",
  "get_user_credits",
  "get_user_usage_logs",
  "get_user_payment_status",
]);

const ATLAS_A2A_IMAGE_MODEL = "NANOBANANAPRO";
const ATLAS_A2A_DEFAULT_VIDEO_MODEL = "VEO3.1I2VFAST";
const ATLAS_A2A_VIDEO_MODEL = "VEO3.1I2V";
const ATLAS_A2A_BACKINGTRACK_MODEL = "LYRIA3";
const ATLAS_A2A_TTS_MODEL = "GOOGLE";
const ATLAS_A2A_INFERENCE_MODEL = "gemini-3.1-pro";
const ATLAS_A2A_GOOGLE_TTS_SPEAKER_OPTIONS: JsonObject = {
  allowOpenAI: false,
  allowElevenLabs: false,
  allowGoogle: true,
  openAISpeakers: [],
  elevenLabsSpeakers: [],
  googleSpeakers: ["en-US-Standard-F", "en-US-Standard-D"],
  googleSpeakerDetails: [
    {
      provider: "GOOGLE",
      value: "en-US-Standard-F",
      voiceId: "en-US-Standard-F",
      name: "en-US-Standard-F",
      label: "en-US Standard F",
      languageCode: "en-US",
      languageCodes: ["en-US"],
      Gender: "F",
      gender: "female",
      ssmlGender: "SSML_VOICE_GENDER_FEMALE",
      previewRequiresAuth: true,
    },
    {
      provider: "GOOGLE",
      value: "en-US-Standard-D",
      voiceId: "en-US-Standard-D",
      name: "en-US-Standard-D",
      label: "en-US Standard D",
      languageCode: "en-US",
      languageCodes: ["en-US"],
      Gender: "M",
      gender: "male",
      ssmlGender: "SSML_VOICE_GENDER_MALE",
      previewRequiresAuth: true,
    },
  ],
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAtlasA2AVideoModel(input: JsonObject): string {
  const raw =
    getString(input.video_model) ||
    getString(input.videoModel) ||
    getString(input.model);
  if (!raw) {
    return ATLAS_A2A_DEFAULT_VIDEO_MODEL;
  }

  const compact = raw.toUpperCase().replace(/[\s_.-]/g, "");
  if (compact === "VEO31" || compact === "VEO31I2V") {
    return ATLAS_A2A_VIDEO_MODEL;
  }
  if (compact === "VEO31FAST" || compact === "VEO31I2VFAST") {
    return ATLAS_A2A_DEFAULT_VIDEO_MODEL;
  }

  throw new Error("video_model must be VEO3.1FAST or VEO3.1 for Atlas A2A video generation.");
}

function buildAtlasA2AVideoDefaults(input: JsonObject): JsonObject {
  return {
    image_model: ATLAS_A2A_IMAGE_MODEL,
    video_model: normalizeAtlasA2AVideoModel(input),
    backingtrack_model: ATLAS_A2A_BACKINGTRACK_MODEL,
    tts_model: ATLAS_A2A_TTS_MODEL,
    inference_model: ATLAS_A2A_INFERENCE_MODEL,
    speakerOptions: ATLAS_A2A_GOOGLE_TTS_SPEAKER_OPTIONS,
  };
}

function buildAtlasA2ATextToVideoInput(input: JsonObject): JsonObject {
  const prompt = getString(input.prompt);
  if (!prompt) {
    throw new Error("prompt is required for text_to_video.");
  }

  const duration = getNumber(input.duration);
  if (!Number.isFinite(duration)) {
    throw new Error("duration is required for text_to_video.");
  }

  return compactObject({
    prompt,
    duration,
    ...buildAtlasA2AVideoDefaults(input),
  });
}

function getImageListInput(input: JsonObject): unknown[] {
  const imageUrls = getArray(input.image_urls);
  if (imageUrls.length) {
    return imageUrls;
  }
  const imageUrlsAlias = getArray(input.imageUrls);
  if (imageUrlsAlias.length) {
    return imageUrlsAlias;
  }
  const images = getArray(input.images);
  if (images.length) {
    return images;
  }
  const imageList = getArray(input.image_list);
  if (imageList.length) {
    return imageList;
  }
  return getArray(input.imageList);
}

function buildAtlasA2AImageListToVideoInput(input: JsonObject): JsonObject {
  const imageUrls = getImageListInput(input);
  if (!imageUrls.length) {
    throw new Error("image_urls is required for image_list_to_video.");
  }

  const prompt = getString(input.prompt);
  const metadata = getObject(input.metadata);

  return compactObject({
    image_urls: imageUrls,
    ...(prompt ? { prompt } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    ...buildAtlasA2AVideoDefaults(input),
  });
}

function hasPartKind(part: JsonObject, kind: string): boolean {
  return part.kind === kind || part.kind === undefined;
}

function compactObject<T extends JsonObject>(input: T): T {
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    output[key] = value;
  }
  return output as T;
}

function normalizeSkill(value: unknown): string | undefined {
  const raw = getString(value);
  if (!raw) {
    return undefined;
  }
  const key = raw.replace(/[./-]/g, "_").toLowerCase();
  return SKILL_ALIASES[key];
}

function extractDataParts(message: A2AMessage): JsonObject[] {
  return getArray(message.parts)
    .filter((part): part is A2ADataPart => isObject(part) && hasPartKind(part, "data") && isObject(part.data))
    .map((part) => part.data);
}

function extractTextPrompt(message: A2AMessage): string | undefined {
  const text = getArray(message.parts)
    .filter((part): part is { kind?: "text"; text: string } => isObject(part) && hasPartKind(part, "text"))
    .map((part) => getString(part.text))
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .trim();
  return text || undefined;
}

function extractFileParts(message: A2AMessage): A2AFilePart[] {
  return getArray(message.parts)
    .filter(
      (part): part is A2AFilePart =>
        isObject(part) &&
        hasPartKind(part, "file") &&
        (isObject(part.file) || typeof part.url === "string" || typeof part.raw === "string"),
    );
}

function dataUrlFromFilePart(part: A2AFilePart): string | undefined {
  const rawData = getString(part.raw) || getString(part.file?.data) || getString(part.file?.bytes);
  if (!rawData) {
    return undefined;
  }
  if (rawData.startsWith("data:")) {
    return rawData;
  }
  return `data:${part.mediaType || part.file?.mimeType || "application/octet-stream"};base64,${rawData}`;
}

async function resolveImageUrlsFromFileParts(
  client: SamsarClient,
  fileParts: A2AFilePart[],
  options: V2RequestOptions,
): Promise<string[]> {
  const directUris: string[] = [];
  const inlineImageData: string[] = [];

  for (const part of fileParts) {
    const uri = getString(part.url) || getString(part.file?.uri);
    if (uri) {
      directUris.push(uri);
      continue;
    }

    const dataUrl = dataUrlFromFilePart(part);
    if (dataUrl) {
      inlineImageData.push(dataUrl);
    }
  }

  if (!inlineImageData.length) {
    return directUris;
  }

  const uploadResponse = await client.uploadV2ImageData(inlineImageData, options);
  return [...directUris, ...getArray(uploadResponse.data.image_urls).filter((url): url is string => typeof url === "string")];
}

function extractMergedData(message: A2AMessage): JsonObject {
  return extractDataParts(message).reduce<JsonObject>((merged, part) => ({ ...merged, ...part }), {});
}

function extractInputPayload(message: A2AMessage): JsonObject {
  const mergedData = extractMergedData(message);
  const nestedInput = getObject(mergedData.input);
  const input = Object.keys(nestedInput).length ? nestedInput : mergedData;
  const prompt = extractTextPrompt(message);

  return compactObject({
    ...input,
    ...(prompt && input.prompt === undefined ? { prompt } : {}),
  });
}

function extractSkill(params: MessageSendParams, input: JsonObject): string {
  const message = params.message;
  const mergedData = extractMergedData(message);
  const metadata = getObject(params.metadata);
  const messageMetadata = getObject(message.metadata);

  const skill =
    normalizeSkill(metadata.skill) ||
    normalizeSkill(metadata.samsar_skill) ||
    normalizeSkill(metadata.route) ||
    normalizeSkill(messageMetadata.skill) ||
    normalizeSkill(messageMetadata.samsar_skill) ||
    normalizeSkill(mergedData.skill) ||
    normalizeSkill(mergedData.samsar_skill) ||
    normalizeSkill(mergedData.route) ||
    normalizeSkill(input.skill) ||
    normalizeSkill(input.samsar_skill) ||
    normalizeSkill(input.route);

  if (!skill) {
    throw new Error("A Samsar skill is required in A2A metadata or a data part.");
  }

  return skill;
}

function extractWebhookUrl(params: MessageSendParams, input: JsonObject): string | undefined {
  const configuration = getObject(params.configuration);
  const pushNotificationConfig = getObject(configuration.pushNotificationConfig);
  const metadata = getObject(params.metadata);

  return (
    getString(pushNotificationConfig.url) ||
    getString(configuration.webhookUrl) ||
    getString(configuration.webhook_url) ||
    getString(metadata.webhookUrl) ||
    getString(metadata.webhook_url) ||
    getString(input.webhookUrl) ||
    getString(input.webhook_url)
  );
}

function extractExternalUser(params: MessageSendParams, input: JsonObject): V2ExternalUserIdentity | undefined {
  const metadata = getObject(params.metadata);
  const messageMetadata = getObject(params.message.metadata);
  const externalUser = [
    getObject(input.external_user),
    getObject(input.externalUser),
    getObject(metadata.external_user),
    getObject(metadata.externalUser),
    getObject(messageMetadata.external_user),
    getObject(messageMetadata.externalUser),
  ].find((candidate) => Object.keys(candidate).length > 0) || {};

  return Object.keys(externalUser).length ? (externalUser as V2ExternalUserIdentity) : undefined;
}

function makeOptions(baseOptions: V2RequestOptions, params: MessageSendParams, input: JsonObject): V2RequestOptions {
  const resolvedExternalUser = baseOptions.externalUser ?? extractExternalUser(params, input);

  return compactObject({
    ...baseOptions,
    webhookUrl: extractWebhookUrl(params, input),
    externalUser: resolvedExternalUser,
  });
}

function cleanSamsarInput(input: JsonObject): JsonObject {
  const {
    skill,
    samsar_skill,
    route,
    external_user,
    externalUser,
    webhookUrl,
    webhook_url,
    ...rest
  } = input;
  void skill;
  void samsar_skill;
  void route;
  void external_user;
  void externalUser;
  void webhookUrl;
  void webhook_url;
  return rest;
}

function getTaskIdFromSamsarPayload(payload: JsonObject): string {
  return (
    getString(payload.request_id) ||
    getString(payload.requestId) ||
    getString(payload.session_id) ||
    getString(payload.sessionId) ||
    getString(payload.sessionID) ||
    randomUUID()
  );
}

function mapSamsarStatusToTaskState(status: unknown, payload: JsonObject = {}): A2ATaskState {
  const normalized = getString(status)?.toUpperCase();
  if (payload.requires_user_action === true || payload.waiting_for_process_next === true) {
    return "TASK_STATE_INPUT_REQUIRED";
  }

  if (!normalized || normalized === "INIT") {
    return "TASK_STATE_SUBMITTED";
  }

  if (["PENDING", "PROCESSING", "IN_PROGRESS", "RUNNING", "QUEUED"].includes(normalized)) {
    return "TASK_STATE_WORKING";
  }

  if (["COMPLETED", "COMPLETE", "SUCCESS", "SUCCEEDED", "DONE"].includes(normalized)) {
    return "TASK_STATE_COMPLETED";
  }

  if (["CANCELLED", "CANCELED"].includes(normalized)) {
    return "TASK_STATE_CANCELED";
  }

  if (["FAILED", "FAIL", "ERROR", "TIMED_OUT", "TIMEOUT"].includes(normalized)) {
    return "TASK_STATE_FAILED";
  }

  return "TASK_STATE_UNSPECIFIED";
}

function buildStatusMessage(taskId: string, contextId: string, state: A2ATaskState, payload: JsonObject): A2AMessage | undefined {
  const message =
    getString(payload.message) ||
    getString(payload.error) ||
    (state === "TASK_STATE_SUBMITTED" ? "Samsar task submitted." : undefined) ||
    (state === "TASK_STATE_WORKING" ? "Samsar task is processing." : undefined);

  if (!message) {
    return undefined;
  }

  return {
    role: "ROLE_AGENT",
    messageId: randomUUID(),
    taskId,
    contextId,
    parts: [{ text: message }],
  };
}

function artifactId(taskId: string, suffix: string): string {
  return `${taskId}:${suffix}`;
}

function buildArtifacts(taskId: string, payload: JsonObject): A2AArtifact[] {
  const artifacts: A2AArtifact[] = [];
  const resultUrls = getArray(payload.result_urls)
    .map((url) => getString(url))
    .filter((url): url is string => Boolean(url));
  const resultUrl = getString(payload.result_url);
  const uniqueResultUrls = Array.from(new Set([...(resultUrl ? [resultUrl] : []), ...resultUrls]));

  if (uniqueResultUrls.length) {
    artifacts.push({
      artifactId: artifactId(taskId, "result-video"),
      name: "result-video",
      description: "Final Samsar video output.",
      parts: uniqueResultUrls.map((uri) => ({
        url: uri,
        mediaType: "video/mp4",
      })),
    });
  }

  if (isObject(payload.session)) {
    artifacts.push({
      artifactId: artifactId(taskId, "session-preview"),
      name: "session-preview",
      description: "Normalized Samsar video session preview data.",
      parts: [
        {
          data: payload.session,
        },
      ],
    });
  }

  artifacts.push({
    artifactId: artifactId(taskId, "samsar-response"),
    name: "samsar-response",
    description: "Raw Samsar v2 response payload.",
    parts: [
      {
        data: payload,
      },
    ],
  });

  return artifacts;
}

function normalizeRole(role: A2AMessage["role"]): "ROLE_USER" | "ROLE_AGENT" {
  if (role === "agent" || role === "ROLE_AGENT") {
    return "ROLE_AGENT";
  }
  return "ROLE_USER";
}

function normalizePart(part: A2APart): A2APart {
  if ("text" in part) {
    return compactObject({
      text: part.text,
      metadata: part.metadata,
    });
  }

  if ("file" in part || "url" in part || "raw" in part) {
    const file = part.file ?? {};
    return compactObject({
      url: part.url ?? file.uri,
      raw: part.raw ?? file.data ?? file.bytes,
      filename: part.filename ?? file.name,
      mediaType: part.mediaType ?? file.mimeType,
      metadata: part.metadata,
    });
  }

  const dataPart = part as A2ADataPart;
  return compactObject({
    data: dataPart.data,
    metadata: dataPart.metadata,
  });
}

function normalizeMessageForHistory(message: A2AMessage, taskId: string, contextId: string): A2AMessage {
  return {
    role: normalizeRole(message.role),
    messageId: message.messageId || randomUUID(),
    taskId,
    contextId,
    parts: message.parts.map(normalizePart),
    metadata: message.metadata,
  };
}

export function taskFromSamsarPayload(
  payload: JsonObject,
  message?: A2AMessage,
  options: { state?: A2ATaskState } = {},
): A2ATask {
  const taskId = getTaskIdFromSamsarPayload(payload);
  const contextId = message?.contextId || getString(payload.contextId) || getString(payload.context_id) || taskId;
  const state = options.state ?? mapSamsarStatusToTaskState(payload.status, payload);
  const artifacts = buildArtifacts(taskId, payload);

  return {
    id: taskId,
    contextId,
    status: compactObject({
      state,
      message: buildStatusMessage(taskId, contextId, state, payload),
      timestamp: new Date().toISOString(),
    }),
    artifacts,
    history: message ? [normalizeMessageForHistory(message, taskId, contextId)] : undefined,
    metadata: {
      samsarRequestId: taskId,
      samsarSessionId: getString(payload.session_id) || getString(payload.sessionId) || getString(payload.sessionID) || taskId,
      samsarStatus: getString(payload.status),
      samsarProvider: getString(payload.provider),
      creditsCharged: payload.creditsCharged ?? payload.credits_charged,
    },
  };
}

function taskFromSamsarResult(
  response: SamsarResult<unknown>,
  message?: A2AMessage,
  options: { state?: A2ATaskState } = {},
): A2ATask {
  const payload = isObject(response.data) ? response.data : { value: response.data };
  return taskFromSamsarPayload(payload, message, options);
}

async function executeSkill(
  client: SamsarClient,
  skill: string,
  input: JsonObject,
  fileParts: A2AFilePart[],
  options: V2RequestOptions,
): Promise<SamsarResult<unknown>> {
  if (MANAGED_SUBACCOUNT_DISABLED_SKILLS.has(skill)) {
    throw new Error(`Skill ${skill} is not available in Atlas managed sub-account mode.`);
  }

  const samsarInput = cleanSamsarInput(input);

  if (skill === "image_list_to_video" || skill === "step_image_to_video") {
    const existingImageUrls = getArray(samsarInput.image_urls)
      .map((url) => getString(url))
      .filter((url): url is string => Boolean(url));
    const fileImageUrls = await resolveImageUrlsFromFileParts(client, fileParts, options);
    if (!existingImageUrls.length && fileImageUrls.length) {
      samsarInput.image_urls = fileImageUrls;
    }
    if (skill === "step_image_to_video" && !samsarInput.image_url && !samsarInput.imageUrl && fileImageUrls[0]) {
      samsarInput.image_url = fileImageUrls[0];
    }
  }

  switch (skill) {
    case "text_to_video":
      return client.createV2VideoFromText(buildAtlasA2ATextToVideoInput(samsarInput) as never, options) as Promise<SamsarResult<unknown>>;
    case "image_list_to_video":
      return client.createV2VideoFromImageList(buildAtlasA2AImageListToVideoInput(samsarInput) as never, options) as Promise<SamsarResult<unknown>>;
    case "step_text_to_video":
      return client.createV2StepVideoFromText(buildAtlasA2ATextToVideoInput(samsarInput) as never, options) as Promise<SamsarResult<unknown>>;
    case "step_image_to_video":
      return client.createV2StepVideoFromImage(buildAtlasA2AImageListToVideoInput(samsarInput) as never, options) as Promise<SamsarResult<unknown>>;
    case "translate_video":
      return client.translateV2Video(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "clone_video":
      return client.cloneV2Video(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "regenerate_avatar":
      return client.regenerateV2VideoAvatar(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "update_outro_image":
      return client.updateV2VideoOutroImage(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "add_outro_image":
      return client.addV2VideoOutroImage(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "update_footer_image":
      return client.updateV2VideoFooterImage(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "join_videos":
      return client.joinV2Videos(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "create_external_user":
      return client.createV2ExternalUser(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "create_login_token":
      return client.createV2LoginToken({
        ...options,
        redirect: getString(samsarInput.redirect) || getString(samsarInput.redirect_url) || getString(samsarInput.redirectUrl),
      }) as Promise<SamsarResult<unknown>>;
    case "get_credits":
      return client.getV2Credits(options) as Promise<SamsarResult<unknown>>;
    case "create_credits_recharge":
      return client.createV2CreditsRecharge(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "grant_credits":
      return client.grantV2Credits(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "get_payment_status":
      return client.getV2PaymentStatus(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "create_user_recharge_credits":
      return client.createV2UserRechargeCredits(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "refresh_user_token":
      return client.refreshV2UserToken(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "create_user_app_key":
      return client.createV2UserAppKey(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "get_user_app_key":
      return client.getV2UserAppKey(options) as Promise<SamsarResult<unknown>>;
    case "refresh_user_app_key":
      return client.refreshV2UserAppKey(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    case "revoke_user_app_key":
      return client.revokeV2UserAppKey(options) as Promise<SamsarResult<unknown>>;
    case "get_user_credits":
      return client.getV2UserCredits(options) as Promise<SamsarResult<unknown>>;
    case "get_user_usage_logs":
      return client.getV2UserUsageLogs({
        ...options,
        page: getNumber(samsarInput.page),
        pageSize: getNumber(samsarInput.pageSize) ?? getNumber(samsarInput.page_size),
        limit: getNumber(samsarInput.limit),
      }) as Promise<SamsarResult<unknown>>;
    case "get_user_payment_status":
      return client.getV2UserPaymentStatus(samsarInput as never, options) as Promise<SamsarResult<unknown>>;
    default:
      throw new Error(`Unsupported Samsar A2A skill: ${skill}`);
  }
}

export async function sendMessage(
  client: SamsarClient,
  params: MessageSendParams,
  baseOptions: V2RequestOptions,
): Promise<A2ATask> {
  if (!params?.message || !Array.isArray(params.message.parts)) {
    throw new Error("params.message.parts is required.");
  }

  const input = extractInputPayload(params.message);
  const skill = extractSkill(params, input);
  const fileParts = extractFileParts(params.message);
  const options = makeOptions(baseOptions, params, input);
  const response = await executeSkill(client, skill, input, fileParts, options);
  return taskFromSamsarResult(response, params.message, {
    state: SYNCHRONOUS_SKILLS.has(skill) ? "TASK_STATE_COMPLETED" : undefined,
  });
}

export async function getTask(
  client: SamsarClient,
  params: TaskQueryParams,
  baseOptions: V2RequestOptions,
): Promise<A2ATask> {
  const taskId = getString(params.id) || getString(params.taskId);
  if (!taskId) {
    throw new Error("Task id is required.");
  }

  const response = await client.getV2StatusDetailed(taskId, baseOptions);
  return taskFromSamsarResult(response);
}

export async function cancelTask(
  client: SamsarClient,
  params: TaskQueryParams,
  baseOptions: V2RequestOptions,
): Promise<A2ATask> {
  const taskId = getString(params.id) || getString(params.taskId);
  if (!taskId) {
    throw new Error("Task id is required.");
  }

  const response = await client.cancelV2Render({ videoSessionId: taskId }, baseOptions);
  const task = taskFromSamsarResult(response);
  return {
    ...task,
    status: {
      ...task.status,
      state: TERMINAL_STATES.has(task.status.state) ? task.status.state : "TASK_STATE_CANCELED",
    },
  };
}

export async function listTasks(
  client: SamsarClient,
  baseOptions: V2RequestOptions,
): Promise<{ tasks: A2ATask[]; nextPageToken: string; pageSize: number; totalSize: number }> {
  const response = await client.listV2Requests(baseOptions);
  const requests = getArray((response.data as JsonObject).requests);
  const tasks = requests
    .filter((request): request is JsonObject => isObject(request))
    .map((request) => taskFromSamsarPayload(request));

  return {
    tasks,
    nextPageToken: "",
    pageSize: tasks.length,
    totalSize: tasks.length,
  };
}
