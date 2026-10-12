/* SURF CREW Agadir — service worker (offline catalogue + installable PWA) */
const VERSION = "surfcrew-v1.1.0";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const IMG_CACHE = `${VERSION}-img`;

const SHELL_ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "manifest.json",
  "images/favicon.svg",
  "images/placeholder.svg",
  "icons/icon.svg",
  "content/products/index.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isImage(request, url) {
  return request.destination === "image" || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);
}

function isCatalog(url) {
  return url.pathname.includes("/content/products/") || url.pathname.endsWith("/content/products/index.json");
}

/* Markdown + index.json: network first, fall back to the saved copy (fresh prices online). */
async function catalogStrategy(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

/* HTML: network first, so a fresh deploy is picked up immediately, but the
   last copy still opens the site when the visitor is offline. */
async function htmlStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match("index.html");
    if (shell) return shell;
    throw err;
  }
}

/* CSS / JS / manifest: cache first so the shell opens instantly and offline. */
async function shellStrategy(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/* Product photos: cache first, fill the cache in the background. */
async function imageStrategy(request) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Never interfere with the Decap admin panel or cross-origin CDNs. */
  if (url.pathname.startsWith("/admin")) return;
  if (url.origin !== self.location.origin) return;

  if (isCatalog(url)) {
    event.respondWith(catalogStrategy(request));
    return;
  }
  if (isImage(request, url)) {
    event.respondWith(imageStrategy(request));
    return;
  }
  if (url.pathname === "/" || /\.(html|webmanifest)$/i.test(url.pathname) || request.mode === "navigate") {
    event.respondWith(htmlStrategy(request));
    return;
  }
  if (/\.(css|js|json)$/i.test(url.pathname)) {
    event.respondWith(shellStrategy(request));
  }
});
