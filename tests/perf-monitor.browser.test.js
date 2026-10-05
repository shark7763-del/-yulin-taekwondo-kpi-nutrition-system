/* TeamPro 2.0 Phase 10 回歸測試：效能監測（真的 Chromium 跑 index.html，後端全攔截）。

   S. 開關：預設關閉；?debug=perf 開啟並記在裝置上；?debug=off 關閉
   Z. 關閉時零記錄、零 console 輸出
   A. 每個請求各自計時（並行同名請求不互相覆蓋），回應大小以 UTF-8 bytes 計
   V. 60 秒快取命中、合併重複分別標記；teamproPerfSummary() 彙整正確
   P. 隱私：log 與 entries 裡不得出現任何請求或回應內容（只能有 action、毫秒、大小） */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'file://' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });
const SECRET = '秘密心得-不可外洩';

const INIT = ({ secret }) => {
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 't' }));
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    const ms = body.action === 'getStarConfig' ? 300 : (body.action === 'getRecentRecordsByName' ? (body.name === '選手慢慢' ? 600 : 100) : 50);
    await new Promise(r => setTimeout(r, ms));
    // 回應裡放一段中文「敏感內容」，用來驗證不會被記錄；長度用來驗證 bytes 計算
    return new Response(JSON.stringify({ ok: true, apiVersion: window.APP_VERSION, data: [{ reflection: secret + '中'.repeat(1000) }] }));
  };
};

async function open(context, query) {
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto(BASE + (query || ''));
  await page.waitForFunction(() => window.TEAMPRO_PERF && typeof postToWebApp === 'function');
  await page.waitForTimeout(1500);
  return { page, logs, errors };
}

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];
  const context = await browser.newContext();
  await context.addInitScript(INIT, { secret: SECRET });

  /* S / Z：預設關閉 */
  {
    const { page, logs, errors } = await open(context, '');
    const r = await page.evaluate(async () => {
      await postToWebApp({ action: 'getRoster' });
      return { on: TEAMPRO_PERF.enabled(), n: TEAMPRO_PERF.entries.length, summary: window.teamproPerfSummary() };
    });
    t('S 預設關閉', r.on === false, JSON.stringify(r));
    t('Z 關閉時沒有任何記錄', r.n === 0 && r.summary === null, JSON.stringify(r));
    t('Z 關閉時沒有 [TeamPro perf] 的 console 輸出（除了提示怎麼開）',
      logs.filter(l => l.indexOf('[TeamPro perf]') !== -1 && l.indexOf('?debug=perf') === -1).length === 0, JSON.stringify(logs.filter(l => l.indexOf('perf') !== -1)));
    allErrors.push(...errors); await page.close();
  }

  /* S：?debug=perf 開啟並記住 */
  {
    const { page, errors } = await open(context, '?debug=perf');
    t('S ?debug=perf 開啟', await page.evaluate(() => TEAMPRO_PERF.enabled()), '');
    allErrors.push(...errors); await page.close();
  }

  /* A / V / P：記住後不帶參數也開著 */
  {
    const { page, logs, errors } = await open(context, '');
    const r = await page.evaluate(async () => {
      const on = TEAMPRO_PERF.enabled();
      TEAMPRO_PERF.clear();
      // A：兩個同名請求並行，慢的 600ms、快的 100ms —— 各自的毫秒數要對
      await Promise.all([
        postToWebApp({ action: 'getRecentRecordsByName', name: '選手慢慢', limit: 1 }),
        postToWebApp({ action: 'getRecentRecordsByName', name: '選手快快', limit: 1 })
      ]);
      // V：合併重複（同參數同時兩次）＋ 60 秒快取命中（getStarConfig 在白名單）
      clearReadTtlCache();
      await Promise.all([postToWebApp({ action: 'getRoster' }), postToWebApp({ action: 'getRoster' })]);
      await postToWebApp({ action: 'getStarConfig' });
      await postToWebApp({ action: 'getStarConfig' });
      const entries = TEAMPRO_PERF.entries.filter(e => e.type === 'api');
      return { on, entries, summary: TEAMPRO_PERF.summary(), table: window.teamproPerfSummary() };
    });
    t('S 開過之後重新整理仍維持開啟', r.on === true, '');
    const recent = r.entries.filter(e => e.label === 'getRecentRecordsByName' && e.via === 'network').map(e => e.ms).sort((a, b) => a - b);
    t('A 並行同名請求各自計時（快的 < 400ms、慢的 ≥ 550ms）', recent.length === 2 && recent[0] < 400 && recent[1] >= 550, JSON.stringify(recent));
    const one = r.entries.find(e => e.label === 'getRecentRecordsByName');
    t('A 回應大小以 UTF-8 bytes 計（1000 個中文字 ≥ 3000 bytes）', !!one && one.bytes >= 3000, JSON.stringify(one));
    const roster = r.summary.getRoster || {};
    t('V 同時兩次相同請求：1 次實際連線＋1 次合併重複', roster.實際連線 === 1 && roster.合併重複 === 1, JSON.stringify(roster));
    const star = r.summary.getStarConfig || {};
    t('V 60 秒快取命中有標記', star.實際連線 === 1 && star.快取命中 === 1, JSON.stringify(star));
    t('V teamproPerfSummary() 回傳彙整表', !!r.table && !!r.table.getRoster, JSON.stringify(Object.keys(r.table || {})));
    const perfLogs = logs.filter(l => l.indexOf('[TeamPro perf]') !== -1);
    t('P 有輸出統一前綴的 log', perfLogs.some(l => /api getRecentRecordsByName \d+ms \d+KB/.test(l)), JSON.stringify(perfLogs.slice(0, 5)));
    const dump = JSON.stringify(r.entries) + JSON.stringify(r.summary) + perfLogs.join('\n');
    t('P log 與記錄裡沒有任何請求／回應內容', dump.indexOf(SECRET) === -1 && dump.indexOf('選手慢慢') === -1 && dump.indexOf('選手快快') === -1,
      ['SECRET', '選手慢慢', '選手快快'].filter(k => dump.indexOf(k === 'SECRET' ? SECRET : k) !== -1).join(','));
    allErrors.push(...errors); await page.close();
  }

  /* S：?debug=off 關閉 */
  {
    const { page, errors } = await open(context, '?debug=off');
    const r = await page.evaluate(() => ({ on: TEAMPRO_PERF.enabled(), stored: localStorage.getItem('teampro_debug_perf') }));
    t('S ?debug=off 關閉並清掉裝置記憶', r.on === false && r.stored === null, JSON.stringify(r));
    allErrors.push(...errors); await page.close();
  }

  await context.close();
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
