import type { AppConfig } from "../config.js";
import type { AgentCard } from "./types.js";

export const A2A_PROTOCOL_VERSION = "1.0";
export const AGENT_VERSION = "0.1.0";

function a2aUrl(config: AppConfig): string {
  return `${config.publicBaseUrl}/a2a`;
}

export function buildAgentCard(config: AppConfig): AgentCard {
  return {
    name: "Samsar Atlas",
    description:
      "A2A wrapper for Samsar Processor v2 video generation, editing, billing, login, account, and task status routes.",
    provider: {
      organization: "Samsar",
      url: "https://samsar.one",
    },
    version: AGENT_VERSION,
    documentationUrl: config.documentationUrl,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      bearerAuth: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "Samsar API key, Samsar user auth token, or external-user auth token",
          description: "Use Authorization: Bearer <token>.",
        },
      },
      appKey: {
        apiKeySecurityScheme: {
          location: "header",
          name: "Authorization",
          description: "Use Authorization: AppKey <APP_KEY> with x-app-secret.",
        },
      },
      appSecret: {
        apiKeySecurityScheme: {
          location: "header",
          name: "x-app-secret",
          description: "Secret paired with Authorization: AppKey <APP_KEY>.",
        },
      },
      externalUserApiKey: {
        apiKeySecurityScheme: {
          location: "header",
          name: "x-external-user-api-key",
          description: "Optional Samsar external-user API key header.",
        },
      },
    },
    securityRequirements: [
      { bearerAuth: [] },
      { appKey: [], appSecret: [] },
      { bearerAuth: [], externalUserApiKey: [] },
    ],
    defaultInputModes: ["text/plain", "application/json", "image/png", "image/jpeg", "image/webp"],
    defaultOutputModes: ["application/json", "video/mp4", "image/png", "image/jpeg", "audio/mpeg"],
    skills: [
      {
        id: "text_to_video",
        name: "Text to Video",
        description: "Create a Samsar video generation request from a text prompt.",
        tags: ["video", "generation", "text-to-video"],
        examples: ["Create a 20 second launch teaser for a travel app."],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "image_list_to_video",
        name: "Image List to Video",
        description: "Create a Samsar video generation request from ordered image URLs or image file parts.",
        tags: ["video", "generation", "image-to-video", "storyboard"],
        examples: ["Turn these product images into a narrated ad."],
        inputModes: ["application/json", "image/png", "image/jpeg", "image/webp"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "step_text_to_video",
        name: "Step Text to Video",
        description: "Create a step-controlled text-to-video request.",
        tags: ["video", "step", "generation"],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["application/json", "video/mp4", "image/png", "audio/mpeg"],
      },
      {
        id: "step_image_to_video",
        name: "Step Image to Video",
        description: "Create a step-controlled image-to-video request.",
        tags: ["video", "step", "image-to-video"],
        inputModes: ["application/json", "image/png", "image/jpeg", "image/webp"],
        outputModes: ["application/json", "video/mp4", "image/png", "audio/mpeg"],
      },
      {
        id: "translate_video",
        name: "Translate Video",
        description: "Translate an existing Samsar video request into another language.",
        tags: ["video", "translation", "localization"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "clone_video",
        name: "Clone Video",
        description: "Clone an existing Samsar video session and queue a new final render.",
        tags: ["video", "clone"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "regenerate_avatar",
        name: "Regenerate Avatar",
        description: "Regenerate narrator avatar video assets for an existing Samsar video session.",
        tags: ["video", "avatar", "rerender"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "add_outro_image",
        name: "Add Outro Image",
        description: "Add an outro image or generated CTA outro to an existing video.",
        tags: ["video", "outro", "cta"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "update_outro_image",
        name: "Update Outro Image",
        description: "Update the outro image or generated CTA outro for an existing video.",
        tags: ["video", "outro", "cta"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "update_footer_image",
        name: "Update Footer CTA",
        description: "Update or remove footer CTA metadata on an existing video.",
        tags: ["video", "footer", "cta"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "join_videos",
        name: "Join Videos",
        description: "Join two or more Samsar video sessions into a single output video.",
        tags: ["video", "join", "stitch"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "video/mp4"],
      },
      {
        id: "get_credits",
        name: "Get Credits",
        description: "Fetch the resolved Samsar actor's credit balance.",
        tags: ["billing", "credits"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_credits_recharge",
        name: "Create Credits Recharge",
        description: "Create a checkout link to recharge Samsar credits for the resolved actor.",
        tags: ["billing", "credits", "checkout"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "grant_credits",
        name: "Grant Credits",
        description: "Grant credits to a resolved external user.",
        tags: ["billing", "credits", "external-user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_payment_status",
        name: "Get Payment Status",
        description: "Poll checkout, payment intent, or setup intent status.",
        tags: ["billing", "payment"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_login_token",
        name: "Create Login Token",
        description: "Create a short-lived Samsar login token for the resolved actor.",
        tags: ["login", "auth"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_user_recharge_credits",
        name: "Create User Recharge",
        description: "Create a checkout link for a programmatic Samsar user credit recharge by email.",
        tags: ["billing", "credits", "user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "refresh_user_token",
        name: "Refresh User Token",
        description: "Rotate a programmatic Samsar user refresh token.",
        tags: ["login", "auth", "user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_user_app_key",
        name: "Create User App Key",
        description: "Create a long-running APP_KEY for an authenticated Samsar user.",
        tags: ["login", "auth", "app-key"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_user_app_key",
        name: "Get User App Key",
        description: "Fetch active APP_KEY metadata for an authenticated Samsar user.",
        tags: ["login", "auth", "app-key"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "refresh_user_app_key",
        name: "Refresh User App Key",
        description: "Rotate a long-running Samsar APP_KEY.",
        tags: ["login", "auth", "app-key"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "revoke_user_app_key",
        name: "Revoke User App Key",
        description: "Revoke the active APP_KEY for an authenticated Samsar user.",
        tags: ["login", "auth", "app-key"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_user_credits",
        name: "Get User Credits",
        description: "Fetch authenticated Samsar user credits.",
        tags: ["billing", "credits", "user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_user_usage_logs",
        name: "Get User Usage Logs",
        description: "Fetch authenticated Samsar user credit usage logs.",
        tags: ["billing", "usage", "user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_user_payment_status",
        name: "Get User Payment Status",
        description: "Poll authenticated Samsar user payment status.",
        tags: ["billing", "payment", "user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_external_user",
        name: "Create External User",
        description: "Create or update an external user under the authenticated internal account.",
        tags: ["account", "external-user"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
    supportedInterfaces: [
      {
        url: a2aUrl(config),
        protocolBinding: "JSONRPC",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
      {
        url: config.publicBaseUrl,
        protocolBinding: "HTTP+JSON",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
  };
}
