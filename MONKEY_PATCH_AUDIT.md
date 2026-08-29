# MONKEY_PATCH_AUDIT.md

`js/14-kpi-refactor.js` 在載入時覆寫 8 個全域函式。它是 `index.html` 最後載入的
應用腳本之一，所以它的定義會贏。

⚠️ **實際載入順序不是檔名數字順序**：
`01…09 → 11 → 12 → 13 → 10 → monthly-report → kpi-session → 14 → psych-cards`

| 函式 | 原始位置 | 覆寫位置 | 呼叫者 | 原本的副作用 | 風險 | 建議 |
|---|---|---|---|---|---|---|
| `buildRecord` | `js/04-daily-submit.js:113` | `14:547`（**有**鏈接 `__origBuildRecord`） | 送出流程 | 建立完整紀錄含 legacy 面向平均、營養、恢復 | 覆寫版在原版算完後**再次覆蓋** `totalScore/averageScore/status/lowItems`。兩條路徑算同一批欄位，改一邊會靜默分歧 | 保持現狀；若要動，刪掉冗餘那條而不是加第三條 |
| `saveDraft` / `restoreDraft` / `clearForm` | `js/10-init.js:340/358/277` | `14:577/582/590`（**有**鏈接） | 自動存草稿、初始化、清空鈕 | 草稿持久化、`recalcKpiSummary()` | 正確鏈接。`recalcKpiSummary()` 現在是安全的 no-op（沒有 `.kpi-slider` 了） | 無 |
| `validateForm` | `js/03-forms-scoring.js:1397` | `14:411` | 送出鈕 | 必填檢查 **＋** 30 根拉桿必須都滑過 | **⚠️ 覆寫版從不呼叫 `__origValidateForm`** —— 是**完全取代**，不是包裹。原版整段是死碼。未來有人把新必填欄位加到舊清單，永遠不會被檢查 | 已在 14 檔加註說明；不要嘗試「還原」原版（它要求已不存在的 DOM） |
| `renderKpiSliders` | `js/03-forms-scoring.js:22` | `14:603` | 組別 select 的 change、`restoreDraft` | `currentGroup = group`；切換 `#freestyleSection`；**呼叫 `toggleAbsenceReason(group)`**；建 30 拉桿 UI | **這裡發生過真實事故**：覆寫版曾漏掉 `toggleAbsenceReason` 與 freestyle 切換，導致選了「未出席訓練」後原因欄位不出現、但驗證又要求填 → **表單完全送不出去**。已修復並有專屬回歸測試 | 已修；`currentGroup` 不再被維護（見下） |
| `updateDailyKpiVisibility` | `js/02-core-utils.js:191` | `14:389` | `setDailyKpiAvailability` | 依每週 KPI session 決定是否顯示 | 刻意改為：每日六面向與每週 KPI 脫鉤，恆顯示（未出席除外） | 無 |
| `isDailyKpiAvailable` | `js/02-core-utils.js:200` | `14:646`（`return true`） | `04:119`、`03:96` | 原本綁在每週 session | 三個呼叫點都查過；`09:1107` 已配合修正 | 無 |
| `toggleAbsenceReason` | `js/03-forms-scoring.js:88` | `14:648`（**有**鏈接） | `renderKpiSliders`、`clearForm`、組別 change | 顯示/隱藏未出席欄位與 `.training-only` | 正確鏈接 | 無 |

## 已知遺留問題

**P1 — 死捕捉會誤導人**
`window.__origValidateForm`（`14:629`）與 `window.__origRenderKpiSliders`（`14:630`）
被存下來但**從未被呼叫**。它們看起來像是有在鏈接。
未來若有人為了「還原原本行為」而呼叫 `__origValidateForm()`，會復活一套
**永遠不可能通過**的驗證（它要求 `#kpiContainer .kpi-slider`，那些元素已不存在）。

**P2 — 兩套「回報有用度」計分並存**
`computeReportUsefulness()`（`js/05-feedback-readiness.js:646`，**0–100**）
vs `reportUsefulness()`（`js/14-kpi-refactor.js:329`，**0–4**）。
`buildRecord` 優先用前者，後者只在前者未載入時後備。
載入順序若改變，`reportUsefulnessScore` 會從 0–100 悄悄變成 0–4。

**P2 — `currentGroup` 已成唯寫死狀態**
`js/02-core-utils.js:181` 宣告，只有原版 `renderKpiSliders`（已被取代）會寫入，
**全 repo 沒有任何地方讀它**。今天安全純粹因為沒人讀。

**P2 — 重複實作**
- `journalReadinessValue()`（`js/08-profile-journal.js:338`）與
  `scorePercent()`/`readinessTrendValue()`（`js/03-forms-scoring.js:1136`）
  各自實作同一套 /50 vs /150 啟發式
- `trendChartSVG()` 與 `jrTrendChart()` 是兩套獨立的 SVG 折線圖產生器

## 原則

**一個核心功能只能有一個正式實作。**
不可長期存在 `oldSaveDraft` / `newSaveDraft` / `overrideSaveDraft` 這種並存。

移除覆寫時：**一次只合併一個，合併完立刻跑回歸測試。**
