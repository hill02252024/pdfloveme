/* ============================================================
   PDFLoveMe — shared client-side logic (no backend)
   ============================================================ */
(function () {
  "use strict";

  // ---- Tier configuration ----
  const TIER = {
    free: { maxBytes: 50 * 1024 * 1024, maxFiles: 20, label: "Free" },
    pro:  { maxBytes: 500 * 1024 * 1024, maxFiles: 100, label: "Pro" },
  };

  function currentTier() {
    const t = localStorage.getItem("pdfloveme_tier");
    return t === "pro" ? "pro" : "free";
  }

  function tierConfig() {
    return TIER[currentTier()];
  }

  // ---- helpers ----
  function fmtSize(bytes) {
    if (bytes === 0 || bytes == null) return "0 B";
    const k = 1024;
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
  }

  function fileIcon(file) {
    const name = (file && file.name ? file.name : "").toLowerCase();
    const type = (file && file.type ? file.type : "").toLowerCase();
    if (type.includes("pdf") || name.endsWith(".pdf")) return "📄";
    if (type.includes("png") || name.endsWith(".png")) return "🖼️";
    if (type.includes("jpe") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "🖼️";
    return "📎";
  }

  // Validate a single file against the active tier + accepted extensions.
  // accept: array like ['pdf'] or ['jpg','jpeg','png']. Returns {ok, reason}.
  function validateFile(file, accept) {
    const cfg = tierConfig();
    const name = (file.name || "").toLowerCase();
    if (accept && accept.length) {
      const ok = accept.some((ext) => name.endsWith("." + ext));
      if (!ok) return { ok: false, reason: file.name + " — unsupported file type. Expected: " + accept.join(", ") };
    }
    if (file.size > cfg.maxBytes) {
      return {
        ok: false,
        reason: file.name + " is " + fmtSize(file.size) + " — exceeds the " +
          cfg.label + " limit of " + fmtSize(cfg.maxBytes) +
          (currentTier() === "free" ? ". Upgrade to Pro for larger files." : "."),
      };
    }
    return { ok: true };
  }

  // Validate the whole batch (count + each file). Returns {ok, accepted, reason}.
  function validateBatch(existingCount, newFiles, accept) {
    const cfg = tierConfig();
    const accepted = [];
    if (existingCount + newFiles.length > cfg.maxFiles) {
      return {
        ok: false,
        accepted,
        reason: "Too many files. " + cfg.label + " allows up to " + cfg.maxFiles + " files" +
          (currentTier() === "free" ? ". Upgrade to Pro for up to 100." : "."),
      };
    }
    for (const f of newFiles) {
      const v = validateFile(f, accept);
      if (!v.ok) return { ok: false, accepted, reason: v.reason };
      accepted.push(f);
    }
    return { ok: true, accepted };
  }

  // ---- toast ----
  function ensureToastWrap() {
    let w = document.querySelector(".toast-wrap");
    if (!w) {
      w = document.createElement("div");
      w.className = "toast-wrap";
      document.body.appendChild(w);
    }
    return w;
  }
  function toast(msg, kind) {
    const wrap = ensureToastWrap();
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, kind === "err" ? 5200 : 3200);
  }

  // ---- downloads ----
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function downloadBytes(bytes, filename, mime) {
    downloadBlob(new Blob([bytes], { type: mime || "application/octet-stream" }), filename);
  }

  // ---- dropzone wiring ----
  // opts: { accept:[], onFiles:(FileList|Array)=>void }
  function setupDropzone(zone, input, opts) {
    opts = opts || {};
    const handle = (files) => {
      if (files && files.length && typeof opts.onFiles === "function") opts.onFiles(Array.from(files));
    };
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { handle(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files) handle(e.dataTransfer.files);
    });
  }

  // ---- file-list renderer ----
  // files: array of File. opts: { draggable, onRemove(i), onReorder(from,to) }
  function renderFileList(container, files, opts) {
    opts = opts || {};
    container.innerHTML = "";
    files.forEach((file, i) => {
      const li = document.createElement("li");
      li.className = "file-row" + (opts.draggable ? " draggable" : "");
      li.dataset.index = String(i);
      if (opts.draggable) li.draggable = true;

      const grip = opts.draggable ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : "";
      li.innerHTML =
        grip +
        '<span class="fi-ico">' + fileIcon(file) + "</span>" +
        '<span class="fi-meta"><span class="fi-name"></span><span class="fi-size">' + fmtSize(file.size) + "</span></span>" +
        '<button class="fi-remove" title="Remove" aria-label="Remove file">×</button>';
      li.querySelector(".fi-name").textContent = file.name;
      li.querySelector(".fi-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof opts.onRemove === "function") opts.onRemove(i);
      });

      if (opts.draggable) {
        li.addEventListener("dragstart", (e) => {
          li.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(i));
        });
        li.addEventListener("dragend", () => li.classList.remove("dragging"));
        li.addEventListener("dragover", (e) => e.preventDefault());
        li.addEventListener("drop", (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
          const to = parseInt(li.dataset.index, 10);
          if (!isNaN(from) && !isNaN(to) && from !== to && typeof opts.onReorder === "function") {
            opts.onReorder(from, to);
          }
        });
      }
      container.appendChild(li);
    });
  }

  // ---- mobile menu ----
  function initMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => nav.classList.toggle("open"));
      nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
    }
  }

  // ---- FAQ accordion (landing) ----
  function initFaq() {
    document.querySelectorAll(".faq-q").forEach((q) => {
      q.addEventListener("click", () => q.parentElement.classList.toggle("open"));
    });
  }

  // ---- tier badge in header (optional element #tierBadge) ----
  function initTierBadge() {
    const el = document.getElementById("tierBadge");
    if (el) el.textContent = tierConfig().label;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMenu();
    initFaq();
    initTierBadge();
  });

  // ---- export ----
  window.PDFLove = {
    TIER, currentTier, tierConfig, fmtSize, fileIcon,
    validateFile, validateBatch, toast, downloadBlob, downloadBytes,
    setupDropzone, renderFileList,
  };
})();
