/* ============================================================
   育林國中技擊隊｜KPI＋身體狀態＋AI 飲食建議系統
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
// 家長後台工作表
var PARENTS_SHEET = 'parents';
var ATTENDANCE_REPORTS_SHEET = 'attendance_reports';
var STUDENT_ACCOUNTS_SHEET = 'student_accounts';
var COACH_SETTINGS_SHEET = 'coach_settings';
// Phase 2：KPI 回報由教練手動開啟（session）＋每週 KPI 報告
var KPI_SESSIONS_SHEET = 'kpi_sessions';
var WEEKLY_KPI_REPORTS_SHEET = 'weekly_kpi_reports';
var KPI_SESSION_HEADERS = [
  'sessionId', 'sessionName', 'sessionType', 'weekId', 'openMode', 'targetGroup',
  'targetStudentIds', 'openAt', 'closeAt', 'status', 'includeInWeeklyReport',
  'includeInMonthlyReport', 'lineNotify', 'createdBy', 'createdAt', 'updatedAt'
];
var WEEKLY_KPI_REPORT_HEADERS = [
  'reportId', 'sessionId', 'weekId', 'studentId', 'studentName',
  'technicalScore', 'tacticalScore', 'physicalScore', 'mentalScore', 'attitudeScore', 'recoveryScore',
  'totalScore', 'averageScore', 'lastWeekScore', 'changeScore', 'riskLevel',
  'bestThingThisWeek', 'needImproveThisWeek', 'nextWeekGoal', 'submittedAt'
];

// 前 7 欄保留舊 parents 表順序，避免既有家長資料在升級時錯位；新版欄位接在右側。
var PARENT_HEADERS = [
  'parentId', 'parentName', 'phone', 'lineId', 'studentName', 'loginCode', 'status',
  'studentId', 'parentPhone', 'parentPhoneLast4', 'bindStatus', 'consentStatus',
  'consentDate', 'firstVerifiedAt', 'lastLoginAt', 'failedLoginCount', 'lockedUntil',
  'lineBindStatus', 'createdAt', 'updatedAt', 'consentTrainingData', 'consentHealthData',
  'consentParentNotice', 'consentReport', 'consentLineNotice'
];
var STUDENT_ACCOUNT_HEADERS = [
  'studentId', 'studentName', 'teamId', 'grade', 'className', 'accountStatus',
  'pinHash', 'pinSetAt', 'pinResetRequired', 'activationCodeHash',
  'activationCodeExpiresAt', 'failedLoginCount', 'lockedUntil', 'lastLoginAt',
  'createdAt', 'updatedAt'
];
var COACH_SETTING_HEADERS = [
  'coachId', 'teamId', 'coachPasswordHash', 'lastLoginAt', 'failedLoginCount',
  'lockedUntil', 'createdAt', 'updatedAt'
];
var ATTENDANCE_REPORT_HEADERS = [
  'timestamp', 'date', 'studentName', 'attendanceStatus', 'checkInTime', 'checkOutTime',
  'absenceReason', 'informedCoach', 'parentConfirmed', 'kpiSubmitted', 'makeupTask',
  'makeupStatus', 'coachPublicNote', 'coachPrivateNote'
];

// Sheet 欄位順序（必須與前端 record 物件對應）
//
// ⚠️ 相容性重要說明：
//   既有 100+ 筆舊資料是在「沒有睡眠/RPE/恢復」那 8 欄的年代寫入的。
//   後來那 8 欄被插在「中間」，導致舊資料每格往左錯位 8 格、整批讀錯欄。
//   因此這裡刻意把這 8 欄（sleepHours, sleepQuality, soreness, rpe, injuryArea,
//   recoveryScore, recoveryState, redLightCategories）改放在「最後面」，
//   讓舊資料自動對位，新資料照名稱寫入也不受影響。請勿再把它們移回中間。
var HEADERS = [
  'timestamp', 'date', 'name', 'gradeClass', 'group', 'trainingTopic', 'bodyStatus',
  'heightCm', 'weightKg', 'targetWeightKg', 'bmi', 'weightGap',
  'breakfast', 'lunch', 'dinner', 'snacksDrinks', 'waterIntake', 'lateNightSnack', 'trainingIntensity',
  'physicalAvg', 'technicalAvg', 'focusAvg', 'disciplineAvg', 'emotionAvg', 'tacticalAvg',
  'totalScore', 'averageScore', 'status',
  'lowItems', 'improveTargets', 'mainGoalToday',
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
  'encourageTeammateName',                                      // 想鼓勵的隊友（選填）
  'parentNote',                                                 // 家長留言給教練（家長專用，不覆蓋 studentResponse）
  // ===== 自由品勢（Freestyle Poomsae）相關（新增，皆在最後，不影響舊資料） =====
  'mode',                                                       // standard / freestyle
  'freestyleTotal', 'freestyleStatus',                          // 100 分制總分、4 級燈號
  'freestyleDifficulty', 'freestyleCompletion', 'freestyleMusic',   // 六加權類別分數（0–100）
  'freestyleCreativity', 'freestyleExpression', 'freestyleSafety',
  'rawFreestyleScoresJson',                                     // 10 項細項分數（JSON）
  'freestyleLineText',                                          // 自由品勢建議版 LINE 文字
  'musicName', 'musicSeconds', 'freestyleTheme', 'practiceSection',  // 額外紀錄欄位
  'aerialSuccessRate', 'spinSuccessRate', 'acroSuccessRate',
  'comboKickCount', 'landingErrors', 'breakCount',
  'needVideoFix', 'focusEightCount',
  'aerialKickCount', 'unlockedMoves',                           // 空中踢擊完成幾腳、解鎖哪些高難度動作
  // ===== 紅燈處理紀錄（教練後台）=====
  'redLightReason', 'redLightHandling', 'redLightNote',         // 原因分類、處理方式、備註
  'absenceReason',                                              // 未出席訓練原因（新增於最後，避免舊資料欄位位移）
  // ===== 未出席訓練反思問答（新增於最後，不影響舊資料）=====
  'absenceMiss',        // 反思：少了今天會少練到什麼
  'absenceCatchup',     // 反思：打算怎麼把進度補回來
  'absenceHonesty',     // 自我檢視：這次請假是否真的必要
  'absenceReflection',  // 反思彙整（可讀文字，供教練／家長後台顯示）
  // ===== 睡眠/RPE/恢復 8 欄：原本被插在中間造成舊資料錯位，移到最後相容 =====
  'sleepHours', 'sleepQuality', 'soreness', 'rpe', 'injuryArea',
  'recoveryScore', 'recoveryState', 'redLightCategories',
  // ===== 今日心情指數（新增於最後，不影響舊資料；不計入 KPI 分數）=====
  'moodIndex',          // 1–5（5 表情）
  'moodReason',         // 心情原因（快速勾選，多選以、分隔）
  // ===== 感謝今天的人事物（新增於最後，不影響舊資料）=====
  'gratitude',          // 今天我想感謝的人事物
  // ===== 睡眠就寢/起床、受傷疼痛指數、尿液監控（新增於最後，不影響舊資料）=====
  'bedTime', 'wakeTime',          // 就寢時間、起床時間（sleepHours 由兩者推算）
  'painScore', 'painLevel',       // 受傷部位疼痛指數 0–10、對應分級文字
  'urineStatus'                   // 尿液顏色監控（脫水快篩）
  ,'studentId'                    // 新制帳號識別；加在最後以相容既有資料
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
      return jsonOut(addRecordAuthorized(data));
    case 'getLastRecordByName':
      return jsonOut(authRecordResult(data, 'last'));
    case 'getRecentRecordsByName':
      return jsonOut(authRecordResult(data, 'recent'));
    case 'getTodayRecords':
      return jsonOut(authTeamRecords(data, data.date || todayStr()));
    case 'getRecordsByDate':
      return jsonOut(authTeamRecords(data, data.date));
    case 'getAllRecords':
      return jsonOut(authAllRecords(data));
    case 'getParents':
      return jsonOut(authCoachOnly(data, function () { return getParentsForCoach(); }));
    case 'getAttendanceReportsByName':
      return jsonOut(authAttendanceByStudent(data));
    case 'getAllAttendanceReports':
      return jsonOut(authCoachOnly(data, function () { return getAllAttendanceReports(); }));
    case 'updateRecord':
      return jsonOut(updateRecordAuthorized(data));
    // ---- 新制角色驗證與帳號管理 ----
    case 'getAuthConfig':
      return jsonOut(getAuthConfig());
    case 'studentActivate':
      return jsonOut(studentActivate(data));
    case 'studentLogin':
      return jsonOut(studentLogin(data));
    case 'parentVerify':
      return jsonOut(parentVerify(data));
    case 'parentLogin':
      return jsonOut(parentLogin(data));
    case 'parentConsent':
      return jsonOut(parentConsent(data));
    case 'coachLogin':
      return jsonOut(coachLogin(data));
    case 'logout':
      return jsonOut(logoutSession(data));
    case 'getAccountAdminData':
      return jsonOut(getAccountAdminData(data));
    case 'studentAccountAction':
      return jsonOut(studentAccountAction(data));
    case 'upsertParentAccount':
      return jsonOut(upsertParentAccount(data));
    case 'parentAccountAction':
      return jsonOut(parentAccountAction(data));
    case 'setLegacyLoginEnabled':
      return jsonOut(setLegacyLoginEnabled(data));
    case 'setCoachPassword':
      return jsonOut(setCoachPassword(data));

    /* ===== Phase 2：KPI 回報手動開啟（教練）＋學生 KPI 狀態 ===== */
    case 'createKpiSession':      // 手動開啟 KPI
      return jsonOut(createKpiSession(data));
    case 'closeKpiSession':       // 關閉本次 KPI
      return jsonOut(updateKpiSessionStatus(data, 'closed'));
    case 'extendKpiSession':      // 延長截止時間
      return jsonOut(extendKpiSession(data));
    case 'reopenKpiSession':      // 重新開放補填
      return jsonOut(updateKpiSessionStatus(data, 'open'));
    case 'getKpiSessions':        // 教練：所有 session（含完成率統計）
      return jsonOut(getKpiSessions(data));
    case 'getKpiSessionDetail':   // 教練：單一 session 完成率表格
      return jsonOut(getKpiSessionDetail(data));
    case 'getKpiReminderTexts':   // 教練：產生三種 LINE 提醒文案
      return jsonOut(getKpiReminderTexts(data));
    case 'getMonthlyKpiSessions': // 月報：當月列入月報的每週 KPI session（含六面向平均）
      return jsonOut(getMonthlyKpiSessions(data));
    case 'getStudentKpiSession':  // 學生：目前該填的 KPI 狀態
      return jsonOut(getStudentKpiSession(data));
    case 'submitWeeklyKpi':       // 學生：送出每週 KPI
      return jsonOut(submitWeeklyKpi(data));

    // ---- 通用同步儲存（任務、個人檔案目標/備註等）----
    case 'getAppData':
      return jsonOut(getAppDataAuthorized(data));
    case 'setAppData':
      return jsonOut(setAppDataAuthorized(data));
    case 'getAllAppData':
      return jsonOut(authCoachOnly(data, function () { return getAllAppData(data.prefix || ''); }));
    // ---- 選手名單（全裝置共用）----
    case 'getRoster':
      return jsonOut(authCoachOnly(data, function () { return getRoster(); }));
    case 'setRoster':
      return jsonOut(setRoster(data.players || [], data));
    // ---- LINE 推播相關 ----
    case 'getLineStatus':
      return jsonOut(authCoachOnly(data, function () { return getLineStatus(); }));
    case 'setLineConfig':
      return jsonOut(setLineConfigFromRequest(data));
    case 'lineTest':
      return jsonOut(lineTest(data));
    case 'pushLineText':
      return jsonOut(pushLineText(data));
    case 'getLineLastSource':
      return jsonOut(authCoachOnly(data, function () { return { lastSourceId: getProp('LINE_LAST_SOURCE_ID') || '', lastSourceType: getProp('LINE_LAST_SOURCE_TYPE') || '' }; }));
    case 'verifyAdmin':
      return jsonOut(verifyAdmin(data));
    // ---- 本週之星開關（教練可關，全裝置共用，預設開）----
    case 'getStarConfig':
      return jsonOut({ ok: true, data: { enabled: getProp('STAR_ENABLED') !== 'false' } });
    case 'setStarConfig':
      return jsonOut(setStarConfig(data));
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
  // 強制把第一列表頭重寫成最新 HEADERS（只動第 1 列、不碰任何資料列）。
  // 這次有調整欄位順序（睡眠/RPE/恢復 8 欄移到最後），需要強制刷新標題列。
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  getRosterSheet();
  getParentsSheet();
  getAttendanceReportsSheet();
  getAppDataSheet();
  getStudentAccountsSheet();
  getCoachSettingsSheet();
  getKpiSessionsSheet();
  getWeeklyKpiReportsSheet();
  syncStudentAccountsFromRoster();
  return 'setupSheet 完成，已更新 records 並建立 roster、parents、attendance_reports、appdata、student_accounts、coach_settings、kpi_sessions、weekly_kpi_reports 工作表。';
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
   新制登入、雜湊、工作階段與角色授權
   ============================================================ */

var AUTH_SESSION_SECONDS = 21600; // 6 小時（CacheService 上限）
var LOGIN_MAX_FAILURES = 5;
var LOGIN_LOCK_MINUTES = 10;
var TEAM_ID_DEFAULT = 'yulin-taekwondo';

function nowIso() { return new Date().toISOString(); }
function normalizeName(v) { return String(v || '').trim(); }
// 電話正規化：去掉非數字，並去掉開頭的 0。
// （Google Sheet 會把 0936... 當數字存成 936...，吃掉開頭 0；統一去 0 後，
//   家長輸入有沒有加 0 都能比對成功，新舊資料一致。）
function normalizePhone(v) { return String(v || '').replace(/\D/g, '').replace(/^0+/, ''); }

function getAuthSalt() {
  var salt = getProp('AUTH_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    setProp('AUTH_SALT', salt);
  }
  return salt;
}

function hashSecret(scope, secret) {
  var raw = getAuthSalt() + '|' + String(scope || '') + '|' + String(secret || '');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isWeakPin(pin) {
  return ['0000', '1111', '1234', '4321', '9999'].indexOf(String(pin)) !== -1;
}

function validatePin(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) return 'PIN 必須是 4 位數字。';
  if (isWeakPin(pin)) return '此 PIN 過於簡單，請改用其他 4 位數字。';
  return '';
}

function getStudentAccountsSheet() {
  return getSheetWithHeaders(STUDENT_ACCOUNTS_SHEET, STUDENT_ACCOUNT_HEADERS);
}

function getCoachSettingsSheet() {
  return getSheetWithHeaders(COACH_SETTINGS_SHEET, COACH_SETTING_HEADERS);
}

function findObjectRow(sh, headers, key, value) {
  var col = headers.indexOf(key);
  if (col < 0 || sh.getLastRow() < 2) return null;
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][col]) === String(value)) return { row: i + 2, values: values[i], object: rowToObject(headers, values[i]) };
  }
  return null;
}

function findStudentAccountByName(name) {
  var sh = getStudentAccountsSheet();
  var rows = readSheetObjects(sh, STUDENT_ACCOUNT_HEADERS);
  name = normalizeName(name);
  for (var i = 0; i < rows.length; i++) if (normalizeName(rows[i].studentName) === name) return findObjectRow(sh, STUDENT_ACCOUNT_HEADERS, 'studentId', rows[i].studentId);
  return null;
}

function updateObjectRow(sh, headers, rowNum, fields) {
  var values = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  Object.keys(fields).forEach(function (key) {
    var idx = headers.indexOf(key);
    if (idx >= 0) values[idx] = fields[key] == null ? '' : fields[key];
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([values]);
}

function syncStudentAccountsFromRoster() {
  var names = getRoster();
  var sh = getStudentAccountsSheet();
  var created = 0;
  for (var i = 0; i < names.length; i++) {
    if (findStudentAccountByName(names[i])) continue;
    var now = nowIso();
    sh.appendRow([
      Utilities.getUuid(), names[i], TEAM_ID_DEFAULT, '', '', 'pending', '', '', true,
      '', '', 0, '', '', now, now
    ]);
    created++;
  }
  return created;
}

function getCoachSetting() {
  var sh = getCoachSettingsSheet();
  if (sh.getLastRow() < 2) {
    var now = nowIso();
    sh.appendRow(['coach-main', TEAM_ID_DEFAULT, '', '', 0, '', now, now]);
  }
  return { sheet: sh, row: 2, object: rowToObject(COACH_SETTING_HEADERS, sh.getRange(2, 1, 1, COACH_SETTING_HEADERS.length).getValues()[0]) };
}

function lockedResponse(account) {
  var until = account && account.lockedUntil ? new Date(account.lockedUntil).getTime() : 0;
  if (until && until > Date.now()) return { ok: false, locked: true, error: '登入錯誤次數過多，請稍後再試。' };
  return null;
}

function recordLoginFailure(sh, headers, row, account) {
  var count = Number(account.failedLoginCount || 0) + 1;
  var fields = { failedLoginCount: count, updatedAt: nowIso() };
  if (count >= LOGIN_MAX_FAILURES) fields.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000).toISOString();
  updateObjectRow(sh, headers, row, fields);
  return count >= LOGIN_MAX_FAILURES;
}

function recordLoginSuccess(sh, headers, row) {
  updateObjectRow(sh, headers, row, { failedLoginCount: 0, lockedUntil: '', lastLoginAt: nowIso(), updatedAt: nowIso() });
}

function createAuthSession(role, details) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var session = {
    role: role,
    studentId: details.studentId || '',
    studentName: details.studentName || '',
    teamId: details.teamId || TEAM_ID_DEFAULT,
    parentId: details.parentId || '',
    consentStatus: details.consentStatus || '',
    createdAt: nowIso()
  };
  CacheService.getScriptCache().put('auth:' + token, JSON.stringify(session), AUTH_SESSION_SECONDS);
  return { token: token, session: session };
}

function getAuthSession(data) {
  var token = data && (data.authToken || data.token);
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('auth:' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function logoutSession(data) {
  var token = data && (data.authToken || data.token);
  if (token) CacheService.getScriptCache().remove('auth:' + token);
  return { ok: true };
}

function legacyLoginEnabled() { return getProp('LEGACY_LOGIN_ENABLED') !== 'false'; }

function getAuthConfig() {
  return { ok: true, legacyLoginEnabled: legacyLoginEnabled(), pinRules: { length: 4, maxFailures: LOGIN_MAX_FAILURES, lockMinutes: LOGIN_LOCK_MINUTES } };
}

function requireRole(data, roles) {
  var session = getAuthSession(data);
  if (!session) return { ok: false, error: '登入已失效，請重新登入。', authRequired: true };
  if (roles.indexOf(session.role) === -1) return { ok: false, error: '你沒有權限執行此操作。', forbidden: true };
  if (session.role === 'parent' && session.consentStatus !== 'agreed') return { ok: false, error: '請先完成家長同意與個資告知。', consentRequired: true };
  return { ok: true, session: session };
}

function studentActivate(data) {
  var name = normalizeName(data.studentName);
  var activationCode = String(data.activationCode || '').trim();
  var pin = String(data.pin || '');
  if (pin !== String(data.pinConfirm || '')) return { ok: false, error: '兩次輸入的 PIN 不一致。' };
  var pinError = validatePin(pin);
  if (pinError) return { ok: false, error: pinError };
  var found = findStudentAccountByName(name);
  if (!found) return { ok: false, error: '啟用資訊不正確，請向教練確認。' };
  if (found.object.accountStatus === 'disabled') return { ok: false, error: '此帳號已停用，請聯繫教練。' };
  var locked = lockedResponse(found.object); if (locked) return locked;
  var expires = found.object.activationCodeExpiresAt ? new Date(found.object.activationCodeExpiresAt).getTime() : 0;
  var valid = expires >= Date.now() && safeEqual(found.object.activationCodeHash, hashSecret('activation:' + found.object.studentId, activationCode));
  if (!valid) {
    var didLock = recordLoginFailure(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, found.row, found.object);
    return { ok: false, locked: didLock, error: didLock ? '登入錯誤次數過多，請稍後再試。' : '啟用資訊不正確，請向教練確認。' };
  }
  var now = nowIso();
  updateObjectRow(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, found.row, {
    accountStatus: 'active', pinHash: hashSecret('pin:' + found.object.studentId, pin), pinSetAt: now,
    pinResetRequired: false, activationCodeHash: '', activationCodeExpiresAt: '',
    failedLoginCount: 0, lockedUntil: '', lastLoginAt: now, updatedAt: now
  });
  var auth = createAuthSession('student', found.object);
  return { ok: true, authToken: auth.token, user: auth.session };
}

function studentLogin(data) {
  var found = findStudentAccountByName(data.studentName);
  if (!found || found.object.accountStatus === 'disabled') return { ok: false, error: '登入資訊不正確，請確認姓名與 PIN。' };
  var locked = lockedResponse(found.object); if (locked) return locked;
  var valid = found.object.accountStatus === 'active' && !found.object.pinResetRequired &&
    safeEqual(found.object.pinHash, hashSecret('pin:' + found.object.studentId, data.pin));
  if (!valid) {
    var didLock = recordLoginFailure(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, found.row, found.object);
    return { ok: false, locked: didLock, activationRequired: found.object.accountStatus === 'pending' || !!found.object.pinResetRequired,
      error: didLock ? '登入錯誤次數過多，請稍後再試。' : '登入資訊不正確，請確認姓名與 PIN。' };
  }
  recordLoginSuccess(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, found.row);
  var auth = createAuthSession('student', found.object);
  return { ok: true, authToken: auth.token, user: auth.session };
}

function parentPhoneValue(parent) { return normalizePhone(parent.parentPhone || parent.phone); }

function findParentByStudentName(name) {
  var sh = getParentsSheet();
  var rows = readSheetObjects(sh, PARENT_HEADERS);
  name = normalizeName(name);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeName(rows[i].studentName) === name && String(rows[i].bindStatus || rows[i].status || '') !== 'disabled') {
      return findObjectRow(sh, PARENT_HEADERS, 'parentId', rows[i].parentId);
    }
  }
  return null;
}

function parentVerify(data) {
  var found = findParentByStudentName(data.studentName);
  var phone = normalizePhone(data.parentPhone);
  if (!found || !phone) return { ok: false, error: '登入資訊不正確，請確認姓名與登入資料。' };
  var locked = lockedResponse(found.object); if (locked) return locked;
  if (!safeEqual(parentPhoneValue(found.object), phone)) {
    var didLock = recordLoginFailure(getParentsSheet(), PARENT_HEADERS, found.row, found.object);
    return { ok: false, locked: didLock, error: didLock ? '登入錯誤次數過多，請稍後再試。' : '登入資訊不正確，請確認姓名與登入資料。' };
  }
  var student = findStudentAccountByName(found.object.studentName);
  if (!student) return { ok: false, error: '家長資料尚未完成，請聯繫教練。' };
  var now = nowIso();
  updateObjectRow(getParentsSheet(), PARENT_HEADERS, found.row, {
    studentId: student.object.studentId, parentPhone: phone, parentPhoneLast4: phone.slice(-4),
    bindStatus: 'verified', firstVerifiedAt: found.object.firstVerifiedAt || now,
    failedLoginCount: 0, lockedUntil: '', lastLoginAt: now, updatedAt: now
  });
  var consentStatus = String(found.object.consentStatus || '');
  var auth = createAuthSession('parent', { parentId: found.object.parentId, studentId: student.object.studentId, studentName: student.object.studentName, teamId: student.object.teamId, consentStatus: consentStatus });
  return { ok: true, authToken: auth.token, user: auth.session, consentRequired: String(found.object.consentStatus || '') !== 'agreed' };
}

function parentLogin(data) {
  var found = findParentByStudentName(data.studentName);
  var last4 = String(data.parentPhoneLast4 || '').replace(/\D/g, '');
  if (!found || !/^\d{4}$/.test(last4)) return { ok: false, error: '登入資訊不正確，請確認姓名與登入資料。' };
  var locked = lockedResponse(found.object); if (locked) return locked;
  var storedLast4 = String(found.object.parentPhoneLast4 || parentPhoneValue(found.object).slice(-4));
  var valid = String(found.object.bindStatus || '') === 'verified' && safeEqual(storedLast4, last4);
  if (!valid) {
    var didLock = recordLoginFailure(getParentsSheet(), PARENT_HEADERS, found.row, found.object);
    return { ok: false, locked: didLock, error: didLock ? '登入錯誤次數過多，請稍後再試。' : '登入資訊不正確，請確認姓名與登入資料。' };
  }
  var student = found.object.studentId ? findObjectRow(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, 'studentId', found.object.studentId) : findStudentAccountByName(found.object.studentName);
  if (!student) return { ok: false, error: '家長資料尚未完成，請聯繫教練。' };
  recordLoginSuccess(getParentsSheet(), PARENT_HEADERS, found.row);
  var consentStatus = String(found.object.consentStatus || '');
  var auth = createAuthSession('parent', { parentId: found.object.parentId, studentId: student.object.studentId, studentName: student.object.studentName, teamId: student.object.teamId, consentStatus: consentStatus });
  return { ok: true, authToken: auth.token, user: auth.session, consentRequired: String(found.object.consentStatus || '') !== 'agreed' };
}

function parentConsent(data) {
  var session = getAuthSession(data);
  if (!session || session.role !== 'parent') return { ok: false, error: '登入已失效，請重新登入。', authRequired: true };
  if (!data.consentTrainingData || !data.consentHealthData || !data.consentParentNotice || !data.consentReport) {
    return { ok: false, error: '請確認必要的同意項目。' };
  }
  var sh = getParentsSheet();
  var found = findObjectRow(sh, PARENT_HEADERS, 'parentId', session.parentId);
  if (!found) return { ok: false, error: '找不到家長資料。' };
  var now = nowIso();
  updateObjectRow(sh, PARENT_HEADERS, found.row, {
    consentTrainingData: true, consentHealthData: true, consentParentNotice: true,
    consentReport: true, consentLineNotice: !!data.consentLineNotice,
    consentStatus: 'agreed', consentDate: now, updatedAt: now
  });
  CacheService.getScriptCache().remove('auth:' + String(data.authToken || ''));
  var auth = createAuthSession('parent', {
    parentId: session.parentId, studentId: session.studentId, studentName: session.studentName,
    teamId: session.teamId, consentStatus: 'agreed'
  });
  return { ok: true, authToken: auth.token, user: auth.session };
}

function coachLogin(data) {
  var setting = getCoachSetting();
  var account = setting.object;
  var locked = lockedResponse(account); if (locked) return locked;
  var password = String(data.coachPassword || '');
  var valid = account.coachPasswordHash && safeEqual(account.coachPasswordHash, hashSecret('coach:' + account.coachId, password));
  // 平行遷移：首次新版登入可用既有 ADMIN_KEY，成功後立即建立雜湊。
  if (!account.coachPasswordHash && getProp('ADMIN_KEY') && safeEqual(getProp('ADMIN_KEY'), password)) {
    valid = true;
    updateObjectRow(setting.sheet, COACH_SETTING_HEADERS, setting.row, { coachPasswordHash: hashSecret('coach:' + account.coachId, password), updatedAt: nowIso() });
  }
  if (!valid) {
    var didLock = recordLoginFailure(setting.sheet, COACH_SETTING_HEADERS, setting.row, account);
    return { ok: false, locked: didLock, setupRequired: !account.coachPasswordHash && !getProp('ADMIN_KEY'), error: didLock ? '登入錯誤次數過多，請稍後再試。' : '登入資訊不正確。' };
  }
  recordLoginSuccess(setting.sheet, COACH_SETTING_HEADERS, setting.row);
  var auth = createAuthSession('coach', { teamId: account.teamId || TEAM_ID_DEFAULT });
  return { ok: true, authToken: auth.token, user: auth.session };
}

function authCoachOnly(data, getter) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  return { ok: true, data: getter() };
}

function authorizedStudentName(data, allowCoach) {
  var session = getAuthSession(data);
  if (session && session.role === 'parent' && session.consentStatus !== 'agreed') return { ok: false, error: '請先完成家長同意與個資告知。', consentRequired: true };
  if (session && session.role === 'coach' && allowCoach) return { ok: true, name: normalizeName(data.name || data.studentName), session: session };
  if (session && (session.role === 'student' || session.role === 'parent')) return { ok: true, name: session.studentName, studentId: session.studentId, session: session };
  if (legacyLoginEnabled() && (data.legacyRole === 'student' || data.legacyRole === 'parent')) {
    var legacyName = normalizeName(data.legacyName);
    var requestedName = normalizeName(data.name || data.studentName);
    if (legacyName && (!requestedName || requestedName === legacyName)) return { ok: true, name: legacyName, legacy: true };
  }
  return { ok: false, error: '登入已失效，請重新登入。', authRequired: true };
}

function recordsForIdentity(identity) {
  var all = getAllRecords();
  return all.filter(function (r) {
    if (identity.studentId && r.studentId) return String(r.studentId) === String(identity.studentId);
    return normalizeName(r.name) === normalizeName(identity.name);
  });
}

function authRecordResult(data, mode) {
  var identity = authorizedStudentName(data, true);
  if (!identity.ok) return identity;
  var rows = recordsForIdentity(identity).sort(byTimestampDesc);
  // 家長（含舊制以姓名登入的家長）只能拿摘要，不得收到完整 KPI/體重/疼痛/尿液等敏感欄位
  var isParent = (identity.session && identity.session.role === 'parent') || (identity.legacy && data.legacyRole === 'parent');
  if (isParent) rows = rows.map(parentRecordSummary);
  return { ok: true, data: mode === 'last' ? (rows[0] || null) : rows.slice(0, Number(data.limit || 7)) };
}

function parentRecordSummary(r) {
  return {
    recordId: r.recordId, studentId: r.studentId, name: r.name, date: r.date,
    group: r.group, trainingTopic: r.trainingTopic, status: r.status,
    absenceReason: r.absenceReason, absenceReflection: r.absenceReflection,
    tomorrowGoal: r.tomorrowGoal,
    nutritionAdviceParent: r.nutritionAdviceParent, coachReply: r.coachReply,
    parentNote: r.parentNote, timestamp: r.timestamp
  };
}

function authTeamRecords(data, date) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  return { ok: true, data: getRecordsByDate(date).filter(function (r) { return !r.teamId || r.teamId === auth.session.teamId; }) };
}

function authAllRecords(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  return { ok: true, data: getAllRecords() };
}

function addRecordAuthorized(data) {
  var payload = data.payload || {};
  var session = getAuthSession(data);
  var studentRequest = false;
  if (session && session.role === 'student') {
    payload.name = session.studentName;
    payload.studentId = session.studentId;
    studentRequest = true;
  } else if (!session || session.role !== 'coach') {
    if (!legacyLoginEnabled() || data.legacyRole !== 'student' || normalizeName(data.legacyName) !== normalizeName(payload.name)) {
      return { ok: false, error: '你沒有權限送出這筆資料。', forbidden: true };
    }
    studentRequest = true;
  }

  var openKpi = null;
  var hasKpiScores = payload.totalScore !== '' && payload.totalScore != null && String(payload.rawScoresJson || '') !== '';
  if (studentRequest && String(payload.group || '').indexOf('未出席') === -1) {
    var kpiState = getStudentKpiSession(data);
    if (kpiState && kpiState.ok && kpiState.state === 'open' && hasKpiScores) openKpi = kpiState.session;
    else stripDailyKpiFields(payload);
  }

  var saved = addRecord(payload);
  if (saved.ok && openKpi) {
    var weeklyData = {
      authToken: data.authToken, legacyRole: data.legacyRole, legacyName: data.legacyName,
      sessionId: openKpi.sessionId,
      scores: {
        technicalScore: payload.technicalAvg,
        tacticalScore: payload.tacticalAvg,
        physicalScore: payload.physicalAvg,
        mentalScore: payload.focusAvg,
        attitudeScore: payload.disciplineAvg,
        recoveryScore: payload.emotionAvg
      },
      bestThingThisWeek: payload.reflection,
      needImproveThisWeek: payload.lowItems,
      nextWeekGoal: payload.tomorrowGoal
    };
    saved.kpi = submitWeeklyKpi(weeklyData);
  }
  return saved;
}

function stripDailyKpiFields(payload) {
  [
    'physicalAvg', 'technicalAvg', 'focusAvg', 'disciplineAvg', 'emotionAvg', 'tacticalAvg',
    'totalScore', 'averageScore', 'lowItems', 'rawScoresJson'
  ].forEach(function (key) { delete payload[key]; });
}

function authAttendanceByStudent(data) {
  var identity = authorizedStudentName(data, true);
  if (!identity.ok) return identity;
  var rows = getAttendanceReportsByName(identity.name, data.limit || 60);
  // 只有教練看得到教練內部備註；學生／家長（含舊制以姓名登入者）一律去除
  var isCoach = identity.session && identity.session.role === 'coach';
  if (!isCoach) rows = rows.map(function (r) {
    var copy = {};
    Object.keys(r).forEach(function (key) { if (key !== 'coachPrivateNote') copy[key] = r[key]; });
    return copy;
  });
  return { ok: true, data: rows };
}

function updateRecordAuthorized(data) {
  var session = getAuthSession(data);
  if (!session) {
    if (legacyLoginEnabled() && (data.legacyRole === 'student' || data.legacyRole === 'parent')) {
      var legacyAllowed = data.legacyRole === 'parent' ? ['parentNote'] : ['studentResponse'];
      var legacyFields = {};
      legacyAllowed.forEach(function (key) { if (data.fields && Object.prototype.hasOwnProperty.call(data.fields, key)) legacyFields[key] = data.fields[key]; });
      return updateRecord(data.recordId, legacyFields);
    }
    return { ok: false, error: '登入已失效，請重新登入。', authRequired: true };
  }
  var fields = data.fields || {};
  if (session.role === 'coach') return updateRecord(data.recordId, fields);
  var record = findRecordById(data.recordId);
  if (!record || (record.studentId ? record.studentId !== session.studentId : normalizeName(record.name) !== normalizeName(session.studentName))) return { ok: false, error: '你沒有權限修改這筆資料。', forbidden: true };
  var allowed = session.role === 'parent' ? ['parentNote'] : ['studentResponse'];
  var safeFields = {};
  allowed.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(fields, key)) safeFields[key] = fields[key]; });
  return updateRecord(data.recordId, safeFields);
}

function findRecordById(recordId) {
  var rows = getAllRecords();
  for (var i = 0; i < rows.length; i++) if (String(rows[i].recordId) === String(recordId)) return rows[i];
  return null;
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

/* ============================================================
   家長後台：parents / attendance_reports
   ============================================================ */

function getSheetWithHeaders(sheetName, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  if (sh.getLastRow() === 0 || sh.getLastColumn() < headers.length || sh.getRange(1, 1).getValue() !== headers[0]) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getParentsSheet() {
  return getSheetWithHeaders(PARENTS_SHEET, PARENT_HEADERS);
}

function getAttendanceReportsSheet() {
  return getSheetWithHeaders(ATTENDANCE_REPORTS_SHEET, ATTENDANCE_REPORT_HEADERS);
}

function readSheetObjects(sh, headers) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var obj = rowToObject(headers, values[i]);
    if (obj.date) obj.date = formatDateCell(obj.date);
    out.push(obj);
  }
  return out;
}

function getParents() {
  var rows = readSheetObjects(getParentsSheet(), PARENT_HEADERS);
  return rows.filter(function (r) {
    return String(r.studentName || '').trim() && String(r.loginCode || '').trim();
  });
}

function getParentsForCoach() {
  return readSheetObjects(getParentsSheet(), PARENT_HEADERS);
}

/* ============================================================
   教練後台：選手帳號與家長帳號管理
   ============================================================ */

function getAccountAdminData(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  syncStudentAccountsFromRoster();
  var groupMap = latestGroupByName();
  var students = readSheetObjects(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS).map(function (r) {
    return {
      studentId: r.studentId, studentName: r.studentName, teamId: r.teamId,
      group: groupMap[String(r.studentName || '').trim()] || '',
      accountStatus: r.accountStatus, pinSet: !!r.pinHash && !r.pinResetRequired,
      pinResetRequired: !!r.pinResetRequired, activationCodeExpiresAt: r.activationCodeExpiresAt,
      failedLoginCount: Number(r.failedLoginCount || 0), lockedUntil: r.lockedUntil,
      lastLoginAt: r.lastLoginAt
    };
  });
  var parents = getParentsForCoach().map(function (r) {
    var phone = parentPhoneValue(r);
    return {
      parentId: r.parentId, studentId: r.studentId, studentName: r.studentName,
      parentName: r.parentName, parentPhone: phone, parentPhoneLast4: phone.slice(-4),
      bindStatus: r.bindStatus || r.status || 'pending', consentStatus: r.consentStatus || 'pending',
      lastLoginAt: r.lastLoginAt, failedLoginCount: Number(r.failedLoginCount || 0), lockedUntil: r.lockedUntil
    };
  });
  return { ok: true, data: { students: students, parents: parents, legacyLoginEnabled: legacyLoginEnabled() } };
}

function newActivationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function studentAccountAction(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findObjectRow(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, 'studentId', data.studentId);
  if (!found) return { ok: false, error: '找不到選手帳號。' };
  var action = String(data.accountAction || '');
  var fields = { updatedAt: nowIso() };
  var activationCode = '';
  if (action === 'generateActivation' || action === 'resetPin') {
    activationCode = newActivationCode();
    fields.activationCodeHash = hashSecret('activation:' + found.object.studentId, activationCode);
    fields.activationCodeExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    fields.pinResetRequired = true;
    fields.failedLoginCount = 0;
    fields.lockedUntil = '';
    if (action === 'resetPin') fields.pinHash = '';
    if (found.object.accountStatus !== 'disabled') fields.accountStatus = 'pending';
  } else if (action === 'unlock') {
    fields.failedLoginCount = 0; fields.lockedUntil = '';
    if (found.object.accountStatus === 'locked') fields.accountStatus = found.object.pinHash ? 'active' : 'pending';
  } else if (action === 'disable') {
    fields.accountStatus = 'disabled';
  } else if (action === 'enable') {
    fields.accountStatus = found.object.pinHash && !found.object.pinResetRequired ? 'active' : 'pending';
  } else {
    return { ok: false, error: '未知的帳號操作。' };
  }
  updateObjectRow(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, found.row, fields);
  return { ok: true, activationCode: activationCode, expiresAt: fields.activationCodeExpiresAt || '' };
}

function upsertParentAccount(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var student = findObjectRow(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS, 'studentId', data.studentId);
  if (!student) return { ok: false, error: '找不到選手帳號。' };
  var phone = normalizePhone(data.parentPhone);
  if (phone.length < 8) return { ok: false, error: '請輸入完整家長手機號碼。' };
  var sh = getParentsSheet();
  var found = data.parentId ? findObjectRow(sh, PARENT_HEADERS, 'parentId', data.parentId) : findParentByStudentName(student.object.studentName);
  var now = nowIso();
  var fields = {
    studentId: student.object.studentId, studentName: student.object.studentName,
    parentName: normalizeName(data.parentName), phone: phone, parentPhone: phone,
    parentPhoneLast4: phone.slice(-4), bindStatus: 'pending', status: 'pending',
    failedLoginCount: 0, lockedUntil: '', updatedAt: now
  };
  if (found) updateObjectRow(sh, PARENT_HEADERS, found.row, fields);
  else {
    fields.parentId = Utilities.getUuid(); fields.createdAt = now;
    sh.appendRow(PARENT_HEADERS.map(function (key) { return fields[key] == null ? '' : fields[key]; }));
  }
  return { ok: true };
}

function parentAccountAction(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var sh = getParentsSheet();
  var found = findObjectRow(sh, PARENT_HEADERS, 'parentId', data.parentId);
  if (!found) return { ok: false, error: '找不到家長帳號。' };
  var action = String(data.accountAction || '');
  var fields = { updatedAt: nowIso() };
  if (action === 'unlock') { fields.failedLoginCount = 0; fields.lockedUntil = ''; }
  else if (action === 'unbind') { fields.bindStatus = 'pending'; fields.firstVerifiedAt = ''; fields.lastLoginAt = ''; }
  else if (action === 'disable') { fields.bindStatus = 'disabled'; fields.status = 'disabled'; }
  else if (action === 'enable') { fields.bindStatus = 'pending'; fields.status = 'pending'; }
  else return { ok: false, error: '未知的家長帳號操作。' };
  updateObjectRow(sh, PARENT_HEADERS, found.row, fields);
  return { ok: true };
}

function setLegacyLoginEnabled(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  setProp('LEGACY_LOGIN_ENABLED', data.enabled ? 'true' : 'false');
  return { ok: true, legacyLoginEnabled: legacyLoginEnabled() };
}

function setCoachPassword(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var password = String(data.newPassword || '');
  if (password.length < 8) return { ok: false, error: '教練密碼至少需要 8 個字元。' };
  var setting = getCoachSetting();
  updateObjectRow(setting.sheet, COACH_SETTING_HEADERS, setting.row, {
    coachPasswordHash: hashSecret('coach:' + setting.object.coachId, password),
    failedLoginCount: 0, lockedUntil: '', updatedAt: nowIso()
  });
  return { ok: true };
}

/* ============================================================
   Phase 2：KPI 回報手動開啟（kpi_sessions / weekly_kpi_reports）
   ------------------------------------------------------------
   - 每日基本回報每天開放，30 項 KPI 由教練手動開啟 session。
   - 學生端依 session 狀態顯示每日 KPI，送出後同步產生每週 KPI 摘要。
   - 所有教練操作需 coach session；學生送出需 student/parent? → 僅 student。
   ============================================================ */

function getKpiSessionsSheet() { return getSheetWithHeaders(KPI_SESSIONS_SHEET, KPI_SESSION_HEADERS); }
function getWeeklyKpiReportsSheet() { return getSheetWithHeaders(WEEKLY_KPI_REPORTS_SHEET, WEEKLY_KPI_REPORT_HEADERS); }

// ISO 週代號（yyyy-Www），給 weekId 用
function isoWeekId(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + '-W' + ('0' + week).slice(-2);
}

// 把 closeAt 預設值（今晚21:00 / 明天21:00 / 週日21:00）轉成 ISO
function resolveCloseAt(preset, custom) {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  if (preset === 'custom' && custom) return new Date(custom).toISOString();
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
  if (preset === 'tomorrow21') d.setDate(d.getDate() + 1);
  else if (preset === 'sunday21') { var add = (7 - d.getDay()) % 7; d.setDate(d.getDate() + add); }
  else if (preset === 'tonight21' && now.getHours() >= 21) d.setDate(d.getDate() + 1); // 已過今晚 21 點則順延
  return d.toISOString();
}

// 取目前「實際」狀態：考慮 closeAt 過期 → closed
function effectiveSessionStatus(s) {
  if (s.status === 'closed') return 'closed';
  var now = Date.now();
  var openAt = s.openAt ? new Date(s.openAt).getTime() : 0;
  var closeAt = s.closeAt ? new Date(s.closeAt).getTime() : 0;
  // 排程建立時的舊資料會存成 draft；到達 openAt 後仍應自動開放。
  if (s.status === 'draft' && openAt && now < openAt) return 'scheduled';
  if (openAt && now < openAt) return 'scheduled';
  if (closeAt && now > closeAt) return 'closed';
  return 'open';
}

// 學生是否在此 session 對象內
function studentInTarget(session, studentId, studentName, group) {
  var ids = String(session.targetStudentIds || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (ids.length) return ids.indexOf(studentId) !== -1 || ids.indexOf(studentName) !== -1;
  var tg = String(session.targetGroup || '全隊');
  if (!tg || tg === '全隊' || tg === 'all') return true;
  return String(group || '').indexOf(tg) !== -1;
}

function listKpiSessions() {
  return readSheetObjects(getKpiSessionsSheet(), KPI_SESSION_HEADERS).filter(function (s) { return s.sessionId; });
}

function findKpiSession(sessionId) {
  return findObjectRow(getKpiSessionsSheet(), KPI_SESSION_HEADERS, 'sessionId', sessionId);
}

// 每位學生「最近一筆有效訓練紀錄」的組別（給 KPI 開放對象比對用）。
// student_accounts 沒有組別欄，組別來自每日回報的 group。
function latestGroupByName() {
  var map = {};
  var all;
  try { all = getAllRecords(); } catch (e) { all = []; }
  // getAllRecords 已是新→舊或含 timestamp；逐筆取較新的覆蓋
  all.forEach(function (r) {
    var name = String(r.name || '').trim();
    var grp = String(r.group || '').trim();
    if (!name || !grp || grp.indexOf('未出席') !== -1) return;
    var t = new Date(r.timestamp || r.date || 0).getTime();
    if (!map[name] || t >= map[name].t) map[name] = { group: grp, t: t };
  });
  var out = {};
  Object.keys(map).forEach(function (n) { out[n] = map[n].group; });
  return out;
}

function activeStudentAccounts() {
  syncStudentAccountsFromRoster();
  return readSheetObjects(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS).filter(function (a) {
    return a.studentId && a.studentName && a.accountStatus !== 'disabled';
  });
}

// 新 session 一律把開放對象展開成 studentId 快照，避免日後換組影響完成率。
function resolveKpiTargetSnapshot(data) {
  var accounts = activeStudentAccounts();
  var byId = {};
  accounts.forEach(function (a) { byId[String(a.studentId)] = a; });
  var requested = Array.isArray(data.targetStudentIds)
    ? data.targetStudentIds
    : String(data.targetStudentIds || '').split(',');
  requested = requested.map(function (id) { return String(id || '').trim(); }).filter(Boolean);
  requested = requested.filter(function (id, i, arr) { return arr.indexOf(id) === i; });

  var targets;
  if (requested.length) {
    var invalid = requested.filter(function (id) { return !byId[id]; });
    if (invalid.length) return { ok: false, error: '指定名單包含不存在或已停用的選手，請重新選擇。' };
    targets = requested.map(function (id) { return byId[id]; });
  } else {
    var targetGroup = String(data.targetGroup || '全隊');
    var groupMap = latestGroupByName();
    targets = accounts.filter(function (a) {
      return studentInTarget({ targetGroup: targetGroup, targetStudentIds: '' }, a.studentId, a.studentName,
        groupMap[String(a.studentName).trim()] || '');
    });
  }
  if (!targets.length) return { ok: false, error: '開放對象為空，請至少選擇一位有效選手。' };
  return { ok: true, accounts: accounts, targets: targets, ids: targets.map(function (a) { return String(a.studentId); }) };
}

function kpiTargetIds(session, accounts, groupMap) {
  var ids = String(session.targetStudentIds || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean);
  if (ids.length) return ids;
  return accounts.filter(function (a) {
    return studentInTarget(session, a.studentId, a.studentName, groupMap[String(a.studentName).trim()] || '');
  }).map(function (a) { return String(a.studentId); });
}

function kpiTargetConflict(candidate, excludeSessionId) {
  var accounts = readSheetObjects(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS);
  var groupMap = latestGroupByName();
  var candidateIds = kpiTargetIds(candidate, accounts, groupMap);
  var candidateMap = {};
  candidateIds.forEach(function (id) { candidateMap[id] = true; });
  var conflicts = [];
  listKpiSessions().forEach(function (s) {
    if (String(s.sessionId) === String(excludeSessionId || '')) return;
    var status = effectiveSessionStatus(s);
    if (status !== 'open' && status !== 'scheduled') return;
    var overlap = kpiTargetIds(s, accounts, groupMap).some(function (id) { return candidateMap[id]; });
    if (overlap) conflicts.push(s.sessionName || s.sessionId);
  });
  return conflicts;
}

// 一個 session 的完成統計（完成率、紅黃綠、名單）
function kpiSessionStats(session) {
  var reports = readSheetObjects(getWeeklyKpiReportsSheet(), WEEKLY_KPI_REPORT_HEADERS)
    .filter(function (r) { return String(r.sessionId) === String(session.sessionId); });
  var accounts = readSheetObjects(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS);
  // 新 session 已保存名單快照；即使帳號日後停用，歷史完成率分母也不能漂移。
  if (!session.targetStudentIds) accounts = accounts.filter(function (a) { return a.accountStatus !== 'disabled'; });
  // 對象名單（依 targetGroup/targetStudentIds）。組別來自每日回報的最新 group。
  var groupMap = latestGroupByName();
  var targets = accounts.filter(function (a) { return studentInTarget(session, a.studentId, a.studentName, groupMap[String(a.studentName).trim()] || ''); });
  var doneById = {}, doneNames = {};
  reports.forEach(function (r) {
    if (r.studentId) doneById[String(r.studentId)] = r;
    doneNames[String(r.studentName).trim()] = r;
  });
  var done = [], pending = [], red = 0, yellow = 0, green = 0, sum = 0, cnt = 0;
  targets.forEach(function (a) {
    var rep = doneById[String(a.studentId)] || doneNames[String(a.studentName).trim()];
    if (rep) {
      done.push(a.studentName);
      var avg = parseFloat(rep.averageScore); if (!isNaN(avg)) { sum += avg; cnt++; }
      var rl = String(rep.riskLevel || '');
      if (rl.indexOf('紅') !== -1 || rl === 'red') red++;
      else if (rl.indexOf('黃') !== -1 || rl === 'yellow') yellow++;
      else if (rl.indexOf('綠') !== -1 || rl === 'green') green++;
    } else { pending.push(a.studentName); }
  });
  var total = targets.length;
  return {
    total: total, doneCount: done.length, pendingCount: pending.length,
    completionRate: total ? Math.round((done.length / total) * 100) : 0,
    avgScore: cnt ? Math.round((sum / cnt) * 10) / 10 : null,
    red: red, yellow: yellow, green: green,
    doneNames: done, pendingNames: pending, reports: reports
  };
}

// 教練：手動開啟 KPI（建立 session）
function createKpiSession(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var targetSnapshot = resolveKpiTargetSnapshot(data);
  if (!targetSnapshot.ok) return targetSnapshot;
  if (data.lineNotify && targetSnapshot.targets.length !== targetSnapshot.accounts.length) {
    return { ok: false, error: '目前 LINE 通知是全頻道廣播，只有開放全隊時才能使用。' };
  }
  var conflicts = kpiTargetConflict({ targetStudentIds: targetSnapshot.ids.join(','), targetGroup: data.targetGroup || '全隊' });
  if (conflicts.length) return { ok: false, error: '部分選手已有進行中的 KPI：' + conflicts.join('、') + '。請先關閉原回報。' };
  var now = nowIso();
  var openMode = data.openMode === 'autoReminder' ? 'autoReminder' : 'manual';
  var openAt = (data.openAt === 'schedule' && data.openAtTime) ? new Date(data.openAtTime).toISOString() : now;
  var closeAt = resolveCloseAt(data.closeAtPreset || 'tonight21', data.closeAtTime);
  var status = (data.openAt === 'schedule' && new Date(openAt).getTime() > Date.now()) ? 'draft' : 'open';
  var session = {
    sessionId: 'kpi_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    sessionName: String(data.sessionName || '本週 KPI 成長回報').trim(),
    sessionType: data.sessionType || 'weekly',
    weekId: data.weekId || isoWeekId(new Date()),
    openMode: openMode,
    targetGroup: data.targetGroup || '全隊',
    targetStudentIds: targetSnapshot.ids.join(','),
    openAt: openAt,
    closeAt: closeAt,
    status: status,
    includeInWeeklyReport: data.includeInWeeklyReport === false ? false : true,
    includeInMonthlyReport: data.includeInMonthlyReport === false ? false : true,
    lineNotify: !!data.lineNotify,
    createdBy: 'coach',
    createdAt: now,
    updatedAt: now
  };
  var sh = getKpiSessionsSheet();
  sh.appendRow(KPI_SESSION_HEADERS.map(function (h) { return session[h] == null ? '' : session[h]; }));
  // 可選：開啟即發 LINE 學生版提醒
  if (session.lineNotify && status === 'open') {
    try { pushToLine(kpiReminderText('student', session, null)); } catch (e) {}
  }
  return { ok: true, session: session };
}

function updateKpiSessionStatus(data, status) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  if (status === 'open') {
    var conflicts = kpiTargetConflict(found.object, found.object.sessionId);
    if (conflicts.length) return { ok: false, error: '部分選手已有進行中的 KPI：' + conflicts.join('、') + '。請先關閉原回報。' };
  }
  var fields = { status: status, updatedAt: nowIso() };
  if (status === 'open' && data.closeAtPreset) fields.closeAt = resolveCloseAt(data.closeAtPreset, data.closeAtTime);
  updateObjectRow(found.sheet, KPI_SESSION_HEADERS, found.row, fields);
  return { ok: true };
}

function extendKpiSession(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  var conflicts = kpiTargetConflict(found.object, found.object.sessionId);
  if (conflicts.length) return { ok: false, error: '部分選手已有進行中的 KPI：' + conflicts.join('、') + '。請先關閉原回報。' };
  var newClose = resolveCloseAt(data.closeAtPreset || 'custom', data.closeAtTime);
  updateObjectRow(found.sheet, KPI_SESSION_HEADERS, found.row, { closeAt: newClose, status: 'open', updatedAt: nowIso() });
  return { ok: true, closeAt: newClose };
}

function getKpiSessions(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var sessions = listKpiSessions().map(function (s) {
    s.effectiveStatus = effectiveSessionStatus(s);
    s.stats = kpiSessionStats(s);
    return s;
  }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { ok: true, data: sessions };
}

function getKpiSessionDetail(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  var session = found.object;
  session.effectiveStatus = effectiveSessionStatus(session);
  return { ok: true, session: session, stats: kpiSessionStats(session) };
}

// 學生端：目前該填的 KPI 狀態（section 十）
function getStudentKpiSession(data) {
  var who = authorizedStudentName(data, false);
  if (!who.ok) return who;
  var studentName = who.name, studentId = who.studentId || '';
  var myGroup = latestGroupByName()[String(studentName).trim()] || '';
  var sessions = listKpiSessions();
  // 找最新一個「對這位學生有效（open/scheduled）」的 session
  var open = sessions.filter(function (s) {
    var es = effectiveSessionStatus(s);
    return (es === 'open' || es === 'scheduled') && studentInTarget(s, studentId, studentName, myGroup);
  }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0];

  if (!open) {
    // 是否有最近剛截止的
    var recentClosed = sessions.filter(function (s) { return effectiveSessionStatus(s) === 'closed' && studentInTarget(s, studentId, studentName, myGroup); })
      .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })[0];
    if (recentClosed) return { ok: true, state: 'closed', session: recentClosed, message: '本次 KPI 已截止。如需補填，請洽教練重新開放。' };
    return { ok: true, state: 'none', message: '本週 KPI 尚未開放，請依照教練通知時間填寫。' };
  }
  var es = effectiveSessionStatus(open);
  if (es === 'scheduled') return { ok: true, state: 'scheduled', session: open, message: '本週 KPI 尚未開放，請依照教練通知時間填寫。' };

  // 是否已填過此 session
  var reports = readSheetObjects(getWeeklyKpiReportsSheet(), WEEKLY_KPI_REPORT_HEADERS);
  var already = reports.some(function (r) {
    return String(r.sessionId) === String(open.sessionId) &&
      (studentId ? String(r.studentId) === String(studentId) : String(r.studentName).trim() === String(studentName).trim());
  });
  if (already) return { ok: true, state: 'done', session: open, message: '你已完成本次 KPI 回報，可以查看本週成長報告。' };
  return {
    ok: true, state: 'open', session: open,
    message: '本次 KPI 回報已開放。請用這段時間的整體表現誠實填寫。這不是考試分數，而是幫助教練了解你的訓練狀態。'
  };
}

// 學生端：送出每週 KPI（section 九）
function submitWeeklyKpi(data) {
  var who = authorizedStudentName(data, false);
  if (!who.ok) return who;
  var studentName = who.name, studentId = who.studentId || '';
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  var session = found.object;
  if (effectiveSessionStatus(session) !== 'open') return { ok: false, error: '本次 KPI 已截止或尚未開放。' };
  var myGroup = latestGroupByName()[String(studentName).trim()] || '';
  if (!studentInTarget(session, studentId, studentName, myGroup)) return { ok: false, error: '本次 KPI 不需要你填寫。' };

  var sh = getWeeklyKpiReportsSheet();
  var reports = readSheetObjects(sh, WEEKLY_KPI_REPORT_HEADERS);
  var dup = reports.filter(function (r) {
    return String(r.sessionId) === String(session.sessionId) &&
      (studentId ? String(r.studentId) === String(studentId) : String(r.studentName).trim() === String(studentName).trim());
  });
  if (dup.length) return { ok: false, error: '你已完成本次 KPI 回報。' };

  var sc = data.scores || {};
  var keys = ['technicalScore', 'tacticalScore', 'physicalScore', 'mentalScore', 'attitudeScore', 'recoveryScore'];
  var nums = keys.map(function (k) { return parseFloat(sc[k]); }).filter(function (n) { return !isNaN(n); });
  var total = nums.reduce(function (a, b) { return a + b; }, 0);
  var avg = nums.length ? Math.round((total / nums.length) * 10) / 10 : '';
  // 與上次比較：同一學生上一筆（不同 session）的 averageScore
  var prev = reports.filter(function (r) { return String(r.studentName).trim() === String(studentName).trim(); })
    .sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); })[0];
  var lastWeek = prev ? parseFloat(prev.averageScore) : NaN;
  var change = (!isNaN(lastWeek) && avg !== '') ? Math.round((avg - lastWeek) * 10) / 10 : '';
  var risk = avg === '' ? '' : (avg >= 4 ? '🟢 綠燈' : avg >= 3 ? '🟡 黃燈' : '🔴 紅燈');

  var row = {
    reportId: 'wk_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    sessionId: session.sessionId, weekId: session.weekId, studentId: studentId, studentName: studentName,
    technicalScore: sc.technicalScore || '', tacticalScore: sc.tacticalScore || '', physicalScore: sc.physicalScore || '',
    mentalScore: sc.mentalScore || '', attitudeScore: sc.attitudeScore || '', recoveryScore: sc.recoveryScore || '',
    totalScore: total || '', averageScore: avg, lastWeekScore: isNaN(lastWeek) ? '' : lastWeek, changeScore: change, riskLevel: risk,
    bestThingThisWeek: String(data.bestThingThisWeek || '').slice(0, 500),
    needImproveThisWeek: String(data.needImproveThisWeek || '').slice(0, 500),
    nextWeekGoal: String(data.nextWeekGoal || '').slice(0, 500),
    submittedAt: nowIso()
  };
  sh.appendRow(WEEKLY_KPI_REPORT_HEADERS.map(function (h) { return row[h] == null ? '' : row[h]; }));
  return { ok: true, report: row };
}

// LINE 提醒文案（section 十二）
function kpiReminderText(kind, session, stats) {
  var name = session.sessionName || '本週 KPI 回報';
  if (kind === 'student') {
    return '【' + name + '】本次 KPI 回報已開放。請在截止前完成。這不是考試分數，而是幫助教練了解你這段時間的訓練狀態。';
  }
  if (kind === 'pending') {
    var list = stats && stats.pendingNames && stats.pendingNames.length ? stats.pendingNames.join('、') : '（無）';
    return '【' + name + '】你尚未完成本次 KPI 回報。請在截止前完成，讓教練可以安排下週訓練重點。\n未完成：' + list;
  }
  // coach
  if (stats) {
    return '【' + name + '】KPI 完成率：' + stats.doneCount + '/' + stats.total +
      '。未完成：' + (stats.pendingNames.length ? stats.pendingNames.join('、') : '無') +
      '。紅燈：' + stats.red + ' 人、黃燈：' + stats.yellow + ' 人、綠燈：' + stats.green + ' 人。';
  }
  return '【' + name + '】KPI 回報統計尚未產生。';
}

function getKpiReminderTexts(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  var session = found.object;
  var stats = kpiSessionStats(session);
  var texts = {
    student: kpiReminderText('student', session, stats),
    pending: kpiReminderText('pending', session, stats),
    coach: kpiReminderText('coach', session, stats)
  };
  // 若要求直接發送學生版/未完成版到 LINE
  var pushed = null;
  if (data.send && texts[data.send]) {
    try { pushed = pushToLine(texts[data.send]); } catch (e) { pushed = { ok: false, error: String(e) }; }
  }
  return { ok: true, texts: texts, pushed: pushed };
}

// 月報用：當月「列入月報」的每週 KPI session（含完成率與六面向全隊平均）
function getMonthlyKpiSessions(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var month = String(data.month || '').slice(0, 7);
  var aspectKeys = ['technicalScore', 'tacticalScore', 'physicalScore', 'mentalScore', 'attitudeScore', 'recoveryScore'];
  var sessions = listKpiSessions().filter(function (s) {
    if (String(s.includeInMonthlyReport) === 'false') return false;
    var d = String(s.openAt || s.createdAt || '').slice(0, 7);
    return !month || d === month;
  });
  var out = sessions.map(function (s) {
    var stats = kpiSessionStats(s);
    var reports = stats.reports || [];
    var aspects = {};
    aspectKeys.forEach(function (k) {
      var xs = reports.map(function (r) { return parseFloat(r[k]); }).filter(function (n) { return !isNaN(n); });
      aspects[k] = xs.length ? Math.round((xs.reduce(function (a, b) { return a + b; }, 0) / xs.length) * 10) / 10 : null;
    });
    // 進步最多（changeScore）
    var improved = reports.filter(function (r) { return parseFloat(r.changeScore) > 0; })
      .sort(function (a, b) { return parseFloat(b.changeScore) - parseFloat(a.changeScore); })
      .slice(0, 3).map(function (r) { return { name: r.studentName, change: parseFloat(r.changeScore) }; });
    return {
      sessionId: s.sessionId, sessionName: s.sessionName, sessionType: s.sessionType, weekId: s.weekId,
      completionRate: stats.completionRate, doneCount: stats.doneCount, total: stats.total,
      avgScore: stats.avgScore, red: stats.red, yellow: stats.yellow, green: stats.green,
      aspects: aspects, improved: improved
    };
  });
  return { ok: true, data: out };
}

function getAllAttendanceReports() {
  var rows = readSheetObjects(getAttendanceReportsSheet(), ATTENDANCE_REPORT_HEADERS);
  rows.sort(function (a, b) {
    var da = formatDateCell(a.date || a.timestamp || '');
    var db = formatDateCell(b.date || b.timestamp || '');
    if (db !== da) return String(db).localeCompare(String(da));
    return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  });
  return rows;
}

function getAttendanceReportsByName(studentName, limit) {
  if (!studentName) return [];
  var rows = getAllAttendanceReports().filter(function (r) {
    return String(r.studentName || '').trim() === String(studentName).trim();
  });
  return rows.slice(0, limit || 60);
}

/* ============================================================
   通用同步儲存（appdata 工作表：A=key、B=value(JSON 字串)）
   ------------------------------------------------------------
   給教練指定任務、個人檔案目標/備註等新功能用。
   ============================================================ */
var APPDATA_SHEET = 'appdata';

function getAppDataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(APPDATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(APPDATA_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 找某 key 的列號（找不到回 -1）
function appDataRow(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) return i + 2;
  }
  return -1;
}

// 讀單一 key，回傳已解析的物件（無則 null）
function getAppData(key) {
  if (!key) return null;
  var sh = getAppDataSheet();
  var row = appDataRow(sh, key);
  if (row === -1) return null;
  var raw = sh.getRange(row, 2).getValue();
  if (raw === '' || raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

// 寫單一 key（upsert）。可用 ADMIN_KEY 保護寫入。
function setAppData(key, value, data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤，無法寫入。' };
  if (!key) return { ok: false, error: '缺少 key' };
  var sh = getAppDataSheet();
  var json = JSON.stringify(value === undefined ? null : value);
  var row = appDataRow(sh, key);
  if (row === -1) sh.appendRow([key, json]);
  else sh.getRange(row, 2).setValue(json);
  return { ok: true, key: key };
}

function appDataKeyAllowedForSession(key, session) {
  key = String(key || '');
  if (session.role === 'coach') return true;
  var name = normalizeName(session.studentName);
  return key === 'profile:' + name || key === 'motto:' + name || key.indexOf('task:' + name + ':') === 0;
}

function getAppDataAuthorized(data) {
  var session = getAuthSession(data);
  if (session) {
    if (!appDataKeyAllowedForSession(data.key, session)) return { ok: false, error: '你沒有權限讀取此資料。', forbidden: true };
    var value = getAppData(data.key);
    if (value && typeof value === 'object' && session.role !== 'coach') {
      value = JSON.parse(JSON.stringify(value));
      delete value.coachNote;
      if (session.role === 'parent') delete value.studentNote;
    }
    return { ok: true, data: value };
  }
  if (legacyLoginEnabled() && (data.legacyRole === 'student' || data.legacyRole === 'parent')) {
    var legacySession = { role: data.legacyRole, studentName: normalizeName(data.legacyName) };
    if (legacySession.studentName && appDataKeyAllowedForSession(data.key, legacySession)) {
      var legacyValue = getAppData(data.key);
      if (legacyValue && typeof legacyValue === 'object') {
        legacyValue = JSON.parse(JSON.stringify(legacyValue));
        delete legacyValue.coachNote;
        if (legacySession.role === 'parent') delete legacyValue.studentNote;
      }
      return { ok: true, data: legacyValue, legacy: true };
    }
  }
  return { ok: false, error: '登入已失效，請重新登入。', authRequired: true };
}

function writeAppData(key, value) {
  if (!key) return { ok: false, error: '缺少 key' };
  var sh = getAppDataSheet();
  var json = JSON.stringify(value === undefined ? null : value);
  var row = appDataRow(sh, key);
  if (row === -1) sh.appendRow([key, json]);
  else sh.getRange(row, 2).setValue(json);
  return { ok: true, key: key };
}

function setAppDataAuthorized(data) {
  var session = getAuthSession(data);
  if (session) {
    if (!appDataKeyAllowedForSession(data.key, session)) return { ok: false, error: '你沒有權限寫入此資料。', forbidden: true };
    if (session.role === 'parent') return { ok: false, error: '家長帳號不可修改此資料。', forbidden: true };
    if (session.role === 'student') {
      var key = String(data.key || '');
      if (key.indexOf('motto:') === 0) return writeAppData(key, { text: String((data.value && data.value.text) || '').slice(0, 120) });
      if (key.indexOf('task:') === 0) {
        var current = getAppData(key) || {};
        current.completion = String((data.value && data.value.completion) || '').slice(0, 20);
        current.studentNote = String((data.value && data.value.studentNote) || '').slice(0, 1000);
        return writeAppData(key, current);
      }
      return { ok: false, error: '選手不可修改此資料。', forbidden: true };
    }
    return writeAppData(data.key, data.value);
  }
  if (legacyLoginEnabled() && data.legacyRole === 'student') {
    var legacySession = { role: 'student', studentName: normalizeName(data.legacyName) };
    if (legacySession.studentName && appDataKeyAllowedForSession(data.key, legacySession)) {
      var key = String(data.key || '');
      if (key.indexOf('motto:') === 0) return writeAppData(key, { text: String((data.value && data.value.text) || '').slice(0, 120) });
      if (key.indexOf('task:') === 0) {
        var current = getAppData(key) || {};
        current.completion = String((data.value && data.value.completion) || '').slice(0, 20);
        current.studentNote = String((data.value && data.value.studentNote) || '').slice(0, 1000);
        return writeAppData(key, current);
      }
    }
  }
  return setAppData(data.key, data.value, data);
}

// 取得某前綴的所有 key/value（例如 prefix='task:' 取全部任務）
function getAllAppData(prefix) {
  var sh = getAppDataSheet();
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0]);
    if (!k) continue;
    if (prefix && k.indexOf(prefix) !== 0) continue;
    try { out[k] = JSON.parse(vals[i][1]); } catch (e) { out[k] = vals[i][1]; }
  }
  return out;
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
  return pushToLine('✅ 育林國中技擊隊系統｜LINE 測試訊息，看到這則代表推播設定成功。');
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
  var result = coachLogin({ coachPassword: data && data.adminKey });
  result.keySet = !!(getCoachSetting().object.coachPasswordHash || getProp('ADMIN_KEY'));
  return result;
}

// 驗證管理密碼（若有設定 ADMIN_KEY）
function checkAdminKey(data) {
  var session = getAuthSession(data);
  if (session && session.role === 'coach') return true;
  if (!legacyLoginEnabled()) return false;
  var key = getProp('ADMIN_KEY');
  if (!key) return true; // 未設定密碼則不檢查
  return data && data.adminKey === key;
}

// 設定本週之星開關（教練端，可用 ADMIN_KEY 保護）
function setStarConfig(data) {
  if (!checkAdminKey(data)) return { ok: false, error: '管理密碼錯誤，無法修改設定。' };
  setProp('STAR_ENABLED', data && data.enabled ? 'true' : 'false');
  return { ok: true, data: { enabled: getProp('STAR_ENABLED') !== 'false' } };
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
  return pushToLine('✅ 育林國中技擊隊系統｜LINE 測試訊息，看到這則代表推播設定成功。');
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
