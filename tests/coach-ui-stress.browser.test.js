/* UI 壓力測試：真實 Chromium，模擬教練連續操作與各種後端異常。
   規格見 2026-09-03 的稽核需求。重點不是「跑得快」，而是：
   任何一支 API 失敗，都不可以讓教練看到「今天沒人回報」。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

const INIT = () => {
  window.__requests = [];
  window.__scenario = 'ok';
  window.__delayMs = 0;
  window.__failNext = 0;              // 接下來幾次請求要失敗
  window.__apiVersion = window.APP_VERSION || '2026-09-02.2';

  const NAMES = Array.from({ length: 41 }, (_, i) => '選手' + (i + 1));
  const ymd = n => {
    const d = new Date('2026-09-02T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const FIELDS = ['recordId', 'name', 'studentName', 'date', 'timestamp', 'status', 'sleepHours',
    'rpe', 'painScore', 'moodIndex', 'finalReadinessScore', 'readinessStatusLight',
    'disciplineAvg', 'encouragementToTeammate', 'coachReply'];
  const ROWS = [];
  for (let d = 0; d < 60; d++) {
    for (let n = 0; n < NAMES.length; n++) {
      ROWS.push({
        recordId: 'r' + d + '-' + n, name: NAMES[n], studentName: NAMES[n],
        date: ymd(d), timestamp: ymd(d) + 'T08:00:00.000Z',
        status: ['綠燈', '黃燈', '紅燈'][(d + n) % 3],
        sleepHours: 6 + (n % 4), rpe: 5 + (n % 5), painScore: (d + n) % 9,
        moodIndex: 1 + (n % 5), finalReadinessScore: 40 + ((d * 7 + n * 3) % 55),
        disciplineAvg: 3 + (n % 3), encouragementToTeammate: n % 4 === 0 ? '加油' : ''
      });
    }
  }
  window.__rowCount = ROWS.length;

  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__requests.push({ action: body.action, method: (opt && opt.method) || 'GET', body });
    if (window.__delayMs) await new Promise(r => setTimeout(r, window.__delayMs));
    if (window.__failNext > 0) { window.__failNext--; throw new TypeError('Failed to fetch'); }
    const reply = o => new Response(JSON.stringify(Object.assign({ apiVersion: window.__apiVersion }, o)));
    if (window.__scenario === 'oldBackend' && body.action === 'getCoachDashboard') {
      return reply({ ok: false, error: '未知的 action：getCoachDashboard' });
    }
    const since = body.sinceDate || '1970-01-01';
    let rows = ROWS.filter(r => r.date >= since);
    if (body.action === 'getRecordsByDate') rows = ROWS.filter(r => r.date === body.date);
    if (body.action === 'getRecentRecordsByName') {
      rows = ROWS.filter(r => r.name === body.name).slice(0, Number(body.limit || 7));
      return reply({ ok: true, data: rows });
    }
    if (body.action === 'getLastRecordByName') {
      return reply({ ok: true, data: ROWS.filter(r => r.name === body.name)[0] || null });
    }
    if (['getCoachDashboard', 'getAllRecords', 'getRecordsByDate'].indexOf(body.action) === -1) {
      return reply({ ok: true, data: [] });
    }
    const offset = Number(body.offset || 0);
    const PAGE = 900;
    const slice = rows.slice(offset, offset + PAGE);
    const next = offset + PAGE < rows.length ? offset + PAGE : null;
    return reply({ ok: true, fields: FIELDS, total: rows.length, offset, nextOffset: next, data: slice });
  };
};

const asCoach = () => {
  // 一定要 seed 名單：renderOverview 的「已回報」是拿 roster 去比對的，
  // 沒有名單就永遠是 0，會讓測試以錯誤的理由失敗（或以錯誤的理由通過）。
  localStorage.setItem('yulin_players',
    JSON.stringify(Array.from({ length: 41 }, (_, i) => '選手' + (i + 1))));
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 't' }));
  const d = document.getElementById('coachDate');
  if (d) d.value = '2026-09-02';
};
const overviewOk = () => {
  const html = (document.getElementById('coachOverview') || {}).innerHTML || '';
  return /ov-num/.test(html);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof refreshCoach === 'function');
  await page.evaluate(asCoach);
  const rowCount = await page.evaluate(() => window.__rowCount);

  /* ---- 1. 教練後台重新整理 30 次 ---- */
  const r1 = await page.evaluate(async () => {
    window.__requests = [];
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { invalidateAllRecordsCache(); await refreshCoach(); }
    return { ms: Math.round(performance.now() - t0), reqs: window.__requests.length,
             actions: [...new Set(window.__requests.map(r => r.action))],
             full: window.__requests.filter(r => r.action === 'getAllRecords' && !r.sinceDate).length };
  });
  t('教練後台重新整理 30 次不出錯，且全部走 getCoachDashboard',
    r1.actions.indexOf('getCoachDashboard') !== -1 && r1.actions.indexOf('getAllRecords') === -1,
    r1.actions.join(',') + '｜' + r1.reqs + ' 次請求');

  /* ---- 2. 日期切換 30 次 ---- */
  const r2 = await page.evaluate(async () => {
    window.__requests = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-09-02T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i);
      document.getElementById('coachDate').value = d.toISOString().slice(0, 10);
      await refreshCoach();
    }
    return { reqs: window.__requests.length, hasFull: window.__requests.some(r => r.action === 'getAllRecords') };
  });
  t('日期切換 30 次，沒有任何一次退回完整 getAllRecords',
    r2.hasFull === false, r2.reqs + ' 次請求');

  /* ---- 3. 上次表現連開 50 次 ---- */
  const r3 = await page.evaluate(async () => {
    document.getElementById('coachDate').value = '2026-09-02';
    window.__requests = [];
    for (let i = 0; i < 50; i++) {
      invalidateAllRecordsCache();
      await loadTodayReportedStudents({});
    }
    const acts = window.__requests.map(r => r.action);
    return { total: acts.length, dash: acts.filter(a => a === 'getCoachDashboard').length,
             full: acts.filter(a => a === 'getAllRecords').length };
  });
  t('「上次表現→今日已回報名單」開 50 次，一次都沒有抓完整歷史',
    r3.full === 0 && r3.dash > 0, JSON.stringify(r3));

  /* ---- 4. 快速切換各分頁後再回來 ---- */
  const r4 = await page.evaluate(async () => {
    window.__requests = [];
    for (let i = 0; i < 5; i++) {
      switchTab('lastperf'); switchTab('profile'); switchTab('coach');
      switchTab('trait'); switchTab('lastperf');
      await new Promise(r => setTimeout(r, 30));
    }
    await new Promise(r => setTimeout(r, 400));
    return { hasFull: window.__requests.some(r => r.action === 'getAllRecords' && !r.body.sinceDate),
             total: window.__requests.length };
  });
  t('快速切換分頁 5 輪，沒有任何無限制的 getAllRecords',
    r4.hasFull === false, r4.total + ' 次請求');

  /* ---- 5. 第一次失敗、第二次成功 → 必須自動恢復 ---- */
  const r5 = await page.evaluate(async () => {
    invalidateAllRecordsCache();
    resetBackendCircuit();
    window.__failNext = 1;                 // 只讓第一次失敗
    window.__requests = [];
    await refreshCoach();
    return { ok: /ov-num/.test((document.getElementById('coachOverview') || {}).innerHTML || ''),
             stale: (document.getElementById('staleDataBanner') || {}).textContent || '',
             tries: window.__requests.length };
  });
  t('第一次 fetch 失敗、第二次成功時自動重試並恢復（畫面有資料）',
    r5.ok === true, JSON.stringify({ tries: r5.tries, stale: r5.stale.slice(0, 30) }));

  /* ---- 6. 後端延遲 → 不可被當成 0 筆 ---- */
  const r6 = await page.evaluate(async () => {
    invalidateAllRecordsCache();
    resetBackendCircuit();
    window.__delayMs = 1200;               // 慢，但在逾時之內
    await refreshCoach();
    window.__delayMs = 0;
    const html = (document.getElementById('coachOverview') || {}).innerHTML || '';
    const m = /<span class="ov-num">(\d+)<\/span>/.exec(html);
    return { hasNums: /ov-num/.test(html), firstNum: m ? Number(m[1]) : -1 };
  });
  t('後端延遲時 UI 不會把資料當成 0 筆',
    r6.hasNums && r6.firstNum > 0, JSON.stringify(r6));

  /* ---- 7. 舊版後端（沒有 getCoachDashboard）---- */
  const r7 = await page.evaluate(async () => {
    invalidateAllRecordsCache();
    resetBackendCircuit();
    window.__scenario = 'oldBackend';
    window.__apiVersion = '2026-01-01.0';        // 版本也不同
    window.__requests = [];
    await refreshCoach();
    const res = {
      fellBack: window.__requests.some(r => r.action === 'getAllRecords'),
      hasData: /ov-num/.test((document.getElementById('coachOverview') || {}).innerHTML || ''),
      versionBanner: (document.getElementById('versionMismatchBanner') || {}).textContent || ''
    };
    window.__scenario = 'ok';
    window.__apiVersion = window.APP_VERSION;
    return res;
  });
  t('舊版後端時自動退回 getAllRecords 且畫面仍有資料', r7.fellBack && r7.hasData, JSON.stringify(r7));
  t('舊版後端時顯示版本不符提示',
    r7.versionBanner.indexOf('前後端版本不同') !== -1, r7.versionBanner.slice(0, 60));

  /* ---- 8. 連續失敗 → 斷路器 → 用最後成功資料，不可顯示成沒人回報 ---- */
  const r8 = await page.evaluate(async () => {
    invalidateAllRecordsCache();
    resetBackendCircuit();
    await refreshCoach();                        // 先成功一次，建立 last-known-good
    window.__failNext = 99;                      // 之後全部失敗
    window.__requests = [];
    await refreshCoach();
    const afterFirst = window.__requests.length;
    await refreshCoach();
    const state = getBackendCircuitState();
    const html = (document.getElementById('coachOverview') || {}).innerHTML || '';
    const res = {
      hasData: /ov-num/.test(html),
      stale: (document.getElementById('staleDataBanner') || {}).textContent || '',
      circuitOpened: state.failures >= 2 || state.open,
      reqsAfterFirstFailure: afterFirst
    };
    window.__failNext = 0;
    return res;
  });
  t('後端全掛時顯示最後一次成功的資料，不是「0 人回報」', r8.hasData === true, JSON.stringify(r8).slice(0, 120));
  t('並明確標示為非即時資料', r8.stale.indexOf('非即時資料') !== -1, r8.stale.slice(0, 70));
  t('連續失敗後斷路器有作用（不再無止盡轟炸後端）', r8.circuitOpened === true, JSON.stringify(r8));

  /* ---- 9. 教練主動重新整理可解除斷路器 ---- */
  const r9 = await page.evaluate(async () => {
    window.__failNext = 0;
    invalidateAllRecordsCache();
    await refreshCoach();                        // refreshCoach 內部會 resetBackendCircuit
    return { open: getBackendCircuitState().open,
             fresh: ((document.getElementById('staleDataBanner') || {}).textContent || '') === '',
             hasData: /ov-num/.test((document.getElementById('coachOverview') || {}).innerHTML || '') };
  });
  t('按「重新整理資料」可解除斷路器並取回即時資料',
    r9.open === false && r9.fresh === true && r9.hasData === true, JSON.stringify(r9));

  /* ---- 10. 寫入不得經過會重試的讀取層 ---- */
  const r10 = await page.evaluate(async () => {
    try { await safeReadRequest({ action: 'addRecord', payload: {} }); return { threw: false }; }
    catch (e) { return { threw: true, msg: String(e.message).slice(0, 60) }; }
  });
  t('寫入型 action 丟進 safeReadRequest 會被擋下（避免重試造成重複寫入）',
    r10.threw === true && r10.msg.indexOf('不接受寫入型') !== -1, JSON.stringify(r10));

  console.log('');
  console.log('（測試資料：' + rowCount + ' 列 / 41 位選手 / 60 天）');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
  console.log('');
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
