# SURF WETSUIT — wetsuit shop catalogue

A production-ready **static** e-commerce catalogue for a wetsuit **shop** that
sells wetsuits with **delivery across Morocco**. Pure HTML + CSS + vanilla
JavaScript, no framework, no build step for the site itself, no server. Deploys
to the Netlify free tier by drag-and-drop in about a minute.

**Suits are sold, not rented.** Prices are one-off selling prices in MAD; there
is no rental period anywhere on the site. Wetsuits only — no surfboards.

**No physical shop.** There is no address and no opening hours. Wetsuits are
delivered anywhere in Morocco, and buyers in **Tamraght** or **Taghazout** can
meet in person to try the suit on before paying.

**Contact:** WhatsApp `0611321357` (set as `212611321357` in `js/app.js`).

---

## 1. Project goals

Give a small Moroccan wetsuit seller a phone-first catalogue that:

- loads in under a second on a 3G connection,
- lets a customer find their size in two taps,
- converts to a WhatsApp order with the suit, size and price pre-written,
- can be updated by the owner from a phone, without a developer,
- needs no shop, no address and no opening hours to operate.

## 2. Currently completed features

| # | Feature | Status |
|---|---------|--------|
| 1 | Reads products from `content/products/*.md` (YAML front-matter) | ✅ |
| 2 | Full-screen photo lightbox with prev/next + swipe on mobile | ✅ |
| 2b | **Two photos per product** (`image` + `image2`), with a `1 / 2` counter, dot switcher, and card badge | ✅ |
| 3 | Instant size filtering (All / S / M / L / XL) — sticky bar | ✅ |
| 4 | Live search across name, size, thickness, category, description | ✅ |
| 5 | WhatsApp order button — one constant `WHATSAPP_NUMBER` in `js/app.js` | ✅ |
| 6 | Decap CMS admin panel at `/admin` (git-gateway, Netlify Identity) | ✅ |
| 7 | Dark surf theme (#061525 / #0e2a4d / #00E5FF), mobile-first | ✅ |
| 8 | 2-column mobile / 4-column desktop product grid | ✅ |
| 9 | Product cards: photo, name, size badge, thickness, price in MAD, stock badge, Buy button | ✅ |
| 9b | Photo-count badge (gallery icon + number) on cards whose suit has more than one photo | ✅ |
| 10 | Stock states: In stock / Last one / Sold out (disables the buy button) | ✅ |
| 11 | Delivery-across-Morocco + meet-in-person messaging (no address/hours) | ✅ |
| 12 | SEO: canonical, Open Graph, `SportingGoodsStore` JSON-LD, sitemap, robots | ✅ |
| 13 | Buying & delivery info + FAQ sections | ✅ |
| 14 | Deployment instructions in an HTML comment at the top of `index.html` | ✅ |
| 15 | New vs used condition stated per listing (in each product description) | ✅ |

### Design tokens

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#061525` | page background |
| `--card` | `#0e2a4d` | cards, chips, header buttons |
| `--accent` | `#00E5FF` | prices, active chip, CTA glow |

Breakpoints: mobile-first base, `620px` (2-col info, inline filter bar), `900px`
(4-column grid, wider gutters).

## 3. Functional entry points (URIs)

| Path | Purpose | Parameters |
|------|---------|-----------|
| `/index.html` | Catalogue, filters, search, lightbox, buying info, FAQ | `#catalog-section`, `#info-section`, `#faq-section` (anchors) |
| `/admin/` | Decap CMS content manager (login required; not linked in the site footer) | — |
| `/content/products/index.json` | Auto-generated manifest of which `.md` files to load + `featured` list (rewritten by `scripts/build-catalog.js`) | — |
| `/content/products/<slug>.md` | One wetsuit product | front-matter fields below |
| `/_redirects` | `/admin` → `/admin/index.html`, `/` → `/index.html`. No catch-all rule, so real files keep their real paths | — |

The catalogue is a single static page that loads its own data over `fetch`, so
**opening `index.html` with `file://` will not show products** — it must be
served over HTTP (Netlify, `npx serve`, VS Code Live Server, etc.).

### Query/filter behaviour

- Size filter is client-side state (`ALL | S | M | L | XL`), applied instantly.
- Search input is debounced at 90 ms and matches a lower-cased concatenation of
  `name + thickness + category + size + description + body`.
- Result line shows “*n* of *m* wetsuits”; empty state offers a reset button.

### Photo gallery behaviour

- Every suit has at least one photo (`image`) and may have a second (`image2`).
- A card whose suit has two photos shows a small **gallery badge with “2”** at the
  bottom-right of the picture instead of the magnifier icon. One-photo suits keep
  the plain magnifier.
- Tapping a card opens the lightbox **on that suit's first photo**.
- The **left/right arrows and the mobile swipe stay inside the suit you opened** —
  they cycle between its own photos (photo 1 ↔ photo 2) and never jump to another
  product. A suit with only one photo shows no arrows and no dots at all.
- The header pill shows the position, e.g. `1 / 2`, and the row of dots below the
  photo lets you jump straight to a specific photo.
- The arrow keys (←/→) do the same thing as the on-screen arrows.

## 4. Data models

### Product (Markdown front-matter + body)

```yaml
---
name: "Wetsuit 3/2mm Black"   # string
size: "M"                      # S | M | L | XL
category: "Wetsuit"            # fixed
thickness: "3/2mm Summer"      # string
price: 650                     # number, MAD — the selling price, one-off
stock: "available"             # available | last | out
featured: true                 # boolean
image: "images/uploads/wetsuit-3-2mm-black.jpg"     # photo 1 (the card photo)
image2: "images/uploads/wetsuit-3-2mm-black-2.jpg"  # photo 2 — optional
description: "One or two sentences shown under the photo."
---

Optional longer Markdown shown inside the enlarged photo view.
Use it for condition (new / lightly used) and sizing notes.
```

**Photos (up to 2 per product).** `image` is the main photo that appears on the card.
`image2` is optional and adds a second photo of the same suit (a side view, a seam
or label close-up). Leave `image2` empty and the suit simply has one photo — no
badge, no arrows, nothing to break. The app reads the pair and exposes them as an
ordered `images` array, so the lightbox can step between them. Add as many products
as you like; only these six front-matter keys are special. Fields `image3`/
`image4` are already understood by `js/app.js` if you ever want more than two
photos by hand.

`content/products/index.json` **(auto-generated — do not edit by hand)**:

```json
{
  "note": "Generated by scripts/build-catalog.js on every Netlify deploy.",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "count": 6,
  "featured": ["wetsuit-3-2mm-black"],
  "files": ["wetsuit-3-2mm-black.md"]
}
```

A browser cannot list a directory, so `index.json` is the manifest that tells
`js/app.js` which files exist. `scripts/build-catalog.js` regenerates it from the
`.md` files on every deploy, and also logs a warning if a suit is missing a
price, an image, or has a size outside S/M/L/XL. To add a wetsuit, just add a
`.md` file (or use the admin panel) — there is no list to keep in sync.

### Storage services used

- **Netlify CDN** — serves the static files.
- **Git repository** — the product database (one `.md` file per wetsuit).
- **Netlify Identity + Git Gateway** — login for `/admin`, writes commits.
- No database, no server-side code, no API keys, no cookies, no client storage.

> Note: the earlier Progressive Web App layer (service worker, web app manifest
> and offline cache) was **removed on request**. The site is online-only: it
> always fetches live prices and stock, and shows an error message if the
> catalogue cannot be reached.

## 5. Example catalogue (6 wetsuits for sale)

| Name | Size | Thickness | Price (MAD) | Condition | Stock |
|------|------|-----------|-------------|-----------|-------|
| Wetsuit 3/2mm Black | M | 3/2mm Summer | 650 | new | in stock, featured |
| Wetsuit 4/3mm Winter | L | 4/3mm Winter | 850 | new | in stock, featured |
| Wetsuit 3/2mm Blue | S | 3/2mm Summer | 620 | lightly used | in stock |
| Wetsuit 5/4mm Semi-Dry | XL | 5/4mm Semi-Dry | 950 | new | last one |
| Wetsuit 2/2mm Summer | M | 2/2mm Summer | 480 | lightly used | in stock |
| Wetsuit 4/3mm Steamer | L | 4/3mm Steamer | 780 | new | in stock, featured |

Condition is stated in each product's description and body text; there is no
separate condition field, so no CMS change is needed to record it.

All six example suits ship with **two photos** each
(`wetsuit-<slug>.jpg` and `wetsuit-<slug>-2.jpg`), so the `1 / 2` gallery,
the dots, the arrows and the card badge are all visible out of the box. Replace
them with real photos and keep the same two-per-product naming, or just upload a
second photo in the admin panel.

## 6. File structure

```
index.html                 catalogue (deployment instructions in a comment at the top)
admin/index.html           Decap CMS entry point
admin/config.yml           CMS backend, media folder and product fields
css/style.css              full dark-surf theme, mobile-first
js/app.js                  data loading, filtering, lightbox, WhatsApp glue
content/products/*.md      6 example wetsuits
content/products/index.json auto-generated catalogue manifest (see scripts/)
images/uploads/            product photos — one or two per suit (`*.jpg`, `*-2.jpg`)
images/favicon.svg         site icon
images/placeholder.svg     shown if a product photo is missing or fails to load
icons/icon.svg             app icon
icons/icon-maskable.svg    maskable app icon
scripts/build-catalog.js   regenerates content/products/index.json on each deploy
netlify.toml               build command, cache headers, security headers
_redirects                 Netlify redirect rules
.gitignore                 ignores .DS_Store, .netlify/, deploy zips
robots.txt, sitemap.xml    search engine files
```

## 7. Setup with your own GitHub + Netlify (full walkthrough)

### 7.1 Why Git instead of drag-and-drop

Drag-and-drop gets the catalogue online in a minute, but the Decap **admin panel
needs Git**: when the owner saves a wetsuit, Decap commits a Markdown file, and
that commit is what triggers a rebuild. So Git + Netlify + Identity + Git Gateway
is the combination that gives a non-technical owner a working admin panel.

Netlify is free for this. You do **not** need a GitHub token or any API key —
Git Gateway handles authentication for you.

### 7.2 Which settings are already correct

`netlify.toml` is committed, so Netlify detects everything on import — you do not
have to type build settings into the UI:

| Setting | Value | Where it comes from |
|---------|-------|---------------------|
| Build command | `node scripts/build-catalog.js` | `netlify.toml` |
| Publish directory | `.` (repo root) | `netlify.toml` |
| Node version | 20 | `netlify.toml` |
| Branch to deploy | your default branch | Netlify auto-detect |
| Domain | random `*.netlify.app` until you add one | Netlify |

`scripts/build-catalog.js` regenerates `content/products/index.json` from the
`.md` files at build time. That is why adding a wetsuit never requires editing a
list by hand: a browser cannot list a folder, so this index is what the page
reads to know which products exist.

### 7.3 Step-by-step

**Step 1 — push the project to your own GitHub (local terminal)**

```bash
cd path/to/this/project
git init
git add .
git commit -m "SURF WETSUIT shop"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/surf-wetsuit.git
git push -u origin main
```

Create the GitHub repository first, and create it **empty** (no README, no
.gitignore) so the first push has no conflict. If GitHub's default branch is
`master`, tell Decap about it: in `admin/config.yml` change `branch: main` to
`branch: master`.

**Step 2 — connect Netlify to that repository**

1. <https://app.netlify.com> → **Add new site** → **Import an existing project**.
2. **GitHub** → authorise → pick `surf-wetsuit`.
3. Netlify reads `netlify.toml`; leave the detected settings alone → **Deploy**.
4. After the first deploy, check the log line
   `[catalog] wrote content/products/index.json with 6 product(s)`. The site is
   live at `https://<name>.netlify.app`.

**Step 3 — enable the admin panel login**

1. **Site configuration → Identity → Enable Identity**.
2. Scroll to **Registration** → set to **Invite only** (so strangers cannot sign up).
3. **Identity → Services → Git Gateway → Enable Git Gateway**.
4. **Identity → Invite users** → enter the owner's email → **Send**.
5. The owner opens the invitation email, sets a password, and logs in at
   `https://<name>.netlify.app/admin`.

Test it: edit a price in the admin panel, save, and watch Netlify redeploy. The
edit appears in `content/products/` as a commit on your GitHub repository.

**Adding a second photo in the admin panel.** Open a wetsuit — the form has
**Photo 1** (the card photo) and **Photo 2 (optional)**. Upload a second image into
Photo 2 and save; Decap writes an `image2:` line into the Markdown file and the
card gains the `2` gallery badge. Leave Photo 2 empty for a single-photo suit.
The six example suits already have both photos filled in.

**Step 4 — optional custom domain**

**Domain management → Add a domain**, then either point your registrar's
nameservers at Netlify or add the A/CNAME records shown. HTTPS is issued
automatically. Afterwards update the placeholder domain in `robots.txt`,
`sitemap.xml`, the `<link rel="canonical">` and the JSON-LD block in `index.html`.

### 7.4 Deploying the whole folder vs. only the site root

Publish directory is `.`, so **everything** in the repository is served —
including `README.md`, `netlify.toml` and `scripts/`. That is harmless for a shop
site, and it keeps `_redirects` and the `netlify.toml` header rules working. If
you prefer a tidy deploy, move the site files into a `site/` folder later and
set `publish = "site"` (remember to keep `admin/` and `content/` inside it).

### 7.5 Common Git-deploy problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/admin` shows "Not Found" | no Identity, or the repo is not Git-connected | finish 7.3 Step 3 |
| Admin saves but the site does not change | Git Gateway disabled, or deploying from a branch other than the one you edit | enable Git Gateway; match `branch:` in `admin/config.yml` to Netlify's production branch |
| New wetsuit does not appear | the build did not run | check deploy log for `[catalog] wrote …` |
| Everything 404s / photos break | a catch-all `/*  /index.html  200` redirect was added | remove it; this is a multi-file static site, not an SPA |
| Login email never arrives | Identity is disabled or the address was not invited | re-invite under **Identity → Invite users** |
| Error loading the CMS configuration | invalid YAML in `admin/config.yml` | indent with spaces, never Tab; keep every key in a collection in the same column; `slug` must be a plain string |

## 8. Not yet implemented / known limitations

- No basket, checkout or card payments — orders go to WhatsApp by design (no
  server, no PCI scope, no card fees, no shipping calculator).
- No shipping cost calculator; delivery time and cost are agreed on WhatsApp.
- No size chart, returns flow or stock quantity per suit; stock is a simple
  three-state badge edited by the owner.
- No customer accounts, reviews or ratings.
- Images are not auto-optimised at deploy time; keep uploads under ~300 KB
  (or run them through a compressor before uploading). Because a suit can now take
  **two** photos, watch the page weight on the grid — cards only ever load the
  first photo, so the second is fetched only when the lightbox opens.
- `robots.txt`, `sitemap.xml` and the canonical/OG tags use the placeholder
  domain `surf-wetsuit.netlify.app` — replace it after choosing a real domain.
- The drag-and-drop deploy cannot host the `/admin` editor (that needs Git
  Gateway); the catalogue itself works either way. See section 7 for the Git route.
- The build step only rewrites `content/products/index.json`. There is no
  minification, image optimisation or bundling.
- No offline mode and no installable app: this was intentionally removed. The
  site requires a connection to load products.

## 9. Recommended next steps

1. Confirm the WhatsApp number in `js/app.js` is `212611321357` (already set) and
   set the real domain in `robots.txt`, `sitemap.xml`, `index.html`
   (canonical/OG) and the JSON-LD block.
2. Replace the example photos in `images/uploads/` with real product photos (the
   current ones are Creative-Commons surf photos used as placeholders). Each suit
   takes two: `wetsuit-<slug>.jpg` and `wetsuit-<slug>-2.jpg`.
3. Review the prices: they are still 480–950 MAD, which were originally per-day
   rental rates. Set realistic one-off selling prices.
4. Connect GitHub + Identity + Git Gateway and hand `/admin` to the owner.
5. Add a size chart and a shipping/returns page as the shop grows.
6. Optional: add a French version (`/fr/`) — most Moroccan surf-zone visitors
   arrive from French-speaking markets.
7. Register the site with Google Search Console and submit `sitemap.xml`.

## 10. Public URLs

| Environment | URL |
|-------------|-----|
| Netlify default after Git import | `https://<your-site-name>.netlify.app/` |
| Custom domain (once pointed) | `https://your-domain.com/` |
| Admin panel | `https://<your-site>/admin/` |
| Catalogue data | `/content/products/index.json` and `/content/products/*.md` |
| WhatsApp orders | `https://wa.me/212611321357` |
