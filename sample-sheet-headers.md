# Google Sheet 表頭（可直接複製貼上）

## 用法

1. 開啟你的 Google Sheet。
2. 在第一個工作表，把名稱改成 `records`（小寫，與 `Code.gs` 的 `SHEET_NAME` 一致）。
3. 點選 **A1 儲存格**。
4. 複製下面「一行 tab 分隔」的表頭，貼到 A1。
   - Google Sheet 會自動把 tab 分隔的內容拆成一欄一欄，剛好填滿 A1 到 CR1。
5. 完成後第一列就是正確的欄位順序。

> 也可以不手動貼，直接在 Apps Script 編輯器執行一次 `setupSheet()`，系統會自動建立 `records` 工作表與表頭。

---

## 一行 tab 分隔表頭（複製這一整行）

```
timestamp	date	name	gradeClass	group	trainingTopic	bodyStatus	sleepHours	sleepQuality	soreness	rpe	injuryArea	heightCm	weightKg	targetWeightKg	bmi	weightGap	breakfast	lunch	dinner	snacksDrinks	waterIntake	lateNightSnack	trainingIntensity	physicalAvg	technicalAvg	focusAvg	disciplineAvg	emotionAvg	tacticalAvg	totalScore	averageScore	status	recoveryScore	recoveryState	redLightCategories	lowItems	improveTargets	mainGoalToday	reflection	tomorrowGoal	encouragementToTeammate	nutritionRisks	nutritionAdviceStudent	nutritionAdviceParent	nutritionAdviceCoach	studentLineText	parentLineText	coachLineText	nutritionLineText	rawScoresJson	rawNutritionJson	recordId	coachPhysicalAvg	coachTechnicalAvg	coachFocusAvg	coachDisciplineAvg	coachEmotionAvg	coachTacticalAvg	coachTotalScore	coachAverageScore	coachStatus	coachComment	studentResponse	coachReply	reviewUpdatedAt	encourageTeammateName	parentNote	mode	freestyleTotal	freestyleStatus	freestyleDifficulty	freestyleCompletion	freestyleMusic	freestyleCreativity	freestyleExpression	freestyleSafety	rawFreestyleScoresJson	freestyleLineText	musicName	musicSeconds	freestyleTheme	practiceSection	aerialSuccessRate	spinSuccessRate	acroSuccessRate	comboKickCount	landingErrors	breakCount	needVideoFix	focusEightCount	aerialKickCount	unlockedMoves	redLightReason	redLightHandling	redLightNote
```

> 💡 `recordId` 起是「交叉辯論／教練複評」、自由品勢與紅燈處理紀錄功能用的欄位，**不用手動補**——只要在 Apps Script 編輯器重新執行一次 `setupSheet()`，系統會自動把工作表補到最新欄位。

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
| totalScore | 總分（新紀錄為 10 項加總，滿分 50；舊紀錄保留滿分 30） |
| averageScore | 平均分數（新紀錄為總分 / 10；舊紀錄為總分 / 6） |
| status | 🟢/🟡/🔴 燈號狀態 |
| recoveryScore / recoveryState | 疲勞與恢復指數／恢復狀態 |
| redLightCategories | AI 紅燈原因分類 |
| lowItems | 最低三項（以｜分隔） |
| improveTargets | 今天我要改善（勾選項，以｜分隔） |
| mainGoalToday | 今天我最想做到的一件事 |
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

共 **96 欄**。前 52 欄為學生紀錄、KPI、恢復指數、飲食與 LINE 文字，接著為交叉辯論／教練複評、隊友鼓勵名／家長留言、自由品勢與紅燈處理紀錄。重新部署後在 Apps Script 編輯器執行一次 `setupSheet()` 即可自動補欄。

> 註：自由品勢前端目前只填「主題、空中踢擊完成幾腳、落地失誤幾次、解鎖哪些高難度動作」＋10 項評分拉桿；其餘 freestyle 欄位（成功率、練習段落、影片修正、8 拍…）保留在表頭但不寫入，作日後擴充用。
