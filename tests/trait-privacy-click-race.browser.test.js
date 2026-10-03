/* 2026-10 兩項修正的回歸測試（真的 Chromium 跑 index.html，script.google.com 全部在頁內攔截）。

   P. 特質快取隱私：同一台裝置教練留下的全隊特質快取（yulin_trait_cache），
      非教練（家長／選手／未登入）開頁時只能留下自己那一筆 —— 記憶體與 localStorage 都是。
      教練路徑不受影響。
   R. 連點保護：教練點 A（較慢）後馬上點 B，A 較晚回來時不可蓋掉 B 的畫面。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const TRAIT_CACHE_VERSION = '20260628-trait-fix-01';   // 必須與 js/11-trait-radar.js 一致（下方有前置斷言釘住）
const DAY = '2026-09-04';

const INIT = (opts) => {
  window.__log = [];
  window.__delayByName = {};         // getRecentRecordsByName：name -> ms
  window.__failTraits = !!opts.failTraits;
  if (opts.seedTeamCache) {
    // 模擬教練用過這台裝置：本機留著全隊特質快取
    localStorage.setItem('yulin_trait_cache_version', opts.traitCacheVersion);
    const team = {};
    ['選手1', '選手2', '選手3'].forEach((n, i) => {
      team[n] = { studentName: n, traitType: 'rocket', typeKey: 'rocket', traitLabel: '快取標籤' + (i + 1),
        updatedAt: '2026-08-01T00:00:00.000Z' };
    });
    localStorage.setItem('yulin_trait_cache', JSON.stringify(team));
  }
  if (opts.bootRole) localStorage.setItem('yulin_role', JSON.stringify(opts.bootRole));
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__log.push({ action: body.action, name: body.name || '' });
    let payload;
    if (body.action === 'getAllStudentTraits') {
      if (window.__failTraits) throw new TypeError('Failed to fetch');
      payload = { ok: true, traits: [] };
    } else if (body.action === 'getStudentTrait') {
      payload = { ok: true, data: null };
    } else if (body.action === 'getRecentRecordsByName') {
      const ms = window.__delayByName[body.name] || 0;
      if (ms) await new Promise(r => setTimeout(r, ms));
      payload = { ok: true, data: [{ recordId: body.name + '-0', name: body.name, studentName: body.name,
        date: '2026-09-04', timestamp: '2026-09-04T08:00:00.000Z', totalScore: 80, averageScore: 4, status: '綠燈' }] };
    } else payload = { ok: true, data: [] };
    return new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, payload)));
  };
};

async function openPage(browser, opts) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT, Object.assign({ traitCacheVersion: TRAIT_CACHE_VERSION }, opts || {}));
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof loadLastPerfPage === 'function' && window.TraitRadar && typeof setRole === 'function');
  await page.evaluate(() => new Promise(r => setTimeout(r, 600)));   // boot 的 loadLocalCache / loadCache 沉澱
  return { page, context, errors };
}

const snapshot = () => {
  let stored = null;
  try { stored = Object.keys(JSON.parse(localStorage.getItem('yulin_trait_cache') || '{}')).sort(); } catch (e) { stored = 'PARSE_ERROR'; }
  const has = n => !!(window.TraitRadar.recordFor(n));
  return { stored, mem: { p1: has('選手1'), p2: has('選手2'), p3: has('選手3') } };
};

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  /* 前置：測試用的快取版本必須與程式一致，否則 ensureTraitCacheVersion 會把種子快取清掉，P 系列會假通過 */
  {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', '11-trait-radar.js'), 'utf8');
    t('前置：TRAIT_CACHE_VERSION 與 js/11 一致', src.indexOf("TRAIT_CACHE_VERSION = '" + TRAIT_CACHE_VERSION + "'") !== -1);
  }

  /* P1 家長（孩子是選手1）在教練用過的裝置上開頁 */
  {
    const { page, context, errors } = await openPage(browser, {
      seedTeamCache: true, bootRole: { role: 'parent', name: '選手1', authToken: 'p-token' } });
    const s = await page.evaluate(snapshot);
    t('P1 家長：記憶體只有自己孩子的特質', s.mem.p1 === true && s.mem.p2 === false && s.mem.p3 === false, JSON.stringify(s.mem));
    t('P1 家長：localStorage 全隊快取被覆寫成只剩自己孩子', JSON.stringify(s.stored) === JSON.stringify(['選手1']), JSON.stringify(s.stored));
    allErrors.push(...errors); await context.close();
  }

  /* P2 選手（選手2）在教練用過的裝置上開頁 */
  {
    const { page, context, errors } = await openPage(browser, {
      seedTeamCache: true, bootRole: { role: 'student', name: '選手2', authToken: 's-token' } });
    const s = await page.evaluate(snapshot);
    t('P2 選手：查不到隊友的特質', s.mem.p1 === false && s.mem.p3 === false, JSON.stringify(s.mem));
    t('P2 選手：localStorage 不再有隊友的特質', Array.isArray(s.stored) && s.stored.indexOf('選手1') === -1 && s.stored.indexOf('選手3') === -1, JSON.stringify(s.stored));
    allErrors.push(...errors); await context.close();
  }

  /* P3 未登入（登入畫面）：一筆都不留 */
  {
    const { page, context, errors } = await openPage(browser, { seedTeamCache: true });
    const s = await page.evaluate(snapshot);
    t('P3 未登入：記憶體沒有任何人的特質', !s.mem.p1 && !s.mem.p2 && !s.mem.p3, JSON.stringify(s.mem));
    t('P3 未登入：localStorage 全隊快取已清空', JSON.stringify(s.stored) === '[]', JSON.stringify(s.stored));
    allErrors.push(...errors); await context.close();
  }

  /* P4 教練路徑不變：後端特質讀取失敗時，仍保有本機的全隊快取 */
  {
    const { page, context, errors } = await openPage(browser, {
      seedTeamCache: true, failTraits: true, bootRole: { role: 'coach', name: '教練', authToken: 'c-token' } });
    const s = await page.evaluate(snapshot);
    t('P4 教練：全隊快取仍在（記憶體）', s.mem.p1 && s.mem.p2 && s.mem.p3, JSON.stringify(s.mem));
    t('P4 教練：全隊快取仍在（localStorage）', JSON.stringify(s.stored) === JSON.stringify(['選手1', '選手2', '選手3']), JSON.stringify(s.stored));
    allErrors.push(...errors); await context.close();
  }

  /* R1 連點：A 慢 1.5 秒，B 立即；最後畫面必須是 B */
  {
    const { page, context, errors } = await openPage(browser);
    const r = await page.evaluate(async (date) => {
      localStorage.setItem('yulin_players', JSON.stringify(['選手A', '選手B']));
      setRole('coach', '教練', { authToken: 'test-token' });
      if (window.TraitRadar) await window.TraitRadar.loadCache(true);
      const rendered = [];
      const orig = window.renderLastReviewInto;
      window.renderLastReviewInto = function (rec, box) { rendered.push(rec && rec.name); return orig.apply(this, arguments); };
      window.__delayByName['選手A'] = 1500;
      const d = document.getElementById('lastPerfDate');
      const n = document.getElementById('lastPerfName');
      d.value = date;
      if (d.value !== date) return { setupFailed: 'date' };
      n.value = '選手A';
      if (n.value !== '選手A') return { setupFailed: 'nameA' };
      const pA = loadLastPerfPage();
      await new Promise(r => setTimeout(r, 100));
      n.value = '選手B';
      const pB = loadLastPerfPage();
      const [ra, rb] = await Promise.all([pA, pB]);
      await new Promise(r => setTimeout(r, 200));
      return { ra, rb, rendered, sentA: window.__log.some(e => e.action === 'getRecentRecordsByName' && e.name === '選手A') };
    }, DAY);
    t('R1 前置：欄位設定成功、A 的請求確實有發出', !r.setupFailed && r.sentA === true, JSON.stringify(r));
    t('R1 B 有被渲染', Array.isArray(r.rendered) && r.rendered.indexOf('選手B') !== -1, JSON.stringify(r.rendered));
    t('R1 A 較晚回來，沒有被渲染（不會蓋掉 B）', Array.isArray(r.rendered) && r.rendered.indexOf('選手A') === -1, JSON.stringify(r.rendered));
    t('R1 被取代的 A 回傳 false，B 不是 false', r.ra === false && r.rb !== false, JSON.stringify({ ra: r.ra, rb: r.rb }));
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
