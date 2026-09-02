# DEPLOY_LOG.md

後端（Apps Script）與前端（GitHub Pages）**分開部署**，repo 本身無法得知線上跑的是哪一版。
**每次後端 redeploy 後補一行。**

正式部署 ID：`AKfycbxyPgaXgpOA4oyRVxswOWkyvWv5iLC6QTkzOPUSIDl20wE1hBFVXAaSamy3cmvDz_LW`
（用 `redeploy` 沿用網址；`clasp deploy` 會產生新網址，**不要用**）

驗活：`GET /exec?action=ping` → `{"ok":true,"message":"pong"}`

| 日期 | Apps Script 版本 | commit | 內容 |
|---|---|---|---|
| 2026-08-27 | 69 | `d42b626` | 每日六大面向自評、append-only 補欄位（schemaAudit / schemaMigrate） |
| 2026-08-29 | 70 | `f137deb` | 每週五自動開啟 KPI：時間觸發器、LINE 推播、教練開關與閘門診斷 |
| 2026-08-29 | 71 | `0bfd352` | 自動開啟狀態查詢輕量化（預設不呼叫觸發器 API） |
| 2026-08-29 | 72 | `f15c333` | 明確 oauthScopes（含 `script.external_request`）；AI 例外只記錄不外洩 |
| 2026-08-29 | 73 | — | 使用者於 Apps Script UI 手動重新部署（授權新 scope） |
| 2026-08-29 | 74 | `chore/external-request-authorizer` | 新增編輯器用的連外授權函式 `授權連線至外部服務()` |
| 2026-08-30 | 78 | `31858bc` | 身分比對不再單獨採信不穩定的 athleteId（mentalSameStudent_） |
| 2026-08-30 | 79 | `perf/safe-read-optimization` | Safe Read Optimization：recent / last / by-date 改索引式讀取 |
| 2026-08-30 | 82 | `revert/read-optimization` | **還原 v79 的讀取優化**：對正式資料 A/B 實測無效益（瓶頸是 getRange 呼叫次數，非讀取量） |
| 2026-09-02 | **待部署（83）** | `fix/records-response-size` | getAllRecords 加上 sinceDate／omitFields／omitEmpty／paged 四個可選參數。起因：整張表回應已達 15.66MB，POST→echo 那一跳取不回來、被降級成 GET，教練後台收到 doGet 的「此動作不接受 GET 請求」而整頁空白。不帶參數時行為與 v82 完全相同 |

## 部署順序（不可顛倒）

1. 改 `apps-script/Code.gs`
2. 部署後端，確認 `?action=ping`
3. 在本表補一行
4. `git commit`（訊息註明版本號）
5. `git push`（前端 1–2 分鐘後生效）

先 push 前端會讓線上使用者的新程式呼叫尚不存在的 action。
