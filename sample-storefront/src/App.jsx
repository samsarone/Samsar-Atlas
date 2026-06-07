import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { categories, products } from "./data/products.js";
import {
  buildProductVideoPrompt,
  connectAgent,
  createRecharge,
  defaultAtlasSettings,
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

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function loadSettings() {
  try {
    return {
      ...defaultAtlasSettings(),
      ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}"),
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
      <video className="product-media" src={video.videoUrl} poster={video.posterUrl || product.images[0].url} controls />
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
              {selectedProduct.images.length} public-source images
            </span>
          </div>
        </div>
        <div className="detail-media">
          <ProductMedia product={selectedProduct} video={videos[selectedProduct.id]} />
        </div>
      </section>

      <section className="product-grid">
        {visibleProducts.map((product) => {
          const video = videos[product.id];
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
                {video?.videoUrl ? (
                  <span className="video-badge">
                    <Film size={14} />
                    Video
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

function ProductDetails({ product, video, onBack, openAdmin }) {
  const [activeImageUrl, setActiveImageUrl] = useState(product.images[0].url);
  const activeImage = product.images.find((item) => item.url === activeImageUrl) || product.images[0];
  const status = statusLabel(video?.status);

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
              <small>Video</small>
              {status}
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
          <h2>Generated Video</h2>
        </div>
        {video?.videoUrl ? (
          <div className="video-detail-frame">
            <video src={video.videoUrl} poster={video.posterUrl || product.images[0].url} controls />
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

function AdminImagePicker({ product }) {
  return (
    <div className="image-list">
      {product.images.map((image) => (
        <a key={image.url} href={image.sourceUrl} target="_blank" rel="noreferrer" className="image-source">
          <img src={image.url} alt={image.alt} />
          <span>{image.license}</span>
        </a>
      ))}
    </div>
  );
}

function Admin({ selectedProduct, setSelectedProduct, videos }) {
  const [settings, setSettings] = useState(loadSettings);
  const [loginForm, setLoginForm] = useState({ username: settings.adminUsername || "admin", password: "" });
  const [prompt, setPrompt] = useState(() => buildProductVideoPrompt(selectedProduct));
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [agentNotice, setAgentNotice] = useState("");

  useEffect(() => {
    setPrompt(buildProductVideoPrompt(selectedProduct));
  }, [selectedProduct]);

  function updateSetting(key, value) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
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
    setAgentNotice("Checking agent");
    try {
      const body = await connectAgent(settings);
      setAgentNotice(`Agent ${body.agent?.id || "connected"}: ${body.agent?.status || "ready"}`);
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Agent check failed.");
    }
  }

  async function handleRegisterAgent() {
    setAgentNotice("Creating agent checkout");
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
      setAgentNotice(`Agent ${body.credentials?.agentId || "created"} registered`);
      if (body.checkoutUrl) {
        window.open(body.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Agent registration failed.");
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
      setAgentNotice(`Payment status: ${body.status || body.payment_status || body.agent?.status || "unknown"}`);
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : "Payment status failed.");
    }
  }

  async function persistFromTask(product, task, patch = {}) {
    const status = taskStatus(task);
    const result = extractVideoResult(task);
    const nextState = {
      taskId: task?.id || patch.taskId,
      status,
      videoUrl: result.videoUrl || patch.videoUrl || "",
      posterUrl: result.posterUrl || patch.posterUrl || "",
      durationSec: result.durationSec || patch.durationSec,
      sourceImages: product.images.map((image) => image.url),
      prompt,
      lastTask: task,
      ...patch,
    };
    await saveProductVideo(product.id, nextState, settings);
    return nextState;
  }

  async function pollUntilDone(product, taskId) {
    let latestState = null;
    for (let attempt = 0; attempt < 36; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 1200 : 8000));
      const statusResult = await getTask(taskId, settings);
      latestState = await persistFromTask(product, statusResult.task, {
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
    setIsRunning(true);
    setNotice("Submitting render");
    try {
      const submit = await sendImageListToVideo(selectedProduct, prompt, settings);
      if (!submit.task?.id) {
        throw new Error("Atlas response did not include a task id.");
      }
      await persistFromTask(selectedProduct, submit.task, {
        initialRequest: submit.request,
        initialResponse: submit.response,
      });
      setNotice("Render queued");
      const completed = await pollUntilDone(selectedProduct, submit.task.id);
      setNotice(completed?.status === "completed" ? "Video ready on storefront" : statusLabel(completed?.status));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed.";
      try {
        await saveProductVideo(selectedProduct.id, {
          status: "failed",
          error: message,
          sourceImages: selectedProduct.images.map((image) => image.url),
          prompt,
        }, settings);
      } catch {
        // Keep the visible failure message even if the admin session can no longer write state.
      }
      setNotice(message);
    } finally {
      setIsRunning(false);
    }
  }

  const currentVideo = videos[selectedProduct.id];
  const usesSecureDemoProxy = settings.useDemoProxy !== false;
  const adminLocked = usesSecureDemoProxy && !settings.adminToken;

  return (
    <main className="admin-shell">
      <aside className="admin-list">
        <div className="panel-heading">
          <Settings size={18} />
          <span>Catalog</span>
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
              <small>{statusLabel(videos[product.id]?.status)}</small>
            </span>
          </button>
        ))}
      </aside>

      <section className="admin-workspace">
        <div className="admin-grid">
          <div className="admin-panel">
            <div className="panel-heading">
              <Sparkles size={18} />
              <span>{selectedProduct.title}</span>
            </div>
            <AdminImagePicker product={selectedProduct} />
            <div className="metadata-grid">
              <span>{selectedProduct.sku}</span>
              <span>{selectedProduct.category}</span>
              <span>{formatPrice(selectedProduct.price)}</span>
              <span>{selectedProduct.features.join(" / ")}</span>
            </div>
            <label className="field">
              <span>Render Prompt</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} />
            </label>
            <button type="button" className="primary-button wide" onClick={handleGenerate} disabled={isRunning || adminLocked}>
              {isRunning ? <Loader2 size={18} className="spin" /> : <Film size={18} />}
              {adminLocked ? "Login Required" : isRunning ? "Rendering" : "Generate Video"}
            </button>
            {notice ? <p className="notice">{notice}</p> : null}
          </div>

          <div className="admin-panel">
            <div className="panel-heading">
              <KeyRound size={18} />
              <span>Atlas A2A</span>
            </div>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={usesSecureDemoProxy}
                onChange={(event) => updateSetting("useDemoProxy", event.target.checked)}
              />
              <span>Use secure hosted demo proxy</span>
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
              <span>Demo Proxy URL</span>
              <input
                value={settings.demoProxyBaseUrl}
                onChange={(event) => updateSetting("demoProxyBaseUrl", event.target.value)}
                placeholder="/demo/storefront"
                disabled={adminLocked}
              />
            </label>
            <label className="field">
              <span>Client URL</span>
              <input
                value={settings.baseUrl}
                onChange={(event) => updateSetting("baseUrl", event.target.value)}
                placeholder="Same-origin Firebase rewrite"
                disabled={usesSecureDemoProxy}
              />
            </label>
            <label className="field">
              <span>Agent ID</span>
              <input
                value={settings.agentId}
                onChange={(event) => updateSetting("agentId", event.target.value)}
                disabled={usesSecureDemoProxy}
              />
            </label>
            <label className="field">
              <span>Agent Secret</span>
              <input
                type="password"
                value={settings.agentSecret}
                onChange={(event) => updateSetting("agentSecret", event.target.value)}
                disabled={usesSecureDemoProxy}
              />
            </label>
            <label className="field">
              <span>Credit Checkout Amount</span>
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
              <label className="field">
                <span>Registration Email</span>
                <input value={settings.email} onChange={(event) => updateSetting("email", event.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>Video Model</span>
              <select
                value={settings.videoModel}
                onChange={(event) => updateSetting("videoModel", event.target.value)}
                disabled={adminLocked}
              >
                <option value="VEO3.1FAST">VEO3.1 Fast</option>
                <option value="VEO3.1">VEO3.1</option>
              </select>
            </label>
            <div className="action-grid">
              <button type="button" className="secondary-button" onClick={handleConnectAgent} disabled={adminLocked}>
                <CheckCircle2 size={16} />
                Connect
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
                {isFirebaseConfigured ? "Firestore state" : "Local state"}
              </p>
              <p>
                <CheckCircle2 size={16} />
                {statusLabel(currentVideo?.status)}
              </p>
              {currentVideo?.taskId ? <code>{currentVideo.taskId}</code> : null}
              {currentVideo?.error ? <small className="error">{currentVideo.error}</small> : null}
            </div>
            <div className="result-frame">
              {currentVideo?.videoUrl ? (
                <video src={currentVideo.videoUrl} poster={currentVideo.posterUrl || selectedProduct.images[0].url} controls />
              ) : (
                <div className="empty-result">
                  <Play size={28} />
                </div>
              )}
            </div>
          </div>
        </div>
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
          video={videos[activeProduct.id]}
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
        <Admin selectedProduct={activeProduct} setSelectedProduct={setSelectedProduct} videos={videos} />
      )}
    </div>
  );
}
