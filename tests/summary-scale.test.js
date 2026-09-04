/* Summary First 的規模量測：51 / 100 位選手 × records 2000 / 5000 / 10000 / 20000。
   量的是「教練打開上次表現首頁」這一次操作，
   CURRENT（14 天 bounded records）vs NEW（1 天摘要）。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const B = path.join(__dirname, '..');

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

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
function load(ss) {
  const props = {};
  const cache = {};
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: { formatDate: d => new Date(d).toISOString().slice(0, 10), getUuid: () => 'uuid', computeDigest: () => [1], DigestAlgorithm: {}, Charset: {} },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(B, 'apps-script', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

const DATE = '2026-09-04';
const FILLER = '教練備註與今日心得內容。'.repeat(6);
const ymd = n => {
  const d = new Date(DATE + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

function build(g, rowCount, athletes) {
  const H = g.HEADERS;
  const idx = {};
  H.forEach((h, i) => { idx[h] = i; });
  const rows = [H];
  // 名單人數固定，成長的是天數（正式資料 1812 列 / 91 天 ≈ 20 筆/天）
  const days = Math.max(30, Math.ceil(rowCount / athletes));
  for (let i = 0; i < rowCount; i++) {
    const day = days - 1 - Math.floor(i * days / rowCount);
    const a = i % athletes;
    const r = new Array(H.length).fill('');
    r[idx.recordId] = 'r' + i;
    r[idx.name] = '選手' + (a + 1);
    r[idx.studentName] = '選手' + (a + 1);
    r[idx.date] = ymd(day);
    r[idx.timestamp] = ymd(day) + 'T08:00:00.000Z';
    r[idx.totalScore] = 70 + (a % 20);
    r[idx.painScore] = a % 9;
    r[idx.rpe] = 5 + (a % 5);
    r[idx.sleepHours] = 6 + (a % 4);
    r[idx.moodIndex] = 1 + (a % 5);
    r[idx.finalReadinessScore] = 40 + (a % 55);
    r[idx.readinessStatusLight] = ['綠燈', '黃燈', '紅燈'][a % 3];
    r[idx.reflection] = FILLER;
    r[idx.studentLineText] = FILLER + FILLER;
    r[idx.coachLineText] = FILLER + FILLER;
    r[idx.parentLineText] = FILLER + FILLER;
    r[idx.rawNutritionJson] = JSON.stringify({ items: FILLER });
    rows.push(r);
  }
  return rows;
}

const table = [];
[[51, 2000], [51, 5000], [51, 10000], [51, 20000], [100, 10000], [100, 20000]].forEach(([athletes, rowCount]) => {
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const sheet = ss.add('records', build(g, rowCount, athletes));
  ss.add('student_traits', [g.STUDENT_TRAIT_HEADERS]);
  const CS = g.COACH_SETTING_HEADERS;
  ss.add('coach_settings', [CS, CS.map(h => (h === 'coachId' ? 'C1' : (h === 'teamId' ? 'T1' :
    (h === 'coachPasswordHash' ? g.hashSecret('coach:C1', 'pw') : (h === 'failedLoginCount' ? 0 : '')))))]);
  const token = (g.coachLogin({ coachPassword: 'pw' }) || {}).authToken;
  const tag = athletes + ' 人 / ' + rowCount + ' 列';

  // NEW：1 天摘要
  sheet.reads = [];
  const neu = g.getDailyAthleteSummary({ date: DATE, authToken: token });
  const newCells = sheet.reads.reduce((n, r) => n + r.nr * r.nc, 0);
  const newBytes = Buffer.byteLength(JSON.stringify(neu), 'utf8');

  // CURRENT：14 天 bounded records（改造前首頁走的那條）
  sheet.reads = [];
  const cur = g.getAllRecordsRead_(g.recordsReadOptions_({
    sinceDate: ymd(14), keepFields: g.COACH_DASHBOARD_FIELDS, omitEmpty: true, paged: true
  }));
  const curCells = sheet.reads.reduce((n, r) => n + r.nr * r.nc, 0);
  const curBytes = Buffer.byteLength(JSON.stringify(cur), 'utf8');

  table.push({ tag, athletes, rowCount,
    curBytes, newBytes, curRows: cur.data.length, newRows: neu.athletes.length,
    curCells, newCells });

  t(tag + '：摘要 payload 遠小於 14 天 bounded',
    newBytes < curBytes / 5, (newBytes / 1024).toFixed(1) + 'KB vs ' + (curBytes / 1024).toFixed(1) + 'KB');
  t(tag + '：摘要讀取格數低於 14 天 bounded',
    newCells < curCells, newCells + ' vs ' + curCells);
  t(tag + '：摘要回傳人數等於當日回報人數（沒有漏人）',
    neu.athletes.length === neu.stats.reported && neu.athletes.length > 0,
    neu.athletes.length + ' 人');
  t(tag + '：摘要不含心得內容',
    JSON.stringify(neu).indexOf('心得內容') === -1, '');
});

// 資料量成長時，摘要的 payload 不該跟著長（人數固定，天數才成長）
const p2000 = table.filter(r => r.athletes === 51 && r.rowCount === 2000)[0];
const p20000 = table.filter(r => r.athletes === 51 && r.rowCount === 20000)[0];
t('records 由 2000 成長到 20000 時，摘要 payload 幾乎不變（只跟當日人數有關）',
  Math.abs(p20000.newBytes - p2000.newBytes) / p2000.newBytes < 0.2,
  p2000.newBytes + ' -> ' + p20000.newBytes + ' bytes');
// 名單人數固定時，14 天視窗的「列數」本來就不會隨總量成長 ——
// 真正隨總量線性成長的是「讀取格數」（索引掃描要掃過每一列）。
t('14 天 bounded 的讀取格數會隨資料量成長（對照組）',
  p20000.curCells > p2000.curCells * 1.2,
  p2000.curCells + ' -> ' + p20000.curCells + ' 格');
t('任何資料量下，摘要的讀取格數都明顯低於 14 天 bounded',
  table.every(r => r.newCells < r.curCells * 0.6),
  table.map(r => r.tag + ':' + Math.round(100 * r.newCells / r.curCells) + '%').join(' '));
t('摘要 payload 一律小於 14 天 bounded 的 1/20',
  table.every(r => r.newBytes < r.curBytes / 20),
  table.map(r => Math.round(r.curBytes / r.newBytes) + 'x').join(' '));

console.log('');
console.log('情境'.padEnd(20) + 'CURRENT KB'.padStart(12) + 'NEW KB'.padStart(12) +
  'CUR 列'.padStart(9) + 'NEW 列'.padStart(9) + 'CUR 格數'.padStart(13) + 'NEW 格數'.padStart(13));
console.log('-'.repeat(96));
table.forEach(r => {
  console.log(
    r.tag.padEnd(22) +
    (r.curBytes / 1024).toFixed(1).padStart(12) +
    (r.newBytes / 1024).toFixed(1).padStart(12) +
    String(r.curRows).padStart(10) +
    String(r.newRows).padStart(10) +
    r.curCells.toLocaleString().padStart(12) +
    r.newCells.toLocaleString().padStart(12));
});

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
