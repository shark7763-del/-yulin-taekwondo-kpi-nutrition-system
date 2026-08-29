# AGENTS.md — 修改這個系統之前必讀

這是一套**正式使用中**的系統，服務育林國中技擊隊約 40 位未成年選手、他們的家長與教練。
資料庫裡是真實的健康與訓練紀錄。

## 優先順序（不可調換）

```
穩定  >  正確  >  可維護  >  效能  >  漂亮
```

沒有實際問題的地方**不要碰**。YAGNI。

## 動手前一定要先讀

1. `SYSTEM_CONTRACT.md` — 哪些東西改了會炸掉別人
2. `DATA_CONTRACT.md` — 資料真正長什麼樣、legacy 相容性在哪裡
3. `REGRESSION_CHECKLIST.md` — 改完要測什麼
4. `MONKEY_PATCH_AUDIT.md` — 哪些函式被覆寫、覆寫了什麼副作用

## 每次修改前必須輸出

```
CHANGE:        這次真正要改什麼
WHY:           為什麼需要
FILES:         預計修改哪些檔案
DEPENDENCIES:  哪些功能依賴它
DATA IMPACT:   會不會影響現有資料
RISK:          Low / Medium / High
ROLLBACK:      失敗如何回上一版
TEST PLAN:     修改後測什麼
```

## STOP 條件

出現以下任一情況，**停下來問人**，不要自己決定：

- 一個小需求需要改超過 **3 個 production 檔案** → 設計範圍可能過大
- 需要改 Google Sheet 既有欄位、欄位順序，或刪除欄位
- 需要改既有的 `action` 名稱、localStorage key、DOM id
- 需要改動任何選手身分識別（`athleteId` / `studentId` / `name`）的產生或比對方式
- 任何會動到**既有資料**的 migration
- 想「順手」重構、改名、整理格式

## 禁止事項

- 全站重寫、換 framework、大量搬檔
- 大量 rename function / variable / DOM id
- 為了「程式比較乾淨」而重構
- 無關需求的 UI 改版、大量 CSS 格式化
- 一次修改大量 production 檔案
- 刪除 legacy 相容邏輯（除非確認沒有舊資料需要它）
- 「先全部改完再一起測」

## 每一個 patch 的固定流程

```
1. git status（確認乾淨）
2. 記錄 baseline（HEAD sha、測試通過數）
3. 只改最小範圍
4. git diff（逐行看過）
5. 檢查有沒有預期外的 diff
6. 執行測試
7. 對照 REGRESSION_CHECKLIST
8. 失敗 → 立刻 revert 這個 patch
9. PASS 才進下一個 patch
```

一個 patch 一件事。每個 commit 必須能**獨立 revert**。

## 測試

```bash
node tests/backend-schema.test.js        # 後端：表頭稽核 / 補欄位 / addRecord / 每週 KPI 閘門
node tests/daily-kpi-refactor.smoke.js   # 前端：Chromium 實跑 index.html
```

不需要 `npm install`（Playwright 已在 `node_modules/`）。兩支都必須綠。

### 寫測試的鐵則

這個專案的測試**曾經三次「因為錯誤的理由而通過」**：

1. `select.value = '不存在的選項'` 會**靜默變成 `''`**，測試以為設定成功
2. `#name` / `#encourageTeammate` 是由 localStorage 名單餵養的 select，沒 seed 名單就沒有選項
3. 斷言寫成 `cond ? x === y : 'SKIPPED'` —— 非空字串是 truthy，會被判定 PASS

所以：

- **驗證類測試一定要先斷言「完整表單 `validateForm() === true`」當基準**，再逐一挖掉欄位
- 斷言失敗原因時要**釘住原因**，不能只斷言 `ok === false`
- 測試**不得打正式後端**（`addInitScript` 已攔截送往 `script.google.com` 的 fetch）

## 部署

前端與後端**分開部署，時鐘不同**：

- 前端：push 到 `main` → GitHub Pages 約 1–2 分鐘自動生效
- 後端：Apps Script 要**手動**建立新版本並 redeploy（網址不變）

**順序**：先部署後端 → 用 `?action=ping` 確認 → 再 push 前端。
反過來會讓線上使用者的新前端呼叫尚不存在的 `action`。

每次後端部署後，在 `DEPLOY_LOG.md` 補一行。

改了 js/css 要同時：
- 更新 `index.html` 對應的 `?v=` 旗標
- 提高 `service-worker.js` 的 `CACHE` 版號
