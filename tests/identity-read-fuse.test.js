const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows.map(r => r.slice()); this.maxCols = 220; this.reads = []; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? Math.max(...this.rows.map(r => r.length)) : 0; }
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

/* recordsForIdentityOptimized_（上次表現 / getSubmitContext / getLastRecordByName 共用）
   必須只用「一次整表 getRange」讀資料列。records 每天交錯約 20 位選手，
   單一選手的列幾乎不連續，舊做法逐段補讀會變成一筆一次 getRange（v79 的教訓）。
   計數只算資料列（r >= 2）；r === 1 是 auditHeaders_ 讀表頭。 */

function makeRow(H, values) {
  return H.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}
const pad = n => String(n).padStart(2, '0');
function dayOf(i) {
  const d = new Date(Date.UTC(2026, 6, 1) + i * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const dataReads = sh => sh.reads.filter(r => r.r >= 2);
const isFullTable = (sh, H, r) => r.r === 2 && r.c === 1 && r.nc === H.length && r.nr === sh.getLastRow() - 1;
const ids = list => list.map(r => r.recordId);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 比對一次呼叫：結果與舊路徑逐筆相同，且資料列只讀一次（整表）
function check(label, g, sh, H, identity, limit, expectLen) {
  const legacy = ids(g.recordsForIdentity(identity).sort(g.byTimestampDesc).slice(0, limit));
  sh.reads = [];
  const got = ids(g.recordsForIdentityOptimized_(identity, limit));
  const dr = dataReads(sh);
  t(`${label} limit ${limit}: exactly ${expectLen} results`, got.length === expectLen, String(got.length));
  t(`${label} limit ${limit}: legacy also has ${expectLen}`, legacy.length === expectLen, String(legacy.length));
  t(`${label} limit ${limit}: recordId order identical to legacy`, same(got, legacy), `${got.slice(0, 6)} vs ${legacy.slice(0, 6)}`);
  t(`${label} limit ${limit}: exactly 1 data-row getRange`, dr.length === 1, JSON.stringify(dr));
  t(`${label} limit ${limit}: that read is the full table`, dr.length === 1 && isFullTable(sh, H, dr[0]), JSON.stringify(dr));
  t(`${label} limit ${limit}: total getRange incl. header <= 2`, sh.reads.length <= 2, String(sh.reads.length));
  sh.reads = [];
  return got;
}

// ---- 交錯 1800 列：40 位選手 x 45 天，每天每人一筆 ----
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const rows = [H];
  for (let day = 0; day < 45; day++) {
    for (let a = 0; a < 40; a++) {
      const date = dayOf(day);
      rows.push(makeRow(H, {
        timestamp: `${date}T${pad(8 + (a % 12))}:${pad(a)}:00.000Z`,
        date, name: `選手${a}`, studentId: `S${a}`, recordId: `r-${day}-${a}`
      }));
    }
  }
  const sheet = ss.add('records', rows);
  t('fixture: interleaved sheet has 1800 data rows', sheet.getLastRow() - 1 === 1800, String(sheet.getLastRow() - 1));
  const identity = { name: '選手7', studentId: 'S7' };
  const all = check('interleaved', g, sheet, H, identity, 180, 45);
  t('interleaved: newest first is day 44', all[0] === 'r-44-7', all[0]);
  t('interleaved: oldest last is day 0', all[44] === 'r-0-7', all[44]);
  // limit 小於符合筆數；1 = getLastRecordByName，60 = getSubmitContext
  const one = check('interleaved', g, sheet, H, identity, 1, 1);
  t('interleaved limit 1: is newest row', one[0] === 'r-44-7', one[0]);
  check('interleaved', g, sheet, H, identity, 10, 10);
  check('interleaved', g, sheet, H, identity, 60, 45);
  // 只帶姓名（無 studentId）的舊身分
  check('interleaved name-only', g, sheet, H, { name: '選手7' }, 180, 45);
}

// ---- 少數連續段：結果仍一致，也只讀一次 ----
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const rows = [H];
  let k = 0;
  const push = (name, sid) => {
    const date = dayOf(k % 60);
    rows.push(makeRow(H, { timestamp: `${date}T08:${pad(k % 60)}:00.000Z`, date, name, studentId: sid, recordId: `c-${k}` }));
    k++;
  };
  for (let block = 0; block < 3; block++) {
    for (let i = 0; i < 30; i++) push(`他人${i}`, `X${i}`);
    for (let i = 0; i < 5; i++) push('甲同學', 'S1');
  }
  for (let i = 0; i < 30; i++) push(`他人${i}`, `X${i}`);
  const sheet = ss.add('records', rows);
  check('contiguous', g, sheet, H, { name: '甲同學', studentId: 'S1' }, 180, 15);
  check('contiguous', g, sheet, H, { name: '甲同學', studentId: 'S1' }, 7, 7);
}

// ---- studentId 比對：改名仍算同一人、同名不同學號排除、空學號退回姓名 ----
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const rows = [H];
  for (let day = 0; day < 30; day++) {
    const date = dayOf(day);
    for (let a = 0; a < 20; a++) {
      let name = `選手${a}`, sid = `S${a}`;
      if (a === 3) name = day < 15 ? '舊名' : '新名';               // S3 中途改名
      if (a === 4) name = '新名';                                    // 同名不同學號 S4
      if (a === 5 && day % 10 === 0) { name = '新名'; sid = ''; }    // 空學號、同名 → 依姓名算進來
      rows.push(makeRow(H, { timestamp: `${date}T${pad(3 + a)}:00:00.000Z`, date, name, studentId: sid, recordId: `d-${day}-${a}` }));
    }
  }
  const sheet = ss.add('records', rows);
  const got = check('studentId', g, sheet, H, { name: '新名', studentId: 'S3' }, 180, 33);
  t('studentId: includes rows under old name', got.includes('d-0-3') && got.includes('d-14-3'), got.join(','));
  t('studentId: same name with other studentId excluded', !got.some(id => /-4$/.test(id)), got.join(','));
  t('studentId: blank studentId falls back to name', ['d-0-5', 'd-10-5', 'd-20-5'].every(id => got.includes(id)), got.join(','));
}

// ---- 時間戳亂序 / 平手 / 空白 / 無效 / Date 物件 / 補填舊日期 append 到尾端 ----
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const rows = [H];
  const T = (name, sid, timestamp, date, recordId) => rows.push(makeRow(H, { timestamp, date, name, studentId: sid, recordId }));
  for (let i = 0; i < 25; i++) T(`他人${i}`, `X${i}`, `${dayOf(i)}T09:00:00.000Z`, dayOf(i), `o-${i}`);
  T('乙同學', 'S2', '2026-07-10T08:00:00.000Z', '2026-07-10', 'm-a');
  T('他人', 'X', '2026-07-10T08:00:00.000Z', '2026-07-10', 'o-x1');
  T('乙同學', 'S2', '2026-07-03T08:00:00.000Z', '2026-07-03', 'm-b');
  T('乙同學', 'S2', '', '2026-07-20', 'm-blank-late');
  T('他人', 'X', '2026-07-11T08:00:00.000Z', '2026-07-11', 'o-x2');
  T('乙同學', 'S2', '', '2026-07-05', 'm-blank-early');
  T('乙同學', 'S2', new Date('2026-07-15T08:00:00.000Z'), new Date('2026-07-15T00:00:00+08:00'), 'm-dateobj');
  T('乙同學', 'S2', '2026-07-10T08:00:00.000Z', '2026-07-09', 'm-tie-older-date');
  T('乙同學', 'S2', '2026-07-10T08:00:00.000Z', '2026-07-11', 'm-tie-newer-date');
  T('他人', 'X', '2026-07-12T08:00:00.000Z', '2026-07-12', 'o-x3');
  T('乙同學', 'S2', 'not-a-date', '2026-07-01', 'm-invalid');
  T('乙同學', 'S2', '2026-06-01T08:00:00.000Z', '2026-06-01', 'm-backfill');
  const sheet = ss.add('records', rows);
  const identity = { name: '乙同學', studentId: 'S2' };
  const got = check('mixed', g, sheet, H, identity, 180, 9);
  t('mixed: Date-object timestamp is newest', got[0] === 'm-dateobj', got.join(','));
  t('mixed: timestamp tie broken by newer date first', got.indexOf('m-tie-newer-date') < got.indexOf('m-tie-older-date'), got.join(','));
  t('mixed: backfilled old row sorts after newer rows', got.indexOf('m-backfill') > got.indexOf('m-b'), got.join(','));
  t('mixed: blank-timestamp rows sort after timestamped rows', got.indexOf('m-blank-late') > got.indexOf('m-backfill'), got.join(','));
  check('mixed', g, sheet, H, identity, 1, 1);
  check('mixed', g, sheet, H, identity, 3, 3);
}

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra && !r.ok ? '  ' + r.extra : ''}`));
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`);
  process.exit(1);
}
console.log(`\n${results.length}/${results.length} passed`);
