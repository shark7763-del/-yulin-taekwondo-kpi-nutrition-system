# Google Sheet 表頭（可直接複製貼上）

## 用法

1. 開啟你的 Google Sheet。
2. 在第一個工作表，把名稱改成 `records`（小寫，與 `Code.gs` 的 `SHEET_NAME` 一致）。
3. 點選 **A1 儲存格**。
4. 複製下面「一行 tab 分隔」的表頭，貼到 A1。
   - Google Sheet 會自動把 tab 分隔的內容拆成一欄一欄，剛好填滿 A1 到 AR1。
5. 完成後第一列就是正確的欄位順序。

> 也可以不手動貼，直接在 Apps Script 編輯器執行一次 `setupSheet()`，系統會自動建立 `records` 工作表與表頭。

---

## 一行 tab 分隔表頭（複製這一整行）

```
timestamp	date	name	gradeClass	group	trainingTopic	bodyStatus	heightCm	weightKg	targetWeightKg	bmi	weightGap	breakfast	lunch	dinner	snacksDrinks	waterIntake	lateNightSnack	trainingIntensity	physicalAvg	technicalAvg	focusAvg	disciplineAvg	emotionAvg	tacticalAvg	totalScore	averageScore	status	lowItems	improveTargets	mainGoalToday	reflection	tomorrowGoal	encouragementToTeammate	nutritionRisks	nutritionAdviceStudent	nutritionAdviceParent	nutritionAdviceCoach	studentLineText	parentLineText	coachLineText	nutritionLineText	rawScoresJson	rawNutritionJson
```

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
| totalScore | 總分（六大面向平均加總，滿分 30） |
| averageScore | 平均分數（總分 / 6） |
| status | 🟢/🟡/🔴 燈號狀態 |
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

共 **44 欄**（A 到 AR）。
