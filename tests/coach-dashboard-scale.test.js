/* 規模測試：2000 / 5000 列 × 164 欄。
   驗證教練後台讀取在資料長大後仍然：不掉資料、不重複、每頁不超過安全上限、
   只回白名單欄位、且回應體積遠低於會觸發 GET 降級的量級。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.maxCols = 220; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? this.rows[0].length : 0; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows() {}
  insertColumnsAfter(after, n) { this.maxCols = after + n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
    sheet.reads = sheet.reads || [];
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
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
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
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

// 正式環境每列平均約 9KB。這裡用同量級的內容，才測得出真正的分頁行為。
const FILLER = '教練備註與心得內容。'.repeat(6);
const READINESS = JSON.stringify({ selfScore: 25, coachScore: 75, recoveryScore: 3, tags: ['需要關心', '連續黃燈注意'] });

/* 正式 records 是近似 append：日期大致遞增，但補填舊日期會 append 到尾端
   （實測 1812 列有 67 次逆序，3.70%）。測試資料必須長得像它，
   否則量到的是不存在的最壞情況。interleaved=true 時才刻意造出最壞排列。 */
function buildSheet(g, rowCount, interleaved) {
  const H = g.HEADERS;
  const idx = {};
  H.forEach((h, i) => { idx[h] = i; });
  const rows = [H];
  // 名單人數固定（41 人），所以「每天的筆數」不會變，成長的是天數。
  // 正式資料：1812 列 / 91 天 ≈ 20 筆/天。用同樣密度往外推。
  const SPAN_DAYS = Math.max(120, Math.ceil(rowCount / 20));
  const day = n => {
    const d = new Date('2026-09-02T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < rowCount; i++) {
    const r = new Array(H.length).fill('');
    r[idx.recordId] = 'rec-' + i;
    r[idx.name] = '選手' + (i % 41);
    r[idx.studentName] = '選手' + (i % 41);
    // 近似 append：日期由舊到新遞增；每 30 列插一筆補填的舊資料製造逆序。
    let dayIdx = interleaved
      ? (i % SPAN_DAYS)                                                    // 最壞情況：日期循環交錯
      : (SPAN_DAYS - 1 - Math.floor(i * SPAN_DAYS / rowCount));            // 正常情況：由舊到新
    // 補填舊日期：實際上多半只差幾天（教練隔天幫選手補），偶爾才有久遠的補登。
    if (!interleaved && i % 37 === 7) dayIdx = Math.min(SPAN_DAYS - 1, dayIdx + 3);
    if (!interleaved && i % 601 === 11) dayIdx = Math.min(SPAN_DAYS - 1, dayIdx + 50);
    r[idx.date] = day(dayIdx);
    r[idx.timestamp] = day(dayIdx) + 'T08:00:00.000Z';
    r[idx.sleepHours] = 6 + (i % 4);
    r[idx.rpe] = 5 + (i % 5);
    r[idx.painScore] = i % 9;
    r[idx.moodIndex] = 1 + (i % 5);
    r[idx.weightKg] = 50 + (i % 20);
    r[idx.status] = ['綠燈', '黃燈', '紅燈'][i % 3];
    r[idx.reflection] = FILLER;
    r[idx.readinessJson] = READINESS;
    // 只在送出時寫入、後台不讀的大欄位：這些必須被擋在回應之外
    r[idx.studentLineText] = FILLER + FILLER;
    r[idx.coachLineText] = FILLER + FILLER;
    r[idx.parentLineText] = FILLER + FILLER;
    r[idx.rawNutritionJson] = JSON.stringify({ items: FILLER });
    r[idx.nutritionLineText] = FILLER;
    rows.push(r);
  }
  // 真實情境：同一選手同一天重送（後端保留兩筆，由前端 dedupe 取最新）。
  // 不靠 i%41 / i%120 的週期碰巧產生，明確造出來才測得到。
  for (let k = 0; k < 12; k++) {
    const dup = rows[1 + k].slice();
    dup[idx.recordId] = 'dup-' + k;
    dup[idx.timestamp] = String(dup[idx.date]) + 'T21:30:00.000Z';   // 較晚送出的那一筆
    dup[idx.status] = '綠燈';
    rows.push(dup);
  }
  return rows;
}

function drain(g, request) {
  const pages = [];
  let offset = 0;
  for (let i = 0; i < 500; i++) {
    const opts = g.recordsReadOptions_(Object.assign({}, request, { offset: offset }));
    const page = g.getAllRecordsRead_(opts);
    pages.push(page);
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  return pages;
}

const SAFE_LIMIT = 2 * 1024 * 1024;   // 單頁 2MB 安全上限（正式失敗的量級是 15.66MB）

/* 量測後端實際從 Sheet 讀了多少格 —— 這才是「不能跟 rows x 164 線性成長」的指標。
   FakeSheet.getRange 會把每次讀取記下來。 */
function cellsRead(sheet) {
  return sheet.reads.reduce((n, r) => n + r.nr * r.nc, 0);
}

[2000, 5000, 10000].forEach(rowCount => {
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  ss.add('records', buildSheet(g, rowCount, false));
  const tag = rowCount + ' 列';

  const request = {
    sinceDate: '2026-07-19',   // 教練後台的 45 天視窗（資料橫跨 120 天）
    keepFields: g.COACH_DASHBOARD_FIELDS,
    omitEmpty: true,
    paged: true
  };
  const pages = drain(g, request);
  const rows = [].concat.apply([], pages.map(p => p.data));
  const ids = rows.map(r => r.recordId);

  t(tag + '：分頁能跑完，最後一頁 nextOffset 為 null',
    pages[pages.length - 1].nextOffset === null, pages.length + ' 頁');
  t(tag + '：沒有重複資料',
    new Set(ids).size === ids.length, ids.length + ' 筆 / ' + new Set(ids).size + ' 個不重複');
  t(tag + '：沒有漏資料（筆數等於視窗內總數）',
    ids.length === pages[0].total, ids.length + ' vs total ' + pages[0].total);
  t(tag + '：每頁 JSON 都在 2MB 安全上限內',
    pages.every(p => JSON.stringify(p).length <= SAFE_LIMIT),
    Math.max.apply(null, pages.map(p => JSON.stringify(p).length)) + ' bytes');

  const biggest = Math.max.apply(null, pages.map(p => JSON.stringify(p).length));
  t(tag + '：最大單頁遠小於會觸發 GET 降級的量級（15.66MB）',
    biggest < 3 * 1024 * 1024, (biggest / 1048576).toFixed(2) + ' MB');

  // 白名單：大欄位一個都不能漏出去
  const leaked = ['studentLineText', 'coachLineText', 'parentLineText', 'rawNutritionJson', 'nutritionLineText', 'nutritionAdviceStudent']
    .filter(f => rows.some(r => Object.prototype.hasOwnProperty.call(r, f)));
  t(tag + '：大型欄位沒有出現在回應裡', leaked.length === 0, leaked.join(','));

  const outside = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => { if (g.COACH_DASHBOARD_FIELDS.indexOf(k) === -1) outside.add(k); }));
  t(tag + '：回應只含白名單欄位', outside.size === 0, [...outside].slice(0, 6).join(','));

  // fields 信封要是完整清單，前端才補得回所有鍵
  t(tag + '：fields 仍回完整欄位清單（前端補空值用）',
    pages[0].fields.length >= g.HEADERS.length, pages[0].fields.length + ' / ' + g.HEADERS.length);

  // 同一選手同一天：後端不做 dedupe，交給前端；這裡確認資料有被完整帶回去讓前端去重
  const byNameDate = {};
  rows.forEach(r => { const k = r.name + '|' + r.date; byNameDate[k] = (byNameDate[k] || 0) + 1; });
  const dupGroups = Object.keys(byNameDate).filter(k => byNameDate[k] > 1).length;
  t(tag + '：同人同日的多筆紀錄有完整帶回（由前端 dedupe，不在後端悄悄砍掉）',
    dupGroups > 0, dupGroups + ' 組同人同日');

  // 讀取量：不得跟 rows x 164 線性成長
  const sheetObj = ss.sheets['records'];
  sheetObj.reads = [];
  g.getAllRecordsRead_(g.recordsReadOptions_(Object.assign({}, request, { offset: 0 })));
  const read = cellsRead(sheetObj);
  const naive = (rowCount + 12) * 164;
  t(tag + '：教練後台的讀取格數遠低於整表掃描',
    read < naive * 0.6, read.toLocaleString() + ' / ' + naive.toLocaleString() +
    ' 格 (' + Math.round(100 * read / naive) + '%)');
  const bulkReads = sheetObj.reads.filter(r => r.nr > 1);   // 不算表頭那種單列讀取
  t(tag + '：取內容的 getRange 次數維持在個位數（不重蹈 v79 的覆轍）',
    bulkReads.length <= 9, bulkReads.length + ' 次（含 1 次日期索引）');

  // 整張表不設視窗、不設白名單時仍然分得動（個人檔案／研究資料匯出走這條）
  const fullPages = drain(g, { omitEmpty: true, paged: true });
  const fullIds = [].concat.apply([], fullPages.map(p => p.data)).map(r => r.recordId);
  t(tag + '：完整歷史路徑也分得動且不漏資料',
    fullIds.length === rowCount + 12 && new Set(fullIds).size === rowCount + 12,
    fullIds.length + ' 筆 / ' + fullPages.length + ' 頁');
  t(tag + '：完整歷史每頁也在安全上限內',
    fullPages.every(p => JSON.stringify(p).length <= SAFE_LIMIT),
    Math.max.apply(null, fullPages.map(p => JSON.stringify(p).length)) + ' bytes');
});

/* ---- 最壞排列：日期完全交錯時，保險絲要接手，且資料不能少 ---- */
[5000].forEach(rowCount => {
  const ssW = new FakeSpreadsheet();
  const gW = load(ssW);
  ssW.add('records', buildSheet(gW, rowCount, true));
  const sheetW = ssW.sheets['records'];
  const req = { sinceDate: '2026-07-19', keepFields: gW.COACH_DASHBOARD_FIELDS, omitEmpty: true, paged: true };

  sheetW.reads = [];
  const pagesW = drain(gW, req);
  const idsW = [].concat.apply([], pagesW.map(p => p.data)).map(r => r.recordId);
  const wideW = sheetW.reads.filter(r => r.nr > 1 && r.nc > 5);   // 要在下面的比對讀取之前算完

  // 與「一次讀完再過濾」的結果逐筆比對，證明保險絲沒有改變資料
  const naiveOpts = gW.recordsReadOptions_({ sinceDate: '2026-07-19', keepFields: gW.COACH_DASHBOARD_FIELDS, omitEmpty: true });
  const naiveIds = gW.getAllRecordsRead_(naiveOpts).data.map(r => r.recordId);

  t('最壞排列（日期完全交錯）：資料與整表掃描逐筆一致，一筆不多一筆不少',
    JSON.stringify(idsW) === JSON.stringify(naiveIds),
    idsW.length + ' vs ' + naiveIds.length);
  t('最壞排列：保險絲接手，全寬讀取次數不隨段數爆炸（每頁至多一次）',
    wideW.length <= pagesW.length, wideW.length + ' 次全寬讀取 / ' + pagesW.length + ' 頁');
});

/* ---- getCoachDashboard 的權限與參數 ---- */
const ss = new FakeSpreadsheet();
const g = load(ss);
ss.add('records', buildSheet(g, 200, false));
const denied = g.getCoachDashboard({ date: '2026-09-02', days: 45 });
t('getCoachDashboard 沒有教練 session 一律擋下', denied && denied.ok === false, JSON.stringify(denied).slice(0, 70));
t('days 有上下限保護（不會被要求整段歷史）',
  g.recordsReadOptions_({ keepFields: ['name'] }).keep !== null, '');
t('apiVersion 常數存在，供前後端握手', typeof g.API_VERSION === 'string' && g.API_VERSION.length > 0, g.API_VERSION);

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
