// 字體 subset 覆蓋範圍稽核。
//
// 兩件事：
//   1. 常見香港姓名同地址用字，逐個檢查喺唔喺 subset 入面。缺咗嘅要報出嚟。
//   2. subset 檔案本身有冇 odd-length glyph record。呢個唔係美觀問題 ——
//      @pdf-lib/fontkit 1.1.1 嵌入時會 `offsets[i] >>>= 1`，一隻單數長度嘅
//      glyph 之後所有 offset 都錯半個 byte，出嚟嘅 PDF 抽字完全正確、揭開
//      一片空白。呢個站真係咁樣出過貨。
//
// 兩項都有反面對照：一隻明知唔喺 subset 嘅字要被報缺，一隻明知冇補齊嘅字體
// 要被 padding 檢查捉到，並且真係 render 唔出嚟。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { renderPage, addedInk, analyseText } from "./lib/render-metrics.mjs";

const require = createRequire(import.meta.url);
const fk = require("@pdf-lib/fontkit");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const FONT = path.join(REPO, "vendor/fonts/NotoSansTC-HKSCS-subset.ttf");
const FONT_TIER1 = path.join(REPO, "vendor/fonts/NotoSansTC-Big5L1-subset.ttf");
const FIXTURES = path.join(HERE, "fixtures");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++;
  else { fail++; console.log(`   FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// 常用香港姓名同地址用字。分組係為咗報錯嗰陣睇得出邊一類出事。
const AUDIT = [
  ["百家姓／香港常見姓氏",
   "陳李黃何鄧張劉楊吳趙周徐孫馬朱胡郭林羅梁謝宋唐許鄭馮韓曹曾彭蕭蔡潘袁于董余蘇葉呂魏蔣田杜丁沈姜范江傅鍾盧汪戴崔任陸廖姚方金邱夏譚韋賈鄒石熊孟秦閻薛侯雷白龍段郝孔邵史毛常萬顧賴武康賀嚴尹錢施牛洪龔歐陽司徒諸葛"],
  ["名字常用字",
   "偉明志強華國文英秀珍玉蘭芳梅蓮鳳霞燕娟娜靜淑君慧巧美麗嘉欣怡穎琳琪雅婷雯詩恩晴曦樂軒宇浩然豪家俊傑成業建思聰若紫海"],
  ["香港地區／地名",
   "香港九龍新界離島中西區灣仔東南北觀塘深水埗油尖旺黃大仙葵青荃灣屯門元朗大埔沙田西貢將軍澳馬鞍山天水圍上水粉嶺長洲南丫坪洲梅窩涌青衣葵荔枝角美孚太子角佐敦紅磡土瓜灣何田城樂富鑽石彩虹牛頭藍油塘炮台北鰂魚太古河筲箕柴杏花邨堅尼地石塘咀營盤上環金鐘銅鑼天后跑馬薄扶林仔鴨脷洲赤柱淺水澳愉景"],
  ["地址詞彙",
   "道街路巷里徑坊臺苑閣軒樓宇座室房層單位大廈心廣場花園村圍新舊下前後左右第號鋪舖商工公寓別墅山莊海景市站岸島嶺谷坡塘湖溪橋隧口段"],
  ["表格常用字",
   "姓名性別男女出生日期年月身份證碼電話手提聯絡址永久通訊郵婚姻狀況已未職業司僱主收入薪銀行戶簽署填寫申請代表見人聲謹此確資料屬實正無誤同意接受條款細則備註其他先士小姐博教醫律"],
];

const font = fk.create(await fs.readFile(FONT));
const has = (ch) => font.hasGlyphForCodePoint(ch.codePointAt(0));

console.log("\n[F1] subset 覆蓋常用香港姓名／地址用字");
const missing = [];
let total = 0;
for (const [label, chars] of AUDIT) {
  const gone = [...new Set(chars)].filter((c) => !has(c));
  total += new Set(chars).size;
  if (gone.length) missing.push([label, gone.join("")]);
  console.log(`   ${label}：${new Set(chars).size - gone.length}/${new Set(chars).size}` +
    (gone.length ? `　缺：${gone.join("")}` : ""));
}
check(`${total} 個常用字全部喺 subset 入面`, missing.length === 0,
  missing.map(([l, g]) => `${l}: ${g}`).join(" / "));
console.log(`   subset 一共 ${font.characterSet.length} 個 code point，${font.numGlyphs} 個 glyph`);

// 反面對照：一隻明知唔喺 Big5-HKSCS／GB2312 入面嘅罕見字，一定要報缺。
// 如果連佢都話「有」，即係上面個檢查根本冇喺度分辨緊嘢。
console.log("\n[F1 反面對照] 明知唔喺 subset 嘅字要被報缺");
const OUTSIDE = ["㓦", "㡵", "㫚", "䂴", "䓡"];   // CJK 擴展 A，唔喺 HKSCS 亦唔喺 GB2312
const wronglyPresent = OUTSIDE.filter((c) => has(c));
console.log(`   ${OUTSIDE.join("")} → ${OUTSIDE.map((c) => (has(c) ? "有" : "缺")).join(" ")}`);
check("反面對照：擴展 A 罕用字確實報缺（證明檢查唔係恆真）",
  wronglyPresent.length === 0, wronglyPresent.join(""));

// ------------------------------------------------------------
// F2 — glyph record 長度
// ------------------------------------------------------------
/** 由 TTF 直接讀 loca，數有幾多隻 glyph 嘅 record 係單數長度。 */
async function oddGlyphCount(file) {
  const buf = await fs.readFile(file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    tables[tag] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
  }
  if (!tables.loca || !tables.head || !tables.maxp) return null;
  const longFormat = dv.getInt16(tables.head.offset + 50) === 1;
  const numGlyphs = dv.getUint16(tables.maxp.offset + 4);
  let odd = 0;
  const at = (i) => longFormat
    ? dv.getUint32(tables.loca.offset + i * 4)
    : dv.getUint16(tables.loca.offset + i * 2) * 2;
  for (let i = 0; i < numGlyphs; i++) if ((at(i + 1) - at(i)) % 2) odd++;
  return { odd, numGlyphs, longFormat };
}

console.log("\n[F2] 出貨字體冇單數長度嘅 glyph record");
const shipped = await oddGlyphCount(FONT);
console.log(`   ${path.basename(FONT)}：${shipped.numGlyphs} glyph，loca ${shipped.longFormat ? "long" : "short"}，單數長度 ${shipped.odd}`);
check("出貨字體 0 隻單數長度 glyph", shipped.odd === 0, `${shipped.odd} 隻`);

console.log("\n[F2 反面對照] 冇補齊嘅字體要被捉到，而且真係 render 唔出");
const CONTROL = path.join(FIXTURES, "unpadded-glyphs.ttf");
// Tier 1 carries the same padding requirement as the shipped font, and the
// same silent failure if it is missed: fontkit shifts every loca offset
// right by one bit, so a single odd-length glyph misaligns the rest and the
// page draws nothing at all. It ships, so it is checked.
const t1 = await oddGlyphCount(FONT_TIER1);
console.log(`   ${path.basename(FONT_TIER1)}：${t1.numGlyphs} glyph，loca ${t1.longFormat ? "long" : "short"}，單數長度 ${t1.odd}`);
check("Tier 1 字體 0 隻單數長度 glyph", t1.odd === 0, `${t1.odd} 隻`);

const ctl = await oddGlyphCount(CONTROL);
console.log(`   unpadded-glyphs.ttf：${ctl.numGlyphs} glyph，loca ${ctl.longFormat ? "long" : "short"}，單數長度 ${ctl.odd}`);
check("反面對照：對照字體確實有單數長度 glyph（否則佢對照唔到嘢）", ctl.odd > 0);
check("反面對照：同一個檢查會判對照字體不合格", !(ctl.odd === 0));

// 而且要證明「單數長度」唔係一個紙上談兵嘅屬性 —— 用佢真係畫一次。
const SAMPLE = "陳大文香港九龍";
async function drawWith(fontFile) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await doc.embedFont(await fs.readFile(fontFile), { subset: true });
  const page = doc.addPage([595, 842]);
  page.drawText(SAMPLE, { x: 60, y: 842 - 120, size: 24, font: f, color: rgb(0, 0, 0) });
  return await doc.save();
}
const blankPage = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return await doc.save();
})();
const base = await renderPage(blankPage, 0, 3);
const placement = { x: 60, yBaseline: 120, size: 24, charCount: SAMPLE.length,
                    advance: 24, cellMode: "advance" };
const blankRect = { x0: 60, y0: 400, x1: 500, y1: 500 };

const goodImg = await renderPage(await drawWith(FONT), 0, 3);
const good = analyseText(addedInk(goodImg, base), placement, blankRect);
console.log(`   出貨字體　　　region ${good.regionRatio.toFixed(4)} 空字位 ${good.emptyCells.length}`);
check("出貨字體真係畫得出七個字", good.regionRatio >= 0.05 && good.emptyCells.length === 0,
  `region ${good.regionRatio.toFixed(4)}, 空字位 ${good.emptyCells.join(",")}`);

const badImg = await renderPage(await drawWith(CONTROL), 0, 3);
const bad = analyseText(addedInk(badImg, base), placement, blankRect);
console.log(`   冇補齊嘅對照　region ${bad.regionRatio.toFixed(4)} 空字位 ${bad.emptyCells.length}`);
check("反面對照：冇補齊嘅字體真係畫唔出（抽字會啱，畫面係空嘅）",
  bad.regionRatio < 0.05 || bad.emptyCells.length > 0,
  `region ${bad.regionRatio.toFixed(4)}, 空字位 ${bad.emptyCells.join(",")}`);

console.log(`\n${fail === 0 ? "✅ 全部通過" : "❌ " + fail + " 項失敗"}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
