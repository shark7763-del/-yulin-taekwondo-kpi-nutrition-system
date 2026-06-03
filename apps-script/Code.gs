/* ============================================================
   育林國中跆拳道隊｜KPI＋身體狀態＋AI 飲食建議系統
   Google Apps Script Web App 後端 — Code.gs

   功能：
   - doGet(e)  / doPost(e)：Web App 入口
   - setupSheet()：自動建立表頭
   - addRecord：新增一筆紀錄
   - getLastRecordByName：查某選手最近一筆
   - getRecentRecordsByName：查某選手最近 N 筆
   - getTodayRecords：查某日期所有紀錄
   - getRecordsByDate：依日期查詢
   - getAllRecords：所有紀錄
   - ping：測試連線
   - JSON 錯誤回傳 + CORS 友善

   部署方式：
   1. 在 Google Sheet > 擴充功能 > Apps Script 貼上本檔
   2. 先執行一次 setupSheet（授權）
   3. 部署 > 新增部署 > 類型「網頁應用程式」
      - 執行身分：我
      - 存取權：任何人
   4. 複製網頁應用程式 URL，貼回前端「系統設定」
   ============================================================ */

// 資料表名稱（可自行修改）
var SHEET_NAME = 'records';
// 選手名單工作表（全裝置共用名單）
var ROSTER_SHEET = 'roster';

// Sheet 欄位順序（必須與前端 record 物件對應）
var HEADERS = [
  'timestamp', 'date', 'name', 'gradeClass', 'group', 'trainingTopic', 'bodyStatus',
  'heightCm', 'weightKg', 'targetWeightKg', 'bmi', 'weightGap',
  'breakfast', 'lunch', 'dinner', 'snacksDrinks', 'waterIntake', 'lateNightSnack', 'trainingIntensity',
  'physicalAvg', 'technicalAvg', 'focusAvg', 'disciplineAvg', 'emotionAvg', 'tacticalAvg',
  'totalScore', 'averageScore', 'status', 'lowItems', 'improveTargets', 'mainGoalToday',
  'reflection', 'tomorrowGoal', 'encouragementToTeammate',
  'nutritionRisks', 'nutritionAdviceStudent', 'nutritionAdviceParent', 'nutritionAdviceCoach',
  'studentLineText', 'parentLineText', 'coachLineText', 'nutritionLineText',
  'rawScoresJson', 'rawNutritionJson',
  // ===== 交叉辯論／教練複評 相關（新增，皆在最後，不影響舊資料） =====
  'recordId',                                                   // 每筆唯一 ID，供更新定位
  'coachPhysicalAvg', 'coachTechnicalAvg', 'coachFocusAvg',     // 教練複評：六大面向
  'coachDisciplineAvg', 'coachEmotionAvg', 'coachTacticalAvg',
  'coachTotalScore', 'coachAverageScore', 'coachStatus',        // 教練複評：總分/平均/燈號
  'coachComment',                                               // 教練評語
  'studentResponse',                                            // 選手對這筆的看法
  'coachReply',                                                 // 教練回覆選手
  'reviewUpdatedAt',                                            // 最後更新時間
  'encourageTeammateName'                                       // 想鼓勵的隊友（選填）
];

/* ============================================================
   Web App 入口
   ============================================================ */

// GET：方便在瀏覽器直接測試，也支援 ?action=ping
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') return jsonOut({ ok: true, message: 'pong', time: new Date().toISOString() });
    return handleAction(action, e.parameter || {});
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// POST：前端主要呼叫入口（body 為 JSON 字串）
// 同時兼任 LINE Webhook 端點：LINE 推來的事件 body 會有 events 陣列。
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    // 偵測 LINE Webhook 事件（用來自動捕獲群組／個人 ID）
    if (body && body.events) {
      return handleLineWebhook(body);
    }
    var action = body.action || 'ping';
    return handleAction(action, body);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// 統一動作分派
function handleAction(action, data) {
  switch (action) {
    case 'ping':
      return jsonOut({ ok: true, message: 'pong', time: new Date().toISOString() });
    case 'addRecord':
      return jsonOut(addRecord(data.payload || {}));
    case 'getLastRecordByName':
      return jsonOut({ ok: true, data: getLastRecordByName(data.name) });
    case 'getRecentRecordsByName':
      return jsonOut({ ok: true, data: getRecentRecordsByName(data.name, data.limit || 7) });
    case 'getTodayRecords':
      return jsonOut({ ok: true, data: getRecordsByDate(data.date || todayStr()) });
    case 'getRecordsByDate':
      return jsonOut({ ok: true, data: getRecordsByDate(data.date) });
    case 'getAllRecords':
      return jsonOut({ ok: true, data: getAllRecords() });
    case 'updateRecord':
      return jsonOut(updateRecord(data.recordId, data.fields || {}));
    // ---- 選手名單（全裝置共用）----
    case 'getRoster':
      return jsonOut({ ok: true, data: getRoster() });
    case 'setRoster':
      return jsonOut(setRoster(data.players || [], data));
    // ---- LINE 推播相關 ----
    case 'getLineStatus':
      return jsonOut({ ok: true, data: getLineStatus() });
    case 'setLineConfig':
      return jsonOut(setLineConfigFromRequest(data));
    case 'lineTest':
      return jsonOut(lineTest(data));
    case 'pushLineText':
      return jsonOut(pushLineText(data));
    case 'getLineLastSource':
      return jsonOut({ ok: true, data: { lastSourceId: getProp('LINE_LAST_SOURCE_ID') || '', lastSourceType: getProp('LINE_LAST_SOURCE_TYPE') || '' } });
    case 'verifyAdmin':
      return jsonOut(verifyAdmin(data));
    default:
      return jsonOut({ ok: false, error: '未知的 action：' + action });
  }
}

/* ============================================================
   工具
   ============================================================ */

// 輸出 JSON（CORS 友善：Apps Script Web App 對 simple request 不會擋）
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 取得（或建立）資料表
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // 確保有表頭
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  ensureSchema(sheet); // 自動把欄位補到最新版（新增 recordId、教練複評等欄位）
  return sheet;
}

/*
   確保工作表欄位數量與表頭符合最新 HEADERS。
   新增欄位都在最後，所以舊資料位置不變，只是右邊多出空白欄。
*/
function ensureSchema(sheet) {
  var need = HEADERS.length;
  // 欄位數不夠先擴充
  if (sheet.getMaxColumns() < need) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), need - sheet.getMaxColumns());
  }
  // 表頭不完整或順序不對就重寫第一列
  if (sheet.getLastColumn() < need || sheet.getRange(1, 1).getValue() !== HEADERS[0]) {
    sheet.getRange(1, 1, 1, need).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

// 自動建立／更新表頭（可在編輯器手動執行一次）
function setupSheet() {
  var sheet = getSheet();
  ensureSchema(sheet);
  return 'setupSheet 完成，表頭已建立／更新為最新版（含 recordId、教練複評欄位）。';
}

// 今天日期字串 yyyy-MM-dd
function todayStr() {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

// 把一列陣列轉成物件
function rowToObject(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}

/* ============================================================
   資料操作
   ============================================================ */

/*
   新增（或更新）一筆紀錄。
   為避免選手同一天重複送出造成多列，採 upsert：
   同一個 name+date 已存在就「更新該列」，否則才新增。
   更新時只覆寫前端有提供的學生欄位，保留教練複評欄位與原 recordId。
*/
function addRecord(payload) {
  var sheet = getSheet();
  var nameIdx = HEADERS.indexOf('name');
  var dateIdx = HEADERS.indexOf('date');
  var lastRow = sheet.getLastRow();

  // 找同一天、同一人是否已有紀錄
  var existingRow = -1;
  if (lastRow >= 2 && payload.name && payload.date) {
    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][nameIdx]) === String(payload.name) &&
          formatDateCell(data[i][dateIdx]) === formatDateCell(payload.date)) {
        existingRow = i + 2;
        break;
      }
    }
  }

  var pushResult = null;

  if (existingRow !== -1) {
    // ---- 更新既有那一列 ----
    var rowVals = sheet.getRange(existingRow, 1, 1, HEADERS.length).getValues()[0];
    for (var c = 0; c < HEADERS.length; c++) {
      var key = HEADERS[c];
      if (key === 'recordId') continue; // 保留原 recordId，教練複評才不會斷鏈
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        rowVals[c] = (payload[key] === undefined || payload[key] === null) ? '' : payload[key];
      }
    }
    rowVals[0] = new Date().toISOString(); // timestamp 用伺服器最新時間
    sheet.getRange(existingRow, 1, 1, HEADERS.length).setValues([rowVals]);

    try { pushResult = pushRecordToLine(payload); } catch (e) { pushResult = { ok: false, error: String(e) }; }
    return { ok: true, updated: true, message: '已更新今日紀錄（同一天只保留最新一筆）', name: payload.name, date: payload.date, line: pushResult };
  }

  // ---- 新增一列 ----
  var row = HEADERS.map(function (key) {
    var v = payload[key];
    return (v === undefined || v === null) ? '' : v;
  });
  if (!payload.timestamp) row[0] = new Date().toISOString();
  sheet.appendRow(row);

  try { pushResult = pushRecordToLine(payload); } catch (e) { pushResult = { ok: false, error: String(e) }; }
  return { ok: true, updated: false, message: '已新增紀錄', name: payload.name, date: payload.date, line: pushResult };
}

// 讀取全部紀錄為物件陣列
function getAllRecords() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var records = [];
  for (var i = 0; i < values.length; i++) {
    records.push(rowToObject(HEADERS, values[i]));
  }
  return records;
}

// 依姓名取得最近一筆（依 timestamp 排序，最新的）
function getLastRecordByName(name) {
  if (!name) return null;
  var all = getAllRecords();
  var mine = all.filter(function (r) { return String(r.name) === String(name); });
  if (!mine.length) return null;
  mine.sort(byTimestampDesc);
  return mine[0];
}

// 依姓名取得最近 N 筆（新到舊）
function getRecentRecordsByName(name, limit) {
  if (!name) return [];
  var all = getAllRecords();
  var mine = all.filter(function (r) { return String(r.name) === String(name); });
  mine.sort(byTimestampDesc);
  return mine.slice(0, limit || 7);
}

// 依 recordId 更新某筆紀錄的指定欄位（供教練複評、選手回應、教練回覆使用）
function updateRecord(recordId, fields) {
  if (!recordId) return { ok: false, error: '缺少 recordId' };
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: '尚無資料' };

  var idCol = HEADERS.indexOf('recordId') + 1;
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recordId)) { rowNum = i + 2; break; }
  }
  if (rowNum === -1) return { ok: false, error: '找不到該筆紀錄（可能是舊資料沒有 recordId）' };

  // 自動補上更新時間
  fields.reviewUpdatedAt = new Date().toISOString();

  Object.keys(fields).forEach(function (key) {
    var c = HEADERS.indexOf(key);
    if (c !== -1) sheet.getRange(rowNum, c + 1).setValue(fields[key]);
  });
  return { ok: true, recordId: recordId };
}

/*
   手動執行一次：清掉 records 裡「同一人同一天」的重複列，每人每天只留一筆。
   保留優先序：① 有教練評分的列 ② timestamp 最新的列。
   在 Apps Script 編輯器選 dedupeSheet 按執行即可，會回傳刪除筆數。
   （日常的重複已由 addRecord 的 upsert 防止，這支只用來清理舊資料。）
*/
function dedupeSheet() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return '資料少於 2 筆，無需處理。';

  var nameIdx = HEADERS.indexOf('name');
  var dateIdx = HEADERS.indexOf('date');
  var coachIdx = HEADERS.indexOf('coachAverageScore');
  var tsIdx = 0; // timestamp 是第一欄
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  // 每個 name+date 找出最該保留的列
  var best = {}; // key -> { idx, hasCoach, ts }
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][nameIdx]).trim();
    var date = formatDateCell(values[i][dateIdx]);
    if (!name || !date) continue; // 沒 name/date 的列不動
    var key = name + '|' + date;
    var hasCoach = (coachIdx !== -1 && String(values[i][coachIdx] || '') !== '') ? 1 : 0;
    var ts = new Date(values[i][tsIdx] || 0).getTime();
    var cur = { idx: i, hasCoach: hasCoach, ts: ts };
    var prev = best[key];
    if (!prev || cur.hasCoach > prev.hasCoach || (cur.hasCoach === prev.hasCoach && cur.ts >= prev.ts)) {
      best[key] = cur;
    }
  }
  var keep = {};
  Object.keys(best).forEach(function (k) { keep[best[k].idx] = true; });

  // 收集要刪的 sheet 列號（只刪有 name+date 且非保留者）
  var toDelete = [];
  for (var j = 0; j < values.length; j++) {
    var nm = String(values[j][nameIdx]).trim();
    var dt = formatDateCell(values[j][dateIdx]);
    if (!nm || !dt) continue;
    if (!keep[j]) toDelete.push(j + 2);
  }
  toDelete.sort(function (a, b) { return b - a; }); // 由下往上刪，避免位移
  toDelete.forEach(function (r) { sheet.deleteRow(r); });

  return '完成：刪除 ' + toDelete.length + ' 筆重複列，每人每天只保留一筆（優先留有教練評分者）。';
}

/* ============================================================
   選手名單（全裝置共用，存在 roster 工作表 A 欄）
   ============================================================ */

function getRosterSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ROSTER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ROSTER_SHEET);
    sh.getRange(1, 1).setValue('name');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 讀名單（回傳字串陣列）
function getRoster() {
  var sh = getRosterSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var n = String(vals[i][0]).trim();
    if (n) out.push(n);
  }
  return out;
}

// 覆寫整份名單（教練端用；可用 ADMIN_KEY 保護）
function setRoster(players, data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤，無法修改名單。' };
  if (!Array.isArray(players)) return { ok: false, error: 'players 必須是陣列' };
  var sh = getRosterSheet();
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 1).clearContent(); // 清掉舊名單
  if (players.length) {
    sh.getRange(2, 1, players.length, 1).setValues(players.map(function (n) { return [String(n)]; }));
  }
  return { ok: true, count: players.length };
}

// 依日期取得所有紀錄
function getRecordsByDate(date) {
  if (!date) return [];
  var all = getAllRecords();
  return all.filter(function (r) {
    return formatDateCell(r.date) === String(date);
  });
}

// 排序比較器：timestamp 新到舊
function byTimestampDesc(a, b) {
  var ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
  var tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
  if (tb !== ta) return tb - ta;
  // timestamp 相同時用 date 比
  return String(b.date).localeCompare(String(a.date));
}

// 日期欄位可能是 Date 物件或字串，統一成 yyyy-MM-dd 字串
function formatDateCell(v) {
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v);
}

/* ============================================================
   LINE 推播（LINE Messaging API）
   ------------------------------------------------------------
   設定存在 Script Properties，不寫死在程式碼：
     LINE_TOKEN        ：Channel access token（長期）
     LINE_TARGET_ID    ：要推播的群組 / 個人 / 聊天室 ID
     LINE_PUSH_VERSIONS：推播哪些版本，逗號分隔。可用：
                         coach,parent,student,nutrition（預設 coach）
     LINE_ENABLED      ：'true' / 'false'
     ADMIN_KEY         ：（選填）管理密碼；設定後，改設定/測試需附帶相同 key
     LINE_LAST_SOURCE_ID / LINE_LAST_SOURCE_TYPE：Webhook 自動捕獲的最後來源

   兩種設定方式：
   (A) 在編輯器執行 setLineConfig() 一次（安全、推薦）— 見下方函式註解。
   (B) 從前端「系統設定」填表呼叫 action=setLineConfig（方便，建議搭配 ADMIN_KEY）。
   ============================================================ */

// 版本對應到 payload 的欄位
var LINE_VERSION_FIELD = {
  coach: 'coachLineText',
  parent: 'parentLineText',
  student: 'studentLineText',
  nutrition: 'nutritionLineText'
};

// --- Script Properties 小工具 ---
function getProp(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp(key, val) { PropertiesService.getScriptProperties().setProperty(key, val == null ? '' : String(val)); }

/*
   在「Apps Script 編輯器」手動執行一次即可完成安全設定。
   使用前：把下面三個值改成你自己的，函式下拉選 setLineConfig，按執行。
   （這是方式 A，token 不會經過公開網址。）
*/
function setLineConfig() {
  setProp('LINE_TOKEN', '在這裡貼上你的 Channel access token');
  setProp('LINE_TARGET_ID', '在這裡貼上群組或個人 ID（可先用 getLineLastSourceId 取得）');
  setProp('LINE_PUSH_VERSIONS', 'coach');     // 例如 'coach' 或 'coach,parent'
  setProp('LINE_ENABLED', 'true');
  // setProp('ADMIN_KEY', '自訂一組管理密碼');  // 需要保護前端設定時再打開
  return 'LINE 設定完成，可執行 lineTestFromEditor() 測試。';
}

// 在編輯器直接測試推播
function lineTestFromEditor() {
  return pushToLine('✅ 育林跆拳道系統｜LINE 測試訊息，看到這則代表推播設定成功。');
}

// 在編輯器查看 Webhook 最近捕獲的來源 ID（把 bot 加進群組並發一句話後執行）
function getLineLastSourceId() {
  var id = getProp('LINE_LAST_SOURCE_ID') || '（尚未捕獲，請把官方帳號加入群組後在群組發一句話）';
  var type = getProp('LINE_LAST_SOURCE_TYPE') || '';
  Logger.log('最近來源類型：' + type + '，ID：' + id);
  return { type: type, id: id };
}

// 核心：推一段文字到設定好的目標
function pushToLine(text) {
  var token = getProp('LINE_TOKEN');
  var target = getProp('LINE_TARGET_ID');
  if (!token) return { ok: false, error: '尚未設定 LINE_TOKEN' };
  if (!target) return { ok: false, error: '尚未設定 LINE_TARGET_ID' };

  var url = 'https://api.line.me/v2/bot/message/push';
  var payload = {
    to: target,
    messages: [{ type: 'text', text: String(text).slice(0, 4900) }] // LINE 單則上限 5000 字
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 200) return { ok: true };
  return { ok: false, error: 'LINE API ' + code + '：' + res.getContentText() };
}

// 送出紀錄後，依設定推播選定版本
function pushRecordToLine(payload) {
  if (getProp('LINE_ENABLED') !== 'true') return { ok: false, skipped: '未啟用推播' };
  var versions = (getProp('LINE_PUSH_VERSIONS') || 'coach').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var results = [];
  for (var i = 0; i < versions.length; i++) {
    var field = LINE_VERSION_FIELD[versions[i]];
    var text = field ? payload[field] : '';
    if (text) results.push(pushToLine(text));
  }
  if (!results.length) return { ok: false, skipped: '無可推播的版本內容' };
  // 只要有一則成功就算成功
  var anyOk = results.some(function (r) { return r.ok; });
  return { ok: anyOk, details: results };
}

// 教練登入驗證：回傳是否通過，以及後端是否已設密碼
function verifyAdmin(data) {
  var key = getProp('ADMIN_KEY');
  if (!key) return { ok: true, keySet: false }; // 尚未設密碼 → 放行（提醒去設定）
  return { ok: (data && data.adminKey === key), keySet: true };
}

// 驗證管理密碼（若有設定 ADMIN_KEY）
function checkAdminKey(data) {
  var key = getProp('ADMIN_KEY');
  if (!key) return true; // 未設定密碼則不檢查
  return data && data.adminKey === key;
}

// 回傳目前 LINE 設定狀態（token 遮罩，不外洩）
function getLineStatus() {
  var token = getProp('LINE_TOKEN') || '';
  return {
    enabled: getProp('LINE_ENABLED') === 'true',
    hasToken: !!token,
    tokenMasked: token ? (token.slice(0, 4) + '••••' + token.slice(-4)) : '',
    targetId: getProp('LINE_TARGET_ID') || '',
    versions: getProp('LINE_PUSH_VERSIONS') || 'coach',
    adminKeyRequired: !!getProp('ADMIN_KEY'),
    lastSourceId: getProp('LINE_LAST_SOURCE_ID') || '',
    lastSourceType: getProp('LINE_LAST_SOURCE_TYPE') || ''
  };
}

// 從前端請求設定 LINE（方式 B）
function setLineConfigFromRequest(data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤，無法修改設定。' };
  if (typeof data.token === 'string' && data.token) setProp('LINE_TOKEN', data.token);
  if (typeof data.targetId === 'string') setProp('LINE_TARGET_ID', data.targetId);
  if (typeof data.versions === 'string' && data.versions) setProp('LINE_PUSH_VERSIONS', data.versions);
  if (typeof data.enabled !== 'undefined') setProp('LINE_ENABLED', data.enabled ? 'true' : 'false');
  if (typeof data.adminKey === 'string' && typeof data.newAdminKey === 'string') setProp('ADMIN_KEY', data.newAdminKey);
  return { ok: true, data: getLineStatus() };
}

// 前端按「測試推播」
function lineTest(data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤。' };
  return pushToLine('✅ 育林跆拳道系統｜LINE 測試訊息，看到這則代表推播設定成功。');
}

// 教練後台「發送 LINE 催繳」：把指定文字推到設定好的 LINE 目標
// （需管理密碼；不受 LINE_ENABLED 限制，屬於教練主動觸發的即時推播）
function pushLineText(data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤。' };
  var text = data && data.text ? String(data.text) : '';
  if (!text.trim()) return { ok: false, error: '沒有要發送的內容。' };
  return pushToLine(text);
}

/*
   LINE Webhook：當官方帳號收到訊息（例如被加進群組後有人發言），
   LINE 會 POST events 到本 Web App。我們把來源 ID 記起來，
   方便教練到「系統設定」或編輯器讀取群組 ID。
*/
function handleLineWebhook(body) {
  try {
    var events = body.events || [];
    for (var i = 0; i < events.length; i++) {
      var src = events[i].source || {};
      var id = src.groupId || src.roomId || src.userId || '';
      var type = src.type || '';
      if (id) {
        setProp('LINE_LAST_SOURCE_ID', id);
        setProp('LINE_LAST_SOURCE_TYPE', type);
      }
    }
  } catch (e) { /* 忽略，Webhook 一律回 200 */ }
  // LINE 要求 Webhook 回 200
  return ContentService.createTextOutput('OK');
}
