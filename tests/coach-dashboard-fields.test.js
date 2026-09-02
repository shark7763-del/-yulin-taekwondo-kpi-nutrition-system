/* 白名單防腐閘門。
   getCoachDashboard 只回 COACH_DASHBOARD_FIELDS 列出的欄位。若有人在教練後台
   新讀了一個不在白名單裡的 records 欄位，畫面上會靜默拿到空值 —— 這種 bug 不會
   拋錯、不會有人發現，只會讓某個警示從此不再亮。

   所以這支測試每次都從前端原始碼重新推導「後台實際讀了哪些 records 欄位」，
   再比對白名單。掃描同時看兩種寫法：
     r.foo            屬性存取
     num(r, 'foo')    以字串當欄位名（computeAlerts 的 technicalAvg 就是這樣被讀的） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const B = path.join(__dirname, '..');

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

// 取得 records 權威欄位清單與白名單。COACH_DASHBOARD_FIELDS 定義在 doGet 之後，
// 所以要載入整份 Code.gs（GAS 全域用最小樁替代）。
const sandbox = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: () => null },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
  Utilities: { formatDate: d => new Date(d).toISOString().slice(0, 10), getUuid: () => 'uuid', computeDigest: () => [1], DigestAlgorithm: {}, Charset: {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(B, 'apps-script', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
const HEADERS = sandbox.HEADERS;
const WHITELIST = sandbox.COACH_DASHBOARD_FIELDS;
const H = new Set(HEADERS);

// 教練後台這條路徑會執行到的檔案
const FILES = ['js/07-coach-dashboard.js', 'js/05-feedback-readiness.js', 'js/02-core-utils.js'];
// 這些是「只在送出時寫入、後台不讀」的欄位，刻意排除；它們只以字面值出現在排除清單裡
const INTENTIONALLY_OMITTED = ['rawNutritionJson', 'studentLineText', 'coachLineText',
  'parentLineText', 'nutritionLineText', 'nutritionAdviceStudent'];

const used = new Map();   // field -> 第一個出現位置
for (const rel of FILES) {
  const short = rel.split('/').pop();
  fs.readFileSync(path.join(B, rel), 'utf8').split('\n').forEach((line, i) => {
    const at = short + ':' + (i + 1);
    for (const m of line.matchAll(/\.\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (H.has(m[1]) && !used.has(m[1])) used.set(m[1], at);
    }
    for (const m of line.matchAll(/['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g)) {
      if (H.has(m[1]) && !used.has(m[1])) used.set(m[1], at);
    }
  });
}
INTENTIONALLY_OMITTED.forEach(f => used.delete(f));

const missing = [...used.keys()].filter(f => WHITELIST.indexOf(f) === -1).sort();
t('教練後台讀到的每個 records 欄位都在 COACH_DASHBOARD_FIELDS 裡',
  missing.length === 0,
  missing.map(f => f + '（' + used.get(f) + '）').join('、'));

t('白名單裡沒有已知的大型欄位',
  INTENTIONALLY_OMITTED.every(f => WHITELIST.indexOf(f) === -1),
  INTENTIONALLY_OMITTED.filter(f => WHITELIST.indexOf(f) !== -1).join(','));

t('白名單每個欄位都真的存在於 records 表頭（沒有拼錯或已刪除的欄位）',
  WHITELIST.every(f => H.has(f)),
  WHITELIST.filter(f => !H.has(f)).join(','));

t('白名單沒有重複項',
  new Set(WHITELIST).size === WHITELIST.length,
  String(WHITELIST.length - new Set(WHITELIST).size));

// 規格明列一定要保留的欄位
const MUST_KEEP = ['name', 'studentName', 'date', 'timestamp', 'moodIndex', 'emotionIndex',
  'sleepHours', 'sleepQuality', 'rpe', 'painScore', 'weightKg', 'bodyStatus',
  'trainingSession', 'trainingIntensity', 'status', 'coachScore', 'coachComment',
  'finalReadinessScore', 'readinessStatusLight', 'riskPenalty', 'aiTags', 'aiLabel',
  'reflection', 'totalScore', 'averageScore', 'attendanceScore'];
const lost = MUST_KEEP.filter(f => WHITELIST.indexOf(f) === -1);
t('規格指定必須保留的欄位一個都沒少（姓名／日期／KPI／心情／睡眠／RPE／疼痛／體重／訓練／出席／教練評分／readiness／心得）',
  lost.length === 0, lost.join(','));

t('白名單確實比整張表小很多（有真的瘦身）',
  WHITELIST.length < HEADERS.length * 0.7,
  WHITELIST.length + ' / ' + HEADERS.length);

// 版本握手：前後端常數必須一致，否則線上會一直掛著提示
const front = fs.readFileSync(path.join(B, 'js', '01-config-data.js'), 'utf8');
const appV = /const APP_VERSION = '([^']+)'/.exec(front);
t('前端有 APP_VERSION', !!appV, appV && appV[1]);
t('後端有 API_VERSION', typeof sandbox.API_VERSION === 'string', sandbox.API_VERSION);
t('repo 內前後端版本一致（不一致代表有人只改了一邊）',
  !!appV && appV[1] === sandbox.API_VERSION,
  (appV && appV[1]) + ' vs ' + sandbox.API_VERSION);

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
console.log('\n教練後台實際讀到的 records 欄位：' + used.size + ' 個；白名單：' + WHITELIST.length + ' 個');
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
