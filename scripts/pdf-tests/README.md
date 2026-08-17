# fill-pdf core tests

Verifies `js/fill-pdf-core.js` — the same file the browser loads — against three
real documents: an AcroForm, a flat "scanned" page, and a three-page Chinese form.

```
npm i pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 pdfjs-dist@3.11.174
node make-fixtures.mjs   # regenerate fixtures/
node run-tests.mjs
```

Each case checks that the output re-parses, that the values written are actually
present, and that the original text is byte-identical before and after. A negative
control asserts an unfilled file does *not* contain the test values, so the checks
cannot pass vacuously.
