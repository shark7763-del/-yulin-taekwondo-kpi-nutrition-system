# SYSTEM_CONTRACT.md — 系統契約

標記說明：

- **LOCKED** — 不可更動。改了會破壞既有資料或讓線上使用者中斷。
- **COMPATIBLE_CHANGE_ONLY** — 只能往後相容地擴充（例如加欄位加在最後），不可改既有語意。
- **SAFE_TO_CHANGE** — 可以自由調整。

---

## 1. 選手身分 Athlete identity — **LOCKED（且目前有已知缺陷，見 DATA_CONTRACT.md §1）**

| 欄位 | 來源 | 穩定性 |
|---|---|---|
| `studentId` | 後端 `student_accounts` 產生 | **穩定**，權威 |
| `athleteId` | 前端 `getAthleteIdForName()` 依名單**陣列索引**產生 | **不穩定** |
| `name` / `studentName` | 使用者輸入 | 可被改名 |

`athleteId` 的產生方式**不得在未提出 migration 計畫並取得同意前更動**。
現況缺陷已記錄在 `DATA_CONTRACT.md`，未經核准不得逕行修正。

## 2. KPI schema — **COMPATIBLE_CHANGE_ONLY**

六大面向的**內部鍵**是 legacy 名稱，全站（雷達圖、月報、準備度、`findLowItems`）都吃這組：

```
physical / technical / focus / discipline / emotion / tactical
```

新的顯示名稱 `mental / attitude / recovery` 透過 `js/14-kpi-refactor.js` 的
`DAILY_ASPECTS[].legacy` 對應回去。**移除這個對應會讓 `focusAvg`、
`disciplineAvg`、`emotionAvg` 全部變空。**

`totalScore` 歷史上有 **三種滿分**（舊 /50、中期 /150、現行 /30）。
**不要直接讀 `totalScore` 做比較** —— 用 `averageScore`（恆為 1–5）或 `scorePercent()`。

## 3. Google Sheet 表頭 — **LOCKED**

- 第一列表頭**不可重寫、不可重排、不可刪欄**。
- 新欄位一律**只能接在最右邊**，透過 `appendMissingHeaders_()`（append-only，預設乾跑）。
- `setupSheet()` 已停用，不得恢復。
- 欄位對應靠**名稱**（`auditHeaders_` / `canonicalMap`），不是位置索引。

工作表：`records`, `roster`, `parents`, `attendance_reports`, `student_accounts`,
`coach_settings`, `kpi_sessions`, `weekly_kpi_reports`, `coach_scores`, `ai_scores`,
`training_tasks`, `risk_flags`, `coach_replies`, `student_traits`, `mental_*`（7 張）。

## 4. Apps Script actions — **LOCKED（只能新增，不可改名或移除）**

前端一律透過 `postToWebApp({ action, ... })` 呼叫，後端在 `handleAction()` 分派。
**改名等同破壞線上使用者**（他們的瀏覽器仍跑舊前端）。

## 5. API request / response 契約 — **COMPATIBLE_CHANGE_ONLY**

- 回應一律是 JSON 物件，成功為 `{ ok: true, ... }`，失敗為 `{ ok: false, error }`。
- 失敗時可帶 `authRequired` / `forbidden` / `consentRequired` / `capped` / `errorCode`。
- `action` **同時**放在 POST body 與 query string（`/exec?action=xxx`）——
  這是為了防止 302 轉址把 POST 退化成無 body 的 GET 之後，後端誤走 `ping`。
  **不要移除 query string 那份。**

## 6. localStorage keys — **LOCKED**

已在用的 key（改名 = 使用者資料消失）：

```
yulin_players          yulin_webapp_url      yulin_local_records
yulin_form_draft       yulin_parents         yulin_attendance_reports
yulin_coach_scores     yulin_role            yulin_brand
yulin_line_adminkey    yulin_trait_cache     yulin_trait_cache_version
yulin_trait_last_sync_state                  yulin_trait_pending_sync
yulin_mental_local_v2  yulin_app_<key>（動態前綴）
teampro_coach_replies  teampro_ai_config_cache
teampro_psych_cards    teampro_weekly_kpi_state_<sessionId>（動態前綴）
```

註：只有前 7 個宣告在 `LS_KEYS`，其餘散落各檔以字面字串使用。

## 7. 登入角色 — **LOCKED**

`student` / `parent` / `coach`。分頁權限定義在 `ROLE_TABS`（`js/09-settings-auth.js`）。

- 教練看不到選手填寫頁（`student` 不在 coach 的 allowed 清單）——**這是刻意的**。
- 舊制姓名登入的後端旁路**已於資安稽核 B-01 移除**，不得恢復。

## 8. 家長權限 — **LOCKED**

家長只能看到**自己孩子**的資料，且不得看到：
每日體重明細、尿液、疼痛部位、解憂信箱內容、教練私密備註、其他選手任何資料。

後端以 `recordsForIdentity()`（優先 `studentId`，否則 `normalizeName` 比對）與
`parentRecordSummary()` 遮蔽欄位。**這是隱私邊界，任何改動都要有測試。**

## 9. 教練權限 — **LOCKED**

資料類 action 一律 `requireRole(data, ['coach'])`。
`ADMIN_KEY` 未設定時**必須 fail closed**（資安稽核 B-04）。

## 10. 關鍵 DOM id — **LOCKED**

改這些會靜默壞掉（多為 JS 直接 `getElementById`）：

```
name  group  date  kpiContainer  standardKpiSection  absenceReasonWrap
freestyleSection  encourageFold  mealsFold  gratitude  encourageTeammate
reflection  tomorrowGoal  coachDate  coachRedLight  coachQuickScoreList
coachReadinessGroups  coachRiskTracking  coachKpiManage  studentKpiCard
todayReportedList  lastPerfSummaryRow  loginOverlay  schemaStatus
```

⚠️ `#name`、`#encourageTeammate`、`#lastPerfName` 等是**由 localStorage 名單餵養的
`<select>`**。設定一個不在選項裡的值會**靜默變成空字串**。

## 11. 日期格式 — **COMPATIBLE_CHANGE_ONLY**

- 標準格式：`yyyy-MM-dd`（`normDate()`）
- 顯示格式：`yyyy/MM/dd`（`dateSlash()`）
- Sheet 會把日期字串轉成 `Date` 物件，JSON 序列化後變成 UTC ISO —— **比較日期前一定要先 `normDate()`**。

## 12. recordId — **LOCKED**

前端產生：`'r' + Date.now() + '_' + random`。
`addRecord` 的 upsert **必須保留原有 `recordId`**，否則教練複評會斷鏈。
舊資料可能沒有 `recordId`，`updateRecord()` 會明確回報錯誤而不是靜默失敗。

## 13. 草稿格式 — **COMPATIBLE_CHANGE_ONLY**

存在 `yulin_form_draft`。基礎欄位由 `js/10-init.js` 的 `DRAFT_FIELDS` 定義，
`js/14-kpi-refactor.js` 另外加掛 `_dailyScores` / `_reflectionMeta` / `_painCoachInformed`。
草稿有「僅限當天」的過期規則。

---

## SAFE_TO_CHANGE

- UI 文案、按鈕文字、提示訊息
- 顏色、間距、排版
- 新增（不是修改）Sheet 欄位，走 append-only 流程
- 新增（不是改名）Apps Script action
- 新增測試
