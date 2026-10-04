/* TeamPro 2.0 Phase 5 回歸測試：心理模組批次儲存改成並行（真的 Chromium 跑 index.html，後端全攔截）。

   P. 自我對話 10 個情境、心理計畫多個情境：所有寫入在第一筆回來前就全部發出，
      總時間接近單筆延遲，不是 N 倍。
   O. 全部寫入完成後才重讀（loadAndDraw），不會讀到寫一半的狀態。
   F. 部分失敗：失敗的那幾筆各自落回本機，成功的不受影響（與原本逐筆行為相同）。
   C. 每筆內容正確送出（情境、文字不串台）。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });
const NAME = '甲同學';
const SAVE_DELAY = 600;

const INIT = ({ name }) => {
  localStorage.setItem('yulin_role', JSON.stringify({ role: 'student', name, authToken: 's-token', studentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }));
  window.__log = [];
  window.__failSituations = [];
  window.__saveDelay = 0;
  const t0 = performance.now();
  const origFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
    const body = JSON.parse((opt && opt.body) || '{}');
    const p = body.payload || {};
    const entry = { action: body.action, key: p.situationType || p.scenario || p.goalText || '', text: p.replacementPhrase || p.expectedThought || '',
      sentAt: performance.now() - t0, doneAt: null };
    window.__log.push(entry);
    let payload;
    if (/^saveMental/.test(body.action)) {
      await new Promise(r => setTimeout(r, window.__saveDelay));
      entry.doneAt = performance.now() - t0;
      if (window.__failSituations.indexOf(entry.key) !== -1) throw new TypeError('Failed to fetch');
      payload = { ok: true, data: Object.assign({}, p) };
    } else if (body.action === 'getMentalCompetitions') {
      payload = { ok: true, data: [{ competitionId: 'C1', competitionName: '測試盃', competitionDate: '2030-01-01', status: 'active' }] };
    } else if (body.action === 'getMentalParticipantPlan') {
      payload = { ok: true, data: { selfTalk: [], goals: [], scenarioPlans: [], reflections: [], dailyRecords: [] } };
    } else payload = { ok: true, data: [] };
    entry.doneAt = entry.doneAt || (performance.now() - t0);
    return new Response(JSON.stringify(Object.assign({ apiVersion: window.APP_VERSION }, payload)));
  };
};

async function openMental(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT, { name: NAME });
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.MentalPreparation && typeof window.MentalPreparation.render === 'function');
  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1000));
    const b = document.querySelector('.tab-btn[data-tab="mental-preparation"]');
    if (b) b.click(); else await window.MentalPreparation.render();
  });
  await page.waitForSelector('#mpSaveTalk', { timeout: 8000 });
  return { page, context, errors };
}

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  /* P / O / C：自我對話 10 筆 */
  {
    const { page, context, errors } = await openMental(browser);
    const r = await page.evaluate(async (delay) => {
      const pos = Array.from(document.querySelectorAll('.mp-talk-pos'));
      pos.forEach((el, i) => { el.value = '口令-' + el.dataset.talk; });
      window.__saveDelay = delay;
      window.__log = [];
      const t0 = performance.now();
      document.getElementById('mpSaveTalk').click();
      // 等到重讀發生（loadAndDraw 會再打 getMentalCompetitions）
      for (let i = 0; i < 100; i++) {
        if (window.__log.some(e => e.action === 'getMentalCompetitions')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const ms = performance.now() - t0;
      const saves = window.__log.filter(e => e.action === 'saveMentalSelfTalk');
      const reread = window.__log.find(e => e.action === 'getMentalCompetitions');
      return {
        inputs: pos.length, ms, n: saves.length,
        lastSent: Math.max(...saves.map(e => e.sentAt)), firstDone: Math.min(...saves.map(e => e.doneAt || 1e9)),
        lastDone: Math.max(...saves.map(e => e.doneAt || 0)), rereadAt: reread ? reread.sentAt : null,
        pairsOk: saves.every(e => e.text === '口令-' + e.key), keys: saves.map(e => e.key)
      };
    }, SAVE_DELAY);
    t('前置：自我對話有 10 個輸入框', r.inputs === 10, String(r.inputs));
    t('C 10 筆都送出且情境與文字對得上', r.n === 10 && r.pairsOk && new Set(r.keys).size === 10, JSON.stringify(r.keys));
    t('P 全部在第一筆回來前就發出（並行）', r.lastSent < r.firstDone, JSON.stringify({ lastSent: r.lastSent, firstDone: r.firstDone }));
    t('P 總時間接近單筆延遲（< 3 倍，逐筆約 10 倍）', r.ms < SAVE_DELAY * 3, String(Math.round(r.ms)));
    t('O 全部寫完才重讀', r.rereadAt !== null && r.rereadAt >= r.lastDone, JSON.stringify({ rereadAt: r.rereadAt, lastDone: r.lastDone }));
    allErrors.push(...errors); await context.close();
  }

  /* F：其中兩筆失敗 → 這兩筆落回本機，另外 8 筆走雲端 */
  {
    const { page, context, errors } = await openMental(browser);
    const r = await page.evaluate(async (name) => {
      const pos = Array.from(document.querySelectorAll('.mp-talk-pos'));
      pos.forEach(el => { el.value = '口令-' + el.dataset.talk; });
      const failing = [pos[1].dataset.talk, pos[4].dataset.talk];
      window.__failSituations = failing;
      window.__saveDelay = 100;
      window.__log = [];
      document.getElementById('mpSaveTalk').click();
      for (let i = 0; i < 100; i++) {
        if (window.__log.some(e => e.action === 'getMentalCompetitions')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      await new Promise(r => setTimeout(r, 200));
      let local = [];
      try {
        const all = JSON.parse(localStorage.getItem('yulin_mental_local_v2')) || {};
        local = ((all.byStudent || {})[name] || {}).selfTalk || [];
      } catch (e) {}
      return { failing, localKeys: local.map(x => x.situationType), sent: window.__log.filter(e => e.action === 'saveMentalSelfTalk').length };
    }, NAME);
    t('F 10 筆都有嘗試送出', r.sent === 10, String(r.sent));
    t('F 失敗的兩筆各自落回本機，成功的不進本機',
      r.localKeys.length === 2 && r.failing.every(k => r.localKeys.indexOf(k) !== -1), JSON.stringify(r));
    allErrors.push(...errors); await context.close();
  }

  /* 心理計畫：多情境並行 */
  {
    const { page, context, errors } = await openMental(browser);
    const r = await page.evaluate(async (delay) => {
      const thoughts = Array.from(document.querySelectorAll('.mp-plan-thought'));
      thoughts.forEach(el => { el.value = '想法-' + el.dataset.scenario; });
      window.__saveDelay = delay;
      window.__log = [];
      const t0 = performance.now();
      document.getElementById('mpSavePlans').click();
      for (let i = 0; i < 100; i++) {
        if (window.__log.some(e => e.action === 'getMentalCompetitions')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const saves = window.__log.filter(e => e.action === 'saveMentalScenarioPlan');
      return { inputs: thoughts.length, n: saves.length, ms: performance.now() - t0,
        lastSent: Math.max(...saves.map(e => e.sentAt)), firstDone: Math.min(...saves.map(e => e.doneAt || 1e9)),
        pairsOk: saves.every(e => e.text === '想法-' + e.key) };
    }, SAVE_DELAY);
    t('計畫 前置：有多個情境', r.inputs >= 3 && r.n === r.inputs, JSON.stringify(r));
    t('計畫 並行送出、內容不串台', r.lastSent < r.firstDone && r.pairsOk, JSON.stringify(r));
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
