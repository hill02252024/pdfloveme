// ⚠️ SUPERSEDED by scripts/build-sitemap.mjs (singular).
//
// Kept only so an old muscle-memory `node scripts/build-sitemaps.mjs` still
// produces the correct file instead of silently regressing the sitemap. It
// now just delegates. Do not add logic here — edit build-sitemap.mjs.
await import("./build-sitemap.mjs");
export {};

/* ---------- original implementation below, retained for reference ----------
// scripts/build-sitemaps.mjs
//
// Single source of truth for sitemap.xml. Same approach as the sibling
// todays-tasks.com site: walk the filesystem so the list can never go stale,
// and take each page's own <link rel="canonical"> as the URL — that way the
// sitemap and the canonical can never disagree.
//
// A page is skipped if it lives in a non-content directory, is the 404 page,
// carries a `noindex` robots meta, or is a redirect stub (zero-delay meta
// refresh plus a canonical pointing elsewhere).
import fs from "node:fs/promises";
import path from "node:path";

const SITE = "https://pdfloveme.com";

const EXCLUDE_DIRS = new Set([
  ".git", ".github", "node_modules",
  "scripts",   // this generator
  "vendor",    // third-party libraries and the font
  "css", "js", "assets",
]);

function iso(d) { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } }

async function read(file) {
  try { return await fs.readFile(file, "utf8"); } catch { return ""; }
}

function hasNoindex(html) {
  return /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
}

function isRedirectStub(html) {
  return /<meta\s+http-equiv=["']refresh["']\s+content=["']0;\s*url=/i.test(html)
      && /<link\s+rel=["']canonical["']/i.test(html);
}

function canonicalOf(html) {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/// Every indexable page, keyed by its own canonical URL.
async function collect(root = ".") {
  const found = new Map();
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        await walk(path.join(dir, e.name));
        continue;
      }
      if (!e.isFile() || !e.name.endsWith(".html")) continue;
      if (e.name === "404.html") continue;

      const full = path.join(dir, e.name);
      const html = await read(full);
      if (hasNoindex(html) || isRedirectStub(html)) continue;

      const canon = canonicalOf(html);
      let rel = full.split(path.sep).join("/");
      if (rel.startsWith("./")) rel = rel.slice(2);

      if (!canon) {
        console.warn(`  ! ${rel} has no canonical — skipped. Add one and re-run.`);
        continue;
      }
      found.set(canon, rel);
    }
  }
  await walk(root);
  return found;
}

const pages = await collect();
const home = `${SITE}/`;
const rest = [...pages.keys()].filter((u) => u !== home).sort();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${home}</loc><lastmod>${iso(Date.now())}</lastmod></url>
  ${rest.map((u) => `<url><loc>${u}</loc></url>`).join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap.xml", xml, "utf8");
console.log(`✅ sitemap.xml — ${pages.size} pages`);

---------- end of retained original ---------- */
