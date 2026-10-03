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
- 部署：**尚未部署**（待使用者授權 clasp 部署到 GAS；正式部署目前 @90，內容與 Phase 1 相同）。前端無變更。
