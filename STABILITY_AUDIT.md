# STABILITY_AUDIT.md — 2026-08-29

由五個角色分別審計後交叉整合（Architecture / Data / QA / Release / Performance）。
所有 P0 結論都經過**實際執行驗證**，不只是讀程式碼。

---

## 系統最容易跑掉的 TOP 5

### 1. athleteId 依名單陣列索引產生 → 跨選手資料混淆（**資料問題，P0**）

刪除一位選手後，其後所有人的 `athleteId` 往前移一格。
新紀錄會沿用**別人歷史紀錄**的 ID。實測見 `DATA_CONTRACT.md` §1。

### 2. 學生端從不同步名單 → 同一人在不同裝置有不同 ID（**資料問題，P0**）

`loadRosterFromServer()` 只在教練設定頁被呼叫。
全新裝置的選手會落入姓名雜湊分支，拿到格式完全不同的 ID（`S2122` vs `S001`）。

### 3. 家長權限隔離零測試（**架構／權限問題，P0**）

`recordsForIdentity()` 與 `parentRecordSummary()` 是家長 A 與家長 B 之間唯一的牆，
**沒有任何測試證明它有效**。這是未成年人健康資料。

### 4. 覆寫層會靜默吃掉原函式的副作用（**架構問題，P1**）

`js/14-kpi-refactor.js` 覆寫 8 個全域函式。已經發生過一次事故：
`renderKpiSliders` 的覆寫漏掉 `toggleAbsenceReason()`，
造成選手選「未出席訓練」後**表單完全送不出去**。
`validateForm` 目前是**完全取代**而非包裹，原版整段是死碼。

### 5. 大範圍、命名含糊的 revert 會刪掉不相干的東西（**流程問題,P0**）

commit `4e429d4` 標題像是回退單一個小修正，實際 diff 是 **35 files, -4523 行**，
刪掉了 7 個 P0 資安修正與整套測試框架（45 單元 + 14 E2E、`package.json`、Playwright 設定）。
資安修正後來手工補回，**測試框架再也沒回來**。

---

## 技術債排行

### P0 —— 資料錯亂／權限／資料遺失

| # | 項目 | 類別 |
|---|---|---|
| P0-1 | athleteId 依索引產生，刪除／重排會造成跨選手 ID 撞號 | 資料 |
| P0-2 | 學生端不同步名單，跨裝置 ID 不一致 | 資料 |
| P0-3 | 家長權限隔離零測試 | 權限 |
| P0-4 | 登入（選手／家長／教練）零測試 | 權限 |
| P0-5 | repo 沒有任何檔案記錄線上部署版本 → 雙向漂移 | 流程 |

### P1 —— 容易造成其他功能壞掉

| # | 項目 | 類別 |
|---|---|---|
| P1-1 | `__origValidateForm` / `__origRenderKpiSliders` 死捕捉，看似有鏈接 | 架構 |
| P1-2 | saveDraft / restoreDraft / clearForm 零測試（兩套實作互相包裹） | 架構 |
| P1-3 | athleteId 穩定性零測試 | 資料 |
| P1-4 | `getLastRecordByName` 用 raw 字串比對姓名，經 `saveCoachScore` 可達，會靜默失敗 | 資料 |
| P1-5 | 姓名 fallback 鏈散落 9 處且順序不一致 | 資料 |
| P1-6 | `getStudentKpiSession` 每次學生開頁都做全表掃描，且無快取 | 效能 |
| P1-7 | `getWeeklyKpiAuto` 在每次重繪都重打（17 個呼叫點，含純 UI 開合） | 效能 |
| P1-8 | 三種 totalScore 滿分並存，`scorePercent()` 只認得兩種 | 資料 |

### P2 —— 效能與維護成本

- 教練開頁一次觸發 ≥8 個後端 action，其中 3 個是設定頁才需要的
- 心理準備模組單次儲存最多送出 10–13 個序列請求
- `getMentalCoachDashboard` 有 O(參與者 × 紀錄) 的重複過濾
- 兩套「回報有用度」計分（0–100 vs 0–4）並存
- `journalReadinessValue` 與 `scorePercent` 重複實作同一套量表啟發式
- localStorage key 散落三種命名慣例，`LS_KEYS` 只登記了 7/20
- 實際載入順序不是檔名數字順序
- `currentGroup` 已成唯寫死狀態

### P3 —— 純程式碼整潔度

- 30 拉桿相關的死碼（`recalcKpiSummary`、`onSliderChange` 等）
- 兩套 SVG 折線圖產生器
- 兩個殭屍分支
- `tests/` 沒有 `package.json`，換機無法重現環境

---

## 正面發現（**不要動**）

這些地方是刻意做好的，改動只會讓事情變糟：

- **Sheet 表頭寫入路徑** —— `setupSheet()` 已停用，只剩 `bootstrapHeaderRow_`（僅限全空表）
  與 `appendMissingHeaders_`（append-only、預設乾跑、遇重複表頭會拒絕）。全檔查無其他重排路徑。
- **模組邊界** —— 全前端 grep `getRange` / `SpreadsheetApp` / 寫死 sheet 名稱：**零違規**。
  前後端一律走 `postToWebApp({action})` 具名 JSON。
- **KPI 後端快取失效** —— 每一條寫入路徑都有呼叫 `clearKpiCaches_()`，查無遺漏。
- **並發保護** —— `addRecord` 與 `bulkSetKpiSession` 都有 `LockService`。
- **事件監聽器** —— 全部是「重建 innerHTML 後重綁」，document 層委派都有 once 守衛，查無累積。
- **AI 是 optional dependency** —— 失敗一律退回模板，不影響 KPI 主流程，且有測試。

---

# 追加稽核 — 2026-09-03｜資料讀取架構

由四個角色分別稽核（Frontend / Apps Script / Backend Performance / Mobile QA）。
所有結論皆有實測或程式碼位置佐證。**這一節的 P0 全部已修**，見 `ROOT_CAUSE.md` RC-3。

## 讀取架構的 TOP 5

### 1. 日常 UI「先抓全部再本機 filter」（**P0，已修**）

8 個 `fetchAllRecords` 呼叫點中有 4 個是無限制的日常 UI。
records 長到 1812 列後，每一次互動都變成 6 頁 / 11.86MB 的傳輸，
把單次失敗機率乘上頁數 —— 手機端出現 `Failed to fetch`，整個區塊掛掉。

守門測試：`tests/normal-ui-no-full-records.test.js`
（已驗證會失敗：注入一個無限制呼叫後，測試直接指出檔名與行號）。

### 2. 「後端沒有新 action」被寫成永久閂鎖（**P0，已修**）

Apps Script redeploy 後約一分鐘新舊 instance 並存。本次部署實測到：
`ping` 已回新版 `apiVersion`，同一時間 `getCoachDashboard` 卻回「未知的 action」。
永久閂鎖會讓整個 session 從此退回無限制讀取。已改為 2 分鐘時效。

**通則：任何「偵測到後端沒有某能力」的判定都必須帶時效，不可永久。**

### 3. 完全沒有讀取容錯（**P1，已修**）

稽核前全 repo 沒有任何逾時、重試、斷路器、last-known-good。
任何一次網路抖動 = 整個區塊掛掉，且畫面會呈現得像「今天沒人回報」。

已新增 `safeReadRequest()`：18 秒逾時、失敗重試一次（800–1500ms jitter）、
連續失敗 2 次開啟 12 秒斷路器、last-known-good 快取（明確標示「⚠️ 非即時資料」與
最後同步時間）。教練按「重新整理資料」可立即解除斷路器。

**寫入型 action 一律禁止進入這一層**（重試會造成重複寫入）。
`WRITE_ACTIONS` 共 33 個 action，`safeReadRequest` 收到就直接拋錯。
要讓寫入可重試，必須先有 `requestId` / idempotency key —— **目前沒有，因此不做**。

### 4. 後端即使指定日期視窗仍先讀全表（**P1，已修**）

`getAllRecordsRead_` 原本先 `getRange(2,1,lastRow-1,width)` 讀 297,168 格才過濾。
已改為「先讀 date 欄定位 → 合併連續列 → 只讀需要的段」。
段數 > 12 時退回整表讀取（保險絲，避免重蹈 v79「getRange 次數才是瓶頸」的覆轍）。

實測：近 7 天讀 6%、近 14 天 13%、近 45 天 44% 的格數，getRange 只要 1–4 次。

### 5. 錯誤診斷只留在 console（**P1，已修**）

`throw new Error('FETCH_FAILED')` 把原始例外整個丟掉，教練在手機上看不到原因。
已改為把安全的結構描述（HTTP 狀態／content-type／長度／是否 HTML／`<title>`／
是否經過重導／哪一個 action）帶到畫面上。

**同時修掉一個外洩風險**：原本錯誤訊息會把回應前 120 字塞進去，
那可能是半截的學生健康資料。現在只描述結構，不帶內容。

## 仍未解決

| 項目 | 嚴重度 | 說明 |
|---|---|---|
| `sweatLevel` 欄位裝著 readiness JSON | P1 | 1290 列受影響，`readinessJson` 全空。屬 migration，需先備份與 dry-run |
| 研究匯出仍讀完整歷史 | P2 | 刻意保留（E 類）。低頻、教練主動觸發、失敗不影響日常 |
| 教練視窗 45 天仍讀 44% 格數 | P2 | 收到 14–21 天可再降，但影響久未回報選手的警示判斷 |
| 寫入沒有 idempotency key | P2 | 因此寫入一律不重試。網路抖動時教練需自行確認是否送出 |
| `athleteId` 依名單索引產生 | **P0（舊有）** | 見上方 2026-08-29 稽核第 1 項，**仍未修** |
