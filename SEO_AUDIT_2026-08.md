# pdfloveme.com — SEO 技術審計
**日期**：2026-08-23　**範圍**：`~/Desktop/GITHUB_PDF`（GitHub Pages，apex `pdfloveme.com`）
**方法**：所有 repo 內可驗證嘅結論一律讀檔／實測後先落判斷。每條標「✅ 已驗證（檔案:行號）」或「🔶 推測（附驗證方法）」。本次冇改任何檔案。

---

## 1. 執行摘要

> **「23 個 URL 蒸發」喺 repo 入面搵唔到任何技術成因 —— 最可能係 Google 主動把低價值 URL 由 Coverage 報表剔走，而唔係網站出咗事。決定性證據：由 2026-06-21 到 2026-08-17 呢 57 日，repo 一個 commit 都冇（`git log`），而聲稱嘅跌幅正正發生喺呢段期間；同時 sitemap 32 條 URL 全部有檔案、零 404、零 noindex、canonical 32/32 self-referencing、robots.txt 全開、www/http/github.io 三個變體全部 301 去 apex。真正令你冇工具意圖曝光嘅係另一件事：16 個工具頁入面 15 個嘅 `<title>` 係 `<Tool> PDF — PDFLoveMe` 呢個格式，冇一個帶「online / free / converter / no upload」呢類搜尋者實際會打嘅修飾詞，而品牌字串「PDFLoveMe」本身同 "ilovepdf" 高度近似 —— 所以 Google 只能用品牌近似字串去配對你，GSC 六個熱門查詢全部係 iLovePDF 誤打，完全符合呢個推論。**

### 一句話版本
索引冇「壞」，係「未被需要」：技術面乾淨到冇嘢可以修，問題喺標題同定位。

---

## 2. 問題清單（按對曝光嘅影響排序）

### 🔴 P1 — Critical：15/16 工具頁標題零意圖修飾詞

- **證據** ✅ 已驗證。`pages/merge.html:5` `<title>Merge PDF — PDFLoveMe</title>`；同格式見 `pages/split.html`、`rotate.html`、`compress.html`、`crop.html`、`sign.html`、`encrypt.html`、`jpg-to-pdf.html`、`pdf-to-jpg.html`、`delete-pages.html`、`organize.html`、`watermark.html`、`page-numbers.html`、`unlock.html`、`edit.html`。全站 32 個 title 入面 **13 個短過 30 字元**，最短 16 字元（`blog/index.html`「Blog — PDFLoveMe」）。唯一例外係 `pages/fill-form.html:6`「Fill a PDF Form Online — Free, No Upload」—— 亦係唯一一個帶 online / free / no upload 嘅頁。
- **點解係最高優先**：GSC 六個熱門查詢（pdflove、pdf love me、i love pdf to jpg、ilove pdf to jpg、ilovepdf pdf to image、convert pdf to jpg i love）**全部都係品牌近似字串**，冇一個係工具意圖詞。你嘅 title 有一半長度俾咗品牌 token 佔用，而嗰個 token 同 "ilovepdf" 撞得極近 —— Google 手上冇其他嘢可以用嚟配對你。
- **修復動作**：把 12 個工具頁 title 改成「主詞 + 意圖修飾 + 差異化」格式，品牌放最後或者索性唔放。例：
  - `Merge PDF — PDFLoveMe` → `Merge PDF Files Online — Free, No Upload Required`
  - `PDF to JPG — PDFLoveMe` → `PDF to JPG Converter — Convert in Your Browser, No Upload`
  - `Compress PDF — PDFLoveMe` → `Compress PDF Online — Reduce Size Without Uploading`
- **預估影響**：呢個係唯一一個可以令你由「零工具意圖曝光」變成「有曝光」嘅改動。平均排序 51.6 代表 Google 已經識得你、但排喺第 5 頁；標題對齊意圖通常係最快見效嘅單一槓桿。🔶 推測（驗證方法：改完等 2–4 週，睇 GSC「查詢」頁有冇非品牌詞出現）。

### 🔴 P2 — Critical：AdSense publisher ID 同 ads.txt 全部係佔位符

- **證據** ✅ 已驗證。`index.html:45` `client=ca-pub-XXXXXXXXXXXXXXXX`；`index.html:103`、`index.html:161` `data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"`；`pages/merge.html:23` 同款。全站 **18 處** `ca-pub-XXXXXXXXXXXXXXXX`，真 publisher ID（`ca-pub-` + 16 位數字）**0 處**。`ads.txt:1` = `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`。
- **影響**：`ads.txt` 語法上有效但 publisher ID 無效 → AdSense 會判定 ads.txt 錯誤、唔會投放。同時每頁都會向 `pagead2.googlesyndication.com` 發一個帶無效 client 嘅請求（純浪費 + 拖慢）。呢個唔直接影響索引，但係「網站未完成」嘅強烈訊號。
- **修復動作**：填入真 publisher ID，或者喺攞到之前把 AdSense script 同 `<ins>` 一併移走、`ads.txt` 刪走。
- **預估影響**：對曝光零直接影響；對收益係「而家收益必定係 0」。

### 🟠 P3 — High：`pages/fill-form.html` 有 5 條 FAQ schema 同可見文字唔一致

- **證據** ✅ 已驗證。全站 26 頁、121 條 FAQ 問答，**5 條不一致，全部喺 `pages/fill-form.html`**：
  - `Can I fill a scanned PDF that has no form fields?`（相似度 0.11）
  - `Does it support Chinese?`（0.13）—— schema（`fill-form.html:58`）寫「…HKSCS is the Hong Kong supplementary set, which is what makes 深水埗, 紅磡 and any 邨 writable. The font file is served from this site, not a third-party CDN.」，可見文字（`fill-form.html:221`）只寫「Yes, Traditional and Simplified. A Noto Sans TC subset is embedded…」
  - `Will the original text of my document be changed?`（0.33）
  - `Can anyone see my file?`（0.47）
  - `Does it work on a multi-page document?`（0.66）
- **影響**：Google FAQ 結構化資料政策要求答案必須喺頁面可見。唔一致有機會令整頁 rich result 失效，嚴重可致人手處分。
- **修復動作**：把 schema 嘅 `acceptedAnswer.text` 改成同可見 `<p>` 逐字一樣（或者相反），揀一邊做正本。
- **預估影響**：保住 26 頁嘅 FAQ rich result 資格。

### 🟠 P4 — High：sitemap 32 條入面 31 條冇 `lastmod`

- **證據** ✅ 已驗證。`sitemap.xml` 只有第一條 `<loc>https://pdfloveme.com/</loc>` 帶 `<lastmod>2026-08-17T05:06:57.408Z</lastmod>`，其餘 31 條**完全冇 lastmod**（`grep -c '<lastmod>' sitemap.xml` = 1）。`562833c` 嗰次改寫同時刪走咗全部 `changefreq` 同 `priority`。
- **影響**：Google 用 lastmod 決定重爬優先次序。31 條冇 lastmod 嘅 URL，Google 只能靠自己估幾時再爬 —— 對一個新站、低權重站，呢個直接壓低爬取需求，同你觀察到嘅「URL 由 Coverage 消失」高度吻合。
- **修復動作**：`scripts/build-sitemaps.mjs` 已經係唯一生成來源（`scripts/build-sitemaps.mjs:1-10` 註釋講明「walk the filesystem… take each page's own canonical」）。喺入面加返每個檔案嘅 mtime 做 lastmod，重跑。
- **預估影響**：提高重爬機率，令新改嘅標題更快被 Google 睇到。

### 🟡 P5 — Medium：品牌名同 iLovePDF 高度近似，構成商標同定位雙重風險

- **證據** ✅ 已驗證（查詢數據由你提供）。六個熱門查詢全部係 iLovePDF 變體。域名 `pdfloveme.com`（`CNAME:1`）、品牌 token「PDFLoveMe」出現喺全部 32 個 title。
- **商標風險評估** 🔶 推測（驗證方法：查 EUIPO／USPTO「ILOVEPDF」註冊狀態，同律師確認）：iLovePDF 係 Ilovepdf S.L.（西班牙）嘅產品，「PDFLoveMe」屬於同類服務下嘅近似標識，存在混淆可能性。但**你冇模仿佢嘅版面、logo、配色**（repo 內冇任何 iLovePDF 資產），亦冇喺文案聲稱有關聯 —— 呢個大幅降低惡意攀附嘅認定風險。
- **Doorway 風險**：✅ 已驗證**唔構成** doorway。工具頁兩兩內容重疊平均 **2.8%**（5-gram shingle Jaccard，120 對，**零對 >30%**），部落格 0.3%（45 對）。樣板句只佔每頁約 **6%**（44 個共通 5-gram / 每頁平均 758 個）。呢個係真內容，唔係換皮。
- **修復動作**：唔建議換域名（會蒸發現有 8 頁索引）。建議把品牌喺 title 嘅位置後撤，讓功能詞行先；同時用「檔案唔上傳」呢個真差異化點做定位主軸。

### 🟡 P6 — Medium：30 個 head `<script src>` 冇 defer/async

- **證據** ✅ 已驗證。全站 head 入面 `<script src>` 共 46 個，其中 **30 個冇 defer 亦冇 async**；例 `pages/merge.html:24` `<script src="../vendor/pdf-lib/pdf-lib-1.17.1.min.js">`、`pages/merge.html:25` `<script src="../js/app.js">`。`vendor/` 總體積 **8.9 MB**（`pdf-lib` 1.8 MB、`pdfjs` 1.3 MB、`fonts` 5.6 MB）。
- **影響**：阻塞渲染，直接拖 LCP。CWV 而家無資料（流量不足），但一有流量就會即刻反映。
- **修復動作**：`pdf-lib` / `pdfjs` 改成用戶揀檔之後先動態 `import()`；`app.js` 加 `defer`。
- **預估影響**：LCP 改善；對排名係間接槓桿。

### 🟢 P7 — Low：兩個法務頁冇 schema、一篇 blog meta description 過短

- **證據** ✅ 已驗證。`pages/privacy.html`、`pages/terms.html` 零 JSON-LD。`blog/why-your-pdf-form-wont-work-and-how-to-fix-it.html` 嘅 meta description 得 **42 字元**（「PDF form not working? Learn why fields won」—— 明顯被截斷），其餘 31 頁介乎 139–160。
- **修復動作**：補 `WebPage` schema；把嗰條 description 寫返完整（150–160 字元）。

### ✅ 查過確認冇問題嘅項目（逐個列出，因為呢啲先係「23 個 URL 蒸發」嘅常見嫌疑）

| 檢查 | 結果 | 證據 |
|---|---|---|
| sitemap URL vs 實際檔案 | **32/32 存在，0 個 404** | 逐條解析 `sitemap.xml` 對 `os.path.isfile` |
| repo 有檔但 sitemap 冇 | **0 個** | 反向比對，32 個 HTML 全覆蓋 |
| 曾被刪除嘅 `.html` | **0 個** | `git log --diff-filter=D --name-only -- '*.html'` 零輸出 |
| 曾被改名／移動嘅 `.html` | **0 個** | `git log --diff-filter=R --name-status -M` 零輸出 |
| robots.txt Disallow 誤封 | **冇** | `robots.txt` 全文得 3 行：`User-agent: *` / `Allow: /` / `Sitemap: https://pdfloveme.com/sitemap.xml` ✅ 正確 |
| noindex / nofollow meta | **0 頁** | 全站 `name="robots"` meta **0 個**（唯一命中喺 `scripts/build-sitemaps.mjs:29-30` 嘅偵測函式本身） |
| X-Robots-Tag 回應標頭 | **冇** | `curl -I https://pdfloveme.com/` 實測 |
| canonical | **32/32 self-referencing、全 https、全 apex** | 逐頁抽 `<link rel=canonical>` 比對預期 URL |
| www 對 apex | **301 → apex** | `curl` 實測 `https://www.pdfloveme.com/` → `301 → https://pdfloveme.com/` |
| http 對 https | **301 → https** | `curl` 實測 |
| github.io 重複內容 | **301 → apex，冇重複** | `https://hill02252024.github.io/pdfloveme/` 實測 **301 → https://pdfloveme.com/**；其下 `pages/merge.html`、`sitemap.xml`、`robots.txt` 全部 301 |
| 內部死鏈 | **0 條** | 32 頁全部 `<a href>` 解析後對檔案系統核 |
| 孤兒頁（零入度） | **0 個** | 內連圖；最深 **2 click**；深度分佈 `{0:1, 1:21, 2:10}` |
| 內容靠 JS 生成 | **0 頁** | 32 頁靜態 HTML 字數 vs 無頭 Chrome 渲染後字數，最大差 **23 字**（`index.html`，`<br>` 造成），其餘 ≤9 字 |
| 工具頁近似重複 | **冇** | 5-gram Jaccard 平均 2.8%，零對 >30% |
| title / description 重複 | **0 個重複** | 32 個 title、32 個 description 全部唯一 |
| title 過長被截 | **0 個 >60 字元** | 最長 59 |
| 圖片 alt | **11/11 都有 alt**，10 個 lazy | 全站 `<img>` 掃描 |
| lang / OG / Twitter | **32/32 `lang="en"`、32/32 og:title、og:image、twitter:card** | 全站掃描 |
| JSON-LD 語法 | **0 個解析錯**；`WebApplication` 17、`FAQPage` 26、`BreadcrumbList` 16、`Article` 10 | 逐個 `json.loads` |
| `.github/workflows/` 會改 sitemap 或刪頁 | **冇 workflows 目錄** | `ls .github/workflows/` 空 |

---

## 3. 「23 個 URL 蒸發」—— 逐個假設排除

| # | 假設 | 判定 | 證據 |
|---|---|---|---|
| 1 | sitemap 指向唔存在嘅檔案（404） | ❌ 排除 | 32/32 檔案存在 |
| 2 | 頁面被刪／改名 | ❌ 排除 | git 歷史零刪除、零改名 |
| 3 | robots.txt 誤封 | ❌ 排除 | 只有 `Allow: /` |
| 4 | noindex | ❌ 排除 | 全站 0 個 robots meta |
| 5 | canonical 指去別頁 | ❌ 排除 | 32/32 self-ref |
| 6 | www / github.io 重複內容分薄 | ❌ 排除 | 三個變體全部 301 |
| 7 | 有 Action 自動改 sitemap／刪頁 | ❌ 排除 | 冇 `.github/workflows/` |
| 8 | 內容靠 JS，Googlebot 睇唔到 | ❌ 排除 | 靜態 HTML 100% 覆蓋 |
| 9 | 樣板重複內容被當 thin | ❌ 排除 | 兩兩重疊 2.8% |
| **10** | **Google 主動剔走低價值 URL** | **🔶 最可能** | 見下 |

**第 10 項嘅支持證據**：
- ✅ 已驗證：repo 由 **2026-06-21 到 2026-08-17 共 57 日零 commit**（`git log --date=iso`）。跌幅期間網站一個字都冇改過 —— 任何「網站做錯咗嘢」嘅解釋都同呢個事實矛盾。
- ✅ 已驗證：舊 sitemap 有 **31** 條（`git show 562833c^:sitemap.xml`），新 32 條。GSC 曾知 ~35 條 → 多出嗰 ~4 條唔喺 sitemap，最可能係 Google 自行發現嘅變體。
- 你提供嘅數據：已索引 **8 頁維持不變**，淨係「未索引」由 27 跌到 5。如果係技術封鎖，已索引嗰 8 頁應該一齊跌。已索引穩定 + 未索引崩塌 = 典型嘅「Discovered/Crawled – currently not indexed」桶被清理。
- 🔶 推測（驗證方法：GSC → 網頁索引 → 逐個「未索引」原因分類睇實際 URL 清單；再用「網址審查」工具查其中 3 條消失嘅 URL，睇 Google 最後爬取日期同判定原因）。

**結論：呢個唔係要「修」嘅問題，係「Google 覺得唔值得爬」嘅症狀。解決方法係 P1（標題對齊意圖）+ P4（補 lastmod），唔係去搵一個唔存在嘅技術 bug。**

---

## 4. Sitemap 32 條 × 完整狀態表

| # | sitemap URL | 檔案存在 | noindex | canonical | 字數 | 入度 | 目標詞（由 title/H1 推斷） |
|---|---|---|---|---|---:|---:|---|
| 1 | `/` | ✅ | 冇 | self | 440 | 32 | 導覽／法務頁 |
| 2 | `/blog/` | ✅ | 冇 | self | 434 | 32 | 導覽／法務頁 |
| 3 | `/blog/extract-pages-from-pdf-without-breaking-layout.html` | ✅ | 冇 | self | 2883 | 1 | 部落格長尾 |
| 4 | `/blog/how-to-compress-a-pdf-without-ruining-quality.html` | ✅ | 冇 | self | 2722 | 6 | 部落格長尾 |
| 5 | `/blog/how-to-edit-a-pdf-without-paying-for-expensive-software.html` | ✅ | 冇 | self | 2502 | 4 | 部落格長尾 |
| 6 | `/blog/how-to-password-protect-a-pdf-without-locking-yourself-out.html` | ✅ | 冇 | self | 2733 | 1 | 部落格長尾 |
| 7 | `/blog/how-to-sign-a-pdf-without-printing.html` | ✅ | 冇 | self | 2959 | 4 | 部落格長尾 |
| 8 | `/blog/merge-pdf-files-without-making-a-mess.html` | ✅ | 冇 | self | 2484 | 4 | 部落格長尾 |
| 9 | `/blog/scanned-pdfs-searchable-ocr-guide.html` | ✅ | 冇 | self | 2476 | 2 | 部落格長尾 |
| 10 | `/blog/send-large-pdf-files-easily.html` | ✅ | 冇 | self | 2754 | 5 | 部落格長尾 |
| 11 | `/blog/why-pdfs-break-at-worst-time.html` | ✅ | 冇 | self | 2399 | 1 | 部落格長尾 |
| 12 | `/blog/why-your-pdf-form-wont-work-and-how-to-fix-it.html` | ✅ | 冇 | self | 2798 | 3 | 部落格長尾 |
| 13 | `/pages/about.html` | ✅ | 冇 | self | 504 | 32 | 導覽／法務頁 |
| 14 | `/pages/compress.html` | ✅ | 冇 | self | 722 | 14 | compress pdf |
| 15 | `/pages/contact.html` | ✅ | 冇 | self | 143 | 32 | 導覽／法務頁 |
| 16 | `/pages/crop.html` | ✅ | 冇 | self | 816 | 3 | crop pdf |
| 17 | `/pages/delete-pages.html` | ✅ | 冇 | self | 740 | 9 | delete pdf pages |
| 18 | `/pages/edit.html` | ✅ | 冇 | self | 812 | 4 | annotate pdf |
| 19 | `/pages/encrypt.html` | ✅ | 冇 | self | 713 | 8 | encrypt/password pdf |
| 20 | `/pages/fill-form.html` | ✅ | 冇 | self | 1201 | 5 | fill pdf form online |
| 21 | `/pages/jpg-to-pdf.html` | ✅ | 冇 | self | 757 | 6 | jpg to pdf |
| 22 | `/pages/merge.html` | ✅ | 冇 | self | 726 | 18 | merge pdf |
| 23 | `/pages/organize.html` | ✅ | 冇 | self | 673 | 8 | organize pdf pages |
| 24 | `/pages/page-numbers.html` | ✅ | 冇 | self | 701 | 3 | add page numbers |
| 25 | `/pages/pdf-to-jpg.html` | ✅ | 冇 | self | 789 | 6 | pdf to jpg |
| 26 | `/pages/privacy.html` | ✅ | 冇 | self | 304 | 1 | 導覽／法務頁 |
| 27 | `/pages/rotate.html` | ✅ | 冇 | self | 678 | 8 | rotate pdf |
| 28 | `/pages/sign.html` | ✅ | 冇 | self | 822 | 5 | sign pdf |
| 29 | `/pages/split.html` | ✅ | 冇 | self | 715 | 14 | split pdf |
| 30 | `/pages/terms.html` | ✅ | 冇 | self | 248 | 1 | 導覽／法務頁 |
| 31 | `/pages/unlock.html` | ✅ | 冇 | self | 736 | 3 | unlock pdf |
| 32 | `/pages/watermark.html` | ✅ | 冇 | self | 714 | 3 | watermark pdf |
> **表格讀法**：32 條全部 ✅ 存在、全部冇 noindex、全部 canonical self-referencing。呢個表最有用嘅一欄係最後兩欄 —— **入度**同**目標詞**。`pages/fill-form.html` 入度只有 5，係全站最新亦最好嘅頁；`pages/merge.html` 入度 18 但 title 冇任何意圖詞。

---

## 5. 關鍵字定位分析（C 段）

### 5.1 現時每頁實際針對緊咩（由 title / H1 / 正文 2-gram 推斷）✅ 已驗證

| 頁 | title | H1 | title 有意圖修飾詞？ |
|---|---|---|---|
| `pages/merge.html` | Merge PDF — PDFLoveMe | Merge PDF | ❌ 冇 |
| `pages/split.html` | Split PDF — PDFLoveMe | Split PDF | ❌ 冇 |
| `pages/rotate.html` | Rotate PDF — PDFLoveMe | Rotate PDF | ❌ 冇 |
| `pages/compress.html` | Compress PDF — PDFLoveMe | Compress PDF | ❌ 冇 |
| `pages/crop.html` | Crop PDF — PDFLoveMe | Crop PDF | ❌ 冇 |
| `pages/sign.html` | Sign PDF — PDFLoveMe | Sign PDF | ❌ 冇 |
| `pages/encrypt.html` | Encrypt PDF — PDFLoveMe | Encrypt PDF | ❌ 冇 |
| `pages/unlock.html` | Unlock PDF (Remove Password) — PDFLoveMe | Unlock PDF | ❌ 冇 |
| `pages/jpg-to-pdf.html` | JPG to PDF — PDFLoveMe | JPG to PDF | ❌ 冇 |
| `pages/pdf-to-jpg.html` | PDF to JPG — PDFLoveMe | PDF to JPG | ❌ 冇 |
| `pages/delete-pages.html` | Delete PDF Pages — PDFLoveMe | Delete Pages | ❌ 冇 |
| `pages/organize.html` | Organize PDF Pages — PDFLoveMe | Organize Pages | ❌ 冇 |
| `pages/watermark.html` | Add Watermark to PDF — PDFLoveMe | Add Watermark | ❌ 冇 |
| `pages/page-numbers.html` | Add Page Numbers to PDF — PDFLoveMe | Add Page Numbers | ❌ 冇 |
| `pages/edit.html` | Annotate & Markup PDF — PDFLoveMe | Annotate & Markup | ❌ 冇（而且 title 冇「edit」，但檔名同內連錨文係 edit） |
| **`pages/fill-form.html`** | **Fill a PDF Form Online — Free, No Upload** | Fill a PDF Form Online | **✅ online / free / no upload** |

### 5.2 明確答覆：邊幾頁根本冇針對任何工具意圖詞

**15 個工具頁全部都冇**（上表 ❌ 嗰 15 行）。唯一有嘅係 `pages/fill-form.html`，亦即 2026-08-17 先加嘅最新頁。

另外 6 頁（`index.html`、`blog/index.html`、`about`、`contact`、`privacy`、`terms`）本質係導覽／法務頁，唔應該追工具詞 —— 呢個唔算問題。

10 篇部落格文章反而**全部都有長尾意圖**（8 篇 title 有「How to」，全部有「Without …」嘅痛點修飾），呢個係全站做得最好嘅部分。

### 5.3 額外發現：`pages/edit.html` 存在錨文／標題／檔名三重錯配 ✅ 已驗證

檔名 `edit.html`、內連錨文係 "edit"、但 `<title>` 同 `<h1>` 都寫 "Annotate & Markup"。搜尋者打 "edit pdf online" 時，你頁面上一個 "edit" 字都冇喺 title/H1。同時 `blog/how-to-edit-a-pdf-without-paying-for-expensive-software.html`（2502 字）明明係針對呢個詞。**呢兩頁而家互相打對台又各自唔到位。**

### 5.4 重新定位方案

#### (a) 用「檔案唔上傳」做主軸 —— 呢個係真差異化，唔係口號

✅ 已驗證：全站 **零出站連結**（唯一一條係 `www.google.com`），所有 PDF 處理庫都喺 `vendor/`（8.9 MB，`pdf-lib` + `pdfjs` 本地），`pages/*.html` 每頁 FAQ 都有一條「Is my document uploaded? / Are my files uploaded?」明確答「No」。呢個技術事實 iLovePDF 做唔到（佢係 server-side 上傳處理）。

**建議標題模式**：`<動作> <對象> Online — <差異化> , No Upload`

| 現時 | 建議 |
|---|---|
| Merge PDF — PDFLoveMe | Merge PDF Files Online — Free, Nothing Uploaded |
| PDF to JPG — PDFLoveMe | PDF to JPG Converter — Runs in Your Browser, No Upload |
| Compress PDF — PDFLoveMe | Compress PDF Online — Shrink Files Without Uploading Them |
| Encrypt PDF — PDFLoveMe | Password Protect a PDF Online — Encrypted in Your Browser |
| Annotate & Markup PDF — PDFLoveMe | Edit & Annotate PDF Online — Free, No Upload, No Account |

#### (b) 長尾詞策略：避開 iLovePDF 佔住嘅頭部詞

頭部詞（"merge pdf"、"compress pdf"）你打唔贏 —— iLovePDF、Smallpdf、Adobe 三家佔死。可攻嘅係**帶「唔上傳／私隱」限定嘅長尾**，呢批詞競爭低而且你係少數真做到嘅站：

- `pdf to jpg without uploading`
- `merge pdf offline in browser`
- `compress pdf without uploading to server`
- `fill pdf form without uploading`
- `sign pdf privately without account`
- `password protect pdf locally`
- `edit pdf without sending file to server`
- `pdf tools that don't upload your files`

🔶 推測（驗證方法：用 Ahrefs / Semrush / Google Keyword Planner 查呢 8 個詞嘅實際月搜尋量同 KD；我讀唔到外部工具，呢批係由「你嘅技術差異 × 搜尋者會點表達焦慮」推導出嚟嘅候選，未經量化驗證）。

**執行方式**：唔使開新頁。每個工具頁加一個 H2 直接命中一個長尾詞（例 `pages/pdf-to-jpg.html` 加 `<h2>Converting a PDF to JPG without uploading it</h2>` + 150 字解釋機制），配合改咗嘅 title。

#### (c) E-E-A-T：你有第一手材料但擺錯位

✅ 已驗證：`pages/about.html`（504 字）寫住作者係 IT support 出身；`git log` 顯示 `d22eac4`、`17c6d01` 兩個 commit 專門「Add Hill's first-hand IT support experiences to articles」。**但呢啲第一手經驗全部只喺 blog，工具頁一句都冇。**

建議每個工具頁加一段 40–60 字嘅「點解我咁做」框，例如 compress 頁講「做 IT support 嗰陣，客戶最常問嘅係點解壓縮完個文字變糊 —— 因為多數工具將文字 rasterise 咗。呢度唔會。」呢個同時解決 E-E-A-T 同工具頁字數（673–822 字，偏薄）。

#### (d) 商標／doorway 風險評估

| 風險 | 評估 | 依據 |
|---|---|---|
| 商標混淆 | 🔶 中低 | 域名近似係事實，但 repo 內**零** iLovePDF 資產、零聲稱關聯、視覺完全獨立。未經律師確認 |
| Doorway penalty | ✅ 低（實測排除） | 工具頁兩兩重疊 2.8%、零對 >30%、樣板僅佔 6% |
| 品牌詞劫持觀感 | 🟠 中 | GSC 顯示你**實際上**只靠 iLovePDF 誤打得到曝光。長遠依賴呢個等於冇自己嘅需求 |

**建議**：唔換域名（會蒸發現有 8 頁索引同任何已建立嘅信號），但把品牌喺 title 嘅權重降到最低，用 12 個月時間把流量結構由「品牌誤打」轉成「長尾意圖」。

---

## 6. 修復優先順序

### 第一週（可以一日做完，全部係改字）

1. **改 15 個工具頁 title**，套用 5.4(a) 嘅模式。改完即刻喺 GSC「網址審查」→「要求建立索引」逐個提交。
2. **修 `pages/fill-form.html` 5 條 FAQ schema**，令 `acceptedAnswer.text` 同可見 `<p>` 逐字一致。
3. **`scripts/build-sitemaps.mjs` 加 lastmod**（用檔案 mtime），重跑，令 32 條全部有 lastmod。
4. **處理 AdSense 佔位符**：有真 ID 就填，冇就把 18 處 script/ins 同 `ads.txt` 一併移走。
5. **`pages/edit.html` 三重錯配**：title/H1 加返 "Edit"，變成 `Edit & Annotate PDF Online — Free, No Upload`。

### 第一個月

6. **每個工具頁加一個長尾 H2 + 150 字**（5.4b），15 頁 × 150 字 = 2,250 字新內容，同時把工具頁由 673–822 字推上 850–1,000。
7. **每個工具頁加 E-E-A-T 段**（5.4c），40–60 字第一手經驗。
8. **把 10 篇 blog 同對應工具頁做雙向內連收緊**：而家每篇 blog 只連 2 個工具頁（✅ 已驗證，共 22 條），而且工具頁入度極不均（merge 18、blog 文章多數只有 1）。目標係每篇 blog 連 3–4 個相關工具、每個工具頁連返 1–2 篇深度文。
9. **`pdf-lib` / `pdfjs` 改成動態 import**，`app.js` 加 defer，處理 30 個阻塞腳本。
10. **補 `pages/privacy.html`、`pages/terms.html` 嘅 schema**，補 `blog/why-your-pdf-form-wont-work-and-how-to-fix-it.html` 嘅 42 字元 description。
11. **加一個真 `404.html`**（`_seo_unresolved.md:12-14` 已經記低咗呢件事未做）。

### 唔建議做

- ❌ 換域名 —— 會蒸發現有 8 頁索引
- ❌ 為咗「修 23 個消失 URL」去改技術設定 —— 冇嘢可以修，改咗只會引入新風險
- ❌ 追 "merge pdf" 呢類頭部詞 —— 打唔贏，浪費 12 個月

---

## 7. 未定問題（一次過答齊，唔使逐條回）

| # | 問題 | 我嘅預設判斷 | 需要你提供 | 你唔提供我會點做 |
|---|---|---|---|---|
| 1 | 「23 個 URL 消失」嘅確切日期同 GSC「未索引」原因分類（Discovered / Crawled / Duplicate / Soft 404 …） | Google 主動剔走低價值 URL，唔係網站問題 | GSC → 網頁索引 → 截圖「未索引原因」清單，同其中 3 條消失 URL 嘅「網址審查」結果 | 維持現判斷，優先做 P1 + P4，唔碰技術設定 |
| 2 | AdSense publisher ID 係咪真係未申請到 | 未申請到，或者申請咗但未填返入去 | 真 ID（`ca-pub-` + 16 位）；或者話我知「未批」 | 建議整批移除 AdSense 代碼同 `ads.txt`，等批咗先加返 |
| 3 | 8 個「已索引」頁具體係邊 8 個 | 首頁 + blog 首頁 + 幾篇長文 + 1–2 個工具頁 | GSC 已索引頁清單 | 假設 blog 為主，優先改工具頁 title（未索引嗰批更需要信號） |
| 4 | 8 個長尾候選詞嘅實際搜尋量／KD | 每個月搜尋量 10–200，KD < 20 | Ahrefs / Semrush / Keyword Planner 匯出 | 照建議 8 個做，3 個月後用 GSC 曝光數反推邊個有需求 |
| 5 | 有冇任何外部反向連結 | 接近零（新站、零出站連結、冇推廣痕跡） | Ahrefs / Semrush / GSC「連結」報表 | 當作零外鏈規劃，優先做內容同內連 |
| 6 | 「PDFLoveMe」有冇註冊商標、iLovePDF 有冇發過通知 | 冇註冊、冇收過通知 | 有收過任何律師信／平台通知就話我知 | 維持「唔換域名但降低品牌權重」建議 |
| 7 | Core Web Vitals 實測值 | LCP 因 8.9 MB vendor + 30 個阻塞腳本而偏高 | 流量夠之後嘅 CWV 報表，或者一次 PageSpeed Insights 實測 | 照 P6 建議改，改完再量 |
| 8 | `pages/edit.html` 打算主攻 "edit pdf" 定 "annotate pdf" | 主攻 "edit pdf"（搜尋量高好多），annotate 做次要 | 一句話決定 | 照預設，title 改成 `Edit & Annotate PDF Online` 兩個都食 |
| 9 | 你接唔接受工具頁加第一手經驗段（會令語氣由「工具」變「有人做嘅工具」） | 接受 —— 呢個係你相對大廠嘅唯一優勢 | 唔想加就話我知 | 照加，但控制喺 40–60 字，唔影響工具可用性 |
| 10 | 部落格 10 篇之後仲寫唔寫 | 寫，但轉為「一篇文對一個長尾詞」而唔係通用指南 | 你嘅產能（每月幾篇） | 假設每月 2 篇，建議先把 15 個工具頁嘅長尾 H2 做完先開新文 |

---

## 8. 本報告嘅方法限制（自我聲明）

- 審計期間我寫嘅檢查器**錯過三次**，每次都係 selector 太窄，全部係開檔核對後先發現：
  1. FAQ 檢查器最初只認 `<details>/<summary>`，報 75/121 不符；實際本站用 `<p><b>問</b> 答</p>`，修正後係 5。
  2. 第二版 `<h\d>` 正則跨越咗 `<h2>Frequently asked</h2>`（後面冇 `<p>`）去食下一個 `<h3>`，令 10 篇 blog 嘅第一條 FAQ 被誤報「缺問題」。
  3. `index.html` 嘅 H1「PDF tools that<br>respect your privacy.」被我嘅靜態抽取器讀成 "thatrespect"；無頭 Chrome 實測 `innerText` 係 `"PDF tools that\nrespect your privacy."` —— **唔係缺陷，係我抽取器嘅產物**。
- 因此本報告所有「零命中」結論都附咗正對照或反向驗證。**未做過對照嘅結論唔會出現喺上面。**
- 反向連結、關鍵字搜尋量、CWV 實測值、商標註冊狀態 —— 呢四項 repo 內無法驗證，全部標咗「需外部工具」並列入第 7 節。
