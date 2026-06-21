/* ============================================================
   運動心理小卡（抽卡＋集卡＋連續天數加成）前端模組
   ------------------------------------------------------------
   獨立模組，純前端 localStorage，不依賴後端、不改 app.js 核心。
   觸發：app.js 每日回報送出成功後呼叫 window.PsychCards.onReportSubmitted(name)。
   設計：每天一抽，連續回報天數越高，抽到稀有卡機率越高；可集滿一套牌組。
   讀取 app.js 全域：toast（可選）。
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'yulin_psych_cards';

  // 牌組：五大運動心理主題 × 稀有度（common/rare/epic）
  var THEMES = {
    focus: { name: '專注', emoji: '🎯', color: '#2e7dd1' },
    stress: { name: '抗壓', emoji: '🛡️', color: '#16a085' },
    confidence: { name: '自信', emoji: '🦁', color: '#e67e22' },
    recovery: { name: '恢復', emoji: '🌿', color: '#27ae60' },
    drive: { name: '鬥志', emoji: '🔥', color: '#e23b3b' }
  };
  var RARITY = {
    common: { label: '一般', cls: 'r-common', stars: '★' },
    rare: { label: '稀有', cls: 'r-rare', stars: '★★' },
    epic: { label: '傳說', cls: 'r-epic', stars: '★★★' }
  };

  var DECK = [
    // 專注
    { id: 'f1', t: 'focus', r: 'common', q: '把注意力放回呼吸，再放回動作。' },
    { id: 'f2', t: 'focus', r: 'common', q: '一次只想一件事，這一腳。' },
    { id: 'f3', t: 'focus', r: 'rare', q: '分心是正常的，把它拉回來就是訓練。' },
    { id: 'f4', t: 'focus', r: 'epic', q: '最強的專注，是失誤後立刻回到當下。' },
    // 抗壓
    { id: 's1', t: 'stress', r: 'common', q: '緊張代表你在乎，深呼吸三次。' },
    { id: 's2', t: 'stress', r: 'common', q: '壓力來的時候，先放鬆肩膀。' },
    { id: 's3', t: 'stress', r: 'rare', q: '比賽的心跳，是身體在幫你準備。' },
    { id: 's4', t: 'stress', r: 'epic', q: '真正的強者，是在害怕時還能出手。' },
    // 自信
    { id: 'c1', t: 'confidence', r: 'common', q: '你練過的，身體都記得。' },
    { id: 'c2', t: 'confidence', r: 'common', q: '抬頭、挺胸，先讓姿勢自信起來。' },
    { id: 'c3', t: 'confidence', r: 'rare', q: '不用完美，只要比昨天好一點。' },
    { id: 'c4', t: 'confidence', r: 'epic', q: '相信自己，是你給自己最強的裝備。' },
    // 恢復
    { id: 'r1', t: 'recovery', r: 'common', q: '睡好覺，是最便宜的進步。' },
    { id: 'r2', t: 'recovery', r: 'common', q: '累了就好好休息，這也是訓練。' },
    { id: 'r3', t: 'recovery', r: 'rare', q: '恢復不是偷懶，是讓努力長出來。' },
    { id: 'r4', t: 'recovery', r: 'epic', q: '懂得休息的選手，才走得遠。' },
    // 鬥志
    { id: 'd1', t: 'drive', r: 'common', q: '今天多撐一下下，就是成長。' },
    { id: 'd2', t: 'drive', r: 'common', q: '沒有白費的汗水。' },
    { id: 'd3', t: 'drive', r: 'rare', q: '想放棄的時候，再做一次就好。' },
    { id: 'd4', t: 'drive', r: 'epic', q: '冠軍，是在沒人看見時還在練的人。' }
  ];
  var TOTAL = DECK.length;

  /* ---------- 儲存 ---------- */
  function loadAll() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveAll(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) {} }
  function userData(name) {
    var all = loadAll();
    if (!all[name]) all[name] = { owned: {}, drawDates: [], lastDraw: '' };
    return { all: all, u: all[name] };
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dateAddStr(base, delta) {
    var d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + delta);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // 連續回報天數（依抽卡日期集合，往回數）
  function streakOf(u) {
    var set = {}; (u.drawDates || []).forEach(function (d) { set[d] = 1; });
    var streak = 0, cur = todayStr();
    if (!set[cur]) cur = dateAddStr(cur, -1);
    while (set[cur]) { streak++; cur = dateAddStr(cur, -1); }
    return streak;
  }

  /* ---------- 抽卡邏輯 ---------- */
  // 連續天數加成：streak 越高，稀有/傳說機率越高
  function rarityRoll(streak) {
    var boost = Math.min(streak, 14);
    var epic = Math.min(6 + boost * 1.2, 26);
    var rare = Math.min(24 + boost * 1.5, 46);
    var x = Math.random() * 100;
    if (x < epic) return 'epic';
    if (x < epic + rare) return 'rare';
    return 'common';
  }
  function pickByRarity(rarity) {
    var pool = DECK.filter(function (c) { return c.r === rarity; });
    if (!pool.length) pool = DECK;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 主要進入點：每日回報送出成功後呼叫
  function onReportSubmitted(name) {
    name = String(name || '').trim();
    if (!name) return;
    var ctx = userData(name), u = ctx.u;
    var today = todayStr();
    var alreadyToday = u.lastDraw === today;

    var card;
    if (alreadyToday && u.todayCardId) {
      card = DECK.find(function (c) { return c.id === u.todayCardId; }) || pickByRarity('common');
    } else {
      if ((u.drawDates || []).indexOf(today) === -1) u.drawDates.push(today);
      var streak = streakOf(u);
      var rarity = rarityRoll(streak);
      card = pickByRarity(rarity);
      u.owned[card.id] = (u.owned[card.id] || 0) + 1;
      u.lastDraw = today;
      u.todayCardId = card.id;
      saveAll(ctx.all);
    }
    showReveal(name, card, alreadyToday);
  }

  /* ---------- UI：抽卡揭曉 ---------- */
  function ensureOverlay() {
    var ov = document.getElementById('pcOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'pcOverlay';
    ov.className = 'pc-overlay';
    ov.style.display = 'none';
    ov.innerHTML = '<div class="pc-modal"><button type="button" class="pc-close" id="pcClose">✕</button><div id="pcModalBody"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) hide(); });
    document.getElementById('pcClose').addEventListener('click', hide);
    return ov;
  }
  function hide() { var ov = document.getElementById('pcOverlay'); if (ov) ov.style.display = 'none'; }

  function cardFaceHtml(card, flipped) {
    var th = THEMES[card.t], rar = RARITY[card.r];
    return '<div class="pc-card ' + rar.cls + (flipped ? ' flipped' : '') + '" id="pcCard" style="--pc-accent:' + th.color + '">' +
      '<div class="pc-card-inner">' +
      '<div class="pc-card-back"><div class="pc-back-mark">🎴</div><div class="pc-back-text">點一下翻開</div></div>' +
      '<div class="pc-card-front">' +
      '<div class="pc-card-top"><span class="pc-theme">' + th.emoji + ' ' + th.name + '</span><span class="pc-rarity">' + rar.stars + ' ' + rar.label + '</span></div>' +
      '<div class="pc-card-emoji">' + th.emoji + '</div>' +
      '<div class="pc-card-quote">「' + esc(card.q) + '」</div>' +
      '<div class="pc-card-foot">運動心理小卡</div>' +
      '</div></div></div>';
  }

  function showReveal(name, card, alreadyToday) {
    ensureOverlay();
    var ctx = userData(name), u = ctx.u;
    var streak = streakOf(u);
    var ownedCount = Object.keys(u.owned).length;
    var body = document.getElementById('pcModalBody');
    body.innerHTML =
      '<div class="pc-head">' + (alreadyToday ? '🎴 今天的心理小卡' : '🎉 回報完成！抽到一張心理小卡') + '</div>' +
      '<div class="pc-streak">🔥 連續回報 <b>' + streak + '</b> 天' + (streak >= 3 && !alreadyToday ? '　稀有機率提升中！' : '') + '</div>' +
      cardFaceHtml(card, alreadyToday) +
      '<div class="pc-collect">📚 已收集 <b>' + ownedCount + '/' + TOTAL + '</b> 張</div>' +
      '<div class="pc-actions"><button type="button" class="btn btn-secondary" id="pcViewCollection">📚 我的卡冊</button>' +
      '<button type="button" class="btn btn-primary" id="pcDone">收下這張</button></div>';
    document.getElementById('pcOverlay').style.display = 'flex';

    var cardEl = document.getElementById('pcCard');
    if (!alreadyToday) {
      // 點卡片翻面揭曉
      cardEl.addEventListener('click', function () { cardEl.classList.add('flipped'); }, { once: true });
    }
    document.getElementById('pcDone').addEventListener('click', hide);
    document.getElementById('pcViewCollection').addEventListener('click', function () { showCollection(name); });
  }

  /* ---------- UI：卡冊 ---------- */
  function showCollection(name) {
    ensureOverlay();
    var ctx = userData(name), u = ctx.u;
    var owned = u.owned || {};
    var ownedCount = Object.keys(owned).length;
    var streak = streakOf(u);
    var grid = DECK.map(function (c) {
      var th = THEMES[c.t], rar = RARITY[c.r];
      var have = owned[c.id];
      if (have) {
        return '<div class="pc-mini ' + rar.cls + '" style="--pc-accent:' + th.color + '" title="' + esc(c.q) + '">' +
          '<div class="pc-mini-top">' + th.emoji + '</div><div class="pc-mini-q">' + esc(c.q) + '</div>' +
          '<div class="pc-mini-foot">' + rar.stars + (have > 1 ? ' ×' + have : '') + '</div></div>';
      }
      return '<div class="pc-mini locked"><div class="pc-mini-top">❔</div><div class="pc-mini-q">尚未抽到</div><div class="pc-mini-foot">' + rar.stars + '</div></div>';
    }).join('');
    var body = document.getElementById('pcModalBody');
    body.innerHTML =
      '<div class="pc-head">📚 ' + esc(name) + ' 的心理卡冊</div>' +
      '<div class="pc-streak">已收集 <b>' + ownedCount + '/' + TOTAL + '</b> 張　🔥 連續回報 ' + streak + ' 天</div>' +
      '<div class="pc-grid">' + grid + '</div>' +
      '<div class="pc-actions"><button type="button" class="btn btn-primary" id="pcCloseCollection">關閉</button></div>';
    document.getElementById('pcOverlay').style.display = 'flex';
    document.getElementById('pcCloseCollection').addEventListener('click', hide);
  }

  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  window.PsychCards = {
    onReportSubmitted: onReportSubmitted,
    showCollection: showCollection
  };
})();
