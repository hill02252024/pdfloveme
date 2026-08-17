// B1 — 端對端：真係喺 headless Chromium 開 fill-form 頁、撳、打字、下載，
// 再用 pdf.js 讀返個產出，斷言文字落喺撳嗰點（±3pt）。
//
// 呢個測試同單元測試唔同：佢會捉到 UI 層嘅錯（監聽器接錯、rect 用錯、
// 拖動更新錯 state），而純函數測試係捉唔到嘅。
//
// B2 反面對照：加 --break 參數會喺頁面注入一個 50pt 偏移，全部斷言應該 fail。
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const BREAK = process.argv.includes("--break");
const TOL = 3; // pt
const OUT = path.join(HERE, "out");
let counter = 0;
await fs.mkdir(OUT, { recursive: true });

// ---------- 一個最小靜態伺服器（file:// 會令 fetch 同 worker 失敗）----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".ttf": "font/ttf", ".pdf": "application/pdf", ".png": "image/png",
               ".ico": "image/x-icon", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(REPO, url === "/" ? "index.html" : url);
    if (!file.startsWith(REPO)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) pass++;
  else { fail++; failures.push(name); console.log(`   FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

async function textItems(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      out.push({ page: i - 1, str: it.str, vx, vy, vpW: vp.width, vpH: vp.height });
    }
  }
  await doc.destroy();
  return out;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  acceptDownloads: true,
  deviceScaleFactor: 2,          // 順便驗 Retina backing store 之下座標仍然啱
  viewport: { width: 1400, height: 1200 },
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("   [browser error]", m.text()); });

// 記錄所有網絡請求，順便驗 C1（純英文填寫零請求）
const requests = [];
page.on("request", (r) => requests.push(r.url()));

async function openTool(fixture) {
  await page.goto(`${BASE}/pages/fill-form.html`, { waitUntil: "networkidle" });
  if (BREAK) {
    // B2 反面對照：喺 UI 同 core 之間嗰個邊界注入 50pt 偏移。
    //
    // 注意唔可以改 PDFFillCore.fracToPdfPoint —— overlayItems 喺同一個
    // closure 入面直接呼叫內部函數，改 export 完全影響唔到佢（呢點本身
    // 係好事，但就令嗰個位做唔到對照）。UI 係經 core.overlayItems 入去，
    // 所以包住佢先真係改到成條 pipeline。
    await page.evaluate(() => {
      const orig = window.PDFFillCore.overlayItems;
      window.PDFFillCore.overlayItems = function (bytes, items, opts) {
        const shifted = items.map((it) => Object.assign({}, it, {
          xFrac: it.xFrac + 50 / 595,   // A4 闊 595pt
          yFrac: it.yFrac + 50 / 842,   // A4 高 842pt
        }));
        return orig(bytes, shifted, opts);
      };
    });
  }
  await page.setInputFiles("#fileInput", path.join(HERE, "fixtures", fixture));
  await page.waitForSelector("#work:not(.hidden)", { timeout: 15000 });
  await page.waitForFunction(() => {
    const c = document.getElementById("pv");
    return c && c.width > 0;
  }, { timeout: 15000 });
}

/**
 * Click a fraction of the way across the canvas.
 *
 * Uses locator.click({position}) rather than page.mouse.click(x, y):
 * the canvas is a full page tall and sits below the fold, so raw viewport
 * coordinates land outside the window entirely. The locator form scrolls
 * the element into view and measures from the element's own top-left.
 */
async function clickCanvasFrac(fx, fy) {
  const cv = page.locator("#pv");
  await cv.scrollIntoViewIfNeeded();
  const box = await cv.boundingBox();
  await cv.click({ position: { x: box.width * fx, y: box.height * fy } });
}

/**
 * Click apply and capture the produced file.
 *
 * When `keep` is given the bytes are also written to out/, where
 * render.test.mjs picks them up. That step rasterises these exact files
 * and counts pixels — text extraction alone cannot tell a rendered
 * character from an invisible one.
 */
async function download(keep) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click("#applyBtn"),
  ]);
  const tmp = path.join(HERE, ".out-" + counter++ + ".pdf");
  await dl.saveAs(tmp);
  const bytes = await fs.readFile(tmp);
  await fs.unlink(tmp);
  if (keep && !BREAK) await fs.writeFile(path.join(OUT, keep), bytes);
  return bytes;
}

// ============ 1. 平面 PDF：撳一下、打字、下載 ============
console.log("\n[B1-1] 平面 PDF —— 撳已知座標、輸入文字、下載");
{
  requests.length = 0;
  await openTool("form-flat.pdf");
  const before = requests.length;
  const FX = 0.30, FY = 0.42;
  await clickCanvasFrac(FX, FY);
  await page.fill("#boxText", "E2EMARK");
  const bytes = await download("e2e-flat.pdf");

  const items = await textItems(bytes);
  const hit = items.find((i) => i.str.includes("E2EMARK"));
  check("文字出現喺產出", !!hit);
  if (hit) {
    const wantX = FX * hit.vpW;
    const wantY = FY * hit.vpH + 0.8 * 12; // 預設字號 12，基線喺方框頂之下
    check(`落點誤差 ≤${TOL}pt`,
      Math.abs(hit.vx - wantX) <= TOL && Math.abs(hit.vy - wantY) <= TOL,
      `want (${wantX.toFixed(1)}, ${wantY.toFixed(1)}) got (${hit.vx.toFixed(1)}, ${hit.vy.toFixed(1)})`);
  }
  // C1：純英文流程唔應該有額外請求（尤其唔應該攞字體）
  const after = requests.filter((u) => u.includes(".ttf"));
  check("C1 純英文填寫冇載入中文字體", after.length === 0, after.join(","));
  check("C1 開檔之後冇新增網絡請求", requests.length === before, `${requests.length - before} extra`);
}

// ============ 2. 拖動：最終座標要係拖之後嗰個 ============
console.log("\n[B1-2] 拖動 —— 撳完再拖，最終位置要係拖後嗰個");
{
  await openTool("form-flat.pdf");
  const FROM = { x: 0.20, y: 0.30 }, TO = { x: 0.60, y: 0.65 };
  await clickCanvasFrac(FROM.x, FROM.y);
  await page.fill("#boxText", "DRAGGED");
  // 把畫布捲到視窗頂部，否則拖曳終點會落喺 viewport 外面而被無視。
  await page.evaluate(() => document.getElementById("pv").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(150);
  const box = await page.locator("#pv").boundingBox();
  // 由方框自己身上開始拖（撳落方框而唔係畫布）
  const el = await page.locator(".ff-box").first().boundingBox();
  const GRAB = 4;                     // 由方框左上角向內 4px 落手
  const targetX = box.x + box.width * TO.x + GRAB;
  const targetY = box.y + box.height * TO.y + GRAB;
  await page.mouse.move(el.x + GRAB, el.y + GRAB);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });

  // 放手之前讀返實時 canvas rect。頁面喺拖曳途中可能捲動咗幾 px，
  // 開頭嗰個 boundingBox 就會過期；app 用嘅係實時 rect，測試都要一樣，
  // 否則會告一個唔存在嘅 bug。
  const live = await page.evaluate(() => {
    const r = document.getElementById("pv").getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.up();
  const expectFracX = (targetX - GRAB - live.x) / live.w;
  const expectFracY = (targetY - GRAB - live.y) / live.h;
  const bytes = await download();

  const items = await textItems(bytes);
  const hit = items.find((i) => i.str.includes("DRAGGED"));
  check("拖動後文字仍然存在", !!hit);
  if (hit) {
    const wantX = expectFracX * hit.vpW;
    const wantY = expectFracY * hit.vpH + 0.8 * 12;
    const atOld = Math.abs(hit.vx - FROM.x * hit.vpW) <= TOL;
    check("最終位置係拖後嗰個，唔係原點",
      Math.abs(hit.vx - wantX) <= TOL && Math.abs(hit.vy - wantY) <= TOL && !atOld,
      `want (${wantX.toFixed(1)}, ${wantY.toFixed(1)}) got (${hit.vx.toFixed(1)}, ${hit.vy.toFixed(1)})`);
    check("而且真係郁咗（唔係停喺原點）", !atOld);
  }
}

// ============ 3. AcroForm ============
console.log("\n[B1-3] AcroForm —— 欄位列出並填寫");
{
  await openTool("form-acroform.pdf");
  const n = await page.locator("#fields input[data-name]").count();
  check("列出 3 個文字欄位", n === 3, String(n));
  await page.fill('#fields input[data-name="applicant_name"]', "E2E Person");
  await page.fill('#fields input[data-name="applicant_phone"]', "9123 4567");
  const bytes = await download("e2e-acroform.pdf");

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  check("姓名寫入", form.getTextField("applicant_name").getText() === "E2E Person");
  check("電話寫入", form.getTextField("applicant_phone").getText() === "9123 4567");
}

// ============ 4. 三頁中文 + 字體按需載入 ============
console.log("\n[B1-4] 三頁中文 —— 逐頁疊加，並驗字體按需載入");
{
  requests.length = 0;
  await openTool("form-chinese-3page.pdf");
  check("C1 開檔時仍未載入字體",
    requests.filter((u) => u.includes(".ttf")).length === 0);

  await clickCanvasFrac(0.25, 0.20);
  await page.fill("#boxText", "陳大文");
  // C2：一打中文就應該見到載入狀態，跟住變 ready
  await page.waitForFunction(() => {
    const el = document.getElementById("fontState");
    return el && (el.dataset.state === "loading" || el.dataset.state === "ready");
  }, { timeout: 15000 });
  check("C2 打中文時出現字體載入狀態", true);
  await page.waitForFunction(() => document.getElementById("fontState").dataset.state === "ready",
    { timeout: 30000 });
  check("C1 打中文之後先載入字體",
    requests.filter((u) => u.includes(".ttf")).length === 1);

  // 第二頁
  await page.click("#nextPage");
  await page.waitForTimeout(400);
  await clickCanvasFrac(0.25, 0.20);
  await page.fill("#boxText", "香港九龍");
  const bytes = await download("e2e-chinese.pdf");

  const items = await textItems(bytes);
  const p1 = items.find((i) => i.page === 0 && i.str.includes("陳大文"));
  const p2 = items.find((i) => i.page === 1 && i.str.includes("香港九龍"));
  check("第 1 頁中文正確（唔係亂碼）", !!p1, p1 ? "" : "not found");
  check("第 2 頁中文正確", !!p2, p2 ? "" : "not found");
  if (p1) {
    const wantX = 0.25 * p1.vpW, wantY = 0.20 * p1.vpH + 0.8 * 12;
    check(`第 1 頁落點誤差 ≤${TOL}pt`,
      Math.abs(p1.vx - wantX) <= TOL && Math.abs(p1.vy - wantY) <= TOL,
      `want (${wantX.toFixed(1)}, ${wantY.toFixed(1)}) got (${p1.vx.toFixed(1)}, ${p1.vy.toFixed(1)})`);
  }
}

// ============ 5. 簽名疊加 ============
console.log("\n[B1-5] 簽名 —— 畫、放置、下載");
{
  await openTool("form-flat.pdf");
  await page.locator("#pad").scrollIntoViewIfNeeded();
  const pad = await page.locator("#pad").boundingBox();
  await page.mouse.move(pad.x + 20, pad.y + 60);
  await page.mouse.down();
  await page.mouse.move(pad.x + 120, pad.y + 30, { steps: 8 });
  await page.mouse.move(pad.x + 220, pad.y + 80, { steps: 8 });
  await page.mouse.up();
  await page.click("#addSig");
  await page.waitForSelector(".ff-box img", { timeout: 10000 });
  const bytes = await download();

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  check("產出可重新解析", doc.getPageCount() === 1);
  // 一張 XObject 圖片應該出現喺頁面資源入面
  const hasImage = JSON.stringify(doc.context.enumerateIndirectObjects().length) !== "0";
  check("簽名圖片已嵌入", hasImage);
  const items = await textItems(bytes);
  check("原文冇被改動", items.some((i) => i.str.includes("TENANCY")));
}

await browser.close();
server.close();

// Hand the three produced files to render.test.mjs, which rasterises them
// and checks that the text is actually visible rather than merely present.
if (!BREAK) {
  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify({
    cases: [
      { label: "平面 PDF 疊字", file: "e2e-flat.pdf", fixture: "form-flat.pdf",
        runs: [{ page: 0, text: "E2EMARK", size: 12, cjk: false }] },
      { label: "英文 AcroForm", file: "e2e-acroform.pdf", fixture: "form-acroform.pdf",
        widgets: [{ field: "applicant_name", text: "E2E Person", size: 12 },
                  { field: "applicant_phone", text: "9123 4567", size: 12 }] },
      { label: "三頁中文", file: "e2e-chinese.pdf", fixture: "form-chinese-3page.pdf",
        runs: [{ page: 0, text: "陳大文", size: 12, cjk: true },
               { page: 1, text: "香港九龍", size: 12, cjk: true }] },
    ],
  }, null, 2), "utf8");
}

if (BREAK) {
  console.log(`\n[B2 反面對照] 注入 50pt 偏移之後：${fail} 項失敗 / ${pass} 項通過`);
  const posFails = failures.filter((f) => f.includes("誤差") || f.includes("位置"));
  console.log(`   受座標影響嘅斷言失敗數：${posFails.length}`);
  console.log(posFails.length >= 3
    ? "   ✅ 偏移確實令位置斷言失敗 —— B1 唔係恆真"
    : "   ❌ 偏移竟然冇令位置斷言失敗 —— B1 可能恆真，當作無效");
  process.exit(posFails.length >= 3 ? 0 : 1);
}

console.log(`\n${fail === 0 ? "✅ 全部通過" : "❌ " + fail + " 項失敗"}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
