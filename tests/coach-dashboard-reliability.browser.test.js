/* 教練後台讀取可靠性：在真的 Chromium 裡跑 refreshCoach。
   驗證規格要求的每一條：不產生 GET、不出現空白後台、session 過期訊息正確、
   後端錯誤不可被誤判成「今天沒人回報」、同人同日 dedupe、版本握手提示。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

// 假後端。scenario 由測試逐項切換。
const INIT = () => {
  window.__requests = [];
  window.__scenario = 'ok';
  window.__apiVersion = window.APP_VERSION || '2026-09-02.2';
  const FIELDS = ['recordId', 'name', 'studentName', 'date', 'timestamp', 'status',
    'sleepHours', 'rpe', 'painScore', 'moodIndex', 'finalReadinessScore', 'readinessStatusLight'];
  const mk = (id, name, date, ts, extra) => Object.assign({
    recordId: id, name: name, studentName: name, date: date, timestamp: ts,
    status: '綠燈', sleepHours: 7, rpe: 6, painScore: 1, moodIndex: 4
  }, extra || {});
  const TODAY = '2026-09-02';
  const ROWS = [
    mk('a1', '甲同學', TODAY, TODAY + 'T08:00:00.000Z', { status: '黃燈', painScore: 5 }),
    // 同一人同一天重送：較晚的這筆才是有效的
    mk('a2', '甲同學', TODAY, TODAY + 'T21:00:00.000Z', { status: '綠燈', painScore: 1 }),
    mk('b1', '乙同學', TODAY, TODAY + 'T09:00:00.000Z', { status: '紅燈' }),
    mk('c1', '丙同學', '2026-08-25', '2026-08-25T09:00:00.000Z', {})
  ];
  const origFetch = window.fetch;
  window.fetch = (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const method = (opt && opt.method) || 'GET';
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__requests.push({ action: body.action, method: method, url: String(url), body: body });
    const reply = o => Promise.resolve(new Response(JSON.stringify(
      Object.assign({ apiVersion: window.__apiVersion }, o))));

    if (window.__scenario === 'htmlError') {
      return Promise.resolve(new Response(
        '<!DOCTYPE html><html><head><title>Error 500 (Server Error)!!1</title></head><body>oops</body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }));
    }
    if (window.__scenario === 'offline') return Promise.reject(new TypeError('Failed to fetch'));

    if (body.action === 'getCoachDashboard') {
      if (window.__scenario === 'noAction') return reply({ ok: false, error: '未知的 action：getCoachDashboard' });
      if (window.__scenario === 'expired') return reply({ ok: false, error: '登入已失效，請重新登入。', authRequired: true });
      if (window.__scenario === 'backendError') return reply({ ok: false, error: 'records 表頭有重複欄位' });
      return reply({ ok: true, fields: FIELDS, total: ROWS.length, offset: 0, nextOffset: null, data: ROWS });
    }
    if (body.action === 'getAllRecords') {
      if (window.__scenario === 'expired') return reply({ ok: false, error: '登入已失效，請重新登入。', authRequired: true });
      if (window.__scenario === 'backendError') return reply({ ok: false, error: 'records 表頭有重複欄位' });
      return reply({ ok: true, fields: FIELDS, total: ROWS.length, offset: 0, nextOffset: null, data: ROWS });
    }
    return reply({ ok: true, data: [] });
  };
};

const asCoach = () => {
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 't' }));
  const d = document.getElementById('coachDate');
  if (d) d.value = '2026-09-02';
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  await page.addInitScript(INIT);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof refreshCoach === 'function');
  await page.evaluate(asCoach);

  const run = async scenario => page.evaluate(async sc => {
    window.__scenario = sc;
    window.__requests = [];
    if (typeof invalidateAllRecordsCache === 'function') invalidateAllRecordsCache();
    if (typeof _coachDashboardUnavailable !== 'undefined') { try { _coachDashboardUnavailable = false; } catch (e) {} }
    await refreshCoach();
    const overview = (document.getElementById('coachOverview') || {}).innerHTML || '';
    const banner = document.querySelector('.coach-load-error');
    return {
      actions: window.__requests.map(r => r.action),
      methods: [...new Set(window.__requests.map(r => r.method))],
      urlsWithActionQuery: window.__requests.filter(r => r.url.indexOf('?action=') !== -1).length,
      total: window.__requests.length,
      overview: overview,
      bannerText: banner ? banner.textContent : '',
      versionBanner: (document.getElementById('versionMismatchBanner') || {}).textContent || '',
      staleBanner: (document.getElementById('staleDataBanner') || {}).textContent || ''
    };
  }, scenario);

  /* ---- 1. 正常情境 ---- */
  const ok = await run('ok');
  t('教練後台優先呼叫 getCoachDashboard，不再拉整張 records',
    ok.actions.indexOf('getCoachDashboard') !== -1 && ok.actions.indexOf('getAllRecords') === -1,
    ok.actions.join(','));
  t('所有送往 GAS 的請求都是 POST（沒有任何 GET fallback）',
    ok.methods.length === 1 && ok.methods[0] === 'POST', ok.methods.join(','));
  t('後台不是空白（總覽有算出數字）',
    /ov-num/.test(ok.overview) && ok.overview.length > 50, ok.overview.length + ' chars');
  t('正常情境不顯示錯誤橫幅', ok.bannerText === '', ok.bannerText.slice(0, 40));

  /* ---- 2. 同人同日 dedupe ---- */
  const dedupe = await page.evaluate(() => {
    const rows = [
      { recordId: 'a1', name: '甲同學', date: '2026-09-02', timestamp: '2026-09-02T08:00:00.000Z', status: '黃燈' },
      { recordId: 'a2', name: '甲同學', date: '2026-09-02', timestamp: '2026-09-02T21:00:00.000Z', status: '綠燈' },
      { recordId: 'b1', name: '乙同學', date: '2026-09-02', timestamp: '2026-09-02T09:00:00.000Z', status: '紅燈' }
    ].map(normalizeCoachRecord);
    const out = dedupeLatestByName(rows);
    return { count: out.length, kept: out.filter(r => r.name === '甲同學').map(r => r.recordId) };
  });
  t('同一選手同一天只留最新一筆（dedupe 正常）',
    dedupe.count === 2 && dedupe.kept.length === 1 && dedupe.kept[0] === 'a2',
    JSON.stringify(dedupe));

  /* ---- 3. 後端還沒部署新 action 時自動退回，不開天窗 ---- */
  const fb = await run('noAction');
  t('後端沒有 getCoachDashboard 時自動退回 getAllRecords',
    fb.actions.indexOf('getCoachDashboard') !== -1 && fb.actions.indexOf('getAllRecords') !== -1,
    fb.actions.join(','));
  t('退回舊路徑後後台仍然有資料（不會變空白）',
    /ov-num/.test(fb.overview) && fb.bannerText === '', fb.bannerText.slice(0, 40));

  /* ---- 4. session 過期 ---- */
  const exp = await run('expired');
  t('session 過期顯示的是「登入已過期」，不是「今天沒人回報」',
    exp.bannerText.indexOf('登入已過期') !== -1 && exp.bannerText.indexOf('資料沒讀進來') !== -1,
    exp.bannerText.slice(0, 60));
  t('session 過期時畫面上有重新登入的按鈕',
    await page.evaluate(() => !!document.querySelector('.coach-relogin')), '');

  /* ---- 5. 後端錯誤不可被誤判成「今天沒人回報」 ---- */
  const err = await run('backendError');
  t('後端錯誤會明講「這裡是空的，因為資料沒讀進來，不是今天沒人回報」',
    err.bannerText.indexOf('不是今天沒人回報') !== -1, err.bannerText.slice(0, 60));
  t('後端錯誤時不會把總覽渲染成一片 0（避免看起來像全隊未回報）',
    err.overview.indexOf('ov-num') === -1 || err.bannerText !== '', err.overview.slice(0, 60));

  /* ---- 6. 版本握手 ---- */
  const ver = await page.evaluate(async () => {
    window.__scenario = 'ok';
    window.__apiVersion = '9999-01-01.0';      // 後端比前端新
    if (typeof invalidateAllRecordsCache === 'function') invalidateAllRecordsCache();
    await refreshCoach();
    const state = typeof getApiVersionState === 'function' ? getApiVersionState() : null;
    return { state: state, banner: (document.getElementById('versionMismatchBanner') || {}).textContent || '' };
  });
  t('版本不同時偵測得到', ver.state && ver.state.mismatch === true, JSON.stringify(ver.state));
  t('版本不同時顯示「前後端版本不同，請重新部署 Apps Script」',
    ver.banner.indexOf('前後端版本不同') !== -1 && ver.banner.indexOf('重新部署 Apps Script') !== -1,
    ver.banner.slice(0, 60));

  const back = await page.evaluate(async () => {
    window.__apiVersion = window.APP_VERSION;
    if (typeof invalidateAllRecordsCache === 'function') invalidateAllRecordsCache();
    await refreshCoach();
    return (document.getElementById('versionMismatchBanner') || {}).textContent || '';
  });
  t('版本恢復一致後提示會消失', back === '', back.slice(0, 40));

  /* ---- 6b. 有 last-known-good 時：顯示舊資料 + 非即時警示，不可變成「0 人回報」---- */
  const stale = await run('offline');
  t('後端斷線但有上次成功資料時，顯示的是舊資料而非空白',
    /ov-num/.test(stale.overview) && stale.bannerText === '', stale.bannerText.slice(0, 60));
  t('舊資料會明確標示「非即時資料」與最後同步時間',
    stale.staleBanner.indexOf('非即時資料') !== -1 && /\d\d:\d\d/.test(stale.staleBanner),
    stale.staleBanner.slice(0, 90));
  const recovered = await run('ok');
  t('連線恢復後「非即時資料」提示會消失',
    recovered.staleBanner === '', recovered.staleBanner.slice(0, 60));

  /* ---- 6c. 沒有 last-known-good 時（剛開頁就失敗）：要說得出失敗原因 ---- */
  await page.reload();
  await page.waitForFunction(() => typeof refreshCoach === 'function');
  await page.evaluate(asCoach);
  const html500 = await run('htmlError');
  t('後端回 HTML 錯誤頁時，橫幅寫得出 HTTP 狀態與頁面標題',
    html500.bannerText.indexOf('HTTP 500') !== -1 && html500.bannerText.indexOf('Error 500') !== -1,
    html500.bannerText.slice(0, 110));
  t('HTML 錯誤頁的診斷不外洩回應內容（只描述結構）',
    html500.bannerText.indexOf('oops') === -1, html500.bannerText.slice(0, 80));

  await page.reload();
  await page.waitForFunction(() => typeof refreshCoach === 'function');
  await page.evaluate(asCoach);
  const offline = await run('offline');
  t('連線中斷時說的是「連不上 script.google.com」，不是丟原始例外',
    offline.bannerText.indexOf('連不上 script.google.com') !== -1, offline.bannerText.slice(0, 110));
  t('診斷會標出是哪一個 action 失敗',
    offline.bannerText.indexOf('action=') !== -1, offline.bannerText.slice(0, 110));

  /* ---- 7. 準備度分組：曾經必然拋錯，讓後面所有區塊停止渲染 ---- */
  const groups = await page.evaluate(() => {
    const mk = (n, score) => normalizeCoachRecord({
      recordId: 'g' + n, name: '選手' + n, studentName: '選手' + n,
      date: '2026-09-02', timestamp: '2026-09-02T08:00:00.000Z', finalReadinessScore: score
    });
    // 五個級距各一人，外加一筆沒有 readiness 分數的
    const rows = [mk(1, 92), mk(2, 75), mk(3, 60), mk(4, 45), mk(5, 10), mk(6, '')];
    let threw = null;
    try { renderCoachSimpleGroups(rows); } catch (e) { threw = String(e); }
    const box = document.getElementById('coachTodayGroups');
    const html = box ? box.innerHTML : '';
    return {
      threw: threw,
      html: html,
      counts: ['強化組', '穩定組', '調整組', '保護組', '關懷組']
        .map(g => { const part = html.split(g + '（')[1]; return g + '=' + (part ? parseInt(part, 10) : '?'); })
        .join(' ')
    };
  });
  t('準備度分組不再拋錯（曾經 buckets[undefined].push 讓後面所有區塊停擺）',
    groups.threw === null, String(groups.threw));
  t('五個級距各自分對人（含沒有分數的落到關懷組）',
    groups.counts === '強化組=1 穩定組=1 調整組=1 保護組=1 關懷組=2', groups.counts);

  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
  console.log('');
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
