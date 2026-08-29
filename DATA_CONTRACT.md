# DATA_CONTRACT.md — 資料契約

本文件描述**系統實際使用中**的資料格式（不是理想設計）。
所有欄位都經由讀取 `js/04-daily-submit.js` 的 `buildRecord()`、
`js/14-kpi-refactor.js` 的覆寫版，以及 `apps-script/Code.gs` 的 `HEADERS` 核對過。

---

## 1. ⚠️ 選手身分：已知 P0 缺陷（尚未修正，需核准）

### 現況

`getAthleteIdForName()`（`js/02-core-utils.js:15`）：

```js
const players = getPlayers();               // 讀 localStorage['yulin_players']
const idx = players.indexOf(n);
if (idx >= 0) return 'S' + String(idx + 1).padStart(3, '0');   // ← 陣列索引！
// 找不到 → 姓名雜湊，回 'S' + 4 位數
```

`athleteId` 是**該裝置當下名單快取中的陣列位置**。

### 實測證據（2026-08-29，Chromium 實跑）

名單 `[甲, 乙, 丙, 丁]`，教練刪除「乙」之後：

| 選手 | 刪除前 | 刪除後 |
|---|---|---|
| 甲 | S001 | S001 |
| 丙 | **S003** | **S002** |
| 丁 | **S004** | **S003** |

→ 丁 的新紀錄變成 `S003`，而 `S003` 是**丙的歷史紀錄**所使用的 ID。
**兩個不同的人在資料中共用同一個 `athleteId`。**

全新裝置（localStorage 沒有名單）：

```
#name 下拉只有 1 個佔位選項
sel.value = '王小明'          → 靜默變成 ''
getAthleteIdForName('王小明')  → 'S2122'（雜湊分支，4 位數）
```

`loadRosterFromServer()` **只在教練設定頁被呼叫**（`js/09-settings-auth.js:138, 907`），
學生的每日填寫流程從不同步名單 → 同一個人在不同裝置會拿到不同 `athleteId`。

### 影響範圍

| 操作 | 既有 athleteId 是否改變 |
|---|---|
| 在名單**最後新增**選手 | 否（安全） |
| **刪除**選手 | **是** —— 其後所有人往前移 |
| **重排**名單（匯入 JSON） | **是** |
| **改名**（就地修改） | 索引不變，但其他裝置可能落入雜湊分支 |
| 換裝置 / 清快取 | **是** —— 落入雜湊分支 |

### 兩套並行的身分系統

- `studentId` —— 後端 `student_accounts` 產生，**穩定、權威**。
  學生送出時 `addRecordAuthorized()` 會以 session 蓋上正確值。
- `athleteId` —— 上述不穩定值。

後端有約 15 處寫成 `payload.athleteId || payload.studentId`，
**把兩者當成可互換 —— 但它們不是同一個值域。**

### 尚未執行的修正（需核准）

任何修正都**不得改寫既有資料**。可行方向（依風險由低到高）：

1. 讀取端優先採用 `studentId`，`athleteId` 僅作為舊資料的後備比對鍵
2. 新紀錄的 `athleteId` 改由後端以 `studentId` 為準蓋上（前端值僅供無帳號情境）
3. 引入 canonical id（例如 `YL-A0001`）並保留 legacy 對照表

**在取得同意前不得執行任何 migration。**

---

## 2. 姓名解析（name drift）

同一個概念在至少 9 處以不同順序解析，**precedence 不一致**：

| 位置 | 邏輯 |
|---|---|
| `js/02-core-utils.js:119` `recordName()` | `r.name \|\| r.studentName \|\| r.athleteName` |
| `js/07-coach-dashboard.js:299,2418` | `row.studentName \|\| row.name` ← 順序相反 |
| `js/12-research-data.js:49` | `rec.name \|\| rec.studentName`（沒有 athleteName） |
| `monthly-report.js:695` | `r.studentName \|\| r.name` |

兩套正規化函式，強度不同且未一致套用：

- 後端 `normalizeName()`（`Code.gs:812`）：**只有 trim**
- 前端 `normalizeNameKey()`（`js/02-core-utils.js:131`）：NFKC + 去所有空白 + 轉小寫

⚠️ `getLastRecordByName()`（`Code.gs:1896`）用 **raw `String(r.name) === String(name)`**，
且**經由 `saveCoachScore` 實際可達**（`Code.gs:1430`）。
若儲存格的姓名有多餘空白，教練評分會**靜默無法附加**到當日紀錄（`if (rec && ...)` 直接跳過）。

---

## 3. 每日紀錄的正式欄位（canonical，僅列實際存在者）

```
身分     recordId, name, studentName, athleteId(不穩定), studentId(穩定)
情境     timestamp, date, mode, schoolLevel, grade, classCode, gradeClass,
         group, groupType, trainingMinutes, trainingTopic, trainingSession,
         trainingIntensity
身體     heightCm, weightKg, targetWeightKg, bmi, weightGap, bodyStatus,
         sleepHours, sleepQuality, bedTime, wakeTime, soreness, rpe,
         injuryArea, painArea, painScore, painLevel, urineStatus, sweatLevel
飲食     breakfast, lunch, dinner, snacksDrinks, waterIntake, lateNightSnack,
         nutritionRisks, nutritionAdvice*, rawNutritionJson
KPI(舊)  physicalAvg, technicalAvg, focusAvg, disciplineAvg, emotionAvg,
         tacticalAvg, totalScore, averageScore, status, lowItems, rawScoresJson
KPI(新)  dailyPhysicalScore, dailyTechnicalScore, dailyTacticalScore,
         dailyMentalScore, dailyAttitudeScore, dailyRecoveryScore,
         instrumentVersion
心得     reflection, tomorrowGoal, gratitude, encouragementToTeammate,
         reflectionMetaJson, reportUsefulness, reportUsefulnessScore,
         reportUsefulnessJson
教練複評 coach*Avg, coachTotalScore, coachAverageScore, coachStatus,
         coachComment, studentResponse, coachReply, reviewUpdatedAt
準備度   selfScore, coachScore, readinessRecoveryScore, attendanceScore,
         riskPenalty, finalReadinessScore, readinessStatusLight, aiTags,
         trainingDirection, readinessJson
未出席   absenceReason, absenceMiss, absenceCatchup, absenceHonesty
心情     moodIndex, moodReason, emotionIndex
```

⚠️ `emotionIndex`（心情）與 KPI 面向鍵 `emotion`（其實是「生理/恢復」）
是**兩個不相干的概念**，名字卻極相似。

---

## 4. 分數量表：三種滿分並存

| 時期 | totalScore 滿分 | 判斷方式 |
|---|---|---|
| 舊 | 50 | — |
| 中期 | 150 | `scorePercent()` 用 `t > 50 ? 150 : 50` |
| 現行 | **30**（六面向 × 5 分） | **`scorePercent()` 不認得** |

**規則：不要直接讀 `totalScore` 做跨期比較。**
用 `averageScore`（恆為 1–5）或 `scorePercent()`（它會優先採用 `averageScore`，所以安全）。

已知殘留風險：`scorePercent()` 的 `totalScore` 後備分支會把現行的 `24`（滿分 30）
誤判為滿分 50 → 算出 48% 而非正確的 80%。僅在 `averageScore` 缺失時觸發。

---

## 5. Legacy 相容性集中在哪裡

| 類型 | 位置 | 是否集中 |
|---|---|---|
| 中文舊表頭 | `SHEET_HEADER_ALIASES` + `canonicalHeaderName_`（`Code.gs:509`） | ✅ 集中 |
| /50 vs /150 量表 | `scorePercent()`（`js/03-forms-scoring.js:1136`） | ✅ 集中（但不認得 /30） |
| 沒有 recordId 的舊資料 | `updateRecord()`（`Code.gs:1931`） | ✅ 單一檢查點，明確報錯 |
| 姓名 fallback 鏈 | 散落 **9 處**，precedence 不一致 | ❌ **未集中** |
| raw 姓名比對 | `getLastRecordByName`（`Code.gs:1896`） | ❌ **未集中** |

**方向（尚未執行）**：新增 `normalizeRecord()` 集中處理姓名 fallback 與量表換算，
讓 business logic 只吃 canonical 欄位。**一次只處理一類，不要一次搬完。**
