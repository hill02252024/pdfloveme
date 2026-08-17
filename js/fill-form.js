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

  const FONT_URL = "../vendor/fonts/NotoSansTC-HKSCS-subset.ttf";
  let fontBytes = null;          // lazily loaded, and only from our own origin
  let fontPromise = null;        // so two rapid CJK edits do not fetch it twice

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
  function ensureFont() {
    if (fontBytes) return Promise.resolve(fontBytes);
    if (fontPromise) return fontPromise;
    setFontState("loading");
    fontPromise = fetch(FONT_URL)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then((buf) => {
        fontBytes = new Uint8Array(buf);
        setFontState("ready");
        return fontBytes;
      })
      .catch((err) => {
        fontPromise = null;
        setFontState("error");
        // Fail loudly. Falling back to a Latin font here would silently
        // turn 陳大文 into boxes, or throw an encoding error deep inside
        // pdf-lib with no explanation.
        throw new Error(
          "The Chinese font could not be loaded (" + err.message + "), so " +
          "Chinese text cannot be written into the PDF. Check your connection " +
          "and try again — Latin-only text still works.");
      });
    return fontPromise;
  }

  /** Visible state for the font load, so it never fails silently. */
  function setFontState(state) {
    const el = $("fontState");
    if (!el) return;
    el.classList.remove("hidden");
    if (state === "loading") {
      el.textContent = "Loading the Chinese font (about 1.9 MB, once per visit)…";
      el.dataset.state = "loading";
    } else if (state === "ready") {
      el.textContent = "Chinese font ready.";
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
    if (!fontBytes && !fontPromise && core.needsUnicodeFont(text)) {
      ensureFont().catch(() => { /* state is already shown */ });
    }
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

      const needFont =
        Object.keys(values).some((k) => core.needsUnicodeFont(values[k])) ||
        textItems.some((t) => t.text && core.needsUnicodeFont(t.text));
      const fb = needFont ? await ensureFont() : null;

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
