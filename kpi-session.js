/* ============================================================
   KPI 回報手動開啟（Phase 2）前端模組
   ------------------------------------------------------------
   獨立模組，只「新增」：不改 app.js 既有邏輯。
   讀取 app.js 全域：postToWebApp / getRole / toast / escapeHtml / shareToLine。
   - 教練後台：KPI 回報管理（開啟/關閉/延長/重開/LINE提醒/完成率表）
   - 學生端：依 session 狀態顯示填寫入口與每週 KPI 表單
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

  // 每週 KPI 六面向（對應後端 weekly_kpi_reports 欄位）
  var WK_DIMS = [
    { key: 'technicalScore', label: '技術', icon: '🎯' },
    { key: 'tacticalScore', label: '戰術', icon: '♟️' },
    { key: 'physicalScore', label: '體能', icon: '💪' },
    { key: 'mentalScore', label: '心理', icon: '🧠' },
    { key: 'attitudeScore', label: '態度', icon: '🔥' },
    { key: 'recoveryScore', label: '恢復', icon: '🛌' }
  ];

  var SESSION_TYPES = [
    { v: 'weekly', label: '一般週KPI' }, { v: 'match', label: '賽後KPI' },
    { v: 'camp', label: '集訓KPI' }, { v: 'makeup', label: '補填KPI' }, { v: 'simple', label: '簡化KPI' }
  ];
  var TARGET_GROUPS = ['全隊', '品勢組', '對練組', '黑帶組'];
  var CLOSE_PRESETS = [
    { v: 'tonight21', label: '今晚 21:00' }, { v: 'tomorrow21', label: '明天 21:00' },
    { v: 'sunday21', label: '週日 21:00' }, { v: 'custom', label: '自訂時間' }
  ];

  function statusBadge(es) {
    var map = {
      open: ['開放中', 'kpi-st-open'], closed: ['已截止', 'kpi-st-closed'],
      scheduled: ['尚未開放', 'kpi-st-sched'], draft: ['草稿', 'kpi-st-sched'], none: ['未開放', 'kpi-st-closed']
    };
    var m = map[es] || ['未開放', 'kpi-st-closed'];
    return '<span class="kpi-badge ' + m[1] + '">' + m[0] + '</span>';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d.getTime())) return '—';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /* ===================== 教練端 ===================== */
  async function renderCoachKpiManage() {
    var box = el('coachKpiManage');
    if (!box) return;
    var r = role();
    if (!r || r.role !== 'coach') { box.innerHTML = '<div class="hint-box">此區僅教練可操作。</div>'; return; }
    box.innerHTML = '<div class="hint-box">讀取中...</div>';
    var res;
    try { res = await api({ action: 'getKpiSessions' }); }
    catch (e) { box.innerHTML = '<div class="hint-box warn">讀取失敗，請確認連線。</div>'; return; }
    if (!res || !res.ok) { box.innerHTML = '<div class="hint-box warn">' + esc((res && res.error) || '讀取失敗') + '</div>'; return; }

    var sessions = res.data || [];
    var html = '<button type="button" class="btn btn-primary" id="kpiOpenNewBtn">➕ 手動開啟 KPI</button>';
    html += '<div id="kpiNewForm" class="kpi-new-form" style="display:none;"></div>';

    if (!sessions.length) {
      html += '<div class="hint-box" style="margin-top:12px">目前沒有任何 KPI 回報。按上方按鈕手動開啟一次。</div>';
    } else {
      html += '<div class="kpi-session-list">';
      sessions.forEach(function (s) {
        var st = s.stats || {};
        html += '<div class="kpi-session-item" data-id="' + esc(s.sessionId) + '">' +
          '<div class="kpi-session-head"><span class="kpi-session-name">' + esc(s.sessionName) + ' ' + statusBadge(s.effectiveStatus) + '</span>' +
          '<span class="kpi-session-sub">' + esc(typeLabel(s.sessionType)) + '・' + esc(s.targetGroup || '全隊') + '</span></div>' +
          '<div class="kpi-session-meta">開放 ' + fmtTime(s.openAt) + ' → 截止 ' + fmtTime(s.closeAt) + '</div>' +
          '<div class="kpi-session-stat">完成率 <b>' + st.doneCount + '/' + st.total + '（' + st.completionRate + '%）</b>' +
          '　🟢' + (st.green || 0) + ' 🟡' + (st.yellow || 0) + ' 🔴' + (st.red || 0) +
          (st.avgScore != null ? '　平均 ' + st.avgScore : '') + '</div>' +
          '<div class="kpi-session-ops">' +
          opBtn('detail', '📊 完成率', s.sessionId) +
          (s.effectiveStatus === 'open'
            ? opBtn('close', '⏹ 關閉', s.sessionId) + opBtn('extend', '⏰ 延長', s.sessionId) + opBtn('remind', '📱 LINE提醒', s.sessionId)
            : opBtn('reopen', '🔄 重新開放', s.sessionId)) +
          opBtn('report', '📄 產生週報', s.sessionId) +
          '</div>' +
          '<div class="kpi-session-detail" id="kpiDetail-' + esc(s.sessionId) + '"></div>' +
          '</div>';
      });
      html += '</div>';
    }
    box.innerHTML = html;

    el('kpiOpenNewBtn').addEventListener('click', toggleNewForm);
    box.querySelectorAll('.kpi-op').forEach(function (b) {
      b.addEventListener('click', function () { coachOp(b.dataset.op, b.dataset.id); });
    });
  }

  function typeLabel(v) { var t = SESSION_TYPES.find(function (x) { return x.v === v; }); return t ? t.label : v; }
  function opBtn(op, label, id) { return '<button type="button" class="btn btn-ghost kpi-op" data-op="' + op + '" data-id="' + esc(id) + '">' + label + '</button>'; }

  function toggleNewForm() {
    var f = el('kpiNewForm');
    if (!f) return;
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    f.style.display = 'block';
    f.innerHTML =
      field('回報名稱', '<input id="kpiName" class="text-input" placeholder="例如：第25週 KPI 成長回報" />') +
      field('回報類型', sel('kpiType', SESSION_TYPES.map(function (t) { return { v: t.v, label: t.label }; }))) +
      field('開放對象', sel('kpiTarget', TARGET_GROUPS.map(function (g) { return { v: g, label: g }; }))) +
      field('截止時間', sel('kpiClose', CLOSE_PRESETS.map(function (c) { return { v: c.v, label: c.label }; }))) +
      '<div id="kpiCloseCustomWrap" style="display:none">' + field('自訂截止', '<input id="kpiCloseCustom" class="text-input" type="datetime-local" />') + '</div>' +
      '<div class="kpi-new-toggles">' +
      checkbox('kpiInWeekly', '列入週報', true) + checkbox('kpiInMonthly', '列入月報', true) + checkbox('kpiLine', '開啟即發 LINE 通知', false) +
      '</div>' +
      '<div class="btn-group"><button type="button" id="kpiCreateBtn" class="btn btn-primary">✅ 確認開啟</button>' +
      '<button type="button" id="kpiCancelBtn" class="btn btn-ghost">取消</button></div>';
    el('kpiClose').addEventListener('change', function () {
      el('kpiCloseCustomWrap').style.display = (this.value === 'custom') ? 'block' : 'none';
    });
    el('kpiCreateBtn').addEventListener('click', createSession);
    el('kpiCancelBtn').addEventListener('click', function () { f.style.display = 'none'; });
  }

  function field(label, inner) { return '<label class="field-label">' + esc(label) + '</label>' + inner; }
  function sel(id, opts) { return '<select id="' + id + '" class="text-input">' + opts.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.label) + '</option>'; }).join('') + '</select>'; }
  function checkbox(id, label, checked) { return '<label class="kpi-check"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' /> ' + esc(label) + '</label>'; }

  async function createSession() {
    var btn = el('kpiCreateBtn'); if (btn) { btn.disabled = true; btn.textContent = '建立中...'; }
    var payload = {
      action: 'createKpiSession',
      sessionName: el('kpiName').value.trim() || '本週 KPI 成長回報',
      sessionType: el('kpiType').value,
      targetGroup: el('kpiTarget').value,
      closeAtPreset: el('kpiClose').value,
      closeAtTime: el('kpiCloseCustom') ? el('kpiCloseCustom').value : '',
      includeInWeeklyReport: el('kpiInWeekly').checked,
      includeInMonthlyReport: el('kpiInMonthly').checked,
      lineNotify: el('kpiLine').checked
    };
    try {
      var res = await api(payload);
      if (res && res.ok) { notify('✅ KPI 已開啟'); renderCoachKpiManage(); }
      else notify((res && res.error) || '開啟失敗');
    } catch (e) { notify('開啟失敗，請確認連線'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '✅ 確認開啟'; } }
  }

  async function coachOp(op, id) {
    if (op === 'detail') return toggleDetail(id);
    if (op === 'report') {
      if (typeof window.MonthlyReport !== 'undefined') notify('請到「每月訪視報表」產生完整週/月報');
      else notify('週報整合於月報模組');
      return toggleDetail(id);
    }
    if (op === 'remind') return sendRemind(id);
    var actionMap = { close: 'closeKpiSession', reopen: 'reopenKpiSession', extend: 'extendKpiSession' };
    var action = actionMap[op];
    if (!action) return;
    var body = { action: action, sessionId: id };
    if (op === 'extend') {
      var preset = prompt('延長截止到？輸入：tonight21 / tomorrow21 / sunday21', 'tomorrow21');
      if (!preset) return;
      body.closeAtPreset = preset;
    }
    try {
      var res = await api(body);
      if (res && res.ok) { notify('✅ 已更新'); renderCoachKpiManage(); }
      else notify((res && res.error) || '操作失敗');
    } catch (e) { notify('操作失敗'); }
  }

  async function toggleDetail(id) {
    var box = el('kpiDetail-' + id);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '讀取中...';
    try {
      var res = await api({ action: 'getKpiSessionDetail', sessionId: id });
      if (!res || !res.ok) { box.innerHTML = '<div class="hint-box warn">' + esc((res && res.error) || '讀取失敗') + '</div>'; return; }
      var st = res.stats, reps = {};
      (st.reports || []).forEach(function (r) { reps[String(r.studentName).trim()] = r; });
      var rows = '';
      st.doneNames.forEach(function (n) {
        var r = reps[String(n).trim()] || {};
        rows += '<tr><td>' + esc(n) + '</td><td class="kpi-done">已完成</td><td>' + fmtTime(r.submittedAt) + '</td><td>' + esc(r.totalScore || '—') + '</td><td>' + (r.changeScore === '' || r.changeScore == null ? '—' : (r.changeScore > 0 ? '+' : '') + r.changeScore) + '</td><td>' + esc(r.riskLevel || '—') + '</td></tr>';
      });
      st.pendingNames.forEach(function (n) {
        rows += '<tr><td>' + esc(n) + '</td><td class="kpi-pending">未完成</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>';
      });
      box.innerHTML =
        '<div class="kpi-detail-summary">完成率 <b>' + st.completionRate + '%</b>（' + st.doneCount + '/' + st.total + '）　平均 ' + (st.avgScore == null ? '—' : st.avgScore) +
        '　🟢' + st.green + ' 🟡' + st.yellow + ' 🔴' + st.red + '</div>' +
        '<div class="table-scroll"><table class="record-table"><thead><tr><th>選手</th><th>狀態</th><th>送出時間</th><th>總分</th><th>較上次</th><th>燈號</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    } catch (e) { box.innerHTML = '<div class="hint-box warn">讀取失敗</div>'; }
  }

  async function sendRemind(id) {
    try {
      var res = await api({ action: 'getKpiReminderTexts', sessionId: id });
      if (!res || !res.ok) { notify((res && res.error) || '產生失敗'); return; }
      var t = res.texts;
      var box = el('kpiDetail-' + id);
      if (box) {
        box.innerHTML =
          remindBlock('學生版（開放通知）', t.student) +
          remindBlock('未完成提醒', t.pending) +
          remindBlock('教練版（完成統計）', t.coach);
        box.querySelectorAll('.kpi-remind-share').forEach(function (b) {
          b.addEventListener('click', function () { if (typeof shareToLine === 'function') shareToLine(b.dataset.text); });
        });
        box.querySelectorAll('.kpi-remind-copy').forEach(function (b) {
          b.addEventListener('click', function () { copyText(b.dataset.text); notify('已複製'); });
        });
      }
    } catch (e) { notify('產生失敗'); }
  }
  function remindBlock(title, text) {
    var t = esc(text);
    return '<div class="kpi-remind"><div class="kpi-remind-title">' + esc(title) + '</div>' +
      '<pre class="line-text">' + t + '</pre>' +
      '<div class="btn-group"><button type="button" class="btn btn-secondary kpi-remind-copy" data-text="' + t + '">📋 複製</button>' +
      '<button type="button" class="btn btn-line-share kpi-remind-share" data-text="' + t + '">💬 分享到 LINE</button></div></div>';
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(function () {});
  }

  /* ===================== 學生端 ===================== */
  async function renderStudentKpi() {
    var card = el('studentKpiCard'), body = el('studentKpiBody');
    if (!card || !body) return;
    var r = role();
    if (!r || (r.role !== 'student' && r.role !== 'coach')) { card.style.display = 'none'; return; }
    try {
      var res = await api({ action: 'getStudentKpiSession' });
      if (!res || !res.ok) { card.style.display = 'none'; return; }
      var state = res.state;
      if (state === 'none' || state === 'scheduled') {
        card.style.display = '';
        body.innerHTML = '<div class="hint-box">' + esc(res.message) + '</div>';
        return;
      }
      if (state === 'closed') {
        card.style.display = '';
        body.innerHTML = '<div class="hint-box warn">' + esc(res.message) + '</div>';
        return;
      }
      if (state === 'done') {
        card.style.display = '';
        body.innerHTML = '<div class="hint-box good">' + esc(res.message) + '</div>';
        return;
      }
      if (state === 'open') {
        card.style.display = '';
        renderStudentKpiOpen(body, res.session);
      }
    } catch (e) { card.style.display = 'none'; }
  }

  function renderStudentKpiOpen(body, session) {
    body.innerHTML =
      '<div class="hint-box good">' + esc(session.sessionName || '本週 KPI 回報') + ' 已開放。請用這段時間的整體表現誠實填寫。這不是考試分數，而是幫助教練了解你的訓練狀態。</div>' +
      '<button type="button" class="btn btn-primary" id="studentKpiStart">開始填寫 KPI</button>' +
      '<div id="studentKpiForm" style="display:none;"></div>';
    el('studentKpiStart').addEventListener('click', function () {
      this.style.display = 'none';
      buildStudentKpiForm(el('studentKpiForm'), session);
    });
  }

  function buildStudentKpiForm(wrap, session) {
    var sliders = WK_DIMS.map(function (d) {
      return '<div class="kpi-item">' +
        '<div class="kpi-item-row"><span class="kpi-item-name">' + d.icon + ' ' + d.label + '</span>' +
        '<span class="kpi-item-score" id="wk-score-' + d.key + '">3 分</span></div>' +
        '<input type="range" min="1" max="5" step="1" value="3" class="kpi-slider wk-slider" data-key="' + d.key + '" />' +
        '</div>';
    }).join('');
    wrap.style.display = 'block';
    wrap.innerHTML =
      '<div class="kpi-aspect">' + sliders + '</div>' +
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
        action: 'submitWeeklyKpi', sessionId: session.sessionId, scores: scores,
        bestThingThisWeek: el('wkBest').value.trim(),
        needImproveThisWeek: el('wkImprove').value.trim(),
        nextWeekGoal: el('wkGoal').value.trim()
      });
      if (res && res.ok) { notify('✅ 本週 KPI 已送出'); renderStudentKpi(); }
      else notify((res && res.error) || '送出失敗');
    } catch (e) { notify('送出失敗，請確認連線'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🚀 送出本週 KPI'; } }
  }

  /* ===================== 初始化 ===================== */
  function refreshForRole() {
    var r = role();
    if (!r) return;
    if (r.role === 'coach') renderCoachKpiManage();
    if (r.role === 'student' || r.role === 'coach') renderStudentKpi();
  }

  function init() {
    // 分頁切到教練/學生時刷新
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.dataset.tab;
        if (tab === 'coach') renderCoachKpiManage();
        if (tab === 'student') renderStudentKpi();
      });
    });
    // 初次（角色已登入）延遲渲染，等 app.js 套用角色後
    setTimeout(refreshForRole, 800);
  }

  window.KpiSession = { init: init, refreshCoach: renderCoachKpiManage, refreshStudent: renderStudentKpi, refresh: refreshForRole };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
