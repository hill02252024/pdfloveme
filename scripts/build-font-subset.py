#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the CJK font the fill-pdf tool embeds, and the deliberately broken
fonts its tests use as controls.

    python3 scripts/build-font-subset.py path/to/NotoSansTC[VF].ttf
    python3 scripts/build-font-subset.py --tier1   # 只重建第一層，唔使原始字型

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
OUT_TIER1 = os.path.join(REPO, "vendor", "fonts", "NotoSansTC-Big5L1-subset.ttf")
OUT_COVERAGE = os.path.join(REPO, "vendor", "fonts", "NotoSansTC-Big5L1-subset.coverage.txt")
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


# Hong Kong characters that Big5 Level 1 does not carry.
#
# Level 1 is 常用字 as the standard defined it in Taiwan in 1984. It is a good
# base and a bad stopping point for this site: it cannot write 深水埗, 紅磡,
# 鰂魚涌, 鴨脷洲 or 屋邨, and it has almost none of written Cantonese, which is
# what people put in a form's notes field.
#
# The alternative considered and rejected was a rule rather than a list —
# Big5 Level 1 plus every HKSCS addition. That is defensible on paper and
# wrong here: it comes to 2.74 MB, and it still misses 磡, 冇, 睇 and 諗,
# because those are Big5 Level 2 rather than HKSCS. A list that names what
# is needed beats a rule that misses it.
#
# Four groups, all intersected with the font before use, so a character the
# font does not have is dropped rather than failing the build.

HK_PLACES = (
    "中西區灣仔東南油尖旺深水埗九龍城黃大仙觀塘葵青荃灣屯門元朗北大埔沙田西貢離島"
    "銅鑼灣鰂魚涌太古柴灣筲箕灣香港仔鴨脷洲薄扶林堅尼地城石塘咀西環上環中環金鐘"
    "紅磡土瓜灣何文田旺角佐敦尖沙咀油麻地長沙灣荔枝角美孚石硤尾樂富慈雲山黃埔"
    "藍田秀茂坪牛頭角彩虹九龍灣鑽石山新蒲崗啟德將軍澳寶琳坑口調景嶺"
    "馬鞍山大圍火炭水泉澳上水粉嶺天水圍兆康朗屏錦田八鄉塱原打鼓嶺沙頭角"
    "東涌梅窩坪洲長洲南丫愉景灣青衣荔景葵芳葵興大窩口深井青龍頭馬灣欣澳"
    "氹仔"
)

# The words an address is built out of, and the characters estate and block
# names are made of. Most are already in Level 1; the intersection sorts it.
HK_ADDRESS = (
    "室座樓層號邨苑閣軒臺台徑道街里巷圍村屋舍房廈園庭居坊路段新界九龍香港大廈"
    "中心廣場花園商場地舖鋪期棟幢單位平台地下閣樓天台露台車位"
    "慈樂澤安康泰華榮富順興盛寶祥昌美麗翠碧恒恆悅逸雅頌頤怡欣豪峰景苑晴曉"
)

# Written Cantonese. A notes field in Hong Kong is not written in Standard
# Written Chinese, and a form filler that turns 唔記得攞 into boxes is not
# finished.
HK_CANTONESE = (
    "嘅咗喺冇佢哋乜嘢睇諗攞唔係咁嗰呢啲嚟咩嘛咪啦喎囉嘥掂搞掟揸拎郁曬慳靚"
    "冧氹揼冚嘈嬲孭攰嗌喐嘟嗒嚡嚫嗲嚿呃咦哦噏嚇嘞邊咋咯喇嗱嘩哇噃唓吓咇啱"
    "撳摷啖睩嗍掹攋抦揦搲焫韞淰嘜唥廿卅乸嗦噉矇淨"
    "仔女佬妹哥姐婆公媽爸爹奶叔伯姨舅甥姪孫"
    "食飲瞓行企坐畀俾整乾淨鍾意"
)

# Surnames common in Hong Kong that Level 1 misses.
HK_SURNAMES = "鄧邱蕭馮曾詹嚴龔藍簡邵倪湯樑戴翁廖賴聶鄺麥岑譚黎謝葉盧蔡余潘杜"


def hk_supplement():
    """Every code point in the four groups above, de-duplicated."""
    joined = HK_PLACES + HK_ADDRESS + HK_CANTONESE + HK_SURNAMES
    return {ord(ch) for ch in joined if not ch.isspace()}


def big5_level1():
    """
    Big5 Level 1 — the 5,401 characters the standard calls 常用字.

    A range walk, not a hand-written list: lead bytes 0xA4-0xC6, trailing
    0x40-0x7E and 0xA1-0xFE, stopping at 0xC67E where Level 1 ends and
    Level 2 (次常用字) begins.
    """
    found = set()
    trail = list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF))
    for hi in range(0xA4, 0xC7):
        for lo in trail:
            if hi == 0xC6 and lo > 0x7E:
                continue
            try:
                found.add(ord(bytes([hi, lo]).decode("big5hkscs")))
            except Exception:
                continue
    return found


def build_tier1(source_font=None):
    """
    The first-tier font: Big5 Level 1 plus Latin and CJK punctuation.

    Built from the shipped HKSCS subset rather than from the original Noto,
    because Tier 1 is a strict subset of Tier 2 and this way the build needs
    nothing that is not already in the repository.

    WHY NOT SMALLER. The brief that prompted this asked for 400-600 KB.
    That is not reachable while keeping 常用字: glyf is 96% of the file, so
    600 KB across 5,401 CJK outlines is 111 bytes each, and Noto's average
    here is 333. The alternative — a tier of roughly 1,800 frequent
    characters — was rejected because a Tier 1 that misses a common surname
    is worse than no tiering at all: the user then downloads Tier 1 AND
    Tier 2, 7.4 MB instead of 5.6.

    WHY NOT THE BIG5 ∩ GB2312 INTERSECTION, which does fit in 677 KB: it
    excludes 陳, the most common surname in Hong Kong, because 陳 is not in
    GB2312. Same failure, sharper.
    """
    if source_font is None:
        source_font = OUT_FONT
    cmap = set(TTFont(source_font).getBestCmap().keys())
    wanted = (big5_level1() | hk_supplement()
              | set(range(0x20, 0x7F)) | set(PUNCTUATION))
    dropped = sorted(hk_supplement() - cmap)
    if dropped:
        print("  (not in the source font, skipped: %s)"
              % "".join(chr(c) for c in dropped))
    codepoints = sorted(wanted & cmap)
    subprocess.run(
        ["pyftsubset", source_font, "--unicodes-file=/dev/stdin",
         "--output-file=" + OUT_TIER1, "--layout-features=", "--no-hinting",
         "--desubroutinize", "--drop-tables+=DSIG"],
        input="\n".join("U+%04X" % c for c in codepoints), text=True, check=True)
    pad_glyphs(OUT_TIER1)
    write_tier1_coverage()
    print("%s  %d code points  %.2f MB"
          % (os.path.relpath(OUT_TIER1, REPO), len(codepoints),
             os.path.getsize(OUT_TIER1) / 1048576.0))


B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _b36(n):
    if n == 0:
        return "0"
    out = ""
    while n:
        out = B36[n % 36] + out
        n //= 36
    return out


def write_tier1_coverage():
    """
    A 9 KB list of what Tier 1 can draw, so the page can pick a tier BEFORE
    downloading either font.

    Without it, deciding means fetching Tier 1 and reading its cmap, and a
    reader whose address contains 邨 or 埗 then pays 1.8 MB for a font that
    cannot draw their address plus 5.6 MB for one that can — worse than the
    single 5.6 MB file this replaced. The list costs 9 KB, fetched on the
    first CJK keystroke, and only by people typing Chinese.

    Format: comma-separated runs of code points, each `startDelta` or
    `startDelta.length`, base 36, delta measured from the end of the run
    before. 3,677 runs cover 5,516 code points.

    The page re-checks against the font's real cmap once Tier 1 arrives, so
    a stale list costs one wrong fetch, not a wrong glyph.
    """
    cps = sorted(TTFont(OUT_TIER1).getBestCmap().keys())
    runs, start, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        runs.append((start, prev - start + 1))
        start = prev = c
    runs.append((start, prev - start + 1))

    parts, cursor = [], 0
    for st, ln in runs:
        parts.append(_b36(st - cursor) + ("" if ln == 1 else "." + _b36(ln)))
        cursor = st + ln
    encoded = ",".join(parts)
    with open(OUT_COVERAGE, "w") as fh:
        fh.write(encoded)

    # Decode what was just written and compare it against the font, using the
    # same rules the page uses. A list that disagrees with the font sends
    # readers to the wrong tier; the page recovers, but silently and at the
    # cost of 1.8 MB, so it is caught here where it is free.
    listed, cursor = set(), 0
    for part in encoded.split(","):
        head, _, tail = part.partition(".")
        delta = int(head, 36)
        length = int(tail, 36) if tail else 1
        begin = cursor + delta
        listed.update(range(begin, begin + length))
        cursor = begin + length
    if listed != set(cps):
        raise SystemExit("coverage list disagrees with the font: %d missing, %d extra"
                         % (len(set(cps) - listed), len(listed - set(cps))))
    print("%s  %d runs  %.1f KB"
          % (os.path.relpath(OUT_COVERAGE, REPO), len(runs),
             os.path.getsize(OUT_COVERAGE) / 1024.0))


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
    # --tier1 rebuilds only the first-tier font, and needs no argument: it
    # derives from the HKSCS subset already in the repository.
    if len(sys.argv) == 2 and sys.argv[1] == "--tier1":
        build_tier1()
    elif len(sys.argv) == 2:
        src = sys.argv[1]
        build_main(src)
        build_tier1(OUT_FONT)
        build_controls(src)
    else:
        raise SystemExit(__doc__)
