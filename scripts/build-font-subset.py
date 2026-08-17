#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the CJK font the fill-pdf tool embeds, and the deliberately broken
fonts its tests use as controls.

    python3 scripts/build-font-subset.py path/to/NotoSansTC[VF].ttf

Nothing on the site runs this. It exists so the two non-obvious properties
of the shipped font are reproducible rather than accidental:

1. COVERAGE — Big5-HKSCS plus GB2312.

   HKSCS is the Hong Kong government's supplementary character set, and it
   is not optional for a form filler used here. The previous subset was
   Big5 Level 1 plus GB2312 Level 1, which cannot write 深水埗, 紅磡,
   鰂魚涌, 鴨脷洲 or any 邨 — four of those are district or estate names
   that appear on ordinary address forms. Four of the seven characters the
   audit found missing are not in Big5 at all; only HKSCS has them.

2. GLYPH PADDING — every glyph's record must be an even number of bytes.

   @pdf-lib/fontkit 1.1.1 subsets a font by copying raw glyph records and
   then, if the total fits in 16 bits, writing a short `loca` table with
   `offsets[i] >>>= 1`. That shift is unconditional: one odd-length glyph
   and every offset after it is wrong by half a byte, so the glyph data is
   misaligned and the reader draws nothing at all.

   fontTools writes glyf with padding=1 by default, which left 2,952 of
   5,932 glyphs at an odd length. The result was a tool that produced
   Chinese PDFs which extract perfectly and render completely blank.
   Setting padding to 4 makes every offset even and the shift lossless.

   scripts/pdf-tests/font-coverage.test.mjs asserts both properties, so a
   font rebuilt without them fails the suite rather than shipping.
"""
import os
import subprocess
import sys

from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT_FONT = os.path.join(REPO, "vendor", "fonts", "NotoSansTC-HKSCS-subset.ttf")
FIXTURES = os.path.join(HERE, "pdf-tests", "fixtures")

PUNCTUATION = [
    0x3000, 0x3001, 0x3002, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F, 0xFF01,
    0x201C, 0x201D, 0x2018, 0x2019, 0xFF08, 0xFF09, 0x300A, 0x300B,
    0x2014, 0x2026, 0xFFE5, 0x00B7,
]


def encodable(codec):
    """Every BMP code point the given legacy codec can represent."""
    found = set()
    for cp in range(0x20, 0x10000):
        try:
            chr(cp).encode(codec)
        except Exception:
            continue
        found.add(cp)
    return found


def target_codepoints(source_font):
    cmap = set(TTFont(source_font).getBestCmap().keys())
    wanted = encodable("big5hkscs") | encodable("gb2312")
    return sorted((wanted & cmap) | set(range(0x20, 0x7F)) | set(PUNCTUATION))


def pad_glyphs(path):
    """Rewrite glyf with 4-byte padding so no glyph record is odd-length."""
    font = TTFont(path)
    font["glyf"].padding = 4
    font.save(path)
    check = TTFont(path)
    loca = check["loca"]
    odd = sum(1 for i in range(check["maxp"].numGlyphs) if (loca[i + 1] - loca[i]) % 2)
    if odd:
        raise SystemExit("padding failed: %d glyphs still odd-length" % odd)


def build_main(source_font):
    codepoints = target_codepoints(source_font)
    subprocess.run(
        ["pyftsubset", source_font, "--unicodes-file=/dev/stdin",
         "--output-file=" + OUT_FONT, "--layout-features=", "--no-hinting",
         "--desubroutinize", "--drop-tables+=DSIG"],
        input="\n".join("U+%04X" % c for c in codepoints), text=True, check=True)
    pad_glyphs(OUT_FONT)
    print("%s  %d code points  %.2f MB"
          % (os.path.relpath(OUT_FONT, REPO), len(codepoints),
             os.path.getsize(OUT_FONT) / 1048576.0))


def build_controls(source_font):
    """
    Three Latin-only fonts used as negative controls by render.test.mjs.
    Each has the same cmap — ASCII only — so any Chinese character falls
    through to .notdef, and each draws a different kind of nothing.
    """
    latin = os.path.join(FIXTURES, "tofu-xbox.ttf")
    subprocess.run(
        ["pyftsubset", source_font, "--unicodes-file=/dev/stdin",
         "--output-file=" + latin, "--layout-features=", "--no-hinting",
         "--notdef-outline", "--drop-tables+=DSIG"],
        input="\n".join("U+%04X" % c for c in range(0x20, 0x7F)), text=True, check=True)
    pad_glyphs(latin)

    # A hollow rectangle: the textbook tofu, and the case the edge-versus-
    # interior density check is aimed at.
    hollow = TTFont(latin)
    pen = TTGlyphPen(None)
    pen.moveTo((100, -120)); pen.lineTo((900, -120))
    pen.lineTo((900, 880)); pen.lineTo((100, 880)); pen.closePath()
    pen.moveTo((160, -60)); pen.lineTo((160, 820))
    pen.lineTo((840, 820)); pen.lineTo((840, -60)); pen.closePath()
    glyph = pen.glyph()
    hollow["glyf"][".notdef"] = glyph
    glyph.recalcBounds(hollow["glyf"])
    hollow["glyf"].padding = 4
    hollow.save(os.path.join(FIXTURES, "tofu-hollow.ttf"))

    # An empty .notdef: what pyftsubset produces by default, and what a
    # missing character therefore looks like in practice — nothing at all.
    empty = TTFont(latin)
    blank = TTGlyphPen(None).glyph()
    empty["glyf"][".notdef"] = blank
    blank.recalcBounds(empty["glyf"])
    empty["glyf"].padding = 4
    empty.save(os.path.join(FIXTURES, "tofu-empty.ttf"))

    # An otherwise sound CJK font written with fontTools' default padding of
    # 1, so roughly half its glyph records are odd-length. This is the shape
    # the shipped font used to have, and embedding it reproduces the original
    # symptom exactly: correct text, blank page. font-coverage.test.mjs uses
    # it as the control proving the padding assertion is not vacuous.
    #
    # It has to be big enough to need a long `loca`. Below about 64 KB of
    # glyf, pyftsubset writes the short form, which stores offsets halved and
    # therefore pads every record to an even length for free — a small control
    # would quietly pass the check it exists to fail. 600 ideographs is over
    # the line with room to spare.
    unpadded_path = os.path.join(FIXTURES, "unpadded-glyphs.ttf")
    cmap = sorted(TTFont(source_font).getBestCmap().keys())
    ideographs = [c for c in cmap if 0x4E00 <= c <= 0x9FFF][:600]
    hk = [ord(c) for c in "陳大文香港九龍深水埗紅磡鰂魚涌鴨脷洲彩虹邨"]
    sample = sorted(set(list(range(0x20, 0x7F)) + ideographs + [c for c in hk if c in cmap]))
    subprocess.run(
        ["pyftsubset", source_font, "--unicodes-file=/dev/stdin",
         "--output-file=" + unpadded_path, "--layout-features=", "--no-hinting",
         "--drop-tables+=DSIG"],
        input="\n".join("U+%04X" % c for c in sample), text=True, check=True)
    control = TTFont(unpadded_path)
    loca = control["loca"]
    odd = sum(1 for i in range(control["maxp"].numGlyphs) if (loca[i + 1] - loca[i]) % 2)
    if not odd:
        raise SystemExit("the unpadded control came out fully even — it would control nothing")
    print("  (control: %d/%d odd-length glyphs, loca format %d)"
          % (odd, control["maxp"].numGlyphs, control["head"].indexToLocFormat))

    for name in ("tofu-xbox.ttf", "tofu-hollow.ttf", "tofu-empty.ttf", "unpadded-glyphs.ttf"):
        p = os.path.join(FIXTURES, name)
        print("%s  %d bytes" % (os.path.relpath(p, REPO), os.path.getsize(p)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    build_main(src)
    build_controls(src)
