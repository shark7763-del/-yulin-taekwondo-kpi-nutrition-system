/* getAllRecords 的日期視窗 / 排除欄位 / 去空值 / 分頁。
   這條路徑決定教練後台拿不拿得到資料 —— 回應太大就會被 302 降級成 GET，整頁空白。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows.map(r => r.slice()); this.maxCols = 220; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? Math.max(...this.rows.map(r => r.length)) : 0; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows() {}
  insertColumnsAfter(after, n) { this.maxCols = after + n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
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
      setValues(vals) {
        vals.forEach((line, i) => {
          const idx = r - 1 + i;
          while (sheet.rows.length <= idx) sheet.rows.push([]);
          line.forEach((v, j) => { sheet.rows[idx][c - 1 + j] = v; });
        });
      },
      setValue(v) { this.setValues([[v]]); },
      getValue() { return this.getValues()[0][0]; }
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
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: { formatDate: d => new Date(d).toISOString().slice(0, 10), getUuid: () => 'uuid', computeDigest: () => [1], DigestAlgorithm: {}, Charset: {} },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

const ss = new FakeSpreadsheet();
const g = load(ss);
const H = g.HEADERS;
const row = v => H.map(h => (Object.prototype.hasOwnProperty.call(v, h) ? v[h] : ''));

ss.add('records', [
  H,
  row({ timestamp: '2026-06-01T08:00:00.000Z', date: '2026-06-01', name: '甲', recordId: 'old', studentLineText: '很長的文案'.repeat(20) }),
  row({ timestamp: '2026-08-20T08:00:00.000Z', date: '2026-08-20', name: '甲', recordId: 'mid', sleepHours: 7 }),
  row({ timestamp: '2026-08-30T08:00:00.000Z', date: '2026-08-30', name: '乙', recordId: 'new', sleepHours: 8, studentLineText: 'LINE' }),
  row({ timestamp: '', date: '', name: '丙', recordId: 'nodate' })
]);

const opts = o => g.recordsReadOptions_(o);
const ids = res => res.data.map(r => r.recordId);

/* ---- 1. 不帶參數 = 舊行為 ---- */
t('不帶任何參數時不啟用新路徑（舊前端拿到的東西一字不差）',
  opts({}).active === false && opts({ paged: true }).active === true, '');
const plain = g.getAllRecords();
t('舊路徑保留空字串欄位（物件形狀沒變）',
  plain[0].sleepHours === '' && Object.keys(plain[0]).length > 100,
  Object.keys(plain[0]).length + ' 個欄位');

/* ---- 2. 日期視窗 ---- */
const win = g.getAllRecordsRead_(opts({ sinceDate: '2026-08-01' }));
t('sinceDate 只回視窗內的紀錄',
  ids(win).includes('mid') && ids(win).includes('new') && !ids(win).includes('old'), ids(win).join(','));
t('日期讀不出來的列一律保留（寧可多給，不可把資料弄不見）',
  ids(win).includes('nodate'), ids(win).join(','));
t('total 反映的是視窗過濾後的筆數', win.total === 3, String(win.total));

/* ---- 3. 排除欄位與去空值 ---- */
const trimmed = g.getAllRecordsRead_(opts({ omitFields: ['studentLineText'], omitEmpty: true }));
t('omitFields 指定的欄位不會出現在回應裡',
  trimmed.data.every(r => !Object.prototype.hasOwnProperty.call(r, 'studentLineText')), '');
t('omitEmpty 會拿掉空欄位',
  !Object.prototype.hasOwnProperty.call(trimmed.data[0], 'sleepHours'), '');
t('有值的欄位一個都不會少',
  trimmed.data[1].sleepHours === 7, JSON.stringify(trimmed.data[1].sleepHours));
t('fields 回傳完整欄位清單，前端才補得回空欄位',
  Array.isArray(trimmed.fields)
    && trimmed.fields.indexOf('sleepHours') !== -1
    && trimmed.fields.indexOf('studentLineText') !== -1,
  String(trimmed.fields && trimmed.fields.length));

/* ---- 4. 分頁 ---- */
g.RECORDS_PAGE_BUDGET_CHARS = 1;   // 逼出每頁一列
let offset = 0;
let seen = [];
let pages = 0;
while (pages++ < 20) {
  const page = g.getAllRecordsRead_(opts({ paged: true, offset: offset }));
  seen = seen.concat(page.data.map(r => r.recordId));
  if (page.nextOffset === null) break;
  offset = page.nextOffset;
}
t('分頁串接後的內容與不分頁完全一致',
  JSON.stringify(seen) === JSON.stringify(plain.map(r => r.recordId)), seen.join(','));
t('單列超過預算時仍至少回一列（不會卡成無限分頁）',
  g.getAllRecordsRead_(opts({ paged: true })).data.length === 1, '');
t('4 列資料在 1 字元預算下確實分了多頁', pages > 1, pages + ' 頁');

/* ---- 5. 權限沒有被新參數繞過 ---- */
const denied = g.authAllRecords({ paged: true, sinceDate: '2026-08-01' });
t('沒有教練 session 時，帶了新參數一樣被擋下',
  denied && denied.ok === false, JSON.stringify(denied).slice(0, 80));

/* ---- 6. 前端：視窗只加在教練後台 ---- */
const front = fs.readFileSync(path.join(__dirname, '..', 'js', '07-coach-dashboard.js'), 'utf8');
const winDays = /const COACH_WINDOW_DAYS = (\d+)/.exec(front);
t('前端一律分頁取回 getAllRecords', front.includes('paged: true'), '');
t('只有帶 sinceDate 的呼叫點才縮視窗與排除欄位',
  front.includes('if (opts.sinceDate) {') && front.includes('request.omitFields = COACH_BULK_OMIT_FIELDS'), '');
t('快取依讀取範圍分開存（完整歷史不會被教練視窗的結果汙染）',
  front.includes("const cacheKey = opts.sinceDate ? ('since:' + opts.sinceDate) : 'full'"), '');
t('省略的欄位會依 fields 補回空字串（下游物件形狀不變）',
  front.includes('function rehydrateRecordFields') && front.includes('Object.assign({}, blank, r)'), '');
t('教練視窗跟著教練選的日期往前推，不是寫死今天',
  front.includes('sinceDate: shiftDateStr(filterDate, -COACH_WINDOW_DAYS)'), '');
t('視窗長度涵蓋得住連續型警示的 ALERT_WINDOW_DAYS',
  !!winDays && Number(winDays[1]) >= 14, winDays && winDays[1]);

/* 被排除的五個欄位在教練後台不能有任何讀取端，否則會讀到補回來的空字串。 */
const omitted = ['rawNutritionJson', 'studentLineText', 'coachLineText', 'parentLineText',
  'nutritionLineText', 'nutritionAdviceStudent'];
const readers = omitted.filter(f => new RegExp('(?:\\br|record|rec)\\s*\\.\\s*' + f + '\\b').test(front));
t('被排除的欄位在教練後台確實沒有任何讀取端', readers.length === 0, readers.join(','));

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
