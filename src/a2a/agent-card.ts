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
      "A2A gateway for Samsar video generation and agent-scoped billing through Atlas-managed sub-accounts.",
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
      atlasBearer: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "Atlas agent secret",
          description: "Use Authorization: Bearer <Atlas agent secret>.",
        },
      },
      atlasAgentSecret: {
        apiKeySecurityScheme: {
          location: "header",
          name: "x-atlas-agent-secret",
          description: "Atlas-issued per-agent secret returned by /agents/register.",
        },
      },
    },
    securityRequirements: [
      { atlasBearer: [] },
      { atlasAgentSecret: [] },
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
        description: "Fetch the authenticated Atlas agent sub-account credit balance.",
        tags: ["billing", "credits"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "create_credits_recharge",
        name: "Create Credits Recharge",
        description: "Create a checkout link to recharge the authenticated Atlas agent sub-account.",
        tags: ["billing", "credits", "checkout"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "get_payment_status",
        name: "Get Payment Status",
        description: "Poll checkout, payment intent, or setup intent status for the authenticated Atlas agent.",
        tags: ["billing", "payment"],
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
