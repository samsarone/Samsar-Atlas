const DEFAULT_ATLAS_BASE_URL = import.meta.env.VITE_ATLAS_BASE_URL || "";
const DEFAULT_DEMO_PROXY_BASE_URL = import.meta.env.VITE_DEMO_PROXY_BASE_URL || "/demo/storefront";

function cleanBaseUrl(value) {
  return (value || DEFAULT_ATLAS_BASE_URL).trim().replace(/\/$/, "");
}

function rpcId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function authHeaders(settings) {
  const agentId = settings.agentId?.trim();
  const agentSecret = settings.agentSecret?.trim();

  if (!agentId || !agentSecret) {
    throw new Error("Atlas agent id and agent secret are required.");
  }

  return {
    "content-type": "application/json",
    "x-atlas-agent-id": agentId,
    Authorization: `Bearer ${agentSecret}`,
  };
}

function atlasUrl(settings, path) {
  return `${cleanBaseUrl(settings.baseUrl)}${path}`;
}

function demoProxyUrl(settings, path) {
  return `${cleanBaseUrl(settings.demoProxyBaseUrl || DEFAULT_DEMO_PROXY_BASE_URL)}${path}`;
}

function useDemoProxy(settings) {
  return settings.useDemoProxy !== false;
}

function requestHeaders(settings) {
  if (useDemoProxy(settings)) {
    return {
      "content-type": "application/json",
      ...(settings.adminToken ? { Authorization: `Bearer ${settings.adminToken}` } : {}),
    };
  }
  return authHeaders(settings);
}

function authOnlyHeaders(settings) {
  return useDemoProxy(settings) && settings.adminToken
    ? { Authorization: `Bearer ${settings.adminToken}` }
    : authHeaders(settings);
}

function a2aUrl(settings) {
  return useDemoProxy(settings) ? demoProxyUrl(settings, "/a2a") : atlasUrl(settings, "/a2a");
}

function absoluteImageUrl(image) {
  return new URL(image.url, window.location.origin).href;
}

function absoluteUrl(value) {
  return new URL(value, window.location.origin).href;
}

function productStorefrontUrl(product) {
  return absoluteUrl(`/products/${product.id}`);
}

function productImageInput(product, image, index) {
  const title = `${product.title} view ${index + 1}`;
  return {
    image_url: absoluteImageUrl(image),
    title,
    label: title,
    image_title: title,
    image_alt: image.alt,
    source_name: image.sourceName,
    source_url: image.sourceUrl,
    product_id: product.id,
    sku: product.sku,
  };
}

export function defaultAtlasSettings() {
  return {
    baseUrl: DEFAULT_ATLAS_BASE_URL,
    demoProxyBaseUrl: DEFAULT_DEMO_PROXY_BASE_URL,
    useDemoProxy: import.meta.env.VITE_USE_DEMO_PROXY !== "false",
    agentId: import.meta.env.VITE_ATLAS_AGENT_ID || "",
    agentSecret: import.meta.env.VITE_ATLAS_AGENT_SECRET || "",
    credits: 100,
    email: "",
    videoModel: "VEO3.1I2VFAST",
    aspectRatio: "16:9",
  };
}

export function buildProductVideoPrompt(product, customPrompt = "") {
  const merchandisingPrompt = [
    `Create a polished ecommerce product video for ${product.title} by ${product.brand}.`,
    `Category: ${product.category}. Price: $${product.price}.`,
    `Product story: ${product.description}`,
    `Highlights: ${product.features.join(", ")}.`,
    "Use premium product lighting, smooth camera motion, clean transitions, and a concise storefront call-to-action.",
  ].join(" ");

  return customPrompt.trim() ? `${merchandisingPrompt} ${customPrompt.trim()}` : merchandisingPrompt;
}

export function buildImageListToVideoRpc(product, prompt, settings) {
  const id = rpcId(`storefront-${product.id}`);
  const imageInputs = product.images.map((image, index) => productImageInput(product, image, index));
  const includeOutro = product.outroEnabled === true;
  const outroImageUrl =
    includeOutro && typeof product.outroImageUrl === "string" && product.outroImageUrl.trim()
      ? absoluteUrl(product.outroImageUrl.trim())
      : "";
  const ctaUrl =
    includeOutro && typeof product.outroCtaUrl === "string" && product.outroCtaUrl.trim()
      ? absoluteUrl(product.outroCtaUrl.trim())
      : productStorefrontUrl(product);
  const outroTopText =
    (includeOutro && typeof product.outroTextTop === "string" && product.outroTextTop.trim()) ||
    product.title.toUpperCase();
  const outroBottomText =
    (includeOutro && typeof product.outroTextBottom === "string" && product.outroTextBottom.trim()) ||
    "Shop the Atlas Market demo";

  return {
    jsonrpc: "2.0",
    id,
    method: "SendMessage",
    params: {
      metadata: {
        skill: "image_list_to_video",
        productId: product.id,
        sku: product.sku,
      },
      message: {
        role: "ROLE_USER",
        messageId: `msg-${id}`,
        parts: [
          {
            kind: "data",
            data: {
              input: {
                image_urls: imageInputs,
                prompt,
                metadata: {
                  product_id: product.id,
                  sku: product.sku,
                  title: product.title,
                  brand: product.brand,
                  category: product.category,
                  price_usd: product.price,
                  features: product.features,
                },
                video_model: settings.videoModel,
                aspect_ratio: settings.aspectRatio || "16:9",
                ...(product.addNarratorAvatar === true ? { add_narrator_avatar: true } : {}),
                ...(includeOutro
                  ? {
                      cta_url: ctaUrl,
                      generate_outro_image: !outroImageUrl,
                      ...(outroImageUrl ? { outro_image_url: outroImageUrl } : {}),
                      cta_text_top: outroTopText,
                      cta_text_bottom: outroBottomText,
                    }
                  : {}),
              },
            },
          },
        ],
      },
    },
  };
}

export async function sendImageListToVideo(product, prompt, settings, requestOverride) {
  const request = requestOverride || buildImageListToVideoRpc(product, prompt, settings);
  const response = await fetch(a2aUrl(settings), {
    method: "POST",
    headers: requestHeaders(settings),
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    const message = body.error?.message || body.message || `Atlas request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return {
    request,
    response: body,
    task: body.result?.task || body.task,
  };
}

export async function getTask(taskId, settings) {
  const request = {
    jsonrpc: "2.0",
    id: rpcId("status"),
    method: "GetTask",
    params: {
      id: taskId,
    },
  };

  const response = await fetch(a2aUrl(settings), {
    method: "POST",
    headers: requestHeaders(settings),
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    const message = body.error?.message || body.message || `Task polling failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return {
    request,
    response: body,
    task: body.result?.task || body.task || body,
  };
}

function checkoutUrl(payload) {
  return firstString(
    payload?.url,
    payload?.checkout_url,
    payload?.checkoutUrl,
    payload?.payment_url,
    payload?.paymentUrl,
    payload?.session_url,
    payload?.recharge?.url,
    payload?.recharge?.checkout_url,
    payload?.checkout?.url,
    payload?.checkout?.checkout_url,
  );
}

export async function getDemoProxyConfig(settings) {
  const response = await fetch(demoProxyUrl(settings, "/config"));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Demo proxy config failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function loginDemoAdmin(settings, credentials) {
  const response = await fetch(demoProxyUrl(settings, "/admin/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Admin login failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function getDemoAdminSession(settings) {
  const response = await fetch(demoProxyUrl(settings, "/admin/me"), {
    headers: settings.adminToken ? { Authorization: `Bearer ${settings.adminToken}` } : {},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Admin session check failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function connectAgent(settings) {
  const response = await fetch(
    useDemoProxy(settings) ? demoProxyUrl(settings, "/agent") : atlasUrl(settings, "/agents/me"),
    {
      headers: authOnlyHeaders(settings),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Agent connect failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function registerAgent(settings) {
  const credits = Number(settings.credits);
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("Credits must be a positive integer.");
  }

  const response = await fetch(atlasUrl(settings, "/agents/register"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credits,
      email: settings.email || undefined,
      displayName: "Atlas Market Demo Admin",
      externalAgentId: "atlas-market-sample-client",
      metadata: {
        source: "atlas-market-sample-storefront",
      },
      success_url: `${window.location.origin}/?view=admin&payment=success`,
      cancel_url: `${window.location.origin}/?view=admin&payment=cancelled`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Agent registration failed with HTTP ${response.status}.`);
  }
  return {
    ...body,
    checkoutUrl: checkoutUrl(body),
  };
}

export async function createRecharge(settings) {
  const credits = Number(settings.credits);
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("Credits must be a positive integer.");
  }

  const response = await fetch(
    useDemoProxy(settings) ? demoProxyUrl(settings, "/recharge") : atlasUrl(settings, "/agents/billing/recharge"),
    {
      method: "POST",
      headers: requestHeaders(settings),
      body: JSON.stringify({
        credits,
        success_url: `${window.location.origin}/?view=admin&payment=success`,
        cancel_url: `${window.location.origin}/?view=admin&payment=cancelled`,
        metadata: {
          source: "atlas-market-sample-storefront",
        },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Credit checkout failed with HTTP ${response.status}.`);
  }
  return {
    ...body,
    checkoutUrl: checkoutUrl(body),
  };
}

export async function getPaymentStatus(settings) {
  const response = await fetch(
    useDemoProxy(settings)
      ? demoProxyUrl(settings, "/payment-status")
      : atlasUrl(settings, "/agents/billing/payment-status"),
    {
      headers: authOnlyHeaders(settings),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Payment status failed with HTTP ${response.status}.`);
  }
  return body;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function rawSamsarPayload(task) {
  const artifact = task?.artifacts?.find((item) => item.name === "samsar-response");
  return artifact?.parts?.find((part) => part.data)?.data || {};
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
}

export function extractVideoResult(task) {
  const resultArtifact = task?.artifacts?.find((item) => item.name === "result-video");
  const artifactUrl = resultArtifact?.parts?.find((part) => part.url)?.url;
  const payload = rawSamsarPayload(task);
  const resultUrls = Array.isArray(payload.result_urls) ? payload.result_urls : [];

  return {
    videoUrl: firstString(
      artifactUrl,
      payload.result_url,
      resultUrls[0],
      payload.video_url,
      payload.output?.video_url,
      payload.session?.video_url,
      payload.latest_video_url,
      payload.final_video_url,
    ),
    posterUrl: firstString(
      payload.poster_url,
      payload.thumbnail_url,
      payload.output?.poster_url,
      payload.session?.poster_url,
      payload.session?.thumbnail_url,
      payload.image_url,
    ),
    durationSec:
      typeof payload.duration_sec === "number"
        ? payload.duration_sec
        : typeof payload.duration === "number"
          ? payload.duration
          : undefined,
  };
}

export function extractGenerationProgress(task) {
  const payload = rawSamsarPayload(task);
  return firstObject(
    payload.expressGenerationStatus,
    payload.express_generation_status,
    payload.generationStatus,
    payload.generation_status,
    payload.statusDetail,
    payload.status_detail,
    payload.statusDetails,
    payload.status_details,
    payload.session?.expressGenerationStatus,
    payload.session?.express_generation_status,
  );
}

function isVideoUrl(value) {
  return typeof value === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(value);
}

function isGeneratedOutroLayer(layer) {
  const items = Array.isArray(layer?.image?.items) ? layer.image.items : [];
  return Boolean(
    layer?.isGeneratedOutroLayer ||
      layer?.generatedOutroTilesPending ||
      layer?.image?.url?.includes("/video/outro/") ||
      layer?.preview?.url?.includes("/video/outro/") ||
      items.some((item) => item?.isGeneratedOutroTile || String(item?.image || "").includes("server_generated_outro")),
  );
}

export function extractLayerPreviews(task) {
  const payload = rawSamsarPayload(task);
  const layers = Array.isArray(payload.session?.layers) ? payload.session.layers : [];

  return layers
    .map((layer, index) => {
      const items = Array.isArray(layer?.image?.items) ? layer.image.items : [];
      const primaryItem = items.find((item) => item?.isPrimary || item?.is_base_image) || items[0];
      const url = firstString(
        layer?.preview?.url,
        layer?.aiVideo?.url,
        layer?.aiVideo?.videoUrl,
        layer?.aiVideo?.video_url,
        layer?.userVideo?.url,
        layer?.video?.url,
        layer?.image?.url,
        primaryItem?.url,
      );
      if (!url) return null;

      const type = layer?.preview?.type === "video" || isVideoUrl(url) ? "video" : "image";
      return {
        index,
        url,
        type,
        label: isGeneratedOutroLayer(layer) ? `Layer ${index + 1}: outro` : `Layer ${index + 1}`,
        isOutro: isGeneratedOutroLayer(layer),
        stage: layer?.preview?.stage || layer?.status || "",
      };
    })
    .filter(Boolean);
}

export function taskStatus(task) {
  const state = task?.status?.state || "";
  if (state === "TASK_STATE_COMPLETED") return "completed";
  if (state === "TASK_STATE_FAILED" || state === "TASK_STATE_CANCELED" || state === "TASK_STATE_REJECTED") {
    return "failed";
  }
  if (state === "TASK_STATE_WORKING" || state === "TASK_STATE_INPUT_REQUIRED") return "processing";
  return "queued";
}
