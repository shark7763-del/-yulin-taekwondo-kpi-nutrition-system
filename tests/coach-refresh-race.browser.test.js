/* TeamPro 2.0 Phase 4 回歸測試：教練戰情室 refreshCoach（真的 Chromium 跑 index.html，後端全攔截）。

   P. 並行（P1-b）：特質、風險處理紀錄、教練簡評、records 同時發出，
      records 不必等特質回來；總時間接近最慢的那一支，不是相加。
   R. 連續切日期（J-2）：先查 A（慢）再查 B（快），A 較晚回來時不可渲染、不可蓋掉 B。
   F. 失敗路徑不變：records 讀取失敗時仍顯示錯誤；特質讀取失敗不讓整個後台中斷。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const DAY_A = '2026-09-10';
const DAY_B = '2026-09-11';

const INIT = () => {
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 'coach' }));
  localStorage.setItem('yulin_players', JSON.stringify(['甲同學', '乙同學']));
  window.__log = [];
  window.__delay = {};          // action 或 action@date -> ms
  window.__fail = {};           // action -> true
  const t0 = performance.now();
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    const entry = { action: body.action, date: body.date || '', sentAt: performance.now() - t0, doneAt: null };
    window.__log.push(entry);
    const ms = window.__delay[body.action + '@' + body.date] || window.__delay[body.action] || 0;
    if (ms) await new Promise(r => setTimeout(r, ms));
    entry.doneAt = performance.now() - t0;
    if (window.__fail[body.action]) throw new TypeError('Failed to fetch');
    let payload;
    if (body.action === 'getCoachDashboard') {
      // A 那天只有甲交、B 那天只有乙交 —— 畫面上看得出是哪一天的結果
      const who = body.date === '2026-09-10' ? '甲同學' : '乙同學';
      payload = { ok: true, fields: ['recordId', 'name', 'date', 'timestamp', 'status'], nextOffset: null,
        data: [{ recordId: 'r-' + body.date, name: who, date: body.date, timestamp: body.date + 'T01:00:00.000Z', status: '綠燈' }] };
    } else if (body.action === 'getAllStudentTraits') {
      payload = { ok: true, traits: [] };
    } else payload = { ok: true, data: [] };
    return new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, payload)));
  };
};

async function openPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof refreshCoach === 'function' && window.TraitRadar);
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
  return { page, context, errors };
}

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  /* P：特質延遲 1.5 秒、records 延遲 1 秒 → 應該並行 */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async (day) => {
      window.TraitRadar.loadCache && window.TraitRadar.clearCache && window.TraitRadar.clearCache();
      document.getElementById('coachDate').value = day;
      window.__delay = { getAllStudentTraits: 1500, getCoachDashboard: 1000, getCoachScores: 1000, getAllAppData: 1000 };
      window.__log = [];
      const t0 = performance.now();
      await refreshCoach();
      const ms = performance.now() - t0;
      const first = a => window.__log.find(e => e.action === a);
      return { ms, trait: first('getAllStudentTraits'), dash: first('getCoachDashboard'), scores: first('getCoachScores'),
        overview: document.getElementById('coachOverview').innerHTML.length };
    }, DAY_A);
    t('P 前置：records 與教練簡評都有發出', !!r.dash && !!r.scores, JSON.stringify(r));
    t('P records 在特質回應前就發出（不再依序等待）',
      !!r.dash && (!r.trait || r.dash.sentAt < r.trait.doneAt), JSON.stringify({ dash: r.dash, trait: r.trait }));
    t('P 教練簡評在 records 回應前就發出', !!r.scores && !!r.dash && r.scores.sentAt < r.dash.doneAt, JSON.stringify({ scores: r.scores, dash: r.dash }));
    t('P 總時間接近最慢的一支（< 2.6 秒，依序約 4.5 秒）', r.ms < 2600, String(Math.round(r.ms)));
    t('P 畫面有渲染', r.overview > 0, String(r.overview));
    allErrors.push(...errors); await context.close();
  }

  /* R：A 慢（2 秒）、B 快；最後畫面必須是 B，A 不可渲染 */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async ({ A, B }) => {
      const seen = [];
      const orig = window.renderOverview;
      window.renderOverview = function (todays) { seen.push((todays || []).map(x => x.name).join(',')); return orig.apply(this, arguments); };
      window.__delay = { ['getCoachDashboard@' + A]: 2000 };
      const d = document.getElementById('coachDate');
      d.value = A;
      const pA = refreshCoach();
      await new Promise(r => setTimeout(r, 150));
      d.value = B;
      const pB = refreshCoach();
      await Promise.all([pA, pB]);
      await new Promise(r => setTimeout(r, 200));
      const aSent = window.__log.some(e => e.action === 'getCoachDashboard' && e.date === A);
      return { seen, aSent, dateOk: d.value === B };
    }, { A: DAY_A, B: DAY_B });
    t('R 前置：A 的請求確實有發出、日期設定成功', r.aSent && r.dateOk, JSON.stringify(r));
    t('R B 有被渲染', r.seen.indexOf('乙同學') !== -1, JSON.stringify(r.seen));
    t('R A 較晚回來，沒有被渲染（不會蓋掉 B）', r.seen.indexOf('甲同學') === -1, JSON.stringify(r.seen));
    allErrors.push(...errors); await context.close();
  }

  /* F1：records 讀取失敗 → 錯誤留在畫面上（行為不變） */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async (day) => {
      document.getElementById('coachDate').value = day;
      window.__fail = { getCoachDashboard: true, getAllRecords: true };
      if (window.resetBackendCircuit) resetBackendCircuit();
      await refreshCoach();
      const ids = COACH_LOAD_ERROR_BOXES;
      const shown = ids.filter(id => { const b = document.getElementById(id); return b && b.innerHTML.indexOf('這裡是空的，因為資料沒讀進來') !== -1; });
      return { shown: shown.length > 0, ids, hits: shown };
    }, DAY_A);
    t('F1 records 失敗時錯誤橫幅仍顯示', r.shown, JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  /* F2：特質讀取失敗 → 後台照常渲染 */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async (day) => {
      document.getElementById('coachDate').value = day;
      const orig = window.TraitRadar.loadCache;
      window.TraitRadar.loadCache = () => Promise.reject(new Error('trait down'));
      let threw = false;
      try { await refreshCoach(); } catch (e) { threw = true; }
      window.TraitRadar.loadCache = orig;
      return { threw, overview: document.getElementById('coachOverview').innerHTML.length };
    }, DAY_B);
    t('F2 特質讀取失敗不讓 refreshCoach 中斷', !r.threw && r.overview > 0, JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  await browser.close();
  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
  console.log('');
  if (allErrors.length) { console.log('PAGE ERRORS:'); allErrors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failedN = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failedN) + '/' + results.length + ' passed');
  process.exit(failedN || allErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
