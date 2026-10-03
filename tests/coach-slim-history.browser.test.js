/* TeamPro 2.0 Phase 4：教練戰情室 slimHistory 等價性測試。
   用真的 Code.gs（node 沙箱）產生完整版與瘦身版回應，再餵給真的 index.html（Chromium）跑 refreshCoach，
   戰情室每個區塊的 HTML 必須逐字相同。另有敏感度測試：故意拿掉關鍵歷史欄位時必須抓得到差異。 */
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


/* ---------------- 測試本體 ---------------- */
const { chromium } = require('playwright');
const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra) => results.push({ name, ok: ok === true, extra });

// 可重現的亂數
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const PLAYERS = ['甲同學', '乙同學', '丙同學', '丁同學', '戊同學', '己同學', '庚同學', '辛同學', '壬同學', '癸同學'];
const ASPECTS = ['technical', 'tactical', 'physical', 'focus', 'discipline', 'emotion'];

function shift(date, n) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* 造一份「每個欄位都有值、各種分支都踩得到」的 45 天資料。
   刻意讓：連續疼痛、連續睡眠差、連續水量少、連續宵夜、連續低情緒／技術、
   體重跳動、同細項連 3 筆低、紅黃燈連續、補填（同日兩筆）、缺天 都會出現。 */
function makeRecords(fields, focus, seed) {
  const R = rng(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  const recs = [];
  let id = 0;
  PLAYERS.forEach((name, pi) => {
    for (let back = 44; back >= -1; back--) {
      if (R() < 0.18 && back > 1) continue;                 // 缺天
      // 奇數號選手焦點日前 3 天與後 1 天沒交：連續判斷必須往回讀到「瘦身過的歷史列」，
      // 否則敏感度測試碰不到瘦身列（焦點 ±1 天的列本來就是完整的）
      if (pi % 2 === 1 && (back === -1 || (back >= 1 && back <= 3))) continue;
      const date = shift(focus, -back);
      const streaky = back <= 6 && pi % 3 === 0;            // 部分選手最近幾天狀況差
      const o = {};
      fields.forEach(f => { o[f] = 'x-' + f + '-' + Math.floor(R() * 1000); });   // 其他欄位也有值
      Object.assign(o, {
        recordId: 'rec-' + (++id), name, studentName: name, studentId: 'sid-' + pi,
        date, timestamp: date + 'T' + String(8 + Math.floor(R() * 12)).padStart(2, '0') + ':00:00.000Z',
        status: streaky ? pick(['黃燈', '紅燈']) : pick(['綠燈', '綠燈', '黃燈', '紅燈']),
        readinessStatusLight: streaky ? pick(['紅燈 關懷日', '橘燈 保護日']) : pick(['綠燈 強化日', '綠燈 穩定日', '黃燈 調整日', '橘燈 保護日', '紅燈 關懷日']),
        finalReadinessScore: String(streaky ? 30 + Math.floor(R() * 20) : 40 + Math.floor(R() * 60)),
        sleepHours: String(streaky ? 5 : 5 + Math.floor(R() * 5)),
        sleepQuality: streaky ? '差' : pick(['好', '普通', '差']),
        moodIndex: String(streaky ? 1 + Math.floor(R() * 2) : 1 + Math.floor(R() * 5)),
        emotionIndex: String(1 + Math.floor(R() * 5)),
        rpe: String(streaky ? 8 + Math.floor(R() * 3) : 3 + Math.floor(R() * 8)),
        painScore: String(streaky ? 4 + Math.floor(R() * 7) : Math.floor(R() * 8)),
        injuryArea: pick(['腳踝', '膝蓋', '大腿後側', '']),
        bodyStatus: streaky ? pick(['受傷中', '疲勞']) : pick(['良好', '普通', '疲勞', '不舒服', '受傷中']),
        urineStatus: pick(['透明', '淡黃', '深黃', '琥珀色']),
        waterIntake: streaky ? '少於 500ml' : pick(['少於 500ml', '500-1000ml', '1000-1500ml', '1500ml 以上']),
        lateNightSnack: streaky ? '有，偏多' : pick(['無', '無', '有，少量', '有，偏多']),
        emotionAvg: String(streaky ? 1 + R() * 1.5 : 1 + R() * 4),
        technicalAvg: String(streaky ? 1 + R() * 1.5 : 1 + R() * 4),
        weightKg: String(45 + pi * 3 + (R() < 0.15 ? 2.5 : R())),
        trainingIntensity: pick(['低', '中', '高', '比賽日']),
        nutritionRisks: pick(['無明顯風險', '恢復不足', '蛋白質不足、恢復不足']),
        coachRiskScore: String(1 + Math.floor(R() * 5)),
        coachScore: String(1 + Math.floor(R() * 5)),
        aiTags: pick(['', '需要關心', '受傷風險', '脫水風險', '高風險硬撐', '睡眠不足']),
        group: pick(['跆拳道對練', '跆拳道品勢', '散打'])
      });
      const raw = {};
      ASPECTS.forEach(a => { raw[a] = { ['細項' + a + '1']: streaky ? 2 : 1 + Math.floor(R() * 5), ['細項' + a + '2']: 1 + Math.floor(R() * 5) }; });
      o.rawScoresJson = JSON.stringify(raw);
      recs.push(o);
      if (R() < 0.08) {                                      // 同一天補填第二筆（較晚）
        const o2 = Object.assign({}, o, { recordId: 'rec-' + (++id), timestamp: date + 'T23:30:00.000Z', painScore: String(Math.floor(R() * 10)) });
        recs.push(o2);
      }
    }
  });
  // 日期讀不出來的列（應被當成焦點列，完整回傳）
  const odd = {}; fields.forEach(f => { odd[f] = 'odd-' + f; });
  Object.assign(odd, { recordId: 'rec-odd', name: PLAYERS[0], studentName: PLAYERS[0], date: '', timestamp: '' });
  recs.push(odd);
  return recs;
}

function backendResponses(focus, seed, mutateHistoryFields) {
  const ss = new FakeSpreadsheet();
  const g = load(ss);
  if (mutateHistoryFields) mutateHistoryFields(g);
  const H = g.HEADERS;
  const recs = makeRecords(g.COACH_DASHBOARD_FIELDS, focus, seed);
  ss.add('records', [H].concat(recs.map(o => H.map(h => (h in o ? o[h] : '')))));
  g.CacheService.getScriptCache().put('auth:coach', JSON.stringify({ role: 'coach', studentName: '教練' }));
  const collect = slim => {
    const pages = [];
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const body = { authToken: 'coach', date: focus, days: 45, paged: true, offset };
      if (slim) body.slimHistory = true;
      const res = g.getCoachDashboard(body);
      pages.push(JSON.parse(JSON.stringify(res)));
      if (res.nextOffset === null || res.nextOffset === undefined) break;
      offset = res.nextOffset;
    }
    return pages;
  };
  return { full: collect(false), slim: collect(true), recs };
}

const SECTIONS = ['coachOverview', 'coachTodayGroups', 'coachSubmitStatus', 'coachRedLight', 'coachQuickScoreList',
  'coachReadinessOverview', 'coachReadinessGroups', 'coachRiskTracking', 'coachNutrition', 'coachAttendanceReports',
  'coachWarRoomGrid', 'coachMood', 'coachStatusLists', 'coachAnalysis', 'coachAlerts', 'coachInterview'];

async function renderWith(browser, pages, focus) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(({ pages, players }) => {
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 'coach' }));
    localStorage.setItem('yulin_players', JSON.stringify(players));
    window.__dashCalls = [];
    const origFetch = window.fetch;
    window.fetch = async (url, opt) => {
      if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
      const body = JSON.parse((opt && opt.body) || '{}');
      let payload;
      if (body.action === 'getCoachDashboard') {
        window.__dashCalls.push({ offset: body.offset || 0, slim: body.slimHistory === true });
        payload = pages.find(p => (p.offset || 0) === (body.offset || 0)) || pages[0];
      } else payload = { ok: true, data: [] };
      return new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, payload)));
    };
  }, { pages, players: PLAYERS });
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof refreshCoach === 'function');
  await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
  const out = await page.evaluate(async ({ focus, SECTIONS }) => {
    const d = document.getElementById('coachDate');
    d.value = focus;
    window.__dashCalls = [];
    await refreshCoach();
    const html = {};
    SECTIONS.forEach(id => { const el = document.getElementById(id); html[id] = el ? el.innerHTML : null; });
    let wr = null;
    try { wr = JSON.stringify(_warRoomLists); } catch (e) { wr = 'n/a'; }
    return { html, wr, calls: window.__dashCalls.slice(), dateOk: d.value === focus };
  }, { focus, SECTIONS });
  await context.close();
  return Object.assign(out, { errors });
}

const diffSections = (a, b) => SECTIONS.filter(id => a.html[id] !== b.html[id]).concat(a.wr !== b.wr ? ['_warRoomLists'] : []);

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];
  const FOCI = [['2026-09-20', 11], ['2026-09-03', 29]];

  for (const [focus, seed] of FOCI) {
    const { full, slim, recs } = backendResponses(focus, seed);
    const size = pages => pages.reduce((s, p) => s + Buffer.byteLength(JSON.stringify(p)), 0);
    t(focus + '｜後端：slim 回應比完整版小一半以上', size(slim) < size(full) * 0.5, size(full) + ' -> ' + size(slim));
    t(focus + '｜後端：slim 回應有標記 slimHistory', slim.every(p => p.slimHistory === true) && full.every(p => !p.slimHistory), '');

    const slimRows = [].concat(...slim.map(p => p.data));
    const fullRows = [].concat(...full.map(p => p.data));
    t(focus + '｜後端：列數與順序完全相同（只少欄位不少列）',
      JSON.stringify(slimRows.map(r => r.recordId)) === JSON.stringify(fullRows.map(r => r.recordId)), slimRows.length + ' vs ' + fullRows.length);
    const nearFocus = r => [shift(focus, -1), focus, shift(focus, 1)].indexOf(String(r.date).slice(0, 10)) !== -1;
    const focusRowsSame = fullRows.every((r, i) => !nearFocus(r) || JSON.stringify(r) === JSON.stringify(slimRows[i]));
    t(focus + '｜後端：焦點日期 ±1 天的列完整回傳', focusRowsSame && fullRows.some(nearFocus), '');
    const odd = slimRows.find(r => r.recordId === 'rec-odd');
    t(focus + '｜後端：日期讀不出來的列完整回傳（寧可多給）', !!odd && Object.keys(odd).length === Object.keys(fullRows.find(r => r.recordId === 'rec-odd')).length, JSON.stringify(odd && Object.keys(odd).length));
    const histRow = slimRows.find(r => !nearFocus(r) && r.recordId !== 'rec-odd');
    {
      const g0 = load(new FakeSpreadsheet());
      t(focus + '｜後端：焦點視窗跨月／跨年／閏年正確',
        g0.focusShiftDate_('2026-09-30', 1) === '2026-10-01' && g0.focusShiftDate_('2027-01-01', -1) === '2026-12-31' &&
        g0.focusShiftDate_('2028-02-28', 1) === '2028-02-29' && g0.focusShiftDate_('bad', 1) === 'bad', '');
    }
    t(focus + '｜後端：歷史列確實被瘦身', !!histRow && !('nutritionAdviceCoach' in histRow) && 'painScore' in histRow, JSON.stringify(histRow && Object.keys(histRow)));

    const a = await renderWith(browser, full, focus);
    const b = await renderWith(browser, slim, focus);
    allErrors.push(...a.errors, ...b.errors);
    t(focus + '｜前置：日期設定成功且兩次都打到 getCoachDashboard', a.dateOk && b.dateOk && a.calls.length >= 1 && b.calls.length >= 1, JSON.stringify([a.calls, b.calls]));
    t(focus + '｜前端：refreshCoach 會帶 slimHistory', b.calls.every(c => c.slim === true), JSON.stringify(b.calls));
    const nonEmpty = SECTIONS.filter(id => a.html[id] && a.html[id].length > 40);
    t(focus + '｜前置：大部分區塊有實際內容（不是空畫面比空畫面）', nonEmpty.length >= 12, nonEmpty.join(','));
    const alertsHtml = a.html.coachAlerts || '', interviewHtml = a.html.coachInterview || '';
    t(focus + '｜前置：連續警示與晤談名單有被觸發', /連續/.test(alertsHtml) && /連續|最近 3 筆|體重/.test(interviewHtml), '');
    const diff = diffSections(a, b);
    t(focus + '｜教練戰情室每個區塊：完整資料與瘦身資料畫出來逐字相同', diff.length === 0, diff.join(','));
  }

  /* 敏感度：故意從歷史欄位拿掉幾個關鍵欄位，比對必須抓得到差異（證明上面的比對不是假通過） */
  // moodIndex 不列入：昨天在 ±1 天焦點範圍內是完整列，2 天連續心情判斷碰不到瘦身列（仍保守保留在欄位清單）
  const SENSITIVE = ['painScore', 'rawScoresJson', 'lateNightSnack', 'status', 'sleepHours', 'emotionAvg', 'weightKg', 'bodyStatus', 'waterIntake'];
  for (const field of SENSITIVE) {
    const focus = '2026-09-20';
    const { full, slim } = backendResponses(focus, 11, g => {
      g.COACH_HISTORY_FIELDS.splice(g.COACH_HISTORY_FIELDS.indexOf(field), 1);
    });
    const a = await renderWith(browser, full, focus);
    const b = await renderWith(browser, slim, focus);
    t('敏感度｜拿掉歷史欄位 ' + field + ' 時比對會發現差異', diffSections(a, b).length > 0, '沒有任何區塊不同 → 測試資料沒踩到這個欄位');
  }

  await browser.close();
  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + String(r.extra).slice(0, 300))));
  console.log('');
  if (allErrors.length) { console.log('PAGE ERRORS:'); allErrors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failedN = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failedN) + '/' + results.length + ' passed');
  process.exit(failedN || allErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
