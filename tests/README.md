# 測試

不需要 npm install，直接用 node 跑（Playwright 已在 `node_modules/`）。

```bash
node tests/backend-schema.test.js      # apps-script/Code.gs 的表頭稽核 / append-only 補欄位 / addRecord
node tests/daily-kpi-refactor.smoke.js # 用 Chromium 開 index.html，驗每日六大面向自評與每週 30 項 KPI
```

- `backend-schema.test.js`：在 node vm 沙箱裡用假的 `SpreadsheetApp` 載入 `Code.gs`，
  驗證「補欄位只會接在最右邊、既有欄位與資料不會被動到」、舊中文表頭的別名對應、
  全新空白工作表會先寫表頭（否則 `appendRow` 會把第一筆資料當表頭）、
  重複表頭要擋下來，以及 `schemaAudit` / `schemaMigrate` 需要教練身分。
- `daily-kpi-refactor.smoke.js`：直接開 `file://` 的 `index.html`，
  驗證 `js/14-kpi-refactor.js` 的覆寫有生效、六大面向會對應到全站既有的
  `technical/tactical/physical/focus/discipline/emotion` 面向鍵、
  `buildRecord` 有寫進六個 `dailyXxxScore`、以及每週 KPI 表單能長出 30 題。

兩支都是 exit code 0 = 全過。改完 `Code.gs`、`js/14-kpi-refactor.js`、`kpi-session.js`
或 `js/05-feedback-readiness.js` 之後，推上線前請先跑過。
