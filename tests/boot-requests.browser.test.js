/* TeamPro 2.0 Phase 6（C-1）回歸測試：開頁請求（真的 Chromium 跑 index.html，後端全攔截）。

   B1 教練開頁不再讀 LINE 狀態；進「系統設定」分頁時才讀（且只讀一次）
   B2 「上次表現」名單的預先載入，在戰情室 records 回應之後才發出（不跟戰情室搶 Apps Script 排隊）
   B3 教練切到「上次表現」分頁仍會載入名單
   B4 選手／家長開頁的請求不受影響（不得出現教練專用的 action） */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const INIT = ({ role }) => {
  localStorage.setItem('yulin_role', JSON.stringify({ role, name: role === 'coach' ? '教練' : '甲同學', authToken: 't',
    studentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }));
  localStorage.setItem('yulin_players', JSON.stringify(['甲同學', '乙同學']));
  window.__log = [];
  const t0 = performance.now();
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    const entry = { action: body.action, days: body.days || null, sentAt: performance.now() - t0, doneAt: null };
    window.__log.push(entry);
    await new Promise(r => setTimeout(r, body.action === 'getCoachDashboard' ? 800 : 200));
    entry.doneAt = performance.now() - t0;
    return new Response(JSON.stringify({ ok: true, data: [], apiVersion: window.APP_VERSION, nextOffset: null }));
  };
};

async function openPage(browser, role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT, { role });
  await page.goto(PAGE_URL);
  await page.waitForTimeout(5000);
  return { page, context, errors };
}
const actions = log => log.map(e => e.action);

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  {
    const { page, context, errors } = await openPage(browser, 'coach');
    const boot = await page.evaluate(() => window.__log.slice());
    const acts = actions(boot);
    t('前置：教練開頁有讀戰情室', acts.indexOf('getCoachDashboard') !== -1, JSON.stringify(acts));
    t('B1 教練開頁沒有讀 LINE 狀態', acts.indexOf('getLineStatus') === -1, JSON.stringify(acts));

    // 戰情室的 records：refreshCoach 用 45 天視窗
    const dash = boot.find(e => e.action === 'getCoachDashboard' && e.days === 45);
    const summary = boot.find(e => e.action === 'getDailyAthleteSummary');
    t('B2 上次表現名單仍會預先載入', !!summary, JSON.stringify(acts));
    t('B2 預先載入在戰情室 records 回應之後才發', !!dash && !!summary && summary.sentAt >= dash.doneAt,
      JSON.stringify({ dash, summary }));

    const settings = await page.evaluate(async () => {
      window.__log = [];
      document.querySelector('.tab-btn[data-tab="settings"]').click();
      await new Promise(r => setTimeout(r, 800));
      document.querySelector('.tab-btn[data-tab="coach"]').click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('.tab-btn[data-tab="settings"]').click();
      await new Promise(r => setTimeout(r, 800));
      return window.__log.map(e => e.action);
    });
    t('B1 進系統設定時讀 LINE 狀態，來回兩次只讀一次', settings.filter(a => a === 'getLineStatus').length === 1, JSON.stringify(settings));

    // 預先載入已在背景完成 → 切到上次表現分頁時名單直接有內容（不是「讀取中」也不是空白）
    const lp = await page.evaluate(async () => {
      document.querySelector('.tab-btn[data-tab="lastperf"]').click();
      await new Promise(r => setTimeout(r, 600));
      const list = document.getElementById('todayReportedList');
      const sum = document.getElementById('lastPerfSummaryRow');
      return { list: list ? list.innerHTML : null, sum: sum ? sum.textContent : null,
        fetched: window.__log.some(e => e.action === 'getDailyAthleteSummary') };
    });
    t('B3 切到上次表現分頁：名單已載入完成（不是讀取中）',
      lp.list !== null && lp.list.indexOf('讀取') === -1 && /已回報/.test(lp.sum || ''), JSON.stringify(lp));
    allErrors.push(...errors); await context.close();
  }

  for (const role of ['student', 'parent']) {
    const { page, context, errors } = await openPage(browser, role);
    const acts = actions(await page.evaluate(() => window.__log.slice()));
    const coachOnly = ['getLineStatus', 'getCoachDashboard', 'getDailyAthleteSummary', 'getKpiManageData', 'getAllAttendanceReports'];
    t('B4 ' + role + ' 開頁沒有教練專用請求', acts.length > 0 && !acts.some(a => coachOnly.indexOf(a) !== -1), JSON.stringify(acts));
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
