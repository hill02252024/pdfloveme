/* pdfloveme — scripts/pdf-tests/tools-smoke.test.mjs
 *
 * 每個工具頁餵一份真 PDF（或 JPG），行完整流程，攞返輸出檔並斷言佢係
 * 一份非空、格式正確嘅檔案。冇 npm 依賴：用 scripts/pdf-tests/lib/cdp.mjs
 * 直接駁無頭 Chrome。
 *
 * 點解唔靠瀏覽器下載目錄：頁面用 URL.createObjectURL(blob) + a.click()。
 * 我哋喺頁面載入前 patch createObjectURL，直接錄低 blob 嘅位元組，
 * 咁就唔使等檔案系統，亦攞到真正嘅輸出內容去驗 magic bytes。
 *
 * 負控制：--break 會攔住所有 /vendor/ 請求，即係 pdf-lib、pdf.js、
 * fontkit、JSZip 全部載唔到。呢個正正係「改咗 script 載入方式」會踩到嘅
 * 失敗模式，所以佢係一個對階段 7 有意義嘅控制，而唔係淨係搞盲攔截器。
 * --break 之下每一行都必須 FAIL；有任何一行仲過到，呢個 suite 唔可信。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, newPage, setViewport, goto, evaluate, killChrome } from "./lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BREAK = process.argv.includes("--break");
const PORT = 8931;
const FIX = "/scripts/pdf-tests/fixtures/form-chinese-3page.pdf";
const JPG = "/scripts/pdf-tests/fixtures/photo.jpg";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png",
  ".ttf": "font/ttf", ".json": "application/json", ".ico": "image/x-icon", ".xml": "application/xml" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (f.endsWith("/")) f += "index.html";
      fs.readFile(f, (e, b) => {
        if (e) { rq.writeHead(404); rq.end("nope"); return; }
        rq.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
        rq.end(b);
      });
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

/* 每個工具喺攞到檔案之後要做嘅嘢。step 係一段喺頁面內跑嘅 async function
 * source，收 {load, click, set, wait, ready} 工具。返回值唔重要，掉低就算。 */
const TOOLS = [
  { slug: "merge",        files: [FIX, FIX], go: "#mergeBtn", magic: "%PDF" },
  { slug: "split",        files: [FIX], pre: `async(u)=>{await u.ready('#grid .pg,#grid .page,#grid > *');u.click('#selAll')}`, go: "#splitBtn", magic: "any" },
  { slug: "rotate",       files: [FIX], pre: `async(u)=>{await u.ready('#grid > *');u.clickFirst('#grid > *')}`, go: "#saveBtn", magic: "%PDF" },
  { slug: "delete-pages", files: [FIX], pre: `async(u)=>{await u.ready('#grid > *');u.clickFirst('#grid > *')}`, go: "#delBtn", magic: "%PDF" },
  { slug: "jpg-to-pdf",   files: [JPG], go: "#makeBtn", magic: "%PDF" },
  { slug: "pdf-to-jpg",   files: [FIX], pre: `async(u)=>{await u.ready('#grid > *')}`, go: "#zipBtn", magic: "PK" },
  { slug: "encrypt",      files: [FIX], pre: `async(u)=>{u.set('#pw','Sw0rdf1sh!');u.set('#pw2','Sw0rdf1sh!')}`, go: "#encBtn", magic: "%PDF" },
  { slug: "compress",     files: [FIX], pre: `async(u)=>{await u.idle('#loading')}`, go: "#compBtn", magic: "%PDF" },
  { slug: "crop",         files: [FIX], pre: `async(u)=>{await u.idle('#loading');await u.drag('#stage',0.15,0.15,0.85,0.85)}`, go: "#applyBtn", magic: "%PDF" },
  { slug: "organize",     files: [FIX], pre: `async(u)=>{await u.ready('#grid > *')}`, go: "#saveBtn", magic: "%PDF" },
  { slug: "page-numbers", files: [FIX], pre: `async(u)=>{await u.idle('#loading')}`, go: "#applyBtn", magic: "%PDF" },
  { slug: "watermark",    files: [FIX], pre: `async(u)=>{await u.idle('#loading');u.set('#wmText','CONFIDENTIAL')}`, go: "#applyBtn", magic: "%PDF" },
  { slug: "sign",         files: [FIX], pre: `async(u)=>{await u.idle('#loading');await u.draw('#pad');u.click('#useDrawn');await u.sleep(600)}`, go: "#applyBtn", magic: "%PDF" },
  { slug: "edit",         files: [FIX], pre: `async(u)=>{await u.idle('#loading');u.click('[data-tool="text"]');u.set('#annText','Smoke test note');await u.sleep(200);await u.tap('#pv',0.35,0.35)}`, go: "#applyBtn", magic: "%PDF" },
  { slug: "fill-form",    files: [FIX], pre: `async(u)=>{await u.idle('#loading');u.click('#modeOverlay');await u.sleep(400);await u.tap('#pagewrap',0.35,0.35);u.set('#boxText','Smoke test')}`, go: "#applyBtn", magic: "%PDF" },
  // unlock 要一份真加密 PDF；由 encrypt 嘅輸出餵返落去（見下面）
];

/* 喺頁面內注入嘅小工具庫 + createObjectURL 攔截 */
const PRELUDE = (brk) => `
window.__caught = [];
(function(){
  const real = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(blob){
    ${brk ? "" : `
    if (blob instanceof Blob) {
      const i = window.__caught.push({size: blob.size, head: '', b64: '', type: blob.type}) - 1;
      blob.slice(0,8).arrayBuffer().then(b=>{
        window.__caught[i].head = new TextDecoder('latin1').decode(new Uint8Array(b));
      });
      blob.arrayBuffer().then(b=>{
        let s2=''; const a2=new Uint8Array(b);
        for(let k=0;k<a2.length;k++) s2+=String.fromCharCode(a2[k]);
        window.__caught[i].b64 = btoa(s2);
      });
    }`}
    return real(blob);
  };
})();
window.__u = (function(){
  const q = s => document.querySelector(s);
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const pt = (el,fx,fy) => { const r=el.getBoundingClientRect();
    return {x:r.left+r.width*fx, y:r.top+r.height*fy}; };
  // 工具用 mousedown 起手、再喺 window 上聽 mousemove / mouseup，
  // 所以 move 同 up 一定要派去 window，唔係派去元素。
  const me = (t,x,y) => new MouseEvent(t,{clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:t==='mouseup'?0:1});
  const down = (el,x,y) => el.dispatchEvent(me('mousedown',x,y));
  const move = (x,y) => window.dispatchEvent(me('mousemove',x,y));
  const up   = (x,y) => window.dispatchEvent(me('mouseup',x,y));
  return {
    sleep,
    click: s => { const e=q(s); if(e) e.click(); },
    clickFirst: s => { const e=document.querySelector(s); if(e) e.click(); },
    set: (s,v) => { const e=q(s); if(!e) return; e.value=v;
      e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); },
    ready: async (s,ms=15000) => { const t=Date.now();
      while(Date.now()-t<ms){ if(document.querySelector(s)) return true; await sleep(120);} return false; },
    idle: async (s,ms=15000) => { const t=Date.now();
      while(Date.now()-t<ms){ const e=q(s);
        if(!e || e.hidden || getComputedStyle(e).display==='none' || !e.offsetParent) return true; await sleep(120);} return false; },
    drag: async (s,x1,y1,x2,y2) => { const el=q(s); if(!el) return false;
      const a=pt(el,x1,y1), b=pt(el,x2,y2);
      down(el,a.x,a.y); await sleep(60);
      for(let i=1;i<=4;i++){ move(a.x+(b.x-a.x)*i/4, a.y+(b.y-a.y)*i/4); await sleep(50); }
      up(b.x,b.y); await sleep(250); return true; },
    tap: async (s,fx,fy) => { const el=q(s); if(!el) return false;
      const a=pt(el,fx,fy);
      down(el,a.x,a.y); await sleep(40); up(a.x,a.y); await sleep(40);
      el.dispatchEvent(me('click',a.x,a.y)); await sleep(250); return true; },
    draw: async (s) => { const el=q(s); if(!el) return false;
      const p=[[.2,.6],[.35,.35],[.5,.65],[.65,.35],[.8,.6]].map(([fx,fy])=>pt(el,fx,fy));
      down(el,p[0].x,p[0].y);
      for(const c of p.slice(1)){ move(c.x,c.y); await sleep(40); }
      up(p[p.length-1].x,p[p.length-1].y); await sleep(200); return true; },
  };
})();
`;

async function feed(page, sel, urls) {
  return evaluate(page, `()=>{ return 1 }`).then(() =>
    page.send("Runtime.evaluate", {
      expression: `(async()=>{
        const dt = new DataTransfer();
        for (const u of ${JSON.stringify(urls)}) {
          if (typeof u === 'object' && u.b64) {
            const bin = atob(u.b64); const arr = new Uint8Array(bin.length);
            for (let k=0;k<bin.length;k++) arr[k]=bin.charCodeAt(k);
            dt.items.add(new File([arr], u.name, {type:'application/pdf'}));
          } else {
            const r = await fetch(u); const b = await r.blob();
            dt.items.add(new File([b], u.split('/').pop(), {type:b.type}));
          }
        }
        const inp = document.querySelector(${JSON.stringify(sel)});
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        return dt.files.length;
      })()`, awaitPromise: true, returnByValue: true }));
}

async function runTool(h, t, extraFiles) {
  const p = await newPage(h.port);
  const errs = [];
  await p.send("Runtime.enable");
  p.onEvent(m => { if (m.method === "Runtime.exceptionThrown")
    errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || "").split("\n")[0]); });
  await setViewport(p, 1400, 1000);
  await p.send("Page.enable");
  if (BREAK) {
    await p.send("Network.enable");
    await p.send("Network.setBlockedURLs", { urls: ["*/vendor/*"] });
  }
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: PRELUDE(BREAK) });
  await goto(p, `http://127.0.0.1:${PORT}/pages/${t.slug}.html`, { settleMs: 900 });

  await feed(p, "#fileInput", extraFiles || t.files);
  await p.send("Runtime.evaluate", { expression: "new Promise(r=>setTimeout(r,900))", awaitPromise: true });

  if (t.pre) await p.send("Runtime.evaluate", { expression: `(${t.pre})(window.__u)`, awaitPromise: true, returnByValue: true });

  await p.send("Runtime.evaluate", {
    expression: `(async()=>{ const u=window.__u;
      for(let i=0;i<80;i++){ const b=document.querySelector(${JSON.stringify(t.go)});
        if(b && !b.disabled){ b.click(); return 'clicked'; } await u.sleep(150); }
      return 'never-enabled'; })()`, awaitPromise: true, returnByValue: true });

  /* 有啲工具彈一個 #dl 掣，有啲（pdf-to-jpg、fill-form）撳完就即刻下載。
   * 兩種都要收貨，所以斷言睇嘅係實際交出嚟嘅 blob，唔係有冇個掣。 */
  const res = await p.send("Runtime.evaluate", {
    expression: `(async()=>{ const u=window.__u;
      let clicked=false;
      for(let i=0;i<140;i++){
        const d=document.querySelector('#dl');
        if(d && !clicked){ d.click(); clicked=true; await u.sleep(500); }
        if(window.__caught.some(c=>c.size>800)) break;
        await u.sleep(150); }
      await u.sleep(300);
      return JSON.stringify({dl:clicked, caught:window.__caught,
        err:(document.querySelector('.toast.err')||{}).textContent||''});
    })()`, awaitPromise: true, returnByValue: true });
  const out = JSON.parse(res.result.value);
  await p.close();
  return { ...out, errs };
}

const server = await serve();
const h = await launchChrome({ port: 9317 });
let pass = 0, fail = 0;
const rows = [];
let encrypted = null;

for (const t of TOOLS) {
  let r;
  try { r = await runTool(h, t); } catch (e) { r = { dl: false, caught: [], err: String(e).slice(0, 90), errs: [] }; }
  const blobs = (r.caught || []).filter(c => c.size > 0);
  const biggest = blobs.sort((a, b) => b.size - a.size)[0];
  const magicOk = !biggest ? false : t.magic === "any" ? true : biggest.head.startsWith(t.magic);
  const ok = !!biggest && biggest.size > 800 && magicOk && r.errs.length === 0;
  const note = r.errs.length ? "JS: " + r.errs[0] : (ok ? "" : r.err || "");
  rows.push([t.slug, ok, biggest ? biggest.size : 0, biggest ? JSON.stringify(biggest.head.slice(0, 4)) : "-", note.slice(0, 70)]);
  ok ? pass++ : fail++;
  if (t.slug === "encrypt" && ok) encrypted = biggest.b64;
}

/* unlock 要一份真加密 PDF。用 encrypt 頁啱啱交出嚟嗰份餵佢，
 * 咁條鏈就係「真加密 → 真解密」，唔係靠一份手作 fixture 扮嘢。
 * encrypt 唔過就唔准當 unlock 過，要當佢 skip 並喺報告講明。 */
if (encrypted) {
  const t = { slug: "unlock", files: [{ name: "locked.pdf", b64: encrypted }],
              pre: `async(u)=>{u.set('#pw','Sw0rdf1sh!')}`, go: "#unlockBtn", magic: "%PDF" };
  let r;
  try { r = await runTool(h, t); } catch (e) { r = { dl: false, caught: [], err: String(e).slice(0, 90), errs: [] }; }
  const blobs = (r.caught || []).filter(c => c.size > 0);
  const biggest = blobs.sort((a, b) => b.size - a.size)[0];
  const ok = !!biggest && biggest.size > 800 && biggest.head.startsWith("%PDF") && r.errs.length === 0;
  rows.push(["unlock", ok, biggest ? biggest.size : 0, biggest ? JSON.stringify(biggest.head.slice(0, 4)) : "-",
             (r.errs.length ? "JS: " + r.errs[0] : ok ? "" : r.err || "").slice(0, 70)]);
  ok ? pass++ : fail++;
} else {
  rows.push(["unlock", null, 0, "-", "encrypt 未通過，冇加密檔可餵"]);
}

await killChrome(h); server.close();

const W = [14, 6, 10, 8, 60];
console.log("tool".padEnd(W[0]) + "ok".padEnd(W[1]) + "bytes".padStart(W[2]) + "  magic".padEnd(W[3]) + "  note");
for (const r of rows) console.log(String(r[0]).padEnd(W[0]) + (r[1] === null ? "skip" : r[1] ? "PASS" : "FAIL").padEnd(W[1]) + String(r[2]).padStart(W[2]) + "  " + String(r[3]).padEnd(W[3]) + "  " + r[4]);
console.log(`\n${pass} pass, ${fail} fail, ${rows.filter(r => r[1] === null).length} skip` + (BREAK ? "  [negative control: every row must FAIL]" : ""));
if (BREAK) { if (pass > 0) { console.error("負控制冇生效：仲有測試過到，呢個 suite 唔可信"); process.exit(2); } console.log("負控制生效 ✓"); process.exit(0); }
process.exit(fail ? 1 : 0);
