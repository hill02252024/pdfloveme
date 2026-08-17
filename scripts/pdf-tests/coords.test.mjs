// A2 — 座標換算單元測試。
//
// 唔用自己心算嘅預期數字（咁樣只係測返自己套邏輯），而係對住 pdf.js
// 自己嘅 PageViewport.convertToPdfPoint 做參考比對 —— 佢先係真正決定
// canvas 畫成點樣嗰個實作。
//
// 每一組都有反面對照：用一個故意錯嘅換算跑同一批 case，如果錯嘅都「通過」，
// 即係嗰個測試恆真，當作無效。
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { PDFDocument, degrees } from "pdf-lib";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
new Function(await fs.readFile(path.join(REPO, "js/fill-pdf-core.js"), "utf8"))();
const core = globalThis.PDFFillCore;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; } else { fail++; console.log(`   FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function near(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

// 故意錯嘅換算，用嚟做反面對照：唔理 rotation、亦唔翻轉 Y 軸
function brokenFracToPdfPoint(fx, fy, W, H /*, rotation */) {
  return { x: fx * W, y: fy * H };
}

const PAGES = [
  { w: 595, h: 842, label: "A4" },
  { w: 612, h: 792, label: "Letter" },
  { w: 612, h: 1008, label: "Legal" },
  { w: 400, h: 300, label: "custom landscape" },
];
const ROTATIONS = [0, 90, 180, 270];
const SCALES = [0.75, 1, 1.5, 2];
const FRACS = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.25, 0.8], [0.9, 0.1]];

async function pageBytes(w, h, rot) {
  const d = await PDFDocument.create();
  const p = d.addPage([w, h]);
  if (rot) p.setRotation(degrees(rot));
  return await d.save();
}

console.log("\n[A2-1] 對住 pdf.js convertToPdfPoint 逐點比對");
console.log("       覆蓋 4 種頁面尺寸 × 4 個 rotation × 4 個 scale × 7 個位置");
let brokenCaught = 0, total = 0;
const configsWhereBrokenSurvived = [];
for (const pg of PAGES) {
  for (const rot of ROTATIONS) {
    const bytes = await pageBytes(pg.w, pg.h, rot);
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    for (const scale of SCALES) {
      const vp = page.getViewport({ scale });
      let brokenDisagreedHere = false;
      for (const [fx, fy] of FRACS) {
        total++;
        // pdf.js 嘅答案（參考值）
        const [rx, ry] = vp.convertToPdfPoint(fx * vp.width, fy * vp.height);
        // 我哋嘅純函數
        const got = core.fracToPdfPoint(fx, fy, pg.w, pg.h, rot);
        check(`${pg.label} rot=${rot} s=${scale} (${fx},${fy})`,
          near(got.x, rx, 0.01) && near(got.y, ry, 0.01),
          `expected (${rx.toFixed(2)}, ${ry.toFixed(2)}) got (${got.x.toFixed(2)}, ${got.y.toFixed(2)})`);
        // 反面對照：錯嘅換算應該對唔上（rot=0 而 fy=... 個別點可能巧合命中，所以統計）
        const bad = brokenFracToPdfPoint(fx, fy, pg.w, pg.h, rot);
        if (!(near(bad.x, rx, 0.01) && near(bad.y, ry, 0.01))) {
          brokenCaught++; brokenDisagreedHere = true;
        }
      }
      if (!brokenDisagreedHere) configsWhereBrokenSurvived.push(`${pg.label} rot=${rot} s=${scale}`);
    }
    await doc.destroy();
  }
}
console.log(`   ${fail === 0 ? "PASS" : "FAIL"}  ${total} 個點全部同 pdf.js 一致`);
console.log(`   對照  錯誤換算喺 ${brokenCaught}/${total} 個點被判定為唔一致，` +
            `喺 ${configsWhereBrokenSurvived.length} 組設定入面完全冇被捉到`);
check("反面對照：每一組設定都至少有一點捉到錯誤換算", configsWhereBrokenSurvived.length === 0,
      configsWhereBrokenSurvived.slice(0, 3).join(", "));

console.log("\n[A2-2] devicePixelRatio 唔應該影響結果");
{
  const W = 595, H = 842;
  for (const dpr of [1, 2, 3]) {
    for (const cssW of [400, 760]) {
      const cssH = cssW * (H / W);
      // 同一個實際點擊位置，喺唔同 DPR 之下 backing store 大細唔同
      const p = core.clientPointToPdfPoint({
        clientX: 100 + cssW * 0.3, clientY: 50 + cssH * 0.6,
        rectLeft: 100, rectTop: 50, rectWidth: cssW, rectHeight: cssH,
        canvasWidth: cssW * dpr, canvasHeight: cssH * dpr,
        pageWidth: W, pageHeight: H, rotation: 0,
      });
      const want = core.fracToPdfPoint(0.3, 0.6, W, H, 0);
      check(`dpr=${dpr} cssW=${cssW}`, near(p.x, want.x, 0.001) && near(p.y, want.y, 0.001),
        `got (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
  }
  // 反面對照：如果實作真係攞咗 canvas backing size 嚟除，DPR 就會改變答案
  const bad1 = (100 + 760 * 0.3 - 100) / (760 * 1);
  const bad2 = (100 + 760 * 0.3 - 100) / (760 * 2);
  check("反面對照：用 backing store 做分母會令 DPR 改變答案", !near(bad1, bad2, 0.001));
}

console.log("\n[A2-3] Y 軸翻轉：canvas 頂 = PDF 頁高");
{
  const W = 595, H = 842;
  const top = core.fracToPdfPoint(0.5, 0, W, H, 0);
  const bot = core.fracToPdfPoint(0.5, 1, W, H, 0);
  check("canvas 最頂 → y = 頁高", near(top.y, H));
  check("canvas 最底 → y = 0", near(bot.y, 0));
  check("反面對照：冇翻轉嘅話兩者會掉轉", !(near(top.y, 0) && near(bot.y, H)));
}

console.log("\n[A2-4] rotation 令 viewport 長闊掉轉");
{
  const a = core.rotatedPageSize(595, 842, 0);
  const b = core.rotatedPageSize(595, 842, 90);
  const c = core.rotatedPageSize(595, 842, 270);
  const d = core.rotatedPageSize(595, 842, 180);
  check("rot=0 唔換", a.width === 595 && a.height === 842);
  check("rot=90 換", b.width === 842 && b.height === 595);
  check("rot=270 換", c.width === 842 && c.height === 595);
  check("rot=180 唔換", d.width === 595 && d.height === 842);
  check("反面對照：90 同 0 唔應該一樣", !(a.width === b.width && a.height === b.height));
}

console.log("\n[A2-5] rotation 正規化");
{
  check("360 → 0", core.normaliseRotation(360) === 0);
  check("-90 → 270", core.normaliseRotation(-90) === 270);
  check("450 → 90", core.normaliseRotation(450) === 90);
  check("undefined → 0", core.normaliseRotation(undefined) === 0);
  check("89 → 90（就近）", core.normaliseRotation(89) === 90);
}

console.log("\n[A2-6] 端對端：撳落 viewport 某點，文字就要出現喺嗰點");
console.log("       （畫完再用 pdf.js 抽返文字位置，閉環驗證）");
{
  const PDFLib = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  for (const pg of [{ w: 595, h: 842, label: "A4" }, { w: 400, h: 300, label: "custom" }]) {
    for (const rot of ROTATIONS) {
      const src = await pageBytes(pg.w, pg.h, rot);
      const fx = 0.3, fy = 0.25, size = 14;
      const out = await core.overlayItems(src,
        [{ page: 0, xFrac: fx, yFrac: fy, text: "XmarkX", size }],
        { PDFLib, fontkit });

      const doc = await pdfjs.getDocument({ data: new Uint8Array(out) }).promise;
      const page = await doc.getPage(1);
      const scale = 1;
      const vp = page.getViewport({ scale });
      const tc = await page.getTextContent();
      const item = tc.items.find((i) => i.str.includes("Xmark"));
      if (!item) { check(`${pg.label} rot=${rot} 搵到文字`, false, "text not found"); await doc.destroy(); continue; }
      // transform = [a,b,c,d,e,f]；(e,f) 係基線起點，喺 PDF 空間
      const [px, py] = [item.transform[4], item.transform[5]];
      const [vx, vy] = vp.convertToViewportPoint(px, py);
      const wantX = fx * vp.width;
      const wantY = fy * vp.height + core.baselineOffsetForSize(size); // 基線喺方框頂之下
      check(`${pg.label} rot=${rot} 文字落喺撳嗰點（±3pt）`,
        Math.abs(vx - wantX) <= 3 && Math.abs(vy - wantY) <= 3,
        `want viewport (${wantX.toFixed(1)}, ${wantY.toFixed(1)}) got (${vx.toFixed(1)}, ${vy.toFixed(1)})`);
      await doc.destroy();
    }
  }
}

console.log(`\n${fail === 0 ? "✅ 全部通過" : "❌ " + fail + " 項失敗"}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
