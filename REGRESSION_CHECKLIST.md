# REGRESSION_CHECKLIST.md

```bash
node tests/backend-schema.test.js        # 目前 27 項
node tests/daily-kpi-refactor.smoke.js   # 目前 67 項
```

兩支都必須綠，且**連跑兩次結果要一致**（測試不得打正式後端）。

圖例：**[A]** 已自動化 ／ **[M]** 只能手動 ／ **[!]** 目前**沒有**任何保護

---

## AUTH

- [!] 選手登入（正確 PIN 可進、錯誤 PIN 被擋、連續錯誤會鎖定）
- [!] 家長登入（首次完整手機、之後後四碼）
- [!] 教練登入（正確密碼可進、錯誤被擋）
- [A] 舊制姓名登入預設關閉、讀不到設定時不 fail-open
- [M] 錯誤登入不會進入系統

> ⚠️ `studentLogin` / `parentLogin` / `coachLogin` **目前完全沒有測試**。

## KPI

- [A] 每日六面向：卡片渲染、1–5 與 N/A、平均與燈號、面向鍵對應到 legacy 鍵
- [A] `buildRecord` 寫入六個 `dailyXxxScore`
- [A] 未出席訓練：原因欄位出現、訓練專用區塊收起
- [A] 自由品勢：額外欄位顯示
- [A] 心得六格必填、罐頭答案被擋
- [A] 明日目標
- [A] 完整表單 `validateForm() === true`（**基準測試，防止「因錯誤理由而通過」**）
- [A] 每週 30 項 KPI 表單建立、逐面向徽章
- [!] 每週 30 項 KPI **實際送出**與計分
- [M] 送出後 Google Sheet 最右邊 11 欄有值

## DRAFT

- [!] `saveDraft`
- [!] `restoreDraft`（含「僅限當天」過期規則）
- [!] `clearForm`

> ⚠️ 兩套實作（`10-init.js` + `14-kpi-refactor.js` 覆寫）互相包裹，**完全沒有測試**。

## ATHLETE

- [!] athleteId 正確
- [!] **名單重排後既有 athleteId 不變**
- [!] **刪除選手後其他人的 athleteId 不變**
- [A] 名單新增在最後不影響既有 ID（已由手動實驗證實，尚未寫成測試）

> ⚠️ 見 `DATA_CONTRACT.md` §1：目前**刪除或重排會改變既有 ID**，這是已知 P0。

## COACH

- [A] 讀取失敗時每個面板顯示原因，不偽裝成「今天沒人回報」
- [A] session 過期提供重新登入鈕
- [A] 風險追蹤只看選定日期往前 14 天
- [A] 每條警示標出依據日期
- [A] 風險處置紀錄（儲存、已處理標示、處理後再出現）
- [M] 姓名正確、日期正確、KPI 數值正確（目前只用合成物件測渲染）
- [!] 教練端**端到端**讀取（後端 → sheet → auth → 畫面）

## PARENT

- [!] **家長只能看到自己孩子**
- [!] **家長看不到其他選手**
- [!] 家長看不到體重明細／尿液／疼痛部位／解憂內容／教練私密備註

> ⚠️ **這是隱私邊界，目前零測試保護。最高優先的缺口。**

## DATA

- [A] legacy 中文表頭可讀（別名對應）
- [A] 補欄位只接最右邊、既有資料不變
- [A] 補欄位具冪等性（第二次乾跑回報無事可做）
- [A] 重複表頭會被擋下
- [A] 全新空白工作表會先寫表頭（否則第一筆資料會被當表頭）
- [A] upsert 不重複建列、保留 recordId
- [!] `normalizeRecord` 不造成資料消失（尚未有此函式）

## AI

- [A] AI 成功 → 正常回覆
- [A] AI 授權失敗 → 退回模板
- [A] AI 逾時 → 退回模板
- [A] AI HTTP 錯誤 → 退回模板
- [A] 真實授權例外被丟出 → 退回模板
- [A] 畫面訊息不含 `UrlFetchApp` / `Exception` / `googleapis.com` / 狀態碼
- [A] AI 失敗不影響 KPI 主流程（fallback 一定有可用文字）

## UI 不得洩漏

- [A]（AI 介面）不得出現 Exception、stack trace、OAuth scope、API key
- [!] 其他介面尚未以同樣的洩漏檢查掃過

使用者只該看到：
「AI 服務目前暫時無法使用，已自動切換至教練回覆模板。」
