/* P0-1：records 歷史資料的 studentId 欄位錯位（2026-08-27 前依位置寫入，8/30 匯出實測 695 列是數字）。
   修正前：選手／家長登入後，studentId 欄有值就只比 studentId → 錯位列整筆被濾掉（約 38% 歷史看不到），
           選手回應自己的舊紀錄也會被判「沒有權限」。
   修正後：只採信長得像帳號 ID 的值（trustedStudentId_），其餘退回姓名比對。
   隱私邊界（SYSTEM_CONTRACT §8）必須維持：看不到別人的、家長欄位遮蔽不變。 */
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

const UA = '11111111-1111-4111-8111-111111111111';   // 甲
const UB = '22222222-2222-4222-8222-222222222222';   // 乙
const UC = '33333333-3333-4333-8333-333333333333';   // 另一位也叫「甲同學」的選手（同名不同帳號）

function build(optimized) {
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  if (!optimized) g.PropertiesService.getScriptProperties().setProperty('USE_OPTIMIZED_RECORD_READ', 'false');
  const H = g.HEADERS;
  const row = f => H.map(h => (h in f ? f[h] : ''));
  const base = (id, day, name, sid, extra) => row(Object.assign({
    recordId: id, timestamp: '2026-08-' + day + 'T01:00:00Z', date: '2026-08-' + day, name: name,
    weightKg: '55', painArea: '腳踝', coachPrivateNote: '私密' }, sid === undefined ? {} : { studentId: sid }, extra || {}));
  ss.add('records', [
    H,
    base('a-uuid',  '20', '甲同學', UA),
    base('a-num',   '19', '甲同學', 12345),                  // 錯位：數字
    base('a-date',  '18', '甲同學', new Date('2026-07-01')), // 錯位：日期
    base('a-text',  '17', '甲同學', '加強旋踢的速度'),       // 錯位：中文句子
    base('a-digit', '16', '甲同學', '20260716'),             // 錯位：純數字字串
    base('a-empty', '15', '甲同學', ''),
    base('b-uuid',  '20', '乙同學', UB),
    base('b-num',   '19', '乙同學', 777),
    base('c-uuid',  '14', '甲同學', UC)                      // 同名不同帳號：甲不可看到
  ]);
  const seed = (tok, s) => g.CacheService.getScriptCache().put('auth:' + tok, JSON.stringify(s));
  seed('stu-a', { role: 'student', studentId: UA, studentName: '甲同學' });
  seed('stu-b', { role: 'student', studentId: UB, studentName: '乙同學' });
  seed('par-a', { role: 'parent', studentId: UA, studentName: '甲同學', consentStatus: 'agreed' });
  seed('coach', { role: 'coach', studentName: '教練' });
  return { g, ss };
}
const ids = res => ((res && res.data) || []).map(r => r.recordId).sort();
const A_ALL = ['a-date', 'a-digit', 'a-empty', 'a-num', 'a-text', 'a-uuid'];

{
  const { g } = build(true);
  const tr = typeof g.trustedStudentId_ === 'function' ? g.trustedStudentId_ : () => '__MISSING__';
  t('trustedStudentId_：UUID 與既有 ID 格式採信', tr(UA) === UA && tr('ST-A') === 'ST-A' && tr('  ST-A ') === 'ST-A', '');
  t('trustedStudentId_：數字／日期／純數字字串／中文／空值一律不採信',
    tr(12345) === '' && tr(new Date()) === '' && tr('20260716') === '' && tr('加強旋踢的速度') === '' && tr('') === '' && tr(null) === '', '');
}

for (const optimized of [true, false]) {
  const tag = optimized ? '[索引路徑]' : '[舊路徑]';
  const { g } = build(optimized);

  const asA = g.authRecordResult({ authToken: 'stu-a', limit: 50 }, 'recent');
  t(tag + ' 選手甲：看得到自己全部 6 筆（含 4 筆錯位列）', asA.ok === true && JSON.stringify(ids(asA)) === JSON.stringify(A_ALL), JSON.stringify(ids(asA)));
  t(tag + ' 選手甲：看不到乙的紀錄（含乙的錯位列）', !ids(asA).some(x => x.startsWith('b-')), JSON.stringify(ids(asA)));
  t(tag + ' 選手甲：看不到同名不同帳號的紀錄', ids(asA).indexOf('c-uuid') === -1, JSON.stringify(ids(asA)));

  const asB = g.authRecordResult({ authToken: 'stu-b', limit: 50 }, 'recent');
  t(tag + ' 選手乙：只看得到自己 2 筆', JSON.stringify(ids(asB)) === JSON.stringify(['b-num', 'b-uuid']), JSON.stringify(ids(asB)));

  const asPA = g.authRecordResult({ authToken: 'par-a', limit: 50 }, 'recent');
  t(tag + ' 家長甲：看得到孩子全部 6 筆', JSON.stringify(ids(asPA)) === JSON.stringify(A_ALL), JSON.stringify(ids(asPA)));
  t(tag + ' 家長甲：敏感欄位仍被遮蔽', (asPA.data || []).length === 6 && asPA.data.every(r => r.weightKg === undefined && r.painArea === undefined && r.coachPrivateNote === undefined), JSON.stringify((asPA.data || [])[0] || {}).slice(0, 160));

  const last = g.authRecordResult({ authToken: 'stu-a' }, 'last');
  t(tag + ' 選手甲：最近一筆是自己的 a-uuid', last.ok === true && last.data && last.data.recordId === 'a-uuid', JSON.stringify(last.data && last.data.recordId));

  const ctx = g.getSubmitContext({ authToken: 'stu-a', date: '2026-08-19', limit: 60 });
  t(tag + ' 送出前比對：錯位的 08-19 那筆也算「今天已填」', ctx.ok === true && ctx.alreadySubmittedToday === true && ctx.recentRecords.length === 6, JSON.stringify({ already: ctx.alreadySubmittedToday, n: (ctx.recentRecords || []).length }));
}

{
  const { g, ss } = build(true);
  const upd = (tok, recordId) => g.updateRecordAuthorized({ authToken: tok, recordId, fields: { studentResponse: '好' } });
  const okOwn = upd('stu-a', 'a-num');
  t('選手甲可以回應自己錯位的舊紀錄', okOwn.ok === true, JSON.stringify(okOwn));
  const sheet = ss.getSheetByName('records');
  const col = sheet.rows[0].indexOf('studentResponse');
  const written = sheet.rows.find(r => r[sheet.rows[0].indexOf('recordId')] === 'a-num');
  t('前置：回應真的寫進 a-num 那一列', col >= 0 && written && written[col] === '好', String(written && written[col]));
  const noB = upd('stu-a', 'b-num');
  t('選手甲不能修改乙的錯位紀錄', noB.ok === false && noB.forbidden === true, JSON.stringify(noB));
  const noC = upd('stu-a', 'c-uuid');
  t('選手甲不能修改同名不同帳號的紀錄', noC.ok === false && noC.forbidden === true, JSON.stringify(noC));
}

{
  const { g } = build(true);
  const s = g.getDailyAthleteSummary({ authToken: 'coach', date: '2026-08-19' });
  const a = ((s && s.athletes) || []).find(x => x.studentName === '甲同學');
  const b = ((s && s.athletes) || []).find(x => x.studentName === '乙同學');
  t('教練摘要：錯位的 studentId 不外送（回 null），姓名照常', s.ok === true && a && a.studentId === null && b && b.studentId === null, JSON.stringify((s && s.athletes) || s).slice(0, 200));
  const s2 = g.getDailyAthleteSummary({ authToken: 'coach', date: '2026-08-20' });
  const a2 = ((s2 && s2.athletes) || []).find(x => x.studentName === '甲同學');
  t('教練摘要：正確的 UUID 照常回傳', a2 && a2.studentId === UA, JSON.stringify(a2 || s2).slice(0, 200));
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
