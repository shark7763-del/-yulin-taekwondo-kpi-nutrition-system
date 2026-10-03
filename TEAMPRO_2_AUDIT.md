# TEAMPRO_2_AUDIT.md — TeamPro 2.0 Phase 0 稽核

- 日期：2026-10-03
- 基準：`main` @ `89ebc6e`（GAS 正式部署 @88）
- 範圍：只做稽核，**未修改任何 production 程式碼**
- 程式規模：前端 13,000 行（js/ 12 支 + kpi-session / monthly-report / psych-cards）、`Code.gs` 5,347 行、`style.css` 2,199 行

---

## 0. 本次稽核的方法與可信度

| 證據類型 | 用在哪裡 | 限制 |
|---|---|---|
| **實測（Chromium 跑 index.html，後端全攔截）** | 開頁請求數、各分頁請求數、DOM 節點數、事件監聽器累積 | 後端回空資料，所以「有資料才會觸發」的路徑可能少算；**未測 Safari（本機沒裝 WebKit）** |
| **實際資料統計（`830跆拳道選手KPI後台.xlsx`，2026-08-30 匯出）** | athleteId / studentId 欄位內容、欄位錯位 | 是 8/30 的快照，線上 Sheet 之後可能有變。**只統計數量，沒有輸出任何個資內容** |
| **讀程式碼＋追呼叫者** | 全表掃描、覆寫、死碼、送出流程 | — |
| **既有文件**（STABILITY_AUDIT / ROOT_CAUSE / PERFORMANCE_BEFORE_AFTER） | 交叉比對 | 舊文件有部分已修或已錯，以下逐條標註 |

> ⚠️ 舊文件中「getRange 每次約 1～1.5 秒」的說法是**錯的**（commit `aa9c618` 自己的數據就互相矛盾），實際約數十毫秒。整表讀取約有 5 秒的固定成本。

---

## 1. 實測基準數字（Before）

### 1.1 開頁時的後端請求數（後端模擬延遲 300ms，觀察 6 秒）

| 角色 | 開頁請求數 | DOM 節點 | 內容 |
|---|---:|---:|---|
| **教練** | **16** | **5,185** | getLineStatus、getStarConfig ×2、getAuthConfig、getMentalCoachDashboard、getRoster、getDailyAthleteSummary、getKpiManageData、**getCoachDashboard ×2（分頁）**、getWeeklyKpiAuto、getAllAppData ×2、getCoachScores、getAllAttendanceReports、getKpiSessions |
| 選手 | 7 | 1,689 | getStarConfig、getAuthConfig、getAppData ×2、getRecentRecordsByName、getLastRecordByName、getStudentKpiSession |
| 家長 | 11 | 1,745 | getStarConfig、getAuthConfig、**getAttendanceReportsByName ×2、getRecentRecordsByName ×2、getMentalParticipantPlan ×2**、getLastRecordByName、getCoachReplies、getStudentTrait |

### 1.2 切換分頁的額外請求

| 角色 | 分頁 | 額外請求 | 問題 |
|---|---|---|---|
| 教練 | coach | +3（getKpiManageData、getMentalCoachDashboard、getKpiSessions） | **開頁時已經抓過，進分頁又抓一次** |
| 教練 | settings | +3（getAiConfig、getLineStatus、getAccountAdminData） | 正常（按需載入） |
| 選手 | student / lastperf | **每切一次 +1 getStudentKpiSession** | 而且這支在後端會**掃整張 records 表**（見 I-1） |
| 家長 | parent | **每次進入 +3**，重進也一樣 | 沒有快取 |

### 1.3 事件監聽器（教練／選手，所有分頁來回切 5 輪）

| 角色 | 開頁 | 切 1 輪後 | 切 5 輪後 |
|---|---:|---:|---:|
| 教練 | 1,249 | 1,272 | **1,272** |
| 選手 | 355 | 374 | **374** |

→ **沒有累積**。document 層級的監聽器固定 11 個。提示詞第十三節「重複綁定」**目前不是問題，不需要修**。

### 1.4 靜態資源

| 資源 | 大小 | 載入方式 | 誰需要 |
|---|---:|---|---|
| `html2pdf.bundle.min.js`（CDN） | **906 KB**（gzip 後 242 KB） | **同步 `<script>`，會擋住畫面渲染** | 只有教練匯出月報 PDF 時 |
| `yulinlogo.jpg` | **436 KB** | `<img>` ×2 | 所有人（顯示尺寸很小） |
| 自有 JS / CSS / HTML | 1.1 MB（未壓縮） | 18 支同步 script | — |

---

## 2. P0 — 資料安全／嚴重 Bug

### P0-1 選手登入後，約 38% 的歷史紀錄查不到 🆕（舊文件沒有記載）

| 項目 | 內容 |
|---|---|
| 檔案 / 函式 | `apps-script/Code.gs`：`recordsForIdentity()`（約 1415 行）、`recordsForIdentityOptimized_()`（約 1477 行） |
| 呼叫來源 | `authRecordResult` → `getRecentRecordsByName` / `getLastRecordByName`；`getSubmitContext`。選手的上次表現、歷史、PB 徽章、送出前比對，以及家長檢視 |
| 原因 | 比對規則是「**紀錄的 `studentId` 欄有值，就只比 `studentId`**」。但 records 歷史資料欄位錯位（見 K-1），有 **695 筆的 `studentId` 欄是數字**，不是 UUID → 比對失敗，整筆被濾掉 |
| 實際影響（8/30 匯出） | 有帳號的 40 人、1,807 筆紀錄中，**695 筆（38%）在選手或家長登入後看不到**。受影響 37 人，中位數每人少 34%，最多少 60%。**教練走姓名比對，所以看得到全部** |
| 會不會看到別人的資料？ | **不會**。數字不可能等於 UUID，只會「少看到」，不會「錯看到」 |
| 修改方式 | 比對時，`row.studentId` 不是合法 UUID 就視為空值，退回姓名比對。**只改讀取邏輯，不改資料** |
| 風險 | Low–Medium：這是家長權限隔離的那面牆（SYSTEM_CONTRACT §8），**必須補家長／選手隔離測試** |
| 待驗證 | 線上 Sheet 目前是否仍是這個狀態，Phase 1 第一步用唯讀 action 驗證 |

### P0-2 athleteId 依名單陣列索引產生（舊 P0，仍未修）

| 項目 | 內容 |
|---|---|
| 檔案 / 函式 | `js/02-core-utils.js:15` `getAthleteIdForName()` = `'S' + (players.indexOf(name)+1)`；不在名單時改用**姓名雜湊**（4 位數） |
| 呼叫來源 | `js/04-daily-submit.js:196`（每筆回報都寫入 `records.athleteId`）、`js/12-research-data.js:55`（研究匯出） |
| 原因 | 刪掉或重排名單，後面所有人的 ID 都會移位，撞到別人的歷史 ID；選手手機上沒有名單時會落入雜湊分支 |
| 實際資料 | `records.athleteId` 只有 90 筆是 `S00n` 格式，988 筆是錯位進來的文字；`risk_flags.athleteId` 混了 S00n 628、S 四位數 612、UUID 4、其他 90；`ai_scores` 也類似。**這三張表都無法用 athleteId 串接** |
| 目前誰在信任它 | 後端已全面**不採信**（`Code.gs:1850`、`4393` 的註解與邏輯），心理模組也改成「athleteId 只能加強、不能推翻姓名」。**目前沒有已知路徑會因此對錯人** |
| 真正的風險 | 研究匯出（12）把 athleteId 當受試者代碼 → **研究資料去識別化後可能把兩個人混成一人**（論文用資料） |

**設計建議（與提示詞不同，需要你決定）：**
提示詞要新建 `ATH-8F7C21` 這種 ID。但系統**已經有永久 ID**：`student_accounts.studentId`，是建立帳號時產生的 UUID（`Code.gs:1151`）。改姓名、升年級、換組別、重排名單，它都不會變；選手登入後也已經會寫進 `records.studentId`（`Code.gs:2054`）。

→ 建議**直接把 `studentId` 當作永久 Athlete ID**，不要再發明第三套：
1. 前端新紀錄的 `athleteId` 改寫成 session 的 `studentId`（沒有就留空），**不再用陣列索引產生**
2. **不改寫任何歷史資料**。舊的 `S00n` 與錯位文字留在原地，讀取時一律不採信
3. 研究匯出改用 `student_accounts` 的「姓名 → studentId」對照產生受試者代碼
4. 這是身分識別的變更（AGENTS.md STOP 條件），需要你核准

### P0-3 records 歷史資料欄位錯位（K-1，範圍比舊文件大）

| 項目 | 內容 |
|---|---|
| 證據 | records 1,812 列中，資料列寬度有 20 種（44 到 164 欄）；`studentName` 欄出現 **147 種值**（全隊約 40 人）；`athleteId` 欄 988 筆是文字；舊文件記載的 `sweatLevel` 裝 readiness JSON（1,290 列）也是同一個成因 |
| 原因 | 8/27 以前寫入是**依位置**，跟 Sheet 實際的欄位順序對不上；8/27 之後改成依表頭名稱寫入，新資料才正確（8 月的 90 筆 `S00n` 就是證據） |
| 影響 | 讀取 `studentId` / `athleteId` / `studentName` / `sweatLevel` / `readinessJson` 等欄位的歷史統計都不可信 |
| 處理原則 | **不做 migration**（AGENTS.md STOP 條件，而且要動 1,000+ 列真實資料）。讀取端一律「驗證格式再採信」（P0-1 就是第一個案例）。是否搬移資料，等你另外決定 |

---

## 3. P1 — 明顯效能問題

### I. 全表掃描

| # | 檔案 / 函式 | 呼叫來源 | 原因 | 修改方式 | 風險 |
|---|---|---|---|---|---|
| **I-1** | `Code.gs:3595` `latestGroupByName()` → `getAllRecords()` | **`getStudentKpiSession`**（選手**每次開頁、每次切分頁**）、`getKpiSessions`、`submitWeeklyKpi`、`getAccountAdminData`、`bulkSetKpiSession`、`kpiSessionStats` 等 10 處 | 只為了知道「每位選手最新的組別」，把 1,812 列 × 164 欄（約 30 萬格）全讀進來並轉成物件 | 改成只讀 `timestamp / date / name / group` 四欄（1 次 getRange）；再加 CacheService 快取（全隊約 40 個名字，很小），寫入時由既有的 `clearKpiCaches_()` 清除 | Low：回傳格式不變 |
| I-2 | `Code.gs:2465` `findRecordById()` → `getAllRecords()` | `updateRecordAuthorized`（教練複評、選手回應） | 只為了找一筆紀錄 | 只讀 `recordId` 一欄定位，再讀那一列 | Low |
| I-3 | `Code.gs:5001` `getRecordsByDate()` → `getAllRecords()` | `authTeamRecords`（`getRecordsByDate` / `getTodayRecords`） | 只要某一天，卻讀整張表 | 改走 `getAllRecordsRead_` 既有的日期定位路徑 | Low |
| I-4 | `Code.gs` `getSubmitContext` | 選手送出前（`js/04:347`） | 為了「今天填過沒」與 60 筆 PB 歷史，讀整張表（v88 已從約 47 次 getRange 降到 1 次，但仍是整表） | 可接受；I-1 修完後再量 | — |
| ~~I-5~~ | ~~`recordsForIdentityOptimized_` 逐段讀取~~ | — | — | **已修（v88）** | — |
| I-6 | `js/12-research-data.js:235` 研究匯出 | 教練主動觸發 | 完整歷史 | **刻意保留**（低頻、失敗不影響日常） | — |

### H. 重複 API

| # | 位置 | 現象（實測） | 原因 | 修改方式 |
|---|---|---|---|---|
| H-1 | 教練 coach 分頁 | 開頁抓過 getKpiManageData / getMentalCoachDashboard / getKpiSessions，**進分頁又抓一次** | in-flight 去重只合併「同時飛行中」的請求，請求結束後沒有短期快取 | 加短 TTL（60 秒）快取，或開頁時不抓（見 C-1） |
| H-2 | 家長分頁 | 開頁時 3 支各打 2 次；**每次進分頁再 +3** | 兩條初始化路徑都呼叫 `renderParentDashboard`，且沒有快取 | 開頁只渲染一次＋短 TTL 快取 |
| H-3 | 選手 student / lastperf 分頁 | 每次切換都重打 getStudentKpiSession | `kpi-session.js:879` 每次 render 都重新確認開放狀態 | 60 秒快取（開放狀態一週才變一次）；送出後 `refreshStudent` 已會主動更新 |
| H-4 | 教練 getStarConfig ×2 | `js/07:787` 與 `js/09:206` 各自讀取 | 兩個模組各抓各的 | 加入 in-flight 去重清單＋共用結果 |
| H-5 | 教練 getAllAppData ×2 | `js/02:529`，不同 prefix | 參數不同，屬於兩個不同的請求 | 可以合併成一次不帶 prefix 的請求（需確認後端回傳大小） |
| ~~H-6~~ | ~~getWeeklyKpiAuto 一次開頁 6 次~~ | — | — | **已修**（`kpi-session.js:345` 的 `_weeklyAutoLoaded`） |

### C. 可以 Lazy Load

| # | 項目 | 現況 | 建議 | 效益 | 風險 |
|---|---|---|---|---|---|
| **C-1** | 教練開頁初始化**設定頁與管理類資料**（getLineStatus、getAuthConfig、getAllAppData、getKpiManageData、getMentalCoachDashboard、getKpiSessions…） | 教練開頁 16 個請求 | 首頁只抓今日戰情需要的；其他等進入該分頁才抓 | 教練開頁 16 → 約 6 | Medium：要逐支確認首頁沒有依賴 |
| **C-2** | `html2pdf.bundle.min.js` | 906 KB 同步載入，**所有人每次開頁都下載** | 改成按 PDF 按鈕時才動態插入 `<script>`（`monthly-report.js:1294` 已經有「未載入」的判斷） | 選手／家長開頁少 242 KB（gzip），首屏不再被擋 | Low |
| C-3 | 心理模組、特質雷達、研究資料、月報 | 程式碼全部同步載入，但**資料**多半已是進分頁才抓 | 程式碼層 lazy load 需要動態 import，**收益小、風險大**，不建議 | — | — |

### M. 造成送出延遲

| # | 位置 | 原因 | 建議 |
|---|---|---|---|
| M-1 | `js/04-daily-submit.js:347` → `:405` | 送出時**依序**呼叫兩次後端：getSubmitContext（整表讀取）→ addRecord | getSubmitContext 是為了「今天填過沒」的確認視窗，**這個 UX 必須保留**。改善方向：開頁時就預先抓好（背景 + 快取），送出時直接用 |
| M-2 | `Code.gs` `addRecordAuthorized` | 寫入後**同步**執行 `appendAiScoreFromPayload`、`appendRiskFlagsFromPayload`（各自寫另一張表） | 量測後再決定；risk flag 必須保留（P0 的安全提醒） |

### 其他 P1

| # | 位置 | 問題 | 建議 |
|---|---|---|---|
| P1-a | `getCoachDashboard`（`Code.gs:1815`） | 45 天 × 87 欄 ≈ **2.22 MB，要分 2 頁**（實測教練開頁 ×2） | 目標 < 500 KB：首頁只送今日 + 每人最近 3 筆摘要；45 天的警示視窗改在後端計算，只回結果。**這就是提示詞的 `getCoachTodayDashboard`** |
| P1-b | `js/07:1216` `refreshCoach()` | 依序 await：特質 → 紀錄 → 風險處理 → 教練評分，**4 段延遲相加** | 改成並行（今天在「上次表現」做過一樣的修改，已驗證有效） |
| P1-c | `yulinlogo.jpg` 436 KB | 顯示尺寸很小 | 壓到約 20–40 KB（只換圖檔，不改程式） |

---

## 4. P2 — 架構問題

### G. Monkey Patch（`js/14-kpi-refactor.js` 覆寫 8 個全域函式）

詳見 `MONKEY_PATCH_AUDIT.md`，本次複查結論**不變**：

| 函式 | 原始 | 覆寫 | 型態 | 收斂建議 |
|---|---|---|---|---|
| `buildRecord` | `04:113` | `14:547` | 包裹，**但兩邊都算 totalScore / averageScore / status / lowItems** | 把覆寫版的計算搬回原函式，刪掉覆寫 |
| `validateForm` | `03:1397` | `14:411` | **完全取代**，原版是死碼 | 刪掉原版，覆寫版搬回 03 |
| `renderKpiSliders` | `03:22` | `14:603` | 取代，**曾漏掉副作用造成事故** | 搬回 03，原版 30 拉桿的 UI 刪除 |
| `saveDraft` / `restoreDraft` / `clearForm` | `10:340/358/277` | `14:577/582/590` | 正確包裹 | 最後才處理（**草稿是選手資料，最危險**） |
| `updateDailyKpiVisibility` / `isDailyKpiAvailable` | `02:191/200` | `14:389/646` | 取代（恆真） | 直接改原函式 |
| `toggleAbsenceReason` | `03:88` | `14:648` | 正確包裹 | 合併 |

收斂原則：**一次只收一個，每收一個跑全部測試**。未出席、草稿、送出這三條，都有專屬的回歸測試保護。

### B / E. 可合併、重複程式

| # | 項目 | 位置 | 風險 |
|---|---|---|---|
| E-1 | 兩套「回報有用度」：0–100 vs 0–4 | `05:646` `computeReportUsefulness` vs `14:329` `reportUsefulness` | **載入順序一變，存進 Sheet 的分數就從 0–100 變成 0–4**。應保留 0–100 那套 |
| E-2 | 兩套 readiness 量表啟發式 | `08:338` `journalReadinessValue` vs `03:1136` `scorePercent` | Low |
| E-3 | 兩套 SVG 折線圖 | `trendChartSVG` vs `jrTrendChart` | Low |
| E-4 | 三種 totalScore 滿分並存（/50、/150、/30） | 全站 | **不可合併資料**；只能讀取時一律用 `averageScore` 或 `scorePercent()` |

### D. 快取（現況盤點）

快取散落在各模組：摘要快取（07，90 秒 + localStorage）、選手明細（07，90 秒）、`fetchAllRecords` 快取、特質快取（11）、last-known-good（09）、KPI 後端快取（CacheService）。

→ **不建議**照提示詞建一個新的全域 Cache Manager 去取代全部，那會一次動到所有模組。建議做法：抽一個很小的 `ttlCache(key, ttl, loader)` 工具，**只給新增的快取點用**（H-1、H-2、H-3），既有的快取維持原樣。

### J. Race Condition

| # | 位置 | 現況 |
|---|---|---|
| ~~J-1~~ | 上次表現連點 A→B | **已修**（今天，`_lastPerfLoadSeq`） |
| J-2 | 教練切換日期（`refreshCoach`） | 沒有序號保護；連續切日期時，舊日期的結果可能蓋掉新日期 | 套用同一個做法 |
| J-3 | 寫入沒有 idempotency key | 寫入不重試，所以不會重複寫入；代價是網路不穩時教練要自己確認 | 維持現狀（文件已記載） |

### L. 可能造成登入閃退

| # | 現況 |
|---|---|
| L-1 | 2026-08 稽核時已修：QuotaExceededError、PWA `controllerchange` 強制重載 |
| L-2 | `notifySessionExpired`（`09`）在任何 `authRequired` 時清掉身分並跳回登入，**這是設計上的行為**。但 redeploy 後約 1 分鐘新舊版本並存期間，若剛好打到舊版本，可能誤判成「登入過期」→ **需要實測確認** |

---

## 5. P3 — 程式整理（F. Dead Code，引用次數為 2026-10-03 實測）

| 項目 | 引用數 | 判斷 |
|---|---:|---|
| `__origValidateForm` / `__origRenderKpiSliders` | 各 1（只有賦值） | **死捕捉**，可刪 |
| `loadTodayReportedStudentsLegacy_` | 1（只有定義） | 可刪 |
| `currentGroup` | 2（宣告＋原版 renderKpiSliders 寫入） | 唯寫狀態，隨 G 收斂一起刪 |
| `recalcKpiSummary` / `onSliderChange` / `.kpi-slider` | 5 / 2 / 15 | 舊 30 拉桿 UI，**隨 G（renderKpiSliders 收斂）一起處理**，不要單獨刪 |
| `buildTodayReportStatus` | 3 | **還在用**，不可刪 |

所有刪除都要記錄在 `TEAMPRO_REMOVED_CODE.md`。

---

## 6. A. 必須保留（不要動）

- Sheet 表頭 append-only 機制（`bootstrapHeaderRow_` / `appendMissingHeaders_`）
- `addRecord` 的 LockService 與只讀 name/date 兩欄的去重
- `safeReadRequest`（逾時、重試、斷路器、last-known-good）與 `WRITE_ACTIONS` 防呆
- in-flight 去重（`postToWebApp` + `INFLIGHT_DEDUP_ACTIONS`）—— **提示詞第四節要的 Request Manager 已經存在**
- `TEAMPRO_PERF` 計時工具 —— **提示詞第十六節的 Performance Monitor 已有雛形**
- 草稿本機自動儲存（400ms debounce、只寫 localStorage、**不打 API**）—— 第十五節的 local-first 已經做到
- 家長欄位遮蔽 `parentRecordSummary`、`requireRole(['coach'])`、`ADMIN_KEY` fail closed
- `action` 同時放在 query string（防 302 退化）

---

## 7. 提示詞與現況不符、需要你決定的地方

| # | 提示詞要求 | 現況／衝突 | 建議 |
|---|---|---|---|
| 1 | 新建 `ATH-xxxxxx` 永久 ID | 已經有 `studentId`（UUID），且已寫進新紀錄 | **用 studentId**，不另建（見 P0-2） |
| 2 | 拆成 `core/ auth/ api/ …` 等資料夾 | 違反 AGENTS.md「禁止大量搬檔」；搬檔會讓所有 `?v=` 與 service-worker 快取一起變動 | **不做**，或等全部 Phase 完成後再評估 |
| 3 | Admin 角色 | 系統只有 student / parent / coach 三種角色，沒有 Admin | 「Admin 功能」對應的是教練的設定頁，C-1 會一起處理 |
| 4 | 心理模組 Batch API（Phase 5） | 程式確實會依序送出最多 10＋N 個請求（`13:275/286/291` 的 for-await）。但**實際資料幾乎是空的**（8/30：self_talk 0、goals 0、plans 0、reflections 0、daily 2 筆） | 優先度降為 P2；要做的話，前端改成 `Promise.all` 就能達到大部分效益，不一定要新增後端 action |
| 5 | 每日回報簡化（第十節） | 這是 UX 變更，不是效能問題，而且會改變選手填寫的內容 | 需要教練從使用面決定，**不在這次的效能重構範圍** |
| 6 | 統一 Cache Manager 取代全部 | 會一次動到 6 個模組的快取 | 只給新增的快取點用（見 D） |
| 7 | 事件監聽器修正（第十三節） | **實測沒有累積** | 不需要做 |
| 8 | 手機 Safari 測試 | 本機沒裝 WebKit，無法自動化測試 | 由你用 iPhone 實機驗收；或安裝 Playwright WebKit（約 100 MB） |
| 9 | Phase 順序 | 提示詞是 1 Athlete ID → 2 dedupe/cache → 3 全表掃描 → … | **建議把 P0-1（38% 歷史看不到）放在最前面**。它是資料正確性問題，而且修法小 |

---

## 8. 建議的 Phase 計畫（P0 → P1，每個 Phase 都可以單獨退回）

| Phase | 內容 | 預計修改檔案 | 預期效益 | 風險 |
|---|---|---|---|---|
| **1** | P0-1 studentId 驗證後才採信；P0-2 新紀錄改寫 studentId、研究匯出改用 studentId | `Code.gs`、`js/04`、`js/12` | 選手／家長看到完整歷史（+38%）；研究資料不再混人 | Medium（身分＋隱私邊界，要補隔離測試） |
| **2** | H-1～H-5 去重與短 TTL 快取 | `js/09`、`kpi-session.js`、`js/07` | 家長重進分頁 +3 → 0；選手切分頁 +1 → 0 | Low |
| **3** | I-1 `latestGroupByName` 窄欄讀取＋快取；I-2、I-3 | `Code.gs` | **選手每次開頁不再掃整張表** | Low |
| **4** | P1-a 教練首頁輕量 API；P1-b `refreshCoach` 並行；J-2 日期切換序號 | `Code.gs`、`js/07` | 2.22 MB / 2 頁 → 目標 < 500 KB / 1 頁 | Medium |
| **5** | 心理模組前端並行送出 | `js/13` | 10＋N 次依序 → 並行 | Low |
| **6** | C-1 教練開頁延後載入；C-2 html2pdf 按需載入；P1-c logo 壓縮 | `js/09`、`js/10`、`index.html`、`monthly-report.js` | 教練開頁 16 → 約 6 個請求；所有人少下載 242 KB | Medium |
| 7 | Dirty update（教練評分後只更新該卡） | `js/07` | — | Medium |
| 8 | G：14-kpi-refactor 覆寫逐一收斂 | `js/03`、`04`、`10`、`14` | 可維護性 | **High**（送出／草稿／未出席） |
| 9 | F：死碼刪除＋`TEAMPRO_REMOVED_CODE.md` | 同上 | — | Low |
| 10 | Performance monitor：以 `TEAMPRO_PERF` 為基礎，加 `DEBUG_MODE` 開關與統一 log 前綴 | `js/01`、`js/09` | 可觀測性 | Low |

> 每個 Phase 都遵守 AGENTS.md：一個 patch 一件事、先跑 baseline、改完跑全部 18 支測試、對修改前程式跑 negative control、後端先部署再推前端。
