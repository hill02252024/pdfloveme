## What changed

<!-- One or two sentences. What is different for someone using the site? -->

## Checks

- [ ] `node scripts/pdf-tests/tools-smoke.test.mjs` — 16 pass
- [ ] `node scripts/pdf-tests/tools-smoke.test.mjs --break` — 16 fail
- [ ] No new network request happens while a document is in memory
- [ ] No existing URL was renamed, moved or deleted
- [ ] `node scripts/build-sitemap.mjs` re-run if a page was added or removed

## Anything you were unsure about

<!-- Better here than discovered later. -->
