/* TeamPro 2.0 Phase 3：窄欄讀取的等價性測試。
   latestGroupByName / findRecordById / getRecordsByDate 改成只讀需要的欄，
   回傳值必須與舊版（getAllRecords 整表讀取後過濾）逐字相同 ——
   包含 8/27 前欄位錯位的舊列、長短不一的列、中文別名表頭、重複 recordId、日期逆序。
   另驗：讀取量真的變少、快取在寫入時會清掉、讀取失敗不寫快取。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows ? rows.map(r => r.slice()) : []; this.maxCols = 200; this.frozen = 0; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? Math.max(...this.rows.map(r => r.length)) : 0; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows(n) { this.frozen = n; }
  insertColumnsAfter(after, n) { this.maxCols = after + n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(r, c, nr, nc) {
    const sheet = this;
    nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = sheet.rows[r - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
          out.push(line);
        }
        return out;
      },
      setValues(vals) {
        vals.forEach((line, i) => {
          const idx = r - 1 + i;
          while (sheet.rows.length <= idx) sheet.rows.push([]);
          const row = sheet.rows[idx];
          line.forEach((v, j) => { row[c - 1 + j] = v; });
          for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = '';
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
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    // 真的存起來，否則像「自動開啟開關」這種讀寫 Script Properties 的邏輯測不到
    PropertiesService: (() => {
      const store = {};
      const api = {
        getProperty: k => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); return api; },
        deleteProperty: k => { delete store[k]; return api; },
        getProperties: () => Object.assign({}, store)
      };
      return { getScriptProperties: () => api };
    })(),
    // 真的存起來：getAuthSession 從 CacheService 讀 'auth:<token>'，
    // 空殼版本會讓所有需要 session 的測試無法進行。
    CacheService: (() => {
      const c = {};
      const api = {
        get: k => (k in c ? c[k] : null),
        put: (k, v) => { c[k] = String(v); },
        remove: k => { delete c[k]; }
      };
      return { getScriptCache: () => api };
    })(),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: {
      formatDate: (d, tz, fmt) => new Date(d).toISOString().slice(0, 10),
      // 原本固定回 [1,2,3]，等於所有密碼的雜湊都一樣，登入測試會全部誤過。
      // 這裡放一個確定性的雜湊：同輸入同輸出、不同輸入不同輸出，足以測登入邏輯。
      computeDigest: (_alg, str) => {
        const out = [];
        let h1 = 0x811c9dc5, h2 = 0x01000193;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
          h1 = ((h1 ^ s.charCodeAt(i)) * 16777619) >>> 0;
          h2 = ((h2 + s.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
        }
        for (let i = 0; i < 32; i++) {
          h1 = ((h1 ^ (h1 << 13)) + h2 + i) >>> 0;
          h2 = ((h2 ^ (h2 >>> 7)) + h1) >>> 0;
          out.push((h1 ^ h2) & 0xff);
        }
        return out;
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      getUuid: () => 'uuid'
    },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    ScriptApp: (() => {
      let triggers = [];
      return {
        WeekDay: { FRIDAY: 'FRIDAY' },
        getProjectTriggers: () => triggers.slice(),
        deleteTrigger: t => { triggers = triggers.filter(x => x !== t); },
        newTrigger: fn => {
          const b = {
            timeBased: () => b, onWeekDay: () => b, atHour: () => b,
            create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; }
          };
          return b;
        }
      };
    })()
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}


const results = [];
const t = (name, ok, extra) => results.push({ name, ok: ok === true, extra });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 舊版實作（Phase 3 之前的程式，逐字搬過來當對照組）
function oldLatest(g) {
  const map = {};
  let all;
  try { all = g.getAllRecords(); } catch (e) { all = []; }
  all.forEach(r => {
    const name = String(r.name || '').trim();
    const grp = String(r.group || '').trim();
    if (!name || !grp || grp.indexOf('未出席') !== -1) return;
    const tt = new Date(r.timestamp || r.date || 0).getTime();
    if (!map[name] || tt >= map[name].t) map[name] = { group: grp, t: tt };
  });
  const out = {};
  Object.keys(map).forEach(n => { out[n] = map[n].group; });
  return out;
}
const oldFind = (g, id) => g.getAllRecords().find(r => String(r.recordId) === String(id)) || null;
const oldByDate = (g, d) => g.getAllRecords().filter(r => g.formatDateCell(r.date) === String(d));

// 讀取量計數：包住 records 的 getRange（只算資料列，不算表頭）
function meter(sheet) {
  const m = { cells: 0, calls: 0 };
  const orig = sheet.__origGetRange || sheet.getRange.bind(sheet);
  sheet.__origGetRange = orig;
  sheet.getRange = (r, c, nr, nc) => {
    const rg = orig(r, c, nr, nc);
    const gv = rg.getValues.bind(rg);
    rg.getValues = () => { const v = gv(); if (r >= 2) { m.calls++; m.cells += v.length * (v[0] ? v[0].length : 0); } return v; };
    return rg;
  };
  return m;
}

/* 情境：新列、錯位舊列（較短、name/group 欄裝別的東西）、「未出席」、空姓名、
   timestamp 空白退回 date、時間戳相同、重複 recordId、日期逆序、同一天不相鄰、Date 物件、空白列 */
function fixture(headers) {
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = headers || g.HEADERS;
  const col = k => {
    for (let i = 0; i < H.length; i++) { const raw = String(H[i]).trim(); if (raw === k || g.canonicalHeaderName_(raw) === k) return i; }
    return -1;
  };
  const row = f => { const r = H.map(() => ''); Object.keys(f).forEach(k => { const i = col(k); if (i !== -1) r[i] = f[k]; }); return r; };
  const rows = [H.slice()];
  rows.push(row({ recordId: 'r1', timestamp: '2026-09-01T01:00:00Z', date: '2026-09-01', name: '甲', group: '跆拳道對練' }));
  rows.push(row({ recordId: 'r2', timestamp: '2026-09-02T01:00:00Z', date: '2026-09-02', name: '乙', group: '武術套路' }));
  rows.push(row({ recordId: 'r3', timestamp: '2026-09-03T01:00:00Z', date: '2026-09-03', name: '甲', group: '跆拳道品勢' }));
  rows.push(row({ recordId: 'r4', timestamp: '2026-09-04T01:00:00Z', date: '2026-09-04', name: '甲', group: '未出席訓練' }));
  rows.push(row({ recordId: 'r5', timestamp: '', date: '2026-09-05', name: '丙', group: '散打' }));
  rows.push(row({ recordId: 'r6', timestamp: '2026-09-05T00:00:00Z', date: '2026-09-05', name: '丙', group: '體能訓練' }));
  rows.push(row({ recordId: 'r6', timestamp: '2026-09-06T01:00:00Z', date: '2026-09-06', name: '丁', group: '散打' }));
  rows.push(row({ recordId: 'r7', timestamp: '2026-09-06T02:00:00Z', date: '2026-09-06', name: '', group: '散打' }));
  rows.push(row({ recordId: 'r8', timestamp: 'not-a-date', date: '', name: '戊', group: '跆拳道對練' }));
  rows.push(row({ recordId: 'r9', timestamp: '2026-08-20T01:00:00Z', date: '2026-08-20', name: '乙', group: '跆拳道對練' }));
  rows.push(row({ recordId: 'r10', timestamp: '2026-09-02T05:00:00Z', date: new Date('2026-09-02T00:00:00Z'), name: '己', group: '散打' }));
  const short = H.slice(0, 44).map((_, i) => 'x' + i);
  if (col('recordId') < 44) short[col('recordId')] = 'old-1';
  if (col('name') < 44) short[col('name')] = '加強旋踢的速度';
  if (col('group') < 44) short[col('group')] = 12345;
  if (col('date') < 44) short[col('date')] = '2026-09-02';
  rows.push(short);
  rows.push([]);
  const sh = ss.add('records', rows);
  return { g, sh };
}

for (const variant of ['標準表頭', '中文別名表頭']) {
  let headers = null;
  if (variant === '中文別名表頭') {
    const base = load(new FakeSpreadsheet()).HEADERS.slice();
    // 舊表：前面是中文表頭，且最後又有一欄 name（rowToObject 取第一個「姓名」）
    headers = ['時間', '日期', '姓名', '項目'].concat(base.filter(h => ['timestamp', 'date', 'name', 'group'].indexOf(h) === -1)).concat(['name']);
  }
  const { g, sh } = fixture(headers);
  const full = (sh.getLastRow() - 1) * sh.getLastColumn();

  // I-1
  const expectGroups = oldLatest(g);
  if (g.clearLatestGroupCache_) g.clearLatestGroupCache_();
  const m1 = meter(sh);
  const gotGroups = g.latestGroupByName();
  t(variant + '｜I-1 latestGroupByName 結果與舊版逐字相同', same(gotGroups, expectGroups), JSON.stringify({ gotGroups, expectGroups }));
  t(variant + '｜I-1 前置：對照組不是空的', Object.keys(expectGroups).length >= 4, JSON.stringify(expectGroups));
  t(variant + '｜I-1 只讀一次、讀取格數 < 整表 10%', m1.calls === 1 && m1.cells < full * 0.1, JSON.stringify({ m1, full }));
  const m1b = meter(sh);
  const again = g.latestGroupByName();
  t(variant + '｜I-1 第二次命中快取：0 次讀取且結果相同', m1b.calls === 0 && same(again, expectGroups), JSON.stringify(m1b));

  // I-2
  for (const id of ['r1', 'r6', 'r10', 'old-1', 'nope', '']) {
    t(variant + '｜I-2 findRecordById(' + JSON.stringify(id) + ') 與舊版相同', same(g.findRecordById(id), oldFind(g, id)), id);
  }
  const m2 = meter(sh);
  g.findRecordById('r10');
  t(variant + '｜I-2 只讀 recordId 一欄＋一列', m2.calls === 2 && m2.cells === (sh.getLastRow() - 1) + sh.getLastColumn(), JSON.stringify(m2));

  // I-3
  for (const d of ['2026-09-02', '2026-09-05', '2026-08-20', '2026-09-06', '2030-01-01', '']) {
    const got = g.getRecordsByDate(d), exp = d ? oldByDate(g, d) : [];
    t(variant + '｜I-3 getRecordsByDate(' + JSON.stringify(d) + ') 與舊版相同（含順序）', same(got, exp),
      JSON.stringify({ got: got.map(r => r.recordId), exp: exp.map(r => r.recordId) }));
  }
  t(variant + '｜I-3 前置：2026-09-02 有不相鄰的多筆', oldByDate(g, '2026-09-02').length >= 2, '');
  const m3 = meter(sh);
  g.getRecordsByDate('2026-09-05');
  t(variant + '｜I-3 只讀 date 欄＋當天那段', m3.cells < full * 0.3, JSON.stringify({ m3, full }));
}

/* I-3 保險絲：同一天分散成超過 RECORDS_MAX_RANGE_READS 段時退回整表，結果仍相同 */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const row = f => H.map(h => (h in f ? f[h] : ''));
  const rows = [H];
  for (let i = 0; i < 40; i++) rows.push(row({ recordId: 'z' + i, date: i % 2 ? '2026-09-10' : '2026-09-11', name: 'n' + i, group: '散打' }));
  ss.add('records', rows);
  const m = meter(ss.getSheetByName('records'));
  const got = g.getRecordsByDate('2026-09-10');
  t('I-3 保險絲：20 段時退回整表，結果與舊版相同', same(got, oldByDate(g, '2026-09-10')) && got.length === 20, String(got.length));
  t('I-3 保險絲：getRange 次數有上限（不會 20 次）', m.calls <= 3, JSON.stringify(m));
}

/* 快取失效：新增紀錄、更新紀錄、KPI 設定變更都要清掉；讀取失敗不寫快取 */
{
  const { g, sh } = fixture();
  const cache = g.CacheService.getScriptCache();
  g.latestGroupByName();
  t('快取：算完會寫入', cache.get(g.LATEST_GROUP_CACHE_KEY) !== null, '');
  const add = g.addRecord({ name: '甲', date: '2026-09-20', timestamp: '2026-09-20T01:00:00Z', group: '散打', recordId: 'new-1' });
  t('快取前置：addRecord 成功', add && add.ok === true, JSON.stringify(add));
  t('快取：addRecord 成功後清掉', cache.get(g.LATEST_GROUP_CACHE_KEY) === null, '');
  t('快取：清掉後重算拿到新組別', g.latestGroupByName()['甲'] === '散打', JSON.stringify(g.latestGroupByName()));
  const up = g.updateRecord('r1', { coachNote: 'x' });
  t('快取前置：updateRecord 成功', up && up.ok === true, JSON.stringify(up));
  t('快取：updateRecord 後清掉', cache.get(g.LATEST_GROUP_CACHE_KEY) === null, '');
  g.latestGroupByName();
  g.clearKpiCaches_();
  t('快取：clearKpiCaches_ 也會清掉', cache.get(g.LATEST_GROUP_CACHE_KEY) === null, '');

  const origGR = sh.getRange.bind(sh);
  sh.getRange = (r, c, nr, nc) => { if (r >= 2) throw new Error('Service timed out'); return origGR(r, c, nr, nc); };
  const failed = g.latestGroupByName();
  sh.getRange = origGR;
  t('讀取失敗：回空物件（與舊版相同）且不寫快取', same(failed, {}) && cache.get(g.LATEST_GROUP_CACHE_KEY) === null, JSON.stringify(failed));
  cache.put(g.LATEST_GROUP_CACHE_KEY, '{壞掉的json');
  t('快取內容損壞：重算而不是丟錯', same(g.latestGroupByName(), oldLatest(g)), '');
}

/* 空表 */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  ss.add('records', [g.HEADERS]);
  t('空表：三支都回空且不丟錯', same(g.latestGroupByName(), {}) && g.findRecordById('x') === null && same(g.getRecordsByDate('2026-09-01'), []), '');
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + String(r.extra).slice(0, 400))));
const failedN = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failedN) + '/' + results.length + ' passed');
process.exit(failedN ? 1 : 0);
