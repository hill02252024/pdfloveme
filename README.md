# PDFLoveMe

Private, **100% in-browser** PDF tools. No backend, no build step, no uploads — every file is processed locally in the user's browser. Pure static files, ready for GitHub Pages.

## ✨ Tools

| Tool | File | Library |
|------|------|---------|
| Merge PDF | `pages/merge.html` | pdf-lib |
| Split PDF | `pages/split.html` | pdf.js (preview) + pdf-lib |
| Rotate PDF | `pages/rotate.html` | pdf.js + pdf-lib |
| Delete Pages | `pages/delete-pages.html` | pdf.js + pdf-lib |
| JPG → PDF | `pages/jpg-to-pdf.html` | pdf-lib |
| PDF → JPG | `pages/pdf-to-jpg.html` | pdf.js + JSZip |
| Encrypt PDF | `pages/encrypt.html` | @cantoo/pdf-lib |
| Compress PDF (**Pro**) | `pages/compress.html` | pdf.js + pdf-lib |

## 📦 CDN libraries (pinned — do not change)

- **pdf-lib 1.17.1** — cdnjs → `window.PDFLib`
- **pdf.js 3.11.174** — cdnjs (`pdf.min.js` + `pdf.worker.min.js`, `workerSrc` set per page)
- **JSZip 3.10.1** — cdnjs → `window.JSZip`
- **@cantoo/pdf-lib 2.3.2** — jsDelivr (`/dist/pdf-lib.min.js`, UMD `window.PDFLib`) — encrypt only

## 🗂 Structure

```
GITHUB_PDF/
├── index.html              Landing page
├── css/style.css           Design system + tool UI
├── js/app.js               Shared logic (tier, validation, dropzone, toast, downloads)
├── pages/                  8 tool pages + privacy + terms
├── CNAME                   pdfloveme.com
├── .nojekyll               Disable Jekyll on GitHub Pages
├── robots.txt / sitemap.xml / ads.txt
└── README.md
```

## 🔐 Tiers

Stored in `localStorage` under key **`pdfloveme_tier`** (`free` default, or `pro`).

| Tier | Max file size | Max files | Compress |
|------|---------------|-----------|----------|
| free | 50 MB | 20 | ❌ (upsell) |
| pro  | 500 MB | 100 | ✅ |

Switch to Pro for testing/dev:

```js
localStorage.setItem('pdfloveme_tier', 'pro'); // then reload
localStorage.setItem('pdfloveme_tier', 'free');
```

> Note: the tier flag is a **client-side UX gate**, not a security boundary. Wire it to your real billing/auth before going commercial.

## 🚀 Run locally

Must be served over HTTP (not `file://`) so the pdf.js worker and CDN modules load:

```bash
cd GITHUB_PDF
python3 -m http.server 8000
# open http://localhost:8000
```

or `npx serve` / any static server.

## 🌐 Deploy to GitHub Pages

1. Push this folder's contents to a repo (root).
2. Repo → **Settings → Pages** → deploy from branch (`main`, `/root`).
3. The `CNAME` file points to `pdfloveme.com` — set the matching DNS (A/ALIAS to GitHub Pages, or CNAME for `www`).
4. `.nojekyll` is included so the `pages/` and `js/` folders are served verbatim.

## 💰 Monetisation — you must replace these placeholders

1. **AdSense client id** — replace every `ca-pub-XXXXXXXXXXXXXXXX` (in `index.html` + all 8 tool pages, in the `adsbygoogle.js` loader and each `data-ad-client`).
2. **Ad slots** — replace `data-ad-slot="0000000001"` / `"0000000002"` in `index.html` with real slot ids; add `<ins class="adsbygoogle">` blocks to tool pages if desired.
3. **ads.txt** — replace `pub-XXXXXXXXXXXXXXXX` with your real AdSense publisher id.
4. **Pricing/billing** — the Pro/Team buttons currently link to `#pricing`; connect them to your checkout (e.g. Stripe) and set `pdfloveme_tier` on success.

## 🔒 Privacy

No file ever leaves the browser. All PDF/image processing uses client-side WebAssembly/JS. The only third-party network calls are the pinned CDN libraries, Google Fonts, and (once configured) AdSense.
