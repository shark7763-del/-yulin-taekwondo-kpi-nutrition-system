# DEPLOY_CHECKLIST.md

前端（GitHub Pages）與後端（Apps Script）**分開部署、時鐘不同**。
順序不可顛倒：**先後端 → 驗活 → 再前端**。

## 0. 部署前

- [ ] `git status` 乾淨
- [ ] 全套測試綠（見下方指令），**319 項**
- [ ] `js/01-config-data.js` 的 `APP_VERSION` 與 `apps-script/Code.gs` 的 `API_VERSION` 一致
      （`tests/coach-dashboard-fields.test.js` 會檢查）
- [ ] 改了 js/css → `index.html` 的 `?v=` 已更新、`service-worker.js` 的 `CACHE` 版號已提高

```bash
node tests/backend-schema.test.js
node tests/records-paging.test.js
node tests/coach-dashboard-scale.test.js
node tests/coach-dashboard-fields.test.js
node tests/normal-ui-no-full-records.test.js
node tests/read-optimization.test.js
node tests/submit-performance.test.js
node tests/login-stability.test.js
node tests/records-paging.browser.test.js
node tests/coach-dashboard-reliability.browser.test.js
node tests/coach-ui-stress.browser.test.js
node tests/daily-kpi-refactor.smoke.js
```

## 1. 後端（Apps Script）

- [ ] 開啟 Apps Script 編輯器，貼上新的 `apps-script/Code.gs`
- [ ] **部署 → 管理部署作業 → 編輯（鉛筆）→ 版本：新版本 → 部署**
      用 `redeploy` 沿用網址；**不要**用 `clasp deploy`（會產生新網址）
- [ ] 驗活：

```
GET /exec?action=ping
→ {"ok":true,"message":"pong","apiVersion":"<APP_VERSION 相同的值>"}
```

- [ ] **等 1 分鐘再測第二次**
      redeploy 後約有一分鐘新舊 instance 並存：部分回應沒有 `apiVersion`、
      新 action 會回「未知的 action」。這是正常傳播，不是部署失敗。
      連續打同一支 action 4 次都拿到新版，才算收斂。
- [ ] 在 `DEPLOY_LOG.md` 補一行（日期／版本號／commit／內容）

> **注意：純內部優化的版本沒有外部指紋。**
> v85 只改了 `getAllRecordsRead_` 的讀取策略，contract 完全沒變，
> 所以 `apiVersion` 不變、也沒有新 action —— 從外面**無法**分辨 v84 與 v85。
> 這是向後相容的好性質，但也代表部署與否只能靠 Apps Script 的版本清單確認。
> 若日後需要可驗證性，可另外加一個與 contract 無關的 `buildTag` 欄位。

> **另一個要有心理準備的事**：Apps Script 偶發會花 13–43 秒才回應，
> 這時 POST 會被降級成 GET（見 `ROOT_CAUSE.md` RC-1 的 2026-09-03 補充）。
> 部署驗活時若遇到「此動作不接受 GET 請求」，**先隔幾秒重試**再判定部署失敗。

## 2. 前端（GitHub Pages）

- [ ] `git push` 到 `main`
- [ ] 等 1–2 分鐘，確認線上檔案已換版：

```bash
curl -s https://shark7763-del.github.io/-yulin-taekwondo-kpi-nutrition-system/index.html | grep -o '07-coach-dashboard.js?v=[^"]*'
curl -s https://shark7763-del.github.io/-yulin-taekwondo-kpi-nutrition-system/service-worker.js | grep -o 'teampro-pwa-v[0-9]*'
```

## 3. 現場驗收（教練後台）

- [ ] 按「🔄 重新整理資料」
- [ ] 「今日回覆 → 需要回覆的選手」有名單
- [ ] 「準備度分組與快速回覆」有出現**五組**名單（強化／穩定／調整／保護／關懷）
- [ ] 「風險追蹤」有內容
- [ ] 頂端**沒有**「前後端版本不同」橫幅
- [ ] 頂端**沒有**「非即時資料」橫幅（若有，代表後端連線有問題，橫幅會寫出原因）
- [ ] 切換日期到前一天，資料跟著變
- [ ] 開「上次表現」，選一位選手，趨勢圖出得來

> 第一次開啟會自動重新整理一次（service worker 版號變動觸發 `controllerchange`），屬正常。
> 手機若還是舊畫面，下拉強制重新整理一次。

## 4. 出問題時看哪裡

畫面上的橫幅現在會直接寫出原因，不用再翻 console：

| 橫幅文字 | 意思 | 處理 |
|---|---|---|
| 前後端版本不同 | `APP_VERSION` ≠ `API_VERSION` | 重新部署 Apps Script |
| 非即時資料（附最後同步時間） | 後端暫時連不上，顯示的是上次成功的資料 | 等網路恢復後按重新整理 |
| 瀏覽器連不上 script.google.com | 網路中斷／離線／被擋 | 檢查手機網路 |
| HTTP 500｜HTML｜title=... | 後端回了錯誤頁 | 看 Apps Script 執行記錄 |
| 後端連續失敗，已暫停自動重試 | 斷路器開啟中 | 按「重新整理資料」立即重試 |
| 登入已過期 | session 逾時 | 點橫幅上的重新登入鈕 |
