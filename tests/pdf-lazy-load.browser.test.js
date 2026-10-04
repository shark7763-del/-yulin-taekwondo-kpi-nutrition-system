/* TeamPro 2.0 Phase 6（C-2）回歸測試：html2pdf 改為按需載入。
   CDN 用 page.route 攔截（不依賴網路），後端全攔截。

   L1 開頁不再下載 html2pdf（原本所有人每次開頁 906KB、會擋渲染）
   L2 第一次呼叫才載入；同時呼叫兩次只下載一次
   L3 載入失敗回 false（呼叫端會退回列印），而且下一次可以重試成功
   L4 兩個 PDF 匯出點（月報、選手日誌）都走 ensurePdfLib */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const CDN = /cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf\.js/;
const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok: ok === true, extra });

const STUB = 'window.html2pdf = function () { return { set: function () { return this; }, from: function () { return this; }, save: function () { return Promise.resolve(); } }; };' +
  'window.html2canvas = function () { return Promise.resolve(document.createElement("canvas")); };' +
  'window.jspdf = { jsPDF: function () {} };';

async function openPage(browser, mode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const cdnHits = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await context.route(CDN, async route => {
    cdnHits.push(Date.now());
    if (mode.fail && mode.fail > 0) { mode.fail--; return route.abort('failed'); }
    await new Promise(r => setTimeout(r, 200));
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB });
  });
  await page.addInitScript(() => {
    const origFetch = window.fetch;
    window.fetch = async (url, opt) => {
      if (String(url).indexOf('script.google.com') === -1) return origFetch(url, opt);
      return new Response(JSON.stringify({ ok: true, data: [], apiVersion: window.APP_VERSION }));
    };
  });
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof window.ensurePdfLib === 'function');
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
  return { page, context, errors, cdnHits };
}

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  {
    const { page, context, errors, cdnHits } = await openPage(browser, {});
    const boot = await page.evaluate(() => ({ lib: typeof window.html2pdf, tag: !!document.querySelector('script[src*="html2pdf"]') }));
    t('L1 開頁沒有下載 html2pdf', cdnHits.length === 0 && boot.lib === 'undefined' && !boot.tag, JSON.stringify({ hits: cdnHits.length, boot }));
    const r = await page.evaluate(async () => {
      const [a, b] = await Promise.all([window.ensurePdfLib(), window.ensurePdfLib()]);
      const c = await window.ensurePdfLib();
      return { a, b, c, lib: typeof window.html2pdf, h2c: typeof window.html2canvas };
    });
    t('L2 呼叫後載入成功，三次都回 true', r.a === true && r.b === true && r.c === true && r.lib === 'function' && r.h2c === 'function', JSON.stringify(r));
    t('L2 同時呼叫兩次＋之後再呼叫：只下載一次', cdnHits.length === 1, String(cdnHits.length));
    allErrors.push(...errors); await context.close();
  }

  {
    const mode = { fail: 1 };
    const { page, context, errors, cdnHits } = await openPage(browser, mode);
    const r = await page.evaluate(async () => {
      const first = await window.ensurePdfLib();
      const leftover = document.querySelectorAll('script[src*="html2pdf"]').length;
      const second = await window.ensurePdfLib();
      return { first, leftover, second, lib: typeof window.html2pdf };
    });
    t('L3 載入失敗回 false（呼叫端退回列印），且不留失敗的 script 標籤', r.first === false && r.leftover === 0, JSON.stringify(r));
    t('L3 失敗後再按一次可以重試成功', r.second === true && r.lib === 'function' && cdnHits.length === 2, JSON.stringify({ r, hits: cdnHits.length }));
    allErrors.push(...errors); await context.close();
  }

  {
    const mr = fs.readFileSync(path.join(ROOT, 'monthly-report.js'), 'utf8');
    const j08 = fs.readFileSync(path.join(ROOT, 'js', '08-profile-journal.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const dl = mr.slice(mr.indexOf('async function downloadMonthlyReportPdf'), mr.indexOf('function printMonthlyReport'));
    const jd = j08.slice(j08.indexOf('async function downloadPDF'), j08.indexOf('async function downloadPDF') + 900);
    t('L4 月報 PDF 會呼叫 ensurePdfLib，失敗退回列印', /await ensurePdfLib\(\)/.test(dl) && /printMonthlyReport\(\)/.test(dl), '');
    t('L4 選手日誌 PDF 會呼叫 ensurePdfLib', /ensurePdfLib\(\)/.test(jd), '');
    t('L4 index.html 不再同步載入 html2pdf', !/<script[^>]+html2pdf/.test(html), '');
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
