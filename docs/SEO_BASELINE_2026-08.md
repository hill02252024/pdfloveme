# pdfloveme.com — before and after, August 2026

Snapshot taken at commit `a250fb4`, against `5a0ba92` (21 June 2026), the
last commit before this round of work. Every number below was measured, not
estimated; the command that produced it is named next to it.

Nothing here is a search-performance claim. Rankings and impressions are not
in this repository, and the effect of these changes will not be visible in
Search Console for weeks. This records the state of the site, so that when
the numbers do move there is something to compare against.

---

## Crawl signals

| | Before | After |
|---|---|---|
| Pages | 32 | 33 |
| URLs in `sitemap.xml` | 32 | 33 |
| Sitemap entries with `lastmod` | 1 | 33 |
| `changefreq` / `priority` entries | 0 / 0 | 0 / 0 |
| Sitemap generated from source | no — hand-maintained | yes, `scripts/build-sitemap.mjs` |

One `lastmod` across 32 URLs told Google nothing about which pages had
changed. Each date now comes from that file's last commit, so a page that
did not change does not claim it did.

## Titles, descriptions, headings

| | Before | After |
|---|---|---|
| Titles in the 50–60 character window | 6 / 32 | 33 / 33 |
| Shortest title | 16 chars | 50 chars |
| Longest title | 59 chars | 60 chars |
| Descriptions 120–160 chars | 32 / 32 | 33 / 33 |
| Missing descriptions | 0 | 0 |

Fifteen of the sixteen tool pages had titles of the form `Merge PDF —
PDFLoveMe`: thirteen were under 30 characters and none carried an intent
modifier. Against a query like *merge pdf*, that competes head-on with
iLovePDF and Smallpdf on a brand token that is itself a near-match for
"ilovepdf". Every title now leads with the privacy long-tail
(*Merge PDF Without Uploading a Single File*).

## Structured data

| | Before | After |
|---|---|---|
| JSON-LD blocks | 72 | 88 |
| `BreadcrumbList` | 16 pages | 32 pages |
| `SoftwareApplication` on tool pages | 0 | 16 |
| `WebApplication` | 17 | 1 (site level, on the home page) |
| `FAQPage` | 26 | 26 — unchanged by design |
| FAQ answers whose schema text differs from the visible text | 5 | 0 |
| Blocks failing JSON parse | 0 | 0 |
| Invented `aggregateRating` | 0 | 0 |
| Pages where schema breadcrumb names disagree with the visible trail | 10 | 0 |

`FAQPage` was deliberately not added anywhere new: Google retired FAQ rich
results on 7 May 2026, so new blocks would earn nothing. The five existing
mismatches were fixed because an answer that is not visible on the page is a
policy violation whether or not it is ever rendered.

Tool pages carried both a `WebApplication` (`BusinessApplication`) and, after
this round, a `SoftwareApplication` (`UtilitiesApplication`) block describing
the same URL. Two contradicting entities are worse than either alone, so the
older one was removed.

## Internal linking

| | Before | After |
|---|---|---|
| Orphan pages | 0 | 0 |
| Pages with in-degree < 2 | 5 | 0 |
| Average outbound internal links | 8.6 | 10.7 |
| Average on tool pages | 7.1 | 10.0 |
| Dead internal links | 0 | 0 |
| Generic anchors ("click here", "read more") | 0 | 0 |
| Maximum click depth from the home page | 2 | 2 |

The tool pages had no sideways links at all: their entire outbound set was
the global nav, so the link graph was a star with the home page at the
centre. Each now names three or four neighbouring tools and the article that
covers the same job.

## Advertising

| | Before | After |
|---|---|---|
| Visible fake ad boxes | 28 across 25 pages | 0 |
| Commented-out AdSense tags with a placeholder publisher id | 18 | 0 |
| `ads.txt` seller lines | 1 (fake publisher id) | 0 |
| `<!-- AD_SLOT: … -->` position markers | 0 | 28 |

AdSense had not approved the site. Every unit was a grey `AD · 728×90`
placeholder, and on tool pages it sat above the H1.

## Page weight and blocking

Headless Chrome over loopback, cache disabled, 1280×900. Loopback removes
network latency, so treat the millisecond figures as a like-for-like
comparison of this repository against itself, not as field data.

| Page | Blocking scripts | Requests | Font KB | DOMContentLoaded |
|---|---|---|---|---|
| `/` | 1 → **0** | 8 → 7 | 70 → 69 | 2087 → **26 ms** |
| `/pages/merge.html` | 2 → **0** | 8 → 7 | 69 → 69 | 314 → **46 ms** |
| `/pages/fill-form.html` | 6 → **0** | 12 → 11 | 69 → 69 | 377 → **103 ms** |
| `/pages/pdf-to-jpg.html` | 3 → **0** | 9 → 8 | 69 → 69 | 341 → **63 ms** |
| `/pages/encrypt.html` | 2 → **0** | 8 → 7 | 69 → 69 | 540 → **48 ms** |
| `/blog/why-pdfs-break-at-worst-time.html` | 1 → **0** | 8 → 7 | 69 → 69 | 801 → **21 ms** |

Total transferred bytes are essentially unchanged (`/pages/merge.html`
650 → 652 KB). Nothing was deleted from the payload; what changed is that
none of it blocks the first paint any more.

## Third-party requests

| | Before | After |
|---|---|---|
| External origins contacted on page load | 2 (`fonts.googleapis.com`, `fonts.gstatic.com`) | 0 |
| Render-blocking cross-origin stylesheets | 1 | 0 |
| Outbound links to third-party domains in page copy | 1 (`google.com/settings/ads`) | 0 |

Fonts are served from `vendor/fonts/web` as two variable files. Six static
weights would have cost 207 KB for the same coverage.

## Test coverage

| | Before | After |
|---|---|---|
| Tools with an automated end-to-end test | 1 of 16 (fill-form) | 16 of 16 |
| Suites with a working negative control | 5 | 6 |
| npm packages needed to run the tool suite | 5 | 0 |

## Claims checked against code

Three statements on the live site were false when this round started. All
three are recorded in `SEO_FIX_2026-08.md` with the file and line that
disproved them: a paid Pro tier that cannot be bought, an upgrade prompt in
the file-size error, and a terms page describing paid plans. Two more became
false partway through and were fixed in the same commit that broke them:
the Google Fonts "one exception" and the privacy policy's account of AdSense
cookies and analytics.

## How to reproduce any of this

```
node scripts/build-sitemap.mjs                     # sitemap, idempotent
node scripts/pdf-tests/tools-smoke.test.mjs        # 16 tools
node scripts/pdf-tests/tools-smoke.test.mjs --break  # and the control
```

Structured-data, title-length, link-graph and page-weight figures came from
throwaway scripts run against the working tree and against
`git show 5a0ba92:<file>`. They are reported here rather than committed:
a checker kept in the repository but never run is worse than none, because
it looks like coverage.
