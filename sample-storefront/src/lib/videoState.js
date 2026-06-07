import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase.js";

const COLLECTION = "atlas_demo_product_videos";
const LOCAL_KEY = "atlas-market-product-videos";
const DEFAULT_DEMO_PROXY_BASE_URL = import.meta.env.VITE_DEMO_PROXY_BASE_URL || "/demo/storefront";
const USE_FIREBASE_CLIENT_STATE = import.meta.env.VITE_USE_FIREBASE_CLIENT_STATE === "true";

function cleanBaseUrl(value) {
  return (value || DEFAULT_DEMO_PROXY_BASE_URL).trim().replace(/\/$/, "");
}

function demoProxyUrl(settings, path) {
  return `${cleanBaseUrl(settings?.demoProxyBaseUrl || DEFAULT_DEMO_PROXY_BASE_URL)}${path}`;
}

function readLocalVideos() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalVideos(nextVideos) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(nextVideos));
  window.dispatchEvent(new CustomEvent("atlas-market-local-videos"));
}

export function subscribeProductVideos(onChange) {
  if (!USE_FIREBASE_CLIENT_STATE || !isFirebaseConfigured || !db) {
    let stopped = false;
    const emit = () => onChange(readLocalVideos());
    const fetchRemote = async () => {
      try {
        const response = await fetch(demoProxyUrl({}, "/product-videos"));
        if (!response.ok) {
          emit();
          return;
        }
        const body = await response.json();
        if (!stopped) {
          onChange(body && typeof body === "object" ? body : {});
        }
      } catch {
        emit();
      }
    };
    const poll = window.setInterval(fetchRemote, 5000);
    void fetchRemote();
    emit();
    window.addEventListener("atlas-market-local-videos", emit);
    window.addEventListener("storage", emit);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.removeEventListener("atlas-market-local-videos", emit);
      window.removeEventListener("storage", emit);
    };
  }

  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const nextVideos = {};
    snapshot.forEach((item) => {
      nextVideos[item.id] = item.data();
    });
    onChange(nextVideos);
  });
}

export async function saveProductVideo(productId, videoState, settings = {}) {
  const payload = {
    ...videoState,
    productId,
    updatedAt: new Date().toISOString(),
  };

  if (settings?.useDemoProxy !== false && settings?.adminToken) {
    const response = await fetch(demoProxyUrl(settings, `/product-videos/${encodeURIComponent(productId)}`), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${settings.adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || `Saving product video state failed with HTTP ${response.status}.`);
    }
    return body;
  }

  if (!USE_FIREBASE_CLIENT_STATE || !isFirebaseConfigured || !db) {
    const current = readLocalVideos();
    writeLocalVideos({
      ...current,
      [productId]: payload,
    });
    return payload;
  }

  await setDoc(doc(db, COLLECTION, productId), payload, { merge: true });
  return payload;
}
