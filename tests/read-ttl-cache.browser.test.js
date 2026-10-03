/* TeamPro 2.0 Phase 2 回歸測試：短 TTL 讀取快取（H-1～H-4）。
   真的 Chromium 跑 index.html，script.google.com 全部在頁內攔截。

   E. 效益：家長重進分頁、選手來回切分頁、教練進 coach 分頁，白名單內的讀取不再重打
   S. 安全：寫入清快取（含寫入期間飛出去的舊讀取不准回存）、失敗不快取、換人不共用、
      逾時會重抓、呼叫端改回傳物件改不到快取、白名單外的 action 不受影響 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const INIT = (opts) => {
  window.__log = [];
  window.__delay = {};          // action -> ms
  window.__failOnce = {};       // action -> true：下一次回 ok:false
  window.__starEnabled = true;
  // 走真正的分頁按鈕：kpi-session.js 掛在 .tab-btn 的 click 上，不是 switchTab
  window.clickTab = (tab) => {
    const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (!b) throw new Error('找不到分頁按鈕 ' + tab);
    b.click();
  };
  if (opts.bootRole) localStorage.setItem('yulin_role', JSON.stringify(opts.bootRole));
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__log.push({ action: body.action, name: body.name || body.studentName || '', limit: body.limit || '' });
    const ms = window.__delay[body.action] || 0;
    if (ms) await new Promise(r => setTimeout(r, ms));
    let payload;
    if (window.__failOnce[body.action]) {
      delete window.__failOnce[body.action];
      payload = { ok: false, error: 'temporary' };
    } else if (body.action === 'getStudentKpiSession') {
      payload = { ok: true, state: 'none', message: '本週沒有 KPI' };
    } else if (body.action === 'getStarConfig') {
      payload = { ok: true, data: { enabled: window.__starEnabled } };
    } else if (body.action === 'setStarConfig') {
      window.__starEnabled = !!body.enabled;
      payload = { ok: true };
    } else if (body.action === 'getKpiManageData') {
      payload = { ok: true, sessions: [], students: [] };
    } else payload = { ok: true, data: [] };
    return new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, payload)));
  };
};

async function openPage(browser, opts) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT, opts || {});
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof postToWebApp === 'function' && typeof switchTab === 'function' && typeof setRole === 'function');
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));   // 開頁的背景讀取沉澱
  return { page, context, errors };
}

const count = (action) => window.__log.filter(e => e.action === action).length;

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  /* E1 家長：開頁每支最多一次；來回進出家長分頁 3 次 +0 */
  {
    const { page, context, errors } = await openPage(browser, {
      bootRole: { role: 'parent', name: '選手1', authToken: 'p-token' } });
    const r = await page.evaluate(async () => {
      const c = a => window.__log.filter(e => e.action === a).length;
      const A = ['getAttendanceReportsByName', 'getRecentRecordsByName', 'getMentalParticipantPlan'];
      const boot = A.map(c);
      // 同 action 同參數不可出現兩次（getRecentRecordsByName 有 90 / 180 兩種 limit，屬於不同請求）
      const keys = window.__log.filter(e => A.indexOf(e.action) !== -1).map(e => e.action + '|' + e.name + '|' + e.limit);
      const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
      for (let i = 0; i < 3; i++) { clickTab('parent'); await new Promise(r => setTimeout(r, 300)); }
      return { boot, dup, after: A.map(c) };
    });
    t('E1 前置：家長開頁三支都有打到後端', r.boot.every(n => n >= 1), JSON.stringify(r));
    t('E1 家長開頁：同參數的請求不重複（原本各兩次）', r.dup.length === 0, JSON.stringify(r));
    t('E1 家長重進分頁 3 次：+0 請求（原本每次 +3）', JSON.stringify(r.boot) === JSON.stringify(r.after), JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  /* E2 選手：student / lastperf 來回切 3 輪，getStudentKpiSession 不增加 */
  {
    const { page, context, errors } = await openPage(browser, {
      bootRole: { role: 'student', name: '選手2', authToken: 's-token', studentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } });
    const r = await page.evaluate(async () => {
      const c = () => window.__log.filter(e => e.action === 'getStudentKpiSession').length;
      const boot = c();
      for (let i = 0; i < 3; i++) {
        clickTab('lastperf'); await new Promise(r => setTimeout(r, 200));
        clickTab('student'); await new Promise(r => setTimeout(r, 200));
      }
      return { boot, after: c() };
    });
    t('E2 前置：選手開頁有確認 KPI 開放狀態', r.boot >= 1, JSON.stringify(r));
    t('E2 選手切分頁 3 輪：getStudentKpiSession +0（原本每次 +1）', r.after === r.boot, JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  /* E3 教練：進 coach 分頁不再重抓開頁剛抓過的三支 */
  {
    const { page, context, errors } = await openPage(browser, {
      bootRole: { role: 'coach', name: '教練', authToken: 'c-token' } });
    const r = await page.evaluate(async () => {
      const A = ['getKpiManageData', 'getMentalCoachDashboard', 'getKpiSessions'];
      const c = a => window.__log.filter(e => e.action === a).length;
      // 先讓三支都進過快取（開頁不一定三支都打）
      for (const a of A) await postToWebApp({ action: a });
      const before = A.map(c);
      clickTab('settings'); await new Promise(r => setTimeout(r, 200));
      clickTab('coach'); await new Promise(r => setTimeout(r, 800));
      return { before, after: A.map(c) };
    });
    t('E3 教練進 coach 分頁：三支 +0', JSON.stringify(r.before) === JSON.stringify(r.after), JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  /* S 系列：直接打 postToWebApp 驗規則 */
  {
    const { page, context, errors } = await openPage(browser, {
      bootRole: { role: 'coach', name: '教練', authToken: 'c-token' } });
    const r = await page.evaluate(async () => {
      const c = a => window.__log.filter(e => e.action === a).length;
      const out = {};
      if (window.clearReadTtlCache) clearReadTtlCache();

      // S1 命中
      let n0 = c('getStarConfig');
      await postToWebApp({ action: 'getStarConfig' });
      await postToWebApp({ action: 'getStarConfig' });
      out.s1 = c('getStarConfig') - n0;

      // S2 寫入後必須重抓，且拿到新值
      n0 = c('getStarConfig');
      await postToWebApp({ action: 'setStarConfig', enabled: false });
      const afterWrite = await postToWebApp({ action: 'getStarConfig' });
      out.s2 = { calls: c('getStarConfig') - n0, enabled: afterWrite.data.enabled };

      // S3 寫入期間已飛出去的舊讀取：回來後不准存進快取
      if (window.clearReadTtlCache) clearReadTtlCache();
      window.__delay.getStarConfig = 400;
      const slowRead = postToWebApp({ action: 'getStarConfig' });          // 讀到 enabled=false（舊值）
      await new Promise(r => setTimeout(r, 50));
      const write = postToWebApp({ action: 'setStarConfig', enabled: true });
      await Promise.all([slowRead, write]);
      window.__delay.getStarConfig = 0;
      n0 = c('getStarConfig');
      const fresh = await postToWebApp({ action: 'getStarConfig' });
      out.s3 = { calls: c('getStarConfig') - n0, enabled: fresh.data.enabled };

      // S4 失敗回應不快取
      if (window.clearReadTtlCache) clearReadTtlCache();
      window.__failOnce.getKpiSessions = true;
      n0 = c('getKpiSessions');
      const bad = await postToWebApp({ action: 'getKpiSessions' });
      const good = await postToWebApp({ action: 'getKpiSessions' });
      out.s4 = { calls: c('getKpiSessions') - n0, bad: bad.ok, good: good.ok };

      // S5 呼叫端改回傳物件，改不到快取
      const a1 = await postToWebApp({ action: 'getKpiSessions' });
      a1.data.push('污染'); a1.ok = 'mutated';
      const a2 = await postToWebApp({ action: 'getKpiSessions' });
      out.s5 = { ok: a2.ok, len: a2.data.length };

      // S6 換人登入：不共用（setRole 清空，且 key 含身分）
      n0 = c('getStarConfig');
      await postToWebApp({ action: 'getStarConfig' });
      setRole('parent', '選手9', { authToken: 'other' });
      await postToWebApp({ action: 'getStarConfig' });
      out.s6 = c('getStarConfig') - n0;
      setRole('coach', '教練', { authToken: 'c-token' });

      // S7 超過 60 秒重抓
      if (window.clearReadTtlCache) clearReadTtlCache();
      n0 = c('getStarConfig');
      await postToWebApp({ action: 'getStarConfig' });
      const realNow = Date.now;
      Date.now = () => realNow() + 61000;
      await postToWebApp({ action: 'getStarConfig' });
      Date.now = realNow;
      out.s7 = c('getStarConfig') - n0;

      // S8 白名單外（getRoster）不快取；教練「重新整理」會清空
      n0 = c('getRoster');
      await postToWebApp({ action: 'getRoster' });
      await postToWebApp({ action: 'getRoster' });
      out.s8 = c('getRoster') - n0;
      await postToWebApp({ action: 'getStarConfig' });
      resetBackendCircuit();
      out.s8size = window.getReadTtlCacheSize ? getReadTtlCacheSize() : -1;

      // S10 getRecentRecordsByName：教練不快取（要盯誰剛交），家長才快取
      if (window.clearReadTtlCache) clearReadTtlCache();
      n0 = c('getRecentRecordsByName');
      await postToWebApp({ action: 'getRecentRecordsByName', name: '甲', limit: 40 });
      await postToWebApp({ action: 'getRecentRecordsByName', name: '甲', limit: 40 });
      out.s10coach = c('getRecentRecordsByName') - n0;
      setRole('parent', '甲', { authToken: 'p2' });
      n0 = c('getRecentRecordsByName');
      await postToWebApp({ action: 'getRecentRecordsByName', name: '甲', limit: 90 });
      await postToWebApp({ action: 'getRecentRecordsByName', name: '甲', limit: 90 });
      out.s10parent = c('getRecentRecordsByName') - n0;
      setRole('coach', '教練', { authToken: 'c-token' });

      // S9 參數不同是不同 key
      n0 = c('getAttendanceReportsByName');
      await postToWebApp({ action: 'getAttendanceReportsByName', studentName: '甲', name: '甲' });
      await postToWebApp({ action: 'getAttendanceReportsByName', studentName: '乙', name: '乙' });
      out.s9 = c('getAttendanceReportsByName') - n0;
      return out;
    });
    t('S1 60 秒內重複讀取只打一次', r.s1 === 1, JSON.stringify(r.s1));
    t('S2 寫入後重抓且拿到新值', r.s2.calls === 1 && r.s2.enabled === false, JSON.stringify(r.s2));
    t('S3 寫入期間的舊讀取不會回存成快取', r.s3.calls === 1 && r.s3.enabled === true, JSON.stringify(r.s3));
    t('S4 ok:false 不快取，下一次會重打', r.s4.calls === 2 && r.s4.bad === false && r.s4.good === true, JSON.stringify(r.s4));
    t('S5 呼叫端改回傳物件不會污染快取', r.s5.ok === true && r.s5.len === 0, JSON.stringify(r.s5));
    t('S6 換人登入不共用快取', r.s6 === 2, JSON.stringify(r.s6));
    t('S7 超過 60 秒會重抓', r.s7 === 2, JSON.stringify(r.s7));
    t('S8 白名單外的 action 不快取', r.s8 === 2, JSON.stringify(r.s8));
    t('S8 教練按重新整理（resetBackendCircuit）清空快取', r.s8size === 0, JSON.stringify(r.s8size));
    t('S10 教練讀 getRecentRecordsByName 不快取（剛送出的要立刻看得到）', r.s10coach === 2, JSON.stringify(r.s10coach));
    t('S10 家長讀 getRecentRecordsByName 有快取', r.s10parent === 1, JSON.stringify(r.s10parent));
    t('S9 參數不同不共用', r.s9 === 2, JSON.stringify(r.s9));
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
