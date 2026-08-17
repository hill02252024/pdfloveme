// 視覺渲染驗證 —— 喺 E2E 之後跑，把佢產出嘅三個 PDF 用 pdf.js render 成點陣，
// 數真正畫咗出嚟嘅像素。
//
// 點解要有呢一步：抽文字讀嘅係 /ToUnicode，同 glyph 畫得出畫唔出完全無關。
// 一個字體嵌入壞咗嘅 PDF，抽出嚟嘅字串一字不差，揭開嚟成版白色。呢個站真係
// 出過呢個 bug（見 README「fontkit short loca」一節），而當時所有測試都係綠色。
//
// 反面對照喺尾段跑：故意唔畫任何嘢、故意用唔含中文嘅字體，兩樣都要令斷言 fail。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as PDFLib from "pdf-lib";
import { renderPage, addedInk, textRuns, analyseText } from "./lib/render-metrics.mjs";

// 同一份 core，同瀏覽器行嘅係同一段碼
new Function(await (await import("node:fs/promises")).readFile(
  new URL("../../js/fill-pdf-core.js", import.meta.url), "utf8"))();
const core = globalThis.PDFFillCore;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const FIXTURES = path.join(HERE, "fixtures");
const FONT = path.join(REPO, "vendor/fonts/NotoSansTC-HKSCS-subset.ttf");

// scale 3 rather than 2: the tool's default type size is 12pt, so a glyph is
// 36 px across here. At scale 2 the interior band of a 24 px glyph is only a
// few pixels wide and the density numbers get noisy. Both scales separate the
// good and broken cases cleanly — the measured values are in README.md.
const SCALE = 3;

// 門檻。括號入面係實測值（見 README 校準表），全部留咗至少 2× 餘裕。
const T = {
  regionRatio: 0.05,       // 真字 0.19–0.31，乜都唔畫 0.000
  blankRatio: 0.002,       // 空白區實測 0.00000
  widthFraction: 0.7,      // 真字 0.98–1.00，壞 subset 0.13
  minInterior: 0.15,       // 真字 0.38–0.47，中空框 tofu 0.000
  maxEdgeOverInterior: 3,  // 真字 0.81–0.89，中空框 tofu 無限大
  minGridDistance: 0.05,   // 真字 0.47–0.52，tofu 0.0000（每個字畫到一模一樣）
};

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) pass++;
  else { fail++; failures.push(name); console.log(`   FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(path.join(OUT, "manifest.json"), "utf8"));
} catch {
  console.log("\n❌ 搵唔到 out/manifest.json —— 呢個測試食 E2E 嘅產出，要先跑 `npm run test:e2e`。");
  process.exit(1);
}

/**
 * The two assertions the region has to satisfy, for any script.
 * Returns whether the text is visible at all.
 */
function assertVisible(prefix, a) {
  check(`${prefix} 空白對照區真係空白`, a.blankRatio <= T.blankRatio, `blank ${a.blankRatio.toFixed(5)}`);
  check(`${prefix} 文字區有新增墨跡（>${T.regionRatio}）`,
    a.regionRatio >= T.regionRatio,
    `region ${a.regionRatio.toFixed(4)} vs blank ${a.blankRatio.toFixed(5)}`);
  check(`${prefix} 墨跡闊度接近應有闊度（≥${T.widthFraction}）`,
    a.expectedWidthPt > 0 && a.widthPt / a.expectedWidthPt >= T.widthFraction,
    `${a.widthPt.toFixed(0)}pt / ${a.expectedWidthPt.toFixed(0)}pt`);
  return a.regionRatio >= T.regionRatio;
}

/** The tofu checks. Only meaningful where an embedded font is in play. */
function assertNotTofu(prefix, a, charCount) {
  check(`${prefix} 每個字位都有墨跡`, a.emptyCells.length === 0,
    a.emptyCells.length ? `第 ${a.emptyCells.join(",")} 個字位係空嘅` : "");
  check(`${prefix} 字形內部有筆劃，唔係中空框（interior ≥${T.minInterior}）`,
    a.minInterior !== null && a.minInterior >= T.minInterior,
    `min interior ${a.minInterior === null ? "n/a" : a.minInterior.toFixed(3)}`);
  check(`${prefix} 邊緣密度冇遠高於內部（edge/interior ≤${T.maxEdgeOverInterior}）`,
    a.maxEdgeOverInterior !== null && a.maxEdgeOverInterior <= T.maxEdgeOverInterior,
    `max edge/interior ${a.maxEdgeOverInterior === null ? "n/a"
      : (a.maxEdgeOverInterior === Infinity ? "∞" : a.maxEdgeOverInterior.toFixed(2))}`);
  if (charCount > 1) {
    check(`${prefix} 各字字形唔同（tofu 會每個一模一樣，dist ≥${T.minGridDistance}）`,
      a.maxGridDistance !== null && a.maxGridDistance >= T.minGridDistance,
      `maxGridDistance ${a.maxGridDistance === null ? "n/a" : a.maxGridDistance.toFixed(4)}`);
  }
}

/** A slab of the page that carries nothing, used as the "white" baseline. */
function blankRectFor(pageHeightPt) {
  return { x0: 20, y0: pageHeightPt * 0.80, x1: pageHeightPt * 0.55, y1: pageHeightPt * 0.90 };
}

async function pageSize(bytes, pageIndex) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const p = doc.getPages()[pageIndex];
  return p.getSize();
}

// ============================================================
// 1–3. 三個真實產出
// ============================================================
const collected = [];   // 記低每個 case 嘅區域，反面對照要用返同一個位置

for (const c of manifest.cases) {
  console.log(`\n[V-${c.file}] ${c.label}`);
  const produced = await fs.readFile(path.join(OUT, c.file));
  const original = await fs.readFile(path.join(FIXTURES, c.fixture));

  for (const run of c.runs || []) {
    const runs = await textRuns(produced, run.page);
    const hit = runs.find((r) => r.str.includes(run.text));
    check(`p${run.page + 1} 抽得返「${run.text}」`, !!hit);
    if (!hit) continue;

    const { height: pageH } = await pageSize(produced, run.page);
    const before = await renderPage(original, run.page, SCALE);
    const after = await renderPage(produced, run.page, SCALE);
    const diff = addedInk(after, before);

    const charCount = run.text.length;
    const placement = run.cjk
      ? { x: hit.x, yBaseline: hit.yBaseline, size: run.size, charCount,
          advance: run.size, cellMode: "advance" }
      : { x: hit.x, yBaseline: hit.yBaseline, size: run.size, charCount,
          advance: hit.width / charCount, cellMode: "bbox" };
    const blank = blankRectFor(pageH);
    const a = analyseText(diff, placement, blank);

    const prefix = `p${run.page + 1}「${run.text}」`;
    console.log(`   region ${a.regionRatio.toFixed(4)}  blank ${a.blankRatio.toFixed(5)}  ` +
      `width ${a.widthPt.toFixed(0)}/${a.expectedWidthPt.toFixed(0)}pt  ` +
      `interior ${a.minInterior === null ? "-" : a.minInterior.toFixed(3)}  ` +
      `edge/int ${a.maxEdgeOverInterior === null ? "-" : (a.maxEdgeOverInterior === Infinity ? "∞" : a.maxEdgeOverInterior.toFixed(2))}  ` +
      `dist ${a.maxGridDistance === null ? "-" : a.maxGridDistance.toFixed(4)}`);
    assertVisible(prefix, a);
    if (run.cjk) assertNotTofu(prefix, a, charCount);
    else {
      // 拉丁字母冇「中空框」呢種失敗模式（Helvetica 唔使嵌入），但仍然要
      // 證明唔係得一個 glyph 畫咗出嚟、而且各字唔係一模一樣。
      check(`${prefix} 各字形唔完全相同`,
        a.maxGridDistance === null || a.maxGridDistance >= 0.02,
        `maxGridDistance ${a.maxGridDistance === null ? "n/a" : a.maxGridDistance.toFixed(4)}`);
    }
    collected.push({ file: c.file, page: run.page, placement, blank, cjk: !!run.cjk, text: run.text });
  }

  for (const w of c.widgets || []) {
    // AcroForm 嘅字係畫喺 widget 嘅 appearance stream 入面，唔喺頁面內容流，
    // 所以抽唔到；要靠欄位自己個矩形去定位。
    const doc = await PDFDocument.load(produced, { ignoreEncryption: true });
    const field = doc.getForm().getTextField(w.field);
    const widget = field.acroField.getWidgets()[0];
    const rect = widget.getRectangle();
    const pageIndex = 0;
    const { height: pageH } = await pageSize(produced, pageIndex);
    const before = await renderPage(original, pageIndex, SCALE);
    const after = await renderPage(produced, pageIndex, SCALE);
    const diff = addedInk(after, before);

    // The field was created without an explicit size, so pdf-lib auto-fitted
    // one and wrote it back into /DA. Read it rather than assuming: measuring
    // 15pt text against a 12pt expectation would report a width error that
    // isn't there.
    const da = field.acroField.getDefaultAppearance() || "";
    const daSize = Number((da.match(/\/[^\s]+\s+([\d.]+)\s+Tf/) || [])[1]) || w.size;
    const helv = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const textWidth = helv.widthOfTextAtSize(w.text, daSize);
    // Measure the band the text occupies, not the whole field: a 321pt-wide
    // box holding 79pt of text dilutes the density by four and the threshold
    // would be measuring empty field, not glyphs.
    const yMid = pageH - (rect.y + rect.height / 2);
    const inset = 2;
    const region = {
      x0: rect.x, y0: yMid - daSize * 0.75,
      x1: rect.x + inset + textWidth + daSize * 0.3, y1: yMid + daSize * 0.55,
    };
    const placement = {
      x: rect.x + inset, yBaseline: yMid + daSize * 0.35, size: daSize,
      charCount: w.text.length, cellMode: "bbox",
      advance: textWidth / w.text.length,
      region,
    };
    const a = analyseText(diff, placement, blankRectFor(pageH));
    const prefix = `欄位 ${w.field}`;
    console.log(`   ${prefix}: region ${a.regionRatio.toFixed(4)}  blank ${a.blankRatio.toFixed(5)}  ` +
      `width ${a.widthPt.toFixed(0)}/${a.expectedWidthPt.toFixed(0)}pt  ` +
      `dist ${a.maxGridDistance === null ? "-" : a.maxGridDistance.toFixed(4)}`);
    assertVisible(prefix, a);
    check(`${prefix} 各字形唔完全相同`,
      a.maxGridDistance === null || a.maxGridDistance >= 0.02,
      `maxGridDistance ${a.maxGridDistance === null ? "n/a" : a.maxGridDistance.toFixed(4)}`);
    collected.push({ file: c.file, page: pageIndex, placement, blank: blankRectFor(pageH),
                     cjk: false, text: w.text });
  }
}

// ============================================================
// 4. 反面對照
// ============================================================
// 兩個都要 fail，否則上面嗰批斷言就係恆真，當作無效。
//
// 對照 A：乜都唔畫 —— 攞原本個 fixture 當「產出」，喺同一個區域度同一組數。
// 對照 B：用一個唔含中文嘅字體去畫中文 —— glyph 全部落 .notdef。
//         三種 .notdef 都試：中空框、打交叉嘅框、同埋完全空白。

function countFailures(fn) {
  const p0 = pass, f0 = fail, n0 = failures.length;
  fn();
  const gained = failures.slice(n0);
  const got = { pass: pass - p0, fail: fail - f0, names: gained };
  pass = p0; fail = f0; failures.length = n0;   // 對照唔計入總分
  return got;
}

console.log("\n[反面對照 A] 乜都唔畫 —— 同一區域應該完全冇墨跡");
let controlAOK = true;
for (const c of collected) {
  const original = await fs.readFile(path.join(FIXTURES,
    manifest.cases.find((m) => m.file === c.file).fixture));
  // 行返同一條 pipeline，但一個 item 都唔畫。唔係直接攞原檔嚟比自己，
  // 因為咁樣係恆等於零，證明唔到套斷言真係會響。
  const empty = await core.overlayItems(original, [], { PDFLib, fontkit });
  const base = await renderPage(original, c.page, SCALE);
  const after = await renderPage(empty, c.page, SCALE);
  const a = analyseText(addedInk(after, base), c.placement, c.blank);
  const r = countFailures(() => assertVisible(`對照A ${c.text}`, a));
  const caught = r.fail > 0;
  console.log(`   ${c.text.padEnd(10)} region ${a.regionRatio.toFixed(4)} → ` +
    (caught ? `${r.fail} 項斷言 fail ✅` : "竟然全部通過 ❌"));
  if (!caught) controlAOK = false;
}
check("反面對照 A：乜都唔畫，每個 case 都被捉到", controlAOK);

console.log("\n[反面對照 B] 用唔含中文嘅字體畫中文 —— 應該被 tofu 檢查捉到");
const cjkCases = collected.filter((c) => c.cjk);
check("有中文 case 可以做對照 B", cjkCases.length > 0);
let controlBOK = cjkCases.length > 0;
for (const variant of ["tofu-hollow.ttf", "tofu-xbox.ttf", "tofu-empty.ttf"]) {
  const wrongFont = await fs.readFile(path.join(FIXTURES, variant));
  for (const c of cjkCases) {
    const fixture = manifest.cases.find((m) => m.file === c.file).fixture;
    const original = await fs.readFile(path.join(FIXTURES, fixture));
    // 用同一支筆、同一個位置，只換字體
    const doc = await PDFDocument.load(original, { ignoreEncryption: true });
    doc.registerFontkit(fontkit);
    const f = await doc.embedFont(wrongFont, { subset: true });
    const pg = doc.getPages()[c.page];
    pg.drawText(c.text, { x: c.placement.x, y: pg.getHeight() - c.placement.yBaseline,
                          size: c.placement.size, font: f, color: rgb(0, 0, 0) });
    const broken = await doc.save();

    const base = await renderPage(original, c.page, SCALE);
    const after = await renderPage(broken, c.page, SCALE);
    const a = analyseText(addedInk(after, base), c.placement, c.blank);
    const r = countFailures(() => {
      assertVisible(`對照B ${c.text}`, a);
      assertNotTofu(`對照B ${c.text}`, a, c.text.length);
    });
    const caught = r.fail > 0;
    console.log(`   ${variant.padEnd(17)} ${c.text.padEnd(6)} region ${a.regionRatio.toFixed(4)} ` +
      `interior ${a.minInterior === null ? "-" : a.minInterior.toFixed(3)} ` +
      `dist ${a.maxGridDistance === null ? "-" : a.maxGridDistance.toFixed(4)} → ` +
      (caught ? `${r.fail} 項斷言 fail ✅` : "竟然全部通過 ❌"));
    if (!caught) controlBOK = false;
  }
}
check("反面對照 B：錯字體畫中文，三種 .notdef 全部被捉到", controlBOK);

// 對照做完，磁碟上嘅產出同字體一個字都冇改過 —— 上面全部係喺記憶體度砌嘅。

console.log(`\n${fail === 0 ? "✅ 全部通過" : "❌ " + fail + " 項失敗"}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
