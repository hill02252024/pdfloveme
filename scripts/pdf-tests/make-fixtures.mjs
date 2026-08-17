// 造三個真實測試檔：AcroForm 表格、平面（掃描式）PDF、三頁中文表格。
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const OUT = path.resolve("fixtures");
await fs.mkdir(OUT, { recursive: true });
const FONT = "/Users/hill/Desktop/GITHUB_PDF/vendor/fonts/NotoSansTC-Regular-subset.ttf";
const CJK = await fs.readFile(FONT);

// ---------- 1. AcroForm ----------
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Job Application Form", { x: 60, y: 780, size: 18, font: helv });
  page.drawText("Full name:", { x: 60, y: 720, size: 11, font: helv });
  page.drawText("Address:", { x: 60, y: 680, size: 11, font: helv });
  page.drawText("Phone:", { x: 60, y: 640, size: 11, font: helv });

  const form = doc.getForm();
  const mk = (name, y) => {
    const f = form.createTextField(name);
    f.addToPage(page, { x: 150, y: y - 4, width: 320, height: 20 });
    return f;
  };
  mk("applicant_name", 716);
  mk("applicant_address", 676);
  mk("applicant_phone", 636);
  await fs.writeFile(path.join(OUT, "form-acroform.pdf"), await doc.save());
}

// ---------- 2. 平面 PDF（模擬掃描件：只有已 flatten 嘅文字，冇欄位）----------
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("TENANCY AGREEMENT", { x: 60, y: 780, size: 16, font: helv });
  page.drawText("This agreement is made between the landlord and the tenant.", { x: 60, y: 740, size: 11, font: helv });
  page.drawText("Tenant name: ______________________", { x: 60, y: 700, size: 11, font: helv });
  page.drawText("Signature: ________________________", { x: 60, y: 660, size: 11, font: helv });
  page.drawRectangle({ x: 55, y: 620, width: 480, height: 190, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
  await fs.writeFile(path.join(OUT, "form-flat.pdf"), await doc.save());
}

// ---------- 3. 三頁中文表格 ----------
{
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const cjk = await doc.embedFont(CJK, { subset: true });
  const titles = ["租約申請表", "個人資料", "聲明及簽署"];
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`第 ${i + 1} 頁 — ${titles[i]}`, { x: 60, y: 780, size: 16, font: cjk });
    page.drawText("姓名：", { x: 60, y: 720, size: 12, font: cjk });
    page.drawText("地址：", { x: 60, y: 680, size: 12, font: cjk });
    page.drawText("電話：", { x: 60, y: 640, size: 12, font: cjk });
  }
  await fs.writeFile(path.join(OUT, "form-chinese-3page.pdf"), await doc.save());
}

const files = await fs.readdir(OUT);
for (const f of files) {
  const st = await fs.stat(path.join(OUT, f));
  console.log(`  ${f}  ${(st.size / 1024).toFixed(1)} KB`);
}
