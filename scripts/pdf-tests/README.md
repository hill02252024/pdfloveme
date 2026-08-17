# fill-pdf tests

Dev-only. **The site itself has no npm dependencies** — everything the browser
needs is vendored under `/vendor`. These packages exist purely to drive tests.

```
cd scripts/pdf-tests
npm install
npx playwright install chromium
npm test
```

## What each suite covers

| Suite | Runs | Covers |
|---|---|---|
| `run-tests.mjs` | Node | `fill-pdf-core` against three real documents: AcroForm, flat/scanned, three-page Chinese. Asserts values written, output re-parses, and **the original text is byte-identical before and after**. |
| `coords.test.mjs` | Node | The coordinate maths, 477 assertions. Every point is compared against **pdf.js's own `PageViewport.convertToPdfPoint`**, not against numbers worked out by hand — pdf.js is the implementation that actually decides what the canvas looks like. Covers 4 page sizes × 4 rotations × 4 scales × 7 positions, plus devicePixelRatio invariance, Y-flip and rotation normalisation. Ends with a round trip: draw at a viewport point, re-open, and confirm the glyph came out there. |
| `e2e.test.mjs` | headless Chromium | The UI. Opens the real page, clicks the canvas, types, drags, draws a signature, downloads, then reads the produced PDF back and asserts positions within ±3pt. Also asserts the font-loading contract: a Latin-only fill issues **no network request at all**. |

## Negative controls

Every suite carries one, because a test that cannot fail proves nothing.

- `coords.test.mjs` runs a deliberately wrong conversion (no rotation, no Y-flip)
  through the same cases and asserts it is caught in **every** configuration.
- `e2e.test.mjs --break` injects a 50pt offset at the UI↔core boundary and
  asserts the position assertions fail. It must be injected at
  `PDFFillCore.overlayItems`, not `fracToPdfPoint`: `overlayItems` calls the
  internal function directly, so patching the export has no effect there.

## Bugs these caught

1. **Baseline offset went the wrong way on 90°/270° pages** — text landed 22pt
   from where it was clicked. Found by the round-trip case in `coords.test.mjs`.
2. **`constructor.name` on minified pdf-lib** — the browser build mangles class
   names to `"r"`, so every AcroForm field was classified as unknown and the
   field list came back empty for real users. The Node suite missed it entirely
   because it loads the unminified package. Found by `e2e.test.mjs`.
3. **Drag grabbed a detached element** — `select()` rebuilt the box before its
   rect was read, so `getBoundingClientRect()` returned zeros and every drag
   slammed the box to the left edge. Found by `e2e.test.mjs`.
