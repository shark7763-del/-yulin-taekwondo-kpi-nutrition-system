/* ============================================================
   本週 KPI 任務制
   - 每日基本回報每天開放
   - 30 項完整 KPI 由教練開放，也可依比賽日手動加開
   - 教練端採 optimistic UI，背景同步，不鎖整區
   ============================================================ */
(function () {
  'use strict';

  if (window.__TEAMPRO_KPI_INITIALIZED__) return;
  window.__TEAMPRO_KPI_INITIALIZED__ = true;

  function el(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function notify(m) { if (typeof toast === 'function') toast(m); }
  function role() { try { return (typeof getRole === 'function') ? getRole() : null; } catch (e) { return null; } }
  async function api(body) {
    if (typeof postToWebApp !== 'function') throw new Error('postToWebApp 未就緒');
    return postToWebApp(body);
  }
  function withTimeout(promise, ms, label) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error((label || '讀取') + '逾時，請重新整理或重新登入後再試。')); }, ms || 20000);
    });
    return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
  }
  function cacheRead(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function cacheWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function cacheFresh(entry, ttlMs) {
    return !!(entry && entry.updatedAt && (Date.now() - Number(entry.updatedAt) <= ttlMs));
  }
  function makeRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'req_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  }
  function currentWeekKey() { return weekKey(); }

  var WK_DIMS = [
    { key: 'technicalScore', label: '技術', icon: '🎯' },
    { key: 'tacticalScore', label: '戰術', icon: '♟️' },
    { key: 'physicalScore', label: '體能', icon: '💪' },
    { key: 'mentalScore', label: '心理', icon: '🧠' },
    { key: 'attitudeScore', label: '態度', icon: '🔥' },
    { key: 'recoveryScore', label: '恢復', icon: '🛌' }
  ];

  var state = {
    students: [],
    sessions: [],
    enabled: {},
    sync: {},
    selected: {},
    groupPanel: false,
    studentPanel: false,
    loaded: false,
    studentOpen: false,
    loadingCoach: false,
    coachNotice: '',
    coachNoticeType: '',
    coachNoticeAction: '',
    bulkBusy: false,
    activeRequestId: '',
    cachedCoachAt: 0,
    cachedStudentsAt: 0,
    cachedSessionsAt: 0,
    studentRetryUsed: false
  };

  var COACH_STUDENT_CACHE_KEY = 'teampro_kpi_students_cache_v1';
  var COACH_SESSION_CACHE_KEY = 'teampro_kpi_sessions_cache_v1';
  var STUDENT_STATE_PREFIX = 'teampro_student_kpi_state_';
  var COACH_CACHE_TTL = 5 * 60 * 1000;
  var COACH_SESSION_BG_TTL = 60 * 1000;
  var STUDENT_CACHE_TTL = 5 * 60 * 1000;
  // GAS 冷啟動＋整表讀取可能到 15s 以上，10s 太緊會誤判逾時。
  var COACH_LOAD_TIMEOUT = 25000;
  var STUDENT_LOAD_TIMEOUT = 20000;
  var BULK_CONFIRM_DELAY = 800;
  var _coachBgTimer = null;
  var _studentRetryTimer = null;
  var _initBound = false;

  function ndate(v) { var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function pad(n) { return ('0' + n).slice(-2); }
  function weekKey(d) {
    d = d ? new Date(d) : new Date();
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + pad(week);
  }
  function dueSunday2359() {
    var d = new Date();
    var add = (7 - d.getDay()) % 7;
    d.setDate(d.getDate() + add);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }
  function fmtTime(iso) {
    var d = ndate(iso);
    if (!d) return '週日 23:59';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function defaultDueLabel() { return fmtTime(dueSunday2359()); }
  function currentWeekSessions() {
    var wk = weekKey();
    return (state.sessions || []).filter(function (s) { return String(s.weekId || s.weekKey || '') === wk; });
  }
  function effectiveOpen(s) {
    if (!s || s.status === 'closed') return false;
    var close = ndate(s.closeAt);
    return !close || close.getTime() >= Date.now();
  }
  function idsOfSession(s) {
    return String(s.targetStudentIds || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function sessionTargetsStudent(s, stu) {
    var ids = idsOfSession(s);
    if (ids.length) return ids.indexOf(String(stu.studentId)) !== -1 || ids.indexOf(String(stu.studentName)) !== -1;
    var tg = String(s.targetGroup || '全隊');
    return !tg || tg === '全隊' || tg === 'all' || String(stu.group || '').indexOf(tg) !== -1;
  }
  function rebuildEnabledFromSessions() {
    state.enabled = {};
    var sessions = currentWeekSessions().filter(effectiveOpen);
    state.students.forEach(function (stu) {
      state.enabled[stu.studentId] = sessions.some(function (s) { return sessionTargetsStudent(s, stu); });
    });
  }
  function doneNameSet() {
    var out = {};
    currentWeekSessions().forEach(function (s) {
      var st = s.stats || {};
      (st.doneNames || []).forEach(function (n) { out[String(n).trim()] = true; });
    });
    return out;
  }
  function enabledStudents() { return state.students.filter(function (s) { return !!state.enabled[s.studentId]; }); }
  function pendingStudents() {
    var done = doneNameSet();
    return enabledStudents().filter(function (s) { return !done[String(s.studentName).trim()]; });
  }
  function taskStatusText() {
    var total = state.students.length;
    var enabled = enabledStudents().length;
    if (!enabled) return '未開放';
    return enabled >= total ? '已開放' : '部分開放';
  }
  function targetText() {
    var total = state.students.length;
    var enabled = enabledStudents();
    if (!enabled.length) return '未開放';
    if (enabled.length >= total) return '全隊';
    var groups = {};
    enabled.forEach(function (s) { if (s.group) groups[s.group] = true; });
    var allInOneGroup = Object.keys(groups).length === 1 && state.students.filter(function (s) { return s.group === Object.keys(groups)[0]; }).length === enabled.length;
    if (allInOneGroup) return Object.keys(groups)[0];
    return '指定選手';
  }
  function groupOptions() {
    var base = ['全隊', '跆拳道對練', '跆拳道品勢', '散打', '自由品勢'];
    try {
      if (typeof GROUP_OPTIONS !== 'undefined') {
        GROUP_OPTIONS.forEach(function (g) { if (g && g.indexOf('未出席') === -1) base.push(g); });
      }
    } catch (e) {}
    state.students.forEach(function (s) { if (s.group) base.push(s.group); });
    return base.filter(function (g, i, arr) { return g && arr.indexOf(g) === i; });
  }

  function coachSnapshotFromState() {
    return {
      sessions: state.sessions || [],
      students: state.students || [],
      updatedAt: Date.now()
    };
  }
  function readCoachCache() {
    var students = cacheRead(COACH_STUDENT_CACHE_KEY);
    var sessions = cacheRead(COACH_SESSION_CACHE_KEY);
    return { students: students, sessions: sessions };
  }
  function writeCoachCache(snap) {
    if (!snap) return;
    cacheWrite(COACH_STUDENT_CACHE_KEY, { updatedAt: Date.now(), data: snap.students || [] });
    cacheWrite(COACH_SESSION_CACHE_KEY, { updatedAt: Date.now(), data: snap.sessions || [] });
    state.cachedCoachAt = Date.now();
    state.cachedStudentsAt = Date.now();
    state.cachedSessionsAt = Date.now();
  }
  function applyCoachData(sessions, students, fromCache) {
    state.sessions = Array.isArray(sessions) ? sessions : [];
    state.students = (Array.isArray(students) ? students : []).filter(function (s) {
      return s && s.studentId && s.studentName && s.accountStatus !== 'disabled';
    }).sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName), 'zh-Hant'); });
    rebuildEnabledFromSessions();
    state.loaded = true;
    state.coachNotice = fromCache ? '已顯示最近資料，正在背景確認最新狀態…' : '';
    state.coachNoticeType = fromCache ? 'info' : '';
    state.coachNoticeAction = fromCache ? 'background' : '';
    renderCoachKpiManage();
  }
  function showCoachMessage(type, message, action) {
    state.coachNoticeType = type || '';
    state.coachNotice = message || '';
    state.coachNoticeAction = action || '';
  }
  function coachNetworkBody() {
    return { action: 'getKpiManageData' };
  }
  function scheduleCoachSessionsRefresh(delayMs) {
    if (_coachBgTimer) clearTimeout(_coachBgTimer);
    _coachBgTimer = setTimeout(function () {
      _coachBgTimer = null;
      refreshCoachSessionsBackground();
    }, Math.max(250, delayMs || BULK_CONFIRM_DELAY));
  }
  async function refreshCoachSessionsBackground() {
    var r = role();
    if (!r || r.role !== 'coach') return;
    try {
      var res = await withTimeout(api({ action: 'getKpiSessions' }), COACH_LOAD_TIMEOUT, 'KPI 進度同步');
      if (res && res.ok) {
        state.sessions = res.data || state.sessions;
        cacheWrite(COACH_SESSION_CACHE_KEY, { updatedAt: Date.now(), data: state.sessions || [] });
        rebuildEnabledFromSessions();
        state.loaded = true;
        showCoachMessage('ok', '✅ 本週 KPI 已成功開放', '');
        renderCoachKpiManage();
      }
    } catch (e) {}
  }
  async function loadCoachData(opts) {
    var box = el('coachKpiManage');
    if (!box) return;
    var r = role();
    if (!r || r.role !== 'coach') { box.innerHTML = '<div class="hint-box">此區僅教練可操作。</div>'; return; }
    opts = opts || {};
    var cached = readCoachCache();
    var studentsCached = cacheFresh(cached.students, COACH_CACHE_TTL) ? cached.students : null;
    var sessionsCached = cacheFresh(cached.sessions, COACH_SESSION_BG_TTL) ? cached.sessions : null;
    if (studentsCached || sessionsCached) {
      applyCoachData((sessionsCached && sessionsCached.data) || state.sessions, (studentsCached && studentsCached.data) || state.students, true);
    } else if (!state.loaded) {
      box.innerHTML = '<div class="hint-box">正在讀取本週 KPI 狀態…</div>';
    }
    try {
      state.loadingCoach = true;
      var data = await withTimeout(api(coachNetworkBody()), COACH_LOAD_TIMEOUT, 'KPI 管理資料讀取');
      if (!data || !data.ok) throw new Error((data && data.error) || 'KPI 管理資料讀取失敗');
      var sessions = data.sessions || [];
      var students = data.students || [];
      applyCoachData(sessions, students, false);
      writeCoachCache({ sessions: sessions, students: students });
      showCoachMessage('ok', '✅ KPI 管理資料已同步', '');
      state.loadingCoach = false;
      renderCoachKpiManage();
      if (opts.backgroundRefresh !== false) scheduleCoachSessionsRefresh(BULK_CONFIRM_DELAY);
    } catch (e) {
      state.loadingCoach = false;
      if (!state.loaded) {
        box.innerHTML = '<div class="hint-box warn">' + esc(e.message || '讀取失敗，請確認連線。') + '</div>' +
          '<button type="button" class="btn btn-secondary" data-kpi-retry-load>重新讀取</button>';
        box.querySelector('[data-kpi-retry-load]')?.addEventListener('click', function () {
          state.loaded = false;
          loadCoachData();
        });
      } else {
        showCoachMessage('warn', '目前連線不穩，已保留最近資料。請稍後重新確認。', 'retry');
        renderCoachKpiManage();
      }
    }
  }

  function renderCoachKpiManage() {
    var box = el('coachKpiManage');
    if (!box) return;
    var r = role();
    if (!r || r.role !== 'coach') { box.innerHTML = '<div class="hint-box">此區僅教練可操作。</div>'; return; }
    // 已在讀取中就不要再開一輪，否則每次重繪都會疊一個新請求。
    if (!state.loaded) { if (!state.loadingCoach) loadCoachData(); return; }

    var wk = weekKey();
    var enabled = enabledStudents();
    var done = doneNameSet();
    var doneCount = enabled.filter(function (s) { return done[String(s.studentName).trim()]; }).length;
    var pending = pendingStudents();
    var activeSessions = currentWeekSessions().filter(effectiveOpen);
    var due = activeSessions.map(function (s) { return s.closeAt; }).filter(Boolean).sort()[0] || dueSunday2359();
    var openAllLabel = state.bulkBusy ? '⏳ 同步中…' : '✅ 開放全隊本週 KPI';
    var groupLabel = state.bulkBusy ? '⏳ 同步中…' : '🏷️ 開放指定組別';
    var studentLabel = state.bulkBusy ? '⏳ 同步中…' : '➕ 指定選手補填';
    var closeLabel = state.bulkBusy ? '⏳ 同步中…' : '⏹ 關閉本週 KPI';
    var banner = state.coachNotice
      ? '<div class="hint-box ' + (state.coachNoticeType === 'warn' ? 'warn' : state.coachNoticeType === 'ok' ? 'good' : '') + '">' +
          esc(state.coachNotice) +
          (state.coachNoticeAction === 'retry' ? '<div style="margin-top:10px"><button type="button" class="btn btn-secondary" data-kpi-retry-load>重新確認</button></div>' : '') +
        '</div>'
      : '';

    box.innerHTML =
      banner +
      '<div class="kpi-task-card">' +
        '<h3 class="card-title">📋 KPI 回報管理</h3>' +
        '<p class="review-label">每日基本回報每天開放；30 項完整 KPI 每週五自動開啟、週日 23:59 截止；比賽日、訓練週期調整或狀態異常時，教練也可以手動加開或提前關閉。</p>' +
        '<div id="weeklyAutoKpiBox" class="kpi-task-meta"><span class="review-label">讀取自動開啟狀態…</span></div>' +
        '<div class="kpi-task-status"><b>本週 KPI 任務</b><span class="' + (enabled.length ? 'is-open' : 'is-closed') + '">' + taskStatusText() + '</span></div>' +
        '<div class="kpi-task-meta">' +
          '<span>週次：' + esc(wk) + '</span><span>開放對象：' + esc(targetText()) + '</span><span>截止時間：' + esc(enabled.length ? fmtTime(due) : defaultDueLabel()) + '</span>' +
        '</div>' +
        '<div class="kpi-progress-grid">' +
          '<div><b>' + doneCount + '</b><span>已完成</span></div>' +
          '<div><b>' + pending.length + '</b><span>未完成</span></div>' +
          '<div><b>' + enabled.length + '</b><span>已開放</span></div>' +
        '</div>' +
        '<div class="kpi-task-actions">' +
          '<button type="button" class="btn btn-primary" data-kpi-open-all' + (state.bulkBusy ? ' disabled' : '') + '>' + esc(openAllLabel) + '</button>' +
          '<button type="button" class="btn btn-secondary" data-kpi-toggle-groups' + (state.bulkBusy ? ' disabled' : '') + '>' + esc(groupLabel) + '</button>' +
          '<button type="button" class="btn btn-secondary" data-kpi-toggle-students' + (state.bulkBusy ? ' disabled' : '') + '>' + esc(studentLabel) + '</button>' +
          '<button type="button" class="btn btn-ghost" data-kpi-close-week' + (state.bulkBusy ? ' disabled' : '') + '>' + esc(closeLabel) + '</button>' +
        '</div>' +
        (state.groupPanel ? renderGroupPanel() : '') +
        (state.studentPanel ? renderStudentPanel() : '') +
        renderPendingTools(pending) +
        renderAdvancedToggles() +
        renderHistorySessions() +
      '</div>';

    bindCoachEvents(box);
    loadWeeklyAutoKpi();   // 自動開啟狀態另外非同步補進來，不擋整張卡的渲染
  }

  function renderGroupPanel() {
    return '<div class="kpi-toolbar"><div class="kpi-toolbar-title">選擇要開放的組別</div><div class="kpi-group-buttons">' +
      groupOptions().map(function (g) { return '<button type="button" class="kpi-group-btn" data-kpi-open-group="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') +
      '</div></div>';
  }
  function renderStudentPanel() {
    return '<div class="kpi-toolbar"><div class="kpi-toolbar-title">指定選手補填</div>' +
      '<div class="kpi-select-grid">' + state.students.map(function (s) {
        return '<label class="kpi-player-check"><input type="checkbox" data-kpi-select-student="' + esc(s.studentId) + '"' + (state.selected[s.studentId] ? ' checked' : '') + '><span>' + esc(s.studentName) + '<small>' + esc(s.group || '未分組') + '</small></span></label>';
      }).join('') + '</div>' +
      '<button type="button" class="btn btn-primary" data-kpi-open-selected>開放已選</button></div>';
  }
  function renderPendingTools(pending) {
    if (!enabledStudents().length) return '';
    var names = pending.map(function (s) { return s.studentName; });
    return '<details class="kpi-advanced-toggle"><summary>查看未完成名單（' + names.length + '）</summary>' +
      '<div class="name-list">' + (names.length ? names.map(function (n) { return '<span class="tag tag-orange">' + esc(n) + '</span>'; }).join('') : '<span class="review-label">目前沒有未完成</span>') + '</div>' +
      '<button type="button" class="btn btn-secondary" data-kpi-copy-remind>📋 複製提醒文字</button></details>';
  }
  function renderAdvancedToggles() {
    return '<details class="kpi-advanced-toggle"><summary>進階：逐人開關</summary><div class="kpi-player-list">' +
      state.students.map(function (s) {
        var on = !!state.enabled[s.studentId];
        var sync = state.sync[s.studentId] || (on ? 'synced' : 'idle');
        var label = sync === 'syncing' ? '同步中' : sync === 'error' ? '同步失敗，點此重試' : (on ? '本週已開放' : '本週未開放');
        return '<div class="kpi-player-card" data-kpi-player="' + esc(s.studentId) + '">' +
          '<div class="kpi-player-main"><div class="kpi-player-name">' + (on ? '☑ ' : '☐ ') + esc(s.studentName) + '</div>' +
          '<div class="kpi-player-meta">組別：' + esc(s.group || '未分組') + '</div><div class="kpi-player-state">狀態：' + esc(label) + '</div></div>' +
          '<button type="button" class="kpi-toggle-btn ' + (on ? 'is-on' : 'is-off') + ' is-' + sync + '" data-kpi-toggle-one="' + esc(s.studentId) + '">' + (on ? '關閉' : '開放') + '</button>' +
        '</div>';
      }).join('') + '</div></details>';
  }
  function renderHistorySessions() {
    var sessions = (state.sessions || []).slice(0, 8);
    if (!sessions.length) return '';
    return '<details class="kpi-advanced-toggle"><summary>歷史任務與週報</summary><div class="kpi-session-list">' +
      sessions.map(function (s) {
        var st = s.stats || {};
        return '<div class="kpi-session-item" data-id="' + esc(s.sessionId) + '"><div class="kpi-session-head"><span class="kpi-session-name">' + esc(s.sessionName || 'KPI 回報') + ' ' + esc(s.weekId || '') + '</span><span class="kpi-session-sub">' + esc(s.status || '') + '</span></div>' +
          '<div class="kpi-session-stat">完成率 <b>' + (st.doneCount || 0) + '/' + (st.total || 0) + '（' + (st.completionRate || 0) + '%）</b></div>' +
          '<div class="kpi-session-ops"><button class="btn btn-ghost kpi-op" data-op="detail" data-id="' + esc(s.sessionId) + '">📊 完成率</button><button class="btn btn-ghost kpi-op" data-op="report" data-id="' + esc(s.sessionId) + '">📄 週報</button><button class="btn btn-ghost kpi-op" data-op="remind" data-id="' + esc(s.sessionId) + '">📱 提醒</button></div>' +
          '<div class="kpi-session-detail" id="kpiDetail-' + esc(s.sessionId) + '"></div></div>';
      }).join('') + '</div></details>';
  }

  function bindCoachEvents(box) {
    box.querySelector('[data-kpi-retry-load]')?.addEventListener('click', function () {
      state.loaded = false;
      showCoachMessage('', '', '');
      loadCoachData({ backgroundRefresh: false });
    });
    box.querySelector('[data-kpi-open-all]')?.addEventListener('click', function () { optimisticBulk(state.students, true); });
    box.querySelector('[data-kpi-toggle-groups]')?.addEventListener('click', function () { state.groupPanel = !state.groupPanel; renderCoachKpiManage(); });
    box.querySelector('[data-kpi-toggle-students]')?.addEventListener('click', function () { state.studentPanel = !state.studentPanel; renderCoachKpiManage(); });
    box.querySelector('[data-kpi-close-week]')?.addEventListener('click', function () {
      if (!confirm('確定要關閉本週 KPI？已完成的資料不會刪除，但未完成選手將無法再填。')) return;
      closeCurrentWeek();
    });
    box.querySelectorAll('[data-kpi-open-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.dataset.kpiOpenGroup;
        var targets = g === '全隊' ? state.students : state.students.filter(function (s) { return String(s.group || '').indexOf(g) !== -1; });
        optimisticBulk(targets, true);
      });
    });
    box.querySelectorAll('[data-kpi-select-student]').forEach(function (c) {
      c.addEventListener('change', function () { state.selected[c.dataset.kpiSelectStudent] = c.checked; });
    });
    box.querySelector('[data-kpi-open-selected]')?.addEventListener('click', function () {
      var targets = state.students.filter(function (s) { return state.selected[s.studentId]; });
      if (!targets.length) { notify('請先勾選選手'); return; }
      optimisticBulk(targets, true);
    });
    box.querySelectorAll('[data-kpi-toggle-one]').forEach(function (b) {
      b.addEventListener('click', function () {
        var stu = state.students.find(function (s) { return String(s.studentId) === String(b.dataset.kpiToggleOne); });
        if (stu) optimisticBulk([stu], !state.enabled[stu.studentId]);
      });
    });
    box.querySelector('[data-kpi-copy-remind]')?.addEventListener('click', copyPendingReminder);
    box.querySelectorAll('.kpi-op').forEach(function (b) { b.addEventListener('click', function () { coachOp(b.dataset.op, b.dataset.id); }); });
  }

  function optimisticBulk(students, enabled) {
    if (!students.length || state.bulkBusy) return;
    state.bulkBusy = true;
    var requestId = makeRequestId();
    state.activeRequestId = requestId;
    showCoachMessage('info', enabled ? '正在開放本週 KPI，請勿重複點擊…' : '正在關閉本週 KPI，請勿重複點擊…', '');
    students.forEach(function (s) {
      state.enabled[s.studentId] = enabled;
      state.sync[s.studentId] = 'syncing';
    });
    renderCoachKpiManage();
    withTimeout(api({
      action: 'bulkSetKpiSession',
      weekKey: weekKey(),
      enabled: enabled,
      dueAt: dueSunday2359(),
      requestId: requestId,
      sessionName: '本週 KPI 回報',
      students: students.map(function (s) { return { studentId: s.studentId, studentName: s.studentName, group: s.group || '' }; })
    }), COACH_LOAD_TIMEOUT, 'KPI 同步').then(function (res) {
      var results = (res && res.results) || [];
      var byId = {};
      results.forEach(function (r) { if (r.studentId) byId[String(r.studentId)] = r; });
      students.forEach(function (s) {
        var rr = byId[String(s.studentId)];
        state.sync[s.studentId] = (!rr || rr.ok) ? 'synced' : 'error';
        if (rr && !rr.ok) state.enabled[s.studentId] = !enabled;
      });
      state.bulkBusy = false;
      state.activeRequestId = '';
      if (!res || !res.ok) {
        showCoachMessage('warn', (res && res.error) || 'KPI 開放失敗，請重新同步。', 'retry');
        renderCoachKpiManage();
        notify('部分 KPI 任務同步失敗，可在逐人開關重試。');
        return;
      }
      var successCount = results.filter(function (r) { return r && r.ok; }).length || students.length;
      showCoachMessage('ok', '✅ 本週 KPI 已成功開放，共 ' + successCount + ' 位選手', '');
      renderCoachKpiManage();
      scheduleCoachSessionsRefresh(BULK_CONFIRM_DELAY);
      notify('✅ 本週 KPI 已開放，共 ' + successCount + ' 位選手');
    }).catch(function (e) {
      state.bulkBusy = false;
      students.forEach(function (s) { state.sync[s.studentId] = 'error'; state.enabled[s.studentId] = !enabled; });
      if (e && String(e.message || '').indexOf('逾時') !== -1) {
        showCoachMessage('info', 'KPI 指令已送出，目前仍在確認後端狀態。', 'retry');
        renderCoachKpiManage();
        scheduleCoachSessionsRefresh(BULK_CONFIRM_DELAY);
      } else {
        showCoachMessage('warn', 'KPI 開放失敗：' + esc(e.message || '請稍後重試。'), 'retry');
        renderCoachKpiManage();
      }
      notify('同步失敗，請稍後重試。');
    });
  }

  function closeCurrentWeek() {
    var targets = state.students.slice();
    if (!targets.length || state.bulkBusy) return;
    state.bulkBusy = true;
    var requestId = makeRequestId();
    state.activeRequestId = requestId;
    showCoachMessage('info', '正在關閉本週 KPI，請勿重複點擊…', '');
    var previous = {};
    targets.forEach(function (s) {
      previous[s.studentId] = !!state.enabled[s.studentId];
      state.enabled[s.studentId] = false;
      state.sync[s.studentId] = 'syncing';
    });
    renderCoachKpiManage();
    withTimeout(api({
      action: 'bulkSetKpiSession',
      weekKey: weekKey(),
      enabled: false,
      closeAll: true,
      requestId: requestId,
      students: targets.map(function (s) {
        return { studentId: s.studentId, studentName: s.studentName, group: s.group || '' };
      })
    }), COACH_LOAD_TIMEOUT, 'KPI 關閉').then(function (res) {
      state.bulkBusy = false;
      state.activeRequestId = '';
      if (!res || !res.ok) {
        targets.forEach(function (s) {
          state.sync[s.studentId] = 'error';
          state.enabled[s.studentId] = previous[s.studentId];
        });
        showCoachMessage('warn', (res && res.error) || 'KPI 關閉失敗，請重新同步。', 'retry');
        renderCoachKpiManage();
        notify('部分 KPI 任務同步失敗，可在逐人開關重試。');
      } else {
        targets.forEach(function (s) { state.sync[s.studentId] = 'synced'; });
        showCoachMessage('ok', '✅ 本週 KPI 已關閉', '');
        renderCoachKpiManage();
        scheduleCoachSessionsRefresh(BULK_CONFIRM_DELAY);
        notify('✅ 本週 KPI 已關閉');
      }
    }).catch(function (e) {
      state.bulkBusy = false;
      targets.forEach(function (s) {
        state.sync[s.studentId] = 'error';
        state.enabled[s.studentId] = previous[s.studentId];
      });
      if (e && String(e.message || '').indexOf('逾時') !== -1) {
        showCoachMessage('info', 'KPI 指令已送出，目前仍在確認後端狀態。', 'retry');
        renderCoachKpiManage();
        scheduleCoachSessionsRefresh(BULK_CONFIRM_DELAY);
      } else {
        showCoachMessage('warn', 'KPI 關閉失敗：' + esc(e.message || '請稍後重試。'), 'retry');
        renderCoachKpiManage();
      }
      notify('同步失敗，請稍後重試。');
    });
  }

  function copyPendingReminder() {
    var names = pendingStudents().map(function (s) { return s.studentName; });
    var text = '本週 KPI 回報提醒\n尚未完成：' + (names.length ? names.join('、') : '無') + '\n\n請在今天完成本週 KPI 回報，讓教練掌握這週訓練狀態。';
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    notify('已複製提醒文字');
  }

  async function coachOp(op, id) {
    if (op === 'detail') return toggleDetail(id);
    if (op === 'report') return generateWeeklyReport(id);
    if (op === 'remind') return sendRemind(id);
  }
  async function toggleDetail(id) {
    var box = el('kpiDetail-' + id);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '讀取中...';
    try {
      var res = await api({ action: 'getKpiSessionDetail', sessionId: id });
      if (!res || !res.ok) { box.innerHTML = '<div class="hint-box warn">' + esc((res && res.error) || '讀取失敗') + '</div>'; return; }
      var st = res.stats || {};
      box.innerHTML = '<div class="kpi-detail-summary">完成率 <b>' + (st.completionRate || 0) + '%</b>（' + (st.doneCount || 0) + '/' + (st.total || 0) + '）</div>' +
        '<div class="name-list">' + ((st.pendingNames || []).map(function (n) { return '<span class="tag tag-orange">' + esc(n) + '</span>'; }).join('') || '<span class="review-label">無未完成</span>') + '</div>';
    } catch (e) { box.innerHTML = '<div class="hint-box warn">讀取失敗</div>'; }
  }
  async function generateWeeklyReport(id) {
    var box = el('kpiDetail-' + id);
    if (box) box.innerHTML = '產生週報中...';
    try {
      var res = await api({ action: 'getKpiSessionDetail', sessionId: id });
      if (!res || !res.ok) throw new Error((res && res.error) || '讀取失敗');
      var st = res.stats || {}, reports = st.reports || [];
      box.innerHTML = '<div class="kpi-detail-summary">週報摘要：完成 ' + (st.doneCount || 0) + '/' + (st.total || 0) + '，平均 ' + (st.avgScore == null ? '—' : st.avgScore) + '。</div>' +
        '<div class="name-list">' + reports.map(function (r) { return '<span class="tag">' + esc(r.studentName) + '｜' + esc(r.averageScore || '—') + '</span>'; }).join('') + '</div>';
    } catch (e) { if (box) box.innerHTML = '<div class="hint-box warn">' + esc(e.message || '產生失敗') + '</div>'; }
  }
  async function sendRemind(id) {
    try {
      var res = await api({ action: 'getKpiReminderTexts', sessionId: id });
      if (!res || !res.ok) throw new Error((res && res.error) || '產生失敗');
      var t = (res.texts && res.texts.pending) || '';
      if (typeof shareToLine === 'function') shareToLine(t);
    } catch (e) { notify(e.message || '產生失敗'); }
  }

  /* ---- 每週五自動開啟：狀態、開關、立即補開 ---- */
  function renderWeeklyAutoKpi(cfg) {
    var box = el('weeklyAutoKpiBox');
    if (!box) return;
    if (!cfg || !cfg.ok) {
      box.innerHTML = '<span class="review-label">自動開啟狀態讀取失敗（需要教練身分，且後端要是最新版）。</span>';
      return;
    }
    var g = cfg.gate || {};
    var on = !!cfg.enabled;
    // triggerInstalled 為 undefined 代表這次沒去查（省時間），不是「沒安裝」
    var warn = on && (cfg.triggerInstalled === false || cfg.needsAuthorization);
    box.innerHTML =
      '<label class="toggle-row"><input type="checkbox" id="weeklyAutoKpiToggle"' + (on ? ' checked' : '') + ' /> 每週五自動開啟本週 KPI</label>' +
      '<span class="review-label">' + esc(cfg.message || '') + '</span>' +
      (warn ? '<span class="tag tag-orange">' + esc(cfg.triggerWarning || '觸發器尚未安裝，請重新勾選一次以安裝') + '</span>' : '') +
      '<span class="review-label">今天星期' + esc(g.weekday || '?') + '｜本週 ' + esc(g.weekId || '') +
        '｜啟用中選手帳號 ' + esc(String(g.activeAccounts == null ? '?' : g.activeAccounts)) + ' 人</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="weeklyAutoKpiRunNow">立即補開一次</button>';

    el('weeklyAutoKpiToggle').addEventListener('change', async function (e) {
      var want = e.target.checked;
      e.target.disabled = true;
      var res = await api({ action: 'setWeeklyKpiAuto', enabled: want, withTrigger: true });
      e.target.disabled = false;
      notify(res && res.ok ? (want ? '✅ 已開啟每週五自動開啟' : '已關閉自動開啟') : ((res && res.error) || '設定失敗'));
      renderWeeklyAutoKpi(res);
    });
    el('weeklyAutoKpiRunNow').addEventListener('click', async function () {
      notify('嘗試補開本週 KPI…');
      var res = await api({ action: 'runWeeklyKpiNow' });
      if (res && res.ok) {
        notify('✅ 已開啟本週 KPI' + (res.line && res.line.ok ? '，並已推播 LINE' : '（LINE 未推播）'));
        loadCoachData();
      } else {
        notify('沒有開啟：' + ((res && (res.skipped || res.error)) || '未知原因'));
        loadWeeklyAutoKpi();
      }
    });
  }

  async function loadWeeklyAutoKpi() {
    // 這支後端要掃 kpi_sessions 與 student_accounts，可能要好幾秒；
    // 但不能永遠停在「讀取中」，逾時就講清楚並給重試。
    var timer = setTimeout(function () {
      var box = el('weeklyAutoKpiBox');
      if (box && box.textContent.indexOf('讀取自動開啟狀態') !== -1) {
        box.innerHTML = '<span class="review-label">自動開啟狀態讀取逾時（後端可能正在忙）。</span>'
          + '<button type="button" class="btn btn-ghost btn-sm" id="weeklyAutoKpiRetry">重試</button>';
        var btn = el('weeklyAutoKpiRetry');
        if (btn) btn.addEventListener('click', loadWeeklyAutoKpi);
      }
    }, 25000);
    try { renderWeeklyAutoKpi(await api({ action: 'getWeeklyKpiAuto' })); }
    catch (e) { renderWeeklyAutoKpi(null); }
    finally { clearTimeout(timer); }
  }

  /* ===================== 學生端 ===================== */
  var WEEKLY_STATE_PREFIX = 'teampro_weekly_kpi_state_';
  var WEEKLY_SCORE_OPTIONS = [1, 2, 3, 4, 5, 'na'];
  var WEEKLY_KEY_MAP = {
    technical: 'technicalScore',
    tactical: 'tacticalScore',
    physical: 'physicalScore',
    mental: 'mentalScore',
    attitude: 'attitudeScore',
    recovery: 'recoveryScore'
  };
  function weeklyAspectDefs() {
    try {
      if (typeof KPI_ASPECTS !== 'undefined') {
        return [
          { key: 'technical', label: KPI_ASPECTS.technical.label, items: KPI_ASPECTS.technical.items || [] },
          { key: 'tactical', label: KPI_ASPECTS.tactical.label, items: KPI_ASPECTS.tactical.items || [] },
          { key: 'physical', label: KPI_ASPECTS.physical.label, items: KPI_ASPECTS.physical.items || [] },
          { key: 'mental', label: KPI_ASPECTS.focus ? KPI_ASPECTS.focus.label : '心理', items: (KPI_ASPECTS.focus && KPI_ASPECTS.focus.items) || [] },
          { key: 'attitude', label: KPI_ASPECTS.discipline ? KPI_ASPECTS.discipline.label : '態度', items: (KPI_ASPECTS.discipline && KPI_ASPECTS.discipline.items) || [] },
          { key: 'recovery', label: '恢復／生理', items: (KPI_ASPECTS.emotion && KPI_ASPECTS.emotion.items) || [] }
        ];
      }
    } catch (e) {}
    return [
      { key: 'technical', label: '技術', items: [] },
      { key: 'tactical', label: '戰術', items: [] },
      { key: 'physical', label: '體能', items: [] },
      { key: 'mental', label: '心理', items: [] },
      { key: 'attitude', label: '態度', items: [] },
      { key: 'recovery', label: '恢復／生理', items: [] }
    ];
  }
  function weeklyAspectIcon(aspectKey) {
    var dim = WK_DIMS.filter(function (d) { return d.key === aspectKey + 'Score'; })[0];
    return dim ? dim.icon : '📈';
  }
  function weeklyStorageKey(sessionId) { return WEEKLY_STATE_PREFIX + String(sessionId || ''); }
  function weeklyDraftRead(sessionId) { try { return JSON.parse(localStorage.getItem(weeklyStorageKey(sessionId)) || 'null'); } catch (e) { return null; } }
  function weeklyDraftWrite(sessionId, data) { try { localStorage.setItem(weeklyStorageKey(sessionId), JSON.stringify(data || {})); } catch (e) {} }
  function weeklyDraftClear(sessionId) { try { localStorage.removeItem(weeklyStorageKey(sessionId)); } catch (e) {} }
  function weeklyValueText(v) { if (v === 'na') return 'N/A'; if (v === '' || v == null) return ''; return String(v); }
  function weeklySetValue(aspectKey, itemKey, value) {
    var row = el('wk-item-' + aspectKey + '-' + itemKey);
    if (!row) return;
    var val = value === 'na' ? 'na' : String(value || '');
    row.dataset.value = val;
    row.querySelectorAll('[data-wk-value]').forEach(function (btn) {
      var on = String(btn.dataset.wkValue) === val;
      btn.classList.toggle('sel', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var score = row.querySelector('.wk-item-score');
    if (score) {
      score.textContent = val === 'na' ? 'N/A' : (val ? val + ' 分' : '尚未評分');
      score.className = 'kpi-item-score ' + (val === 'na' ? 'lv-none' : (val ? (Number(val) >= 4 ? 'lv-green' : Number(val) >= 3 ? 'lv-yellow' : 'lv-red') : 'kpi-untouched'));
    }
    weeklyUpdateSummary();
  }
  function weeklyCollect() {
    var scores = {};
    var aspectAverages = {};
    var total = 0;
    var counted = 0;
    var completed = 0;
    weeklyAspectDefs().forEach(function (aspect) {
      scores[aspect.key] = {};
      var sum = 0, cnt = 0;
      qsa(document, '#studentKpiForm [data-wk-item^="' + aspect.key + '-"]').forEach(function (row) {
        var itemLabel = row.dataset.wkItemLabel || row.dataset.wkItem || '';
        var raw = String(row.dataset.value || '');
        if (!raw) {
          scores[aspect.key][itemLabel] = '';
          return;
        }
        completed += 1;
        if (raw === 'na') {
          scores[aspect.key][itemLabel] = 'N/A';
          return;
        }
        var n = Number(raw);
        scores[aspect.key][itemLabel] = n;
        if (Number.isFinite(n)) {
          sum += n;
          cnt += 1;
          total += n;
          counted += 1;
        }
      });
      aspectAverages[aspect.key] = cnt ? Math.round((sum / cnt) * 10) / 10 : null;
    });
    var average = counted ? Math.round((total / counted) * 10) / 10 : '';
    return {
      scores: scores,
      aspectAverages: aspectAverages,
      totalScore: total,
      averageScore: average,
      completedCount: completed,
      numericCount: counted
    };
  }
  function weeklyBadgeClass(avg) {
    if (avg == null) return 'kpi-aspect-avg lv-none';
    return 'kpi-aspect-avg ' + (avg >= 4 ? 'lv-green' : avg >= 3 ? 'lv-yellow' : 'lv-red');
  }
  function weeklyUpdateSummary() {
    var data = weeklyCollect();
    weeklyAspectDefs().forEach(function (aspect) {
      var badge = el('wk-badge-' + aspect.key);
      if (!badge) return;
      var avg = data.aspectAverages[aspect.key];
      badge.textContent = avg == null ? '尚未評分' : ('平均 ' + avg);
      badge.className = weeklyBadgeClass(avg);
    });
    var box = el('wkSummary');
    if (!box) return data;
    var total = qsa(document, '#studentKpiForm [data-wk-item]').length;
    if (!data.completedCount) {
      box.textContent = '尚未評分';
      box.className = 'kpi-aspect-avg lv-none';
      return data;
    }
    box.textContent = '已完成 ' + data.completedCount + '/' + (total || data.completedCount) + ' 項'
      + (data.numericCount ? '・平均 ' + data.averageScore : '');
    box.className = weeklyBadgeClass(data.numericCount ? data.averageScore : null);
    return data;
  }
  function weeklySetFromDraft(sessionId) {
    var draft = weeklyDraftRead(sessionId);
    if (!draft) return;
    var map = draft._weeklyScores || draft.scores || {};
    weeklyAspectDefs().forEach(function (aspect) {
      var aspectMap = map[aspect.key] || {};
      qsa(document, '#studentKpiForm [data-wk-item^="' + aspect.key + '-"]').forEach(function (row) {
        var itemLabel = row.dataset.wkItemLabel || row.dataset.wkItem || '';
        var raw = aspectMap[itemLabel];
        if (raw == null && aspectMap[row.dataset.wkItem]) raw = aspectMap[row.dataset.wkItem];
        if (raw === 'N/A') raw = 'na';
        if (raw != null && raw !== '') weeklySetValue(aspect.key, row.dataset.wkItem, raw);
      });
    });
    if (el('wkBest') && draft.bestThingThisWeek) el('wkBest').value = draft.bestThingThisWeek;
    if (el('wkImprove') && draft.needImproveThisWeek) el('wkImprove').value = draft.needImproveThisWeek;
    if (el('wkGoal') && draft.nextWeekGoal) el('wkGoal').value = draft.nextWeekGoal;
  }
  function weeklySaveDraft(sessionId) {
    var bundle = weeklyCollect();
    var current = weeklyDraftRead(sessionId) || {};
    weeklyDraftWrite(sessionId, Object.assign({}, current, {
      _weeklyScores: bundle.scores,
      bestThingThisWeek: el('wkBest') ? el('wkBest').value.trim() : '',
      needImproveThisWeek: el('wkImprove') ? el('wkImprove').value.trim() : '',
      nextWeekGoal: el('wkGoal') ? el('wkGoal').value.trim() : '',
      updatedAt: Date.now()
    }));
  }
  function weeklyRequestKey(sessionId) {
    var draft = weeklyDraftRead(sessionId) || {};
    if (draft._submitRequestId) return draft._submitRequestId;
    draft._submitRequestId = makeRequestId();
    draft.updatedAt = Date.now();
    weeklyDraftWrite(sessionId, draft);
    return draft._submitRequestId;
  }
  function weeklyRenderSummary(report) {
    var aspectAverages = report && report.aspectAverages ? report.aspectAverages : null;
    if (!aspectAverages && report && report.aspectAveragesJson) {
      try { aspectAverages = JSON.parse(report.aspectAveragesJson); } catch (e) { aspectAverages = null; }
    }
    return '<div class="hint-box good"><b>本週 KPI 已完成</b><br>以下是你送出的摘要，只能看不能再編輯。</div>' +
      '<div class="kpi-aspect">' + weeklyAspectDefs().map(function (aspect) {
        var field = aspect.key + 'Score';
        var v = aspectAverages ? (aspectAverages[field] != null ? aspectAverages[field] : aspectAverages[aspect.key]) : (report ? report[field] : null);
        return '<div class="kpi-item"><div class="kpi-item-row"><span class="kpi-item-name">' + esc(aspect.label) + '</span><span class="kpi-item-score">' + (v == null ? 'N/A' : v) + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="review-row"><span class="review-label">本週做得最好的一件事</span><span class="review-value">' + esc((report && report.bestThingThisWeek) || '') + '</span></div>' +
      '<div class="review-row"><span class="review-label">本週最需要改進的</span><span class="review-value">' + esc((report && report.needImproveThisWeek) || '') + '</span></div>' +
      '<div class="review-row"><span class="review-label">下週目標</span><span class="review-value">' + esc((report && report.nextWeekGoal) || '') + '</span></div>';
  }
  function studentStateKey() {
    var r = role();
    var sid = r && (r.studentId || r.name) ? String(r.studentId || r.name) : '';
    var wk = currentWeekKey();
    return STUDENT_STATE_PREFIX + sid + '_' + wk;
  }
  function writeStudentStateCache(open, session, extra) {
    var r = role();
    if (!r) return;
    cacheWrite(studentStateKey(), {
      state: open ? 'open' : (extra && extra.state) || 'closed',
      session: session || null,
      closeAt: session && session.closeAt ? session.closeAt : (extra && extra.closeAt) || '',
      message: extra && extra.message ? extra.message : '',
      updatedAt: Date.now()
    });
  }
  function readStudentStateCache() {
    var cached = cacheRead(studentStateKey());
    if (!cacheFresh(cached, STUDENT_CACHE_TTL)) return null;
    if (cached && cached.closeAt && new Date(cached.closeAt).getTime() < Date.now()) return null;
    return cached;
  }
  function renderStudentStatusMessage(body, title, message, kind, showRetry) {
    var cls = kind === 'good' ? 'good' : kind === 'warn' ? 'warn' : '';
    body.innerHTML = '<div class="hint-box ' + cls + '"><b>' + esc(title) + '</b><br>' + esc(message) +
      (showRetry ? '<div style="margin-top:10px"><button type="button" class="btn btn-secondary" data-kpi-student-retry>重新確認</button></div>' : '') +
      '</div>';
  }
  async function renderStudentKpi() {
    var card = el('studentKpiCard'), body = el('studentKpiBody');
    if (!card || !body) return;
    var r = role();
    card.style.display = 'none';
    body.innerHTML = '';
    if (!r || r.role !== 'student') {
      state.studentOpen = false;
      if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
      return;
    }
    card.style.display = 'block';
    body.innerHTML = '<div class="hint-box">正在確認本週 KPI 開放狀態…</div>';
    try {
      var res = await withTimeout(api({
        action: 'getStudentKpiSession',
        studentName: r.name || '',
        studentId: r.studentId || ''
      }), STUDENT_LOAD_TIMEOUT, 'KPI 開放狀態');
      if (!res || !res.ok) throw new Error((res && res.error) || '無法確認 KPI 狀態');
      if (res.state === 'open') {
        state.studentOpen = true;
        state.studentRetryUsed = false;
        if (_studentRetryTimer) { clearTimeout(_studentRetryTimer); _studentRetryTimer = null; }
        writeStudentStateCache(true, res.session, { state: 'open', closeAt: res.session && res.session.closeAt });
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(true, res.session);
        renderStudentKpiOpen(body, res.session, res.message || '');
      } else if (res.state === 'done') {
        state.studentOpen = true;
        state.studentRetryUsed = false;
        if (_studentRetryTimer) { clearTimeout(_studentRetryTimer); _studentRetryTimer = null; }
        writeStudentStateCache(true, res.session, { state: 'done', closeAt: res.session && res.session.closeAt, message: res.message });
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(true, res.session);
        body.innerHTML = res.report ? weeklyRenderSummary(res.report) : '<div class="hint-box good"><b>本週 KPI 已完成</b><br>' + esc(res.message || '你已完成本次 KPI 回報，可以查看本週成長報告。') + '</div>';
      } else if (res.state === 'scheduled') {
        state.studentOpen = false;
        state.studentRetryUsed = false;
        if (_studentRetryTimer) { clearTimeout(_studentRetryTimer); _studentRetryTimer = null; }
        writeStudentStateCache(false, res.session, { state: 'scheduled', closeAt: res.session && res.session.closeAt, message: res.message });
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
        renderStudentStatusMessage(body, '本週 KPI 尚未開放', res.message || '請依照教練通知時間再回來確認。', '', false);
      } else if (res.state === 'closed' || res.state === 'none') {
        state.studentOpen = false;
        state.studentRetryUsed = false;
        if (_studentRetryTimer) { clearTimeout(_studentRetryTimer); _studentRetryTimer = null; }
        writeStudentStateCache(false, res.session, { state: res.state, closeAt: res.session && res.session.closeAt, message: res.message });
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
        renderStudentStatusMessage(body, '本週 KPI 尚未開放', res.message || '請等待教練開放後再填寫。', '', false);
      } else {
        throw new Error('非預期回傳');
      }
      if (typeof window.renderTodayGuide === 'function') window.renderTodayGuide();
    } catch (e) {
      var cached = readStudentStateCache();
      if (cached && cached.state === 'open' && cached.session) {
        state.studentOpen = true;
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(true, cached.session);
        renderStudentKpiOpen(body, cached.session, '已顯示最近成功狀態，正在背景確認最新資料…');
        if (!_studentRetryTimer && !state.studentRetryUsed) {
          _studentRetryTimer = setTimeout(function () {
            _studentRetryTimer = null;
            state.studentRetryUsed = true;
            renderStudentKpi();
          }, 10000);
        }
      } else if (cached && cached.state === 'done' && cached.session) {
        state.studentOpen = true;
        state.studentRetryUsed = false;
        if (_studentRetryTimer) { clearTimeout(_studentRetryTimer); _studentRetryTimer = null; }
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(true, cached.session);
        renderStudentStatusMessage(body, '本週 KPI 已完成', cached.message || '已使用最近成功狀態。', 'good', true);
      } else {
        state.studentOpen = false;
        state.studentRetryUsed = false;
        if (typeof window.setDailyKpiAvailability === 'function') {
          // 網路錯誤不等於未開放；先維持既有狀態，由使用者手動重試。
        }
        renderStudentStatusMessage(
          body,
          '目前無法確認 KPI 開放狀態',
          '可能是網路不穩或伺服器暫時延遲。請點擊重新確認，不代表教練尚未開放。',
          'warn',
          true
        );
        if (!_studentRetryTimer && !state.studentRetryUsed) {
          _studentRetryTimer = setTimeout(function () {
            _studentRetryTimer = null;
            state.studentRetryUsed = true;
            renderStudentKpi();
          }, 10000);
        }
      }
      if (typeof window.renderTodayGuide === 'function') window.renderTodayGuide();
      body.querySelector('[data-kpi-student-retry]')?.addEventListener('click', function () { renderStudentKpi(); });
    }
  }
  function renderStudentKpiOpen(body, session, extraMessage) {
    var card = el('studentKpiCard');
    if (card) card.style.display = 'block';
    body.innerHTML =
      '<div class="hint-box good"><b>本週 KPI 回報</b><br>這是教練本週開放的完整 30 項 KPI 回報，請依照最近一週訓練狀態填寫。</div>' +
      (extraMessage ? '<div class="hint-box">' + esc(extraMessage) + '</div>' : '') +
      '<button type="button" class="btn btn-primary" id="studentKpiStart">開始填寫 KPI</button>' +
      '<div id="studentKpiForm" style="display:none;"></div>';
    el('studentKpiStart').addEventListener('click', function () {
      this.style.display = 'none';
      buildStudentKpiForm(el('studentKpiForm'), session);
    });
  }
  function buildStudentKpiForm(wrap, session) {
    var aspects = weeklyAspectDefs();
    var html = '<div class="kpi-aspect-head kpi-overall-head"><span>30 項完整 KPI</span><span class="kpi-aspect-avg lv-none" id="wkSummary">尚未評分</span></div>';
    html += aspects.map(function (aspect) {
      var icon = weeklyAspectIcon(aspect.key);
      var items = (aspect.items || []).map(function (item, idx) {
        var itemKey = aspect.key + '-' + idx;
        return '<div class="kpi-item" id="wk-item-' + aspect.key + '-' + itemKey + '" data-wk-item="' + itemKey + '" data-wk-item-label="' + esc(item) + '" data-value="">' +
          '<div class="kpi-item-row"><span class="kpi-item-name">' + esc(item) + '</span><span class="kpi-item-score wk-item-score kpi-untouched">尚未評分</span></div>' +
          '<div class="quick-chips">' + WEEKLY_SCORE_OPTIONS.map(function (v) {
            return '<button type="button" class="chip' + (v === 'na' ? ' chip-warn' : '') + '" data-wk-value="' + v + '">' + (v === 'na' ? 'N/A' : v) + '</button>';
          }).join('') + '</div>' +
        '</div>';
      }).join('');
      return '<section class="kpi-section weekly-kpi-section" id="wk-card-' + aspect.key + '" data-aspect="' + aspect.key + '" data-value="">' +
        '<div class="kpi-section-head"><span class="kpi-section-title">' + icon + ' ' + esc(aspect.label) + '<span class="kpi-section-count">' + (aspect.items && aspect.items.length ? aspect.items.length : 0) + ' 項</span></span><span class="kpi-section-right"><span class="kpi-aspect-avg lv-none" id="wk-badge-' + aspect.key + '">尚未評分</span></span></div>' +
        '<div class="kpi-section-body"><div class="review-label" style="margin-bottom:8px">請依照最近一週整體表現評分；沒有練到可選 N/A。</div>' + items + '</div>' +
      '</section>';
    }).join('');
    html += '<label class="field-label">本週做得最好的一件事</label><textarea id="wkBest" class="text-input" rows="2"></textarea>' +
      '<label class="field-label">本週最需要改進的</label><textarea id="wkImprove" class="text-input" rows="2"></textarea>' +
      '<label class="field-label">下週目標</label><textarea id="wkGoal" class="text-input" rows="2"></textarea>' +
      '<div class="btn-group"><button type="button" id="wkSubmit" class="btn btn-primary">🚀 送出本週 KPI</button></div>';
    wrap.style.display = 'block';
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-wk-value]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('[data-wk-item]');
        if (!row) return;
        var current = String(row.dataset.value || '');
        var value = String(btn.dataset.wkValue || '');
        var aspectRow = row.closest('[data-aspect]');
        if (!aspectRow) return;
        weeklySetValue(aspectRow.dataset.aspect, row.dataset.wkItem, current === value ? '' : value);
      });
    });
    ['wkBest', 'wkImprove', 'wkGoal'].forEach(function (id) {
      var input = el(id);
      if (input) input.addEventListener('input', function () { weeklySaveDraft(session.sessionId); });
    });
    weeklySetFromDraft(session.sessionId);
    weeklyUpdateSummary();
    el('wkSubmit').addEventListener('click', function () { submitStudentKpi(session); });
  }
  async function submitStudentKpi(session) {
    var btn = el('wkSubmit'); if (btn) { btn.disabled = true; btn.textContent = '送出中...'; }
    var bundle = weeklyCollect();
    var missing = qsa(document, '#studentKpiForm [data-wk-item]').filter(function (row) {
      return !String(row.dataset.value || '').trim();
    });
    if (missing.length) {
      if (btn) { btn.disabled = false; btn.textContent = '🚀 送出本週 KPI'; }
      notify('還有 ' + missing.length + ' 題尚未評分，請選 1–5 或 N/A。');
      return;
    }
    try {
      var requestKey = weeklyRequestKey(session.sessionId);
      var res = await api({
        action: 'submitWeeklyKpi',
        sessionId: session.sessionId,
        idempotencyKey: requestKey,
        scores: bundle.scores,
        aspectAverages: bundle.aspectAverages,
        rawScoresJson: JSON.stringify(bundle.scores),
        bestThingThisWeek: el('wkBest').value.trim(),
        needImproveThisWeek: el('wkImprove').value.trim(),
        nextWeekGoal: el('wkGoal').value.trim()
      });
      if (res && res.ok) {
        weeklyDraftClear(session.sessionId);
        notify('✅ 本週 KPI 已送出');
        renderStudentKpi();
      } else notify((res && res.error) || '送出失敗');
    } catch (e) { notify('送出失敗，請確認連線'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🚀 送出本週 KPI'; } }
  }

  function refreshForRole() {
    var r = role();
    if (!r) return;
    if (r.role === 'coach') loadCoachData();
    if (r.role === 'student' || r.role === 'coach') renderStudentKpi();
  }
  function init() {
    if (_initBound) return;
    _initBound = true;
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.tab === 'coach') loadCoachData();
        if (btn.dataset.tab === 'student') renderStudentKpi();
      });
    });
    setTimeout(refreshForRole, 800);
  }

  window.KpiSession = {
    init: init,
    refreshCoach: loadCoachData,
    refreshStudent: renderStudentKpi,
    refresh: refreshForRole,
    isStudentOpen: function () { return !!state.studentOpen; },
    // 給煙霧測試用：可以在沒有後端的情況下單獨長出每週 KPI 表單
    _buildStudentKpiForm: buildStudentKpiForm
  };
  window.addEventListener('teampro:role-changed', refreshForRole);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
