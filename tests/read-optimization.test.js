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

const ss = new FakeSpreadsheet();
const g = load(ss);
const H = g.HEADERS;
function row(values) {
  return H.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}

const sheet = ss.add('records', [
  H,
  row({ timestamp: '2026-08-01T08:00:00.000Z', date: '2026-08-01', name: '甲同學', studentId: 'S1', recordId: 'a' }),
  row({ timestamp: '2026-08-04T08:00:00.000Z', date: new Date('2026-08-04T00:00:00+08:00'), name: '乙同學', studentId: 'S2', recordId: 'b' }),
  row({ timestamp: '2026-08-03T08:00:00.000Z', date: '2026-08-03', name: '甲同學', studentId: 'S1', recordId: 'c' }),
  row({ timestamp: '', date: '2026-08-05', name: '甲同學', studentId: '', recordId: 'legacy-name' }),
  row({ timestamp: '2026-08-02T08:00:00.000Z', date: '2026-08-02', name: '甲同學', studentId: 'S1', recordId: 'd' }),
  row({ timestamp: '2026-08-06T08:00:00.000Z', date: '2026-08-06', name: '甲同學', studentId: 'S1', recordId: 'e' })
]);

const identity = { name: '甲同學', studentId: 'S1' };
const legacy7 = g.recordsForIdentity(identity).sort(g.byTimestampDesc).slice(0, 7).map(r => r.recordId);
sheet.reads = [];
const opt7 = g.getRecentRecordsOptimized_(identity, 7).map(r => r.recordId);
const opt30 = g.getRecentRecordsOptimized_(identity, 30).map(r => r.recordId);
const last = g.getLastRecordOptimized_(identity);

t('recent 7 optimized equals legacy order', JSON.stringify(opt7) === JSON.stringify(legacy7), `${opt7} vs ${legacy7}`);
t('recent 30 optimized equals legacy order', JSON.stringify(opt30) === JSON.stringify(legacy7), `${opt30} vs ${legacy7}`);
t('studentId matching wins when present', opt7[0] === 'e' && opt7.includes('c'), opt7.join(','));
t('legacy blank studentId falls back to normalized name', opt7.includes('legacy-name'), opt7.join(','));
t('getLastRecordOptimized returns newest timestamp row', last && last.recordId === 'e', last && last.recordId);
t('optimized read does not read full sheet width for all rows first', sheet.reads.some(r => r.r === 2 && r.nc < H.length), JSON.stringify(sheet.reads));
t('non-contiguous selected rows are grouped, not one full-table read', !sheet.reads.some(r => r.r === 2 && r.nc === H.length && r.nr === sheet.getLastRow() - 1), JSON.stringify(sheet.reads));

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`));
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`);
  process.exit(1);
}
console.log(`\n${results.length}/${results.length} passed`);
