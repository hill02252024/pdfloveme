// scripts/build-sitemap.mjs
//
// Single source of truth for sitemap.xml.
//
// Design notes, because every one of these was a real decision:
//
//  * The page list is walked from the filesystem, never hand-maintained, so a
//    new page can't be forgotten and a deleted one can't linger.
//  * Each URL comes from the page's own <link rel="canonical">. If a page
//    disagrees with the sitemap about its own address, the page wins — that
//    way the two can never drift apart.
//  * lastmod is the commit date of the last *content* change to that file,
//    taken from git. Falling back to mtime would make every checkout produce
//    a different sitemap, which is why git comes first.
//  * No <changefreq> and no <priority>. Google has said for years that it
//    ignores both. Emitting them is noise that invites someone to "tune" them.
//  * Idempotent: running it twice produces a byte-identical file.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://pdfloveme.com";

const EXCLUDE_DIRS = new Set([
  ".git", ".github", "node_modules", "docs",
  "scripts",  // this generator and its siblings
  "vendor",   // third-party libraries and fonts
  "css", "js", "assets",
]);

// A page is skipped if it is the 404 page, carries a noindex robots meta, or
// is a zero-delay redirect stub pointing somewhere else.
const isNoindex = (html) =>
  /<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
const isRedirectStub = (html) =>
  /<meta\s+http-equiv=["']refresh["'][^>]*content=["']0\s*;\s*url=/i.test(html) &&
  /<link\s+rel=["']canonical["']/i.test(html);
const canonicalOf = (html) => {
  const m = html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : null;
};

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

// Last commit that touched this file. Empty string when the file is untracked
// or the repo has no history — the caller then falls back to mtime.
async function gitLastmod(file) {
  try {
    const { stdout } = await run(
      "git", ["log", "-1", "--format=%cI", "--", path.relative(ROOT, file)],
      { cwd: ROOT },
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

// W3C datetime, second precision, no sub-second noise.
const w3c = (iso) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

const files = (await walk(ROOT)).sort();
const entries = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (path.basename(file) === "404.html") continue;

  const html = await fs.readFile(file, "utf8");
  if (isNoindex(html) || isRedirectStub(html)) continue;

  const loc = canonicalOf(html) ?? `${SITE}/${rel.split(path.sep).join("/")}`;

  let stamp = await gitLastmod(file);
  if (!stamp) stamp = (await fs.stat(file)).mtime.toISOString();

  entries.push({ loc, lastmod: w3c(stamp) });
}

entries.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  entries
    .map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod></url>`)
    .join("\n") +
  "\n</urlset>\n";

await fs.writeFile(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`sitemap.xml — ${entries.length} URLs, every one with a lastmod`);
