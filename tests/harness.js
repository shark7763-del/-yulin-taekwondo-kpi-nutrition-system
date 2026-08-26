/* ============================================================
   測試載入器 — 讓 node 能載入原本只跑在瀏覽器的全域腳本
   ------------------------------------------------------------
   這個專案刻意維持「HTML + CSS + Vanilla JS + Apps Script」架構，
   沒有 bundler、沒有 import/export，js/*.js 全部共用同一個全域作用域。
   為了在不改動任何產品程式碼的前提下做單元測試，這裡用 node 的 vm
   建立一個沙箱，塞進最小可用的 DOM/localStorage 假物件，再依 index.html
   的順序把檔案丟進同一個 context，最後從 context 取出要測的函式。

   用法：
     const { loadScripts } = require('./harness');
     const ctx = loadScripts(['js/02-core-utils.js']);
     ctx.computeSleepHours('23:00', '07:00');   // => 8
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');

/* ---------- 最小 DOM 假物件 ----------
   目的不是模擬瀏覽器，只是讓「載入時就執行」的那幾行不要爆掉。
   任何測試若真的依賴 DOM 行為，應該改測純函式，而不是把這裡養大。 */
function createFakeElement(id) {
  const el = {
    id: id || '',
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    checked: false,
    placeholder: '',
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
    click() {},
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    insertAdjacentHTML() {}
  };
  return el;
}

function createFakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    get length() { return map.size; },
    _dump() { return Object.fromEntries(map); }
  };
}

function createSandbox(extra) {
  const elements = new Map();
  const document = {
    readyState: 'complete',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createFakeElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return createFakeElement('<' + tag + '>'); },
    addEventListener() {},
    removeEventListener() {},
    body: createFakeElement('body'),
    head: createFakeElement('head'),
    documentElement: createFakeElement('html')
  };

  const sandbox = {
    console,
    document,
    localStorage: createFakeStorage(),
    sessionStorage: createFakeStorage(),
    navigator: { userAgent: 'node-test', onLine: true, clipboard: { writeText: async () => {} } },
    location: { href: 'http://localhost/', origin: 'http://localhost', reload() {} },
    fetch: async () => { throw new Error('fetch is not available in unit tests'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    // 這些測試不該真的送出網路請求，踩到就讓它明確炸掉而不是靜默通過
    XMLHttpRequest: function () { throw new Error('XMLHttpRequest is not available in unit tests'); },
    alert() {},
    confirm() { return true; },
    prompt() { return ''; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._elements = elements;
  Object.assign(sandbox, extra || {});
  return sandbox;
}

/* 依序把多個腳本載入同一個 context（模擬 index.html 的 <script> 順序）。
   回傳 context 本身，測試從上面取函式。 */
function loadScripts(relPaths, extra) {
  const sandbox = createSandbox(extra);
  const context = vm.createContext(sandbox);
  for (const rel of relPaths) {
    const abs = path.join(REPO_ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(code, context, { filename: rel });
    } catch (err) {
      throw new Error(`載入 ${rel} 失敗：${err.message}`);
    }
  }
  return context;
}

/* 只取單一檔案裡的某幾個純函式，避開前置檔的相依。
   做法：把整份原始碼跑進沙箱，若失敗則退回「只擷取指定函式定義」的模式。 */
function loadPureFunctions(relPath, names) {
  const abs = path.join(REPO_ROOT, relPath);
  const src = fs.readFileSync(abs, 'utf8');
  const sandbox = createSandbox();
  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(src, context, { filename: relPath });
  } catch (e) {
    // 整檔載入失敗（通常是相依於前置檔的頂層程式碼）→ 改抓函式原始碼
    const picked = names.map((n) => extractFunctionSource(src, n)).filter(Boolean).join('\n');
    vm.runInContext(picked, context, { filename: relPath + ' (extracted)' });
  }
  const out = {};
  for (const n of names) out[n] = context[n];
  const missing = names.filter((n) => typeof out[n] !== 'function');
  if (missing.length) throw new Error(`${relPath} 取不到函式：${missing.join(', ')}`);
  return out;
}

/* 從原始碼擷取一個具名 function 宣告（用大括號配對，忽略字串與註解） */
function extractFunctionSource(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  let i = src.indexOf('{', m.index);
  if (i === -1) return null;
  let depth = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

module.exports = { loadScripts, loadPureFunctions, extractFunctionSource, createSandbox, REPO_ROOT };
