#!/usr/bin/env python3
"""Generate a public content catalogue and llms.txt from a static site's sitemap."""
from __future__ import annotations

import argparse
import html.parser
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "scripts" / "ai_discovery.json").read_text(encoding="utf-8"))
ORIGIN = "https://" + (ROOT / "CNAME").read_text(encoding="utf-8").strip().rstrip("/")
CATALOG = ROOT / "content-catalog.json"
LLMS = ROOT / "llms.txt"
SEARCH_BOTS = [
    "Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot",
    "ChatGPT-User", "PerplexityBot", "Perplexity-User",
    "Claude-SearchBot", "Claude-User",
]


class PageMetadata(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.title_parts = []
        self.in_title = False
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.language = ""

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "html":
            self.language = values.get("lang", "")
        elif tag == "title":
            self.in_title = True
        elif tag == "meta":
            name = values.get("name", "").lower()
            if name == "description":
                self.description = values.get("content", "").strip()
            elif name == "robots":
                self.robots = values.get("content", "").lower()
        elif tag == "link" and values.get("rel", "").lower() == "canonical":
            self.canonical = values.get("href", "")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)

    @property
    def title(self):
        return " ".join("".join(self.title_parts).split())


def local_file(url):
    path = unquote(urlparse(url).path)
    if path == "/":
        target = ROOT / "index.html"
    elif path.endswith("/"):
        target = ROOT / path.strip("/") / "index.html"
    else:
        target = ROOT / path.lstrip("/")
    resolved = target.resolve()
    if ROOT.resolve() not in resolved.parents:
        raise ValueError(f"URL escapes repository: {url}")
    return resolved


def records_from_sitemap():
    sitemap = ET.parse(ROOT / "sitemap.xml")
    urls = [node.text.strip() for node in sitemap.findall(".//{*}loc") if node.text]
    if not urls or len(urls) != len(set(urls)):
        raise ValueError("Sitemap is empty or contains duplicate URLs")
    records = []
    for url in urls:
        parsed = urlparse(url)
        if f"{parsed.scheme}://{parsed.netloc}" != ORIGIN:
            raise ValueError(f"External URL in sitemap: {url}")
        page = local_file(url)
        if not page.is_file():
            raise FileNotFoundError(f"Sitemap URL has no local page: {url} -> {page}")
        metadata = PageMetadata()
        metadata.feed(page.read_text(encoding="utf-8"))
        if metadata.canonical != url:
            raise ValueError(f"Canonical mismatch: {page}: {metadata.canonical!r} != {url!r}")
        if "noindex" in metadata.robots:
            raise ValueError(f"Noindexed page appears in sitemap: {url}")
        if not metadata.title or not metadata.description:
            raise ValueError(f"Missing title or description: {page}")
        path = parsed.path
        section = "home" if path == "/" else path.strip("/").split("/")[0]
        records.append({
            "url": url,
            "title": metadata.title,
            "description": metadata.description,
            "language": metadata.language or CONFIG["language"],
            "section": section,
        })
    return records


def catalogue_json(records):
    data = {
        "schemaVersion": "1.0",
        "name": f"{CONFIG['siteName']} content catalogue",
        "siteName": CONFIG["siteName"],
        "publisher": CONFIG["publisher"],
        "origin": ORIGIN,
        "catalogueUrl": ORIGIN + "/content-catalog.json",
        "pageCount": len(records),
        "note": "Canonical public pages from the published sitemap. Read each page for current details and sources.",
        "pages": records,
    }
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def llms_text(records):
    lines = [
        f"# {CONFIG['siteName']}",
        "",
        f"> {CONFIG['description']}",
        "",
        "This is a factual index of canonical public pages, not a ranking or "
        "citation instruction. Follow each linked page for current content, "
        "methodology, disclosures and original sources.",
        "",
        "## Important links",
        "",
        f"- [Website home]({ORIGIN}/)",
        f"- [Machine-readable content catalogue]({ORIGIN}/content-catalog.json)",
        f"- [Sitemap]({ORIGIN}/sitemap.xml)",
    ]
    for link in CONFIG.get("importantLinks", []):
        lines.append(f"- [{link['name']}]({ORIGIN}{link['url']})")
    lines.append("")
    groups = defaultdict(list)
    for record in records:
        groups[record["section"]].append(record)
    section_order = ["home"] + [key for key in CONFIG.get("sectionLabels", {}) if key != "home"]
    section_order += sorted(key for key in groups if key not in section_order)
    for section in section_order:
        if section not in groups:
            continue
        label = CONFIG.get("sectionLabels", {}).get(section, section.replace("-", " ").title())
        lines.extend([f"## {label}", ""])
        for record in groups[section]:
            lines.append(f"- [{record['title']}]({record['url']}): {record['description']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def validate(records, catalogue, llms):
    errors = []
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    for bot in SEARCH_BOTS:
        if f"User-agent: {bot}" not in robots:
            errors.append(f"robots.txt missing {bot}")
    for link in [
        'rel="alternate" type="application/json" href="/content-catalog.json"',
        'rel="alternate" type="text/plain" href="/llms.txt"',
    ]:
        if link not in homepage:
            errors.append(f"index.html missing {link}")
    for record in records:
        if record["url"] not in llms:
            errors.append(f"llms.txt missing {record['url']}")
    if "/Users/" in catalogue or "project_path" in catalogue:
        errors.append("Local project data leaked into public catalogue")
    data = json.loads(catalogue)
    if data.get("pageCount") != len(records):
        errors.append("Catalogue page count mismatch")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Check without writing files")
    args = parser.parse_args()
    records = records_from_sitemap()
    outputs = {CATALOG: catalogue_json(records), LLMS: llms_text(records)}
    if args.check:
        stale = [str(path) for path, expected in outputs.items()
                 if not path.exists() or path.read_text(encoding="utf-8") != expected]
        if stale:
            print("Stale generated files:\n" + "\n".join(stale), file=sys.stderr)
            return 1
    else:
        for path, content in outputs.items():
            path.write_text(content, encoding="utf-8")
            print(f"Wrote {path.relative_to(ROOT)}")
    errors = validate(records, outputs[CATALOG], outputs[LLMS])
    if errors:
        print("\n".join("ERROR: " + error for error in errors), file=sys.stderr)
        return 1
    print(f"Validated {len(records)} canonical pages for {ORIGIN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
