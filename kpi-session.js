/* ============================================================
   本週 KPI 任務制
   - 每日基本回報每天開放
   - 30 項完整 KPI 每週五自動開放，也可依比賽日手動加開
   - 教練端採 optimistic UI，背景同步，不鎖整區
   ============================================================ */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function notify(m) { if (typeof toast === 'function') toast(m); }
  function role() { try { return (typeof getRole === 'function') ? getRole() : null; } catch (e) { return null; } }
  async function api(body) {
    if (typeof postToWebApp !== 'function') throw new Error('postToWebApp 未就緒');
    return postToWebApp(body);
  }

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
    studentOpen: false
  };

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

  async function loadCoachData() {
    var box = el('coachKpiManage');
    if (!box) return;
    var r = role();
    if (!r || r.role !== 'coach') { box.innerHTML = '<div class="hint-box">此區僅教練可操作。</div>'; return; }
    if (!state.loaded) box.innerHTML = '<div class="hint-box">讀取中...</div>';
    try {
      var data = await Promise.all([
        api({ action: 'getKpiSessions' }),
        api({ action: 'getAccountAdminData' })
      ]);
      var sessRes = data[0], accRes = data[1];
      if (!sessRes || !sessRes.ok) throw new Error((sessRes && sessRes.error) || 'KPI 任務讀取失敗');
      if (!accRes || !accRes.ok) throw new Error((accRes && accRes.error) || '選手名單讀取失敗');
      state.sessions = sessRes.data || [];
      state.students = ((accRes.data && accRes.data.students) || []).filter(function (s) {
        return s.studentId && s.studentName && s.accountStatus !== 'disabled';
      }).sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName), 'zh-Hant'); });
      rebuildEnabledFromSessions();
      state.loaded = true;
      renderCoachKpiManage();
    } catch (e) {
      box.innerHTML = '<div class="hint-box warn">' + esc(e.message || '讀取失敗，請確認連線。') + '</div>';
    }
  }

  function renderCoachKpiManage() {
    var box = el('coachKpiManage');
    if (!box) return;
    var r = role();
    if (!r || r.role !== 'coach') { box.innerHTML = '<div class="hint-box">此區僅教練可操作。</div>'; return; }
    if (!state.loaded) { loadCoachData(); return; }

    var wk = weekKey();
    var enabled = enabledStudents();
    var done = doneNameSet();
    var doneCount = enabled.filter(function (s) { return done[String(s.studentName).trim()]; }).length;
    var pending = pendingStudents();
    var activeSessions = currentWeekSessions().filter(effectiveOpen);
    var due = activeSessions.map(function (s) { return s.closeAt; }).filter(Boolean).sort()[0] || dueSunday2359();

    box.innerHTML =
      '<div class="kpi-task-card">' +
        '<h3 class="card-title">📋 KPI 回報管理</h3>' +
        '<p class="review-label">每日基本回報每天開放；30 項完整 KPI 每週五自動開放，截止時間為週日 23:59；比賽日、訓練週期調整或狀態異常時，教練也可以手動加開。</p>' +
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
          '<button type="button" class="btn btn-primary" data-kpi-open-all>✅ 開放全隊本週 KPI</button>' +
          '<button type="button" class="btn btn-secondary" data-kpi-toggle-groups>🏷️ 開放指定組別</button>' +
          '<button type="button" class="btn btn-secondary" data-kpi-toggle-students>➕ 指定選手補填</button>' +
          '<button type="button" class="btn btn-ghost" data-kpi-close-week>⏹ 關閉本週 KPI</button>' +
        '</div>' +
        (state.groupPanel ? renderGroupPanel() : '') +
        (state.studentPanel ? renderStudentPanel() : '') +
        renderPendingTools(pending) +
        renderAdvancedToggles() +
        renderHistorySessions() +
      '</div>';

    bindCoachEvents(box);
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
    if (!students.length) return;
    students.forEach(function (s) {
      state.enabled[s.studentId] = enabled;
      state.sync[s.studentId] = 'syncing';
    });
    renderCoachKpiManage();
    api({
      action: 'bulkSetKpiSession',
      weekKey: weekKey(),
      enabled: enabled,
      dueAt: dueSunday2359(),
      sessionName: '本週 KPI 回報',
      students: students.map(function (s) { return { studentId: s.studentId, studentName: s.studentName, group: s.group || '' }; })
    }).then(function (res) {
      var results = (res && res.results) || [];
      var byId = {};
      results.forEach(function (r) { if (r.studentId) byId[String(r.studentId)] = r; });
      students.forEach(function (s) {
        var rr = byId[String(s.studentId)];
        state.sync[s.studentId] = (!rr || rr.ok) ? 'synced' : 'error';
        if (rr && !rr.ok) state.enabled[s.studentId] = !enabled;
      });
      if (!res || !res.ok) notify('部分 KPI 任務同步失敗，可在逐人開關重試。');
      return loadCoachData();
    }).catch(function () {
      students.forEach(function (s) { state.sync[s.studentId] = 'error'; state.enabled[s.studentId] = !enabled; });
      renderCoachKpiManage();
      notify('同步失敗，請稍後重試。');
    });
  }

  function closeCurrentWeek() {
    var targets = state.students.slice();
    if (!targets.length) return;
    var previous = {};
    targets.forEach(function (s) {
      previous[s.studentId] = !!state.enabled[s.studentId];
      state.enabled[s.studentId] = false;
      state.sync[s.studentId] = 'syncing';
    });
    renderCoachKpiManage();
    api({
      action: 'bulkSetKpiSession',
      weekKey: weekKey(),
      enabled: false,
      closeAll: true,
      students: targets.map(function (s) {
        return { studentId: s.studentId, studentName: s.studentName, group: s.group || '' };
      })
    }).then(function (res) {
      if (!res || !res.ok) {
        targets.forEach(function (s) {
          state.sync[s.studentId] = 'error';
          state.enabled[s.studentId] = previous[s.studentId];
        });
        notify('部分 KPI 任務同步失敗，可在逐人開關重試。');
      } else {
        targets.forEach(function (s) { state.sync[s.studentId] = 'synced'; });
      }
      return loadCoachData();
    }).catch(function () {
      targets.forEach(function (s) {
        state.sync[s.studentId] = 'error';
        state.enabled[s.studentId] = previous[s.studentId];
      });
      renderCoachKpiManage();
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

  /* ===================== 學生端 ===================== */
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
    try {
      var res = await api({ action: 'getStudentKpiSession' });
      if (!res || !res.ok) {
        state.studentOpen = false;
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
        if (typeof window.renderTodayGuide === 'function') window.renderTodayGuide();
        return;
      }
      var open = res.state === 'open';
      state.studentOpen = open;
      if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(open, open ? res.session : null);
      if (open) renderStudentKpiOpen(body, res.session);
      if (typeof window.renderTodayGuide === 'function') window.renderTodayGuide();
    } catch (e) {
      state.studentOpen = false;
      if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
      if (typeof window.renderTodayGuide === 'function') window.renderTodayGuide();
    }
  }
  function renderStudentKpiOpen(body, session) {
    var card = el('studentKpiCard');
    if (card) card.style.display = 'block';
    body.innerHTML =
      '<div class="hint-box good"><b>本週 KPI 回報</b><br>這是教練本週開放的完整 KPI 回報，請依照最近一週訓練狀態填寫。</div>' +
      '<button type="button" class="btn btn-primary" id="studentKpiStart">開始填寫 KPI</button>' +
      '<div id="studentKpiForm" style="display:none;"></div>';
    el('studentKpiStart').addEventListener('click', function () {
      this.style.display = 'none';
      buildStudentKpiForm(el('studentKpiForm'), session);
    });
  }
  function buildStudentKpiForm(wrap, session) {
    var sliders = WK_DIMS.map(function (d) {
      return '<div class="kpi-item"><div class="kpi-item-row"><span class="kpi-item-name">' + d.icon + ' ' + d.label + '</span><span class="kpi-item-score" id="wk-score-' + d.key + '">3 分</span></div>' +
        '<input type="range" min="1" max="5" step="1" value="3" class="kpi-slider wk-slider" data-key="' + d.key + '" /></div>';
    }).join('');
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="kpi-aspect">' + sliders + '</div>' +
      '<label class="field-label">本週做得最好的一件事</label><textarea id="wkBest" class="text-input" rows="2"></textarea>' +
      '<label class="field-label">本週最需要改進的</label><textarea id="wkImprove" class="text-input" rows="2"></textarea>' +
      '<label class="field-label">下週目標</label><textarea id="wkGoal" class="text-input" rows="2"></textarea>' +
      '<div class="btn-group"><button type="button" id="wkSubmit" class="btn btn-primary">🚀 送出本週 KPI</button></div>';
    wrap.querySelectorAll('.wk-slider').forEach(function (s) {
      s.addEventListener('input', function () { el('wk-score-' + s.dataset.key).textContent = s.value + ' 分'; });
    });
    el('wkSubmit').addEventListener('click', function () { submitStudentKpi(session); });
  }
  async function submitStudentKpi(session) {
    var btn = el('wkSubmit'); if (btn) { btn.disabled = true; btn.textContent = '送出中...'; }
    var scores = {};
    document.querySelectorAll('#studentKpiForm .wk-slider').forEach(function (s) { scores[s.dataset.key] = parseInt(s.value, 10); });
    try {
      var res = await api({
        action: 'submitWeeklyKpi',
        sessionId: session.sessionId,
        scores: scores,
        bestThingThisWeek: el('wkBest').value.trim(),
        needImproveThisWeek: el('wkImprove').value.trim(),
        nextWeekGoal: el('wkGoal').value.trim()
      });
      if (res && res.ok) { notify('✅ 本週 KPI 已送出'); renderStudentKpi(); }
      else notify((res && res.error) || '送出失敗');
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
    isStudentOpen: function () { return !!state.studentOpen; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
