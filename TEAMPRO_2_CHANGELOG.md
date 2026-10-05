# TEAMPRO_2_CHANGELOG.md

TeamPro 2.0 效能瘦身＋穩定化重構的修改紀錄。稽核見 `TEAMPRO_2_AUDIT.md`。

## Phase 1 — 資料一致性（2026-10-03）

使用者決定：永久選手 ID **沿用 `student_accounts.studentId`**（不另建 ATH-xxxx）、先修 P0-1、排除資料夾拆分、Safari 由 iPhone 實機驗收。

| commit | 內容 | 檔案 |
|---|---|---|
| `6323404` | **P0-1** records 的 `studentId` 只採信像帳號 ID 的值（`trustedStudentId_`），錯位舊資料退回姓名比對。修正選手／家長登入後約 38% 歷史看不到、回應舊紀錄被判無權限 | `apps-script/Code.gs` |
| `4451e96` | **P0-2** 新紀錄 `athleteId` 改寫 `studentId`（不再依名單索引）；研究匯出不再帶出紀錄裡錯位的 athleteId 文字，改用帳號對照表 | `js/04-daily-submit.js`、`js/12-research-data.js` |

- 未改寫任何歷史資料，未新增或更動 Sheet 欄位。
- `getAthleteIdForName()` 已無呼叫者，保留至 Phase 9 再依死碼流程移除。
- 測試：新增 `tests/studentid-drift.test.js`（24 項）、`daily-kpi-refactor.smoke.js` 新增 4 項；全部 19 支 533 項通過。negative control：修正前程式分別失敗 15 項與 4 項。
- 已知限制：錯位列以姓名比對，若未來出現同名不同帳號的選手，兩人都會看到彼此的錯位舊列（目前 40 個帳號姓名皆不重複）。
- 部署：GAS @89（2026-10-03，ping 驗活 3/3）→ 前端 GitHub Pages。

## Phase 2 — 去重＋短 TTL 快取（2026-10-03）

| commit | 內容 | 檔案 |
|---|---|---|
| `e7203f1` | `postToWebApp` 加 60 秒記憶體快取（H-1～H-4），並把 4 支原本沒去重的讀取加進 in-flight 去重 | `js/09-settings-auth.js` |

規則：只快取白名單（getKpiManageData / getMentalCoachDashboard / getKpiSessions / getAttendanceReportsByName / getMentalParticipantPlan / getStudentKpiSession / getStarConfig）且 `ok === true` 的回應；`getRecentRecordsByName` **只對家長**快取（教練要即時看到剛交的選手）。key 含登入身分；任何寫入發出與完成時都清空，寫入期間已發出的舊讀取不准回存；換人登入、登出、教練按「重新整理資料」也清空。

| 實測（攔截後端） | Before | After |
|---|---:|---:|
| 家長開頁（三支） | 各 2 次 | 同參數各 1 次 |
| 家長重進分頁 3 次 | +9 | **+0** |
| 選手 student↔lastperf 切 3 輪 | +3 getStudentKpiSession | **+0** |
| 教練 settings→coach | 重抓 | **+0** |

- 代價：其他裝置的變動最多晚 60 秒出現（例如教練剛開放 KPI，已開著頁面的選手最多晚 1 分鐘看到）。本機寫入會立即清空，不受影響。
- **H-5（getAllAppData 兩種 prefix）未做**：要合併需先量後端回傳大小，留待 Phase 6 一起看。
- 家長開頁的 getRecentRecordsByName 仍有 2 次，是 limit 90（家長儀表板）與 180（上次表現）兩個不同請求，不是重複。
- 測試：新增 `tests/read-ttl-cache.browser.test.js`（18 項，含 negative control：修改前失敗 6 項）；全部 20 支 551 項通過。
- 只改前端，**不需重新部署 GAS**。

## Phase 3 — records 窄欄讀取（2026-10-04）

| commit | 內容 | 檔案 |
|---|---|---|
| `cbf06cb` | I-1 `latestGroupByName` 只讀 name/group/timestamp/date 四欄＋CacheService 120 秒；I-2 `findRecordById` 只讀 recordId 欄＋該列；I-3 `getRecordsByDate` 先讀 date 欄再分段讀當天 | `apps-script/Code.gs` |

- `recordKeyColumns_` 逐字模仿 `rowToObject` 的取欄規則，所以 8/27 前欄位錯位的舊列、中文別名表頭，結果都與整表讀取相同（測試逐字比對）。
- 群組快取在 `addRecord` 成功、`updateRecord`、`clearKpiCaches_`（所有 KPI 設定／帳號／名單寫入）時清除；讀取失敗不寫快取。
- 代價：直接在試算表手動改 records 的組別，最多 2 分鐘後才反映到 KPI 開放對象。
- 測試：新增 `tests/narrow-reads.test.js`（50 項）；修改前程式在讀取量／快取檢查失敗 9 項，等價性檢查兩邊都過（符合預期）。全部 21 支 601 項通過。
- 部署：GAS @91（2026-10-04，使用者手動部署；clasp pull 比對與 repo 逐字相同，ping 3/3）。前端無變更。

## Phase 4 — 教練戰情室瘦身＋並行（2026-10-04）

| commit | 內容 | 檔案 |
|---|---|---|
| `0bc644e` | **P1-a** `getCoachDashboard` 加 `slimHistory`：焦點日期 ±1 天（與日期讀不出的列）回完整 87 欄，其餘歷史列只回 24 個歷史欄位（`COACH_HISTORY_FIELDS`）。前端只有 `refreshCoach` 開啟，快取鍵分開 | `apps-script/Code.gs`、`js/07-coach-dashboard.js` |
| `0001c55` | **P1-b** `refreshCoach` 的特質／風險處理／教練簡評／records 四支並行；**J-2** `_refreshCoachSeq` 連續切日期時舊查詢作廢；特質讀取失敗不再中斷整個後台 | `js/07-coach-dashboard.js`、`index.html`、`service-worker.js` |

**沒有照稽核原案新增 `getCoachTodayDashboard`、把 45 天警示搬到後端**：那等於重寫 7 個戰情室函式（準備度、身體燈號、連續警示、晤談名單…），風險高。改成「歷史列只少欄位、不少列」，前端邏輯一行不動。

| 8/30 真實資料（本機驗證，資料未離開本機） | Before | After |
|---|---:|---:|
| 2026-08-30 | 2 頁 / 2,260 KB | **1 頁 / 546 KB** |
| 2026-08-28（27 人當天回報） | 2 頁 / 2,413 KB | **1 頁 / 755 KB** |
| 2026-08-25 | 2 頁 / 2,479 KB | 1 頁 / 673 KB |
| 2026-08-12 | 2 頁 / 3,186 KB | 1 頁 / 825 KB |

四個日期戰情室 16 個區塊的 HTML **逐字相同**。目標 < 500 KB 未完全達成；剩下的大宗是 `rawScoresJson`（晤談名單「同細項連 3 筆低」要用）。

- 測試：`coach-slim-history.browser.test.js`（33 項：真 Code.gs 產生兩版回應 → 真 index.html 比對畫面；敏感度測試拿掉 9 個歷史欄位各自都抓得到）、`coach-refresh-race.browser.test.js`（10 項，修改前失敗 4 項）。全部 23 支 644 項通過。
- 相容性：舊後端忽略 `slimHistory` → 回完整資料，前端照常；新後端不帶參數 → 行為不變。部署順序不影響正確性。
- 部署：GAS @92（2026-10-04，使用者手動部署；clasp pull 比對逐字相同，ping 3/3）→ 前端 GitHub Pages（SW v63）。
- `moodIndex` 拿掉時測不出差異（昨天在 ±1 天焦點內是完整列，2 天連續判斷碰不到瘦身列），仍保守保留。

## Phase 5 — 心理模組批次儲存並行（2026-10-04）

| commit | 內容 | 檔案 |
|---|---|---|
| `10f8345` | 自我對話（最多 10 筆）、目標、心理計畫（每情境 1 筆）由逐筆 await 改為 `Promise.all`；每筆失敗仍各自落回本機，全部完成後才 toast 與重讀 | `js/13-mental-preparation.js` |

- 實測（每筆延遲 600ms）：自我對話 10 筆由約 6 秒 → 約 0.6 秒。
- 純前端，不需部署 GAS。後端 `mentalUpsert_` 每筆各自一列，並行不互撞。
- 測試：`mental-parallel-save.browser.test.js`（9 項，修改前失敗 4 項）；全部 24 支 653 項通過。
- ⚠️ **既有問題，本次未改**：前端儲存自我對話／目標／心理計畫時沒帶既有 ID，所以**每按一次「儲存」都會新增一整組列**，而不是更新舊的。要修需要讀回既有列的 ID 再帶回去（屬資料行為變更，另案處理）。

## Phase 6 — 開頁變輕（2026-10-05）

| commit | 內容 | 檔案 |
|---|---|---|
| `654d039` | **C-2** html2pdf（906KB，gzip 242KB）改為第一次匯出 PDF 時才載入（`ensurePdfLib`：只載一次、失敗可重試、逾時退回列印）；月報與選手日誌 PDF 都走它 | `index.html`、`monthly-report.js`、`js/08-profile-journal.js` |
| `1886090` | **P1-c** 校徽 2152×1879 → 300×262（436KB → 22KB），同檔名覆寫 | `yulinlogo.jpg` |
| `ca5ad7e` | **C-1** 教練開頁不再讀 LINE 狀態（設定頁才讀）；「上次表現」預先載入延到戰情室讀完之後 | `js/09-settings-auth.js` |

**所有角色每次開頁少下載約 264KB（gzip 後），而且不再被 906KB 的同步 script 擋住畫面。**

**C-1 與稽核預估不符，照實記錄**：稽核預估教練開頁 16 → 約 6 個請求，實測不成立 —— 現在 15 個請求中，**大部分是戰情室（教練預設分頁）本身要用的**（records、簡評、風險處理、出席回報、任務、KPI 管理、心理儀表板、本週之星）。延後它們只會讓預設畫面變慢。真正能延後的只有 LINE 狀態（15 → 14），以及把「上次表現」預先載入排到戰情室之後（請求數不變，但不再與戰情室搶 Apps Script 的同一使用者排隊）。

- 測試：`pdf-lazy-load.browser.test.js`（8 項，CDN 以 page.route 攔截不依賴網路）、`boot-requests.browser.test.js`（8 項，修改前失敗 2 項）。全部 26 支 669 項通過。
- 純前端，不需部署 GAS。

## Phase 9 — 死碼刪除（2026-10-05）

| commit | 內容 | 檔案 |
|---|---|---|
| `e3386fb` | 刪除 `getAthleteIdForName`（P0 根源，Phase 1 後已無呼叫者）、`loadTodayReportedStudentsLegacy_`（0 呼叫者）；原文與理由記錄在 `TEAMPRO_REMOVED_CODE.md` | `js/02-core-utils.js`、`js/07-coach-dashboard.js` |

- **順手抓到一支假通過的測試**：`normal-ui-no-full-records.test.js` 的「loadTodayReportedStudents 走 bounded」用 regex 從檔案中往後找，實際比中的是死碼 `loadTodayReportedStudentsLegacy_`。刪掉死碼後它才失敗 —— 也就是它一直在保護一段永遠不會執行的程式。已改成只檢查真正那支函式的本體（走 `getDailyAthleteSummary`、不讀 records）。
- smoke §17 原本是 5 條「釘住 P0 缺陷」的特徵測試，改為 1 條「`getAthleteIdForName` 不得加回」。測試總數因此 669 → 665。
- `DATA_CONTRACT.md` §1 標記 P0 已修正，但註明**舊資料的 athleteId 仍不可信**。
- 刻意沒刪：舊 30 拉桿 UI（`currentGroup`、`recalcKpiSummary`、`onSliderChange`、`.kpi-slider`），與 `js/14` 的覆寫綁在一起，留給 Phase 8。
- 純前端。全部 26 支 665 項通過。

## Phase 10 — 效能監測（2026-10-05）

| commit | 內容 | 檔案 |
|---|---|---|
| `ff64a1b` | `TEAMPRO_PERF` 加開關、每請求獨立計時、快取／合併標記、彙整表 | `js/01-config-data.js`、`js/09-settings-auth.js` |

**怎麼用**（教練或開發者在電腦／手機瀏覽器上）：

1. 網址後面加 `?debug=perf` 開一次頁，之後這台裝置會一直開著
2. 正常操作（開戰情室、切分頁、送出…）
3. 開瀏覽器主控台（F12 → Console），會看到 `[TeamPro perf] api getCoachDashboard 2310ms 546KB` 這類紀錄
4. 主控台輸入 `teamproPerfSummary()` → 依總耗時排序的表：次數、實際連線、快取命中、合併重複、失敗、平均／最慢毫秒、下載 KB
5. 用完網址加 `?debug=off` 關閉

- 只記 action 名稱、毫秒、回應大小，**絕不記錄任何紀錄內容**。
- 關閉時零成本（每個函式第一行就 return）。
- 修掉舊工具的一個量測錯誤：原本用 action 名稱當計時標記，戰情室並行的同名請求會互相覆蓋，量出來的毫秒數不可信。
- 測試：`perf-monitor.browser.test.js`（13 項）。全部 27 支 678 項通過。純前端。
