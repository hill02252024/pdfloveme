/* ============================================================
   PDFLoveMe — Fill a PDF Form (browser UI)
   ------------------------------------------------------------
   Everything happens locally. The only network reads on this page
   are the <script> and font assets served from this same origin,
   and they are requested before the user picks a file. There is
   deliberately no fetch/XHR/WebSocket touching the document.
   ============================================================ */
pdfjsLib.GlobalWorkerOptions.workerSrc = "../vendor/pdfjs/pdf.worker-3.11.174.min.js";

(function () {
  "use strict";

  const { setupDropzone, validateFile, toast, downloadBytes } = window.PDFLove;
  const core = window.PDFFillCore;
  const $ = (id) => document.getElementById(id);

  // Two tiers, because one 5.6 MB download for a single Chinese character was
  // the whole cost of using this tool in Hong Kong. Tier 1 is Big5 Level 1
  // (常用字) and covers ordinary names and most address words; Tier 2 adds
  // Big5 Level 2 and the full HKSCS, which is where 埗, 磡, 脷, 鰂 and 邨 live.
  // Tier 2 is only fetched when the text actually needs a character Tier 1
  // does not have, so a 陳大文 fills 1.8 MB instead of 5.6.
  const FONT_TIER1 = { url: "../vendor/fonts/NotoSansTC-Big5L1-subset.ttf", mb: "1.8" };
  const FONT_TIER2 = { url: "../vendor/fonts/NotoSansTC-HKSCS-subset.ttf", mb: "5.6" };
  const TIER1_COVERAGE_URL = "../vendor/fonts/NotoSansTC-Big5L1-subset.coverage.txt";

  let tier1Bytes = null, tier1Cover = null, tier1Promise = null;
  let tier2Bytes = null, tier2Promise = null;
  let coverPromise = null;       // the 9 KB list, so the tier is chosen before a font is fetched

  let srcBytes = null;           // the untouched original
  let pdfDoc = null;             // pdf.js document, preview only
  let pageNum = 0, pageCount = 0;
  let detected = { hasForm: false, fields: [], pageCount: 0 };
  let mode = "fields";           // "fields" | "overlay"
  let boxes = [];                // { page, xFrac, yFrac, text?, png?, url?, size, wFrac, el }
  let selected = null;

  /**
   * Load the Chinese font, once, and only when something actually needs it.
   *
   * A purely Latin fill never triggers this, so an English-only session
   * makes no network request at all after the page has loaded. The request
   * is a same-origin GET with no body — nothing about the document is sent.
   */
  /**
   * Which characters a font can actually draw, read from its own cmap.
   *
   * The alternative was to ship the Tier 1 code point list alongside the
   * font. That list would then be a second thing to keep in step with the
   * build, and the failure mode when it drifted would be a PDF that draws
   * blanks — silent, and exactly what the padding work was about. Reading
   * the cmap costs a few milliseconds and cannot disagree with the file.
   *
   * Handles cmap formats 4 and 12; skips format 14 (variation selectors),
   * which describes no base coverage. pyftsubset emits format 4 here.
   */
  function cmapCoverage(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let cmapOff = 0;
    const numTables = dv.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + 16 * i;
      const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
      if (tag === "cmap") { cmapOff = dv.getUint32(rec + 8); break; }
    }
    if (!cmapOff) throw new Error("font has no cmap table");

    const cover = new Set();
    const n = dv.getUint16(cmapOff + 2);
    let best = 0, bestFmt = -1;
    for (let i = 0; i < n; i++) {
      const off = cmapOff + dv.getUint32(cmapOff + 4 + 8 * i + 4);
      const fmt = dv.getUint16(off);
      if (fmt === 12 || (fmt === 4 && bestFmt !== 12)) { best = off; bestFmt = fmt; }
    }
    if (bestFmt === 4) {
      const segX2 = dv.getUint16(best + 6), seg = segX2 / 2;
      const endO = best + 14, startO = endO + segX2 + 2;
      for (let i = 0; i < seg; i++) {
        const end = dv.getUint16(endO + 2 * i), start = dv.getUint16(startO + 2 * i);
        if (start === 0xFFFF) continue;
        for (let c = start; c <= end && c !== 0x10000; c++) cover.add(c);
      }
    } else if (bestFmt === 12) {
      const groups = dv.getUint32(best + 12);
      for (let i = 0; i < groups; i++) {
        const g = best + 16 + 12 * i;
        const start = dv.getUint32(g), end = dv.getUint32(g + 4);
        for (let c = start; c <= end; c++) cover.add(c);
      }
    } else {
      throw new Error("font has no usable cmap subtable");
    }
    return cover;
  }

  /** Every character above plain ASCII is one the embedded font must carry. */
  function coversAll(cover, text) {
    for (const ch of String(text == null ? "" : text)) {
      const c = ch.codePointAt(0);
      if (c > 0x7E && !cover.has(c)) return false;
    }
    return true;
  }

  function fetchFont(tier) {
    return fetch(tier.url)
      .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.arrayBuffer(); })
      .then((buf) => new Uint8Array(buf));
  }

  /**
   * Decode the Tier 1 coverage list: comma-separated runs, each
   * `startDelta` or `startDelta.length` in base 36, delta from the end of
   * the run before. Written by scripts/build-font-subset.py.
   */
  function decodeCoverage(txt) {
    const cover = new Set();
    let cursor = 0;
    for (const part of txt.split(",")) {
      if (!part) continue;
      const dot = part.indexOf(".");
      const delta = parseInt(dot < 0 ? part : part.slice(0, dot), 36);
      const len = dot < 0 ? 1 : parseInt(part.slice(dot + 1), 36);
      const start = cursor + delta;
      for (let c = start; c < start + len; c++) cover.add(c);
      cursor = start + len;
    }
    return cover;
  }

  /**
   * Which tier a piece of text needs, decided from a 9 KB list rather than
   * by downloading a font and looking.
   *
   * If the list cannot be fetched we go straight to Tier 2: guessing Tier 1
   * and being wrong costs 1.8 MB of wasted download, guessing Tier 2 costs
   * nothing but bandwidth we would have spent anyway.
   */
  function pickTier(text) {
    if (tier1Cover) return Promise.resolve(coversAll(tier1Cover, text) ? FONT_TIER1 : FONT_TIER2);
    if (!coverPromise) {
      coverPromise = fetch(TIER1_COVERAGE_URL)
        .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then((txt) => decodeCoverage(txt));
    }
    return coverPromise
      .then((cover) => (coversAll(cover, text) ? FONT_TIER1 : FONT_TIER2))
      .catch(() => FONT_TIER2);
  }

  function ensureTier1() {
    if (tier1Bytes) return Promise.resolve(tier1Bytes);
    if (tier1Promise) return tier1Promise;
    setFontState("loading", FONT_TIER1);
    tier1Promise = fetchFont(FONT_TIER1)
      .then((bytes) => {
        tier1Bytes = bytes;
        // The font itself is the authority from here on; the list was only
        // ever a way to avoid downloading this file to find out.
        tier1Cover = cmapCoverage(bytes);
        setFontState("ready", FONT_TIER1);
        return bytes;
      })
      .catch((err) => { tier1Promise = null; setFontState("error", FONT_TIER1); throw fontError(err); });
    return tier1Promise;
  }

  function ensureTier2() {
    if (tier2Bytes) return Promise.resolve(tier2Bytes);
    if (tier2Promise) return tier2Promise;
    setFontState("loading", FONT_TIER2);
    tier2Promise = fetchFont(FONT_TIER2)
      .then((bytes) => { tier2Bytes = bytes; setFontState("ready", FONT_TIER2); return bytes; })
      .catch((err) => { tier2Promise = null; setFontState("error", FONT_TIER2); throw fontError(err); });
    return tier2Promise;
  }

  function fontError(err) {
    // Fail loudly. Falling back to a Latin font here would silently turn
    // 陳大文 into boxes, or throw an encoding error deep inside pdf-lib
    // with no explanation.
    return new Error(
      "The Chinese font could not be loaded (" + err.message + "), so " +
      "Chinese text cannot be written into the PDF. Check your connection " +
      "and try again — Latin-only text still works.");
  }

  /**
   * The font to embed for a given piece of text.
   *
   * Once Tier 2 has been fetched it is used for everything: one document
   * gets one embedded font, and Tier 2 is a superset, so there is nothing
   * to gain by going back.
   */
  function ensureFont(text) {
    if (tier2Bytes) return Promise.resolve(tier2Bytes);
    return pickTier(text).then((tier) => {
      if (tier === FONT_TIER2) return ensureTier2();
      // Re-check against the font's own cmap. If the list was stale this
      // escalates once; it never draws a missing glyph.
      return ensureTier1().then((bytes) =>
        coversAll(tier1Cover, text) ? bytes : ensureTier2());
    });
  }

  /** Visible state for the font load, so it never fails silently. */
  function setFontState(state, tier) {
    const el = $("fontState");
    if (!el) return;
    const which = tier === FONT_TIER2 ? "extended Chinese font" : "Chinese font";
    el.classList.remove("hidden");
    if (state === "loading") {
      el.textContent = "Loading the " + which + " (about " + tier.mb +
        " MB, once per visit)…";
      el.dataset.state = "loading";
    } else if (state === "ready") {
      el.textContent = tier === FONT_TIER2
        ? "Extended Chinese font ready — rarer characters can now be written."
        : "Chinese font ready.";
      el.dataset.state = "ready";
      setTimeout(() => { if (el.dataset.state === "ready") el.classList.add("hidden"); }, 2500);
    } else {
      el.textContent = "The Chinese font failed to load. Chinese text cannot be added until it does.";
      el.dataset.state = "error";
    }
  }

  /**
   * Start loading the font as soon as the user types a CJK character,
   * rather than waiting until they press the download button.
   */
  function maybePrefetchFont(text) {
    if (!core.needsUnicodeFont(text)) return;
    // Safe to call on every keystroke: each tier caches its own promise, and
    // a tier already loaded resolves without touching the network.
    ensureFont(text).catch(() => { /* state is already shown */ });
  }

  // ---------------- load ----------------
  async function loadFile(file) {
    const v = validateFile(file, ["pdf"]);
    if (!v.ok) { toast(v.reason, "err"); return; }
    $("loading").classList.remove("hidden");
    try {
      srcBytes = new Uint8Array(await file.arrayBuffer());
      pdfDoc = await pdfjsLib.getDocument({ data: srcBytes.slice() }).promise;
      pageCount = pdfDoc.numPages;
      pageNum = 1;
      boxes = []; selected = null;

      detected = await core.detectFields(srcBytes, PDFLib);
      buildFields();

      if (detected.hasForm) {
        setMode("fields");
        $("status").textContent =
          `This PDF has ${detected.fields.length} fillable field${detected.fields.length === 1 ? "" : "s"} across ${pageCount} page${pageCount === 1 ? "" : "s"}. Type into them on the left.`;
      } else {
        setMode("overlay");
        $("status").textContent =
          `No fillable fields found — this looks like a flat or scanned PDF (${pageCount} page${pageCount === 1 ? "" : "s"}). Click the preview to add text where you need it.`;
      }
      $("modeFields").disabled = !detected.hasForm;

      $("work").classList.remove("hidden");
      $("dz").classList.add("hidden");
      await renderPage();
    } catch (err) {
      toast(err && err.message ? err.message : "Could not open that PDF.", "err");
    } finally {
      $("loading").classList.add("hidden");
    }
  }

  function buildFields() {
    const wrap = $("fields");
    wrap.innerHTML = "";
    if (!detected.fields.length) {
      wrap.innerHTML = '<p class="ff-status">This document has no form fields.</p>';
      return;
    }
    detected.fields.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "ff-field";
      const safe = f.name.replace(/[<>&"]/g, "");
      if (f.type !== "PDFTextField") {
        row.innerHTML = `<label>${safe}</label><p class="ff-status" style="margin:0">${f.type.replace("PDF", "")} — not editable here</p>`;
      } else {
        row.innerHTML = `<label for="fld${i}">${safe}</label>` +
          `<input type="text" id="fld${i}" data-name="${safe}" value="${(f.value || "").replace(/"/g, "&quot;")}">`;
      }
      wrap.appendChild(row);
    });
  }

  // Same for the AcroForm field inputs, which are created dynamically.
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches("#fields input[data-name]")) maybePrefetchFont(t.value);
  });

  function setMode(m) {
    mode = m;
    $("fieldsPane").classList.toggle("hidden", m !== "fields");
    $("overlayPane").classList.toggle("hidden", m !== "overlay");
    $("modeFields").classList.toggle("active", m === "fields");
    $("modeOverlay").classList.toggle("active", m === "overlay");
  }
  $("modeFields").addEventListener("click", () => { if (detected.hasForm) setMode("fields"); });
  $("modeOverlay").addEventListener("click", () => setMode("overlay"));

  // ---------------- preview ----------------
  async function renderPage() {
    const page = await pdfDoc.getPage(pageNum);
    const wrapW = Math.min($("pagewrap").parentElement.clientWidth || 760, 760);
    const base = page.getViewport({ scale: 1 });
    const scale = wrapW / base.width;
    const vp = page.getViewport({ scale });
    const cv = $("pv");
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    $("pageLabel").textContent = `Page ${pageNum} of ${pageCount}`;
    layoutBoxes();
  }
  $("prevPage").addEventListener("click", async () => { if (pageNum > 1) { pageNum--; await renderPage(); } });
  $("nextPage").addEventListener("click", async () => { if (pageNum < pageCount) { pageNum++; await renderPage(); } });

  // ---------------- overlay boxes ----------------
  function layoutBoxes() {
    const wrap = $("pagewrap"), cv = $("pv");
    wrap.querySelectorAll(".ff-box").forEach((el) => el.remove());
    boxes.filter((b) => b.page === pageNum - 1).forEach((b) => {
      const el = document.createElement("div");
      el.className = "ff-box" + (b === selected ? " sel" : "");
      el.style.left = (b.xFrac * cv.clientWidth) + "px";
      el.style.top = (b.yFrac * cv.clientHeight) + "px";
      if (b.png) {
        el.style.width = (b.wFrac * cv.clientWidth) + "px";
        const img = document.createElement("img"); img.src = b.url; el.appendChild(img);
      } else {
        // The canvas is displayed scaled down; match the preview size to the
        // point size that will actually be drawn into the PDF.
        el.style.fontSize = (b.size * (cv.clientWidth / cv.width)) + "px";
        el.textContent = b.text || " ";
      }
      el.addEventListener("mousedown", (e) => startDrag(e, b, el));
      el.addEventListener("touchstart", (e) => startDrag(e, b, el), { passive: false });
      b.el = el;
      wrap.appendChild(el);
    });
  }

  function select(b) {
    selected = b;
    $("boxText").value = b && b.text ? b.text : "";
    if (b && b.size) { $("boxSize").value = b.size; $("boxSizeVal").textContent = b.size; }
    layoutBoxes();
  }

  $("pagewrap").addEventListener("click", (e) => {
    if (mode !== "overlay") return;
    if (e.target.closest(".ff-box")) return;
    const cv = $("pv"), r = cv.getBoundingClientRect();
    const f = core.clientPointToFrac(e.clientX, e.clientY, r);
    const b = {
      page: pageNum - 1,
      xFrac: f.fracX,
      yFrac: f.fracY,
      text: "", size: parseInt($("boxSize").value, 10) || 12,
    };
    boxes.push(b); select(b);
    $("boxText").focus();
  });

  $("boxText").addEventListener("input", () => {
    if (!selected || selected.png) return;
    selected.text = $("boxText").value;
    maybePrefetchFont(selected.text);
    layoutBoxes();
  });
  $("boxSize").addEventListener("input", () => {
    $("boxSizeVal").textContent = $("boxSize").value;
    if (selected && !selected.png) { selected.size = parseInt($("boxSize").value, 10); layoutBoxes(); }
  });
  $("delBox").addEventListener("click", () => {
    if (!selected) return;
    boxes = boxes.filter((b) => b !== selected);
    selected = null; $("boxText").value = ""; layoutBoxes();
  });

  let drag = null;
  function evXY(e) { return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }
  function startDrag(e, b, el) {
    e.preventDefault(); e.stopPropagation();
    // Measure BEFORE select(), because select() calls layoutBoxes(), which
    // removes this element and builds a fresh one. A detached element's
    // getBoundingClientRect() is all zeros, which made every drag compute
    // its grab offset from the viewport origin and slam the box to the
    // left edge of the page.
    const p = evXY(e), r = el.getBoundingClientRect();
    drag = { b: b, dx: p.x - r.left, dy: p.y - r.top };
    select(b);
  }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const cv = $("pv"), r = cv.getBoundingClientRect(), p = evXY(e);
    // Convert the box's top-left, not the pointer, so the box does not
    // jump to the cursor when a drag starts away from its corner.
    const f = core.clientPointToFrac(p.x - drag.dx, p.y - drag.dy, r);
    drag.b.xFrac = f.fracX;
    drag.b.yFrac = f.fracY;
    layoutBoxes();
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("mouseup", () => { drag = null; });
  window.addEventListener("touchend", () => { drag = null; });

  // ---------------- signature pad ----------------
  const pad = $("pad"), pctx = pad.getContext("2d");
  pctx.lineWidth = 2.4; pctx.lineCap = "round"; pctx.lineJoin = "round"; pctx.strokeStyle = "#16161d";
  let inking = false, lastPt = null, hasInk = false;
  function padPos(e) {
    const r = pad.getBoundingClientRect(), p = evXY(e);
    return { x: (p.x - r.left) * (pad.width / r.width), y: (p.y - r.top) * (pad.height / r.height) };
  }
  pad.addEventListener("mousedown", (e) => { e.preventDefault(); inking = true; lastPt = padPos(e); });
  pad.addEventListener("touchstart", (e) => { e.preventDefault(); inking = true; lastPt = padPos(e); }, { passive: false });
  function ink(e) {
    if (!inking) return;
    e.preventDefault();
    const p = padPos(e);
    pctx.beginPath(); pctx.moveTo(lastPt.x, lastPt.y); pctx.lineTo(p.x, p.y); pctx.stroke();
    lastPt = p; hasInk = true;
  }
  window.addEventListener("mousemove", ink);
  window.addEventListener("touchmove", ink, { passive: false });
  window.addEventListener("mouseup", () => { inking = false; });
  window.addEventListener("touchend", () => { inking = false; });
  $("clearPad").addEventListener("click", () => { pctx.clearRect(0, 0, pad.width, pad.height); hasInk = false; });

  $("addSig").addEventListener("click", () => {
    if (!hasInk) { toast("Draw your signature first.", "err"); return; }
    pad.toBlob(async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const b = {
        page: pageNum - 1, xFrac: 0.55, yFrac: 0.8,
        png: bytes, url: URL.createObjectURL(blob), wFrac: 0.28,
      };
      boxes.push(b); setMode("overlay"); select(b);
    }, "image/png");
  });

  // ---------------- apply ----------------
  $("applyBtn").addEventListener("click", async () => {
    if (!srcBytes) return;
    $("loading").classList.remove("hidden");
    try {
      let out = srcBytes;

      const values = {};
      document.querySelectorAll("#fields input[data-name]").forEach((inp) => {
        if (inp.value !== "") values[inp.getAttribute("data-name")] = inp.value;
      });
      const textItems = boxes.filter((b) => (b.text && b.text.trim()) || b.png)
        .map((b) => b.png
          ? { page: b.page, xFrac: b.xFrac, yFrac: b.yFrac, pngBytes: b.png, wFrac: b.wFrac }
          : { page: b.page, xFrac: b.xFrac, yFrac: b.yFrac, text: b.text, size: b.size });

      if (!Object.keys(values).length && !textItems.length) {
        toast("Nothing to fill in yet.", "err");
        return;
      }

      // One document, one embedded font — so the tier is chosen from every
      // string that will be drawn, not from whichever one was typed last.
      const allText =
        Object.keys(values).map((k) => values[k]).join("") +
        textItems.map((t) => t.text || "").join("");
      const needFont = core.needsUnicodeFont(allText);
      const fb = needFont ? await ensureFont(allText) : null;

      if (Object.keys(values).length) {
        out = await core.fillAcroForm(out, values,
          { PDFLib: PDFLib, fontkit: window.fontkit, fontBytes: fb });
      }
      if (textItems.length) {
        out = await core.overlayItems(out, textItems,
          { PDFLib: PDFLib, fontkit: window.fontkit, fontBytes: fb });
      }

      downloadBytes(out, "filled.pdf", "application/pdf");
      $("resultArea").innerHTML =
        '<p class="ff-status">Done — the filled PDF has been downloaded. Nothing was uploaded.</p>';
    } catch (err) {
      toast(err && err.message ? err.message : "Could not fill that PDF.", "err");
    } finally {
      $("loading").classList.add("hidden");
    }
  });

  $("resetBtn").addEventListener("click", () => {
    srcBytes = null; pdfDoc = null; boxes = []; selected = null;
    $("work").classList.add("hidden");
    $("dz").classList.remove("hidden");
    $("resultArea").innerHTML = "";
    $("fileInput").value = "";
  });

  setupDropzone($("dz"), $("fileInput"), { accept: ["pdf"], onFiles: (files) => loadFile(files[0]) });
  window.addEventListener("resize", () => { if (pdfDoc) renderPage(); });
})();
