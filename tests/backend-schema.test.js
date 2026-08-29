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

/* --- 情境 F：每週五自動開啟 KPI 的閘門 --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  // 沒有任何選手帳號時，必須明確說出原因，而不是靜默什麼都不做
  const gate = g.weeklyKpiGateCheck_();
  t('gate check names the blocking reason instead of failing silently',
    typeof gate.blockedBy === 'string' && gate.blockedBy.length > 0, JSON.stringify(gate));
  t('empty student_accounts is reported as the blocker',
    gate.blockedBy.indexOf('選手帳號') !== -1, gate.blockedBy);
  t('gate reports weekday / weekId / account count for diagnosis',
    !!gate.weekday && !!gate.weekId && gate.activeAccounts === 0, JSON.stringify(gate));

  const run = g.autoOpenWeeklyKpi();
  t('autoOpenWeeklyKpi refuses to create a session when blocked',
    run.ok === false && !!run.skipped, JSON.stringify(run).slice(0, 140));

  t('the coach-facing status action requires coach auth',
    g.getWeeklyKpiAuto({}).ok === false, JSON.stringify(g.getWeeklyKpiAuto({})).slice(0, 80));
  t('toggling auto-open requires coach auth',
    g.setWeeklyKpiAuto({ enabled: false }).ok === false, '');
  t('the manual re-run action requires coach auth',
    g.runWeeklyKpiNow({}).ok === false, '');

  // 關掉開關之後，連日期都不用看就該停手
  g.setProp(g.WEEKLY_KPI_AUTO_PROP, 'false');
  t('the kill switch is honoured', g.weeklyKpiAutoEnabled_() === false, '');
  const off = g.autoOpenWeeklyKpi();
  t('a disabled auto-open reports being switched off',
    off.ok === false && /關閉/.test(off.skipped || ''), JSON.stringify(off).slice(0, 120));
}

/* --- 情境 G：家長權限隔離（隱私邊界，先前零測試） --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const H = g.HEADERS;
  const row = fields => H.map(h => (h in fields ? fields[h] : ''));
  // 兩個家庭的資料放在同一張表
  ss.add('records', [
    H,
    row({ recordId: 'r1', timestamp: '2026-08-28T01:00:00Z', date: '2026-08-28', name: '甲同學',
          studentName: '甲同學', studentId: 'ST-A', weightKg: '55', painArea: '腳踝',
          urineStatus: '深黃', coachPrivateNote: '甲的私密備註', tomorrowGoal: '甲的目標' }),
    row({ recordId: 'r2', timestamp: '2026-08-28T01:00:00Z', date: '2026-08-28', name: '乙同學',
          studentName: '乙同學', studentId: 'ST-B', weightKg: '48', painArea: '手腕',
          urineStatus: '正常', coachPrivateNote: '乙的私密備註', tomorrowGoal: '乙的目標' })
  ]);

  const seedSession = (token, session) =>
    g.CacheService.getScriptCache().put('auth:' + token, JSON.stringify(session));

  // 甲的家長，已完成同意
  seedSession('tok-parent-a', {
    role: 'parent', studentId: 'ST-A', studentName: '甲同學', consentStatus: 'agreed'
  });
  const asParentA = g.authRecordResult({ authToken: 'tok-parent-a', limit: 50 }, 'recent');
  const rows = (asParentA && asParentA.data) || [];
  const names = rows.map(r => String(r.name));

  t('家長讀得到自己孩子的紀錄',
    asParentA.ok === true && names.includes('甲同學'), JSON.stringify({ ok: asParentA.ok, names }));
  t('家長讀不到其他選手的紀錄',
    !names.includes('乙同學'), JSON.stringify(names));
  t('家長拿不到體重／疼痛部位／尿液等敏感欄位',
    rows.every(r => r.weightKg === undefined && r.painArea === undefined && r.urineStatus === undefined),
    JSON.stringify(rows[0] || {}).slice(0, 200));
  t('家長拿不到教練私密備註',
    rows.every(r => r.coachPrivateNote === undefined), JSON.stringify(rows[0] || {}).slice(0, 200));

  // 未完成同意的家長要被擋
  seedSession('tok-parent-noconsent', {
    role: 'parent', studentId: 'ST-A', studentName: '甲同學', consentStatus: 'pending'
  });
  const noConsent = g.authRecordResult({ authToken: 'tok-parent-noconsent', limit: 50 }, 'recent');
  t('尚未完成個資同意的家長讀不到任何資料',
    noConsent.ok === false && noConsent.consentRequired === true, JSON.stringify(noConsent));

  // 沒有 session 一律擋下
  const anon = g.authRecordResult({ limit: 50 }, 'recent');
  t('沒有登入讀不到任何紀錄',
    anon.ok === false && anon.authRequired === true, JSON.stringify(anon));

  // 選手只能讀自己的
  seedSession('tok-student-b', {
    role: 'student', studentId: 'ST-B', studentName: '乙同學'
  });
  const asStudentB = g.authRecordResult({ authToken: 'tok-student-b', limit: 50 }, 'recent');
  const bNames = ((asStudentB && asStudentB.data) || []).map(r => String(r.name));
  t('選手讀不到其他選手的紀錄',
    asStudentB.ok === true && bNames.includes('乙同學') && !bNames.includes('甲同學'),
    JSON.stringify(bNames));
  t('選手看得到自己的完整欄位（不被家長遮蔽規則影響）',
    ((asStudentB.data || [])[0] || {}).weightKg === '48',
    JSON.stringify((asStudentB.data || [])[0] || {}).slice(0, 160));
}

/* --- 情境 H：登入（先前零測試） --- */
{
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  const SA = g.STUDENT_ACCOUNT_HEADERS;
  const CS = g.COACH_SETTING_HEADERS;
  const mk = (H, f) => H.map(h => (h in f ? f[h] : ''));

  // 教練：用模組自己的 hashSecret 產生正確的密碼雜湊當 fixture
  ss.add('coach_settings', [CS, mk(CS, {
    coachId: 'C1', teamId: 'T1',
    coachPasswordHash: g.hashSecret('coach:C1', '正確密碼'), failedLoginCount: 0
  })]);
  // 選手：一個正常帳號、一個尚未啟用、一個已停用
  ss.add('student_accounts', [SA,
    mk(SA, { studentId: 'ST-A', studentName: '甲同學', accountStatus: 'active',
             pinHash: g.hashSecret('pin:ST-A', '2468'), failedLoginCount: 0 }),
    mk(SA, { studentId: 'ST-P', studentName: '待啟用同學', accountStatus: 'pending', failedLoginCount: 0 }),
    mk(SA, { studentId: 'ST-D', studentName: '已停用同學', accountStatus: 'disabled',
             pinHash: g.hashSecret('pin:ST-D', '1357'), failedLoginCount: 0 })
  ]);

  // 教練
  const coachOk = g.coachLogin({ coachPassword: '正確密碼' });
  t('教練：正確密碼可以登入並取得 authToken',
    coachOk.ok === true && !!coachOk.authToken && coachOk.user.role === 'coach',
    JSON.stringify({ ok: coachOk.ok, role: coachOk.user && coachOk.user.role }));
  t('教練：錯誤密碼被擋下',
    g.coachLogin({ coachPassword: '亂猜的' }).ok === false, '');
  t('教練：空密碼被擋下',
    g.coachLogin({ coachPassword: '' }).ok === false, '');

  // 登入成功的 token 真的能通過 requireRole
  const gate = g.schemaAudit({ authToken: coachOk.authToken });
  t('教練 token 可通過 requireRole（登入與授權確實接得起來）',
    gate.ok === true, JSON.stringify(gate).slice(0, 100));

  // 選手
  const stuOk = g.studentLogin({ studentName: '甲同學', pin: '2468' });
  t('選手：正確 PIN 可以登入，session 帶正確的 studentId',
    stuOk.ok === true && stuOk.user.studentId === 'ST-A' && stuOk.user.role === 'student',
    JSON.stringify({ ok: stuOk.ok, sid: stuOk.user && stuOk.user.studentId }));
  t('選手：錯誤 PIN 被擋下',
    g.studentLogin({ studentName: '甲同學', pin: '0000' }).ok === false, '');
  t('選手：用別人的姓名配自己的 PIN 也進不去',
    g.studentLogin({ studentName: '已停用同學', pin: '2468' }).ok === false, '');
  t('選手：不存在的姓名被擋下',
    g.studentLogin({ studentName: '查無此人', pin: '2468' }).ok === false, '');

  const pending = g.studentLogin({ studentName: '待啟用同學', pin: '2468' });
  t('選手：尚未啟用的帳號被擋，並明確要求啟用',
    pending.ok === false && pending.activationRequired === true, JSON.stringify(pending));
  t('選手：已停用的帳號即使 PIN 正確也進不去',
    g.studentLogin({ studentName: '已停用同學', pin: '1357' }).ok === false, '');

  // 連續錯誤要鎖定
  let locked = null;
  for (let i = 0; i < g.LOGIN_MAX_FAILURES + 1; i++) {
    locked = g.studentLogin({ studentName: '甲同學', pin: '9999' });
  }
  t('選手：連續錯誤達上限後帳號被鎖定',
    locked.ok === false && locked.locked === true, JSON.stringify(locked));
  t('選手：鎖定期間即使輸入正確 PIN 也進不去',
    g.studentLogin({ studentName: '甲同學', pin: '2468' }).ok === false, '');

  // 家長：以孩子姓名 + 手機後四碼登入
  const PH = g.PARENT_HEADERS;
  ss.add('parents', [PH,
    mk(PH, { parentId: 'P1', parentName: '甲媽媽', studentName: '甲同學', studentId: 'ST-A',
             parentPhone: '0912345678', parentPhoneLast4: '5678', bindStatus: 'verified',
             consentStatus: 'agreed', failedLoginCount: 0 }),
    mk(PH, { parentId: 'P2', parentName: '未綁定家長', studentName: '待啟用同學', studentId: 'ST-P',
             parentPhone: '0987654321', parentPhoneLast4: '4321', bindStatus: 'pending',
             consentStatus: 'agreed', failedLoginCount: 0 })
  ]);

  const parentOk = g.parentLogin({ studentName: '甲同學', parentPhoneLast4: '5678' });
  t('家長：正確後四碼可以登入，session 綁到正確的孩子',
    parentOk.ok === true && parentOk.user.studentId === 'ST-A' && parentOk.user.role === 'parent',
    JSON.stringify({ ok: parentOk.ok, sid: parentOk.user && parentOk.user.studentId }));
  t('家長：錯誤後四碼被擋下',
    g.parentLogin({ studentName: '甲同學', parentPhoneLast4: '0000' }).ok === false, '');
  t('家長：後四碼格式不對（非四位數字）被擋下',
    g.parentLogin({ studentName: '甲同學', parentPhoneLast4: '56' }).ok === false, '');
  t('家長：尚未完成綁定驗證的帳號進不去',
    g.parentLogin({ studentName: '待啟用同學', parentPhoneLast4: '4321' }).ok === false, '');
  t('家長：查無此孩子被擋下',
    g.parentLogin({ studentName: '查無此人', parentPhoneLast4: '5678' }).ok === false, '');

  // 家長登入拿到的 token，讀到的必須只有自己孩子的資料
  ss.add('records', [g.HEADERS,
    g.HEADERS.map(h => ({ recordId: 'r1', timestamp: '2026-08-28T01:00:00Z', date: '2026-08-28',
      name: '甲同學', studentName: '甲同學', studentId: 'ST-A', weightKg: '55' }[h] || '')),
    g.HEADERS.map(h => ({ recordId: 'r2', timestamp: '2026-08-28T01:00:00Z', date: '2026-08-28',
      name: '已停用同學', studentName: '已停用同學', studentId: 'ST-D', weightKg: '48' }[h] || ''))
  ]);
  const viaLogin = g.authRecordResult({ authToken: parentOk.authToken, limit: 50 }, 'recent');
  const viaNames = ((viaLogin && viaLogin.data) || []).map(r => String(r.name));
  t('家長用真正登入取得的 token，仍然只讀得到自己孩子',
    viaLogin.ok === true && viaNames.includes('甲同學') && !viaNames.includes('已停用同學'),
    JSON.stringify(viaNames));
}

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
