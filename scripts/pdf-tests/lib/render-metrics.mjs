/* ============================================================
   Visual verification helpers.
   ------------------------------------------------------------
   Reading text back out of a PDF proves the string is in the
   file. It does NOT prove a reader can see it. Extraction reads
   the /ToUnicode map, which stays perfectly correct even when
   the embedded font is broken and every glyph draws as nothing,
   or as a box. That failure shipped here once already.

   So these helpers rasterise the page with pdf.js — the same
   engine the site's own preview uses — and count pixels.

   Everything works on an *added ink* mask: the filled page minus
   the original fixture. That isolates what the tool drew from
   whatever was already printed on the form, and it makes the
   "nothing was drawn" control exact rather than approximate.
   ============================================================ */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas } = require("canvas");
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
const STANDARD_FONTS = require
  .resolve("pdfjs-dist/package.json")
  .replace("package.json", "standard_fonts/");

/** A pixel counts as ink if any channel is meaningfully off white. */
const INK_CUTOFF = 250;

/**
 * Rasterise one page to an ink mask on a white ground.
 *
 * annotationMode is ENABLE, not ENABLE_FORMS. That reads backwards and is
 * worth spelling out: ENABLE_FORMS tells pdf.js that an HTML form layer will
 * draw the fields, so it *omits* widget appearance streams from the canvas.
 * ENABLE paints them. With the wrong one a filled AcroForm rasterises as an
 * empty form and every measurement below is of blank paper.
 */
export async function renderPage(pdfBytes, pageIndex, scale) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const cx = canvas.getContext("2d");
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: cx,
    viewport,
    annotationMode: pdfjs.AnnotationMode.ENABLE,
  }).promise;
  const image = cx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    mask[i] = (image.data[p] < INK_CUTOFF || image.data[p + 1] < INK_CUTOFF ||
               image.data[p + 2] < INK_CUTOFF) ? 1 : 0;
  }
  await doc.destroy();
  return {
    mask, width: canvas.width, height: canvas.height, scale,
    vpWidth: viewport.width, vpHeight: viewport.height,
    toPNG: () => canvas.toBuffer("image/png"),
  };
}

/** Text runs on a page, with their baseline positions in viewport points. */
export async function textRuns(pdfBytes, pageIndex) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out = tc.items.map((it) => {
    const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    return { str: it.str, x: vx, yBaseline: vy, width: it.width, height: it.height };
  });
  await doc.destroy();
  return out;
}

/** Ink in a page-point rectangle of a mask, plus its tight bounding box. */
export function inkIn(img, x0, y0, x1, y1) {
  const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0));
  const X1 = Math.min(img.width, Math.ceil(x1)), Y1 = Math.min(img.height, Math.ceil(y1));
  let ink = 0, area = 0, mnx = Infinity, mny = Infinity, mxx = -1, mxy = -1;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      area++;
      if (img.mask[y * img.width + x]) {
        ink++;
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
      }
    }
  }
  return { ink, area, ratio: area ? ink / area : 0,
           box: ink ? { x0: mnx, y0: mny, x1: mxx, y1: mxy } : null };
}

/** filled minus original: the pixels the tool actually added. */
export function addedInk(filled, original) {
  if (filled.width !== original.width || filled.height !== original.height) {
    throw new Error("cannot diff renders of different sizes");
  }
  const mask = new Uint8Array(filled.mask.length);
  for (let i = 0; i < mask.length; i++) mask[i] = filled.mask[i] && !original.mask[i] ? 1 : 0;
  return { ...filled, mask };
}

/**
 * Ink density on the border band of a box versus its interior.
 *
 * This is the classic tofu signature. A missing glyph drawn from a font
 * whose .notdef is a hollow rectangle puts every pixel on the border and
 * none inside; a real character puts strokes throughout. Measured values
 * are recorded in README.md.
 */
export function edgeVsInterior(img, box, bandFraction = 0.2) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const bw = Math.max(1, Math.round(w * bandFraction));
  const bh = Math.max(1, Math.round(h * bandFraction));
  let edgeInk = 0, edgeN = 0, inInk = 0, inN = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const onBand = x < box.x0 + bw || x > box.x1 - bw || y < box.y0 + bh || y > box.y1 - bh;
      const ink = img.mask[y * img.width + x];
      if (onBand) { edgeN++; if (ink) edgeInk++; }
      else { inN++; if (ink) inInk++; }
    }
  }
  const interior = inN ? inInk / inN : 0;
  const edge = edgeN ? edgeInk / edgeN : 0;
  return { edge, interior, ratio: interior > 0 ? edge / interior : Infinity, w, h };
}

/**
 * A coarse density grid over a box, for comparing one glyph with another.
 *
 * Tofu defeats the edge/interior test when .notdef carries a diagonal cross
 * rather than being hollow — the cross puts plenty of ink in the middle. But
 * every missing character then draws the *same* mark, so comparing cells
 * catches it. Distinct real characters cannot produce identical grids.
 */
export function densityGrid(img, box, n = 12) {
  const out = [];
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x0 = box.x0 + Math.floor((gx * w) / n);
      const x1 = Math.max(x0 + 1, box.x0 + Math.floor(((gx + 1) * w) / n));
      const y0 = box.y0 + Math.floor((gy * h) / n);
      const y1 = Math.max(y0 + 1, box.y0 + Math.floor(((gy + 1) * h) / n));
      let ink = 0, area = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { area++; if (img.mask[y * img.width + x]) ink++; }
      }
      out.push(area ? ink / area : 0);
    }
  }
  return out;
}

/** Mean absolute difference between two density grids. 0 means identical. */
export function gridDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * Analyse one drawn string.
 *
 * @param img        an added-ink mask from addedInk()
 * @param placement  { x, yBaseline, size, charCount, advance, cellMode, region }
 *                   in page points, y measured from the top of the page.
 *                   cellMode "advance" slices on the expected per-glyph
 *                   advance and is right for CJK, which is one em per glyph.
 *                   cellMode "bbox" splits the ink bounding box evenly and is
 *                   the only option for proportional Latin.
 *                   region overrides the computed rectangle — used for
 *                   AcroForm widgets, where the field box is what is known.
 * @param blankRect  a page-point rectangle carrying no drawn text, used as
 *                   the baseline the text region has to beat
 */
export function analyseText(img, placement, blankRect) {
  const s = img.scale;
  const { x, yBaseline, size, charCount } = placement;
  const advance = placement.advance || size;   // CJK advances one em per glyph
  const cellMode = placement.cellMode || "advance";
  const pad = size * 0.2;
  const r = placement.region || {
    x0: x - pad, y0: yBaseline - size * 1.05,
    x1: x + charCount * advance + pad, y1: yBaseline + size * 0.35,
  };
  const region = inkIn(img, r.x0 * s, r.y0 * s, r.x1 * s, r.y1 * s);
  const blank = inkIn(img,
    blankRect.x0 * s, blankRect.y0 * s, blankRect.x1 * s, blankRect.y1 * s);

  const out = {
    regionRatio: region.ratio, regionInk: region.ink,
    blankRatio: blank.ratio, blankInk: blank.ink,
    box: region.box,
    widthPt: region.box ? (region.box.x1 - region.box.x0 + 1) / s : 0,
    expectedWidthPt: charCount * advance,
    cells: [], emptyCells: [],
    minInterior: null, maxEdgeOverInterior: null, maxGridDistance: null,
  };
  if (!region.box) { out.emptyCells = Array.from({ length: charCount }, (_, i) => i); return out; }

  // Slice on the *expected advance* grid, not on the ink bounding box. A
  // bbox-relative split silently rescales itself around whichever glyphs
  // survived and would report full coverage for a string where six of seven
  // characters drew nothing — which is exactly the bug this suite exists for.
  const grids = [];
  const cellFrom = cellMode === "advance"
    ? (i) => [(x + i * advance) * s, (x + (i + 1) * advance) * s]
    : (i) => {
        const w = region.box.x1 - region.box.x0 + 1;
        return [region.box.x0 + (i * w) / charCount, region.box.x0 + ((i + 1) * w) / charCount];
      };
  for (let i = 0; i < charCount; i++) {
    const [cx0, cx1] = cellFrom(i);
    const cell = inkIn(img, cx0, region.box.y0, cx1, region.box.y1 + 1);
    if (!cell.box || cell.ratio < 0.01) { out.emptyCells.push(i); out.cells.push(null); continue; }
    const ei = edgeVsInterior(img, cell.box);
    grids.push(densityGrid(img, cell.box));
    out.cells.push({ index: i, ratio: cell.ratio, edge: ei.edge, interior: ei.interior,
                     edgeOverInterior: ei.ratio, w: ei.w, h: ei.h });
  }
  const live = out.cells.filter(Boolean);
  if (live.length) {
    out.minInterior = Math.min(...live.map((c) => c.interior));
    out.maxEdgeOverInterior = Math.max(...live.map((c) => c.edgeOverInterior));
  }
  let maxD = 0;
  for (let i = 0; i < grids.length; i++) {
    for (let j = i + 1; j < grids.length; j++) maxD = Math.max(maxD, gridDistance(grids[i], grids[j]));
  }
  out.maxGridDistance = grids.length > 1 ? maxD : null;
  return out;
}
