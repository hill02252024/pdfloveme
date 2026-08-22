/* pdfloveme — scripts/pdf-tests/lib/cdp.mjs
 *
 * 零依賴 Chrome DevTools Protocol 驅動。
 * Node 22 內建 global WebSocket，所以唔需要 puppeteer 或者任何 npm 套件。
 *
 * 用途：喺無頭 Chrome 入面真正量度 getComputedStyle / getBoundingClientRect，
 * 而唔係靠讀 CSS 推斷。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error("搵唔到 Chrome / Chromium");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9222 } = {}) {
  const bin = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfloveme-chrome-"));
  const proc = spawn(bin, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
    "about:blank",
  ], { stdio: "ignore", detached: false });

  // 等 debugging endpoint 起身
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { proc, port, userDataDir };
    } catch {}
    await sleep(100);
  }
  proc.kill();
  throw new Error("Chrome debugging endpoint 起唔到");
}

export async function killChrome(handle) {
  try { handle.proc.kill("SIGKILL"); } catch {}
  try { fs.rmSync(handle.userDataDir, { recursive: true, force: true }); } catch {}
}

/* 開一個新 tab 並連上佢嘅 CDP session */
export async function newPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const onEvent = (fn) => listeners.push(fn);

  async function close() {
    try { ws.close(); } catch {}
    try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch {}
  }

  return { send, onEvent, close, targetId: target.id };
}

/* 設定視窗尺寸（真正影響 layout 同 media query） */
export async function setViewport(page, width, height = 900, dpr = 1) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: dpr, mobile: false,
  });
}

/* 導航並等到 load + 網絡靜下嚟（畀 fetch 嘅 JSON 有時間入 DOM） */
export async function goto(page, url, { settleMs = 700 } = {}) {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  const loaded = new Promise((resolve) => {
    page.onEvent((m) => { if (m.method === "Page.loadEventFired") resolve(); });
  });
  await page.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(10000)]);
  await sleep(settleMs);
}

/* 喺頁面內執行一段 function，攞返 JSON */
export async function evaluate(page, fnSource) {
  const res = await page.send("Runtime.evaluate", {
    expression: `JSON.stringify((${fnSource})())`,
    returnByValue: true,
    awaitPromise: false,
  });
  if (res.exceptionDetails) {
    throw new Error("頁面內執行出錯：" + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails));
  }
  return JSON.parse(res.result.value);
}

/* 設定色彩模式（驗深色模式用） */
export async function setColorScheme(page, scheme) {
  await page.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scheme }],
  });
}
