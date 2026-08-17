# pdfloveme.com — unresolved / judgement calls

Companion to `_site_audit.md`. Anything here is a decision worth a second look,
not a finished job.

## Scoping calls made without asking

- **URL form left as flat `.html`.** The brief allowed either directory-style or
  `.html` as long as it is consistent, and warned against moving already-indexed
  pages. Every page here is already `.html`, self-canonical and consistent, so
  nothing was moved. This is the opposite of the sibling site (todays-tasks.com),
  where the app pages had a genuine `/apps/` 404 to repair.
- **`www` vs apex:** apex, matching `CNAME`. All 32 canonicals use it.
- **No 404 page exists** on this site. GitHub Pages serves its default. Worth
  adding a real `404.html` with `noindex,follow` at some point; out of scope here.
- **Google Fonts stylesheet kept on CDN.** C4 was about functional dependencies —
  a dead CDN must not break a tool. A missing webfont only changes typography, so
  the two remaining `fonts.googleapis.com` links stayed. All JavaScript is now
  local. Say the word and the fonts can be self-hosted too.

## The privacy sentence, corrected mid-build

The tool page first claimed the code contains "no `fetch`". That became false the
moment the Chinese font loader was written. Rather than delete the loader or
leave a comfortable half-truth, the copy now names the single request — a
same-origin `GET` for the font, no body, no document data — and says so twice, in
the banner and in the privacy section. Re-grep after any change to `js/fill-form.js`.

## Known limits of the fill tool

- **Only text fields are fillable.** Checkboxes, radio groups and dropdowns are
  listed but marked not editable. Adding them is straightforward and was left out
  rather than half-done.
- **Overlay text is single-line.** A box holds one run of text; long values need
  several boxes. No wrapping, no rich text.
- **Font subset is Big5 + GB2312 Level 1 (6,888 glyphs).** That covers ordinary
  names and addresses. Rare characters — some Hong Kong personal-name characters
  in particular — fall outside it and will not render. The fix is a larger subset
  at the cost of file size; 1.9 MB was judged the right trade.
- **Visual signature only.** Not a certificate-based digital signature, and the
  page says so plainly.
- **Encrypted PDFs** load with `ignoreEncryption`, which works for permission-only
  protection but not for a file that needs an open password. Unlock it first.

## Testing gap

`scripts/pdf-tests/` exercises the *core* — the same `js/fill-pdf-core.js` the
browser loads — against three real documents, and that is where all the PDF
correctness lives. What is **not** automated is the browser UI itself: the
click-to-place, drag, page navigation and signature pad were written against the
existing `sign.html` patterns and reasoned through, but not driven by a headless
browser. A Playwright pass over `pages/fill-form.html` is the obvious next step.

## Sitemap generator

New: `scripts/build-sitemaps.mjs`. It takes each page's own `<link rel="canonical">`
as the sitemap URL, so the two can never drift. It skips `noindex` pages and
redirect stubs. There is **no GitHub Action** on this repo, so it must be run by
hand before pushing — unlike the sibling site, which has one. Adding the same
workflow here would be a sensible follow-up.
