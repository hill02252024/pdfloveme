# pdfloveme.com — site facts and index-health audit

Working notes, not a report. Every claim has the file that proves it.

---

## A1 — what this site is

| Fact | Value | Evidence |
|---|---|---|
| Domain | `pdfloveme.com` (apex, no `www`) | `CNAME` |
| Host | GitHub Pages, repo `hill02252024/pdfloveme` | `git remote -v`, `.nojekyll` |
| Deploy | Push to `main`. **No GitHub Actions** — `.github/` does not exist | filesystem |
| Language | English throughout | `<html lang="en">` on every page |
| Pages | 32 indexable | `sitemap.xml` = 32 URLs = 32 files |
| Structure | `/index.html`, `/pages/*.html` (20 tools + about/contact/privacy/terms), `/blog/*.html` (10 posts + index) | `ls pages blog` |
| URL form | flat `.html`, apex, https — kept as-is; these are long-indexed URLs | canonicals on every page |
| Generator | none before this run; sitemap was hand-maintained | old `sitemap.xml` had hand-set `changefreq`/`priority` |
| Sitemap now | `scripts/build-sitemaps.mjs`, walks the filesystem and takes each page's own canonical as the URL | that file |
| Ads | AdSense loader commented out, placeholder blocks in markup | `pages/*.html` head comment |
| Shared JS | `js/app.js` — tier limits, dropzone, toast, download helpers | `window.PDFLove` at `js/app.js:211` |

## A1 — tool inventory (20)

`merge` `split` `rotate` `delete-pages` `jpg-to-pdf` `pdf-to-jpg` `encrypt`
`compress` `organize` `watermark` `page-numbers` `crop` `unlock` `sign` `edit`
**`fill-form` (new)** — plus `about` `contact` `privacy` `terms`.

---

## B — index-health audit

Final state: **32 pages · 32 canonicals · 32 sitemap URLs · 0 invalid JSON-LD ·
0 broken internal links · 0 errors.**

Every check below was proved to fire on a deliberately broken control page
before being trusted, then the control was deleted.

| # | Check | Result | Control fired on |
|---|---|---|---|
| B1 | canonical present, absolute, https, apex, self-referencing | pass, 32/32 | `http://`, `www.`, and a canonical pointing at another page |
| B2 | no unexpected `noindex` | pass — **nothing on the site carries one** | an injected `noindex,follow` |
| B3 | real title ≤60, description 150–160, exactly one H1, no duplicates | pass, all 32 | 1-char title, 9-char description, two H1s |
| B4 | no dead internal links | pass, 0 | a link to a non-existent page |
| B5 | sitemap URL = that page's canonical, count matches | pass, 32 = 32, 0 mismatches | control page made count 33 vs 32 |
| B6 | robots.txt blocks nothing indexable, and no CSS/JS | pass | a fake `Disallow: /pages/` + `/css/` |
| B7 | main content in static HTML, not JS-rendered | pass, 0 pages under the floor | a page whose body was written by `innerHTML` |
| B8 | `WebApplication` + `BreadcrumbList` + `FAQPage`, valid JSON, **no `aggregateRating`/`review`** | pass, 16 tool pages | malformed JSON, and a valid block containing `aggregateRating` |
| B9 | ≥600 words of original copy per tool page | pass — see below | — |

### B2 detail

Nothing had to be removed. The site had **zero** `noindex` directives anywhere,
including the 404 case (there is no `404.html` on this site at all).

### B9 detail — thin content was the real problem

Fifteen tool pages were badly thin. Static word counts before this run:
`rotate` 57, `delete-pages` 60, `encrypt` 60, `organize` 67, `merge` 68,
`split` 68, `compress` 71, `jpg-to-pdf` 73, `pdf-to-jpg` 79, `crop` 87,
`page-numbers` 87, `watermark` 90, `unlock` 96, `sign` 129, `edit` 147.

Each now carries 600+ words written specifically for that tool — what the tool
actually does, how to use it, when it comes up, what happens to the file, and
four FAQs. No shared template with the name swapped; the copy for `compress`
argues about image quality trade-offs, the copy for `edit` warns that black-out
boxes do not remove text, the copy for `unlock` explains it is not a cracking
tool. Injection source: `scratchpad/pdfcopy/tools_a.py`, `tools_b.py`.

---

## C — the PDF fill tool

### C1 — what already existed

`pages/sign.html` had half of it: pdf.js preview plus drag-to-place overlay of a
signature image. Missing: AcroForm detection and filling, arbitrary text boxes,
and any Chinese support at all. So the fill tool was built new rather than
retrofitted, reusing the same preview/overlay pattern.

### C2 — what was built

| File | Role |
|---|---|
| `js/fill-pdf-core.js` | Pure PDF logic: `detectFields`, `fillAcroForm`, `overlayItems`. No DOM, no network. Libraries are passed in, so the same file runs headlessly under Node. |
| `js/fill-form.js` | Browser UI: preview, field list, click-to-place boxes, drag, font size, signature pad, download. |
| `pages/fill-form.html` | The tool page + 1,000 words of copy + three JSON-LD blocks. |

Behaviour: if `getForm()` returns fields, they are listed and filled with
`setText()`. If it returns none, the tool switches to overlay mode and stamps
text and PNG signatures with `drawText`/`drawImage`. **Neither path rewrites the
existing content stream.**

### C2 — Chinese

`vendor/fonts/NotoSansTC-Regular-subset.ttf`, 1.9 MB. Built from the OFL
Noto Sans TC variable font: instanced to weight 400, then subset with
`pyftsubset` to ASCII + CJK punctuation + **Big5 Level 1 (5,401 chars) +
GB2312 Level 1 (3,755 chars) = 6,888 unique glyphs**. Embedded through
`@pdf-lib/fontkit` only when the text contains something outside Latin-1.

### C3 — privacy claim, verified against the code

Grep of every non-vendor `.js`/`.html` for `fetch(`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon`, `FormData`, `.upload` returns **exactly one hit**:
`js/fill-form.js:33`, a `GET` for the font on this same origin, with no body and
no document data.

The page copy was corrected to match. It originally said "no fetch", which was
false once the font loader existed; it now names the one request and states what
it does and does not carry. A privacy claim that is 99% true is a lie.

### C4 — dependencies vendored

All third-party JS now served from this domain. 16 files were repointed off
`cdnjs.cloudflare.com` and `cdn.jsdelivr.net`:

```
vendor/pdf-lib/pdf-lib-1.17.1.min.js          vendor/pdfjs/pdf-3.11.174.min.js
vendor/pdf-lib/cantoo-pdf-lib-2.3.2.min.js    vendor/pdfjs/pdf.worker-3.11.174.min.js
vendor/pdf-lib/fontkit-1.1.1.umd.min.js       vendor/jszip-3.10.1.min.js
vendor/fonts/NotoSansTC-Regular-subset.ttf
```

Zero CDN-hosted JavaScript remains. The Google Fonts stylesheet is left in place:
it is styling, not function, and the site degrades to system fonts without it.

### E3 — tested against three real files

`scripts/pdf-tests/` — checked into the repo so it can be re-run. It loads
`js/fill-pdf-core.js` itself, not a copy.

| Fixture | Checks |
|---|---|
| `form-acroform.pdf` | 3 fields detected by name; filled with 陳大文 / 香港九龍 / 9123 4567; re-parsed and values read back; original heading intact |
| `form-flat.pdf` | correctly detected as having no fields; text + PNG signature overlaid; **original text byte-identical after** |
| `form-chinese-3page.pdf` | 3 pages preserved; Chinese stamped on each page and extracted back correctly, not mojibake; original headings intact |

Plus a negative control: an unfilled file must *not* contain the test values, so
the assertions cannot pass vacuously. **23 checks, all passing.**

---

## D — the SEO page

`/pages/fill-form.html`, 1,008 static words, English (matching the site).
Targets *fill pdf form online free*, *add text to pdf without editing*,
*sign pdf online no upload*. FAQ answers all four required questions: scanned
files, Chinese, whether the original text changes, and who can see the file.
Linked from the homepage tool grid and reciprocally with `sign`, `merge`,
`compress` and `edit`.
