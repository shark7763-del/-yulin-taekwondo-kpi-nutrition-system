# ROOT_CAUSE.md — 教練後台資料讀取穩定性

調查日期：2026-09-02
症狀：教練後台大量區塊顯示
「此動作不接受 GET 請求，請改用 POST」／`keys=[ok,error,hint]`，以及區塊一片空白。

**結論：這是兩個互相獨立的故障，不是同一個。** 只修其中一個，教練看到的畫面仍然是壞的。

---

## RC-1｜回應過大 → POST 在重導鏈上被降級成 GET

### 證據鏈

1. **畫面上多個橫幅其實是同一個失敗。**
   `showCoachLoadError()`（`js/07-coach-dashboard.js`）把同一段 HTML 寫進**所有**
   `COACH_LOAD_ERROR_BOXES`（`coachRedLight`、`coachQuickScoreList`、`coachReadinessGroups`、
   `coachRiskTracking`、`coachWarRoomCard`）。它只有一個觸發點：`refreshCoach()` 裡的
   `fetchAllRecords({ strict: true, force: true })`。
   所以「今日回覆」和「風險追蹤」同時出現同一段字，是**一個**請求失敗，不是兩個。

2. **錯誤字串的指紋唯一。**
   `此動作不接受 GET 請求` + `hint` 這個組合，全 repo 只有 `apps-script/Code.gs` 的
   `doGet()` 產得出來（`GET_ALLOWED_ACTIONS = ['ping', 'getAuthConfig']`）。
   代表 Google 伺服器上執行的是 **doGet**，也就是那個請求是以 **GET** 抵達 `/exec` 的。

3. **前端沒有任何 GET 路徑。**（本次稽核逐行確認）
   全前端只有一個 `fetch(`，在 `js/09-settings-auth.js` 的 `postToWebAppFetchJson_`，
   `method: 'POST'`。其餘 40 處 `getWebAppUrl()` 全是「是否雲端模式」的判斷，
   沒有一處組出 GET 網址。`14-kpi-refactor.js` 覆寫的 8 個函式沒有一個碰資料讀取路徑。
   → **GET 不是我們發出的，是重導鏈造成的。**

4. **量出來的體積。** 以 `830跆拳道選手KPI後台.xlsx` 實算：
   records = 1812 列 × 164 欄 = 297,168 格，
   `getAllRecords` 的 JSON 回應 = **15.66 MB**（gzip 1.34 MB），平均每列 9,062 bytes，
   其中 **61% 的格子是空字串**。

5. **對照組。** 從乾淨 Chromium 實打正式後端，小回應的 POST 一次都沒被降級：
   ```
   ping                 1689ms  {"ok":true,"message":"pong"}
   getAuthConfig        1600ms  {"ok":true,"legacyLoginEnabled":true,...}
   getLastRecordByName  1441ms  {"ok":false,"authRequired":true}
   ```
   全系統唯一 15.66MB 的那個回應，就是唯一失敗的那個。

### 機制

Apps Script 的 POST `/exec` 必定回 302，轉往
`script.googleusercontent.com/macros/echo?user_content_key=...` 取結果（本次實測到的
`Location` 就是這個）。回應太大時那一跳取不回來，鏈路退回 `/exec`；
而瀏覽器對 302 的 POST **依規範**會轉成 GET。前端會把 `?action=` 掛在網址上
（原本就是為了讓降級後的請求得到明確錯誤而不是假裝成功的 `pong`），
所以 `doGet` 認得動作，回了那句「此動作不接受 GET 請求」。

### 誠實邊界

**Google 沒有公開 ContentService 的回應大小上限**（官方 quotas 頁只有 URL Fetch 50MB
與 6 分鐘執行上限）。因此「15.66MB 撐爆 echo 那一跳」是**相關性極強的推論**，
不是白紙黑字的規格。但不論確切門檻在哪，「不要一次回傳整張表」都是唯一正解。

**為什麼是現在才發作**：records 已長到 1812 列。資料少的時候這個回應撐得過去。

---

## RC-2｜`renderCoachSimpleGroups` 必然拋錯，讓它之後的所有區塊停止渲染

這一個與 RC-1 完全無關，**在 RC-1 修好之後仍然會讓教練看到大片空白**。

```js
// js/07-coach-dashboard.js（修復前）
const buckets = { '強化組': [], '穩定組': [], '調整組': [], '保護組': [], '關懷組': [] };
const light = readinessLight(nval(r.finalReadinessScore) || 0);
buckets[light.group].push(r);
```

`READINESS_LIGHTS[].group` 的值是
`'穩定 / 強化日'`、`'調整日'`、`'保護日'`、`'關懷日'`，
**跟 buckets 的五個鍵永遠對不上** → `buckets[undefined].push(...)` → `TypeError`。

- 觸發條件：**當天只要有任何一位選手回報**（`todays` 非空）就必定拋錯。
- 影響範圍：`refreshCoach()` 從這一行起中斷，它之後的
  **風險追蹤、團隊心情、狀態名單、紅燈輔導、分析、營養、警示、面談名單、教練任務**
  全部不會渲染，且 `toast('✅ 已更新')` 不會出現。
- 這不是本次改動造成的：`git show HEAD` 的線上版一模一樣。
- 同一檔案 400 行前的 `renderCoachReadinessOverview` 用的是**正確**的門檻寫法。
  commit `44f0846 "Fix coach readiness group mapping"`（2026-07-08）只修了那一處，
  漏了 `renderCoachSimpleGroups` 這一處 —— 是**同一個 bug 的兩份實作只修了一份**。

修法：把門檻抽成唯一一份 `readinessGroupKey()`，兩處共用，並加防呆
（未知分組落到關懷組，不再讓整個後台停在這裡）。

---

## 修改檔案列表

| 檔案 | 改了什麼 |
|---|---|
| `apps-script/Code.gs` | 新增 `getCoachDashboard` action 與 `COACH_DASHBOARD_FIELDS`（87 欄白名單）；`recordsReadOptions_` 新增 `keepFields`；`jsonOut` 掛上 `apiVersion`；新增 `API_VERSION` |
| `js/01-config-data.js` | 新增 `APP_VERSION` |
| `js/07-coach-dashboard.js` | 教練後台改走 `getCoachDashboard`（後端未部署時自動退回 `getAllRecords` 分頁）；讀取與錯誤處理收斂為 `fetchAllRecords` 單一入口；**修 RC-2**；新增版本不一致橫幅 |
| `js/09-settings-auth.js` | 從每個回應收下 `apiVersion`，提供 `getApiVersionState()`（不額外發請求） |
| `index.html` | `?v=` 旗標 |
| `service-worker.js` | `CACHE` 版號 |
| `tests/coach-dashboard-scale.test.js` | **新增**：2000／5000 列 × 164 欄規模測試 |
| `tests/coach-dashboard-fields.test.js` | **新增**：白名單防腐閘門 |
| `tests/coach-dashboard-reliability.browser.test.js` | **新增**：真實頁面可靠性測試（含 RC-2 回歸） |
| `DEPLOY_LOG.md` | 部署紀錄 |

**沒有動到**：Google Sheet 的欄位、欄位順序、任何既有資料、任何既有 action 名稱、
localStorage key、DOM id。所有後端參數都是可選的，不帶時行為與前一版一字不差。

---

## 設計：`getCoachDashboard`

```
輸入  { date, days }        days 上限 180，預設 45
輸出  { ok, data, fields, total, offset, nextOffset, date, days, apiVersion }
```

- **只回 87 個欄位**（整表 164 欄）。白名單是從 `07-coach-dashboard.js`、
  `05-feedback-readiness.js`、`02-core-utils.js` 的實際屬性存取**與字串欄位名**
  自動推導出來的 —— `computeAlerts` 裡的 `num(r, 'technicalAvg')` 這種只以字串出現的
  欄位（602/1812 列有資料），純屬性掃描會漏掉，漏掉就會讓「連續 3 天技術偏低」
  的警示從此不再亮。
- **不回**：`rawNutritionJson`、`studentLineText`、`coachLineText`、`parentLineText`、
  `nutritionLineText`、`nutritionAdviceStudent`（皆只在 `04-daily-submit.js` 寫入，
  後台沒有任何讀取端）。
- `fields` 仍回**完整**欄位清單，前端把沒回傳的欄位補成空字串 ——
  下游物件的鍵一個都不會少，白名單外的欄位是 `''` 而不是 `undefined`，不會炸。
- 後端**不做 dedupe**，同人同日的多筆完整回傳，維持由前端 `dedupeLatestByName` 處理。

---

## 版本握手

`APP_VERSION`（`js/01-config-data.js`）對 `API_VERSION`（`Code.gs`）。
後端把 `apiVersion` 掛在**每一個**回應上（`ping` 自然也有），
所以握手**不需要多打任何一支請求**。不一致時教練後台頂端顯示：

> ⚠️ 前後端版本不同，請重新部署 Apps Script

`tests/coach-dashboard-fields.test.js` 會檢查 repo 內兩個常數是否一致，
避免有人只改一邊就 push。

---

## 測試結果

```
backend-schema                 74/74
records-paging                 21/21
coach-dashboard-scale          25/25   ← 2000 / 5000 列 × 164 欄
coach-dashboard-fields          9/9    ← 白名單防腐
read-optimization               7/7
submit-performance             12/12
login-stability                 6/6
records-paging.browser          9/9
coach-dashboard-reliability    16/16   ← 真實頁面
daily-kpi-refactor.smoke       87/87   （no page errors）
--------------------------------------
合計                          266/266
```

規模測試（5000 列）實測：教練後台單頁最大 JSON 遠低於 2MB 安全上限，
分頁串接後不漏資料、不重複，白名單外欄位一個都沒漏出去。

---

## Apps Script 重新部署步驟

**順序不可顛倒**（先後端再前端；反過來會讓線上使用者呼叫尚不存在的 `getCoachDashboard`。
本次前端有自動退回機制，但仍會白白多一次往返）。

1. 開啟 Apps Script 編輯器，貼上新的 `apps-script/Code.gs`
2. **部署 → 管理部署作業 → 編輯（鉛筆）→ 版本：新版本 → 部署**
   （用 `redeploy` 沿用網址；**不要**用 `clasp deploy`，那會產生新網址）
3. 驗活：
   ```
   GET  /exec?action=ping
   → {"ok":true,"message":"pong","apiVersion":"2026-09-02.2"}
   ```
   `apiVersion` 必須等於 `js/01-config-data.js` 的 `APP_VERSION`
4. 在 `DEPLOY_LOG.md` 補一行（日期／版本號／commit／內容）
5. `git push` 前端；GitHub Pages 約 1–2 分鐘生效
6. 教練後台按「🔄 重新整理資料」，確認：
   - 「準備度分組與快速回覆」有出現五組名單
   - 「風險追蹤」「今日回覆」有內容
   - 頂端沒有版本不一致的橫幅

> 第一次開啟會自動重新整理一次（service worker 版號變動觸發 `controllerchange`），
> 這是既有設計，屬正常。

---

## Rollback

**前端**
```bash
git revert <merge commit>
git push
```
1–2 分鐘生效。

**後端**
Apps Script 編輯器 →「管理部署作業」→ 編輯 → 版本選回 **v83** → 部署。
網址不變。

**為什麼可以安全退版**：後端新增的 `keepFields` 與 `getCoachDashboard` 都是**新增**，
沒有改動任何既有 action 的行為；前端在 `getCoachDashboard` 不存在時會自動退回
`getAllRecords` 分頁路徑。因此「新前端 + 舊後端」與「舊前端 + 新後端」兩種組合都能運作，
不會出現只退一邊就開天窗的情況。

---

## 尚未處理（需要決策，不在本次範圍）

**`sweatLevel` 欄位裝的是 readiness 的 JSON。**
1290 列是 570 字左右的 `{"selfScore":...}`，只有 82 列是正常短值；
而這些列的 `readinessJson` 欄位全是空的。表頭沒有重複。
教練後台有讀 `r.sweatLevel`，等於現在讀到的是一包 JSON 而不是排汗程度。

這牽涉既有資料，動它屬於 migration（AGENTS.md 的 STOP 條件），因此**本次未碰**。
可選路線：
1. 只修寫入端（風險低，歷史資料仍是壞的）
2. 連同既有 1290 列搬回 `readinessJson`（需先備份整張表，並先跑 dry-run）
