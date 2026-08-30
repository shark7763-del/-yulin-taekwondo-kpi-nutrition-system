/* Safe Read Optimization 的差異測試。
   核心主張：新的「先讀索引欄再取列」實作，必須與舊的 getAllRecords() 全表掃描
   產生**完全相同**的結果。只要有一筆不同就算失敗。

   同時記錄兩者讀取的儲存格數量，證明優化確實有效。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

/* ---------- 會計數的假 Sheet：記錄 getRange 次數與讀取儲存格數 ---------- */
class CountingSheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows ? rows.map(r => r.slice()) : [];
    this.maxCols = 300;
    this.stats = { calls: 0, cells: 0 };
  }
  resetStats() { this.stats = { calls: 0, cells: 0 }; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? Math.max(...this.rows.map(r => r.length)) : 0; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows() {}
  insertColumnsAfter(after, n) { this.maxCols = after + n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(r, c, nr, nc) {
    const sheet = this;
    nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc;
    return {
      getValues() {
        sheet.stats.calls += 1;
        sheet.stats.cells += nr * nc;
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
  insertSheet(n) { this.sheets[n] = new CountingSheet(n, []); return this.sheets[n]; }
  add(name, rows) { this.sheets[name] = new CountingSheet(name, rows); return this.sheets[name]; }
}

function load(ss) {
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
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
    CacheService: (() => {
      const c = {};
      return { getScriptCache: () => ({ get: k => (k in c ? c[k] : null), put: (k, v) => { c[k] = String(v); }, remove: k => { delete c[k]; } }) };
    })(),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    Utilities: {
      formatDate: d => {
        const dt = new Date(d);
        const p = n => String(n).padStart(2, '0');
        return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
      },
      computeDigest: (_a, str) => { const o = []; let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; for (let i = 0; i < 32; i++) { h = ((h ^ (h << 13)) + i) >>> 0; o.push(h & 0xff); } return o; },
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, getUuid: () => 'uuid'
    },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    ScriptApp: { WeekDay: { FRIDAY: 'F' }, getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ create: () => ({}) }) }) }) }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

const results = [];
const t = (name, ok, extra) => results.push({ name, ok, extra });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- 建一份刻意「難搞」的資料 ---------- */
const ss = new FakeSpreadsheet();
const g = load(ss);
const H = g.HEADERS;
const row = f => H.map(h => (h in f ? f[h] : ''));

const fixture = [H];
// 甲同學：有 studentId，日期跨月，timestamp 順序刻意與列順序不同
[
  ['r01', 'ST-A', '甲同學', '2026-06-01', '2026-06-01T10:00:00Z'],
  ['r02', 'ST-A', '甲同學', '2026-06-05', '2026-06-05T10:00:00Z'],
  ['r03', 'ST-A', '甲同學', '2026-07-20', '2026-07-20T10:00:00Z']
].forEach(([id, sid, nm, d, ts]) => fixture.push(row({ recordId: id, studentId: sid, name: nm, studentName: nm, date: d, timestamp: ts, weightKg: '50' })));
// 乙同學插在中間 → 讓甲的列號變成不連續
fixture.push(row({ recordId: 'r04', studentId: 'ST-B', name: '乙同學', studentName: '乙同學', date: '2026-06-02', timestamp: '2026-06-02T10:00:00Z' }));
// 甲的舊資料：沒有 studentId、沒有 recordId（legacy fallback 用姓名）
fixture.push(row({ name: '甲同學', studentName: '甲同學', date: '2026-05-10', timestamp: '2026-05-10T10:00:00Z' }));
// 日期是 Date 物件（Sheets 會自動轉型）
// ⚠️ 必須用沙箱那個 realm 的 Date：vm 內的 `v instanceof Date` 對外部 realm 的
// Date 物件會是 false，用測試檔的 Date 會製造出真實環境不存在的假失敗。
const sandboxDate = vm.runInContext("new Date('2026-08-01T00:00:00')", g);
fixture.push(row({ recordId: 'r06', studentId: 'ST-A', name: '甲同學', studentName: '甲同學', date: sandboxDate, timestamp: '2026-08-01T10:00:00Z' }));
// timestamp 相同 → 測穩定排序與 date 次要比較
fixture.push(row({ recordId: 'r07', studentId: 'ST-A', name: '甲同學', studentName: '甲同學', date: '2026-08-02', timestamp: '2026-08-05T10:00:00Z' }));
fixture.push(row({ recordId: 'r08', studentId: 'ST-A', name: '甲同學', studentName: '甲同學', date: '2026-08-03', timestamp: '2026-08-05T10:00:00Z' }));
// 姓名前後有空白的舊資料
fixture.push(row({ recordId: 'r09', name: ' 甲同學 ', studentName: ' 甲同學 ', date: '2026-08-04', timestamp: '2026-08-04T10:00:00Z' }));
// 再補一批乙同學，把整表撐大
for (let i = 0; i < 20; i++) {
  fixture.push(row({ recordId: 'z' + i, studentId: 'ST-B', name: '乙同學', studentName: '乙同學',
    date: '2026-07-' + String((i % 28) + 1).padStart(2, '0'), timestamp: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z` }));
}
const sheet = ss.add('records', fixture);

/* ---------- 舊實作（作為對照組，逐字複製自 Code.gs 的原始邏輯） ---------- */
const oldRecordsForIdentity = identity => g.getAllRecords().filter(r => {
  if (identity.studentId && r.studentId) return String(r.studentId) === String(identity.studentId);
  return g.normalizeName(r.name) === g.normalizeName(identity.name);
});
const oldRecentForIdentity = (identity, n) => oldRecordsForIdentity(identity).sort(g.byTimestampDesc).slice(0, n);
const oldRecentByName = (name, n) => g.getAllRecords().filter(r => String(r.name) === String(name)).sort(g.byTimestampDesc).slice(0, n);
const oldByDate = date => g.getAllRecords().filter(r => g.formatDateCell(r.date) === String(date));

/* ---------- 差異比對 ---------- */
const idA = { studentId: 'ST-A', name: '甲同學' };
const idLegacy = { studentId: '', name: '甲同學' };

[7, 30, 1, 3].forEach(n => {
  t(`最近 ${n} 筆（studentId 比對）新舊完全一致`,
    eq(oldRecentForIdentity(idA, n), g.recentRecordsForIdentityFast_(idA, n)),
    JSON.stringify((g.recentRecordsForIdentityFast_(idA, n) || []).map(r => r.recordId)));
});

t('legacy 姓名 fallback（沒有 studentId）新舊完全一致',
  eq(oldRecentForIdentity(idLegacy, 30), g.recentRecordsForIdentityFast_(idLegacy, 30)),
  JSON.stringify(g.recentRecordsForIdentityFast_(idLegacy, 30).map(r => r.recordId)));

t('legacy fallback 會撈到沒有 studentId 的舊資料',
  g.recentRecordsForIdentityFast_(idLegacy, 30).some(r => !r.studentId && r.date === '2026-05-10'), '');

t('舊資料缺 recordId 也能正常取回',
  g.recentRecordsForIdentityFast_(idLegacy, 30).some(r => !r.recordId), '');

t('依姓名取最近 7 筆（原始字串比對語意不變）新舊完全一致',
  eq(oldRecentByName('甲同學', 7), g.recentRecordsByNameFast_('甲同學', 7)),
  JSON.stringify(g.recentRecordsByNameFast_('甲同學', 7).map(r => r.recordId)));

t('姓名前後有空白的列，原始比對下不會被誤撈（與舊實作一致）',
  eq(oldRecentByName('甲同學', 30), g.recentRecordsByNameFast_('甲同學', 30)),
  '');

['2026-06-01', '2026-08-01', '2026-07-05', '1999-01-01'].forEach(d => {
  t(`指定日期 ${d} 新舊完全一致`, eq(oldByDate(d), g.recordsByDateFast_(d)),
    JSON.stringify(g.recordsByDateFast_(d).map(r => r.recordId)));
});

t('Date 物件型別的日期也能正確比對（2026-08-01 那列）',
  g.recordsByDateFast_('2026-08-01').length === 1
    && g.recordsByDateFast_('2026-08-01')[0].recordId === 'r06', '');

const tsTie = g.recentRecordsForIdentityFast_(idA, 30).filter(r => r.recordId === 'r07' || r.recordId === 'r08');
t('timestamp 相同時的排序與舊實作一致（以 date 次要比較）',
  eq(oldRecentForIdentity(idA, 30).filter(r => r.recordId === 'r07' || r.recordId === 'r08'), tsTie),
  JSON.stringify(tsTie.map(r => r.recordId)));

t('非連續列號也能正確取回（甲的列被乙插開）',
  g.recentRecordsForIdentityFast_(idA, 30).length === oldRecentForIdentity(idA, 30).length, '');

t('取 0 筆時回空陣列，不會誤讀整表',
  eq([], g.recentRecordsForIdentityFast_(idA, 0)), '');

t('查無此人回空陣列',
  eq([], g.recentRecordsForIdentityFast_({ studentId: '', name: '查無此人' }, 7)), '');

/* ---------- 家長遮蔽仍然有效（走 authRecordResult） ---------- */
{
  g.CacheService.getScriptCache().put('auth:tokP', JSON.stringify({
    role: 'parent', studentId: 'ST-A', studentName: '甲同學', consentStatus: 'agreed'
  }));
  const res = g.authRecordResult({ authToken: 'tokP', limit: 7 }, 'recent');
  const rows = (res && res.data) || [];
  // 舊資料有姓名前後帶空白的列，normalizeName 會 trim，撈到是正確的
  t('家長仍只讀得到自己孩子',
    res.ok === true && rows.length > 0 && rows.every(r => g.normalizeName(r.name) === '甲同學'),
    JSON.stringify(rows.map(r => r.name)));
  t('家長仍拿不到敏感欄位（weightKg）',
    rows.every(r => r.weightKg === undefined), JSON.stringify(rows[0] || {}).slice(0, 120));
}

/* ---------- 寫入行為不受影響 ---------- */
{
  const before = sheet.rows.length;
  const add = g.addRecord({ name: '甲同學', date: '2026-09-09', recordId: 'rNew', studentId: 'ST-A', weightKg: '51' });
  t('addRecord 仍能新增一列（寫入行為未受影響）',
    add.ok === true && sheet.rows.length === before + 1, JSON.stringify(add).slice(0, 80));
  const upd = g.addRecord({ name: '甲同學', date: '2026-09-09', weightKg: '52' });
  t('addRecord 的同日 upsert 仍然有效，未重複建列',
    upd.ok === true && upd.updated === true && sheet.rows.length === before + 1, JSON.stringify(upd).slice(0, 80));
  t('新寫入的資料，優化後的讀取立刻讀得到',
    g.recordsByDateFast_('2026-09-09').length === 1, '');
  const u2 = g.updateRecord('rNew', { coachComment: 'ok' });
  t('updateRecord 仍然有效（寫入行為未受影響）', u2.ok === true, JSON.stringify(u2).slice(0, 80));
}

/* ---------- append-only 補欄位不受影響 ---------- */
{
  const audit = g.appendMissingHeaders_(sheet, g.HEADERS, true);
  t('append-only 補欄位仍回報無事可做（表頭未被優化影響）',
    audit.appended.length === 0 && !audit.skipped, JSON.stringify(audit.missing));
}

/* ---------- 讀取量比較 ---------- */
{
  sheet.resetStats();
  oldRecentForIdentity(idA, 7);
  const oldStats = Object.assign({}, sheet.stats);
  sheet.resetStats();
  g.recentRecordsForIdentityFast_(idA, 7);
  const newStats = Object.assign({}, sheet.stats);
  const saved = Math.round((1 - newStats.cells / oldStats.cells) * 100);
  t(`讀取儲存格數下降（舊 ${oldStats.cells} → 新 ${newStats.cells}，少 ${saved}%）`,
    newStats.cells < oldStats.cells, JSON.stringify({ old: oldStats, new: newStats }));
  console.log(`\n  讀取量：最近 7 筆  舊 ${oldStats.cells} 格 / ${oldStats.calls} 次 →  新 ${newStats.cells} 格 / ${newStats.calls} 次（少 ${saved}%）`);

  sheet.resetStats(); oldByDate('2026-07-05');
  const od = Object.assign({}, sheet.stats);
  sheet.resetStats(); g.recordsByDateFast_('2026-07-05');
  const nd = Object.assign({}, sheet.stats);
  console.log(`  讀取量：指定日期  舊 ${od.cells} 格 / ${od.calls} 次 →  新 ${nd.cells} 格 / ${nd.calls} 次（少 ${Math.round((1 - nd.cells / od.cells) * 100)}%）`);
  t('指定日期查詢的讀取量也下降', nd.cells < od.cells, JSON.stringify({ old: od, new: nd }));
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
