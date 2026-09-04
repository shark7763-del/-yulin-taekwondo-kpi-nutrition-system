/* Summary First / Detail On Demand —— 逐條驗收 2026-09-04 規格的 10 條 acceptance criteria。
   在真的 Chromium 裡跑，計數真正送出的請求。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

const INIT = () => {
  window.__requests = [];
  window.__failNext = 0;
  window.__athleteCount = 51;
  const NAMES = Array.from({ length: window.__athleteCount }, (_, i) => '選手' + (i + 1));
  const ymd = n => {
    const d = new Date('2026-09-04T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  window.__ymd = ymd;

  const summaryFor = date => ({
    ok: true, date,
    stats: { reported: NAMES.length, pending: 12, highPriority: 5 },
    athletes: NAMES.map((n, i) => ({
      studentName: n, studentId: i % 3 === 0 ? 'ST-' + i : null, trait: i % 2 ? '穩定型' : '',
      reported: true, hasReply: i >= 12, priority: i < 5,
      readiness: { score: 40 + (i % 55), light: ['綠燈', '黃燈', '紅燈'][i % 3] }
    })),
    meta: { elapsedMs: 12, rowsScanned: 5000, rowsReturned: NAMES.length, queryType: 'dailySummary' }
  });

  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__requests.push({ action: body.action, body });
    if (window.__failNext > 0) { window.__failNext--; throw new TypeError('Failed to fetch'); }
    const reply = o => new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, o)));
    if (body.action === 'getDailyAthleteSummary') return reply(summaryFor(body.date));
    if (body.action === 'getRecentRecordsByName') {
      const rows = Array.from({ length: 20 }, (_, d) => ({
        recordId: body.name + '-' + d, name: body.name, studentName: body.name,
        date: ymd(d), timestamp: ymd(d) + 'T08:00:00.000Z',
        totalScore: 70 + (d % 10), painScore: d % 5, status: '綠燈'
      }));
      return reply({ ok: true, data: rows });
    }
    if (body.action === 'getRecordsByDate') return reply({ ok: true, data: [] });
    return reply({ ok: true, data: [] });
  };
};

const asCoach = () => {
  localStorage.clear();
  localStorage.setItem('yulin_players',
    JSON.stringify(Array.from({ length: 51 }, (_, i) => '選手' + (i + 1))));
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 't' }));
  const d = document.getElementById('lastPerfDate') || document.getElementById('coachDate');
  if (d) d.value = '2026-09-04';
};

const countOf = (reqs, action) => reqs.filter(r => r.action === action).length;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof refreshTodayReportedList === 'function');
  await page.evaluate(asCoach);

  /* ---- 1 & 2. 首頁不得抓 records ---- */
  const first = await page.evaluate(async () => {
    window.__requests = [];
    invalidateDailySummaryCache();
    const t0 = performance.now();
    await refreshTodayReportedList();
    return {
      ms: Math.round(performance.now() - t0),
      actions: window.__requests.map(r => r.action),
      listHtml: (document.getElementById('todayReportedList') || {}).innerHTML || '',
      summaryHtml: (document.getElementById('lastPerfSummaryRow') || {}).innerHTML || ''
    };
  });
  t('① 首頁不呼叫 getAllRecords',
    countOf(first.actions.map(a => ({ action: a })), 'getAllRecords') === 0, first.actions.join(','));
  t('② 首頁不為了名單抓 14 天 records（連 getCoachDashboard 都不打）',
    first.actions.indexOf('getCoachDashboard') === -1, first.actions.join(','));
  t('   首頁只打 getDailyAthleteSummary 一支',
    first.actions.filter(a => a === 'getDailyAthleteSummary').length === 1, first.actions.join(','));
  t('   名單有畫出來（51 人）',
    (first.listHtml.match(/data-lastperf-student/g) || []).length === 51,
    String((first.listHtml.match(/data-lastperf-student/g) || []).length));
  t('   統計數字有畫出來', /lastperf-summary-card/.test(first.summaryHtml), '');

  /* ---- 3. TTL 內重進頁：0 request ---- */
  const again = await page.evaluate(async () => {
    window.__requests = [];
    await refreshTodayReportedList();
    return { actions: window.__requests.map(r => r.action),
             list: (document.getElementById('todayReportedList') || {}).innerHTML.length };
  });
  t('③ 同一天 TTL 內重新進頁：0 API request',
    again.actions.length === 0, again.actions.join(','));
  t('   而且名單仍然畫得出來（不是空白）', again.list > 100, String(again.list));

  /* ---- 4. 返回列表：0 request ---- */
  const back = await page.evaluate(async () => {
    window.__requests = [];
    switchTab('coach'); switchTab('lastperf');
    await new Promise(r => setTimeout(r, 300));
    return window.__requests.map(r => r.action);
  });
  t('④ 離開再返回「上次表現」：0 summary request',
    countOf(back.map(a => ({ action: a })), 'getDailyAthleteSummary') === 0, back.join(','));

  /* ---- 5. 切換日期：最多 1 個 summary request ---- */
  const switched = await page.evaluate(async () => {
    window.__requests = [];
    const d = document.getElementById('lastPerfDate') || document.getElementById('coachDate');
    if (d) d.value = '2026-09-03';
    await refreshTodayReportedList();
    return window.__requests.map(r => r.action);
  });
  t('⑤ 切換日期最多 1 個 summary request',
    countOf(switched.map(a => ({ action: a })), 'getDailyAthleteSummary') <= 1, switched.join(','));

  /* ---- 6 & 7. 明細只在點選時讀，且 TTL 內重複點 0 request ---- */
  // 先讓前面幾段測試觸發的背景工作（trait 載入）沉澱，否則量到的是它們的尾巴
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  const detail = await page.evaluate(async () => {
    const d = document.getElementById('lastPerfDate') || document.getElementById('coachDate');
    if (d) d.value = '2026-09-04';
    invalidateAthleteDetail();
    // 這個欄位可能是 select 也可能是 input；是 select 就要先有選項，
    // 否則 value 會被靜默設成 ''（tests/README 記載過的陷阱）。
    const nameSel = document.getElementById('lastPerfName');
    if (nameSel) {
      if (nameSel.tagName === 'SELECT') {
        const has = Array.prototype.some.call(nameSel.options || [], o => o.value === '選手3');
        if (!has) {
          const o = document.createElement('option');
          o.value = '選手3'; o.textContent = '選手3';
          nameSel.appendChild(o);
        }
      }
      nameSel.value = '選手3';
      if (nameSel.value !== '選手3') return { setupFailed: nameSel.tagName + ' 無法設定為 選手3' };
    } else {
      return { setupFailed: '找不到 #lastPerfName' };
    }
    window.__requests = [];
    await loadLastPerfPage();
    const firstReqs = window.__requests.map(r => r.action);
    window.__requests = [];
    await loadLastPerfPage();                 // 再點同一人
    const secondReqs = window.__requests.map(r => r.action);
    return { firstReqs, secondReqs };
  });
  t('   測試前置：選手欄位設定成功（否則下面是假通過）',
    !detail.setupFailed, detail.setupFailed || '');
  t('⑥ 點一位選手：最多 1 個明細 request',
    !detail.setupFailed && (detail.firstReqs || []).filter(a => a === 'getRecentRecordsByName').length <= 1,
    JSON.stringify(detail).slice(0, 120));
  t('   明細不呼叫 getAllRecords',
    !detail.setupFailed && (detail.firstReqs || []).indexOf('getAllRecords') === -1, JSON.stringify(detail).slice(0, 120));
  t('⑦ 點 A → 返回 → 再點 A：TTL 內 0 request',
    !detail.setupFailed && (detail.secondReqs || []).length === 0, JSON.stringify(detail).slice(0, 120));

  /* ---- 8. API 失敗保留 last-known-good ---- */
  const failed = await page.evaluate(async () => {
    window.__failNext = 99;
    window.__requests = [];
    // 讓快取過期（直接改寫 fetchedAt）
    const key = 'lastperf-summary:2026-09-04';
    const raw = JSON.parse(localStorage.getItem(key));
    raw.fetchedAt = Date.now() - 600000;
    localStorage.setItem(key, JSON.stringify(raw));
    if (typeof _summaryCache !== 'undefined') delete _summaryCache['2026-09-04'];
    const d = document.getElementById('lastPerfDate') || document.getElementById('coachDate');
    if (d) d.value = '2026-09-04';
    await refreshTodayReportedList();
    window.__failNext = 0;
    return {
      list: (document.getElementById('todayReportedList') || {}).innerHTML || '',
      summary: (document.getElementById('lastPerfSummaryRow') || {}).innerHTML || '',
      fresh: (document.getElementById('lastPerfFreshness') || {}).textContent || ''
    };
  });
  t('⑧ API 失敗時保留最後成功的名單，不顯示成 0 人回報',
    (failed.list.match(/data-lastperf-student/g) || []).length === 51 && failed.summary.indexOf('>0<') === -1,
    String((failed.list.match(/data-lastperf-student/g) || []).length));
  t('   並明確標示不是即時資料',
    failed.fresh.indexOf('最後一次成功同步') !== -1 || failed.fresh.indexOf('更新中') !== -1,
    failed.fresh.slice(0, 60));

  /* ---- 教練回覆後快取要失效 ---- */
  const afterReply = await page.evaluate(async () => {
    invalidateDailySummaryCache('2026-09-04');
    const key = 'lastperf-summary:2026-09-04';
    return { cleared: localStorage.getItem(key) === null };
  });
  t('教練回覆後摘要快取會被作廢（否則會一直顯示「待回覆」）',
    afterReply.cleared === true, JSON.stringify(afterReply));

  /* ---- 9. 權限：非教練不得取得名單 ---- */
  const asStudent = await page.evaluate(async () => {
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'student', name: '選手1', authToken: 't' }));
    window.__requests = [];
    await refreshTodayReportedList();
    const panel = document.getElementById('lastPerfTodayPanel');
    const hidden = !panel || panel.style.display === 'none';
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 't' }));
    return { hidden, reqs: window.__requests.map(r => r.action) };
  });
  t('⑨ 非教練身分看不到今日名單面板，也不發出摘要請求',
    asStudent.hidden === true && asStudent.reqs.length === 0,
    JSON.stringify(asStudent));

  /* ---- payload 觀測（不得含學生內容）---- */
  const perf = await page.evaluate(() => {
    // 前一段測試刻意讓後端連續失敗，斷路器還開著就不會真的發出請求
    resetBackendCircuit();
    invalidateDailySummaryCache();
    const logs = [];
    const orig = console.debug;
    console.debug = (...a) => { logs.push(a.join(' ')); orig.apply(console, a); };
    window.TEAMPRO_FLAGS.DEBUG_PERFORMANCE = true;
    return refreshTodayReportedList({ force: true }).then(() => {
      window.TEAMPRO_FLAGS.DEBUG_PERFORMANCE = false;
      console.debug = orig;
      return logs.join('\n');
    });
  });
  const banned = ['選手1', '心得', 'reflection', 'painScore', '想放棄'];
  t('效能記錄只有技術數字，不含姓名或健康內容',
    banned.every(w => perf.indexOf(w) === -1), perf.slice(0, 120));
  t('效能記錄有帶 rowsScanned / rowsReturned',
    perf.indexOf('rowsScanned') !== -1 && perf.indexOf('rowsReturned') !== -1, perf.slice(0, 120));

  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
  console.log('');
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failedN = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failedN) + '/' + results.length + ' passed');
  await browser.close();
  process.exit(failedN || errors.length ? 1 : 0);
})();
