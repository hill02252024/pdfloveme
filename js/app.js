/* ============================================================
   PDFLoveMe — shared client-side logic (no backend)
   ============================================================ */
(function () {
  "use strict";

  // ---- limits ----
  // Not commercial limits. The whole file is held in an ArrayBuffer, and a
  // tab that runs out of memory loses the work, so these are the point past
  // which failing early beats failing halfway through.
  const MAX_BYTES = 50 * 1024 * 1024;
  const MAX_FILES = 20;

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

  // Validate a single file against the size limit + accepted extensions.
  // accept: array like ['pdf'] or ['jpg','jpeg','png']. Returns {ok, reason}.
  function validateFile(file, accept) {
    const name = (file.name || "").toLowerCase();
    if (accept && accept.length) {
      const ok = accept.some((ext) => name.endsWith("." + ext));
      if (!ok) return { ok: false, reason: file.name + " — unsupported file type. Expected: " + accept.join(", ") };
    }
    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        reason: file.name + " is " + fmtSize(file.size) + " — the limit is " +
          fmtSize(MAX_BYTES) + " per file, because the whole thing has to fit " +
          "in your browser's memory.",
      };
    }
    return { ok: true };
  }

  // Validate the whole batch (count + each file). Returns {ok, accepted, reason}.
  function validateBatch(existingCount, newFiles, accept) {
    const accepted = [];
    if (existingCount + newFiles.length > MAX_FILES) {
      return {
        ok: false,
        accepted,
        reason: "Too many files — " + MAX_FILES + " at a time is the limit, " +
          "because they are all held in memory at once.",
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

  document.addEventListener("DOMContentLoaded", () => {
    initMenu();
    initFaq();
  });

  // ---- export ----
  window.PDFLove = {
    MAX_BYTES, MAX_FILES, fmtSize, fileIcon,
    validateFile, validateBatch, toast, downloadBlob, downloadBytes,
    setupDropzone, renderFileList,
  };
})();
