# Google Sheet 表頭（請用 setupSheet 自動建立）

## 用法

1. 開啟你的 Google Sheet（與 Apps Script 綁定的那一份）。
2. 開啟 **擴充功能 → Apps Script** 編輯器。
3. 函式下拉選 `setupSheet`，按「執行」（第一次會要求授權）。
4. 完成後 `records` 工作表與正確表頭會自動建立／更新，欄位順序保證與程式一致。

> 不需要、也請不要手動把表頭貼到 A1（會欄位錯位）。詳見下方「重要」說明。

---

## ⚠️ 重要：請「不要」再手動貼表頭

早期版本曾提供一行 tab 表頭給大家貼到 A1。**現在請勿這樣做。**

原因：為了讓 100+ 筆舊資料自動對位，`Code.gs` 已把
`sleepHours, sleepQuality, soreness, rpe, injuryArea, recoveryScore, recoveryState, redLightCategories`
這 8 欄從「中間」移到「最後面」，並陸續新增 `absenceReason / absenceMiss / absenceCatchup / absenceHonesty / absenceReflection` 等欄位。
舊版的手動表頭順序已經和程式不一致，**手動貼會造成整批欄位錯位、資料讀錯**。

### ✅ 正確做法（只要一步）

在 **Apps Script 編輯器**，函式下拉選 `setupSheet`，按一次「執行」。
系統會自動建立 / 補齊 `records`、`roster`、`parents`、`attendance_reports`、`appdata` 工作表，
表頭順序永遠以 `Code.gs` 的 `HEADERS` 為準，新增欄位都接在最後、不影響舊資料。

> 表頭的「唯一真實來源」是 `Code.gs` 裡的 `HEADERS` 陣列。要看欄位順序請直接看那裡，本檔只做欄位說明用。

---

## 欄位說明

| 欄位 | 說明 |
| --- | --- |
| timestamp | 送出時間（ISO 字串） |
| date | 訓練日期 yyyy-MM-dd |
| name | 選手姓名 |
| gradeClass | 年級／班級 |
| group | 組別 |
| trainingTopic | 今日訓練主題 |
| bodyStatus | 今日身體狀態 |
| sleepHours / sleepQuality | 睡眠時數／睡眠品質 |
| soreness / rpe / injuryArea | 痠痛程度／主觀強度 RPE／受傷部位 |
| heightCm | 身高 cm |
| weightKg | 今日體重 kg |
| targetWeightKg | 目標體重 kg |
| bmi | 自動計算 BMI |
| weightGap | 距離目標體重差距（體重 − 目標） |
| breakfast | 今日早餐 |
| lunch | 今日午餐 |
| dinner | 今日晚餐 |
| snacksDrinks | 今日點心／飲料 |
| waterIntake | 今日水量 |
| lateNightSnack | 今日是否有宵夜 |
| trainingIntensity | 今日訓練強度 |
| physicalAvg | 體能狀態平均 |
| technicalAvg | 技術狀態平均 |
| focusAvg | 專注力平均 |
| disciplineAvg | 自律態度平均 |
| emotionAvg | 情緒控制平均 |
| tacticalAvg | 戰術執行力平均 |
| totalScore | 總分（商業版量表為 30 項加總，滿分 150；舊紀錄依原題數保留） |
| averageScore | 平均分數（新紀錄為總分 / 10；舊紀錄為總分 / 6） |
| status | 🟢/🟡/🔴 燈號狀態 |
| recoveryScore / recoveryState | 疲勞與恢復指數／恢復狀態 |
| redLightCategories | AI 紅燈原因分類 |
| lowItems | 最低三項（以｜分隔） |
| improveTargets | 舊版「今天我要改善」欄位，保留供舊資料相容 |
| mainGoalToday | 舊版「今天我最想做到的一件事」欄位，保留供舊資料相容 |
| reflection | 今日心得 |
| tomorrowGoal | 明日目標 |
| encouragementToTeammate | 隊友鼓勵 |
| nutritionRisks | 飲食風險（以、分隔） |
| nutritionAdviceStudent | 選手版飲食建議 |
| nutritionAdviceParent | 家長版飲食建議 |
| nutritionAdviceCoach | 教練版飲食觀察（JSON） |
| studentLineText | 選手版 LINE 文字 |
| parentLineText | 家長版 LINE 文字 |
| coachLineText | 教練版 LINE 文字 |
| nutritionLineText | 純飲食建議 LINE 文字 |
| rawScoresJson | 全部細項分數（JSON，供重新計算最低項） |
| rawNutritionJson | 飲食分析原始結果（JSON） |
| recordId | 每筆唯一 ID（供教練複評、選手回應定位更新） |
| coachPhysicalAvg ~ coachTacticalAvg | 教練複評：六大面向分數 |
| coachTotalScore / coachAverageScore / coachStatus | 教練複評：總分／平均／燈號 |
| coachComment | 教練評語 |
| studentResponse | 選手對這筆的看法（交叉辯論） |
| coachReply | 教練回覆選手 |
| reviewUpdatedAt | 複評／回應最後更新時間 |
| encourageTeammateName | 想鼓勵的隊友（選填） |
| parentNote | 家長留言給教練 |
| mode | 紀錄類型：`standard`（6 面向）或 `freestyle`（自由品勢） |
| freestyleTotal | 自由品勢總分（100 分制） |
| freestyleStatus | 自由品勢 4 級燈號（綠／黃綠／黃／紅） |
| freestyleDifficulty ~ freestyleSafety | 自由品勢六加權類別分數（技術難度／動作完成度／音樂與節奏／創意編排／表現力／安全與穩定，皆 0–100） |
| rawFreestyleScoresJson | 自由品勢 10 項細項分數（JSON） |
| freestyleLineText | 自由品勢建議版 LINE 文字 |
| musicName / musicSeconds | 音樂名稱／秒數 |
| freestyleTheme / practiceSection | 自由品勢主題／今日練習段落 |
| aerialSuccessRate / spinSuccessRate / acroSuccessRate | 空中踢擊／旋轉／特技動作成功率（%） |
| comboKickCount / landingErrors / breakCount | 連續踢擊完成數／落地失誤次數／動作中斷次數 |
| needVideoFix | 是否需要影片修正（是／否）｜目前前端未使用 |
| focusEightCount | 今日最需要修正的 8 拍｜目前前端未使用 |
| aerialKickCount | 空中踢擊完成幾腳 |
| unlockedMoves | 解鎖哪些高難度動作 |
| redLightReason / redLightHandling / redLightNote | 教練後台紅燈處理紀錄：原因、處理方式、備註 |

共 **103 欄**。前段為學生基本資料、KPI、飲食與 LINE 文字，後段接交叉辯論／教練複評、隊友鼓勵名／家長留言、自由品勢、紅燈處理、未出席反思、AI 教練回饋與心情紀錄。重新部署後在 Apps Script 編輯器執行一次 `setupSheet()` 即可自動補欄。

> 註：自由品勢前端目前只填「主題、空中踢擊完成幾腳、落地失誤幾次、解鎖哪些高難度動作」＋10 項評分拉桿；其餘 freestyle 欄位（成功率、練習段落、影片修正、8 拍…）保留在表頭但不寫入，作日後擴充用。
