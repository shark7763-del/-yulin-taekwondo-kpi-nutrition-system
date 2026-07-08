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
var COACH_SCORES_SHEET = 'coach_scores';
var AI_SCORES_SHEET = 'ai_scores';
var TRAINING_TASKS_SHEET = 'training_tasks';
var RISK_FLAGS_SHEET = 'risk_flags';
var COACH_REPLIES_SHEET = 'coach_replies';
var STUDENT_TRAITS_SHEET = 'student_traits';
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
  'consentParentNotice', 'consentReport', 'consentLineNotice', 'consentAnonymousResearch'
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
var COACH_SCORE_HEADERS = [
  'timestamp', 'date', 'studentName', 'athleteId', 'coachAttitudeScore', 'coachTechnicalScore',
  'coachTechniqueScore', 'coachExecutionScore', 'coachRiskScore', 'coachOverallScore',
  'coachPublicNote', 'coachPrivateNote'
];
var AI_SCORE_HEADERS = [
  'timestamp', 'date', 'studentName', 'athleteId', 'selfScore', 'coachScore', 'recoveryScore',
  'attendanceScore', 'riskPenalty', 'finalReadinessScore', 'readinessStatusLight', 'statusLight', 'aiTags',
  'aiLabel', 'trainingAdvice', 'trainingDirection', 'algorithmType', 'athleteFeedback', 'parentFeedback', 'coachFeedback'
];
var TRAINING_TASK_HEADERS = [
  'timestamp', 'date', 'studentName', 'taskTitle', 'taskDescription', 'taskType',
  'taskStatus', 'assignedBy', 'completedAt'
];
var RISK_FLAG_HEADERS = [
  'timestamp', 'riskId', 'athleteId', 'date', 'studentName', 'riskType', 'riskLevel', 'riskReason',
  'suggestedAction', 'isReviewed', 'reviewedAt', 'reviewedBy', 'actionTaken',
  'followUpDate', 'isResolved', 'resolvedAt', 'coachNote'
];
var COACH_REPLY_HEADERS = [
  'timestamp', 'studentName', 'recordDate', 'rangeDays', 'sourceRecordId',
  'replyText', 'summaryText', 'generatedByAI', 'confirmedByCoach', 'createdBy'
];
var STUDENT_TRAIT_HEADERS = [
  'timestamp', 'studentName', 'traitType', 'traitLabel', 'traitScore',
  'traitSummary', 'communicationTips', 'trainingTips', 'updatedAt'
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
  ,'trainingSession', 'sweatLevel' // 訓練時段（晨操/下午/晚上/無訓練）、排汗量 1–5
  ,'selfScore', 'coachScore', 'readinessRecoveryScore', 'attendanceScore',
  'riskPenalty', 'finalReadinessScore', 'readinessStatusLight', 'aiTags',
  'trainingDirection', 'readinessJson',
  'coachAttitudeScore', 'coachTechniqueScore', 'coachExecutionScore', 'coachRiskScore',
  'coachPublicNote', 'coachPrivateNote'
  ,'studentId'                    // 新制帳號識別；加在最後以相容既有資料
  ,'athleteId', 'studentName', 'schoolLevel', 'grade', 'classCode', 'groupType', 'trainingMinutes',
  'painArea', 'emotionIndex', 'recoveryAvg', 'trainingAdvice', 'aiLabel', 'algorithmType',
  'coachTechnicalScore', 'coachOverallScore'
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
    return jsonOut({ ok: false, error: String(err), stack: err && err.stack ? String(err.stack).slice(0, 4000) : '' });
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
    return jsonOut({ ok: false, error: String(err), stack: err && err.stack ? String(err.stack).slice(0, 4000) : '' });
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
    case 'getCoachScores':
      return jsonOut(authCoachOnly(data, function () { return getCoachScores(data.date); }));
    case 'saveCoachScore':
      return jsonOut(saveCoachScore(data));
    case 'getRiskFlags':
      return jsonOut(authCoachOnly(data, function () { return getRiskFlags(data); }));
    case 'updateRiskFlag':
      return jsonOut(authCoachOnly(data, function () { return updateRiskFlag(data); }));
    case 'saveCoachReply':
      return jsonOut(saveCoachReply(data));
    case 'getCoachReplies':
      return jsonOut(getCoachReplies(data));
    case 'saveStudentTrait':
      return jsonOut(saveStudentTrait(data));
    case 'getStudentTrait':
      return jsonOut(getStudentTrait(data));
    case 'getAllStudentTraits':
      return jsonOut(getAllStudentTraits(data));
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

    /* ===== AI 教練回饋（OpenAI／GPT，三明治回饋法、學教練語氣）===== */
    case 'setAiConfig':
      return jsonOut(setAiConfig(data));
    case 'getAiConfig':
      return jsonOut(getAiConfig(data));
    case 'aiCoachFeedback':
      return jsonOut(aiCoachFeedback(data));

    /* ===== Phase 2：KPI 回報手動開啟（教練）＋學生 KPI 狀態 ===== */
    case 'createKpiSession':      // 手動開啟 KPI
      return jsonOut(createKpiSession(data));
    case 'bulkSetKpiSession':     // 批次開放／關閉本週 KPI
      return jsonOut(bulkSetKpiSession(data));
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

// 取得綁定的試算表；若目前執行環境沒有 active spreadsheet，嘗試用 Script Properties 補救。
// 這樣 Web App / 手動執行 / 遷移部署時比較不容易只看到模糊的 getRange 錯誤。
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var spreadsheetId = getProp('SPREADSHEET_ID') || getProp('APP_SPREADSHEET_ID');
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  throw new Error('找不到綁定的試算表，請先在 Apps Script 編輯器執行 setupSheet()，或設定 SPREADSHEET_ID。');
}

function ensureSheetExists_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (sh) return sh;
  sh = ss.insertSheet(sheetName);
  if (!sh) throw new Error('無法建立工作表：' + sheetName);
  return sh;
}

// 取得（或建立）資料表
function getSheet() {
  var ss = getSpreadsheet_();
  var sheet = ensureSheetExists_(ss, SHEET_NAME);
  // 確保有表頭
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
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
  getCoachScoresSheet();
  getAiScoresSheet();
  getTrainingTasksSheet();
  getRiskFlagsSheet();
  getCoachRepliesSheet();
  getStudentTraitsSheet();
  syncStudentAccountsFromRoster();
  return 'setupSheet 完成，已更新 records 並建立 roster、parents、attendance_reports、appdata、student_accounts、coach_settings、kpi_sessions、weekly_kpi_reports、coach_scores、ai_scores、training_tasks、risk_flags、coach_replies、student_traits 工作表。';
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
function normalizeTraitName(v) { return String(v || '').trim().replace(/\s+/g, ''); }
function traitLabelForType(typeKey) {
  if (typeKey === 'rocket') return '火箭型';
  if (typeKey === 'volcano') return '火山型';
  if (typeKey === 'shield') return '盾牌型';
  if (typeKey === 'cheetah') return '獵豹型';
  if (typeKey === 'growth') return '成長型';
  return '';
}
function traitTypeFromScore(score) {
  if (!score || typeof score !== 'object') return '';
  var keys = ['growth', 'shield', 'rocket', 'cheetah', 'volcano'];
  var best = '';
  var bestScore = -1;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = Number(score[key] || 0);
    if (val > bestScore) {
      bestScore = val;
      best = key;
    }
  }
  return best || '';
}
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
function getCoachScoresSheet() { return getSheetWithHeaders(COACH_SCORES_SHEET, COACH_SCORE_HEADERS); }
function getAiScoresSheet() { return getSheetWithHeaders(AI_SCORES_SHEET, AI_SCORE_HEADERS); }
function getTrainingTasksSheet() { return getSheetWithHeaders(TRAINING_TASKS_SHEET, TRAINING_TASK_HEADERS); }
function getRiskFlagsSheet() { return getSheetWithHeaders(RISK_FLAGS_SHEET, RISK_FLAG_HEADERS); }
function getCoachRepliesSheet() { return getSheetWithHeaders(COACH_REPLIES_SHEET, COACH_REPLY_HEADERS); }
function getStudentTraitsSheet() { return getSheetWithHeaders(STUDENT_TRAITS_SHEET, STUDENT_TRAIT_HEADERS); }

function findObjectRow(sh, headers, key, value) {
  if (!sh) throw new Error('工作表不存在，無法查找資料。');
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
  if (!sh) throw new Error('工作表不存在，無法更新資料。');
  if (!rowNum || rowNum < 1) throw new Error('更新列號無效：' + rowNum);
  var values = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  Object.keys(fields).forEach(function (key) {
    var idx = headers.indexOf(key);
    if (idx >= 0) values[idx] = fields[key] == null ? '' : fields[key];
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([values]);
}

// 清理同名重複的選手帳號：每個姓名只保留「最完整」的一筆，其餘刪除。
// 修正早期匯入或手動停用造成的重複列（例如同一人同時出現 active 與 disabled 兩筆）。
// 保留優先序：能正常登入(有PIN) > active > pending > locked > disabled；同級留有登入紀錄、建立較早者。
// 回傳刪除筆數。被刪的通常是從未登入、沒有任何訓練紀錄綁定的空帳號，安全。
function dedupeStudentAccounts() {
  var sh = getStudentAccountsSheet();
  var last = sh.getLastRow();
  if (last < 3) return 0;  // 少於 2 筆資料不可能重複
  var values = sh.getRange(2, 1, last - 1, STUDENT_ACCOUNT_HEADERS.length).getValues();
  var groups = {};
  for (var i = 0; i < values.length; i++) {
    var obj = rowToObject(STUDENT_ACCOUNT_HEADERS, values[i]);
    var key = normalizeName(obj.studentName);
    if (!key) continue;
    (groups[key] = groups[key] || []).push({ row: i + 2, obj: obj });
  }
  function score(o) {
    var s = 0;
    if (o.pinHash && !o.pinResetRequired) s += 1000;  // 已可正常登入
    if (o.accountStatus === 'active') s += 100;
    else if (o.accountStatus === 'pending') s += 40;
    else if (o.accountStatus === 'locked') s += 20;
    // disabled 不加分
    if (o.lastLoginAt) s += 10;  // 真的用過
    return s;
  }
  var rowsToDelete = [];
  Object.keys(groups).forEach(function (key) {
    var list = groups[key];
    if (list.length < 2) return;
    list.sort(function (a, b) {
      var d = score(b.obj) - score(a.obj);
      if (d !== 0) return d;
      return String(a.obj.createdAt || '') < String(b.obj.createdAt || '') ? -1 : 1;  // 同分留較早建立的
    });
    for (var j = 1; j < list.length; j++) rowsToDelete.push(list[j].row);  // 保留 list[0]，其餘刪除
  });
  rowsToDelete.sort(function (a, b) { return b - a; });  // 由下往上刪，避免列號位移
  rowsToDelete.forEach(function (r) { sh.deleteRow(r); });
  return rowsToDelete.length;
}

function syncStudentAccountsFromRoster() {
  dedupeStudentAccounts();  // 先清掉同名重複列，再補建缺少的帳號
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
  if (!data.consentTrainingData || !data.consentHealthData || !data.consentParentNotice || !data.consentReport || !data.consentAnonymousResearch) {
    return { ok: false, error: '請確認必要的同意項目。' };
  }
  var sh = getParentsSheet();
  var found = findObjectRow(sh, PARENT_HEADERS, 'parentId', session.parentId);
  if (!found) return { ok: false, error: '找不到家長資料。' };
  var now = nowIso();
  updateObjectRow(sh, PARENT_HEADERS, found.row, {
    consentTrainingData: true, consentHealthData: true, consentParentNotice: true,
    consentReport: true, consentLineNotice: !!data.consentLineNotice,
    consentAnonymousResearch: true,
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
    finalReadinessScore: r.finalReadinessScore,
    readinessStatusLight: r.readinessStatusLight,
    trainingDirection: r.trainingDirection,
    coachPublicNote: r.coachPublicNote,
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
    if (kpiState && kpiState.ok && kpiState.state === 'open') {
      if (!hasKpiScores) {
        return { ok: false, error: '本週 KPI 已開放，請先完成 30 項 KPI 評分後再送出每日回報。' };
      }
      openKpi = kpiState.session;
    } else {
      stripDailyKpiFields(payload);
    }
  }

  var saved = addRecord(payload);
  if (saved.ok) {
    appendAiScoreFromPayload(payload);
    appendRiskFlagsFromPayload(payload);
  }
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

function getCoachScores(date) {
  var rows = readSheetObjects(getCoachScoresSheet(), COACH_SCORE_HEADERS);
  if (date) rows = rows.filter(function (r) { return formatDateCell(r.date) === formatDateCell(date); });
  return { ok: true, data: rows };
}
function saveCoachScore(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var p = data.payload || {};
  var date = formatDateCell(p.date || todayStr());
  var name = normalizeName(p.studentName);
  if (!name) return { ok: false, error: '缺少 studentName' };
  var sh = getCoachScoresSheet();
  var rows = readSheetObjects(sh, COACH_SCORE_HEADERS);
  var rowNum = -1;
  for (var i = 0; i < rows.length; i++) {
    if (formatDateCell(rows[i].date) === date && normalizeName(rows[i].studentName) === name) { rowNum = i + 2; break; }
  }
  var fields = {
    timestamp: nowIso(), date: date, studentName: name,
    athleteId: p.athleteId || '',
    coachAttitudeScore: p.coachAttitudeScore || '',
    coachTechnicalScore: p.coachTechnicalScore || p.coachTechniqueScore || '',
    coachTechniqueScore: p.coachTechniqueScore || p.coachTechnicalScore || '',
    coachExecutionScore: p.coachExecutionScore || '',
    coachRiskScore: p.coachRiskScore || '',
    coachOverallScore: p.coachOverallScore || '',
    coachPublicNote: String(p.coachPublicNote || '').slice(0, 1000),
    coachPrivateNote: String(p.coachPrivateNote || '').slice(0, 2000)
  };
  if (rowNum > 0) updateObjectRow(sh, COACH_SCORE_HEADERS, rowNum, fields);
  else sh.appendRow(COACH_SCORE_HEADERS.map(function (h) { return fields[h] == null ? '' : fields[h]; }));

  var rec = getLastRecordByName(name);
  if (rec && formatDateCell(rec.date) === date && rec.recordId) {
    updateRecord(rec.recordId, {
      coachAttitudeScore: fields.coachAttitudeScore,
      coachTechnicalScore: fields.coachTechnicalScore,
      coachTechniqueScore: fields.coachTechniqueScore,
      coachExecutionScore: fields.coachExecutionScore,
      coachRiskScore: fields.coachRiskScore,
      coachOverallScore: fields.coachOverallScore,
      coachPublicNote: fields.coachPublicNote,
      coachPrivateNote: fields.coachPrivateNote
    });
  }
  return { ok: true, data: fields };
}

function boolLike(v) {
  return v === true || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v) === '是';
}

function saveCoachReply(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var p = data.payload || data || {};
  var name = normalizeName(p.studentName);
  var text = String(p.replyText || '').trim();
  if (!name) return { ok: false, error: '缺少 studentName' };
  if (!text) return { ok: false, error: '缺少 replyText' };

  var row = {
    timestamp: nowIso(),
    studentName: name,
    recordDate: p.recordDate ? formatDateCell(p.recordDate) : '',
    rangeDays: p.rangeDays || '',
    sourceRecordId: p.sourceRecordId || '',
    replyText: text.slice(0, 4000),
    summaryText: String(p.summaryText || p.summary || '').slice(0, 4000),
    generatedByAI: boolLike(p.generatedByAI) ? 'true' : 'false',
    confirmedByCoach: Object.prototype.hasOwnProperty.call(p, 'confirmedByCoach') ? (boolLike(p.confirmedByCoach) ? 'true' : 'false') : 'true',
    createdBy: 'coach'
  };
  getCoachRepliesSheet().appendRow(COACH_REPLY_HEADERS.map(function (h) { return row[h] == null ? '' : row[h]; }));

  if (row.sourceRecordId) {
    try { updateRecord(row.sourceRecordId, { coachReply: row.replyText }); } catch (e) { /* 不影響獨立回覆表 */ }
  }
  return { ok: true };
}

function getCoachReplies(data) {
  var identity = authorizedStudentName(data, true);
  if (!identity.ok) return identity;
  var requested = normalizeName(data.studentName || data.name);
  var name = requested || identity.name;
  var isCoach = identity.session && identity.session.role === 'coach';
  if (!isCoach) name = identity.name;
  if (!name) return { ok: false, error: '缺少 studentName' };

  var recordDate = data.recordDate ? formatDateCell(data.recordDate) : '';
  var limit = Math.max(1, Math.min(20, Number(data.limit || 1)));
  var rows = readSheetObjects(getCoachRepliesSheet(), COACH_REPLY_HEADERS).filter(function (r) {
    if (normalizeName(r.studentName) !== normalizeName(name)) return false;
    if (!boolLike(r.confirmedByCoach)) return false;
    if (!String(r.replyText || '').trim()) return false;
    return true;
  });
  rows.sort(byTimestampDesc);

  var matched = [];
  if (recordDate) {
    matched = rows.filter(function (r) { return formatDateCell(r.recordDate) === recordDate; });
  }
  if (!matched.length) matched = rows;

  return {
    ok: true,
    replies: matched.slice(0, limit).map(function (r) {
      return {
        timestamp: r.timestamp,
        studentName: r.studentName,
        recordDate: r.recordDate,
        replyText: r.replyText,
        summaryText: r.summaryText,
        generatedByAI: boolLike(r.generatedByAI),
        confirmedByCoach: boolLike(r.confirmedByCoach)
      };
    })
  };
}

function normalizeStudentTraitRow(row) {
  var traitScore = row && row.traitScore;
  if (typeof traitScore === 'string' && traitScore) {
    try { traitScore = JSON.parse(traitScore); } catch (e) {}
  }
  var scoreType = traitTypeFromScore(traitScore);
  var typeKey = scoreType || String(row.traitType || row.typeKey || '').trim();
  var label = traitLabelForType(typeKey) || String(row.traitLabel || row.label || '').trim();
  return {
    timestamp: row.timestamp || row.updatedAt || nowIso(),
    studentName: normalizeName(row.studentName || ''),
    traitType: typeKey,
    traitLabel: label,
    traitScore: traitScore && typeof traitScore === 'object' ? traitScore : (traitScore || {}),
    traitSummary: String(row.traitSummary || row.description || '').trim(),
    communicationTips: String(row.communicationTips || row.communication || '').trim(),
    trainingTips: String(row.trainingTips || row.correction || '').trim(),
    updatedAt: row.updatedAt || row.timestamp || nowIso()
  };
}

function studentTraitTimeValue(row) {
  var text = row && (row.updatedAt || row.timestamp || row.completedAt || '');
  var time = new Date(text).getTime();
  return isNaN(time) ? 0 : time;
}

function latestStudentTraitRow(rows, name) {
  var target = normalizeTraitName(name);
  var latest = null;
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i];
    if (!row || normalizeTraitName(row.studentName) !== target) continue;
    if (!latest || studentTraitTimeValue(row) >= studentTraitTimeValue(latest)) latest = row;
  }
  return latest;
}

function compactStudentTraitsSheet(sh) {
  if (!sh || sh.getLastRow() < 3) return 0;
  var rows = readSheetObjects(sh, STUDENT_TRAIT_HEADERS);
  var groups = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var key = normalizeTraitName(row.studentName);
    if (!key) continue;
    (groups[key] = groups[key] || []).push({
      rowNum: i + 2,
      time: studentTraitTimeValue(row)
    });
  }
  var toDelete = [];
  Object.keys(groups).forEach(function (key) {
    var list = groups[key];
    if (list.length < 2) return;
    list.sort(function (a, b) {
      if (b.time !== a.time) return b.time - a.time;
      return b.rowNum - a.rowNum;
    });
    for (var i = 1; i < list.length; i++) toDelete.push(list[i].rowNum);
  });
  toDelete.sort(function (a, b) { return b - a; });
  toDelete.forEach(function (rowNum) {
    sh.deleteRow(rowNum);
  });
  return toDelete.length;
}

function saveStudentTrait(data) {
  var p = data.payload || data || {};
  var session = getAuthSession(data);
  var name = normalizeName(p.studentName || data.studentName || data.name || (session && session.studentName) || '');
  if (!name) return { ok: false, error: '缺少 studentName' };
  if (session) {
    if (session.role === 'student' && normalizeTraitName(session.studentName) !== normalizeTraitName(name)) {
      return { ok: false, error: '你沒有權限儲存其他選手的特質。', forbidden: true };
    }
    if (session.role === 'parent' && normalizeTraitName(session.studentName) !== normalizeTraitName(name)) {
      return { ok: false, error: '家長只能儲存自己孩子的特質。', forbidden: true };
    }
  } else {
    if (!legacyLoginEnabled() || data.legacyRole !== 'student' || normalizeTraitName(data.legacyName) !== normalizeTraitName(name)) {
      return { ok: false, error: '沒有登入權限，無法儲存特質資料。', forbidden: true };
    }
  }

  var sh = getStudentTraitsSheet();
  var rows = readSheetObjects(sh, STUDENT_TRAIT_HEADERS);
  var existingRow = latestStudentTraitRow(rows, name);
  var existing = null;
  if (existingRow) {
    for (var j = 0; j < rows.length; j++) {
      if (rows[j] === existingRow) { existing = { row: j + 2, object: rows[j] }; break; }
    }
  }
  var current = existing ? normalizeStudentTraitRow(existing.object) : null;
  var traitScore = p.traitScore;
  if (typeof traitScore === 'string' && traitScore) {
    try { traitScore = JSON.parse(traitScore); } catch (e) {}
  }
  var traitScoreObj = traitScore && typeof traitScore === 'object' ? traitScore : (current && current.traitScore) || {};
  var derivedType = traitTypeFromScore(traitScoreObj);
  var finalType = derivedType || String(p.traitType || p.typeKey || current && current.traitType || '').trim();
  var row = {
    timestamp: current && current.timestamp ? current.timestamp : nowIso(),
    studentName: name,
    traitType: finalType,
    traitLabel: traitLabelForType(finalType) || String(p.traitLabel || p.label || current && current.traitLabel || '').trim(),
    traitScore: JSON.stringify(traitScoreObj),
    traitSummary: String(p.traitSummary || p.description || current && current.traitSummary || '').trim(),
    communicationTips: String(p.communicationTips || p.communication || current && current.communicationTips || '').trim(),
    trainingTips: String(p.trainingTips || p.correction || current && current.trainingTips || '').trim(),
    updatedAt: nowIso()
  };
  var values = STUDENT_TRAIT_HEADERS.map(function (h) { return row[h] == null ? '' : row[h]; });
  if (existing && existing.row) sh.getRange(existing.row, 1, 1, STUDENT_TRAIT_HEADERS.length).setValues([values]);
  else sh.appendRow(values);
  compactStudentTraitsSheet(sh);

  return { ok: true, trait: normalizeStudentTraitRow(row) };
}

function getStudentTrait(data) {
  var identity = authorizedStudentName(data, true);
  if (!identity.ok) return identity;
  var requested = normalizeName(data.studentName || data.name);
  var name = requested || identity.name;
  var isCoach = identity.session && identity.session.role === 'coach';
  if (!isCoach) name = identity.name;
  if (!name) return { ok: false, error: '缺少 studentName' };
  var sh = getStudentTraitsSheet();
  var rows = readSheetObjects(sh, STUDENT_TRAIT_HEADERS);
  var found = latestStudentTraitRow(rows, name);
  var trait = found ? normalizeStudentTraitRow(found) : null;
  return { ok: true, trait: trait };
}

function getAllStudentTraits(data) {
  var identity = authorizedStudentName(data, true);
  if (!identity.ok) return identity;
  if (!(identity.session && identity.session.role === 'coach')) return { ok: false, error: '只有教練可讀取全部特質資料。', forbidden: true };
  var sh = getStudentTraitsSheet();
  compactStudentTraitsSheet(sh);
  var rows = readSheetObjects(sh, STUDENT_TRAIT_HEADERS).map(normalizeStudentTraitRow);
  var map = {};
  rows.forEach(function (row) {
    var k = normalizeTraitName(row.studentName);
    if (!k) return;
    if (!map[k] || studentTraitTimeValue(row) >= studentTraitTimeValue(map[k])) map[k] = row;
  });
  var out = Object.keys(map).map(function (k) { return map[k]; });
  out.sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName), 'zh-Hant'); });
  return { ok: true, traits: out };
}

function appendAiScoreFromPayload(payload) {
  if (!payload || payload.finalReadinessScore === undefined || payload.finalReadinessScore === '') return;
  var sh = getAiScoresSheet();
  var row = {
    timestamp: nowIso(),
    date: payload.date || todayStr(),
    studentName: payload.name || payload.studentName || '',
    athleteId: payload.athleteId || payload.studentId || '',
    selfScore: payload.selfScore || '',
    coachScore: payload.coachScore || '',
    recoveryScore: payload.readinessRecoveryScore || payload.recoveryScore || '',
    attendanceScore: payload.attendanceScore || '',
    riskPenalty: payload.riskPenalty || '',
    finalReadinessScore: payload.finalReadinessScore || '',
    readinessStatusLight: normalizeReadinessLight_(payload.readinessStatusLight || payload.statusLight || ''),
    statusLight: payload.readinessStatusLight || '',
    aiTags: payload.aiTags || '',
    aiLabel: payload.aiLabel || payload.aiTags || '',
    trainingAdvice: payload.trainingAdvice || payload.trainingDirection || '',
    trainingDirection: payload.trainingDirection || '',
    algorithmType: payload.algorithmType || 'rule-based algorithm',
    athleteFeedback: payload.feedbackStudentText || '',
    parentFeedback: payload.feedbackParentText || '',
    coachFeedback: payload.feedbackCoachText || ''
  };
  sh.appendRow(AI_SCORE_HEADERS.map(function (h) { return row[h] == null ? '' : row[h]; }));
}
function appendRiskFlagsFromPayload(payload) {
  if (!payload) return;
  var tags = String(payload.aiTags || '').split('、').filter(Boolean);
  var pain = Number(payload.painScore || 0);
  if (pain >= 4) tags.push(pain >= 7 ? '疼痛高風險' : '疼痛中度');
  if (!tags.length) return;
  var sh = getRiskFlagsSheet();
  tags.forEach(function (tag) {
    if (!/風險|不足|關心|硬撐|疼痛|脫水|睡眠|連續/.test(tag)) return;
    var level = /受傷|高風險|紅燈|脫水|重大/.test(tag) || pain >= 7 ? 'high' : 'medium';
    var row = {
      timestamp: nowIso(),
      riskId: 'RF-' + String(payload.date || todayStr()).replace(/-/g, '') + '-' + String(payload.athleteId || payload.studentId || normalizeName(payload.name || payload.studentName || '')).replace(/\W/g, '') + '-' + Utilities.getUuid().slice(0, 8),
      athleteId: payload.athleteId || payload.studentId || '',
      date: payload.date || todayStr(),
      studentName: payload.name || payload.studentName || '',
      riskType: tag,
      riskLevel: level,
      riskReason: payload.aiLabel || payload.aiTags || payload.readinessStatusLight || '',
      suggestedAction: payload.trainingAdvice || payload.trainingDirection || '請教練依現場狀態調整訓練量。',
      isReviewed: '否',
      reviewedAt: '',
      reviewedBy: '',
      actionTaken: '',
      followUpDate: '',
      isResolved: '否',
      resolvedAt: '',
      coachNote: ''
    };
    sh.appendRow(RISK_FLAG_HEADERS.map(function (h) { return row[h] == null ? '' : row[h]; }));
  });
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
  var ss = getSpreadsheet_();
  var sh = ensureSheetExists_(ss, ROSTER_SHEET);
  if (sh.getLastRow() === 0) {
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
  var ss = getSpreadsheet_();
  var sh = ensureSheetExists_(ss, sheetName);
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
   AI 教練回饋（OpenAI / GPT）
   - 設定（key/model/style/enabled）存 Script Properties（後端，不外洩）
   - 學生送出後呼叫 aiCoachFeedback，用三明治回饋法＋教練語氣生成三版回饋
   - 任何失敗都回 ok:false，前端自動退回內建模板
   ============================================================ */
function aiProps_() { return PropertiesService.getScriptProperties(); }

var AI_DAILY_CAP_DEFAULT = 300;   // 全隊每日 OpenAI 呼叫上限（保護額度）
var AI_USER_CAP_DEFAULT = 40;     // 單一使用者每日呼叫上限（防狂點刷錢）

function aiDailyCap_() { var v = parseInt(aiProps_().getProperty('AI_DAILY_CAP'), 10); return (v > 0) ? v : AI_DAILY_CAP_DEFAULT; }
function aiUserCap_()  { var v = parseInt(aiProps_().getProperty('AI_USER_CAP'), 10);  return (v > 0) ? v : AI_USER_CAP_DEFAULT; }
function aiTodayKey_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy-MM-dd'); }

// 單一 property 記錄今日用量，跨日自動歸零：{ d:'yyyy-MM-dd', n: 全域次數, u:{ 身分: 次數 } }
function aiReadUsage_() {
  var raw = aiProps_().getProperty('AI_USAGE');
  var today = aiTodayKey_();
  var u = null;
  try { u = JSON.parse(raw); } catch (e) { u = null; }
  if (!u || u.d !== today) u = { d: today, n: 0, u: {} };
  return u;
}
function aiSaveUsage_(u) { aiProps_().setProperty('AI_USAGE', JSON.stringify(u)); }
function aiBumpUsage_(identity) {
  var u = aiReadUsage_();
  u.n = (u.n || 0) + 1;
  u.u[identity] = (u.u[identity] || 0) + 1;
  aiSaveUsage_(u);
}

// 以「內容」為鍵的回應快取：同一份回報重複檢視/重整 → 直接回快取，不再扣費（6 小時）
function aiCacheKey_(model, style, record) {
  var basis = model + '|' + String(style || '').length + '|' + JSON.stringify(record || {});
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, basis, Utilities.Charset.UTF_8);
  var hex = digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  return 'aifb:' + hex;
}

function setAiConfig(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var p = aiProps_();
  if (data.clearKey) p.deleteProperty('OPENAI_API_KEY');
  else if (typeof data.apiKey === 'string' && data.apiKey.trim()) p.setProperty('OPENAI_API_KEY', data.apiKey.trim());
  if (typeof data.model === 'string' && data.model) p.setProperty('AI_MODEL', data.model);
  if (typeof data.enabled !== 'undefined') p.setProperty('AI_ENABLED', data.enabled ? '1' : '0');
  if (typeof data.style === 'string') p.setProperty('AI_STYLE', data.style);
  if (typeof data.dailyCap !== 'undefined') {
    var dc = parseInt(data.dailyCap, 10);
    if (dc > 0) p.setProperty('AI_DAILY_CAP', String(dc));
  }
  if (typeof data.userCap !== 'undefined') {
    var uc = parseInt(data.userCap, 10);
    if (uc > 0) p.setProperty('AI_USER_CAP', String(uc));
  }
  return { ok: true };
}

function getAiConfig(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var p = aiProps_();
  var usage = aiReadUsage_();
  return { ok: true, data: {
    enabled: p.getProperty('AI_ENABLED') === '1',
    model: p.getProperty('AI_MODEL') || 'gpt-4o-mini',
    hasKey: !!p.getProperty('OPENAI_API_KEY'),
    style: p.getProperty('AI_STYLE') || '',
    dailyCap: aiDailyCap_(),
    userCap: aiUserCap_(),
    usedToday: usage.n || 0
  } };
}

function aiBuildSystemPrompt_(style) {
  var s = '你是「育林國中技擊隊」的跆拳道／武術教練，要用「三明治回饋法」回覆選手的每日訓練回報。\n' +
    '三明治結構：① 先具體肯定做得好的地方 → ② 針對今天的問題給明確、可執行的調整 → ③ 最後給鼓勵。\n' +
    '務必針對「今天這位選手的實際數據與問題」客製，不要每天千篇一律；語氣自然像真人教練；避免醫療診斷字眼。\n' +
    '請只輸出 JSON 物件，結構如下（不要任何多餘文字）：\n' +
    '{"student":{"affirm":"對選手說今天的狀態與肯定","watch":"針對今天問題的提醒與調整","oneThing":"明天一個具體小任務","quote":"一句鼓勵"},' +
    '"parent":{"affirm":"對家長說孩子今日狀態，溫暖、不要露出分數","watch":"家長今天可以協助的一件事","oneThing":"今晚或明天家長具體可做的","quote":"給家長的一句話"},' +
    '"coach":{"affirm":"今日風險等級與重點，專業直接","watch":"主要警示與可能成因","oneThing":"建議的訓練調整","quote":"是否需要一對一晤談或通知家長"}}\n' +
    '每個欄位 1～3 句、精簡有力。';
  if (style && String(style).trim()) {
    s += '\n\n以下是這位教練平常的真實回覆範例，請模仿其語氣、用詞、稱呼方式與長度：\n"""\n' + String(style).slice(0, 4000) + '\n"""';
  }
  return s;
}

function aiBuildUserPrompt_(r) {
  r = r || {};
  function g(k) { return (r[k] === undefined || r[k] === null) ? '' : String(r[k]); }
  var L = [];
  L.push('選手：' + g('name'));
  L.push('日期：' + g('date'));
  if (g('group')) L.push('組別/項目：' + g('group'));
  if (g('trainingSession')) L.push('訓練時段：' + g('trainingSession'));
  if (g('trainingTopic')) L.push('今日訓練主題：' + g('trainingTopic'));
  var light = g('readinessStatusLight') || g('status') || g('_statusLabel');
  if (light) L.push('今日燈號/狀態：' + light);
  if (g('finalReadinessScore')) L.push('訓練準備度：' + g('finalReadinessScore') + '/100');
  if (g('bodyStatus')) L.push('身體狀態：' + g('bodyStatus'));
  if (g('rpe')) L.push('RPE 主觀強度：' + g('rpe') + '/10');
  if (g('soreness')) L.push('肌肉痠痛：' + g('soreness') + '/5');
  if (g('painScore') !== '' && g('painScore') !== '0') L.push('受傷疼痛：' + g('painScore') + '/10' + (g('injuryArea') ? '（' + g('injuryArea') + '）' : ''));
  if (g('sleepHours')) L.push('睡眠：' + g('sleepHours') + ' 小時' + (g('sleepQuality') ? '（' + g('sleepQuality') + '）' : ''));
  if (g('sweatLevel')) L.push('排汗量：' + g('sweatLevel') + '/5');
  if (g('urineStatus')) L.push('尿液：' + g('urineStatus'));
  if (g('moodIndex')) L.push('心情指數：' + g('moodIndex') + '/5' + (g('moodReason') ? '（' + g('moodReason') + '）' : ''));
  if (g('reflection')) L.push('今日心得：' + g('reflection'));
  if (g('tomorrowGoal')) L.push('明日目標：' + g('tomorrowGoal'));
  if (g('aiTags')) L.push('系統判斷標籤：' + g('aiTags'));
  return '請依下列「今天這位選手」的資料，用三明治回饋法產生三版回饋（student / parent / coach）：\n' + L.join('\n');
}

function aiNormalizeVersions_(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  var roles = ['student', 'parent', 'coach'], out = {};
  for (var i = 0; i < roles.length; i++) {
    var v = parsed[roles[i]] || {};
    out[roles[i]] = {
      affirm: String(v.affirm || ''),
      watch: String(v.watch || ''),
      oneThing: String(v.oneThing || ''),
      quote: String(v.quote || '')
    };
    if (!out[roles[i]].affirm && !out[roles[i]].oneThing) return null;
  }
  return out;
}

function aiCoachFeedback(data) {
  var auth = requireRole(data, ['student', 'parent', 'coach']);
  if (!auth.ok) return auth;
  var p = aiProps_();
  if (p.getProperty('AI_ENABLED') !== '1') return { ok: false, disabled: true, error: 'AI 回饋未啟用' };
  var key = p.getProperty('OPENAI_API_KEY');
  if (!key) return { ok: false, disabled: true, error: '尚未設定 API Key' };
  var model = p.getProperty('AI_MODEL') || 'gpt-4o-mini';
  var style = p.getProperty('AI_STYLE') || '';

  // (1) 內容快取：同一份回報重複檢視 → 直接回快取，不扣費
  var cache = CacheService.getScriptCache();
  var cacheKey = aiCacheKey_(model, style, data.record);
  var hit = cache.get(cacheKey);
  if (hit) {
    try { return { ok: true, versions: JSON.parse(hit), model: model, cached: true }; } catch (e) {}
  }

  // (2)(3) 每日上限：全隊上限 + 單一使用者上限 → 超過就回 capped（前端自動退回內建回饋）
  var identity = auth.session.studentId || auth.session.studentName || auth.session.role || 'unknown';
  var usage = aiReadUsage_();
  if ((usage.n || 0) >= aiDailyCap_()) {
    return { ok: false, capped: true, scope: 'daily', error: '今日 AI 回饋已達全隊上限，已改用系統內建回饋。' };
  }
  if ((usage.u[identity] || 0) >= aiUserCap_()) {
    return { ok: false, capped: true, scope: 'user', error: '你今日的 AI 回饋次數已達上限，已改用系統內建回饋。' };
  }

  try {
    var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: aiBuildSystemPrompt_(style) },
          { role: 'user', content: aiBuildUserPrompt_(data.record) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 900
      })
    });
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code !== 200) return { ok: false, error: 'OpenAI 回應 ' + code + '：' + body.slice(0, 300) };
    var json = JSON.parse(body);
    var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) return { ok: false, error: 'OpenAI 無回傳內容' };
    var versions = aiNormalizeVersions_(JSON.parse(content));
    if (!versions) return { ok: false, error: 'AI 回傳格式不符' };
    // 實際成功呼叫才計次 + 寫快取（快取命中與 capped 都不計次）
    aiBumpUsage_(identity);
    try { cache.put(cacheKey, JSON.stringify(versions), 21600); } catch (e) {} // 6 小時
    return { ok: true, versions: versions, model: model };
  } catch (e) {
    return { ok: false, error: '呼叫失敗：' + String(e) };
  }
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

function thisWeekSunday2359Iso_() {
  var d = new Date();
  var add = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

function isWeeklyAutoKpiWindow_() {
  var day = new Date().getDay();
  return day === 5 || day === 6 || day === 0; // Friday through Sunday.
}

function appendKpiSession_(session) {
  var now = nowIso();
  session.sessionId = session.sessionId || ('kpi_' + Date.now() + '_' + Math.floor(Math.random() * 100000));
  session.sessionType = session.sessionType || 'weekly';
  session.weekId = session.weekId || isoWeekId(new Date());
  session.openMode = session.openMode || 'manual';
  session.targetGroup = session.targetGroup || '全隊';
  session.targetStudentIds = session.targetStudentIds || '';
  session.openAt = session.openAt || now;
  session.closeAt = session.closeAt || thisWeekSunday2359Iso_();
  session.status = session.status || 'open';
  session.includeInWeeklyReport = session.includeInWeeklyReport === false ? false : true;
  session.includeInMonthlyReport = session.includeInMonthlyReport === false ? false : true;
  session.lineNotify = !!session.lineNotify;
  session.createdBy = session.createdBy || 'coach';
  session.createdAt = session.createdAt || now;
  session.updatedAt = session.updatedAt || now;
  var sh = getKpiSessionsSheet();
  sh.appendRow(KPI_SESSION_HEADERS.map(function (h) { return session[h] == null ? '' : session[h]; }));
  return session;
}

function ensureFridayWeeklyKpiSession_() {
  var currentWeek = isoWeekId(new Date());
  var sessions = listKpiSessions().filter(function (s) { return String(s.weekId || '') === currentWeek; });
  if (!isWeeklyAutoKpiWindow_()) return null;
  var hasActive = sessions.some(function (s) {
    var es = effectiveSessionStatus(s);
    return es === 'open' || es === 'scheduled';
  });
  if (hasActive) return null;
  var autoWasClosed = sessions.some(function (s) {
    return String(s.openMode || '') === 'autoReminder' && effectiveSessionStatus(s) === 'closed';
  });
  if (autoWasClosed) return null;
  var accounts = activeStudentAccounts();
  if (!accounts.length) return null;
  return appendKpiSession_({
    sessionName: '本週 KPI 回報',
    sessionType: 'weekly',
    weekId: currentWeek,
    openMode: 'autoReminder',
    targetGroup: '全隊',
    targetStudentIds: accounts.map(function (a) { return a.studentId; }).join(','),
    closeAt: thisWeekSunday2359Iso_(),
    status: 'open',
    createdBy: 'system'
  });
}

function normalizeReadinessLight_(value) {
  var s = String(value || '');
  if (s.indexOf('紅') !== -1) return '紅燈';
  if (s.indexOf('橘') !== -1) return '橘燈';
  if (s.indexOf('黃') !== -1) return '黃燈';
  if (s.indexOf('綠') !== -1) return '綠燈';
  return '';
}

function normalizeDateString(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s;
}

function getRiskFlags(data) {
  var rows = readSheetObjects(getRiskFlagsSheet(), RISK_FLAG_HEADERS);
  var start = String(data.startDate || '').trim();
  var end = String(data.endDate || '').trim();
  rows = rows.filter(function (r) {
    var d = normalizeDateString(r.date);
    return (!start || d >= start) && (!end || d <= end);
  });
  return { ok: true, data: rows };
}

function updateRiskFlag(data) {
  var riskId = String(data.riskId || '').trim();
  if (!riskId) return { ok: false, error: '缺少 riskId' };
  var fields = data.fields || {};
  if (String(fields.isResolved || '') === '是' && !String(fields.actionTaken || '').trim()) {
    return { ok: false, error: 'high risk 結案前必須填寫 actionTaken。' };
  }
  var allowed = ['isReviewed', 'reviewedAt', 'reviewedBy', 'actionTaken', 'followUpDate', 'isResolved', 'resolvedAt', 'coachNote'];
  var safe = {};
  allowed.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(fields, key)) safe[key] = fields[key]; });
  if (safe.isReviewed === '是' && !safe.reviewedAt) safe.reviewedAt = nowIso();
  if (safe.isResolved === '是' && !safe.resolvedAt) safe.resolvedAt = nowIso();
  var sh = getRiskFlagsSheet();
  var rows = readSheetObjects(sh, RISK_FLAG_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].riskId) === riskId) {
      updateObjectRow(sh, RISK_FLAG_HEADERS, i + 2, safe);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到 riskId' };
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
  if (ids.length) {
    var sid = String(studentId || '').trim();
    var sname = String(studentName || '').trim();
    if (ids.indexOf(sid) !== -1 || ids.indexOf(sname) !== -1) return true;
    var acc = sname ? findStudentAccountByName(sname) : null;
    return !!(acc && ids.indexOf(String(acc.studentId || '').trim()) !== -1);
  }
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
  var candidateWeek = String(candidate.weekId || candidate.weekKey || isoWeekId(new Date()));
  var candidateMap = {};
  candidateIds.forEach(function (id) { candidateMap[id] = true; });
  var conflicts = [];
  listKpiSessions().forEach(function (s) {
    if (String(s.sessionId) === String(excludeSessionId || '')) return;
    if (String(s.weekId || '') !== candidateWeek) return;
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

function kpiSessionStatsFromData_(session, reports, accounts, groupMap) {
  var sessionReports = (reports || []).filter(function (r) { return String(r.sessionId) === String(session.sessionId); });
  var targetAccounts = (accounts || []).slice();
  if (!session.targetStudentIds) targetAccounts = targetAccounts.filter(function (a) { return a.accountStatus !== 'disabled'; });
  var targets = targetAccounts.filter(function (a) {
    return studentInTarget(session, a.studentId, a.studentName, (groupMap || {})[String(a.studentName).trim()] || '');
  });
  var doneById = {}, doneNames = {};
  sessionReports.forEach(function (r) {
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
    } else {
      pending.push(a.studentName);
    }
  });
  var total = targets.length;
  return {
    total: total, doneCount: done.length, pendingCount: pending.length,
    completionRate: total ? Math.round((done.length / total) * 100) : 0,
    avgScore: cnt ? Math.round((sum / cnt) * 10) / 10 : null,
    red: red, yellow: yellow, green: green,
    doneNames: done, pendingNames: pending, reports: sessionReports
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
  var conflicts = kpiTargetConflict({ targetStudentIds: targetSnapshot.ids.join(','), targetGroup: data.targetGroup || '全隊', weekId: data.weekId || data.weekKey || isoWeekId(new Date()) });
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
    weekId: data.weekId || data.weekKey || isoWeekId(new Date()),
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
  appendKpiSession_(session);
  // 可選：開啟即發 LINE 學生版提醒
  if (session.lineNotify && status === 'open') {
    try { pushToLine(kpiReminderText('student', session, null)); } catch (e) {}
  }
  return { ok: true, session: session };
}

function normalizeBulkStudents_(students) {
  if (typeof students === 'string') {
    try { students = JSON.parse(students); } catch (e) { students = []; }
  }
  if (!Array.isArray(students)) students = [];
  var accounts = activeStudentAccounts();
  var byId = {}, byName = {};
  accounts.forEach(function (a) {
    byId[String(a.studentId)] = a;
    byName[String(a.studentName || '').trim()] = a;
  });
  var out = [];
  students.forEach(function (s) {
    var acc = byId[String(s.studentId || '')] || byName[String(s.studentName || '').trim()];
    if (acc && !out.some(function (x) { return String(x.studentId) === String(acc.studentId); })) out.push(acc);
  });
  return out;
}

function bulkSetKpiSession(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var weekKey = String(data.weekKey || data.weekId || isoWeekId(new Date()));
  var enabled = data.enabled === true || String(data.enabled).toLowerCase() === 'true';
  var dueAt = data.dueAt || thisWeekSunday2359Iso_();
  var students = normalizeBulkStudents_(data.students);
  var sessions = listKpiSessions();
  if (!enabled && (data.closeAll === true || String(data.closeAll).toLowerCase() === 'true')) {
    var closeTargets = sessions.filter(function (s) {
      if (String(s.weekId || '') !== weekKey) return false;
      var es = effectiveSessionStatus(s);
      return es === 'open' || es === 'scheduled';
    });
    closeTargets.forEach(function (s) {
      var found = findKpiSession(s.sessionId);
      if (found && found.sheet) updateObjectRow(found.sheet, KPI_SESSION_HEADERS, found.row, { status: 'closed', updatedAt: nowIso() });
    });
    var closeStudents = students.length ? students : activeStudentAccounts();
    return {
      ok: true,
      closedCount: closeTargets.length,
      results: closeStudents.map(function (stu) {
        return { studentName: stu.studentName, studentId: stu.studentId, ok: true };
      })
    };
  }
  if (!students.length) return { ok: false, results: [], error: '沒有可操作的選手' };
  var results = [];
  students.forEach(function (stu) {
    try {
      var mine = sessions.filter(function (s) {
        if (String(s.weekId || '') !== weekKey) return false;
        if (effectiveSessionStatus(s) !== 'open' && effectiveSessionStatus(s) !== 'scheduled') return false;
        return studentInTarget(s, String(stu.studentId), String(stu.studentName || '').trim(), stu.group || '');
      });
      if (enabled) {
        if (!mine.length) {
          var created = createKpiSession({
            authToken: data.authToken,
            sessionName: data.sessionName || '本週 KPI 回報－' + stu.studentName,
            sessionType: 'weekly',
            weekId: weekKey,
            targetGroup: '指定選手',
            targetStudentIds: [stu.studentId],
            closeAtPreset: 'custom',
            closeAtTime: dueAt,
            includeInWeeklyReport: true,
            includeInMonthlyReport: true,
            lineNotify: false
          });
          if (!created.ok) throw new Error(created.error || '開放失敗');
          sessions.push(created.session);
        }
      } else {
        mine.forEach(function (s) {
          var found = findKpiSession(s.sessionId);
          if (found && found.sheet) updateObjectRow(found.sheet, KPI_SESSION_HEADERS, found.row, { status: 'closed', updatedAt: nowIso() });
        });
      }
      results.push({ studentName: stu.studentName, studentId: stu.studentId, ok: true });
    } catch (e) {
      results.push({ studentName: stu.studentName, studentId: stu.studentId, ok: false, error: String(e.message || e) });
    }
  });
  var allOk = results.every(function (r) { return r.ok; });
  return { ok: allOk, results: results };
}

function updateKpiSessionStatus(data, status) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  var found = findKpiSession(data.sessionId);
  if (!found) return { ok: false, error: '找不到此 KPI 回報。' };
  if (!found.sheet) return { ok: false, error: 'KPI 工作表未建立，請先執行 setupSheet()。' };
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
  if (!found.sheet) return { ok: false, error: 'KPI 工作表未建立，請先執行 setupSheet()。' };
  var conflicts = kpiTargetConflict(found.object, found.object.sessionId);
  if (conflicts.length) return { ok: false, error: '部分選手已有進行中的 KPI：' + conflicts.join('、') + '。請先關閉原回報。' };
  var newClose = resolveCloseAt(data.closeAtPreset || 'custom', data.closeAtTime);
  updateObjectRow(found.sheet, KPI_SESSION_HEADERS, found.row, { closeAt: newClose, status: 'open', updatedAt: nowIso() });
  return { ok: true, closeAt: newClose };
}

function getKpiSessions(data) {
  var auth = requireRole(data, ['coach']);
  if (!auth.ok) return auth;
  ensureFridayWeeklyKpiSession_();
  var reports = readSheetObjects(getWeeklyKpiReportsSheet(), WEEKLY_KPI_REPORT_HEADERS);
  var accounts = readSheetObjects(getStudentAccountsSheet(), STUDENT_ACCOUNT_HEADERS);
  var groupMap = latestGroupByName();
  var sessions = listKpiSessions().map(function (s) {
    s.effectiveStatus = effectiveSessionStatus(s);
    s.stats = kpiSessionStatsFromData_(s, reports, accounts, groupMap);
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
  ensureFridayWeeklyKpiSession_();
  var studentName = who.name || normalizeName(data.studentName || data.name);
  var studentId = who.studentId || data.studentId || '';
  if (!studentId && studentName) {
    var acc = findStudentAccountByName(studentName);
    if (acc && acc.studentId) studentId = acc.studentId;
  }
  var myGroup = latestGroupByName()[String(studentName).trim()] || '';
  var sessions = listKpiSessions();
  var currentWeek = isoWeekId(new Date());
  // 找最新一個「對這位學生有效（open/scheduled）」的 session
  var open = sessions.filter(function (s) {
    if (String(s.weekId || '') !== currentWeek) return false;
    var es = effectiveSessionStatus(s);
    return (es === 'open' || es === 'scheduled') && studentInTarget(s, studentId, studentName, myGroup);
  }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0];
  if (!open) {
    open = sessions.filter(function (s) {
      var es = effectiveSessionStatus(s);
      return (es === 'open' || es === 'scheduled') && studentInTarget(s, studentId, studentName, myGroup);
    }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0];
  }

  if (!open) {
    // 是否有最近剛截止的
    var recentClosed = sessions.filter(function (s) { return String(s.weekId || '') === currentWeek && effectiveSessionStatus(s) === 'closed' && studentInTarget(s, studentId, studentName, myGroup); })
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
  var ss = getSpreadsheet_();
  var sh = ensureSheetExists_(ss, APPDATA_SHEET);
  if (sh.getLastRow() === 0) {
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
  return key === 'profile:' + name || key === 'motto:' + name || key.indexOf('task:' + name + ':') === 0 || key === 'trait:' + name || key === 'trait:' + normalizeTraitName(name);
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
      if (key.indexOf('trait:') === 0) {
        var trait = getAppData(key) || {};
        var incoming = data.value || {};
        if (incoming.studentName) trait.studentName = normalizeName(incoming.studentName);
        if (incoming.label) trait.label = String(incoming.label).slice(0, 40);
        if (incoming.typeKey) trait.typeKey = String(incoming.typeKey).slice(0, 40);
        if (incoming.description) trait.description = String(incoming.description).slice(0, 600);
        if (incoming.keywords) trait.keywords = incoming.keywords;
        if (incoming.communication) trait.communication = String(incoming.communication).slice(0, 400);
        if (incoming.encouragement) trait.encouragement = String(incoming.encouragement).slice(0, 400);
        if (incoming.correction) trait.correction = String(incoming.correction).slice(0, 400);
        if (incoming.competitionReminder) trait.competitionReminder = String(incoming.competitionReminder).slice(0, 400);
        if (incoming.setbackResponse) trait.setbackResponse = String(incoming.setbackResponse).slice(0, 400);
        if (incoming.parentAdvice) trait.parentAdvice = String(incoming.parentAdvice).slice(0, 400);
        if (incoming.avoid) trait.avoid = String(incoming.avoid).slice(0, 400);
        if (incoming.rawScore) trait.rawScore = incoming.rawScore;
        if (incoming.answers) trait.answers = incoming.answers;
        trait.completedAt = incoming.completedAt || trait.completedAt || nowIso();
        trait.updatedAt = nowIso();
        trait.updatedBy = 'student';
        trait.version = incoming.version || trait.version || 1;
        return writeAppData(key, trait);
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
      if (key.indexOf('trait:') === 0) {
        var trait = getAppData(key) || {};
        var incoming = data.value || {};
        if (incoming.studentName) trait.studentName = normalizeName(incoming.studentName);
        if (incoming.label) trait.label = String(incoming.label).slice(0, 40);
        if (incoming.typeKey) trait.typeKey = String(incoming.typeKey).slice(0, 40);
        if (incoming.description) trait.description = String(incoming.description).slice(0, 600);
        if (incoming.keywords) trait.keywords = incoming.keywords;
        if (incoming.communication) trait.communication = String(incoming.communication).slice(0, 400);
        if (incoming.encouragement) trait.encouragement = String(incoming.encouragement).slice(0, 400);
        if (incoming.correction) trait.correction = String(incoming.correction).slice(0, 400);
        if (incoming.competitionReminder) trait.competitionReminder = String(incoming.competitionReminder).slice(0, 400);
        if (incoming.setbackResponse) trait.setbackResponse = String(incoming.setbackResponse).slice(0, 400);
        if (incoming.parentAdvice) trait.parentAdvice = String(incoming.parentAdvice).slice(0, 400);
        if (incoming.avoid) trait.avoid = String(incoming.avoid).slice(0, 400);
        if (incoming.rawScore) trait.rawScore = incoming.rawScore;
        if (incoming.answers) trait.answers = incoming.answers;
        trait.completedAt = incoming.completedAt || trait.completedAt || nowIso();
        trait.updatedAt = nowIso();
        trait.updatedBy = 'student';
        trait.version = incoming.version || trait.version || 1;
        return writeAppData(key, trait);
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
