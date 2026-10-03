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
