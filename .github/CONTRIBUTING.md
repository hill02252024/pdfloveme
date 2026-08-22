# Contributing

## The one rule

No tool may send file content anywhere. Not to an API, not to analytics, not
to a logger. If a change makes a network request while a user's document is
in memory, it does not go in, however useful it is.

That is the site's entire claim, and a single exception makes the rest of the
copy a lie.

## Before opening a pull request

```
cd scripts/pdf-tests
node tools-smoke.test.mjs           # all 16 tools must pass
node tools-smoke.test.mjs --break   # and all 16 must fail under the control
```

Run the control too. A suite that has quietly stopped being able to fail is
worse than no suite, because it reports success either way.

## House style

- **No build step and no npm dependency at runtime.** Libraries are vendored
  under `vendor/` with the version in the filename. Adding a dependency means
  committing the file, not adding a `<script src="https://cdn...">`.
- **One page, one file.** Tool pages carry their own markup, their own inline
  script and their own schema. The duplication is deliberate: a page can be
  read and fixed on its own.
- **Do not change a URL.** Renaming a page loses its search history, and
  nothing about a rename is worth that. Add a page instead.
- **Do not hand-edit `sitemap.xml`.** Run `node scripts/build-sitemap.mjs`.
- **Claims must be checkable.** If copy says a file is never uploaded, the
  code must contain no path that uploads it. Say "no server ever receives
  your file", not "bank-level security", which means nothing.

## Adding a tool

1. Copy the closest existing page — the shared plumbing lives in `js/app.js`.
2. Give it a `<link rel="canonical">`, a `SoftwareApplication` and a
   `BreadcrumbList` block, and a visible breadcrumb whose text matches the
   schema exactly.
3. Add it to the Related tools block on two or three neighbouring pages.
   A page nothing links to is a page Google drops.
4. Add a case to `tools-smoke.test.mjs`.
5. Regenerate the sitemap after committing.
