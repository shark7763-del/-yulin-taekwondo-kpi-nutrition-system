/* ============================================================
   00 — 全域錯誤攔截與診斷黑盒子
   ------------------------------------------------------------
   必須是 index.html 裡「第一支」載入的腳本。

   為什麼需要它：
   這個專案沒有 build step、沒有錯誤回報服務，任何未捕捉的例外只會靜靜地
   讓畫面半殘（按鈕沒反應、送出後沒有回饋卡），教練與選手描述成「閃退」，
   但我們拿不到任何證據。這支腳本把「發生了什麼」記在本機環形緩衝區，
   教練後台可以一鍵匯出，讓下次回報從猜測變成可查證。

   設計原則：
   1. 它自己絕對不能丟例外 —— 每一處都包 try/catch，失敗就安靜放棄。
   2. 不送任何資料到外部 —— 全部留在使用者裝置，避免把選手個資外流。
   3. 有上限 —— 環形緩衝最多 MAX_ENTRIES 筆，且總量超過上限就丟最舊的，
      不會把 localStorage 塞爆（塞爆本身就是當機原因之一）。

   對外介面：window.TeamProDiag
     .log(kind, detail)   手動記一筆
     .list()              取出所有紀錄
     .exportText()        產生可貼給工程師的純文字報告
     .clear()             清空
     .safeSetItem(k, v)   有配額防護的 localStorage 寫入（回傳 true/false）
     .storageUsage()      目前 localStorage 用量估計
   ============================================================ */
(function () {
  'use strict';

  var LOG_KEY = 'teampro_diag_log';
  var MAX_ENTRIES = 60;
  var MAX_TEXT = 400;          // 單筆訊息截斷長度，避免一筆巨大堆疊吃光空間
  var booted = new Date();

  function clip(s) {
    try {
      var t = String(s == null ? '' : s);
      return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '…(截斷)' : t;
    } catch (e) { return ''; }
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function readLog() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeLog(arr) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      // 寫不進去通常代表配額已滿 —— 砍半再試一次，仍失敗就放棄
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-Math.floor(MAX_ENTRIES / 2))));
        return true;
      } catch (e2) { return false; }
    }
  }

  /* 目前登入身分（若還沒載入 09-settings-auth.js 就回傳 unknown） */
  function currentRole() {
    try {
      var raw = localStorage.getItem('yulin_role');
      if (!raw) return 'unknown';
      var o = JSON.parse(raw);
      return (o && o.role) ? String(o.role) : 'unknown';
    } catch (e) { return 'unknown'; }
  }

  function log(kind, detail) {
    try {
      var arr = readLog();
      arr.push({
        at: nowIso(),
        kind: String(kind || 'info'),
        role: currentRole(),
        detail: clip(detail)
      });
      while (arr.length > MAX_ENTRIES) arr.shift();
      writeLog(arr);
    } catch (e) { /* 診斷工具本身不得影響主流程 */ }
  }

  /* ---------- 使用者看得懂的錯誤提示 ----------
     教練不該看到 "TypeError: x is undefined"。
     這裡只在真的壞掉時顯示一條可關閉的橫幅，並說明資料狀態。 */
  var bannerShown = false;
  function showFriendlyBanner() {
    if (bannerShown) return;
    bannerShown = true;
    try {
      var bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:99999',
        'background:#7f1d1d', 'color:#fff', 'padding:12px 16px',
        'font-size:14px', 'line-height:1.6', 'box-shadow:0 -2px 12px rgba(0,0,0,.35)'
      ].join(';');
      bar.innerHTML =
        '<b>畫面剛才出了點狀況</b>　'
        + '你剛才的操作可能沒有完成，請重新整理後再試一次。'
        + '<button type="button" style="margin-left:12px;padding:4px 10px;border:0;border-radius:6px;cursor:pointer">重新整理</button>'
        + '<button type="button" style="margin-left:8px;padding:4px 10px;border:0;border-radius:6px;background:transparent;color:#fff;cursor:pointer">關閉</button>';
      var btns = bar.getElementsByTagName('button');
      btns[0].onclick = function () { try { location.reload(); } catch (e) {} };
      btns[1].onclick = function () { try { bar.parentNode.removeChild(bar); } catch (e) {} };
      (document.body || document.documentElement).appendChild(bar);
    } catch (e) { /* 連橫幅都做不出來就算了，至少 log 已經寫進去 */ }
  }

  /* ---------- 掛上全域攔截 ---------- */
  try {
    window.addEventListener('error', function (ev) {
      // 資源載入失敗（img/script 404）沒有 ev.error，分開記錄
      if (ev && ev.target && ev.target !== window && (ev.target.src || ev.target.href)) {
        log('resource-error', (ev.target.tagName || '') + ' ' + (ev.target.src || ev.target.href));
        return;
      }
      var msg = ev && ev.message ? ev.message : 'unknown error';
      var where = ev ? (ev.filename || '') + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0) : '';
      var stack = (ev && ev.error && ev.error.stack) ? ev.error.stack : '';
      log('js-error', msg + ' @ ' + where + (stack ? '\n' + stack : ''));
      showFriendlyBanner();
    }, true);
  } catch (e) {}

  try {
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev ? ev.reason : null;
      var msg = (r && r.message) ? r.message : String(r);
      var stack = (r && r.stack) ? r.stack : '';
      log('promise-rejection', msg + (stack ? '\n' + stack : ''));
      // 未處理的 promise 失敗最常見於送出流程中途斷掉，使用者一定要知道
      showFriendlyBanner();
    });
  } catch (e) {}

  /* ---------- 記錄「這次是怎麼進來的」 ----------
     閃退調查的關鍵證據：頁面是正常開啟、重新整理、還是被 Service Worker 重載。 */
  try {
    var navType = 'unknown';
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type) navType = nav.type;                 // navigate / reload / back_forward
    } catch (e) {}
    var controlled = false;
    try { controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (e) {}
    log('boot', 'nav=' + navType
      + ' swControlled=' + controlled
      + ' ua=' + clip((navigator && navigator.userAgent) || '').slice(0, 120)
      + ' standalone=' + (function () {
          try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone; }
          catch (e) { return false; }
        })()
      + ' viewport=' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0));
  } catch (e) {}

  /* 頁面被關閉/隱藏時記一筆，用來分辨「使用者自己離開」與「瀏覽器砍掉分頁」。
     若下一次 boot 前沒有對應的 pagehide，代表上一次是異常終止（OOM 或當機）。 */
  try {
    window.addEventListener('pagehide', function () { log('pagehide', 'normal'); });
  } catch (e) {}

  /* ---------- 有配額防護的 localStorage 寫入 ----------
     專案裡多處 localStorage.setItem 沒有 try/catch，配額滿時會把例外丟進
     呼叫端（例如送出流程），導致後續的回饋卡完全不執行。
     提供這個安全版本供各模組改用。 */
  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      log('storage-quota', 'setItem 失敗 key=' + key + ' err=' + (e && e.name));
      return false;
    }
  }

  function storageUsage() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k) || '';
        total += k.length + v.length;
      }
    } catch (e) {}
    return { bytes: total * 2, kb: Math.round((total * 2) / 1024) };   // UTF-16，約略值
  }

  function exportText() {
    var lines = [];
    try {
      var u = storageUsage();
      lines.push('TeamPro 診斷紀錄');
      lines.push('匯出時間：' + nowIso());
      lines.push('本次開啟：' + booted.toISOString());
      lines.push('localStorage 用量：約 ' + u.kb + ' KB');
      lines.push('身分：' + currentRole());
      lines.push('瀏覽器：' + ((navigator && navigator.userAgent) || ''));
      lines.push('—'.repeat(40));
      readLog().forEach(function (e) {
        lines.push('[' + e.at + '] (' + e.role + ') ' + e.kind);
        if (e.detail) lines.push('    ' + String(e.detail).replace(/\n/g, '\n    '));
      });
    } catch (e) {
      lines.push('匯出時發生錯誤：' + e);
    }
    return lines.join('\n');
  }

  window.TeamProDiag = {
    log: log,
    list: readLog,
    exportText: exportText,
    clear: function () { try { localStorage.removeItem(LOG_KEY); } catch (e) {} },
    safeSetItem: safeSetItem,
    storageUsage: storageUsage
  };
})();
