# ROLLBACK.md

## 前端

```bash
git log --oneline -5           # 找到要退掉的 merge commit
git revert -m 1 <merge-commit>
git push
```
GitHub Pages 1–2 分鐘生效。

若要更快讓使用者拿到舊版：退版後把 `service-worker.js` 的 `CACHE` 版號**再提高一號**
並一併 push（JS 是 network-first，正常不會吃到舊檔，這只是保險）。

## 後端

Apps Script 編輯器 →「部署」→「管理部署作業」→ 編輯（鉛筆）→
「版本」下拉選回上一版 → 部署。**網址不變。**

`DEPLOY_LOG.md` 有每一版的版本號與內容對照。

## 為什麼可以只退一邊

本次所有後端改動都是**新增**，沒有改動任何既有 action 的行為：

- `getCoachDashboard` 是新 action
- `keepFields` 是新的可選參數
- `apiVersion` 是回應中新增的欄位
- 兩階段讀取只在**帶了 `sinceDate`** 時啟用；不帶時走原本的整表讀取

前端則對兩種後端都能運作：

- 後端沒有 `getCoachDashboard` → 收到「未知的 action」→ 自動退回 `getAllRecords` 分頁路徑
  （且這個判定**有 2 分鐘時效**，不是永久閂鎖）
- 後端沒有 `apiVersion` → 版本橫幅不顯示，其餘功能正常

因此下列四種組合都能運作：

| 前端 | 後端 | 結果 |
|---|---|---|
| 新 | 新 | 完整功能 |
| 新 | 舊 | 自動退回舊路徑，顯示版本不符提示 |
| 舊 | 新 | 舊路徑行為與過去一字不差 |
| 舊 | 舊 | 回到修改前的狀態 |

## 個別功能的退場開關

不想整版退時，可只關掉單一行為：

| 想關掉 | 怎麼做 |
|---|---|
| 教練後台的專用讀取 | `js/07-coach-dashboard.js` 的 `refreshCoach` 移除 `dashboard: true`，會退回 `sinceDate` 分頁路徑 |
| 日期視窗（回到讀整表） | 呼叫端不要帶 `sinceDate`；後端偵測不到視窗就走原本的整表讀取 |
| 後端分段讀取 | `Code.gs` 把 `RECORDS_MAX_RANGE_READS` 設為 `0`，永遠走「一次讀完再過濾」 |
| 讀取重試／斷路器 | `js/09-settings-auth.js` 把 `CIRCUIT_FAIL_THRESHOLD` 設得極大、重試迴圈的 `attempt < 2` 改為 `< 1` |
| last-known-good（舊資料） | `js/07-coach-dashboard.js` 的 catch 內移除 `_lastGoodRecords` 那段，改回直接 throw |

## 資料安全

本次**沒有任何寫入路徑的改動**，也沒有 migration。
Google Sheet 的欄位、欄位順序、既有資料完全未動，
因此退版不需要處理任何資料還原。
