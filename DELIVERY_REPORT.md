# 交付報告 — 育林國中技擊隊 KPI 系統

日期：2026-08-12
執行流程：Inspect → Audit → Reproduce → Fix → Test → Regression → Document
搭配文件：[`AUDIT_REPORT.md`](AUDIT_REPORT.md)

---

## 1. SYSTEM_SCORE

| 面向 | 配分 | Before | After | 說明 |
|---|---|---|---|---|
| 功能完整度 | 20 | 17 | 17 | 功能本來就非常完整（過度完整）。這次沒有加功能，也沒有刪功能。 |
| 穩定性 | 20 | 9 | 14 | 修掉送出流程的靜默崩潰、配額炸裂、PWA 隨機重載；補上全域錯誤攔截。但 in-flight/重試狀態機尚未全面。 |
| 安全性 | 20 | **3** | 15 | Before 是「知道姓名就能讀未成年選手的健康與心理資料，一條網址即可」。已修 7 個 P0，但仍有 admin key 存 localStorage、無 idempotency、部分動作缺 server-side 覆蓋率複核。 |
| UX | 15 | 8 | 9 | 只修了會擋住人的部分（睡眠驗證死結、失敗演成功、人話錯誤訊息）。教練 30 秒測試與學生 90 秒目標**尚未達成**。 |
| 資料可靠性 | 15 | 7 | 12 | 併發鎖、公式注入防護、帳號誤刪防護、時區固定。仍以姓名為事實主鍵（C-04）。 |
| 維護性 | 10 | 4 | 8 | 從零測試 → 45 單元＋14 E2E＋部署前語法檢查＋稽核文件。大型函式與死碼仍在。 |
| **總分** | **100** | **48** | **75** | |

安全性 Before 給 3 分不是修辭。那個漏洞可被任何知道選手姓名的人用一條連結利用，
而 `/exec` 網址就公開在前端原始碼裡，對象是未成年人的健康與心理資料。

---

## 2. FIXED

### P0（7 項，全數修復）

| ID | 修了什麼 | 位置 |
|---|---|---|
| B-01 | 移除 7 條「用戶端自稱身分」的旁路；`legacyLoginEnabled()` 改為預設關閉 | Code.gs:829, 978-1005, 1066, 1317, 3060, 3593, 3661；js/09-settings-auth.js:337 |
| B-02 | 移除可寫入任意 `recordId` 的舊制分支 | Code.gs:1451 |
| B-03 | 補上兩處遺漏的 `escapeHtml`（含 HTML 屬性內） | js/07-coach-dashboard.js:1390, 1440 |
| B-04 | `checkAdminKey()` 由 fail open 改為 fail closed，比對改用 `safeEqual` | Code.gs:3876 |
| C-01 | 帳號去重移出讀取路徑；只刪可證明的空殼，其餘回報 `needsReview` | Code.gs:689-758 |
| C-02 | 新增 `sanitizeCellValue_()`，套用於 11 處寫入點 | Code.gs:601, +11 處 |
| C-03 | `addRecord` 加 `LockService`；比對讀取由 157 欄縮為 2 欄 | Code.gs:1488 |

### P1／P2（另外 10 項）

- **E-01**（閃退主因）`saveLocalRecord` 加上 120 筆上限與 try/catch，不再把 `QuotaExceededError` 丟進送出流程
- **A-02** `doSubmit` 補頂層 `catch`，訊息誠實地說「請確認是否已存入」而非叫人重送
- **D-08** 送出失敗不再渲染成功卡，改顯示可行動的失敗畫面＋重試鈕
- **A-03** 睡眠驗證死結：改檢查 `bedTime`/`wakeTime` 而非隱藏的 `sleepHours`
- **LEAD-01** `normDate`/`todayStr` 改用固定 +08:00，不再跟著裝置時區跑
- **B-05** `doGet` 加白名單，僅開放 `ping`/`getAuthConfig`
- **A-04/E-13** PWA 不再無條件 `location.reload()`；改為使用者決定何時更新
- **A-05** 教練後台重整加 in-flight 鎖與按鈕 disabled
- **D-09** 教練載入失敗改人話訊息（分「登入過期／連線失敗／其他」三種下一步）
- **B-09** `.gitignore` 補 `key.txt`、`*.key`、`.env*`、`node_modules/`

### 新增基礎建設

- `js/00-error-guard.js` — 全域錯誤／promise rejection 攔截、本機環形診斷紀錄、
  開機來源記錄（正常開啟／重整／SW 重載）、配額安全寫入、教練看得懂的錯誤橫幅
- `tests/harness.js` — 讓 node 能載入原本只跑瀏覽器的全域腳本（不改任何產品程式碼）
- `tests/unit/*.test.js` — 45 個單元測試
- `tests/e2e/` ＋ `playwright.config.js` — 14 個 E2E
- `tests/check-syntax.js` — 部署前語法檢查＋index.html 腳本存在性檢查
- `AUDIT_REPORT.md`、`DELIVERY_REPORT.md`

---

## 3. REMAINING

### 未修的 P1

| ID | 問題 | 為什麼還沒修 |
|---|---|---|
| A-01 | 前端無 idempotency key，無法區分「重送」與「新的一筆」 | 需前後端一起改；C-03 的鎖已把實際風險大幅降低 |
| C-04 | `records` 事實上以**姓名**為主鍵，`studentId` 沒貫穿查找/去重 | 是資料模型遷移，需先確認現有資料的 studentId 覆蓋率（NOT VERIFIED） |
| B-07 | LINE 管理密碼明文長期存於 localStorage | 需重新設計該操作流程 |
| C-05 | Apps Script／Sheet 時區未鎖進版控 | **NOT VERIFIED**，需擁有者先確認現值才能寫死 |

### 未動的原始需求（明確未完成，非「已完成」）

| 需求 | 狀態 |
|---|---|
| 第六節 Coach War Room 首屏重整 | **未做。** 已完成診斷：`#coachWarRoomGrid`/`#coachWarRoomList` 被 `style.css:137` 的 `display:none!important` 隱藏但仍每次計算（D-04）；教練首屏是 8 個純數字磚，可行動清單在下方且無 3-5 人上限（D-05）；「誰連續缺席」全系統從未實作（D-06）。**30 秒測試不通過。** |
| 第七節 學生表單瘦身至 60-90 秒 | **未做。** 已量測：21 個必填欄位，實際約 **100-140 秒**；KPI 開啟日再加 30 個滑桿，總計 4.5-5.5 分鐘。分層方案與逐欄位 tier 對照已寫在稽核附件。 |
| 第八節 統一 `KpiSessionPolicy` | **未做。** 需要先盤點前後端各自的 KPI 開放判斷，屬於較大的重構。 |
| 第十二節 全 API loading/success/error/retry | **部分完成**（送出與教練後台已做，其餘 API 未做） |
| 第十三節 OpenAI 五種失敗情境實測 | **未做。** 程式碼層面確認失敗會靜默退回模板，但未實際注入 429/timeout/malformed 驗證 |
| 第十八節 iPad／真實 iOS Safari | **NOT VERIFIED** |
| 第二十三節 README 全面同步 | **部分完成。** 已加安全性變更與測試章節；其餘章節（PIN 規則、家長驗證、session、AI、LINE）尚未逐條比對 |

---

## 4. P0 / P1 BUGS（完整清單）

見 [`AUDIT_REPORT.md`](AUDIT_REPORT.md)。摘要：

**P0（7，全修）**：B-01 身分驗證完全繞過 ／ B-02 任意紀錄寫入 ／ B-03 教練後台 XSS ／
B-04 管理權限 fail open ／ C-01 讀取路徑自動刪帳號 ／ C-02 Sheet 公式注入 ／ C-03 併發重複列

**P1（10，修 6）**：已修 B-05、B-08、A-02、A-03、D-08、E-01、LEAD-01；
未修 A-01、C-04、B-07、C-05

---

## 5. TEST RESULT

```
單元測試（node --test）                45 passed / 0 failed / 0 todo   ✅
  ├─ 日期與時區（含 4 個時區交叉驗證）                                ✅
  ├─ KPI 燈號、疲勞恢復指數、疼痛分級                                 ✅
  ├─ XSS 跳脫（escapeHtml）                                          ✅
  └─ Sheet 公式注入防護（sanitizeCellValue_）                         ✅

E2E（Playwright）                      14 passed / 0 failed           ✅
  ├─ desktop-chrome ×7                                               ✅
  └─ mobile-chromium ×7                                              ✅
  涵蓋：載入無未捕捉例外／腳本無 404／登入畫面／init() 完整執行／
        375・390・430px 無橫向溢出

部署前語法檢查                          17 檔全過                      ✅
Code.gs 語法                            通過                          ✅
```

### 明確 NOT VERIFIED（未測到就是未測到）

| 項目 | 為什麼 |
|---|---|
| Student E2E（完整流程 22 項） | **NOT VERIFIED** — 需要真實選手 PIN 與後端 session；無法在不碰正式 Google Sheet 的情況下跑 |
| Parent E2E | **NOT VERIFIED** — 需要真實家長手機號碼驗證 |
| Coach E2E | **NOT VERIFIED** — 需要教練密碼 |
| Auth isolation（跨選手／跨家長越權） | **程式碼層面已複驗並修復**，但**未做執行時滲透驗證** |
| Google Sheet 實際寫入／併發 | **NOT VERIFIED** — 未對正式 Sheet 執行任何寫入 |
| PWA 安裝／離線／更新 | **NOT VERIFIED** — 需實機 |
| 真實 iOS Safari／iPad | **NOT VERIFIED** — 未安裝 WebKit |
| 既有資料是否已被公式注入污染 | **NOT VERIFIED** — 需擁有者在 Sheet 搜尋 |
| 是否已有選手帳號被 C-01 誤刪 | **NOT VERIFIED** — 需擁有者比對名冊 |

**未對正式 Google Sheet 做過任何寫入或刪除操作。**

---

## 6. 「明天要給 40 人正式使用，還有哪些理由讓你不敢上線？」

### 🔴 會讓我直接說「先別上」的

1. **後端還沒重新部署。** 上面所有 P0 修正都在 `apps-script/Code.gs` 這個檔案裡，
   **還沒有推上 Google Apps Script**。在你按下「編輯現有部署 → 新版本」之前，
   正式環境的漏洞是**原封不動**的。這是目前最大的落差。

2. **不知道有沒有已經被利用過。** 漏洞可用一條 GET 網址觸發、不留下應用層記錄，
   我無法從程式碼判斷過去是否有人存取過。**這是未成年人的健康與心理資料**，
   如果要嚴謹處理，需要調閱 Apps Script 的執行記錄。

3. **不知道有沒有選手帳號已經被誤刪。** C-01 在讀取路徑上跑了不知道多久。

4. **沒有人在真實 iPhone 上開過修改後的版本。** 40 個使用者裡大部分是手機，
   而 iOS Safari 是唯一沒被自動測試涵蓋的平台。

### 🟡 會讓我說「可以上，但要盯著」的

5. **舊制登入關掉後，沒設 PIN 的選手明天會登不進去。** 這是刻意的安全取捨，
   但如果沒有先發啟用碼，明天早上會收到一批「我進不去」。**這是流程問題，不是 bug，
   但會變成你的麻煩。**

6. **教練 30 秒測試不通過。** 教練明天打開後台，看到的仍然是一排數字，
   要往下捲才知道該找誰。系統能用，但沒有解決「每天最需要注意誰」這個核心問題。

7. **學生要花 100-140 秒填完，不是 60-90 秒。** 國中生連續兩週後的回報率會掉，
   這是體感問題，不會有錯誤訊息告訴你。

8. **`records` 仍以姓名為主鍵。** 只要有兩位同名選手，或有人改名，資料就會串錯。

9. **沒有備份機制。** 全部資料在一張 Google Sheet 上，沒有定期匯出。
   在做任何 schema 相關變更前，建議先手動「建立副本」。

### 🟢 已經不再擔心的

- 開頁白畫面／init 中途崩潰 — 已實測排除
- 送出後畫面死掉 — 已修（配額 ＋ 頂層 catch）
- PWA 使用中被強制重載 — 已修
- 送出失敗卻顯示成功 — 已修
- 欄位錯位／setupSheet 破壞資料 — 結構上不會發生（已複驗）
- LINE 掛掉影響資料寫入 — 後端本來就正確隔離（已複驗）
- 全域命名衝突 — 掃描 549 個宣告，零衝突

---

## 建議的上線順序

1. 先在 Google Sheet 建立副本（備份）
2. 重新部署 Apps Script（編輯現有部署 → 新版本）
3. 用 `?action=ping` 確認部署成功
4. 確認兩個時區設定
5. 在 Sheet 搜尋 `=IMPORT`／`=HYPERLINK` 確認歷史資料
6. 比對 `student_accounts` 列數與實際選手數
7. 批次產生啟用碼並發給尚未設 PIN 的選手
8. 自己用一支 iPhone 走完一次完整送出流程
9. 才推前端到 GitHub Pages
