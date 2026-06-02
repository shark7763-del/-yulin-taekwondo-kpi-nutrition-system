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
  'rawScoresJson', 'rawNutritionJson'
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
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
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
  return sheet;
}

// 自動建立表頭（可在編輯器手動執行一次）
function setupSheet() {
  var sheet = getSheet();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  return 'setupSheet 完成，表頭已建立。';
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

// 新增一筆紀錄
function addRecord(payload) {
  var sheet = getSheet();
  var row = HEADERS.map(function (key) {
    var v = payload[key];
    return (v === undefined || v === null) ? '' : v;
  });
  // 若前端沒給 timestamp，補上伺服器時間
  if (!payload.timestamp) {
    row[0] = new Date().toISOString();
  }
  sheet.appendRow(row);
  return { ok: true, message: '已新增紀錄', name: payload.name, date: payload.date };
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
