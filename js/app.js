/* ==========================================================================
   SURF WETSUIT — catalogue app
   Pure vanilla JS, no build step. Reads products from /content/products/*.md
   ========================================================================== */

/* -------------------------------------------------------------- CONFIG ---- */

/* WhatsApp number that every Buy button messages.
   International format, digits only, no +, no spaces, no leading zero. */
const WHATSAPP_NUMBER = "212611321357";
const SHOP_NAME = "SURF WETSUIT";

const CATALOG_INDEX = "content/products/index.json";
const PRICE_UNIT = "each";

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
  available: "In stock",
  last: "Last one",
  out: "Sold out"
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

/* A suit can carry more than one photo. Decap writes them as image, image2,
   image3 ... while older files only have "image". Build one ordered, de-duped
   list here so the rest of the app never has to care how many photos there are. */
const PHOTO_FIELDS = ["image", "image2", "image3", "image4"];

function productImages(merged) {
  const list = [];
  PHOTO_FIELDS.forEach((key) => {
    const value = merged[key];
    const src = typeof value === "string" ? value.trim() : "";
    if (!src || src === "images/uploads/.gitkeep") return;
    if (list.indexOf(src) === -1) list.push(src);
  });
  return list.length ? list : ["images/placeholder.svg"];
}

function toProduct(file, data, body, indexJson) {
  const slug = slugFromFile(file);
  const override = (indexJson.overrides && indexJson.overrides[slug]) || {};
  const merged = Object.assign({}, data, override);
  const images = productImages(merged);

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
    images,
    image: images[0],
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
        console.warn("[SURF WETSUIT] skipping", file, err);
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

/* ---------------------------------------------------------------- state --- */

const state = {
  products: [],
  filterSize: "ALL",
  query: "",
  gallery: [],      // flat list of { product, image, imageIndex, imageCount }
  galleryIndex: 0   // position inside that flat list
};

/* Flatten the visible products into one entry PER PHOTO, so the lightbox can
   step photo by photo and carry on into the next suit. */
function buildGallery(products) {
  const flat = [];
  products.forEach((product) => {
    product.images.forEach((image, imageIndex) => {
      flat.push({ product, image, imageIndex, imageCount: product.images.length });
    });
  });
  return flat;
}

/* --------------------------------------------------------------- render --- */

const grid = $("#product-grid");
const emptyState = $("#empty-state");
const countLine = $("#result-count");
const countSummary = $("#result-summary");
const toast = $("#toast");

let toastTimer = null;
function showToast(message, ms = 2600) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), ms);
}

function cardMarkup(product, galleryStart) {
  const isOut = product.stock === "out";
  const safeName = escapeHtml(product.name);
  const cover = product.images[0];
  const photoCount = product.images.length;
  const meta = [];
  if (product.thickness) meta.push(`<span><i class="fa-solid fa-layer-group" aria-hidden="true"></i>${escapeHtml(product.thickness)}</span>`);
  meta.push(`<span><i class="fa-solid fa-water" aria-hidden="true"></i>${escapeHtml(product.category)}</span>`);

  return `
    <li class="product-card" data-slug="${escapeHtml(product.slug)}" data-gallery-start="${galleryStart}">
      <button class="product-media${photoCount > 1 ? " has-multi" : ""}" type="button" data-action="photo" aria-label="Enlarge ${photoCount} photo${photoCount > 1 ? "s" : ""} of ${safeName}">
        <img src="${encodeURI(cover)}" alt="${safeName} wetsuit for sale — ${SHOP_NAME}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/placeholder.svg';this.classList.add('is-placeholder');">
        <span class="media-badges">
          <span class="badge badge-size">${escapeHtml(product.size || "–")}</span>
          <span class="badge badge-stock stock-${product.stock}">${STOCK_LABEL[product.stock]}</span>
        </span>
        ${product.featured ? '<span class="badge badge-featured">Featured</span>' : ""}
        ${photoCount > 1 ? `<span class="badge photo-count" aria-hidden="true"><i class="fa-solid fa-images" aria-hidden="true"></i>${photoCount}</span>` : ""}
      </button>
      <div class="card-body">
        <h3 class="card-title">${safeName}</h3>
        <p class="card-meta">${meta.join("")}</p>
        <div class="price-row">
          <span class="price">${product.price ? product.price + " MAD" : "Ask us"}</span>
          <span class="price-unit">${PRICE_UNIT}</span>
        </div>
        <div class="card-actions">
          ${isOut
            ? `<button class="wa-btn" type="button" disabled><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>Sold out</button>`
            : `<a class="wa-btn" href="${escapeHtml(waHref(product))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>Buy now</a>`}
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
  state.gallery = buildGallery(list);

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

  /* Each card remembers where its own first photo sits in the flat gallery. */
  let cursor = 0;
  grid.innerHTML = list
    .map((product) => {
      const start = cursor;
      cursor += product.images.length;
      return cardMarkup(product, start);
    })
    .join("");
}

/* ------------------------------------------------------------- lightbox --- */

const lightbox = $("#lightbox");
const lbImage = $("#lightbox-image");
const lbTitle = $("#lightbox-title");
const lbCounter = $("#lightbox-counter");
const lbDots = $("#lightbox-dots");
const lbMeta = $("#lightbox-meta");
const lbDesc = $("#lightbox-description");
const lbActions = $("#lightbox-actions");
let lastFocused = null;

function openLightbox(index) {
  const item = state.gallery[index];
  if (!item) return;

  const product = item.product;
  const multiple = item.imageCount > 1;

  /* One photo = no arrows at all. */
  lightbox.classList.toggle("is-single", !multiple);

  state.galleryIndex = index;
  lastFocused = document.activeElement;

  lbImage.onerror = function () {
    this.onerror = null;
    this.src = "images/placeholder.svg";
  };
  lbImage.src = item.image;
  lbImage.alt = `${product.name} — photo ${item.imageIndex + 1} of ${item.imageCount} — wetsuit for sale from ${SHOP_NAME}`;
  lbTitle.textContent = product.name;

  /* "2 / 2" counter plus tappable dots, only for suits with several photos. */
  if (lbCounter) lbCounter.textContent = multiple ? `${item.imageIndex + 1} / ${item.imageCount}` : "";
  if (lbDots) {
    lbDots.innerHTML = multiple
      ? product.images
          .map((_, i) => {
            const current = i === item.imageIndex;
            return `<button type="button" class="lb-dot${current ? " is-active" : ""}" data-dot="${i}" aria-label="Show photo ${i + 1} of ${item.imageCount}"${current ? ' aria-current="true"' : ""}></button>`;
          })
          .join("")
      : "";
  }

  lbMeta.innerHTML = [
    `<span>Size <b>${escapeHtml(product.size || "–")}</b></span>`,
    product.thickness ? `<span>Thickness <b>${escapeHtml(product.thickness)}</b></span>` : "",
    `<span>Price <b>${product.price ? product.price + " MAD" : "on request"}</b> ${PRICE_UNIT}</span>`,
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
  const item = state.gallery[state.galleryIndex];
  if (!item) return;

  /* The arrows move ONLY between the photos of the suit you opened.
     They never jump to another product. */
  const count = item.imageCount;
  if (count < 2) return;

  const firstPhotoOfSuit = state.galleryIndex - item.imageIndex;
  const nextPhoto = (item.imageIndex + delta + count) % count;
  openLightbox(firstPhotoOfSuit + nextPhoto);
}

/* -------------------------------------------------------------- whatsapp -- */

function waHref(product) {
  const lines = [
    `Hi ${SHOP_NAME}! I would like to buy this wetsuit:`,
    ``,
    `• ${product.name}`,
    `• Size: ${product.size || "?"}`,
    product.thickness ? `• Thickness: ${product.thickness}` : "",
    product.price ? `• Price: ${product.price} MAD` : "",
    ``,
    `Deliver to (city in Morocco):`
  ].filter(Boolean);

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function buildWaButton(product, scope) {
  const disabled = product.stock === "out" ? "disabled" : "";
  const label = product.stock === "out" ? "Sold out" : "Buy on WhatsApp";
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
    const action = event.target.closest("[data-action='photo']");
    if (!action) return;
    const card = action.closest(".product-card");
    if (!card) return;

    /* open on the first photo of that suit */
    const start = Number(card.dataset.galleryStart);
    openLightbox(Number.isFinite(start) ? start : 0);
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

  /* dots jump straight to one photo of the current suit */
  lbDots?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-dot]");
    if (!dot) return;
    const item = state.gallery[state.galleryIndex];
    if (!item) return;
    const firstPhotoOfSuits = state.galleryIndex - item.imageIndex;
    openLightbox(firstPhotoOfSuits + Number(dot.dataset.dot));
  });
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
}

/* ------------------------------------------------------------------ init -- */

function showLoadError(err) {
  console.error("[SURF WETSUIT]", err);
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
    const text = url.searchParams.get("text") || `Hi ${SHOP_NAME}, I would like to buy a wetsuit.`;
    el.setAttribute("href", `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`);
  });
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());
}

async function init() {
  bindEvents();
  syncStaticWaLinks();

  try {
    state.products = await loadCatalog();
  } catch (err) {
    showLoadError(err);
    return;
  }

  grid.setAttribute("aria-busy", "false");
  render();
  $("#skeleton")?.remove();
}

document.addEventListener("DOMContentLoaded", init);
