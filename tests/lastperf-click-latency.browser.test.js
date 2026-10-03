/* 「上次表現」點選手的延遲 —— 2026-10 前端四項修正的回歸測試。
   在真的 Chromium 裡跑 index.html，所有送往 script.google.com 的請求都在
   addInitScript 攔截（不打正式後端），並記錄每個 action 的發出／完成時間。

   1. 特質資料與紀錄並行：getRecentRecordsByName 必須在 getAllStudentTraits 回應前就發出
   2. 未做測驗的選手重複點，不會每次重抓整份特質表
   3. 特質讀取失敗不清空既有快取，且下一次會重試
   4. 紀錄查詢失敗（查無）不快取 90 秒，恢復後再點會重新請求 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const TRAIT_CACHE_VERSION = '20260628-trait-fix-01';   // 必須與 js/11-trait-radar.js 一致（測試 3 有前置斷言釘住）
const TESTED = '選手1';      // 有做特質測驗
const UNTESTED = '選手2';    // 沒做特質測驗
const DAY = '2026-09-04';
const DAY2 = '2026-09-03';

const INIT = (opts) => {
  window.__log = [];                 // { action, sentAt, doneAt, failed }
  window.__delay = {};               // action -> ms
  window.__fail = {};                // action -> true（fetch 直接丟 TypeError，模擬斷線）
  window.__traits = [{
    studentName: '選手1', traitType: 'rocket', typeKey: 'rocket', traitLabel: '火箭測試型',
    traitSummary: '測試用特質摘要', communicationTips: '測試溝通建議', trainingTips: '測試訓練建議',
    updatedAt: '2026-09-01T00:00:00.000Z'
  }];
  if (opts && opts.seedTraitCache) {
    // 模擬「先前成功載入過」留在本機的特質快取（boot 時 loadLocalCache 會讀它）
    localStorage.setItem('yulin_trait_cache_version', opts.traitCacheVersion);
    localStorage.setItem('yulin_trait_cache', JSON.stringify({ '舊快取選手': {
      studentName: '舊快取選手', traitType: 'shield', typeKey: 'shield', traitLabel: '舊快取標籤',
      updatedAt: '2026-08-01T00:00:00.000Z'
    } }));
  }
  if (opts && opts.seedCoachRole) {
    // 模擬教練「已登入狀態下重新開啟頁面」：boot 時就是教練身分
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '教練', authToken: 'test-token' }));
  }
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    const entry = { action: body.action, name: body.name || '', sentAt: performance.now(), doneAt: null, failed: false };
    window.__log.push(entry);
    const ms = window.__delay[body.action] || 0;
    if (ms) await new Promise(r => setTimeout(r, ms));
    if (window.__fail[body.action]) {
      entry.failed = true; entry.doneAt = performance.now();
      throw new TypeError('Failed to fetch');
    }
    let payload;
    if (body.action === 'getAllStudentTraits') payload = { ok: true, traits: window.__traits.slice() };
    else if (body.action === 'getRecentRecordsByName') {
      payload = { ok: true, data: [0, 1, 2].map(d => {
        const dt = new Date(Date.UTC(2026, 8, 4 - d)).toISOString().slice(0, 10);
        return { recordId: body.name + '-' + d, name: body.name, studentName: body.name,
          date: dt, timestamp: dt + 'T08:00:00.000Z', totalScore: 80, averageScore: 4, status: '綠燈' };
      }) };
    } else payload = { ok: true, data: [] };
    entry.doneAt = performance.now();
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
  await page.waitForFunction(() => typeof loadLastPerfPage === 'function' && window.TraitRadar && typeof setRole === 'function');
  // boot 的背景工作先沉澱，再以 app 自己的 setRole 登入教練（含 authToken）
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await page.evaluate(() => {
    localStorage.setItem('yulin_players', JSON.stringify(Array.from({ length: 10 }, (_, i) => '選手' + (i + 1))));
    setRole('coach', '教練', { authToken: 'test-token' });
    window.__log = [];
  });
  return { page, context, errors };
}

// 在「上次表現」點一位選手：設定日期與姓名欄，並確認真的設定成功（防假通過）
const CLICK = async ({ name, date }) => {
  const d = document.getElementById('lastPerfDate');
  const n = document.getElementById('lastPerfName');
  if (!d || !n) return { setupFailed: '找不到 #lastPerfDate / #lastPerfName' };
  d.value = date; n.value = name;
  if (d.value !== date || n.value !== name) return { setupFailed: '欄位設定失敗 ' + d.value + ' / ' + n.value };
  const t0 = performance.now();
  await loadLastPerfPage();
  const ms = Math.round(performance.now() - t0);
  const box = document.getElementById('lastPerfResult');
  // renderStudentTraitCard 在 loadLastPerfPage 裡沒有被 await；有紀錄時特質卡可能稍後才插入，
  // 最多等 3 秒讓它出現，避免把「還沒插進來」誤判成「沒有特質卡」。
  if (box && box.innerHTML.indexOf('上次紀錄回顧') !== -1) {
    const until = performance.now() + 3000;
    while (box.innerHTML.indexOf('student-trait-card') === -1 && performance.now() < until) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  return { ms, html: box ? box.innerHTML : '' };
};

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  /* ---------- 1. 特質延遲 2 秒時，紀錄請求不可排在特質回應之後 ---------- */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async ({ CLICK_SRC, name, date }) => {
      const click = eval('(' + CLICK_SRC + ')');
      window.__delay.getAllStudentTraits = 2000;
      window.__log = [];
      const res = await click({ name, date });
      return { res, log: window.__log.slice() };
    }, { CLICK_SRC: CLICK.toString(), name: TESTED, date: DAY });
    const trait = r.log.find(e => e.action === 'getAllStudentTraits');
    const recs = r.log.find(e => e.action === 'getRecentRecordsByName');
    t('1 前置：選手欄位設定成功', !r.res.setupFailed, r.res.setupFailed || '');
    t('1 前置：本次確實有發出 getAllStudentTraits（否則量不到並行）', !!trait, JSON.stringify(r.log.map(e => e.action)));
    t('1 getRecentRecordsByName 在 getAllStudentTraits 回應完成之前就發出',
      !!trait && !!recs && trait.doneAt !== null && recs.sentAt < trait.doneAt,
      trait && recs ? `records.sentAt=${Math.round(recs.sentAt)} traits.doneAt=${Math.round(trait.doneAt)}` : 'missing');
    const html = r.res.html || '';
    t('1 畫面渲染了選手當天紀錄（不是查無）',
      html.indexOf('上次紀錄回顧') !== -1 && html.indexOf('查無') === -1, html.slice(0, 160));
    t('1 特質卡在渲染時已就緒：顯示該選手的特質標籤，而不是「尚未完成」',
      html.indexOf('student-trait-label') !== -1 && html.indexOf('火箭測試型') !== -1 && html.indexOf('尚未完成特質卡測驗') === -1,
      html.slice(html.indexOf('student-trait-card'), html.indexOf('student-trait-card') + 200));
    t('1 整體耗時不是兩段相加後再多（特質延遲 2 秒，總時間應接近 2 秒）', r.res.ms < 3500, String(r.res.ms));
    allErrors.push(...errors);
    await context.close();
  }

  /* ---------- 2. 未做測驗的選手點兩次，不重抓整份特質表 ---------- */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async ({ CLICK_SRC, name, d1, d2 }) => {
      const click = eval('(' + CLICK_SRC + ')');
      await window.TraitRadar.loadCache();            // 登入後第一次載入（成功、清單裡沒有這位選手）
      const warm = window.__log.filter(e => e.action === 'getAllStudentTraits').length;
      window.__log = [];
      const a = await click({ name, date: d1 });
      const afterFirst = window.__log.slice();
      window.__log = [];
      const b = await click({ name, date: d2 });       // 不同日期 → detail 快取不命中，真的走渲染路徑
      const afterSecond = window.__log.slice();
      return { warm, a, b, afterFirst, afterSecond };
    }, { CLICK_SRC: CLICK.toString(), name: UNTESTED, d1: DAY, d2: DAY2 });
    const cnt = (log, act) => log.filter(e => e.action === act).length;
    t('2 前置：登入後的特質載入確實打過一次後端', r.warm === 1, String(r.warm));
    t('2 前置：兩次點選都設定成功', !r.a.setupFailed && !r.b.setupFailed, (r.a.setupFailed || '') + (r.b.setupFailed || ''));
    t('2 前置：兩次都真的走了渲染路徑（各發 1 次 getRecentRecordsByName）',
      cnt(r.afterFirst, 'getRecentRecordsByName') === 1 && cnt(r.afterSecond, 'getRecentRecordsByName') === 1,
      JSON.stringify([r.afterFirst.map(e => e.action), r.afterSecond.map(e => e.action)]));
    t('2 兩次點選都顯示「尚未完成特質卡測驗」',
      (r.a.html || '').indexOf('尚未完成特質卡測驗') !== -1 && (r.b.html || '').indexOf('尚未完成特質卡測驗') !== -1, '');
    t('2 第一次點選：getAllStudentTraits 請求數不增加', cnt(r.afterFirst, 'getAllStudentTraits') === 0,
      JSON.stringify(r.afterFirst.map(e => e.action)));
    t('2 第二次點選：getAllStudentTraits 請求數不增加', cnt(r.afterSecond, 'getAllStudentTraits') === 0,
      JSON.stringify(r.afterSecond.map(e => e.action)));
    allErrors.push(...errors);
    await context.close();
  }

  /* ---------- 2b. 教練已登入狀態重開頁面：本機舊快取不可讓特質表永遠不更新 ----------
     boot 讀本機快取時 state.loaded 就是 true、loadCache 也不會打後端；
     這時第一次查不到的選手仍要抓一次整份表（之後才不重抓），否則新完成測驗的選手會一直顯示未測驗。 */
  {
    const { page, context, errors } = await openPage(browser, { seedTraitCache: true, traitCacheVersion: TRAIT_CACHE_VERSION, seedCoachRole: true });
    const r = await page.evaluate(async ({ CLICK_SRC, tested, untested, d1, d2 }) => {
      const click = eval('(' + CLICK_SRC + ')');
      const pre = !!window.TraitRadar.recordFor('舊快取選手') && !window.TraitRadar.recordFor(tested);
      window.__log = [];
      const a = await click({ name: tested, date: d1 });
      const first = window.__log.filter(e => e.action === 'getAllStudentTraits').length;
      window.__log = [];
      const b = await click({ name: untested, date: d1 });
      const c = await click({ name: untested, date: d2 });
      const later = window.__log.filter(e => e.action === 'getAllStudentTraits').length;
      return { pre, first, later, aHtml: a.html || '', setup: (a.setupFailed || '') + (b.setupFailed || '') + (c.setupFailed || '') };
    }, { CLICK_SRC: CLICK.toString(), tested: TESTED, untested: UNTESTED, d1: DAY, d2: DAY2 });
    t('2b 前置：重開頁面時只有本機舊快取（沒有 選手1）且欄位設定成功', r.pre === true && !r.setup, JSON.stringify(r).slice(0, 160));
    t('2b 舊快取裡沒有的選手：第一次仍會抓一次整份特質表', r.first === 1, String(r.first));
    t('2b 抓到後顯示新完成測驗選手的特質卡', r.aHtml.indexOf('火箭測試型') !== -1, '');
    t('2b 之後未測驗選手連點兩次：不再重抓', r.later === 0, String(r.later));
    allErrors.push(...errors);
    await context.close();
  }

  /* ---------- 3. 特質讀取失敗：保留既有快取、下一次重試 ---------- */
  {
    const { page, context, errors } = await openPage(browser, { seedTraitCache: true, traitCacheVersion: TRAIT_CACHE_VERSION });
    const r = await page.evaluate(async () => {
      const pre = !!window.TraitRadar.recordFor('舊快取選手');
      window.__fail.getAllStudentTraits = true;
      window.__log = [];
      await window.TraitRadar.loadCache();               // 教練身分第一次載入 → 失敗
      const failedReqs = window.__log.filter(e => e.action === 'getAllStudentTraits');
      const memKept = !!window.TraitRadar.recordFor('舊快取選手');
      let lsKept = false;
      try { lsKept = !!JSON.parse(localStorage.getItem('yulin_trait_cache') || '{}')['舊快取選手']; } catch (e) {}
      window.__fail.getAllStudentTraits = false;
      window.__log = [];
      await window.TraitRadar.loadCache();               // 非強制的下一次呼叫：應該重試
      const retryReqs = window.__log.filter(e => e.action === 'getAllStudentTraits').length;
      const fresh = !!window.TraitRadar.recordFor('選手1');
      let lsFresh = false;
      try { lsFresh = !!JSON.parse(localStorage.getItem('yulin_trait_cache') || '{}')['選手1']; } catch (e) {}
      return { pre, failedCount: failedReqs.length, failedFlag: failedReqs.every(e => e.failed), memKept, lsKept, retryReqs, fresh, lsFresh };
    });
    t('3 前置：boot 已從本機讀入既有特質快取（TRAIT_CACHE_VERSION 一致）', r.pre === true, JSON.stringify(r));
    t('3 前置：失敗那次確實發出請求且被模擬為失敗', r.failedCount >= 1 && r.failedFlag === true, JSON.stringify(r));
    t('3 失敗後記憶體中的既有特質快取仍在', r.memKept === true, JSON.stringify(r));
    t('3 失敗後 localStorage 的既有特質快取沒被覆寫成空的', r.lsKept === true, JSON.stringify(r));
    t('3 下一次（非強制）呼叫會重試 getAllStudentTraits', r.retryReqs === 1, JSON.stringify(r));
    t('3 重試成功後取得新資料並寫入本機', r.fresh === true && r.lsFresh === true, JSON.stringify(r));

    // 「成功但真的沒資料」照舊：清成空的並標記已載入（不會一直重打）
    const empty = await page.evaluate(async () => {
      window.__traits = [];
      window.__log = [];
      await window.TraitRadar.loadCache(true);
      const gone = !window.TraitRadar.recordFor('選手1');
      window.__log = [];
      await window.TraitRadar.loadCache();
      return { gone, again: window.__log.filter(e => e.action === 'getAllStudentTraits').length,
               ls: localStorage.getItem('yulin_trait_cache') };
    });
    t('3 成功但真的沒資料：照舊清空、寫入本機、標記已載入（不重打）',
      empty.gone === true && empty.again === 0 && empty.ls === '{}', JSON.stringify(empty));
    allErrors.push(...errors);
    await context.close();
  }

  /* ---------- 4. 紀錄查詢失敗 → 查無；恢復後 90 秒內再點會重新請求 ---------- */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async ({ CLICK_SRC, name, date }) => {
      const click = eval('(' + CLICK_SRC + ')');
      await window.TraitRadar.loadCache();
      window.__fail.getRecentRecordsByName = true;
      window.__log = [];
      const a = await click({ name, date });
      const firstLog = window.__log.slice();
      window.__fail.getRecentRecordsByName = false;
      window.__log = [];
      const b = await click({ name, date });            // 同一位、同一天、90 秒內
      const secondLog = window.__log.slice();
      return { a, b, firstLog, secondLog };
    }, { CLICK_SRC: CLICK.toString(), name: TESTED, date: DAY });
    t('4 前置：兩次點選都設定成功', !r.a.setupFailed && !r.b.setupFailed, (r.a.setupFailed || '') + (r.b.setupFailed || ''));
    t('4 前置：第一次的 getRecentRecordsByName 確實被模擬為失敗',
      r.firstLog.some(e => e.action === 'getRecentRecordsByName' && e.failed), JSON.stringify(r.firstLog));
    t('4 失敗時顯示「查無」', (r.a.html || '').indexOf('查無') !== -1, (r.a.html || '').slice(0, 120));
    t('4 恢復後再點同一位（90 秒內）會重新發出 getRecentRecordsByName',
      r.secondLog.filter(e => e.action === 'getRecentRecordsByName').length === 1, JSON.stringify(r.secondLog.map(e => e.action)));
    t('4 恢復後顯示選手資料，不再是查無',
      (r.b.html || '').indexOf('上次紀錄回顧') !== -1 && (r.b.html || '').indexOf('查無') === -1, (r.b.html || '').slice(0, 120));

    // 有資料的結果仍照舊快取（第三次點：0 個紀錄請求）
    const third = await page.evaluate(async ({ CLICK_SRC, name, date }) => {
      const click = eval('(' + CLICK_SRC + ')');
      window.__log = [];
      const c = await click({ name, date });
      return { c, log: window.__log.map(e => e.action) };
    }, { CLICK_SRC: CLICK.toString(), name: TESTED, date: DAY });
    t('4 有資料的結果仍照舊快取：第三次點 0 個 getRecentRecordsByName',
      !third.c.setupFailed && third.log.filter(a => a === 'getRecentRecordsByName').length === 0 &&
      (third.c.html || '').indexOf('上次紀錄回顧') !== -1, JSON.stringify(third.log));
    allErrors.push(...errors);
    await context.close();
  }

  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
  console.log('');
  if (allErrors.length) { console.log('PAGE ERRORS:'); allErrors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failedN = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failedN) + '/' + results.length + ' passed');
  await browser.close();
  process.exit(failedN || allErrors.length ? 1 : 0);
})();
