/* 在 node vm 沙箱裡載入 Code.gs，用假的 SpreadsheetApp 驗證表頭稽核 / append-only 補欄位 / addRecord。 */
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: {
      formatDate: (d, tz, fmt) => new Date(d).toISOString().slice(0, 10),
      computeDigest: () => [1, 2, 3],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      getUuid: () => 'uuid'
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
const t = (name, ok, extra) => results.push({ name, ok, extra });

/* --- 情境 A：教練現行的 records 表（沒有新欄位） --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const oldHeaders = g.HEADERS.filter(h =>
    ['dailyTechnicalScore', 'dailyTacticalScore', 'dailyPhysicalScore', 'dailyMentalScore',
      'dailyAttitudeScore', 'dailyRecoveryScore', 'reflectionMetaJson', 'instrumentVersion',
      'reportUsefulness', 'reportUsefulnessScore', 'reportUsefulnessJson'].indexOf(h) === -1);
  const sheet = ss.add('records', [oldHeaders, oldHeaders.map(() => '')]);
  sheet.rows[1][oldHeaders.indexOf('name')] = '舊選手';
  sheet.rows[1][oldHeaders.indexOf('date')] = '2026-08-01';
  sheet.rows[1][oldHeaders.indexOf('reflection')] = '舊的心得不能被動到';

  // 乾跑
  const dry = g.appendMissingHeaders_(sheet, g.HEADERS, true);
  t('dry-run lists exactly the 11 new columns and writes nothing',
    dry.appended.length === 11 && sheet.rows[0].length === oldHeaders.length,
    dry.appended.join(','));

  // 補欄位前也要能寫入（新欄位被丟掉，但舊資料不能壞）
  const before = g.addRecord({ name: '新選手', date: '2026-08-27', reflection: '補欄位前送出', dailyTechnicalScore: 5 });
  const rowBefore = sheet.rows[2];
  t('addRecord still works before migration (new fields dropped, no corruption)',
    before.ok && rowBefore[oldHeaders.indexOf('name')] === '新選手'
    && rowBefore[oldHeaders.indexOf('reflection')] === '補欄位前送出'
    && rowBefore.length === oldHeaders.length,
    JSON.stringify(before).slice(0, 120));

  // 真的補欄位
  const applied = g.appendMissingHeaders_(sheet, g.HEADERS, false);
  t('apply appends the new columns on the right only',
    applied.appended.length === 11
    && sheet.rows[0].slice(0, oldHeaders.length).join('|') === oldHeaders.join('|')
    && sheet.rows[0][oldHeaders.length] === 'dailyTechnicalScore',
    sheet.rows[0].slice(oldHeaders.length).join(','));
  t('existing data rows untouched by the migration',
    sheet.rows[1][oldHeaders.indexOf('reflection')] === '舊的心得不能被動到',
    sheet.rows[1][oldHeaders.indexOf('reflection')]);

  // 補完欄位後，同一天同一人 upsert 要寫進新欄位
  const after = g.addRecord({
    name: '新選手', date: '2026-08-27', reflection: '補欄位後更新',
    dailyTechnicalScore: 5, dailyRecoveryScore: 'N/A',
    instrumentVersion: 'daily-6-reflection-v1', reportUsefulnessScore: 100
  });
  const hdr = sheet.rows[0];
  const row = sheet.rows[2];
  t('upsert after migration fills the new columns',
    after.ok && after.updated === true
    && row[hdr.indexOf('dailyTechnicalScore')] === 5
    && row[hdr.indexOf('dailyRecoveryScore')] === 'N/A'
    && row[hdr.indexOf('instrumentVersion')] === 'daily-6-reflection-v1'
    && row[hdr.indexOf('reportUsefulnessScore')] === 100,
    JSON.stringify({ updated: after.updated, tech: row[hdr.indexOf('dailyTechnicalScore')] }));
  t('upsert did not duplicate the row', sheet.rows.length === 3, String(sheet.rows.length));

  // 第二次乾跑應該乾淨
  const dry2 = g.appendMissingHeaders_(sheet, g.HEADERS, true);
  t('second dry-run reports nothing missing (idempotent)', dry2.appended.length === 0, dry2.appended.join(','));
}

/* --- 情境 B：舊的中文表頭 --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const cn = ['時間', '日期', '姓名', '今日自我總結', '明天要修正一件事情', '總分', '平均', '狀態判定'];
  const sheet = ss.add('records', [cn]);
  const res = g.addRecord({ name: '中文表頭選手', date: '2026-08-27', reflection: '心得', tomorrowGoal: '目標', totalScore: 18, averageScore: 3.6 });
  const row = sheet.rows[1];
  t('legacy Chinese headers still map through the aliases',
    res.ok && row[cn.indexOf('姓名')] === '中文表頭選手' && row[cn.indexOf('今日自我總結')] === '心得'
    && row[cn.indexOf('明天要修正一件事情')] === '目標' && row[cn.indexOf('總分')] === 18,
    JSON.stringify(row));
  const audit = g.auditHeaders_(sheet, g.HEADERS);
  t('audit tags the legacy sheet as legacy-cn-v1', audit.schemaVariant === 'legacy-cn-v1', audit.schemaVariant);
}

/* --- 情境 C：全新空白試算表 --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const sheet = g.getSheet();           // records 不存在 -> 建立 + 寫表頭
  t('brand-new records sheet gets a header row (appendRow would otherwise eat row 1)',
    sheet.rows.length === 1 && sheet.rows[0][0] === g.HEADERS[0] && sheet.rows[0].length === g.HEADERS.length,
    sheet.rows.length + ' rows');
  const res = g.addRecord({ name: '第一位', date: '2026-08-27' });
  t('first record lands on row 2, not on the header row',
    res.ok && sheet.rows.length === 2 && sheet.rows[1][g.HEADERS.indexOf('name')] === '第一位',
    JSON.stringify(sheet.rows[1] && sheet.rows[1].slice(0, 5)));

  const weekly = g.getWeeklyKpiReportsSheet();
  t('new weekly_kpi_reports sheet also gets its header row',
    weekly.rows.length === 1 && weekly.rows[0].join('|') === g.WEEKLY_KPI_REPORT_HEADERS.join('|'),
    weekly.rows.length + ' rows');
  t('weekly headers include the idempotency column',
    g.WEEKLY_KPI_REPORT_HEADERS.indexOf('idempotencyKey') !== -1, '');
}

/* --- 情境 D：表頭重複要擋下來，不能亂補 --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const dup = g.HEADERS.slice(0, 10).concat(['name']);
  const sheet = ss.add('records', [dup]);
  const res = g.appendMissingHeaders_(sheet, g.HEADERS, false);
  t('duplicate headers make the migration refuse that sheet',
    res.skipped === true && res.appended.length === 0 && sheet.rows[0].length === dup.length,
    res.error || '');
  const add = g.addRecord({ name: 'x', date: '2026-08-27' });
  t('addRecord refuses a sheet with duplicate headers', add.ok === false, add.error || '');
}

/* --- 情境 E：setupSheet 仍然停用 --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const r = g.setupSheet();
  t('setupSheet stays disabled', r.ok === false, r.error);
  t('schemaAudit requires coach auth', g.schemaAudit({}).ok === false, JSON.stringify(g.schemaAudit({})).slice(0, 80));
  t('schemaMigrate requires coach auth', g.schemaMigrate({ apply: true }).ok === false, JSON.stringify(g.schemaMigrate({ apply: true })).slice(0, 80));
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
