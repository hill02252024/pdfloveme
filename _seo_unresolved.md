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
- **Font subset is Big5-HKSCS + GB2312 (16,926 code points, 5.6 MB).** Covers
  every one of the 425 audited Hong Kong name and address characters. Anything
  outside those two standards still will not render. See *Font coverage, and
  what it costs* below for the size trade and how to reverse it.
- **The font now loads on demand**, the moment a CJK character is typed, with a
  visible loading line and a readable error if it fails — it never silently
  degrades to boxes. A Latin-only fill makes no network request at all, which
  the E2E suite asserts rather than merely claims.
- **Visual signature only.** Not a certificate-based digital signature, and the
  page says so plainly.
- **Encrypted PDFs** load with `ignoreEncryption`, which works for permission-only
  protection but not for a file that needs an open password. Unlock it first.

## Testing — what is now covered, and what still is not

`scripts/pdf-tests/` (dev-only; the site ships no npm dependencies). Five
suites, each with a negative control, because a test that cannot fail proves
nothing.

- **`run-tests.mjs`** — the core against three real documents. Asserts the
  original text is byte-identical before and after.
- **`coords.test.mjs`** — 477 assertions on the coordinate maths, compared
  against **pdf.js's own `convertToPdfPoint`** rather than hand-computed
  numbers. 4 page sizes × 4 rotations × 4 scales × 7 positions, plus
  devicePixelRatio invariance, the Y-flip, and rotation normalisation. Control:
  a deliberately wrong conversion must be caught in every configuration.
- **`font-coverage.test.mjs`** — 425 common Hong Kong name and address
  characters must be in the subset, and no glyph record may be odd-length.
  Controls: a rare Ext-A character must be reported missing, and an unpadded
  font must be both rejected and shown to draw nothing.
- **`e2e.test.mjs`** — headless Chromium against the real page: click, type,
  drag, sign, download, then read the produced PDF back and assert positions
  within ±3pt. Control: `--break` injects a 50pt offset and the position
  assertions must fail.
- **`render.test.mjs`** — rasterises the files the E2E just produced and counts
  pixels. Controls: drawing nothing, and drawing Chinese with a Latin-only font
  in three different `.notdef` shapes, must all fail the assertions.

**Both gaps named in the previous two runs are now closed**, and closing the
second one found the worst bug on the site.

### The bug pixel checks found

Every Chinese PDF the tool produced was **blank**. Not garbled — blank.

`@pdf-lib/fontkit` 1.1.1 subsets a font by copying raw glyph records and then,
if the total fits in 16 bits, writing a short `loca` table with
`offsets[i] >>>= 1`. That shift is unconditional. `pyftsubset` writes glyf with
padding 1, so 2,952 of the shipped font's 5,932 glyph records were an odd
number of bytes, and every offset after the first odd one was wrong by half a
byte. Six of every seven characters rendered as nothing at all.

Text extraction was correct the whole time, because `/ToUnicode` is a separate
structure that the corruption never touches. Four suites and 526 assertions
were green over it. Nothing short of looking at pixels was ever going to catch
it. The fix is `scripts/build-font-subset.py`, which pads glyf to 4 bytes, and
`font-coverage.test.mjs`, which fails if a future rebuild forgets.

Four earlier bugs, all of which would also have shipped: the baseline offset
going the wrong way on 90°/270° pages (22pt out); `constructor.name` being
mangled by the minified pdf-lib, which left **every AcroForm field list empty
for real users** while the Node suites — loading the unminified package —
saw nothing wrong; drag reading a detached element's rect and slamming every
box to the left edge; and the subset being unable to write four Hong Kong
district names.

### Font coverage, and what it costs

The subset is now Big5-HKSCS + GB2312, 16,926 code points, **5.6 MB**. It was
Big5 Level 1 + GB2312 Level 1, 1.9 MB, and an audit of 425 common Hong Kong
name and address characters found seven missing: 埗, 磡, 鰂, 筲, 邨, 脷, 舖.
Four of those are not in Big5 at any level — 深水埗, 鰂魚涌, 鴨脷洲 and every
屋邨 in the city were unwritable, and 紅磡 and 舖 needed Big5 Level 2.

Judgement call, logged because the trade is real: **5.6 MB is a lot**. It is
fetched once, only when a user actually types a character outside Latin-1,
with a visible loading line while it arrives, and the browser caches it after
that. A form filler for Hong Kong that cannot spell four of the city's
districts is worse than a slow first Chinese keystroke, so coverage won. If
that judgement is wrong the lever is `scripts/build-font-subset.py`: narrowing
`encodable("big5hkscs")` to Big5 plus a curated HK supplement lands around
2.8 MB, at the cost of anything the curated list forgets.

Two further limits of the font, unchanged:

- Characters outside HKSCS and GB2312 still will not render — some rare
  personal-name characters, and CJK Extension B and beyond.
- **WOFF2 would halve the download to 2.3 MB and cannot be used.** fontkit
  parses it, but subsetting then throws (`this.font.loca.offsets` is
  undefined — the WOFF2 transform removes `loca`), so the font would have to
  be embedded whole and every output PDF would carry 5.6 MB of it.

### Still not automated

- **Touch input.** The pad and drag handlers bind `touchstart`/`touchmove`, but
  the E2E suite drives a mouse. Untested on a real touchscreen.
- **Mobile layout.** Only one viewport (1400×1200) is exercised.
- **Fidelity of shape.** The pixel checks prove ink is present, correctly
  placed, the right width, and structured like distinct glyphs. They do not
  prove the glyph is the *right* character — a font mapping 陳 to 東 would
  pass everything here.
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
