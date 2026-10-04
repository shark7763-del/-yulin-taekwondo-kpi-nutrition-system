# TEAMPRO_REMOVED_CODE.md — 已刪除的程式碼

TeamPro 2.0 重構過程中刪除的程式碼。每一筆都記錄：刪除前的引用數（實測）、為什麼可以刪、怎麼救回來。
救回方式一律是 `git show <刪除前的 commit>:<檔案>`，下面附上完整原文，方便不翻 git 也能查。

---

## 2026-10-05（Phase 9）

### 1. `getAthleteIdForName(name)` — `js/02-core-utils.js`

| 項目 | 內容 |
|---|---|
| 刪除前引用 | 0 個呼叫者（只剩定義；測試 `daily-kpi-refactor.smoke.js` §17 的特徵測試） |
| 為什麼可以刪 | 依名單陣列索引產生 athleteId，刪除／重排名單會讓 ID 位移並撞到別人的歷史 ID（DATA_CONTRACT.md §1 P0）。Phase 1 已改由 `studentId` 寫入，最後兩個呼叫者（`js/04` 送出、`js/12` 研究匯出）都已移除 |
| 對資料的影響 | 無。歷史紀錄裡它產生過的 `S00n` / `S` 加 4 位數值仍留在 Sheet，讀取端本來就不採信 |
| 防止加回 | smoke §17 改成斷言 `typeof window.getAthleteIdForName === 'undefined'` |

```js
function getAthleteIdForName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const players = getPlayers();
  const idx = players.indexOf(n);
  if (idx >= 0) return 'S' + String(idx + 1).padStart(3, '0');
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = ((hash << 5) - hash + n.charCodeAt(i)) | 0;
  return 'S' + String(Math.abs(hash) % 10000).padStart(4, '0');
}
```

### 2. `loadTodayReportedStudentsLegacy_(opts)` — `js/07-coach-dashboard.js`

| 項目 | 內容 |
|---|---|
| 刪除前引用 | 0 個呼叫者（只有定義） |
| 為什麼可以刪 | 「上次表現」今日名單的舊實作（讀 14 天完整 records 在前端算），已由後端 `getDailyAthleteSummary` 取代（`loadTodayReportedStudents`）。上方註解寫「直接移除」但函式其實一直沒刪 |
| 注意 | 它呼叫的 `buildTodayReportStatus` **仍在使用**，沒有刪 |

```js
// 舊的實作保留成死碼會誤導人，直接移除；buildTodayReportStatus 仍供其他呼叫端使用。
async function loadTodayReportedStudentsLegacy_(opts) {
  const targetDate = getLastPerfSelectedDate();
  const records = await fetchAllRecords(Object.assign({
    strict: true,
    dashboard: true,
    date: targetDate,
    days: TODAY_REPORT_HISTORY_DAYS,
    sinceDate: shiftDateStr(targetDate, -TODAY_REPORT_HISTORY_DAYS)
  }, opts || {}));
  const todays = {};
  (records || []).forEach(rec => {
    const name = lastPerfRecordName(rec);
    if (!name || normDate(rec.date || rec.timestamp || rec.createdAt) !== targetDate) return;
    const prev = todays[name];
    const t = String(rec.timestamp || rec.createdAt || rec.updatedAt || '');
    if (!prev || t >= String(prev.timestamp || prev.createdAt || prev.updatedAt || '')) todays[name] = rec;
  });
  // 「待回覆／已回報」標籤改用已抓回的 record（其 coachReply 欄位）＋本機回覆暫存判斷，
  // 不再為每位今日回報選手各發一個 getCoachReplies 請求（原本的 N+1，是開分頁最大的延遲來源）。
  // lastPerfHasCoachReply 會優先看 rec.coachReply，教練透過本系統回覆時已寫回該欄位，狀態仍準確。
  const replies = getCoachReplyStore();
  return buildTodayReportStatus(Object.values(todays), replies, records || []);
}
```

---

## 刻意**沒有**刪的（稽核列為死碼，但現在不能動）

| 項目 | 原因 |
|---|---|
| `currentGroup`（唯寫）、`recalcKpiSummary`、`onSliderChange`、`.kpi-slider` | 屬於舊 30 拉桿 UI，與 `js/14-kpi-refactor.js` 的 `renderKpiSliders` 覆寫綁在一起，要等 Phase 8 收斂覆寫時一起處理，單獨刪會打破覆寫的副作用 |
| `__origValidateForm` / `__origRenderKpiSliders` | 已在更早之前移除（`js/14` 只剩說明註解），smoke 測試確保不會再出現 |
