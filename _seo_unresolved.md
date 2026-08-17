# pdfloveme.com — unresolved / judgement calls

Companion to `_site_audit.md`. Anything here is a decision worth a second look,
not a finished job.

## Scoping calls made without asking

- **URL form left as flat `.html`.** The brief allowed either directory-style or
  `.html` as long as it is consistent, and warned against moving already-indexed
  pages. Every page here is already `.html`, self-canonical and consistent, so
  nothing was moved. This is the opposite of the sibling site (todays-tasks.com),
  where the app pages had a genuine `/apps/` 404 to repair.
- **`www` vs apex:** apex, matching `CNAME`. All 32 canonicals use it.
- **No 404 page exists** on this site. GitHub Pages serves its default. Worth
  adding a real `404.html` with `noindex,follow` at some point; out of scope here.
- **Google Fonts stylesheet kept on CDN.** C4 was about functional dependencies —
  a dead CDN must not break a tool. A missing webfont only changes typography, so
  the two remaining `fonts.googleapis.com` links stayed. All JavaScript is now
  local. Say the word and the fonts can be self-hosted too.

## The privacy sentence, corrected mid-build

The tool page first claimed the code contains "no `fetch`". That became false the
moment the Chinese font loader was written. Rather than delete the loader or
leave a comfortable half-truth, the copy now names the single request — a
same-origin `GET` for the font, no body, no document data — and says so twice, in
the banner and in the privacy section. Re-grep after any change to `js/fill-form.js`.

## Known limits of the fill tool

- **Only text fields are fillable.** Checkboxes, radio groups and dropdowns are
  listed but marked not editable. Adding them is straightforward and was left out
  rather than half-done.
- **Overlay text is single-line.** A box holds one run of text; long values need
  several boxes. No wrapping, no rich text.
- **Font subset is Big5 + GB2312 Level 1 (6,888 glyphs).** That covers ordinary
  names and addresses. Rare characters — some Hong Kong personal-name characters
  in particular — fall outside it and will not render. The fix is a larger subset
  at the cost of file size; 1.9 MB was judged the right trade.
- **The font now loads on demand**, the moment a CJK character is typed, with a
  visible loading line and a readable error if it fails — it never silently
  degrades to boxes. A Latin-only fill makes no network request at all, which
  the E2E suite asserts rather than merely claims.
- **Visual signature only.** Not a certificate-based digital signature, and the
  page says so plainly.
- **Encrypted PDFs** load with `ignoreEncryption`, which works for permission-only
  protection but not for a file that needs an open password. Unlock it first.

## Testing — what is now covered, and what still is not

`scripts/pdf-tests/` (dev-only; the site ships no npm dependencies). Three
suites, each with a negative control, because a test that cannot fail proves
nothing.

- **`run-tests.mjs`** — the core against three real documents. Asserts the
  original text is byte-identical before and after.
- **`coords.test.mjs`** — 477 assertions on the coordinate maths, compared
  against **pdf.js's own `convertToPdfPoint`** rather than hand-computed
  numbers. 4 page sizes × 4 rotations × 4 scales × 7 positions, plus
  devicePixelRatio invariance, the Y-flip, and rotation normalisation. Control:
  a deliberately wrong conversion must be caught in every configuration.
- **`e2e.test.mjs`** — headless Chromium against the real page: click, type,
  drag, sign, download, then read the produced PDF back and assert positions
  within ±3pt. Control: `--break` injects a 50pt offset and the position
  assertions must fail.

**The E2E gap named in the previous run is now closed.** Three real bugs came
out of it, all of which would have shipped:

1. Baseline offset went the wrong direction on 90°/270° pages — text landed
   22pt from the click.
2. `constructor.name` is mangled by the minified pdf-lib the browser loads, so
   **every AcroForm field list was empty for real users**. The Node suite could
   not see it: it loads the unminified package. Fixed by using `instanceof`.
3. Drag read a detached element's rect (zeros), slamming every dragged box to
   the left edge of the page.

### Still not automated

- **Touch input.** The pad and drag handlers bind `touchstart`/`touchmove`, but
  the E2E suite drives a mouse. Untested on a real touchscreen.
- **Mobile layout.** Only one viewport (1400×1200) is exercised.
- **Visual rendering.** Assertions are on extracted text coordinates, not on
  pixels. A font that embeds but renders as blank boxes would pass.
- **Very large documents.** Fixtures are 1–3 pages; nothing measures behaviour
  or memory on a 200-page scan.
- **Checkboxes, radios, dropdowns.** Detected and labelled non-editable; the
  fill path for them does not exist, so there is nothing to test yet.

## Sitemap generator

New: `scripts/build-sitemaps.mjs`. It takes each page's own `<link rel="canonical">`
as the sitemap URL, so the two can never drift. It skips `noindex` pages and
redirect stubs. There is **no GitHub Action** on this repo, so it must be run by
hand before pushing — unlike the sibling site, which has one. Adding the same
workflow here would be a sensible follow-up.
