/* 真的在 Chromium 裡跑 fetchAllRecords 的分頁迴圈與欄位回填。
   後端截成假的多頁回應，驗證：串接順序、空欄位補回、快取分範圍、失敗原樣往上丟。 */
const { chromium } = require('playwright');
const path = require('path');

const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // 假後端：getAllRecords 切成 3 頁，並模擬 omitEmpty（空欄位不回傳）。
  await page.addInitScript(() => {
    window.__calls = [];
    const ROWS = [
      { recordId: 'r1', name: '甲', date: '2026-08-28', sleepHours: 7 },
      { recordId: 'r2', name: '乙', date: '2026-08-29' },
      { recordId: 'r3', name: '丙', date: '2026-08-30', sleepHours: 8 },
      { recordId: 'r4', name: '丁', date: '2026-08-31' },
      { recordId: 'r5', name: '戊', date: '2026-09-01', sleepHours: 6 }
    ];
    const FIELDS = ['recordId', 'name', 'date', 'sleepHours', 'studentLineText', 'painScore'];
    window.__failAt = null;
    const origFetch = window.fetch;
    window.fetch = (url, opt) => {
      if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
      const body = JSON.parse((opt && opt.body) || '{}');
      window.__calls.push(body);
      if (body.action !== 'getAllRecords') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] })));
      }
      const offset = Number(body.offset || 0);
      if (window.__failAt !== null && offset === window.__failAt) {
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: '登入已失效，請重新登入。', authRequired: true })));
      }
      const slice = ROWS.slice(offset, offset + 2);
      const next = offset + 2 < ROWS.length ? offset + 2 : null;
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        fields: FIELDS,
        total: ROWS.length,
        offset: offset,
        nextOffset: next,
        // omitEmpty：值是空的欄位根本不回傳
        data: slice.map(r => { const o = {}; Object.keys(r).forEach(k => { if (r[k] !== '') o[k] = r[k]; }); return o; })
      })));
    };
  });

  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof window.fetchAllRecords === 'function' || typeof fetchAllRecords === 'function');

  const out = await page.evaluate(async () => {
    window.__calls = [];
    invalidateAllRecordsCache();
    const all = await fetchAllRecords({ sinceDate: '2026-07-20', force: true });
    const calls = window.__calls.filter(c => c.action === 'getAllRecords');
    return {
      ids: all.map(r => r.recordId),
      count: all.length,
      offsets: calls.map(c => c.offset),
      firstCall: calls[0],
      // 關鍵性質：補回欄位後的物件，要和「後端原本就回整包空字串」的舊路徑逐鍵相同。
      // （painScore 這種欄位會被 normalizeCoachRecord 轉型，所以不能只比對空字串。）
      legacyEquivalent: JSON.stringify(all[1]) === JSON.stringify(normalizeCoachRecord({
        recordId: 'r2', name: '乙', date: '2026-08-29',
        sleepHours: '', studentLineText: '', painScore: ''
      })),
      sleepOfR2: all[1].sleepHours,
      hasStudentLineText: Object.prototype.hasOwnProperty.call(all[1], 'studentLineText')
    };
  });

  t('分頁會一路取到 nextOffset 為 null 為止', out.count === 5, out.count + ' 筆');
  t('串接後的順序與後端一致', out.ids.join(',') === 'r1,r2,r3,r4,r5', out.ids.join(','));
  t('offset 依序遞進，沒有重複或跳號', out.offsets.join(',') === '0,2,4', out.offsets.join(','));
  t('教練範圍會帶 sinceDate 與 omitFields',
    !!out.firstCall && out.firstCall.sinceDate === '2026-07-20'
      && Array.isArray(out.firstCall.omitFields) && out.firstCall.omitFields.indexOf('studentLineText') !== -1,
    JSON.stringify(out.firstCall));
  t('後端省略的空欄位被補回空字串（不是 undefined）',
    out.sleepOfR2 === '' && out.hasStudentLineText === true,
    JSON.stringify({ sleep: out.sleepOfR2, has: out.hasStudentLineText }));
  t('補回後的紀錄與舊的「整包空字串」路徑逐鍵相同',
    out.legacyEquivalent === true, String(out.legacyEquivalent));

  // 快取要依讀取範圍分開，完整歷史不能拿到教練視窗的結果
  const cache = await page.evaluate(async () => {
    window.__calls = [];
    invalidateAllRecordsCache();
    await fetchAllRecords({ sinceDate: '2026-07-20' });
    const afterCoach = window.__calls.filter(c => c.action === 'getAllRecords').length;
    await fetchAllRecords({ sinceDate: '2026-07-20' });            // 應該吃快取
    const afterRepeat = window.__calls.filter(c => c.action === 'getAllRecords').length;
    await fetchAllRecords();                                        // 完整歷史：不能吃到上面的快取
    const full = window.__calls.filter(c => c.action === 'getAllRecords');
    return { afterCoach, afterRepeat, fullHasSince: full.slice(afterRepeat).some(c => c.sinceDate) };
  });
  t('相同範圍的第二次呼叫吃快取，不再打後端', cache.afterRepeat === cache.afterCoach, cache.afterCoach + ' -> ' + cache.afterRepeat);
  t('完整歷史不會誤用教練視窗的快取，且不帶 sinceDate', cache.fullHasSince === false, JSON.stringify(cache));

  // 中途失敗要原樣往上丟，讓既有的 authRequired / strict 處理接手
  const fail = await page.evaluate(async () => {
    invalidateAllRecordsCache();
    window.__failAt = 2;
    try {
      await fetchAllRecords({ sinceDate: '2026-07-20', strict: true, force: true });
      return { threw: false };
    } catch (e) {
      return { threw: true, message: e && e.message };
    } finally {
      window.__failAt = null;
    }
  });
  t('第二頁 authRequired 時走既有錯誤處理，不會回半套資料',
    fail.threw === true && fail.message === 'AUTH_REQUIRED', JSON.stringify(fail));

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
