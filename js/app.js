/* ==========================================================================
   SURF CREW Agadir — catalogue app
   Pure vanilla JS, no build step. Reads products from /content/products/*.md
   ========================================================================== */

/* -------------------------------------------------------------- CONFIG ---- */

/* >>> CHANGE THIS ONE LINE to your real WhatsApp number. <<<
   International format, digits only, no +, no spaces, no leading zero.
   Morocco example: 06 12 34 56 78  ->  "212612345678"            */
const WHATSAPP_NUMBER = "2126XXXXXXX";

const CATALOG_INDEX = "content/products/index.json";
const CACHE_KEY = "surfcrew_catalog_v1";
const RENTAL_UNIT = "per day";

/* ------------------------------------------------------------- helpers ---- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const isPlaceholderNumber = () => !/^\d{8,15}$/.test(WHATSAPP_NUMBER);

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Minimal YAML front-matter reader: scalars only, which is all Decap writes. */
function parseFrontMatter(raw) {
  const match = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };

  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) return;

    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "").trim();

    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value === "null" || value === "~") value = null;
    else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);

    data[key] = value;
  });

  return { data, body: (match[2] || "").trim() };
}

function slugFromFile(file) {
  return String(file).replace(/\.md$/i, "");
}

function normalizeStock(value) {
  const v = String(value == null ? "" : value).trim().toLowerCase();
  if (["last", "last one", "low", "1", "limited"].includes(v)) return "last";
  if (["out", "out of stock", "soldout", "sold out", "unavailable", "0", "no"].includes(v)) return "out";
  return "available";
}

const STOCK_LABEL = {
  available: "Available",
  last: "Last one",
  out: "Out of stock"
};

function sizeOrder(size) {
  return ["S", "M", "L", "XL"].indexOf(String(size).toUpperCase());
}

/* ------------------------------------------------------------- data load -- */

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

function toProduct(file, data, body, indexJson) {
  const slug = slugFromFile(file);
  const override = (indexJson.overrides && indexJson.overrides[slug]) || {};
  const merged = Object.assign({}, data, override);

  return {
    slug,
    file,
    name: merged.name || slug,
    size: String(merged.size || "").toUpperCase(),
    category: merged.category || "Wetsuit",
    thickness: merged.thickness || "",
    price: Number(merged.price) || 0,
    stock: normalizeStock(merged.stock),
    featured: merged.featured === true || (indexJson.featured || []).indexOf(slug) !== -1,
    image: merged.image || "images/uploads/.gitkeep",
    description: merged.description || "",
    body: body || ""
  };
}

async function loadCatalog() {
  const indexJson = JSON.parse(await fetchText(CATALOG_INDEX));
  const files = Array.isArray(indexJson.files) ? indexJson.files : [];
  if (!files.length) throw new Error("No products listed in " + CATALOG_INDEX);

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const raw = await fetchText("content/products/" + file);
        const { data, body } = parseFrontMatter(raw);
        return toProduct(file, data, body, indexJson);
      } catch (err) {
        console.warn("[SURF CREW] skipping", file, err);
        return null;
      }
    })
  );

  const products = results.filter(Boolean);
  if (!products.length) throw new Error("All product files failed to load");

  products.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const s = sizeOrder(a.size) - sizeOrder(b.size);
    return s !== 0 ? s : a.price - b.price;
  });

  return products;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.products) ? parsed : null;
  } catch (err) {
    return null;
  }
}

function writeCache(products) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), products }));
  } catch (err) {
    /* storage full / private mode — non fatal */
  }
}

/* ---------------------------------------------------------------- state --- */

const state = {
  products: [],
  filterSize: "ALL",
  query: "",
  gallery: [],
  galleryIndex: 0,
  deferredInstall: null,
  fromCache: false
};

/* --------------------------------------------------------------- render --- */

const grid = $("#product-grid");
const emptyState = $("#empty-state");
const countLine = $("#result-count");
const countSummary = $("#result-summary");
const offlineNote = $("#offline-note");
const toast = $("#toast");

let toastTimer = null;
function showToast(message, ms = 2600) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), ms);
}

function cardMarkup(product) {
  const isOut = product.stock === "out";
  const safeName = escapeHtml(product.name);
  const meta = [];
  if (product.thickness) meta.push(`<span><i class="fa-solid fa-layer-group" aria-hidden="true"></i>${escapeHtml(product.thickness)}</span>`);
  meta.push(`<span><i class="fa-solid fa-water" aria-hidden="true"></i>${escapeHtml(product.category)}</span>`);

  return `
    <li class="product-card" data-slug="${escapeHtml(product.slug)}">
      <button class="product-media" type="button" data-action="photo" aria-label="Enlarge photo of ${safeName}">
        <img src="${encodeURI(product.image)}" alt="${safeName} wetsuit rental in Aourir, Tamraght" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/placeholder.svg';this.classList.add('is-placeholder');">
        <span class="media-badges">
          <span class="badge badge-size">${escapeHtml(product.size || "–")}</span>
          <span class="badge badge-stock stock-${product.stock}">${STOCK_LABEL[product.stock]}</span>
        </span>
        ${product.featured ? '<span class="badge badge-featured">Featured</span>' : ""}
      </button>
      <div class="card-body">
        <h3 class="card-title">${safeName}</h3>
        <p class="card-meta">${meta.join("")}</p>
        <div class="price-row">
          <span class="price">${product.price ? product.price + " MAD" : "Ask us"}</span>
          <span class="price-unit">${RENTAL_UNIT}</span>
        </div>
        <div class="card-actions">
          <button class="wa-btn" type="button" data-action="wa" ${isOut ? "disabled" : ""}>
            <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>${isOut ? "Sold out" : "WhatsApp"}
          </button>
          <button class="details-btn" type="button" data-action="photo" aria-label="Details of ${safeName}">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </li>`;
}

function visibleProducts() {
  const q = state.query.trim().toLowerCase();
  return state.products.filter((p) => {
    if (state.filterSize !== "ALL" && p.size !== state.filterSize) return false;
    if (!q) return true;
    return [p.name, p.thickness, p.category, p.size, p.description, p.body]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

function render() {
  const list = visibleProducts();
  state.gallery = list;

  countLine.textContent = state.products.length
    ? `${list.length} of ${state.products.length} wetsuits`
    : "";
  countSummary.textContent = list.length === 1 ? "1 suit" : `${list.length} suits`;

  if (!list.length) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  grid.innerHTML = list.map(cardMarkup).join("");
}

/* ------------------------------------------------------------- lightbox --- */

const lightbox = $("#lightbox");
const lbImage = $("#lightbox-image");
const lbTitle = $("#lightbox-title");
const lbMeta = $("#lightbox-meta");
const lbDesc = $("#lightbox-description");
const lbActions = $("#lightbox-actions");
let lastFocused = null;

function openLightbox(index) {
  const product = state.gallery[index];
  if (!product) return;

  state.galleryIndex = index;
  lastFocused = document.activeElement;

  lbImage.onerror = function () {
    this.onerror = null;
    this.src = "images/placeholder.svg";
  };
  lbImage.src = product.image;
  lbImage.alt = `${product.name} — wetsuit rental at SURF CREW Agadir`;
  lbTitle.textContent = product.name;

  lbMeta.innerHTML = [
    `<span>Size <b>${escapeHtml(product.size || "–")}</b></span>`,
    product.thickness ? `<span>Thickness <b>${escapeHtml(product.thickness)}</b></span>` : "",
    `<span>Price <b>${product.price ? product.price + " MAD" : "on request"}</b> ${RENTAL_UNIT}</span>`,
    `<span>Stock <b>${STOCK_LABEL[product.stock]}</b></span>`
  ].filter(Boolean).join("");

  const text = product.description || product.body || "";
  lbDesc.textContent = text.replace(/[*_#>`]/g, "").trim();

  lbActions.innerHTML = buildWaButton(product, "lb");

  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("#lightbox-close").focus();
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
}

function stepLightbox(delta) {
  if (!state.gallery.length) return;
  const next = (state.galleryIndex + delta + state.gallery.length) % state.gallery.length;
  openLightbox(next);
}

/* -------------------------------------------------------------- whatsapp -- */

function waHref(product) {
  const lines = [
    `Hi SURF CREW Agadir! I would like to rent this wetsuit:`,
    ``,
    `• ${product.name}`,
    `• Size: ${product.size || "?"}`,
    product.thickness ? `• Thickness: ${product.thickness}` : "",
    product.price ? `• Price: ${product.price} MAD ${RENTAL_UNIT}` : "",
    ``,
    `Pickup: Aourir / Tamraght. Is it available?`
  ].filter(Boolean);

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function buildWaButton(product, scope) {
  const disabled = product.stock === "out" ? "disabled" : "";
  const label = product.stock === "out" ? "Sold out" : "Order on WhatsApp";
  return `<a class="btn btn-wa" data-wa-link="${scope}" href="${escapeHtml(waHref(product))}" target="_blank" rel="noopener" ${disabled}>
      <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>${label}
    </a>`;
}

function handleWhatsAppClick(event) {
  if (isPlaceholderNumber() && !event.defaultPrevented) {
    showToast("Set your real number in js/app.js → WHATSAPP_NUMBER", 3600);
  }
}

/* --------------------------------------------------------------- events --- */

function bindEvents() {
  grid && grid.addEventListener("click", (event) => {
    const card = event.target.closest(".product-card");
    if (!card) return;
    const slug = card.dataset.slug;
    const index = state.gallery.findIndex((p) => p.slug === slug);
    const action = event.target.closest("[data-action]");
    if (!action) return;

    if (action.dataset.action === "photo") openLightbox(index);
    if (action.dataset.action === "wa") {
      handleWhatsAppClick(event);
      event.stopPropagation();
    }
  });

  $$(".size-chips").forEach((group) => {
    group.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      state.filterSize = chip.dataset.size;
      $$(".chip", group).forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      render();
    });
  });

  const search = $("#search-input");
  const clear = $("#search-clear");
  let debounce = null;

  search && search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = search.value;
      clear && clear.classList.toggle("is-visible", search.value.length > 0);
      render();
    }, 90);
  });

  clear && clear.addEventListener("click", () => {
    search.value = "";
    state.query = "";
    clear.classList.remove("is-visible");
    search.focus();
    render();
  });

  $("#lightbox-close")?.addEventListener("click", closeLightbox);
  $("#lb-prev")?.addEventListener("click", () => stepLightbox(-1));
  $("#lb-next")?.addEventListener("click", () => stepLightbox(1));
  lightbox?.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
  lbActions?.addEventListener("click", handleWhatsAppClick);

  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") stepLightbox(-1);
    if (event.key === "ArrowRight") stepLightbox(1);
  });

  /* swipe between wetsuit photos on phones */
  let touchX = 0;
  lightbox?.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lightbox?.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 55) stepLightbox(dx < 0 ? 1 : -1);
  }, { passive: true });

  $$("[data-wa-link='hero']").forEach((el) => el.addEventListener("click", handleWhatsAppClick));

  $("#reset-filters")?.addEventListener("click", () => {
    state.filterSize = "ALL";
    state.query = "";
    $$(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.size === "ALL")));
    if (search) search.value = "";
    clear?.classList.remove("is-visible");
    render();
    showToast("Filters reset");
  });

  window.addEventListener("online", () => {
    offlineNote.classList.remove("is-visible");
    showToast("Back online");
  });
  window.addEventListener("offline", () => {
    offlineNote.classList.add("is-visible");
  });
}

/* ------------------------------------------------------------------ PWA --- */

function setupInstallPrompt() {
  const bar = $("#install-bar");
  if (!bar) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone || sessionStorage.getItem("surfcrew_install_dismissed") === "1") return;

  const dismiss = () => {
    bar.classList.remove("is-visible");
    sessionStorage.setItem("surfcrew_install_dismissed", "1");
  };

  $("#install-dismiss")?.addEventListener("click", dismiss);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstall = event;
    bar.classList.add("is-visible");
    $("#install-text").textContent = "Install SURF CREW for offline size checks.";
  });

  $("#install-go")?.addEventListener("click", async () => {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      dismiss();
      return;
    }
    /* iOS Safari has no install prompt: explain the manual route */
    showToast("iPhone: tap Share ⬆ then “Add to Home Screen”", 5000);
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos && !isStandalone) {
    $("#install-text").textContent = "Add SURF CREW to your home screen.";
    bar.classList.add("is-visible");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("[SURF CREW] service worker not registered:", err);
    });
  });
}

/* ------------------------------------------------------------------ init -- */

function showLoadError(err) {
  console.error("[SURF CREW]", err);
  grid.innerHTML = "";
  emptyState.hidden = false;
  emptyState.innerHTML = `
    <h3>Catalogue could not load</h3>
    <p>${escapeHtml(err.message || "Unknown error")}</p>
    <p>Open the site from a web server (Netlify) so that
      <code>content/products/*.md</code> can be fetched.</p>`;
}

/* Keep every hard-coded WhatsApp link on the page in sync with the constant. */
function syncStaticWaLinks() {
  $$("[data-wa-link]").forEach((el) => {
    const url = new URL(el.getAttribute("href"));
    const text = url.searchParams.get("text") || "Hi SURF CREW Agadir, I would like to rent a wetsuit.";
    el.setAttribute("href", `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`);
  });
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());
}

async function init() {
  bindEvents();
  syncStaticWaLinks();
  registerServiceWorker();
  setupInstallPrompt();

  if (!navigator.onLine) offlineNote.classList.add("is-visible");

  try {
    const products = await loadCatalog();
    state.products = products;
    state.fromCache = false;
    writeCache(products);
  } catch (err) {
    const cached = readCache();
    if (cached) {
      state.products = cached.products;
      state.fromCache = true;
      offlineNote.classList.add("is-visible");
      offlineNote.textContent = "Offline mode — showing the last saved catalogue.";
    } else {
      showLoadError(err);
      return;
    }
  }

  grid.setAttribute("aria-busy", "false");
  render();
  $("#skeleton")?.remove();
}

document.addEventListener("DOMContentLoaded", init);
