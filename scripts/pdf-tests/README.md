# fill-pdf test harness

Dev-only. The site itself ships no npm dependencies — everything the browser
needs is vendored under `/vendor`. Nothing here is deployed.

`tools-smoke.test.mjs` is the exception to the install step: it has no npm
dependencies. It talks to Chrome over the DevTools protocol through
`lib/cdp.mjs` and serves the repo itself, so `node tools-smoke.test.mjs`
works in a clean checkout.

It asserts on the bytes, not on the UI. Each page hands its result over
through `URL.createObjectURL(blob)`, so the harness patches that call before
the page loads and reads the blob directly — which is also why a tool that
downloads without showing a Download button (pdf-to-jpg, fill-form) is
checked the same way as one that shows a button.

```
npm install          # pdf-lib, fontkit, pdfjs-dist, playwright, canvas
npx playwright install chromium
npm run fixtures     # regenerate fixtures/*.pdf
npm test             # core → coords → font → e2e → render
```

Five suites, each with a negative control. **A test that cannot fail proves
nothing**, so every suite deliberately breaks itself once and asserts that the
break is caught. If a control ever stops failing, treat that suite as void.

| suite | what it covers | control |
|---|---|---|
| `run-tests.mjs` | the core against three real documents; original text byte-identical before and after | fill a field that does not exist |
| `coords.test.mjs` | 477 assertions on the coordinate maths, compared against **pdf.js's own `convertToPdfPoint`** — 4 page sizes × 4 rotations × 4 scales × 7 positions, plus devicePixelRatio invariance, the Y-flip and rotation normalisation | a deliberately wrong conversion, which must be caught in *every* configuration |
| `font-coverage.test.mjs` | 425 common Hong Kong name and address characters are in the subset; no glyph record is odd-length | a rare Ext-A character must be reported missing; an unpadded font must be rejected *and* must visibly fail to render |
| `e2e.test.mjs` | headless Chromium against the real page: click, type, drag, sign, download; positions within ±3pt | `--break` injects a 50pt offset; the position assertions must fail |
| `tools-smoke.test.mjs` | all 16 tools end to end in headless Chrome: feed a real 3-page PDF (a JPEG for jpg-to-pdf, encrypt's own output for unlock), work the UI, and assert the file handed back is non-empty and starts with the right magic bytes | `--break` blocks every `/vendor/` request, so no library loads; all 16 must fail |
| `render.test.mjs` | rasterises the files the E2E produced and counts pixels | draw nothing, and draw Chinese with a font that has no Chinese — both must fail the assertions |

`render.test.mjs` consumes `out/` from `e2e.test.mjs`, so run the E2E first
(`npm run test:render` does both).

## Why pixels, and not just text extraction

Extraction reads `/ToUnicode`. That map stays perfectly correct when the
embedded font is broken and every glyph draws as nothing. A PDF can extract as
`陳大文` and open as a blank page, and this site shipped exactly that.

So `render.test.mjs` rasterises with pdf.js at scale 3 and works on an **added
ink** mask — the filled page minus the original fixture — which isolates what
the tool drew from whatever was already printed on the form.

Assertions per drawn string:

- the region has added ink, and the blank control area has none
- the ink is as wide as the string should be (catches "only one glyph drew")
- **CJK only** — every character position has ink; each glyph has strokes
  *inside* it, not only on its border; and the glyphs are not all identical

The last two are the tofu checks. They are separate because tofu comes in more
than one shape:

| rendering | region | min interior | edge/interior | max grid distance |
|---|---|---|---|---|
| real characters | 0.19 – 0.31 | 0.38 – 0.51 | 0.76 – 0.89 | 0.44 – 0.56 |
| hollow-box tofu | 0.18 | **0.000** | **∞** | **0.000** |
| box-with-X tofu | 0.25 | 0.37 | 1.6 | **0.000** |
| empty `.notdef` | **0.000** | – | – | – |
| broken subset (the real bug) | 0.048 | – | – | – |

A hollow box is caught by interior density, which is the textbook signature. A
box with a diagonal cross defeats that — it puts plenty of ink in the middle —
but every missing character then draws the *same* mark, so comparing glyph
density grids catches it. Thresholds sit at least 2× clear of both sides.

Both scale 2 and scale 3 separate every case cleanly; 3 is used because the
tool's default type size is 12pt and a 24px glyph makes the interior band
only a few pixels wide.

## Bugs these suites found

Five, all of which would have shipped:

1. **`.notdef` in short `loca`, or: every Chinese PDF was blank.**
   `@pdf-lib/fontkit` 1.1.1 subsets by copying raw glyph records and then, if
   the total fits in 16 bits, writing a short `loca` with `offsets[i] >>>= 1`.
   The shift is unconditional. `pyftsubset` writes glyf with padding 1, so
   2,952 of the old font's 5,932 glyph records were odd-length — every offset
   after the first one was wrong by half a byte, and six of seven characters
   drew nothing. Text extraction was perfect throughout, which is why four
   green suites missed it. Fixed by padding glyf to 4 bytes
   (`scripts/build-font-subset.py`) and asserted by `font-coverage.test.mjs`.
2. **Baseline offset went the wrong way on 90°/270° pages** — text landed 22pt
   from the click.
3. **`constructor.name` is mangled by the minified pdf-lib the browser loads**,
   so every AcroForm field list was empty for real users. The Node suites could
   not see it: they load the unminified package. Fixed with `instanceof`.
4. **Drag read a detached element's rect** (all zeros), slamming every dragged
   box to the left edge.
5. **The subset could not write four Hong Kong district names.** 埗, 鰂, 邨 and
   脷 are not in Big5 at all — only in HKSCS. Found by the coverage audit, not
   by any rendering test.

Two more failures turned out to be the tests being wrong rather than the app,
and are recorded in the code so nobody re-reports them: Playwright clicking at
viewport coordinates when the canvas is below the fold, and a drag assertion
using a canvas rect that went stale when the page scrolled mid-drag.

## Not covered

Touch input, mobile layouts, very large documents, and checkbox / radio /
dropdown filling (which the tool does not implement). Recorded in the working notes kept outside this repository.
