/* getDailyAthleteSummary：欄位外洩、統計正確性、讀取量，
   以及最重要的一項 —— 搬到後端的優先度判斷與前端原本那套**逐筆一致**。

   對等測試不是重寫一份判斷再比對（那只會證明我抄對了自己），
   而是把 js/07-coach-dashboard.js 裡真正在跑的 lastPerfHasPriority
   連同它的 helper 一起切出來執行，拿它的結果當標準答案。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const B = path.join(__dirname, '..');

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

/* ---------- 後端沙箱 ---------- */
class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.maxCols = 220; this.reads = []; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? this.rows[0].length : 0; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows() {}
  insertColumnsAfter(after, n) { this.maxCols = after + n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
    sheet.reads.push({ r, c, nr, nc });
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const src = sheet.rows[r - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) line.push(src[c - 1 + j] === undefined ? '' : src[c - 1 + j]);
          out.push(line);
        }
        return out;
      },
      setValues() {}, setValue() {}, getValue() { return ''; }
    };
  }
}
class FakeSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new FakeSheet(n, []); return this.sheets[n]; }
  add(name, rows) { this.sheets[name] = new FakeSheet(name, rows); return this.sheets[name]; }
}
function loadBackend(ss) {
  const props = {};
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    // 必須是真的會存的快取：getAuthSession 從 CacheService 讀 'auth:<token>'，
    // 空殼版本會讓每一個需要登入的測試都拿到 authRequired（假失敗）。
    CacheService: (() => {
      const c = {};
      const api = { get: k => (k in c ? c[k] : null), put: (k, v) => { c[k] = String(v); }, remove: k => { delete c[k]; } };
      return { getScriptCache: () => api };
    })(),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: {
      formatDate: (d, tz, fmt) => new Date(d).toISOString().slice(0, 10),
      getUuid: () => 'uuid', computeDigest: () => [1], DigestAlgorithm: {}, Charset: {}
    },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(B, 'apps-script', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

/* ---------- 把真正的前端判斷切出來執行 ---------- */
function loadFrontendPriority() {
  const coach = fs.readFileSync(path.join(B, 'js', '07-coach-dashboard.js'), 'utf8');
  const core = fs.readFileSync(path.join(B, 'js', '02-core-utils.js'), 'utf8');
  const need = ['lastPerfHasPriority', 'lastPerfNum', 'lastPerfScoreValue', 'painScoreValue',
    'lastPerfRecordName', 'normDate', 'recordName'];
  let src = '';
  for (const fn of need) {
    const re = new RegExp('^function ' + fn + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
    const m = re.exec(coach) || re.exec(core);
    if (!m) throw new Error('找不到前端函式：' + fn);
    src += m[0] + '\n';
  }
  src += 'function todayStr(){return new Date().toISOString().slice(0,10);}\n';
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'frontend-priority' });
  return sandbox;
}

/* ---------- 測試資料 ---------- */
const DATE = '2026-09-04';
const ymd = n => {
  const d = new Date(DATE + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
// 每一種會觸發 priority 的條件各造一筆，外加幾筆正常的
const CASES = [
  { name: '疼痛4', painScore: 5 },
  { name: 'RPE高', rpe: 9 },
  { name: '睡眠文字', sleepQuality: '差' },
  { name: '睡眠時數', sleepHours: 5 },
  { name: '心情低', moodIndex: 1 },
  { name: '心情文字', moodReason: '很低落' },
  { name: 'AI標籤', aiTags: '需要關心' },
  { name: '心得風險字', reflection: '今天壓力很大，想放棄' },
  { name: '明顯下滑', totalScore: 40 },          // 前 7 天平均 80 → 掉 40
  { name: '一切正常', totalScore: 80, painScore: 1, rpe: 5, sleepHours: 8, moodIndex: 4 },
  { name: '正常有回覆', totalScore: 78, coachReply: '很好，繼續保持' }
];
const SENSITIVE = ['reflection', 'rawNutritionJson', 'studentLineText', 'coachLineText',
  'parentLineText', 'nutritionLineText', 'nutritionAdviceStudent', 'rawScoresJson',
  'readinessJson', 'moodReason', 'aiTags', 'coachPrivateNote', 'parentNote'];

const ss = new FakeSpreadsheet();
const g = loadBackend(ss);
const H = g.HEADERS;
const row = v => H.map(h => (Object.prototype.hasOwnProperty.call(v, h) ? v[h] : ''));

const sheetRows = [H];
CASES.forEach((c, i) => {
  const base = { date: DATE, timestamp: DATE + 'T08:0' + (i % 10) + ':00.000Z', name: c.name, studentName: c.name };
  sheetRows.push(row(Object.assign(base, c, { name: c.name })));
});
// 同一人同一天重送（要 dedupe 成一筆，且取較晚那筆）
sheetRows.push(row({ date: DATE, timestamp: DATE + 'T21:00:00.000Z', name: '一切正常',
  studentName: '一切正常', totalScore: 85, painScore: 0, coachReply: '晚上補的回覆' }));
// 前 7 天的歷史（給「明顯下滑」算 prevAvg），以及一位久未回報的
for (let d = 1; d <= 7; d++) {
  sheetRows.push(row({ date: ymd(d), timestamp: ymd(d) + 'T08:00:00.000Z', name: '明顯下滑', studentName: '明顯下滑', totalScore: 80 }));
  sheetRows.push(row({ date: ymd(d), timestamp: ymd(d) + 'T08:00:00.000Z', name: '一切正常', studentName: '一切正常', totalScore: 80 }));
}
sheetRows.push(row({ date: ymd(60), timestamp: ymd(60) + 'T08:00:00.000Z', name: '久未回報', studentName: '久未回報', totalScore: 70 }));
const sheet = ss.add('records', sheetRows);
ss.add('student_traits', [g.STUDENT_TRAIT_HEADERS,
  g.STUDENT_TRAIT_HEADERS.map(h => (h === 'studentName' ? '疼痛4' : (h === 'traitLabel' ? '穩定型' : '')))]);

/* ---------- 1. 權限 ---------- */
const denied = g.getDailyAthleteSummary({ date: DATE });
t('沒有教練 session 一律擋下', denied && denied.ok === false, JSON.stringify(denied).slice(0, 70));

/* 建立一個教練 session：走真正的 coachLogin，不繞過權限驗證 */
const CS = g.COACH_SETTING_HEADERS;
const mk = (HH, f) => HH.map(h => (h in f ? f[h] : ''));
ss.add('coach_settings', [CS, mk(CS, {
  coachId: 'C1', teamId: 'T1',
  coachPasswordHash: g.hashSecret('coach:C1', 'pw'), failedLoginCount: 0
})]);
const login = g.coachLogin({ coachPassword: 'pw' });
const token = login && login.authToken;
t('測試用的教練登入本身要成功（否則下面都是假通過）',
  !!token && login.ok === true, JSON.stringify(login).slice(0, 90));

sheet.reads = [];
const res = token ? g.getDailyAthleteSummary({ date: DATE, authToken: token }) : null;

if (!res || !res.ok) {
  t('能以教練身分取得摘要（若此項失敗，下面全部略過）', false, JSON.stringify(res).slice(0, 120));
} else {
  t('能以教練身分取得摘要', true, '');

  /* ---------- 2. 不得外洩敏感欄位 ---------- */
  const json = JSON.stringify(res);
  const leaked = SENSITIVE.filter(f => json.indexOf('"' + f + '"') !== -1);
  t('摘要不含任何敏感欄位（心得／LINE 文案／營養／AI 原文）', leaked.length === 0, leaked.join(','));
  t('摘要不含心得的內容本身', json.indexOf('想放棄') === -1, '');
  t('athleteId 完全不出現在回應裡（欄位內容已證實不可信）',
    json.indexOf('athleteId') === -1, '');

  const keys = new Set();
  res.athletes.forEach(a => Object.keys(a).forEach(k => keys.add(k)));
  const allowed = ['studentName', 'studentId', 'trait', 'reported', 'hasReply', 'priority', 'readiness'];
  t('athletes[] 只含白名單欄位',
    [...keys].every(k => allowed.indexOf(k) !== -1), [...keys].join(','));

  /* ---------- 3. dedupe ---------- */
  const normal = res.athletes.filter(a => a.studentName === '一切正常');
  t('同一人同一天只出現一次（dedupe）', normal.length === 1, String(normal.length));
  t('dedupe 取的是較晚送出的那一筆（有教練回覆）',
    normal.length === 1 && normal[0].hasReply === true, JSON.stringify(normal[0]));

  /* ---------- 4. 統計 ---------- */
  const names = res.athletes.map(a => a.studentName);
  t('只回當日回報的人，久未回報的不會混進來',
    names.indexOf('久未回報') === -1, names.join(','));
  t('stats.reported 等於 athletes 長度',
    res.stats.reported === res.athletes.length, res.stats.reported + ' / ' + res.athletes.length);
  t('stats.pending 等於沒有教練回覆的人數',
    res.stats.pending === res.athletes.filter(a => !a.hasReply).length, String(res.stats.pending));
  t('stats.highPriority 等於 priority 為 true 的人數',
    res.stats.highPriority === res.athletes.filter(a => a.priority).length, String(res.stats.highPriority));

  /* ---------- 5. 與前端原本的判斷逐筆一致 ---------- */
  const fe = loadFrontendPriority();
  const history = [];
  for (let d = 1; d <= 7; d++) {
    history.push({ name: '明顯下滑', date: ymd(d), totalScore: 80 });
    history.push({ name: '一切正常', date: ymd(d), totalScore: 80 });
  }
  const mismatched = [];
  CASES.forEach(c => {
    const rec = Object.assign({ date: DATE, name: c.name }, c);
    const expected = fe.lastPerfHasPriority(rec, history);
    const got = res.athletes.filter(a => a.studentName === c.name)[0];
    if (!got) { mismatched.push(c.name + '(缺)'); return; }
    if (got.priority !== expected) mismatched.push(c.name + '(前端=' + expected + ' 後端=' + got.priority + ')');
  });
  t('優先度判斷與前端 lastPerfHasPriority 逐筆一致（11 種情境）',
    mismatched.length === 0, mismatched.join('、'));

  const triggered = CASES.filter(c => fe.lastPerfHasPriority(Object.assign({ date: DATE, name: c.name }, c), history)).length;
  t('測試情境確實有觸發到優先度（不是全 false 的假通過）',
    triggered >= 8 && triggered < CASES.length, triggered + ' / ' + CASES.length + ' 觸發');

  /* ---------- 6. 讀取量 ---------- */
  const wide = sheet.reads.filter(r => r.nr > 1 && r.nc > 5);
  const cells = sheet.reads.reduce((n, r) => n + r.nr * r.nc, 0);
  const naive = (sheetRows.length - 1) * H.length;
  t('全寬讀取只發生在「當天」那幾列，不是整段歷史',
    wide.every(r => r.nr <= res.athletes.length + 2), JSON.stringify(wide));
  t('總讀取格數低於整表掃描',
    cells < naive, cells + ' / ' + naive + ' 格');

  /* ---------- 7. meta ---------- */
  t('meta 具備 rowsScanned / rowsReturned / queryType',
    res.meta && typeof res.meta.rowsScanned === 'number' &&
    typeof res.meta.rowsReturned === 'number' && res.meta.queryType === 'dailySummary',
    JSON.stringify(res.meta));
  t('meta 不含任何學生內容',
    SENSITIVE.every(f => JSON.stringify(res.meta).indexOf(f) === -1), '');

  console.log('\n摘要 payload：' + (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1) +
    ' KB（' + res.athletes.length + ' 人）｜讀取 ' + cells + ' 格');
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
