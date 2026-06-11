import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Film,
  Images,
  KeyRound,
  Loader2,
  LogIn,
  Play,
  Search,
  Settings,
  Sparkles,
  Tag,
} from "lucide-react";
import { categories, products } from "./data/products.js";
import {
  buildImageListToVideoRpc,
  buildProductVideoPrompt,
  connectAgent,
  createRecharge,
  defaultAtlasSettings,
  extractGenerationProgress,
  extractLayerPreviews,
  extractVideoResult,
  getPaymentStatus,
  getTask,
  loginDemoAdmin,
  registerAgent,
  sendImageListToVideo,
  taskStatus,
} from "./lib/a2a.js";
import { saveProductVideo, subscribeProductVideos } from "./lib/videoState.js";
import { isFirebaseConfigured } from "./lib/firebase.js";

const TERMINAL = new Set(["completed", "failed"]);
const SETTINGS_KEY = "atlas-market-admin-settings";
const PRODUCT_ROUTE_PREFIX = "/products/";
const GENERATION_STEPS = [
  { key: "prompt_generation", label: "Prompt planning" },
  { key: "image_generation", label: "Image generation" },
  { key: "speech_generation", label: "Speech generation" },
  { key: "music_generation", label: "Music generation" },
  { key: "audio_generation", label: "Audio generation" },
  { key: "ai_video_generation", label: "AI video generation" },
  { key: "delete_reflow", label: "Delete reflow" },
  { key: "timeline_reflowed", label: "Timeline reflow" },
  { key: "lip_sync_generation", label: "Lip sync" },
  { key: "sound_effect_generation", label: "Sound effects" },
  { key: "transcript_generation", label: "Transcript generation" },
  { key: "frame_generation", label: "Frame refinement" },
  { key: "video_generation", label: "Final render" },
];
const DEFAULT_GENERATION_STAGE_STATUS = {
  prompt_generation: "PENDING",
  image_generation: "PENDING",
  speech_generation: "INIT",
  music_generation: "INIT",
  audio_generation: "PENDING",
  ai_video_generation: "INIT",
  delete_reflow: "INIT",
  timeline_reflowed: "INIT",
  lip_sync_generation: "INIT",
  sound_effect_generation: "INIT",
  transcript_generation: "INIT",
  frame_generation: "INIT",
  video_generation: "INIT",
};

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeVideoModelSetting(value) {
  if (value === "VEO3.1FAST") return "VEO3.1I2VFAST";
  if (value === "VEO3.1") return "VEO3.1I2V";
  return value || "VEO3.1I2VFAST";
}

function loadSettings() {
  try {
    const settings = {
      ...defaultAtlasSettings(),
      ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}"),
    };
    return {
      ...settings,
      videoModel: normalizeVideoModelSetting(settings.videoModel),
    };
  } catch {
    return defaultAtlasSettings();
  }
}

function saveSettings(settings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function productPath(product) {
  return `${PRODUCT_ROUTE_PREFIX}${product.id}`;
}

function productStorefrontUrl(product) {
  return `${window.location.origin}${productPath(product)}`;
}

function findProduct(productId) {
  return products.find((product) => product.id === productId) || products[0];
}

function readRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const params = new URLSearchParams(window.location.search);

  if (path === "/admin" || params.get("view") === "admin") {
    return { view: "admin", productId: params.get("product") || products[0].id };
  }

  if (path.startsWith(PRODUCT_ROUTE_PREFIX)) {
    return { view: "product", productId: decodeURIComponent(path.slice(PRODUCT_ROUTE_PREFIX.length)) };
  }

  return { view: "storefront", productId: products[0].id };
}

function statusLabel(value) {
  if (value === "completed") return "Completed";
  if (value === "processing") return "Processing";
  if (value === "failed") return "Failed";
  if (value === "queued") return "Queued";
  return "No render";
}

function imageUrlFromPayloadEntry(entry) {
  if (!entry || typeof entry !== "object") return "";
  return entry.image_url || "";
}

function getSubmittedImageUrls(video) {
  const sourceImages = Array.isArray(video?.sourceImages) ? video.sourceImages.filter(Boolean) : [];
  if (sourceImages.length) return sourceImages;

  const payloadImages =
    video?.initialRequest?.params?.message?.parts?.[0]?.data?.input?.image_urls ||
    video?.initialRequest?.params?.message?.parts?.[0]?.data?.image_urls;
  return Array.isArray(payloadImages) ? payloadImages.map(imageUrlFromPayloadEntry).filter(Boolean) : [];
}

function videoPoster(product, video) {
  return video?.posterUrl || getSubmittedImageUrls(video)[0] || product.images[0]?.url || "";
}

function renderAspectRatio(video, fallback = "16:9") {
  const payloadAspectRatio = video?.initialRequest?.params?.message?.parts?.[0]?.data?.input?.aspect_ratio;
  return video?.aspectRatio || payloadAspectRatio || fallback || "16:9";
}

function aspectRatioClassName(aspectRatio) {
  return aspectRatio === "9:16" ? "portrait" : "landscape";
}

function createProductDraft(product) {
  return {
    ...product,
    price: String(product.price),
    compareAt: String(product.compareAt),
    inventory: String(product.inventory),
    featuresText: product.features.join("\n"),
    selectedImageUrls: product.images.map((image) => image.url),
    addNarratorAvatar: false,
    outroEnabled: false,
    outroImageUrl: "",
    outroCtaUrl: productStorefrontUrl(product),
    outroTextTop: product.title.toUpperCase(),
    outroTextBottom: "Shop the Atlas Market demo",
    images: product.images.map((image) => ({ ...image })),
  };
}

function normalizeDraftProduct(draft) {
  const features = draft.featuresText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedImages = draft.images.filter((image) => draft.selectedImageUrls.includes(image.url));

  return {
    ...draft,
    price: Number(draft.price) || 0,
    compareAt: Number(draft.compareAt) || 0,
    inventory: Number(draft.inventory) || 0,
    features,
    images: selectedImages,
  };
}

function extractCredits(body) {
  const candidates = [
    body?.credits,
    body?.availableCredits,
    body?.available_credits,
    body?.balance,
    body?.agent?.credits,
    body?.agent?.availableCredits,
    body?.agent?.available_credits,
    body?.agent?.balance,
    body?.billing?.credits,
    body?.billing?.availableCredits,
    body?.billing?.available_credits,
  ];
  return candidates.find((value) => Number.isFinite(Number(value)));
}

function createRenderId(productId) {
  return `${productId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function taskForRender(render) {
  return render?.lastTask || render?.lastStatusResponse?.result?.task || render?.initialResponse?.result?.task || null;
}

function getSceneLayerCount(render) {
  const task = taskForRender(render);
  if (!task) return null;
  const previews = extractLayerPreviews(task);
  if (!previews.length) return null;
  return previews.filter((preview) => !preview.isOutro).length;
}

function hasOnlyOutroLayers(render) {
  const task = taskForRender(render);
  if (!task) return false;
  const previews = extractLayerPreviews(task);
  return previews.length > 0 && previews.every((preview) => preview.isOutro);
}

function renderSceneError(render) {
  if (!render || render.status !== "completed") return "";
  if (getSubmittedImageUrls(render).length && hasOnlyOutroLayers(render)) {
    return "Processor completed without product image scene layers.";
  }
  return "";
}

function canDisplayRender(render) {
  return Boolean(render?.videoUrl && render.status === "completed" && !render.error && !renderSceneError(render));
}

function sortVideoHistory(videos) {
  return [...videos].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || left.updatedAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || right.updatedAt || "") || 0;
    return rightTime - leftTime;
  });
}

function productVideoState(productId, state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.videos)) {
    return { productId, videos: [] };
  }
  return {
    ...state,
    productId,
    videos: sortVideoHistory(state.videos.filter((video) => video?.renderId)),
  };
}

function getVideoHistory(productState) {
  return productVideoState(productState?.productId || "", productState).videos;
}

function getStorefrontVideos(productState) {
  return getVideoHistory(productState).filter((video) => video.displayOnStorefront === true && canDisplayRender(video));
}

function getLatestVideo(productState) {
  return getVideoHistory(productState)[0] || null;
}

function getProductStateStatus(productState) {
  return statusLabel(getLatestVideo(productState)?.status);
}

function upsertRender(productId, state, renderPatch) {
  const currentState = productVideoState(productId, state);
  const now = new Date().toISOString();
  const existing = currentState.videos.find((video) => video.renderId === renderPatch.renderId);
  const nextRender = {
    ...existing,
    ...renderPatch,
    productId,
    renderId: renderPatch.renderId,
    createdAt: existing?.createdAt || renderPatch.createdAt || now,
    updatedAt: now,
    displayOnStorefront:
      typeof renderPatch.displayOnStorefront === "boolean"
        ? renderPatch.displayOnStorefront
        : typeof existing?.displayOnStorefront === "boolean"
          ? existing.displayOnStorefront
          : canDisplayRender(renderPatch),
  };
  return {
    ...currentState,
    productId,
    updatedAt: now,
    videos: sortVideoHistory([
      nextRender,
      ...currentState.videos.filter((video) => video.renderId !== nextRender.renderId),
    ]),
  };
}

function ProductRating({ product }) {
  return (
    <div className="rating">
      <span>{"★".repeat(Math.round(product.rating))}</span>
      <small>
        {product.rating.toFixed(1)} ({product.reviews})
      </small>
    </div>
  );
}

function ProductMedia({ product, video }) {
  if (video?.videoUrl) {
    return (
      <video className="product-media" src={video.videoUrl} poster={videoPoster(product, video)} controls />
    );
  }

  return <img className="product-media" src={product.images[0].url} alt={product.images[0].alt} loading="lazy" />;
}

function Storefront({ selectedProduct, setSelectedProduct, videos, query, setQuery, category, setCategory, openProduct }) {
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const searchText = [product.title, product.brand, product.category, product.description, product.sku]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [category, query]);
  const selectedVideoState = productVideoState(selectedProduct.id, videos[selectedProduct.id]);
  const selectedDisplayVideos = getStorefrontVideos(selectedVideoState);
  const selectedPrimaryVideo = selectedDisplayVideos[0] || null;

  return (
    <main className="storefront">
      <section className="commerce-bar">
        <div className="search-shell">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Atlas Market" />
        </div>
        <div className="category-row">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={item === category ? "chip active" : "chip"}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="detail-band">
        <div className="detail-copy">
          <p className="eyebrow">{selectedProduct.category}</p>
          <h1>{selectedProduct.title}</h1>
          <p>{selectedProduct.description}</p>
          <div className="detail-actions">
            <button type="button" className="primary-button" onClick={() => openProduct(selectedProduct)}>
              <Images size={18} />
              View Details
            </button>
            <span className="inventory">
              <Boxes size={16} />
              {selectedDisplayVideos.length
                ? `${selectedDisplayVideos.length} storefront video${selectedDisplayVideos.length === 1 ? "" : "s"}`
                : `${selectedProduct.images.length} public-source images`}
            </span>
          </div>
        </div>
        <div className="detail-media">
          <ProductMedia product={selectedProduct} video={selectedPrimaryVideo} />
        </div>
      </section>

      <section className="product-grid">
        {visibleProducts.map((product) => {
          const displayVideoCount = getStorefrontVideos(productVideoState(product.id, videos[product.id])).length;
          return (
            <button
              key={product.id}
              type="button"
              className={product.id === selectedProduct.id ? "product-card selected" : "product-card"}
              onClick={() => {
                setSelectedProduct(product);
                openProduct(product);
              }}
            >
              <div className="product-image-wrap">
                <img src={product.images[0].url} alt={product.images[0].alt} loading="lazy" />
                {displayVideoCount ? (
                  <span className="video-badge">
                    <Film size={14} />
                    {displayVideoCount === 1 ? "Video" : `${displayVideoCount} videos`}
                  </span>
                ) : null}
              </div>
              <div className="product-card-body">
                <div>
                  <p className="muted">{product.brand}</p>
                  <h2>{product.title}</h2>
                </div>
                <ProductRating product={product} />
                <div className="price-row">
                  <strong>{formatPrice(product.price)}</strong>
                  <span>{formatPrice(product.compareAt)}</span>
                </div>
                <p className="small-line">{product.badge}</p>
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function ProductDetails({ product, videoState, onBack, openAdmin }) {
  const [activeImageUrl, setActiveImageUrl] = useState(product.images[0].url);
  const activeImage = product.images.find((item) => item.url === activeImageUrl) || product.images[0];
  const productState = productVideoState(product.id, videoState);
  const displayVideos = getStorefrontVideos(productState);
  const status = displayVideos.length ? "Completed" : getProductStateStatus(productState);

  useEffect(() => {
    setActiveImageUrl(product.images[0].url);
  }, [product]);

  return (
    <main className="product-page">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={17} />
        Storefront
      </button>

      <section className="product-detail-layout">
        <div className="gallery-panel">
          <div className="gallery-main">
            <img src={activeImage.url} alt={activeImage.alt} />
          </div>
          <div className="thumbnail-row">
            {product.images.map((item) => (
              <button
                key={item.url}
                type="button"
                className={item.url === activeImage.url ? "thumbnail active" : "thumbnail"}
                onClick={() => setActiveImageUrl(item.url)}
              >
                <img src={item.url} alt={item.alt} />
              </button>
            ))}
          </div>
        </div>

        <div className="product-info-panel">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.title}</h1>
          <p className="brand-line">{product.brand}</p>
          <ProductRating product={product} />
          <div className="price-row large">
            <strong>{formatPrice(product.price)}</strong>
            <span>{formatPrice(product.compareAt)}</span>
          </div>
          <p className="detail-description">{product.description}</p>
          <div className="detail-metrics">
            <span>
              <small>SKU</small>
              {product.sku}
            </span>
            <span>
              <small>Images</small>
              {product.images.length}
            </span>
            <span>
              <small>Videos</small>
              {displayVideos.length || status}
            </span>
          </div>
          <div className="feature-list">
            {product.features.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
          <button type="button" className="secondary-button wide" onClick={() => openAdmin(product)}>
            <Film size={17} />
            Open in Admin
          </button>
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading">
          <Images size={18} />
          <h2>Image Set</h2>
        </div>
        <div className="detail-image-grid">
          {product.images.map((item) => (
            <figure key={item.url}>
              <img src={item.url} alt={item.alt} loading="lazy" />
              <figcaption>
                <span>{item.alt}</span>
                <small>{item.sourceName}</small>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  {item.license}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading">
          <Film size={18} />
          <h2>Generated Videos</h2>
        </div>
        {displayVideos.length ? (
          <div className="storefront-video-grid">
            {displayVideos.map((video, index) => (
              <figure key={video.renderId} className="storefront-video-card">
                <video src={video.videoUrl} poster={videoPoster(product, video)} controls />
                <figcaption>
                  <strong>Render {displayVideos.length - index}</strong>
                  <span>{new Date(video.createdAt || video.updatedAt).toLocaleString()}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="video-placeholder">
            <Play size={30} />
            <span>{status}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function AdminImageManager({ draft, setDraft }) {
  function updateImage(url, key, value) {
    setDraft((current) => ({
      ...current,
      images: current.images.map((image) => (image.url === url ? { ...image, [key]: value } : image)),
    }));
  }

  function setImageSelected(url, checked) {
    setDraft((current) => {
      const selectedImageUrls = checked
        ? Array.from(new Set([...current.selectedImageUrls, url]))
        : current.selectedImageUrls.filter((item) => item !== url);

      return {
        ...current,
        selectedImageUrls,
      };
    });
  }

  return (
    <div className="admin-image-grid">
      {draft.images.map((image, index) => (
        <div key={image.url} className={draft.selectedImageUrls.includes(image.url) ? "admin-image-card selected" : "admin-image-card"}>
          <label className="admin-image-toggle">
            <input
              type="checkbox"
              checked={draft.selectedImageUrls.includes(image.url)}
              onChange={(event) => setImageSelected(image.url, event.target.checked)}
            />
            <img src={image.url} alt={image.alt} />
            <span>{draft.selectedImageUrls.includes(image.url) ? "Included in payload" : "Excluded from payload"}</span>
          </label>
          <div className="admin-image-fields">
            <label className="field compact-field">
              <span>Alt text</span>
              <input value={image.alt} onChange={(event) => updateImage(image.url, "alt", event.target.value)} />
            </label>
            <div className="two-field-row">
              <label className="field compact-field">
                <span>Source</span>
                <input value={image.sourceName} onChange={(event) => updateImage(image.url, "sourceName", event.target.value)} />
              </label>
              <label className="field compact-field">
                <span>License</span>
                <input value={image.license} onChange={(event) => updateImage(image.url, "license", event.target.value)} />
              </label>
            </div>
            <a href={image.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Source {index + 1}
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function humanizeGenerationStageKey(key) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeGenerationStageStatus(status) {
  if (typeof status !== "string") return "INIT";
  return status.trim().toUpperCase() || "INIT";
}

function getOrderedGenerationStageEntries(progress) {
  const stageMap = new Map(GENERATION_STEPS.map((stage) => [stage.key, stage.label]));
  const knownKeys = GENERATION_STEPS.map((stage) => stage.key);
  const extraKeys = Object.keys(progress || {}).filter((key) => key !== "status" && !stageMap.has(key));

  return [...knownKeys, ...extraKeys].map((key) => ({
    key,
    label: stageMap.get(key) || humanizeGenerationStageKey(key),
    status: normalizeGenerationStageStatus(progress?.[key] || DEFAULT_GENERATION_STAGE_STATUS[key] || "INIT"),
  }));
}

function getProgressSummary(stageEntries) {
  if (!stageEntries.length) {
    return { percent: 8, label: "Waiting for generation stages" };
  }

  const completed = stageEntries.filter((entry) => entry.status === "COMPLETED").length;
  const percent = completed === stageEntries.length ? 100 : Math.max(8, Math.round((completed / stageEntries.length) * 100));
  const activeStage =
    stageEntries.find((entry) => entry.status === "IN_PROGRESS") ||
    stageEntries.find((entry) => entry.status === "PENDING") ||
    stageEntries.find((entry) => entry.status === "INIT") ||
    stageEntries.find((entry) => entry.status !== "COMPLETED");

  return {
    percent,
    label: activeStage ? activeStage.label : "Preparing preview",
  };
}

function StageRow({ label, status }) {
  const normalized = normalizeGenerationStageStatus(status);
  return (
    <div className={`stage-row ${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <span>{label}</span>
      <strong>{normalized}</strong>
    </div>
  );
}

function RenderStagePreview({ video, aspectRatio = "16:9" }) {
  const progress = video?.progress || video?.generationProgress || null;
  const stageEntries = getOrderedGenerationStageEntries(progress);
  const summary = getProgressSummary(stageEntries);
  const submittedImageUrls = getSubmittedImageUrls(video);
  const previewAspectRatio = renderAspectRatio(video, aspectRatio);
  const layerPreviews = extractLayerPreviews(
    video?.lastTask ||
      video?.lastStatusResponse?.result?.task ||
      video?.initialResponse?.result?.task,
  );
  const primaryPreview = layerPreviews[0];
  const submittedPreviewUrl = submittedImageUrls[0];

  return (
    <div className={`render-stage-preview ${aspectRatioClassName(previewAspectRatio)}`}>
      <div className="render-stage-media">
        {primaryPreview ? (
          primaryPreview.type === "video" ? (
            <video src={primaryPreview.url} muted autoPlay loop playsInline />
          ) : (
            <img src={primaryPreview.url} alt={primaryPreview.label} />
          )
        ) : submittedPreviewUrl ? (
          <img src={submittedPreviewUrl} alt="Submitted image 1" />
        ) : (
          <div className="render-stage-empty">
            <Film size={30} />
            <span>No processor layer preview yet</span>
          </div>
        )}
        <div className="render-stage-overlay">
          <Loader2 size={24} className="spin" />
          <span>{summary.label}</span>
        </div>
      </div>
      <div className="render-stage-body">
        <div className="render-stage-head">
          <div>
            <small>{layerPreviews.length ? "Processor status detail" : "Submitted payload preview"}</small>
            <strong>
              {layerPreviews.length
                ? `${layerPreviews.length} returned layer preview${layerPreviews.length === 1 ? "" : "s"}`
                : submittedImageUrls.length
                  ? `${submittedImageUrls.length} submitted image${submittedImageUrls.length === 1 ? "" : "s"}; waiting for processor layers`
                  : summary.label}
            </strong>
          </div>
          <span>{summary.percent}%</span>
        </div>
        {layerPreviews.length ? (
          <div className="layer-preview-strip">
            {layerPreviews.map((preview) => (
              <span key={`${preview.index}-${preview.url}`} className={preview.isOutro ? "outro" : ""}>
                {preview.type === "video" ? <video src={preview.url} muted playsInline /> : <img src={preview.url} alt="" />}
                {preview.label}
              </span>
            ))}
          </div>
        ) : submittedImageUrls.length ? (
          <div className="layer-preview-strip submitted">
            {submittedImageUrls.map((url, index) => (
              <span key={`${index}-${url}`}>
                <img src={url} alt="" />
                Submitted image {index + 1}
              </span>
            ))}
          </div>
        ) : null}
        <div className="render-progress-track">
          <div style={{ width: `${summary.percent}%` }} />
        </div>
        <div className="stage-grid">
          {stageEntries.map((step) => (
            <StageRow key={step.key} label={step.label} status={step.status} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Admin({ selectedProduct, setSelectedProduct, videos, setVideos }) {
  const [settings, setSettings] = useState(loadSettings);
  const [loginForm, setLoginForm] = useState({ username: settings.adminUsername || "admin", password: "" });
  const [prompt, setPrompt] = useState(() => buildProductVideoPrompt(selectedProduct));
  const [draft, setDraft] = useState(() => createProductDraft(selectedProduct));
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [agentNotice, setAgentNotice] = useState("");
  const [availableCredits, setAvailableCredits] = useState(null);
  const [liveVideoState, setLiveVideoState] = useState(null);
  const [activeRenderId, setActiveRenderId] = useState("");
  const videosRef = useRef(videos);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    const nextDraft = createProductDraft(selectedProduct);
    setDraft(nextDraft);
    setPrompt(buildProductVideoPrompt(nextDraft));
    setLiveVideoState(null);
    setActiveRenderId("");
  }, [selectedProduct]);

  const draftProduct = useMemo(() => normalizeDraftProduct(draft), [draft]);
  const payloadRequest = useMemo(
    () => buildImageListToVideoRpc(draftProduct, prompt, settings),
    [draftProduct, prompt, settings],
  );
  const payloadPreview = useMemo(() => JSON.stringify(payloadRequest, null, 2), [payloadRequest]);

  function updateSetting(key, value) {
    const next = { ...settings, [key]: key === "videoModel" ? normalizeVideoModelSetting(value) : value };
    setSettings(next);
    saveSettings(next);
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    setAgentNotice("Signing in");
    try {
      const session = await loginDemoAdmin(settings, loginForm);
      const next = {
        ...settings,
        adminToken: session.token,
        adminUsername: session.username,
      };
      setSettings(next);
      saveSettings(next);
      setLoginForm((current) => ({ ...current, password: "" }));
      setAgentNotice("Admin session active");
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Admin login failed.");
    }
  }

  function handleAdminLogout() {
    const next = { ...settings, adminToken: "" };
    setSettings(next);
    saveSettings(next);
    setAgentNotice("Admin session cleared");
  }

  async function handleConnectAgent() {
    setAgentNotice("Checking account");
    try {
      const body = await connectAgent(settings);
      const credits = extractCredits(body);
      if (credits !== undefined) setAvailableCredits(Number(credits));
      setAgentNotice(`Account ${body.agent?.id || "connected"}: ${body.agent?.status || "ready"}`);
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Account check failed.");
    }
  }

  async function handleRegisterAgent() {
    setAgentNotice("Creating account checkout");
    try {
      const body = await registerAgent(settings);
      const next = {
        ...settings,
        useDemoProxy: false,
        agentId: body.credentials?.agentId || settings.agentId,
        agentSecret: body.credentials?.agentSecret || settings.agentSecret,
      };
      setSettings(next);
      saveSettings(next);
      setAgentNotice(`Account ${body.credentials?.agentId || "created"} registered`);
      if (body.checkoutUrl) {
        window.open(body.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Account registration failed.");
    }
  }

  async function handleRecharge() {
    setAgentNotice("Creating credit checkout");
    try {
      const body = await createRecharge(settings);
      setAgentNotice("Credit checkout created");
      if (body.checkoutUrl) {
        window.open(body.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Credit checkout failed.");
    }
  }

  async function handlePaymentStatus() {
    setAgentNotice("Checking payment");
    try {
      const body = await getPaymentStatus(settings);
      const credits = extractCredits(body);
      if (credits !== undefined) setAvailableCredits(Number(credits));
      setAgentNotice(`Payment status: ${body.status || body.payment_status || body.agent?.status || "unknown"}`);
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Payment status failed.");
    }
  }

  async function persistFromTask(product, task, renderId, patch = {}) {
    const status = taskStatus(task);
    const result = extractVideoResult(task);
    const progress = extractGenerationProgress(task);
    const nextRender = {
      renderId,
      productId: product.id,
      taskId: task?.id || patch.taskId,
      status,
      videoUrl: result.videoUrl || patch.videoUrl || "",
      posterUrl: result.posterUrl || patch.posterUrl || "",
      durationSec: result.durationSec || patch.durationSec,
      aspectRatio: patch.aspectRatio || settings.aspectRatio || "16:9",
      addNarratorAvatar: product.addNarratorAvatar === true,
      progress: progress || patch.progress || null,
      sourceImages: product.images.map((image) => image.url),
      prompt,
      lastTask: task,
      ...patch,
    };
    const sceneError = renderSceneError(nextRender);
    const renderWithValidation = sceneError
      ? {
        ...nextRender,
        status: "failed",
        error: sceneError,
        displayOnStorefront: false,
      }
      : nextRender;
    const nextProductState = upsertRender(product.id, videosRef.current[product.id], renderWithValidation);
    await saveProductVideo(product.id, nextProductState, settings);
    videosRef.current = {
      ...videosRef.current,
      [product.id]: nextProductState,
    };
    const currentRender = nextProductState.videos.find((video) => video.renderId === renderId) || renderWithValidation;
    setLiveVideoState(currentRender);
    setVideos(videosRef.current);
    return currentRender;
  }

  async function pollUntilDone(product, taskId, renderId) {
    let latestState = null;
    for (let attempt = 0; attempt < 36; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 1200 : 8000));
      const statusResult = await getTask(taskId, settings);
      latestState = await persistFromTask(product, statusResult.task, renderId, {
        lastStatusRequest: statusResult.request,
        lastStatusResponse: statusResult.response,
      });
      setNotice(`${product.title}: ${statusLabel(latestState.status)}`);
      if (TERMINAL.has(latestState.status)) {
        return latestState;
      }
    }
    return latestState;
  }

  async function handleGenerate() {
    if (!draftProduct.images.length) {
      setNotice("Select at least one product image before rendering.");
      return;
    }

    setIsRunning(true);
    setNotice("Submitting render");
    const renderId = createRenderId(draftProduct.id);
    setActiveRenderId(renderId);
    try {
      const submit = await sendImageListToVideo(draftProduct, prompt, settings, payloadRequest);
      if (!submit.task?.id) {
        throw new Error("Atlas response did not include a task id.");
      }
      await persistFromTask(draftProduct, submit.task, renderId, {
        initialRequest: submit.request,
        initialResponse: submit.response,
        displayOnStorefront: false,
      });
      setNotice("Render queued");
      const completed = await pollUntilDone(draftProduct, submit.task.id, renderId);
      setNotice(completed?.status === "completed" ? "Video ready on storefront" : statusLabel(completed?.status));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed.";
      try {
        const failedState = upsertRender(draftProduct.id, videosRef.current[draftProduct.id], {
          renderId,
          productId: draftProduct.id,
          status: "failed",
          error: message,
          sourceImages: draftProduct.images.map((image) => image.url),
          aspectRatio: settings.aspectRatio || "16:9",
          addNarratorAvatar: draftProduct.addNarratorAvatar === true,
          prompt,
          displayOnStorefront: false,
        });
        await saveProductVideo(draftProduct.id, failedState, settings);
        videosRef.current = {
          ...videosRef.current,
          [draftProduct.id]: failedState,
        };
        setVideos(videosRef.current);
      } catch {
        // Keep the visible failure message even if the admin session can no longer write state.
      }
      setNotice(message);
    } finally {
      setIsRunning(false);
    }
  }

  const selectedVideoState = productVideoState(selectedProduct.id, videos[selectedProduct.id]);
  const selectedVideoHistory = selectedVideoState.videos;
  const latestSelectedVideo = getLatestVideo(selectedVideoState);
  const liveVideo =
    liveVideoState?.productId === selectedProduct.id && liveVideoState?.renderId === activeRenderId
      ? liveVideoState
      : null;
  const currentVideo = liveVideo || latestSelectedVideo;
  const showPendingPreview = currentVideo?.taskId && !currentVideo?.videoUrl && !TERMINAL.has(currentVideo?.status);
  const usesSecureDemoProxy = settings.useDemoProxy !== false;
  const adminLocked = usesSecureDemoProxy && !settings.adminToken;
  const noImagesSelected = draftProduct.images.length === 0;

  async function setRenderStorefrontVisibility(renderId, displayOnStorefront) {
    const currentState = productVideoState(selectedProduct.id, videosRef.current[selectedProduct.id]);
    const nextState = {
      ...currentState,
      updatedAt: new Date().toISOString(),
      videos: currentState.videos.map((video) => (
        video.renderId === renderId
          ? { ...video, displayOnStorefront: displayOnStorefront && canDisplayRender(video) }
          : video
      )),
    };
    await saveProductVideo(selectedProduct.id, nextState, settings);
    videosRef.current = {
      ...videosRef.current,
      [selectedProduct.id]: nextState,
    };
    setVideos(videosRef.current);
  }

  return (
    <main className="admin-shell">
      <aside className="admin-list">
        <div className="panel-heading">
          <Settings size={18} />
          <span>Products</span>
        </div>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={product.id === selectedProduct.id ? "admin-product active" : "admin-product"}
            onClick={() => setSelectedProduct(product)}
          >
            <img src={product.images[0].url} alt="" />
            <span>
              <strong>{product.title}</strong>
              <small>{product.sku}</small>
              <small>{getProductStateStatus(productVideoState(product.id, videos[product.id]))}</small>
            </span>
          </button>
        ))}
      </aside>

      <section className="admin-workspace">
        <div className="admin-titlebar">
          <div>
            <p className="eyebrow">Catalog dashboard</p>
            <h1>{draft.title}</h1>
          </div>
          <div className="admin-status-pills">
            <span>
              <Tag size={15} />
              {draft.sku}
            </span>
            <span>
              <BadgeDollarSign size={15} />
              {availableCredits === null ? "Credits unavailable" : `${availableCredits} credits`}
            </span>
            <span>
              <CheckCircle2 size={15} />
              {statusLabel(currentVideo?.status)} · {selectedVideoHistory.length} render{selectedVideoHistory.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <section className="admin-panel admin-section">
          <div className="panel-heading">
            <Boxes size={18} />
            <span>Product Metadata</span>
          </div>
          <div className="admin-form-grid">
            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
            </label>
            <label className="field">
              <span>Brand</span>
              <input value={draft.brand} onChange={(event) => updateDraft("brand", event.target.value)} />
            </label>
            <label className="field">
              <span>SKU</span>
              <input value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={draft.category} onChange={(event) => updateDraft("category", event.target.value)}>
                {categories
                  .filter((item) => item !== "All")
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field span-4">
              <span>Description</span>
              <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} rows={4} />
            </label>
            <label className="field">
              <span>Price</span>
              <input type="number" min="0" value={draft.price} onChange={(event) => updateDraft("price", event.target.value)} />
            </label>
            <label className="field">
              <span>Compare-at price</span>
              <input type="number" min="0" value={draft.compareAt} onChange={(event) => updateDraft("compareAt", event.target.value)} />
            </label>
            <label className="field">
              <span>Inventory</span>
              <input type="number" min="0" value={draft.inventory} onChange={(event) => updateDraft("inventory", event.target.value)} />
            </label>
            <label className="field">
              <span>Badge</span>
              <input value={draft.badge} onChange={(event) => updateDraft("badge", event.target.value)} />
            </label>
            <label className="field span-4">
              <span>Features</span>
              <textarea value={draft.featuresText} onChange={(event) => updateDraft("featuresText", event.target.value)} rows={4} />
            </label>
          </div>
        </section>

        <section className="admin-panel admin-section">
          <div className="panel-heading">
            <Images size={18} />
            <span>Images</span>
          </div>
          <AdminImageManager draft={draft} setDraft={setDraft} />
        </section>

        <section className="admin-panel admin-section generator-section">
          <div className="section-header-row">
            <div className="panel-heading">
              <Sparkles size={18} />
              <span>Generate Marketing Video</span>
            </div>
            <div className="generation-summary">
                <span>{draftProduct.images.length} selected images</span>
                <span>{settings.videoModel}</span>
                <span>{settings.aspectRatio || "16:9"}</span>
                {draft.addNarratorAvatar ? <span>Avatar enabled</span> : null}
              </div>
          </div>
          <div className="generator-settings-grid">
            <label className="field">
              <span>Video Model</span>
              <select
                value={settings.videoModel}
                onChange={(event) => updateSetting("videoModel", event.target.value)}
                disabled={adminLocked}
              >
                <option value="VEO3.1I2VFAST">VEO3.1 Fast</option>
                <option value="VEO3.1I2V">VEO3.1</option>
              </select>
            </label>
            <label className="field">
              <span>Aspect Ratio</span>
              <select
                value={settings.aspectRatio || "16:9"}
                onChange={(event) => updateSetting("aspectRatio", event.target.value)}
                disabled={adminLocked}
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </label>
            <label className="field checkbox-field generator-checkbox">
              <input
                type="checkbox"
                checked={draft.outroEnabled}
                onChange={(event) => updateDraft("outroEnabled", event.target.checked)}
              />
              <span>Include outro CTA</span>
            </label>
            <label className="field checkbox-field generator-checkbox">
              <input
                type="checkbox"
                checked={draft.addNarratorAvatar}
                onChange={(event) => updateDraft("addNarratorAvatar", event.target.checked)}
              />
              <span>Add avatar</span>
            </label>
          </div>
          {draft.outroEnabled ? (
            <div className="outro-panel">
              <label className="field span-4">
                <span>Outro Image URL</span>
                <input
                  value={draft.outroImageUrl}
                  onChange={(event) => updateDraft("outroImageUrl", event.target.value)}
                  placeholder="Image URL for the outro card; leave blank to generate one"
                />
              </label>
              <label className="field span-4">
                <span>CTA URL</span>
                <input
                  value={draft.outroCtaUrl}
                  onChange={(event) => updateDraft("outroCtaUrl", event.target.value)}
                  placeholder="Product storefront URL"
                />
              </label>
              <label className="field">
                <span>Outro Top Text</span>
                <input value={draft.outroTextTop} onChange={(event) => updateDraft("outroTextTop", event.target.value)} />
              </label>
              <label className="field">
                <span>Outro Bottom Text</span>
                <input value={draft.outroTextBottom} onChange={(event) => updateDraft("outroTextBottom", event.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="field">
            <span>Render Prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
          </label>
          <details className="payload-preview">
            <summary>Payload Preview ({draftProduct.images.length} image entries)</summary>
            <div className="payload-image-strip">
              {draftProduct.images.length ? (
                draftProduct.images.map((image, index) => (
                  <span key={image.url}>
                    <img src={image.url} alt="" />
                    Image {index + 1}
                  </span>
                ))
              ) : (
                <em>No image entries selected for this payload.</em>
              )}
            </div>
            <pre>{payloadPreview}</pre>
          </details>
          <div className="generator-actions">
            <button type="button" className="primary-button" onClick={handleGenerate} disabled={isRunning || adminLocked || noImagesSelected}>
              {isRunning ? <Loader2 size={18} className="spin" /> : <Film size={18} />}
              {adminLocked ? "Login Required" : noImagesSelected ? "Select Images" : isRunning ? "Rendering" : "Generate Video"}
            </button>
            {notice ? <p className="notice">{notice}</p> : null}
          </div>
          <div className="result-frame admin-video-preview">
            {currentVideo?.videoUrl ? (
              <video src={currentVideo.videoUrl} poster={videoPoster(selectedProduct, currentVideo)} controls />
            ) : showPendingPreview ? (
              <RenderStagePreview video={currentVideo} aspectRatio={settings.aspectRatio || "16:9"} />
            ) : (
              <div className="empty-result">
                <Play size={28} />
              </div>
            )}
          </div>
          {currentVideo?.error ? <p className="error">{currentVideo.error}</p> : null}
          <div className="render-history">
            <div className="section-header-row">
              <div className="panel-heading">
                <Film size={18} />
                <span>Render History</span>
              </div>
              <div className="generation-summary">
                <span>{getStorefrontVideos(selectedVideoState).length} displayed</span>
                <span>{selectedVideoHistory.length} total</span>
              </div>
            </div>
            {selectedVideoHistory.length ? (
              <div className="render-history-list">
                {selectedVideoHistory.map((video, index) => {
                  const sceneError = renderSceneError(video);
                  const sceneLayerCount = getSceneLayerCount(video);
                  const displayDisabled = !canDisplayRender(video);
                  return (
                    <article key={video.renderId} className="render-history-item">
                      <div className="render-history-media">
                        {video.videoUrl ? (
                          <video src={video.videoUrl} poster={videoPoster(selectedProduct, video)} controls />
                        ) : (
                          <RenderStagePreview video={video} aspectRatio={settings.aspectRatio || "16:9"} />
                        )}
                      </div>
                      <div className="render-history-body">
                        <div>
                          <strong>Render {selectedVideoHistory.length - index}</strong>
                          <span>{statusLabel(video.status)}</span>
                        </div>
                        <small>{new Date(video.createdAt || video.updatedAt).toLocaleString()}</small>
                        <small>{getSubmittedImageUrls(video).length} submitted image entries</small>
                        <small>
                          {sceneLayerCount === null
                            ? "Processor scene layers unavailable"
                            : `${sceneLayerCount} product scene layer${sceneLayerCount === 1 ? "" : "s"}`}
                        </small>
                        {video.taskId ? <code>{video.taskId}</code> : null}
                        {video.error || sceneError ? <small className="error">{video.error || sceneError}</small> : null}
                        <label className="checkbox-field render-display-toggle">
                          <input
                            type="checkbox"
                            checked={video.displayOnStorefront === true && !displayDisabled}
                            disabled={displayDisabled || adminLocked}
                            onChange={(event) => void setRenderStorefrontVisibility(video.renderId, event.target.checked)}
                          />
                          <span>Display on storefront</span>
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-result history-empty">
                <Play size={24} />
                <span>No renders yet</span>
              </div>
            )}
          </div>
        </section>

        <details className="admin-panel admin-section account-drawer">
          <summary>
            <div className="panel-heading">
              <KeyRound size={18} />
              <span>Account, Credits, and Billing</span>
            </div>
          </summary>
          <div className="account-grid">
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={usesSecureDemoProxy}
                onChange={(event) => updateSetting("useDemoProxy", event.target.checked)}
              />
              <span>Use hosted demo session</span>
            </label>
            {usesSecureDemoProxy ? (
              settings.adminToken ? (
                <div className="session-row">
                  <span>Signed in as {settings.adminUsername || "admin"}</span>
                  <button type="button" className="secondary-button" onClick={handleAdminLogout}>
                    Logout
                  </button>
                </div>
              ) : (
                <form className="login-box" onSubmit={handleAdminLogin}>
                  <label className="field">
                    <span>Admin Username</span>
                    <input
                      value={loginForm.username}
                      onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Admin Password</span>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    />
                  </label>
                  <button type="submit" className="primary-button wide">
                    <LogIn size={18} />
                    Login
                  </button>
                </form>
              )
            ) : null}
            <label className="field">
              <span>Purchase Credits</span>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.credits}
                onChange={(event) => updateSetting("credits", event.target.value)}
                disabled={adminLocked}
              />
            </label>
            {!usesSecureDemoProxy ? (
              <>
                <label className="field">
                  <span>Agent ID</span>
                  <input value={settings.agentId} onChange={(event) => updateSetting("agentId", event.target.value)} />
                </label>
                <label className="field">
                  <span>Agent Secret</span>
                  <input type="password" value={settings.agentSecret} onChange={(event) => updateSetting("agentSecret", event.target.value)} />
                </label>
                <label className="field">
                  <span>Registration Email</span>
                  <input value={settings.email} onChange={(event) => updateSetting("email", event.target.value)} />
                </label>
              </>
            ) : null}
            <div className="action-grid">
              <button type="button" className="secondary-button" onClick={handleConnectAgent} disabled={adminLocked}>
                <CheckCircle2 size={16} />
                Check Account
              </button>
              {!usesSecureDemoProxy ? (
                <button type="button" className="secondary-button" onClick={handleRegisterAgent}>
                  <KeyRound size={16} />
                  Register
                </button>
              ) : null}
              <button type="button" className="secondary-button" onClick={handleRecharge} disabled={adminLocked}>
                <CreditCard size={16} />
                Buy Credits
              </button>
              <button type="button" className="secondary-button" onClick={handlePaymentStatus} disabled={adminLocked}>
                <BadgeDollarSign size={16} />
                Payment
              </button>
            </div>
            {agentNotice ? <p className="notice">{agentNotice}</p> : null}
            <div className="state-panel">
              <p>
                <BadgeDollarSign size={16} />
                {availableCredits === null ? "Credits not loaded" : `${availableCredits} credits available`}
              </p>
              <p>
                <CheckCircle2 size={16} />
                {isFirebaseConfigured ? "Firestore state" : "Local state"}
              </p>
              {currentVideo?.taskId ? <code>{currentVideo.taskId}</code> : null}
              {currentVideo?.error ? <small className="error">{currentVideo.error}</small> : null}
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [selectedProduct, setSelectedProduct] = useState(() => findProduct(readRoute().productId));
  const [videos, setVideos] = useState({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => subscribeProductVideos(setVideos), []);

  useEffect(() => {
    const handlePopState = () => setRoute(readRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    setSelectedProduct(findProduct(route.productId));
  }, [route]);

  function navigate(path, nextProduct = selectedProduct) {
    window.history.pushState({}, "", path);
    setSelectedProduct(nextProduct);
    setRoute(readRoute());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openStorefront() {
    navigate("/", selectedProduct);
  }

  function openProduct(product) {
    navigate(productPath(product), product);
  }

  function openAdmin(product = selectedProduct) {
    navigate(`/admin?product=${encodeURIComponent(product.id)}`, product);
  }

  const activeProduct = route.view === "product" ? findProduct(route.productId) : selectedProduct;
  const storefrontActive = route.view === "storefront" || route.view === "product";

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={openStorefront}>
          <span className="brand-mark">A</span>
          <span>Atlas Market</span>
        </button>
        <nav>
          <button type="button" className={storefrontActive ? "nav-button active" : "nav-button"} onClick={openStorefront}>
            <Boxes size={17} />
            Storefront
          </button>
          <button type="button" className={route.view === "admin" ? "nav-button active" : "nav-button"} onClick={() => openAdmin(activeProduct)}>
            <Settings size={17} />
            Admin
          </button>
        </nav>
      </header>

      {route.view === "product" ? (
        <ProductDetails
          product={activeProduct}
          videoState={videos[activeProduct.id]}
          onBack={openStorefront}
          openAdmin={openAdmin}
        />
      ) : route.view === "storefront" ? (
        <Storefront
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
          videos={videos}
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          openProduct={openProduct}
        />
      ) : (
        <Admin selectedProduct={activeProduct} setSelectedProduct={setSelectedProduct} videos={videos} setVideos={setVideos} />
      )}
    </div>
  );
}
