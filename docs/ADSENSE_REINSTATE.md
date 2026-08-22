# Putting AdSense back

Ad code was removed in August 2026. AdSense had not approved the site, so
every unit on the page was a fake `AD · 728×90` box sitting above the H1,
and every real AdSense tag was commented out with the placeholder
publisher id `ca-pub-XXXXXXXXXXXXXXXX`.

This file is the instruction sheet for undoing that, and nothing here
needs to be reconstructed from memory or from git history.

## What was removed

| What | Where it was | Count |
|---|---|---|
| Commented `adsbygoogle.js` loader in `<head>` | `index.html`, all 15 tool pages | 16 |
| Commented `<ins class="adsbygoogle">` unit | `index.html` | 2 |
| Commented `adsbygoogle.push({})` init script | `index.html` | 1 |
| Visible fake placeholder box (`.ad-slot`, `.ad-inline`) | 25 pages | 28 |
| Placeholder seller line | `ads.txt` | 1 |

## What was left in place on purpose

- **`<!-- AD_SLOT: name -->` comments** mark all 28 former positions, one
  per slot, named `home-leaderboard`, `home-rectangle`,
  `<tool>-leaderboard`, `<post>-inline-rectangle`. Nothing was removed
  without leaving its marker.
- **The `.ad-slot` / `.ad-banner` / `.ad-rect` / `.ad-label` /
  `.ad-placeholder` / `.ad-inline` CSS** in `css/style.css` (lines ~142-158,
  ~324, ~382). Roughly 700 bytes, kept so reinstating is a markup-only
  change.

## To reinstate

1. Get the real publisher id from AdSense. It looks like `ca-pub-` plus
   16 digits. Do not commit anything until you have the actual id.
2. Add the loader to `<head>` on every page that should carry an ad:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-REAL_ID" crossorigin="anonymous"></script>
   ```
3. Replace each `<!-- AD_SLOT: name -->` you want to fill with a real
   unit, using the slot id AdSense generates for that placement:
   ```html
   <ins class="adsbygoogle" style="display:block"
        data-ad-client="ca-pub-REAL_ID" data-ad-slot="REAL_SLOT_ID"
        data-ad-format="auto" data-full-width-responsive="true"></ins>
   <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
   ```
4. Replace `ads.txt` entirely with the line AdSense gives you.

## Two things worth deciding before step 3

- **The old leaderboard sat above the H1 on every tool page.** That is
  the worst place for it: it delays the largest contentful paint and puts
  an advert between the user and the thing they came for. Below the tool,
  or between the tool and the article body, costs less.
- **Do not restore all 28 at once.** The site's entire pitch is that
  files never leave the browser. Heavy advertising undercuts that claim
  to a reader who is on the page precisely because they are cautious.
