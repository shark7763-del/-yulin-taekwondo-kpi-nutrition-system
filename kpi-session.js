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
  // 開放對象＝系統實際組別（讀 app.js 的 GROUP_OPTIONS，排除「未出席訓練」），開頭加「全隊」
  function targetGroups() {
    var groups = [];
    try { if (typeof GROUP_OPTIONS !== 'undefined' && GROUP_OPTIONS.length) groups = GROUP_OPTIONS.slice(); } catch (e) {}
    groups = groups.filter(function (g) { return g && g.indexOf('未出席') === -1; });
    if (!groups.length) groups = ['跆拳道對練', '跆拳道品勢', '自由品勢', '武術套路', '散打'];
    return ['全隊'].concat(groups);
  }
  var CLOSE_PRESETS = [
    { v: 'tonight21', label: '今晚 21:00' }, { v: 'tomorrow21', label: '明天 21:00' },
    { v: 'sunday21', label: '週日 21:00' }, { v: 'custom', label: '自訂時間' }
  ];
  var coachStudents = [];
  var selectedStudentIds = {};

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

    // 逐人快速開關：載入有帳號的選手
    var toggleStudents = [];
    try {
      var accRes = await api({ action: 'getAccountAdminData' });
      if (accRes && accRes.ok && accRes.data) {
        toggleStudents = (accRes.data.students || []).filter(function (s) {
          return s.studentId && s.studentName && s.accountStatus !== 'disabled';
        }).sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName), 'zh-Hant'); });
      }
    } catch (e) { /* 名單讀取失敗就不顯示逐人開關 */ }

    var html = '<button type="button" class="btn btn-primary" id="kpiOpenNewBtn">➕ 手動開啟 KPI</button>';
    html += '<div id="kpiNewForm" class="kpi-new-form" style="display:none;"></div>';
    html += renderPersonToggles(toggleStudents, sessions);

    if (!sessions.length) {
      html += '<div class="hint-box" style="margin-top:12px">目前沒有任何 KPI 回報。按上方按鈕手動開啟一次。</div>';
    } else {
      html += '<div class="kpi-session-list">';
      sessions.forEach(function (s) {
        var st = s.stats || {};
        html += '<div class="kpi-session-item" data-id="' + esc(s.sessionId) + '">' +
          '<div class="kpi-session-head"><span class="kpi-session-name">' + esc(s.sessionName) + ' ' + statusBadge(s.effectiveStatus) + '</span>' +
          '<span class="kpi-session-sub">' + esc(typeLabel(s.sessionType)) + '・' + esc(s.targetGroup || '全隊') +
          (s.targetStudentIds ? '（' + (st.total || 0) + ' 人）' : '') + '</span></div>' +
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
    box.querySelectorAll('.kpi-person-toggle').forEach(function (b) {
      b.addEventListener('click', function () { personToggle(b); });
    });
  }

  // 找出「對此選手 open 且包含他」的 session（優先個人指定）
  function personOpenSession(studentId, sessions) {
    var hit = null;
    (sessions || []).forEach(function (s) {
      if (s.effectiveStatus !== 'open') return;
      var ids = String(s.targetStudentIds || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (ids.indexOf(String(studentId)) === -1) return;
      if (!hit || s.targetGroup === '指定選手') hit = s;
    });
    return hit;
  }

  // 逐人快速開關清單
  function renderPersonToggles(students, sessions) {
    if (!students || !students.length) return '';
    var rows = students.map(function (s) {
      var open = personOpenSession(s.studentId, sessions);
      var on = !!open;
      var individual = on && open.targetGroup === '指定選手';
      return '<div class="kpi-person-row">' +
        '<span class="kpi-person-name">' + esc(s.studentName) + (s.group ? '<small>' + esc(s.group) + '</small>' : '') + '</span>' +
        '<button type="button" class="kpi-person-toggle ' + (on ? 'on' : 'off') + '"' +
        ' data-sid="' + esc(s.studentId) + '" data-name="' + esc(s.studentName) + '"' +
        ' data-act="' + (on ? (individual ? 'close' : 'group') : 'open') + '"' +
        ' data-session="' + esc(on ? open.sessionId : '') + '">' +
        (on ? (individual ? '✓ 開啟中（點此關閉）' : '✓ 團隊開啟中') : '已關（點此開啟）') +
        '</button></div>';
    }).join('');
    return '<details class="kpi-person-fold" open>' +
      '<summary>👤 逐人快速開關</summary>' +
      '<div class="kpi-person-list">' + rows + '</div>' +
      '<p class="review-label">開啟＝替該選手單獨建立一份 KPI（約 60 天後自動截止，可隨時關閉）。標「團隊開啟中」表示由下方全隊／組別 session 開啟，需到該 session 關閉。</p>' +
      '</details>';
  }

  async function personToggle(b) {
    var act = b.dataset.act, sid = b.dataset.sid, name = b.dataset.name, sessionId = b.dataset.session;
    if (act === 'group') { notify(name + ' 是由團隊／組別 session 開啟，請到下方該 session 關閉。'); return; }
    b.disabled = true; b.textContent = '處理中...';
    try {
      if (act === 'open') {
        var d = new Date(); d.setDate(d.getDate() + 60);
        var pad = function (n) { return ('0' + n).slice(-2); };
        var closeTime = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T21:00';
        var res = await api({
          action: 'createKpiSession', sessionName: '個人 KPI－' + name, sessionType: 'simple',
          targetGroup: '指定選手', targetStudentIds: [sid], closeAtPreset: 'custom', closeAtTime: closeTime,
          includeInWeeklyReport: true, includeInMonthlyReport: true, lineNotify: false
        });
        notify(res && res.ok ? ('✅ 已開啟 ' + name + ' 的 KPI') : ((res && res.error) || '開啟失敗'));
      } else {
        if (!sessionId) { notify('找不到可關閉的 KPI'); }
        else {
          var res2 = await api({ action: 'closeKpiSession', sessionId: sessionId });
          notify(res2 && res2.ok ? ('已關閉 ' + name + ' 的 KPI') : ((res2 && res2.error) || '關閉失敗'));
        }
      }
    } catch (e) { notify('操作失敗，請確認連線'); }
    finally { renderCoachKpiManage(); }
  }

  function typeLabel(v) { var t = SESSION_TYPES.find(function (x) { return x.v === v; }); return t ? t.label : v; }
  function opBtn(op, label, id) { return '<button type="button" class="btn btn-ghost kpi-op" data-op="' + op + '" data-id="' + esc(id) + '">' + label + '</button>'; }

  async function toggleNewForm() {
    var f = el('kpiNewForm');
    if (!f) return;
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    f.style.display = 'block';
    f.innerHTML = '<div class="hint-box">讀取選手名單中...</div>';
    try {
      var accountRes = await api({ action: 'getAccountAdminData' });
      if (!accountRes || !accountRes.ok) throw new Error((accountRes && accountRes.error) || '讀取失敗');
      coachStudents = (accountRes.data.students || []).filter(function (s) {
        return s.studentId && s.studentName && s.accountStatus !== 'disabled';
      }).sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName), 'zh-Hant'); });
    } catch (e) {
      f.innerHTML = '<div class="hint-box warn">無法讀取選手名單，請重新開啟表單。</div>';
      return;
    }
    selectedStudentIds = {};
    f.innerHTML =
      field('回報名稱', '<input id="kpiName" class="text-input" placeholder="例如：第25週 KPI 成長回報" />') +
      field('回報類型', sel('kpiType', SESSION_TYPES.map(function (t) { return { v: t.v, label: t.label }; }))) +
      field('開放方式', sel('kpiTargetMode', [
        { v: 'all', label: '全隊' }, { v: 'group', label: '依組別' }, { v: 'students', label: '指定選手' }
      ])) +
      '<div id="kpiTargetGroupWrap" style="display:none">' + field('選擇組別', sel('kpiTarget', targetGroups().slice(1).map(function (g) { return { v: g, label: g }; }))) + '</div>' +
      '<div id="kpiTargetStudentsWrap" class="kpi-target-students" style="display:none">' +
        '<div class="kpi-target-filters"><input id="kpiStudentSearch" class="text-input" placeholder="搜尋選手姓名" />' +
        sel('kpiStudentGroupFilter', [{ v: '', label: '全部組別' }].concat(targetGroups().slice(1).map(function (g) { return { v: g, label: g }; }))) + '</div>' +
        '<div class="kpi-target-actions"><button type="button" class="btn btn-ghost" id="kpiSelectVisible">選取目前名單</button>' +
        '<button type="button" class="btn btn-ghost" id="kpiClearStudents">清除選取</button></div>' +
        '<div id="kpiStudentList" class="kpi-student-list"></div>' +
      '</div>' +
      '<div id="kpiTargetSummary" class="kpi-target-summary"></div>' +
      field('截止時間', sel('kpiClose', CLOSE_PRESETS.map(function (c) { return { v: c.v, label: c.label }; }))) +
      '<div id="kpiCloseCustomWrap" style="display:none">' + field('自訂截止', '<input id="kpiCloseCustom" class="text-input" type="datetime-local" />') + '</div>' +
      '<div class="kpi-new-toggles">' +
      checkbox('kpiInWeekly', '列入週報', true) + checkbox('kpiInMonthly', '列入月報', true) + checkbox('kpiLine', '開啟即發 LINE 通知', false) +
      '</div>' +
      '<div class="btn-group"><button type="button" id="kpiCreateBtn" class="btn btn-primary">✅ 確認開啟</button>' +
      '<button type="button" id="kpiCancelBtn" class="btn btn-ghost">取消</button></div>';
    el('kpiTargetMode').addEventListener('change', updateTargetControls);
    el('kpiTarget').addEventListener('change', updateTargetSummary);
    el('kpiStudentSearch').addEventListener('input', renderStudentChoices);
    el('kpiStudentGroupFilter').addEventListener('change', renderStudentChoices);
    el('kpiSelectVisible').addEventListener('click', function () {
      filteredCoachStudents().forEach(function (s) { selectedStudentIds[s.studentId] = true; });
      renderStudentChoices();
    });
    el('kpiClearStudents').addEventListener('click', function () { selectedStudentIds = {}; renderStudentChoices(); });
    el('kpiStudentList').addEventListener('change', function (e) {
      if (!e.target.classList.contains('kpi-student-choice')) return;
      if (e.target.checked) selectedStudentIds[e.target.value] = true;
      else delete selectedStudentIds[e.target.value];
      updateTargetSummary();
    });
    el('kpiClose').addEventListener('change', function () {
      el('kpiCloseCustomWrap').style.display = (this.value === 'custom') ? 'block' : 'none';
    });
    el('kpiCreateBtn').addEventListener('click', createSession);
    el('kpiCancelBtn').addEventListener('click', function () { f.style.display = 'none'; });
    updateTargetControls();
  }

  function field(label, inner) { return '<label class="field-label">' + esc(label) + '</label>' + inner; }
  function sel(id, opts) { return '<select id="' + id + '" class="text-input">' + opts.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.label) + '</option>'; }).join('') + '</select>'; }
  function checkbox(id, label, checked) { return '<label class="kpi-check"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' /> ' + esc(label) + '</label>'; }

  function filteredCoachStudents() {
    var q = String(el('kpiStudentSearch').value || '').trim().toLowerCase();
    var group = el('kpiStudentGroupFilter').value;
    return coachStudents.filter(function (s) {
      var matchesName = !q || String(s.studentName).toLowerCase().indexOf(q) !== -1;
      var matchesGroup = !group || String(s.group || '').indexOf(group) !== -1;
      return matchesName && matchesGroup;
    });
  }

  function renderStudentChoices() {
    var list = el('kpiStudentList');
    if (!list) return;
    var students = filteredCoachStudents();
    list.innerHTML = students.length ? students.map(function (s) {
      return '<label class="kpi-student-option"><input type="checkbox" class="kpi-student-choice" value="' + esc(s.studentId) + '"' +
        (selectedStudentIds[s.studentId] ? ' checked' : '') + ' /><span><b>' + esc(s.studentName) + '</b>' +
        (s.group ? '<small>' + esc(s.group) + '</small>' : '') + '</span></label>';
    }).join('') : '<div class="hint-box">沒有符合條件的選手。</div>';
    updateTargetSummary();
  }

  function updateTargetControls() {
    var mode = el('kpiTargetMode').value;
    el('kpiTargetGroupWrap').style.display = mode === 'group' ? '' : 'none';
    el('kpiTargetStudentsWrap').style.display = mode === 'students' ? '' : 'none';
    var line = el('kpiLine');
    line.disabled = mode !== 'all';
    if (line.disabled) line.checked = false;
    if (mode === 'students') renderStudentChoices();
    else updateTargetSummary();
  }

  function updateTargetSummary() {
    var summary = el('kpiTargetSummary');
    if (!summary) return;
    var mode = el('kpiTargetMode').value;
    var targets = [];
    if (mode === 'all') targets = coachStudents;
    else if (mode === 'group') {
      var group = el('kpiTarget').value;
      targets = coachStudents.filter(function (s) { return String(s.group || '').indexOf(group) !== -1; });
    } else {
      targets = coachStudents.filter(function (s) { return selectedStudentIds[s.studentId]; });
    }
    var names = targets.slice(0, 6).map(function (s) { return s.studentName; }).join('、');
    summary.textContent = '將開放 ' + targets.length + ' 人' + (names ? '：' + names + (targets.length > 6 ? '…' : '') : '') +
      (mode === 'all' ? '' : '。部分名單不提供全頻道 LINE 通知。');
  }

  async function createSession() {
    var btn = el('kpiCreateBtn'); if (btn) { btn.disabled = true; btn.textContent = '建立中...'; }
    var targetMode = el('kpiTargetMode').value;
    var targetStudentIds = targetMode === 'students' ? Object.keys(selectedStudentIds) : [];
    if (targetMode === 'students' && !targetStudentIds.length) {
      notify('請至少選擇一位選手');
      if (btn) { btn.disabled = false; btn.textContent = '✅ 確認開啟'; }
      return;
    }
    var payload = {
      action: 'createKpiSession',
      sessionName: el('kpiName').value.trim() || '本週 KPI 成長回報',
      sessionType: el('kpiType').value,
      targetGroup: targetMode === 'all' ? '全隊' : (targetMode === 'group' ? el('kpiTarget').value : '指定選手'),
      targetStudentIds: targetStudentIds,
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
    if (op === 'report') return generateWeeklyReport(id);
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

  /* ===================== 獨立週報 ===================== */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function avg(arr) { var xs = arr.filter(function (n) { return n != null; }); return xs.length ? Math.round((xs.reduce(function (a, b) { return a + b; }, 0) / xs.length) * 10) / 10 : null; }

  async function generateWeeklyReport(id) {
    var box = el('kpiDetail-' + id);
    if (box) box.innerHTML = '產生週報中...';
    var res;
    try { res = await api({ action: 'getKpiSessionDetail', sessionId: id }); }
    catch (e) { if (box) box.innerHTML = '<div class="hint-box warn">讀取失敗</div>'; return; }
    if (!res || !res.ok) { if (box) box.innerHTML = '<div class="hint-box warn">' + esc((res && res.error) || '讀取失敗') + '</div>'; return; }
    var session = res.session, st = res.stats || {};
    var reports = st.reports || [];
    if (!reports.length) { if (box) box.innerHTML = '<div class="hint-box">本次 KPI 尚無人填寫，無法產生週報。</div>'; return; }

    var html = buildWeeklyReportHtml(session, st, reports);
    if (box) {
      box.innerHTML =
        '<div class="btn-group"><button type="button" class="btn btn-secondary kpi-wr-print">🖨 列印 / 存 PDF</button>' +
        '<button type="button" class="btn btn-ghost kpi-wr-close">收合</button></div>' +
        '<div class="kpi-weekly-report" id="kpiWR-' + esc(id) + '">' + html + '</div>';
      box.querySelector('.kpi-wr-print').addEventListener('click', function () { printWeeklyReport(session, html); });
      box.querySelector('.kpi-wr-close').addEventListener('click', function () { box.innerHTML = ''; });
    }
  }

  function buildWeeklyReportHtml(session, st, reports) {
    // 六面向全隊平均
    var aspectAvgs = WK_DIMS.map(function (d) {
      return { label: d.label, icon: d.icon, val: avg(reports.map(function (r) { return num(r[d.key]); })) };
    });
    var teamAvg = avg(reports.map(function (r) { return num(r.averageScore); }));
    // 進步最多 / 需關懷
    var improved = reports.filter(function (r) { return num(r.changeScore) != null && num(r.changeScore) > 0; })
      .sort(function (a, b) { return num(b.changeScore) - num(a.changeScore); }).slice(0, 5);
    var care = reports.filter(function (r) { return String(r.riskLevel || '').indexOf('紅') !== -1; });

    var h = '';
    h += '<div class="kpi-wr-head"><div class="kpi-wr-title">育林國中技擊隊　每週 KPI 成長週報</div>' +
      '<div class="kpi-wr-sub">' + esc(session.sessionName || '') + '　｜　' + esc(typeLabel(session.sessionType)) + '　｜　' + esc(session.weekId || '') + '</div>' +
      '<div class="kpi-wr-sub">產生日期：' + new Date().toLocaleDateString('zh-TW') + '</div></div>';

    // 摘要卡
    h += '<div class="kpi-wr-cards">' +
      wrCard('完成率', st.completionRate + '%', st.doneCount + '/' + st.total) +
      wrCard('全隊平均', teamAvg == null ? '—' : teamAvg, '/ 5') +
      wrCard('🟢 綠燈', st.green, '人') +
      wrCard('🟡 黃燈', st.yellow, '人') +
      wrCard('🔴 紅燈', st.red, '人') +
      wrCard('未完成', st.pendingCount, '人') +
      '</div>';

    // 六面向
    h += '<div class="kpi-wr-sech">六面向全隊平均</div><div class="kpi-wr-aspects">';
    aspectAvgs.forEach(function (a) {
      var tone = a.val == null ? '' : a.val >= 4 ? 'good' : a.val >= 3 ? 'mid' : 'low';
      h += '<div class="kpi-wr-aspect ' + tone + '"><div class="kpi-wr-aspect-ic">' + a.icon + '</div>' +
        '<div class="kpi-wr-aspect-v">' + (a.val == null ? '—' : a.val) + '</div>' +
        '<div class="kpi-wr-aspect-l">' + esc(a.label) + '</div></div>';
    });
    h += '</div>';

    // 進步最多
    if (improved.length) {
      h += '<div class="kpi-wr-sech">📈 本週進步最多</div><ul class="kpi-wr-list">';
      improved.forEach(function (r) { h += '<li>' + esc(r.studentName) + '：' + (num(r.changeScore) > 0 ? '+' : '') + r.changeScore + '（' + (r.averageScore || '—') + ' / 5）</li>'; });
      h += '</ul>';
    }
    // 需關懷
    if (care.length) {
      h += '<div class="kpi-wr-sech">💛 需關懷（紅燈）</div><ul class="kpi-wr-list">';
      care.forEach(function (r) { h += '<li>' + esc(r.studentName) + '：平均 ' + (r.averageScore || '—') + '，' + esc(r.needImproveThisWeek || '需個別了解') + '</li>'; });
      h += '</ul>';
    }

    // 全隊明細表
    h += '<div class="kpi-wr-sech">全隊明細</div><div class="table-scroll"><table class="record-table"><thead><tr><th>選手</th>';
    WK_DIMS.forEach(function (d) { h += '<th>' + d.label + '</th>'; });
    h += '<th>平均</th><th>較上次</th><th>燈號</th></tr></thead><tbody>';
    reports.forEach(function (r) {
      h += '<tr><td>' + esc(r.studentName) + '</td>';
      WK_DIMS.forEach(function (d) { h += '<td>' + (r[d.key] || '—') + '</td>'; });
      h += '<td>' + (r.averageScore || '—') + '</td><td>' + (r.changeScore === '' || r.changeScore == null ? '—' : (num(r.changeScore) > 0 ? '+' : '') + r.changeScore) + '</td><td>' + esc(r.riskLevel || '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';

    // 未完成名單
    if (st.pendingNames && st.pendingNames.length) {
      h += '<div class="kpi-wr-sech">未完成名單</div><div class="kpi-wr-pending">' + st.pendingNames.map(esc).join('、') + '</div>';
    }
    h += '<div class="kpi-wr-foot">本報表供校內訓練管理使用。</div>';
    return h;
  }

  function wrCard(label, val, sub) {
    return '<div class="kpi-wr-card"><div class="kpi-wr-card-v">' + val + '</div><div class="kpi-wr-card-l">' + esc(label) + '</div>' + (sub ? '<div class="kpi-wr-card-s">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function printWeeklyReport(session, innerHtml) {
    var win = window.open('', '_blank');
    if (!win) { notify('請允許彈出視窗以列印'); return; }
    win.document.write(
      '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8" />' +
      '<title>週報_' + esc(session.sessionName || '') + '</title>' +
      '<link rel="stylesheet" href="style.css?v=20260622e" />' +
      '<style>body{background:#fff;color:#111;margin:0;padding:18px;font-family:"Microsoft JhengHei",sans-serif;}' +
      '.kpi-weekly-report{max-width:760px;margin:0 auto;}</style>' +
      '</head><body><div class="kpi-weekly-report">' + innerHtml + '</div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>'
    );
    win.document.close();
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
    card.style.display = 'none';
    body.innerHTML = '';
    if (!r || r.role !== 'student') {
      if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
      return;
    }
    try {
      var res = await api({ action: 'getStudentKpiSession' });
      if (!res || !res.ok) {
        if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
        return;
      }
      var state = res.state;
      if (typeof window.setDailyKpiAvailability === 'function') {
        window.setDailyKpiAvailability(state === 'open', state === 'open' ? res.session : null);
      }
    } catch (e) {
      if (typeof window.setDailyKpiAvailability === 'function') window.setDailyKpiAvailability(false, null);
    }
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
