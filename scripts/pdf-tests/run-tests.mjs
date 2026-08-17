// E3 — 用三個真實檔案驗 fill-pdf-core：AcroForm、平面 PDF、三頁中文表格。
// 每個都要：產出打得開、填入嘅值真係喺度、原文冇被改動。
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import * as PDFLib from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const require = createRequire(import.meta.url);
const REPO = "/Users/hill/Desktop/GITHUB_PDF";
const CORE = path.join(REPO, "js/fill-pdf-core.js");
const FONT = path.join(REPO, "vendor/fonts/NotoSansTC-Regular-subset.ttf");

// 用返 repo 入面嗰個檔案本身，唔係另一份 copy
new Function(await fs.readFile(CORE, "utf8"))();
const core = globalThis.PDFFillCore;

const fontBytes = await fs.readFile(FONT);
const OUT = path.resolve("out");
await fs.mkdir(OUT, { recursive: true });

// pdf.js 抽文字，用嚟核對原文有冇改動
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

async function textOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    pages.push(tc.items.map((x) => x.str).join(""));
  }
  await doc.destroy();
  return pages;
}

let fails = 0;
function check(name, cond, detail) {
  console.log(`   ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) fails++;
}

// ---------------- 1. AcroForm ----------------
{
  console.log("\n[1] AcroForm 表格 — 偵測欄位並填寫");
  const src = await fs.readFile("fixtures/form-acroform.pdf");
  const before = await textOf(src);

  const det = await core.detectFields(src, PDFLib);
  check("偵測到 AcroForm", det.hasForm === true, `${det.fields.length} 個欄位`);
  check("欄位名正確", det.fields.map((f) => f.name).join(",") ===
    "applicant_name,applicant_address,applicant_phone");

  const out = await core.fillAcroForm(src, {
    applicant_name: "陳大文",
    applicant_address: "香港九龍",
    applicant_phone: "9123 4567",
  }, { PDFLib, fontkit, fontBytes });

  await fs.writeFile(path.join(OUT, "1-acroform-filled.pdf"), out);
  check("產出可重新解析", (await PDFLib.PDFDocument.load(out)).getPageCount() === 1);

  const re = await core.detectFields(out, PDFLib);
  const byName = Object.fromEntries(re.fields.map((f) => [f.name, f.value]));
  check("姓名寫入且係中文", byName.applicant_name === "陳大文", JSON.stringify(byName.applicant_name));
  check("地址寫入且係中文", byName.applicant_address === "香港九龍", JSON.stringify(byName.applicant_address));
  check("電話寫入", byName.applicant_phone === "9123 4567");

  const after = await textOf(out);
  check("原有文字冇被改動",
    before[0].includes("Job Application Form") && after[0].includes("Job Application Form"));
}

// ---------------- 2. 平面 PDF ----------------
{
  console.log("\n[2] 平面／掃描式 PDF — 疊加文字同簽名");
  const src = await fs.readFile("fixtures/form-flat.pdf");
  const before = await textOf(src);

  const det = await core.detectFields(src, PDFLib);
  check("正確判定為冇欄位", det.hasForm === false, `fields=${det.fields.length}`);

  // 一個 1×1 透明 PNG 當簽名，證明 image overlay 條路行得通
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");

  const out = await core.overlayItems(src, [
    { page: 0, xFrac: 0.30, yFrac: 0.17, text: "Chan Tai Man", size: 12 },
    { page: 0, xFrac: 0.30, yFrac: 0.215, pngBytes: png, wFrac: 0.2 },
  ], { PDFLib, fontkit, fontBytes });

  await fs.writeFile(path.join(OUT, "2-flat-overlaid.pdf"), out);
  check("產出可重新解析", (await PDFLib.PDFDocument.load(out)).getPageCount() === 1);

  const after = await textOf(out);
  check("疊加文字出現喺輸出", after[0].includes("Chan Tai Man"));
  check("原文一字不改",
    before[0].replace(/\s+/g, "") ===
    after[0].replace("Chan Tai Man", "").replace(/\s+/g, ""),
    `before=${JSON.stringify(before[0].slice(0, 40))}`);
}

// ---------------- 3. 三頁中文表格 ----------------
{
  console.log("\n[3] 三頁中文表格 — 逐頁疊加中文");
  const src = await fs.readFile("fixtures/form-chinese-3page.pdf");
  const before = await textOf(src);
  check("原檔係 3 頁", before.length === 3);

  const det = await core.detectFields(src, PDFLib);
  check("正確判定為冇欄位", det.hasForm === false);
  check("頁數偵測正確", det.pageCount === 3);

  const out = await core.overlayItems(src, [
    { page: 0, xFrac: 0.20, yFrac: 0.145, text: "陳大文", size: 12 },
    { page: 1, xFrac: 0.20, yFrac: 0.145, text: "香港九龍彌敦道 123 號", size: 12 },
    { page: 2, xFrac: 0.20, yFrac: 0.145, text: "簽署：陳大文", size: 12 },
  ], { PDFLib, fontkit, fontBytes });

  await fs.writeFile(path.join(OUT, "3-chinese-3page-filled.pdf"), out);
  const doc = await PDFLib.PDFDocument.load(out);
  check("產出仍然係 3 頁", doc.getPageCount() === 3);

  const after = await textOf(out);
  check("第 1 頁中文正確（唔係亂碼）", after[0].includes("陳大文"), JSON.stringify(after[0].slice(-20)));
  check("第 2 頁中文正確", after[1].includes("香港九龍彌敦道"), JSON.stringify(after[1].slice(-24)));
  check("第 3 頁中文正確", after[2].includes("簽署：陳大文"), JSON.stringify(after[2].slice(-20)));
  for (let i = 0; i < 3; i++) {
    check(`第 ${i + 1} 頁原有標題保留`, after[i].includes(`第 ${i + 1} 頁`) || after[i].includes("頁"));
  }
}

// ---------------- 反面對照：證明個檢查唔係恆真 ----------------
{
  console.log("\n[控制組] 反面對照 — 冇填過嘅檔案必須驗唔到值");
  const src = await fs.readFile("fixtures/form-acroform.pdf");
  const det = await core.detectFields(src, PDFLib);
  const byName = Object.fromEntries(det.fields.map((f) => [f.name, f.value]));
  check("未填時 applicant_name 係空", !byName.applicant_name, JSON.stringify(byName.applicant_name));
  const after = await textOf(src);
  check("未填時搵唔到「陳大文」", !after[0].includes("陳大文"));
}

console.log(`\n${fails === 0 ? "✅ 全部通過" : "❌ 有 " + fails + " 項失敗"}`);
process.exit(fails ? 1 : 0);
