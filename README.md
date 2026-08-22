# PDFLoveMe

Sixteen PDF tools that run entirely in the browser. There is no backend, no
build step and no upload: a file is read from disk with `FileReader`, worked
on in memory, and handed back as a `Blob`. Nothing is transmitted, so there is
nothing to delete afterwards.

Live at **[pdfloveme.com](https://pdfloveme.com)**, served straight from this
repository by GitHub Pages.

## The claim, and how to check it

The site's whole pitch is that files never leave the browser, so it should be
verifiable rather than asserted:

1. Open any tool, then pull the network cable or turn off Wi-Fi.
2. Reload once from cache — or just keep the tab open.
3. Do the job. It completes.

DevTools → Network shows the same thing: after the page and its libraries
load, running a tool issues no requests. `pages/how-it-works.html` walks
through this for a non-technical reader.

There is no third-party request at all. The typefaces were loaded from
Google Fonts until August 2026 and are now served from `vendor/fonts/web/`,
so nothing about a visit reaches anyone but this site.

## Tools

All under `pages/`, one self-contained page each.

| Page | Does | Built on |
|---|---|---|
| `merge.html` | Combine several PDFs | pdf-lib |
| `split.html` | Pull out a page range | pdf.js preview + pdf-lib |
| `organize.html` | Reorder pages | pdf.js + pdf-lib |
| `delete-pages.html` | Drop pages | pdf.js + pdf-lib |
| `rotate.html` | Fix sideways pages | pdf.js + pdf-lib |
| `crop.html` | Trim margins | pdf.js + pdf-lib |
| `compress.html` | Re-encode to a smaller file | pdf.js + pdf-lib |
| `encrypt.html` | Add a password | @cantoo/pdf-lib |
| `unlock.html` | Remove a password you know | @cantoo/pdf-lib |
| `watermark.html` | Text or image watermark | pdf.js + pdf-lib |
| `page-numbers.html` | Number the pages | pdf.js + pdf-lib |
| `sign.html` | Draw or upload a signature | pdf.js + pdf-lib |
| `edit.html` | Annotate: text, highlight, redact, image | pdf.js + pdf-lib |
| `fill-form.html` | Fill AcroForm fields, or type over a flat scan | pdf-lib + fontkit |
| `jpg-to-pdf.html` | Photos into one PDF | pdf-lib |
| `pdf-to-jpg.html` | Pages out as images, zipped | pdf.js + JSZip |

`fill-form.html` is the only one with a separate module (`js/fill-form.js`
over `js/fill-pdf-core.js`); it is also the only one that embeds a font
subset, for Chinese text on flat scans.

### Limits

50 MB per file, 20 files at once — set in `js/app.js`. They are memory
limits, not commercial ones: the whole file is held in an `ArrayBuffer`, and
a tab that runs out of memory loses the work. Nothing on the site is paid.

## Libraries

Everything is vendored under `vendor/`; no CDN is used at runtime, so the
tools keep working when a CDN does not.

| Library | Version | Used by |
|---|---|---|
| pdf-lib | 1.17.1 | 13 pages |
| pdf.js | 3.11.174 | 12 pages (`workerSrc` set per page) |
| @cantoo/pdf-lib | 2.3.2 | encrypt, unlock |
| @pdf-lib/fontkit | 1.1.1 | fill-form |
| JSZip | 3.10.1 | pdf-to-jpg |
| Noto Sans TC (HKSCS subset) | — | fill-form |

`vendor/` is about 8.9 MB, most of it the font subset. Version numbers are in
the filenames on purpose: an upgrade is a visible diff, not a silent swap.

## Layout

```
index.html            landing page
pages/*.html          16 tools + about, contact, privacy, terms, how-it-works
blog/*.html           10 articles + index
css/style.css         the whole design system, one file
js/app.js             shared helpers: dropzone, toast, download, limits
js/fill-form.js       fill-form UI
js/fill-pdf-core.js   fill-form's coordinate and drawing core
vendor/               pinned libraries and the font subset
scripts/              build and test tooling, never deployed
docs/                 notes that are not part of the site
sitemap.xml           generated — see below
```

## Working on it

No install and no build. Serve the directory and open it:

```
python3 -m http.server 8000
```

Opening a page from `file://` will not work: the pdf.js worker and the font
subset are fetched, and both are blocked by the file-protocol origin rules.

### Sitemap

`sitemap.xml` is generated, never hand-edited:

```
node scripts/build-sitemap.mjs
```

It walks the filesystem, takes each URL from that page's own
`<link rel="canonical">`, and takes `lastmod` from the file's last commit
date. Pages that are `noindex`, redirect stubs and `404.html` are skipped.
Running it twice produces the same bytes, so a no-op change makes no diff.

It writes no `changefreq` and no `priority`. Google has ignored both for
years, and a wrong `lastmod` is worse than none — which is why it comes from
git rather than from the clock.

Run it after committing content, not before, or `lastmod` lags a commit
behind.

### Tests

```
cd scripts/pdf-tests
node tools-smoke.test.mjs           # all 16 tools, no npm install needed
node tools-smoke.test.mjs --break   # negative control: all 16 must fail
```

The fill-form suites need `npm install` first. See
`scripts/pdf-tests/README.md`; every suite there has a negative control, on
the principle that a test which cannot fail proves nothing.

## Deployment

Push to `main`. GitHub Pages serves the repository root as-is. `CNAME` holds
the apex domain and `.nojekyll` stops Jekyll from eating directories that
begin with an underscore.

There is deliberately no Action that edits `sitemap.xml` or commits on its
own: a bot commit would move every `lastmod` and tell Google the whole site
changed when nothing did.

## Licence

MIT — see `LICENSE`. Vendored libraries keep their own.
