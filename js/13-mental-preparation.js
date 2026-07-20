/* ============================================================
   13. 心理準備訓練計畫
   獨立模組：UI、資料讀寫、28天計畫、完成度、提醒與教練管理。
   ============================================================ */
(function () {
  const ROOT_ID = 'mentalPreparationRoot';
  const LOCAL_KEY = 'yulin_mental_local_v2';
  const TODAY = () => (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10));
  const STATUS = ['尚未建立', '已建立', '已模擬', '教練確認', '能獨立執行'];
  const TALK_TYPES = ['平常訓練口令', '上場前口令', '比賽開始口令', '落後時口令', '被連續得分時口令', '失誤後口令', '比分領先時口令', '最後30秒口令', '品勢等待上場口令', '個人自訂口令'];
  const TALK_EXAMPLES = [
    ['我怕會輸', '先做好第一個動作'], ['對手很強', '專注執行自己的戰術'], ['我已經落後', '還有時間，一分一分追回來'],
    ['我不敢進攻', '看準、啟動、做到底'], ['我剛剛失誤了', '已經過去了，下一次重新開始'], ['我很緊張', '緊張代表這場比賽對我很重要'], ['我怕忘記動作', '呼吸、站穩、相信練過的自己']
  ];
  const TRAINING = [
    ['腹式呼吸', '用腹部起伏讓身體安定。', 180], ['4秒吸氣、6秒吐氣', '用固定節奏降低過度緊張。', 180],
    ['成功意象', '在腦中重播自己做對的畫面。', 240], ['比賽流程意象', '演練檢錄、等待、上場與第一個動作。', 240],
    ['專注定點', '把注意力拉回固定視線點。', 180], ['身體放鬆掃描', '逐段放鬆肩頸、下顎、手腳。', 240],
    ['成功經驗回顧', '整理自己曾經做得到的證據。', 180], ['失誤後三秒重置', '吐氣、口令、眼睛回到下一拍。', 180],
    ['感謝與正向紀錄', '寫下今天做好的事與感謝。', 180], ['個人自訂心理訓練', '建立自己的固定流程。', 180]
  ].map((x, i) => ({ id: 'train-' + i, name: x[0], desc: x[1], seconds: x[2] }));
  const SCENARIOS = [
    '上場前非常緊張', '心跳過快或手腳僵硬', '第一局先被得分', '被對手連續得分', '自己出現失誤', '裁判判決不利', '比分領先',
    '最後30秒落後', '教練臨時改變戰術', '對手比預期強', '品勢等待時間過長', '上場後突然忘記動作', '暖身場地或時間改變', '個人自訂情境'
  ];
  const PHASES = [
    { min: 22, max: 28, name: '建立自信', tasks: ['寫下三項個人優勢', '回顧最佳比賽', '建立個人心理口令', '設定結果、表現及過程目標', '成功意象'] },
    { min: 15, max: 21, name: '壓力模擬', tasks: ['落後情境模擬', '被連續得分模擬', '裁判判決不利模擬', '最後30秒模擬', '延長賽或決勝局模擬', '模擬後填寫反思'] },
    { min: 8, max: 14, name: '固定流程', tasks: ['固定上場前呼吸', '固定熱身順序', '固定上場前口令', '固定第一個戰術', '固定失誤後重置流程', '完整比賽流程模擬'] },
    { min: 1, max: 7, name: '穩定信心', tasks: ['每日成功意象', '每日閱讀個人優勢', '確認心理計畫', '睡眠與恢復檢查', '不再大量增加新技術', '簡短心理任務'] },
    { min: 0, max: 0, name: '比賽日', tasks: ['三輪呼吸', '閱讀三句個人口令', '確認第一個戰術', '快速回報自信緊張專注', '賽後反思'] }
  ];
  const state = { name: '', data: emptyData(''), timer: null, remaining: 0, saving: false };

  function h(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function role() { return (typeof getRole === 'function' && getRole()) || {}; }
  function players() { return (typeof getPlayers === 'function' ? getPlayers() : []); }
  function daysTo(date) {
    if (!date) return null;
    const a = new Date(TODAY() + 'T00:00:00'), b = new Date(String(date).slice(0, 10) + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.ceil((b - a) / 86400000);
  }
  function phaseFor(days) {
    if (days == null) return { name: '平日累積', task: '完成一個3至5分鐘心理訓練', type: 'daily' };
    if (days < 0) return { name: '賽後回顧', task: '填寫賽後反思', type: 'reflection' };
    const p = PHASES.find(x => days >= x.min && days <= x.max) || PHASES[0];
    return { name: p.name, task: p.tasks[Math.abs(days) % p.tasks.length], type: p.name === '比賽日' ? 'competition-day' : p.name };
  }
  function emptyData(name) {
    return { studentName: name, competitions: [], competition: null, dailyRecords: [], selfTalk: [], goals: [], scenarioPlans: [], reflections: [], completion: {}, alerts: [] };
  }
  function localAll() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { competitions: [], byStudent: {} }; } catch (e) { return { competitions: [], byStudent: {} }; }
  }
  function saveLocalAll(all) { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); }
  function studentKey(name) { return String(name || '').trim(); }
  function localStudent(name) {
    const all = localAll(), key = studentKey(name);
    return Object.assign(emptyData(name), all.byStudent[key] || {}, { competitions: all.competitions });
  }
  function setLocalStudent(name, patch) {
    const all = localAll(), key = studentKey(name);
    all.byStudent[key] = Object.assign(localStudent(name), patch || {});
    if (patch && patch.competitions) all.competitions = patch.competitions;
    saveLocalAll(all);
  }
  async function api(action, body) {
    if (!getWebAppUrl || !getWebAppUrl()) throw new Error('local');
    const res = await postToWebApp(Object.assign({ action }, body || {}));
    if (!res || !res.ok) throw new Error((res && res.error) || 'API failed');
    return res.data;
  }
  async function loadStudent(name) {
    const d = emptyData(name);
    try {
      const [comps, plan] = await Promise.all([
        api('getMentalCompetitions', { studentName: name }),
        api('getMentalParticipantPlan', { studentName: name })
      ]);
      Object.assign(d, plan || {}, { competitions: comps || [] });
    } catch (e) {
      Object.assign(d, localStudent(name));
    }
    d.competition = pickCompetition(d.competitions);
    d.completion = d.completion || completion(d);
    state.data = d;
    return d;
  }
  function pickCompetition(comps) {
    const active = (comps || []).filter(c => String(c.status || 'active') === 'active');
    active.sort((a, b) => String(a.competitionDate).localeCompare(String(b.competitionDate)));
    return active[0] || null;
  }
  function currentName() {
    const r = role();
    if (r.role === 'student' || r.role === 'parent') return String(r.name || '').trim();
    const sel = document.getElementById('mpStudentName');
    return sel ? sel.value : state.name;
  }
  async function render() {
    injectStyles();
    const r = role(), root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (r.role !== 'student' && r.role !== 'coach') {
      root.innerHTML = '<div class="card"><div class="hint-box warn">此分頁只開放選手與教練使用。</div></div>';
      return;
    }
    const name = r.role === 'student' ? String(r.name || '') : (state.name || players()[0] || '');
    state.name = name;
    root.innerHTML = r.role === 'coach' ? coachPageShell(name) : '<div id="mpStudentPage"></div>';
    if (r.role === 'coach') bindCoachShell();
    await loadAndDraw(currentName());
  }
  async function loadAndDraw(name) {
    if (!name) return;
    state.name = name;
    await loadStudent(name);
    drawStudentPage();
    if (role().role === 'coach') drawCoachInline();
  }
  function coachPageShell(name) {
    return `<div class="card"><h3 class="card-title">🧠 心理準備管理</h3>
      <div class="coach-controls">
        <label class="field-label">選手</label><select id="mpStudentName" class="text-input">${players().map(n => `<option ${n === name ? 'selected' : ''}>${h(n)}</option>`).join('')}</select>
        <button type="button" id="mpRefresh" class="btn btn-secondary">重新整理</button>
      </div>
      <details class="mp-inline-editor" open><summary>建立／編輯比賽與參賽選手</summary>
        <label class="field-label">比賽名稱</label><input id="mpCompName" class="text-input">
        <label class="field-label">比賽日期</label><input id="mpCompDate" type="date" class="text-input">
        <label class="field-label">運動類型</label><input id="mpCompSport" class="text-input" value="跆拳道">
        <label class="field-label">參賽項目</label><input id="mpCompEvent" class="text-input">
        <div class="mp-player-checks">${players().map(n => `<label class="toggle-row"><input type="checkbox" class="mp-participant" value="${h(n)}" ${n === name ? 'checked' : ''}> ${h(n)}</label>`).join('')}</div>
        <div class="btn-group"><button type="button" id="mpSaveCompetition" class="btn btn-primary">建立比賽並自動建立28天計畫</button><button type="button" id="mpExportTeam" class="btn btn-secondary">匯出全隊總覽 CSV</button></div>
      </details>
      <div id="mpCoachInline"></div></div><div id="mpStudentPage"></div>`;
  }
  function bindCoachShell() {
    document.getElementById('mpStudentName')?.addEventListener('change', e => loadAndDraw(e.target.value));
    document.getElementById('mpRefresh')?.addEventListener('click', () => loadAndDraw(currentName()));
    document.getElementById('mpSaveCompetition')?.addEventListener('click', saveCompetition);
    document.getElementById('mpExportTeam')?.addEventListener('click', exportTeamCsv);
  }
  async function saveCompetition() {
    if (state.saving) return;
    state.saving = true;
    const btn = document.getElementById('mpSaveCompetition');
    if (btn) btn.textContent = '儲存中...';
    const comp = {
      competitionName: val('mpCompName'), competitionDate: val('mpCompDate'), sportType: val('mpCompSport'),
      eventName: val('mpCompEvent'), startDate: offsetDate(val('mpCompDate'), -28), status: 'active'
    };
    const names = Array.from(document.querySelectorAll('.mp-participant:checked')).map(x => x.value);
    try {
      const saved = await api('saveMentalCompetition', { payload: comp });
      await api('saveMentalParticipants', { competitionId: saved.competitionId, participants: names.map(n => ({ studentName: n, groupName: '' })) });
      toast('已建立比賽與28天心理計畫');
    } catch (e) {
      const all = localAll();
      comp.competitionId = comp.competitionId || 'local-' + Date.now();
      all.competitions.push(comp);
      names.forEach(n => { all.byStudent[n] = Object.assign(localStudent(n), { competitions: all.competitions }); });
      saveLocalAll(all);
      toast('已存本機測試模式');
    }
    state.saving = false;
    if (btn) btn.textContent = '建立比賽並自動建立28天計畫';
    loadAndDraw(currentName());
    renderCoachDashboard();
  }
  function drawStudentPage() {
    const box = document.getElementById('mpStudentPage');
    if (!box) return;
    const d = state.data, comp = d.competition, days = comp ? daysTo(comp.competitionDate) : null, phase = phaseFor(days);
    box.innerHTML = nextCard(d, comp, days, phase) + dailyTaskCard(d, comp, phase) + scoreCard(d) + fourCards(d, comp) + reflectionCard(d, comp);
    bindStudentEvents();
  }
  function nextCard(d, comp, days, phase) {
    if (!comp) return `<div class="card mp-hero"><h3 class="card-title">下一場比賽</h3><div class="hint-box">目前尚未建立賽前心理訓練計畫，請依照平日心理訓練任務持續累積。</div></div>`;
    const stats = completion(d);
    return `<div class="card mp-hero"><h3 class="card-title">下一場比賽</h3><div class="overview-grid">
      ${metric('比賽名稱', comp.competitionName)}${metric('比賽日期', comp.competitionDate)}${metric('參賽項目', comp.eventName || '-')}
      ${metric('剩餘天數', days < 0 ? '已結束' : days + ' 天')}${metric('目前階段', phase.name)}${metric('本週完成率', weekRate(d.dailyRecords) + '%')}
      ${metric('28天整體完成率', stats.trainingRate + '%')}${metric('連續完成天數', streak(d.dailyRecords) + ' 天')}
    </div><div class="mp-today-task"><b>今日心理任務</b><span>${h(phase.task)}</span><button type="button" class="btn btn-primary" data-scroll="#mpDailyTask">開始訓練</button></div></div>`;
  }
  function dailyTaskCard(d, comp, phase) {
    const todays = (d.dailyRecords || []).find(r => r.date === TODAY() && String(r.competitionId || '') === String(comp && comp.competitionId || ''));
    return `<div class="card" id="mpDailyTask"><h3 class="card-title">今日心理任務</h3>
      <p class="review-label">${h(phase.name)}｜${h(phase.task)}｜3 至 5 分鐘完成</p>
      <div id="mpTimer" class="mp-timer" style="display:none"></div>
      <div class="btn-group"><button type="button" class="btn btn-secondary" data-timer="240">開始4分鐘倒數</button></div>
      <div class="mp-rate-grid">
        ${range('mpConfidence', '自信心', todays && todays.confidenceScore)}
        ${range('mpAnxiety', '緊張程度', todays && todays.anxietyScore)}
        ${range('mpFocus', '專注程度', todays && todays.focusScore)}
      </div>
      <label class="field-label">今日使用的自我對話</label><input id="mpSelfTalkUsed" class="text-input" value="${h(todays && todays.selfTalkUsed || '')}">
      <label class="field-label">今日成功的一件事</label><input id="mpSuccessNote" class="text-input" value="${h(todays && todays.successNote || '')}">
      <label class="field-label">簡短心得</label><textarea id="mpReflection" class="text-input" rows="2">${h(todays && todays.reflection || '')}</textarea>
      <label class="toggle-row"><input type="checkbox" id="mpNeedHelp" ${todays && String(todays.needCoachHelp) === 'true' ? 'checked' : ''}> 需要教練協助</label>
      <button type="button" id="mpSaveDaily" class="btn btn-primary">${todays ? '更新今日任務' : '完成今日任務'}</button>
      <div id="mpAiFeedback" class="hint-box good" style="display:none"></div></div>`;
  }
  function scoreCard(d) {
    const c = completion(d), trends = trendText(d.dailyRecords || []), advice = latestCoachPublic(d);
    return `<div class="card"><h3 class="card-title">心理準備完成度</h3>
      <div class="overview-grid">${metric('心理準備完成度', c.total + '%')}${metric('心理訓練', c.trainingRate + '%')}${metric('自我對話', c.selfTalkRate + '%')}${metric('過程目標', c.processGoalRate + '%')}${metric('心理計畫', c.scenarioPlanRate + '%')}${metric('賽後反思', c.reflectionRate + '%')}</div>
      <h4 class="account-admin-title">心理自評趨勢</h4><div class="mp-trend">${trends}</div>
      <h4 class="account-admin-title">教練心理評語</h4><div class="hint-box">${h(advice || '目前尚未有教練公開心理評語。')}</div></div>`;
  }
  function fourCards(d, comp) {
    return `<div class="mp-grid">${trainingCard()}${selfTalkCard(d, comp)}${goalCard(d, comp)}${planCard(d, comp)}</div>`;
  }
  function trainingCard() {
    return `<div class="card mp-card"><h3 class="card-title">心理訓練</h3>${TRAINING.map(t => `<details class="mp-task"><summary>${h(t.name)}<small>${Math.round(t.seconds / 60)} 分鐘</small></summary><p class="review-label">${h(t.desc)}</p><button type="button" class="btn btn-secondary" data-timer="${t.seconds}">開始倒數</button></details>`).join('')}</div>`;
  }
  function selfTalkCard(d, comp) {
    const byType = {}; (d.selfTalk || []).forEach(x => { byType[x.situationType] = x; });
    return `<div class="card mp-card"><h3 class="card-title">自我對話</h3>${TALK_TYPES.map((t, i) => {
      const x = byType[t] || {}, ex = TALK_EXAMPLES[i] || ['', ''];
      return `<label class="field-label">${h(t)}</label><input class="text-input mp-talk-neg" data-talk="${h(t)}" placeholder="${h(ex[0])}" value="${h(x.negativeThought || '')}"><input class="text-input mp-talk-pos" data-talk="${h(t)}" placeholder="${h(ex[1])}" value="${h(x.replacementPhrase || '')}">`;
    }).join('')}<button type="button" id="mpSaveTalk" class="btn btn-primary">儲存自我對話</button></div>`;
  }
  function goalCard(d) {
    const goals = d.goals || [], get = type => goals.filter(g => g.goalType === type || g.goalType === ({ result: '結果目標', performance: '表現目標', process: '過程目標' }[type]));
    return `<div class="card mp-card"><h3 class="card-title">目標設定</h3>
      <label class="field-label">結果目標（不計分）</label><textarea id="mpGoalResult" class="text-input" rows="2">${h((get('result')[0] || {}).goalText || '')}</textarea>
      <label class="field-label">表現目標</label><textarea id="mpGoalPerformance" class="text-input" rows="2">${h((get('performance')[0] || {}).goalText || '')}</textarea>
      <label class="field-label">過程目標</label><textarea id="mpGoalProcess" class="text-input" rows="3" placeholder="每天完成一次心理訓練">${h(get('process').map(g => g.goalText).join('\n'))}</textarea>
      <button type="button" id="mpSaveGoals" class="btn btn-primary">儲存目標</button></div>`;
  }
  function planCard(d) {
    const byScenario = {}; (d.scenarioPlans || []).forEach(p => { byScenario[p.scenario] = p; });
    return `<div class="card mp-card"><h3 class="card-title">心理計畫</h3>${SCENARIOS.map(s => {
      const p = byScenario[s] || {};
      return `<details class="mp-task"><summary>${h(s)}<small>${h(p.status || '尚未建立')}</small></summary>
        <input class="text-input mp-plan-thought" data-scenario="${h(s)}" placeholder="可能出現的想法" value="${h(p.expectedThought || '')}">
        <input class="text-input mp-plan-body" data-scenario="${h(s)}" placeholder="身體反應" value="${h(p.bodyReaction || '')}">
        <input class="text-input mp-plan-breath" data-scenario="${h(s)}" placeholder="呼吸方法" value="${h(p.breathingAction || '4秒吸氣、6秒吐氣三輪')}">
        <input class="text-input mp-plan-talk" data-scenario="${h(s)}" placeholder="自我對話" value="${h(p.selfTalkPhrase || '')}">
        <textarea class="text-input mp-plan-cope" data-scenario="${h(s)}" rows="2" placeholder="處理行動">${h(p.copingAction || '')}</textarea>
        <textarea class="text-input mp-plan-tactic" data-scenario="${h(s)}" rows="2" placeholder="戰術行動">${h(p.tacticalAction || '')}</textarea>
        <select class="text-input mp-plan-status" data-scenario="${h(s)}">${STATUS.map(x => `<option ${x === (p.status || '尚未建立') ? 'selected' : ''}>${x}</option>`).join('')}</select>
      </details>`;
    }).join('')}<label class="field-label">教練公開協助建議</label><textarea id="mpCoachPublicAdvice" class="text-input" rows="2">${h(latestCoachPublic(d))}</textarea><button type="button" id="mpSavePlans" class="btn btn-primary">儲存心理計畫</button></div>`;
  }
  function reflectionCard(d, comp) {
    const r = (d.reflections || []).slice(-1)[0] || {};
    return `<div class="card"><h3 class="card-title">賽後反思</h3>
      ${['今天做得最好的是什麼|bestPerformance', '比賽中最緊張的時刻|mostStressfulMoment', '是否使用自我對話|selfTalkUsed', '哪一句最有效|effectivePhrase', '心理計畫是否有效|planEffective', '表現目標是否完成|performanceGoalCompleted', '過程目標是否完成|processGoalCompleted', '失誤後多久恢復專注|recoverySeconds', '下一場要調整的一件事|nextAdjustment'].map(x => {
        const [label, id] = x.split('|'); return `<label class="field-label">${label}</label><input id="mpRef_${id}" class="text-input" value="${h(r[id] || '')}">`;
      }).join('')}<button type="button" id="mpSaveReflection" class="btn btn-primary">儲存賽後反思</button></div>`;
  }
  function bindStudentEvents() {
    document.querySelectorAll('[data-scroll]').forEach(b => b.addEventListener('click', () => document.querySelector(b.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' })));
    document.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => startTimer(Number(b.dataset.timer || 240))));
    document.getElementById('mpSaveDaily')?.addEventListener('click', saveDaily);
    document.getElementById('mpSaveTalk')?.addEventListener('click', saveTalk);
    document.getElementById('mpSaveGoals')?.addEventListener('click', saveGoals);
    document.getElementById('mpSavePlans')?.addEventListener('click', savePlans);
    document.getElementById('mpSaveReflection')?.addEventListener('click', saveReflection);
  }
  async function saveDaily() {
    const d = state.data, comp = d.competition, days = comp ? daysTo(comp.competitionDate) : null, phase = phaseFor(days);
    const payload = { competitionId: comp && comp.competitionId || '', studentName: state.name, date: TODAY(), phase: phase.name, taskType: phase.type, taskName: phase.task, completed: true, completedAt: new Date().toISOString(), confidenceScore: val('mpConfidence'), anxietyScore: val('mpAnxiety'), focusScore: val('mpFocus'), selfTalkUsed: val('mpSelfTalkUsed'), successNote: val('mpSuccessNote'), reflection: val('mpReflection'), needCoachHelp: document.getElementById('mpNeedHelp')?.checked };
    await saveRemoteOrLocal('saveMentalDailyRecord', payload, 'dailyRecords', 'recordId');
    const fb = ruleFeedback(payload);
    const box = document.getElementById('mpAiFeedback'); if (box) { box.style.display = ''; box.textContent = fb; }
    toast('今日心理任務已儲存');
    loadAndDraw(state.name);
  }
  async function saveTalk() {
    const comp = state.data.competition;
    for (const type of TALK_TYPES) {
      const neg = document.querySelector(`.mp-talk-neg[data-talk="${cssEsc(type)}"]`)?.value || '';
      const pos = document.querySelector(`.mp-talk-pos[data-talk="${cssEsc(type)}"]`)?.value || '';
      if (neg || pos) await saveRemoteOrLocal('saveMentalSelfTalk', { competitionId: comp && comp.competitionId || '', studentName: state.name, situationType: type, negativeThought: neg, replacementPhrase: pos, active: true }, 'selfTalk', 'selfTalkId', false);
    }
    toast('自我對話已儲存'); loadAndDraw(state.name);
  }
  async function saveGoals() {
    const comp = state.data.competition, cid = comp && comp.competitionId || '';
    const rows = [{ goalType: 'result', goalText: val('mpGoalResult') }, { goalType: 'performance', goalText: val('mpGoalPerformance') }]
      .concat(val('mpGoalProcess').split('\n').map(x => x.trim()).filter(Boolean).map(x => ({ goalType: 'process', goalText: x, targetCount: 7, completedCount: 0 })));
    for (const row of rows.filter(x => x.goalText)) await saveRemoteOrLocal('saveMentalGoal', Object.assign({ competitionId: cid, studentName: state.name, status: 'active' }, row), 'goals', 'goalId', false);
    toast('目標已儲存'); loadAndDraw(state.name);
  }
  async function savePlans() {
    const comp = state.data.competition, cid = comp && comp.competitionId || '';
    for (const scenario of SCENARIOS) {
      const payload = {
        competitionId: cid, studentName: state.name, scenario,
        expectedThought: q(`.mp-plan-thought[data-scenario="${cssEsc(scenario)}"]`), bodyReaction: q(`.mp-plan-body[data-scenario="${cssEsc(scenario)}"]`),
        breathingAction: q(`.mp-plan-breath[data-scenario="${cssEsc(scenario)}"]`), selfTalkPhrase: q(`.mp-plan-talk[data-scenario="${cssEsc(scenario)}"]`),
        copingAction: q(`.mp-plan-cope[data-scenario="${cssEsc(scenario)}"]`), tacticalAction: q(`.mp-plan-tactic[data-scenario="${cssEsc(scenario)}"]`),
        status: q(`.mp-plan-status[data-scenario="${cssEsc(scenario)}"]`), coachComment: val('mpCoachPublicAdvice')
      };
      if (payload.expectedThought || payload.selfTalkPhrase || payload.copingAction || payload.status !== '尚未建立') await saveRemoteOrLocal('saveMentalScenarioPlan', payload, 'scenarioPlans', 'planId', false);
    }
    toast('心理計畫已儲存'); loadAndDraw(state.name);
  }
  async function saveReflection() {
    const comp = state.data.competition, payload = { competitionId: comp && comp.competitionId || '', studentName: state.name, date: TODAY(), matchType: '賽後/模擬賽' };
    ['bestPerformance', 'mostStressfulMoment', 'selfTalkUsed', 'effectivePhrase', 'planEffective', 'performanceGoalCompleted', 'processGoalCompleted', 'recoverySeconds', 'nextAdjustment'].forEach(k => payload[k] = val('mpRef_' + k));
    await saveRemoteOrLocal('saveMentalReflection', payload, 'reflections', 'reflectionId');
    toast('賽後反思已儲存'); loadAndDraw(state.name);
  }
  async function saveRemoteOrLocal(action, payload, listKey, idKey, redraw) {
    try {
      await api(action, { payload });
    } catch (e) {
      const d = localStudent(state.name);
      payload[idKey] = payload[idKey] || 'local-' + Date.now() + Math.random().toString(16).slice(2);
      d[listKey] = (d[listKey] || []).filter(x => String(x[idKey]) !== String(payload[idKey]));
      d[listKey].push(payload);
      setLocalStudent(state.name, d);
    }
    if (redraw !== false) await loadStudent(state.name);
  }
  function drawCoachInline() {
    const box = document.getElementById('mpCoachInline');
    if (!box) return;
    const alerts = state.data.alerts || [];
    box.innerHTML = `<h4 class="account-admin-title">目前選手狀態</h4><div class="overview-grid">${metric('完成度', (state.data.completion.total || 0) + '%')}${metric('需要關心', alerts.length ? '是' : '否')}${metric('最後填寫', ((state.data.dailyRecords || []).slice(-1)[0] || {}).date || '-')}</div>${alerts.map(a => `<div class="hint-box warn">需要教練關心：${h(a.reason || a.label)}</div>`).join('')}`;
  }
  async function renderCoachDashboard() {
    const box = document.getElementById('mentalCoachDashboard');
    if (!box) return;
    try {
      const data = await api('getMentalCoachDashboard', {});
      const rows = data.rows || [];
      box.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>選手</th><th>倒數</th><th>本週</th><th>整體</th><th>自信</th><th>緊張</th><th>專注</th><th>心理計畫</th><th>最後填寫</th><th>關心</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.studentName)}</td><td>${h(r.countdownDays)}</td><td>${h(r.weekRate)}%</td><td>${h(r.overallRate)}%</td><td>${h(r.confidenceTrend)}</td><td>${h(r.anxietyTrend)}</td><td>${h(r.focusTrend)}</td><td>${h(r.scenarioPlanStatus)}</td><td>${h(r.lastRecordDate || '-')}</td><td>${r.needCare ? '<span class="tag tag-red">需要關心</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="review-label">尚未建立心理準備參賽名單。</p>';
    } catch (e) {
      box.innerHTML = '<div class="hint-box warn">尚未設定 Apps Script 或登入已失效；心理準備管理可在分頁內使用本機測試模式。</div>';
    }
  }
  function renderParentPublicAdvice() {
    const card = document.getElementById('parentMentalAdviceCard'), box = document.getElementById('parentMentalAdvice'), r = role();
    if (!card || !box) return;
    if (r.role !== 'parent' || !r.name) { card.style.display = 'none'; return; }
    card.style.display = '';
    api('getMentalParticipantPlan', {}).then(data => {
      box.innerHTML = `<div class="overview-grid">${metric('本週心理任務', ((data.weeklyTaskStatus || {}).weekRate || 0) + '%')}${metric('比賽倒數', (((data.competitions || [])[0] || {}).competitionDate ? daysTo((data.competitions || [])[0].competitionDate) + ' 天' : '-'))}</div><div class="hint-box good">${h(data.coachPublicAdvice || '目前教練尚未設定公開心理準備協助建議。')}</div><div class="hint-box">${h(data.parentHelp || '')}</div><div class="hint-box">${h(data.encouragementAdvice || '')}</div>`;
    }).catch(() => {
      const d = localStudent(r.name);
      box.innerHTML = `<div class="hint-box good">${h(latestCoachPublic(d) || '目前教練尚未設定公開心理準備協助建議。')}</div>`;
    });
  }
  function completion(d) {
    const daily = d.dailyRecords || [], talk = d.selfTalk || [], goals = d.goals || [], plans = d.scenarioPlans || [], refs = d.reflections || [];
    const trainingRate = Math.min(100, Math.round(daily.filter(x => String(x.completed) === 'true' || x.completed === true).length / 28 * 100));
    const selfTalkRate = talk.length ? Math.min(100, 50 + daily.filter(x => x.selfTalkUsed).length * 10) : 0;
    const process = goals.filter(g => g.goalType === 'process' || g.goalType === '過程目標');
    const processGoalRate = process.length ? Math.round(process.reduce((s, g) => s + Number(g.completionRate || 0), 0) / process.length) : 0;
    const scenarioPlanRate = plans.length ? Math.round(plans.reduce((s, p) => s + Math.max(0, STATUS.indexOf(p.status)) / 4 * 100, 0) / plans.length) : 0;
    const reflectionRate = refs.length ? 100 : 0;
    const total = Math.round(trainingRate * .25 + selfTalkRate * .2 + processGoalRate * .25 + scenarioPlanRate * .2 + reflectionRate * .1);
    return { total, trainingRate, selfTalkRate, processGoalRate, scenarioPlanRate, reflectionRate };
  }
  function weekRate(rows) { const t = new Date(TODAY()).getTime(); return Math.min(100, Math.round((rows || []).filter(r => r.completed === true || String(r.completed) === 'true').filter(r => (t - new Date(r.date).getTime()) / 86400000 < 7).length / 7 * 100)); }
  function streak(rows) {
    const done = new Set((rows || []).filter(r => r.completed === true || String(r.completed) === 'true').map(r => r.date));
    let n = 0; for (let i = 0; i < 365; i++) { const d = offsetDate(TODAY(), -i); if (!done.has(d)) break; n++; } return n;
  }
  function trendText(rows) {
    const last = (rows || []).slice(-7);
    if (!last.length) return '<p class="review-label">尚未有心理自評趨勢。</p>';
    return `<div class="mp-bars">${['confidenceScore|自信', 'anxietyScore|緊張', 'focusScore|專注'].map(x => { const [k, l] = x.split('|'); const avg = avgNum(last.map(r => r[k])); return `<div><b>${l}</b><span style="width:${avg * 10}%"></span><em>${avg || '-'}</em></div>`; }).join('')}</div>`;
  }
  function latestCoachPublic(d) { return ((d.reflections || []).filter(r => r.coachPublicComment).slice(-1)[0] || {}).coachPublicComment || ((d.scenarioPlans || []).filter(p => p.coachComment).slice(-1)[0] || {}).coachComment || ''; }
  function ruleFeedback(p) {
    const method = p.selfTalkUsed || '先做好第一個動作';
    return `你今天完成了「${p.taskName}」，也記錄了自信、緊張與專注狀態。現在最重要的是把流程固定下來：下一次開始前先做三輪呼吸，接著使用「${method}」這句口令，任務是記錄第一回合是否更穩定。`;
  }
  function startTimer(sec) {
    const box = document.getElementById('mpTimer'); if (!box) return;
    clearInterval(state.timer); state.remaining = sec; box.style.display = '';
    state.timer = setInterval(() => {
      const m = String(Math.floor(state.remaining / 60)).padStart(2, '0'), s = String(state.remaining % 60).padStart(2, '0');
      box.innerHTML = `<b>心理任務倒數</b><span>${m}:${s}</span><button type="button" id="mpStopTimer" class="btn btn-ghost">停止</button>`;
      document.getElementById('mpStopTimer').onclick = () => { clearInterval(state.timer); box.style.display = 'none'; };
      if (state.remaining-- <= 0) { clearInterval(state.timer); box.innerHTML = '<b>心理任務倒數</b><span>完成</span>'; }
    }, 1000);
  }
  function exportTeamCsv() {
    const rows = [['選手', '完成度', '本週完成率', '最後填寫']].concat(players().map(n => { const d = localStudent(n), c = completion(d); return [n, c.total + '%', weekRate(d.dailyRecords) + '%', ((d.dailyRecords || []).slice(-1)[0] || {}).date || '']; }));
    downloadText('mental-team-overview.csv', rows.map(r => r.map(csv).join(',')).join('\n'));
  }
  function downloadText(filename, text) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  function injectStyles() {
    if (document.getElementById('mentalPreparationStyles')) return;
    const s = document.createElement('style'); s.id = 'mentalPreparationStyles'; s.textContent = `
      .mp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.mp-task{border:1px solid rgba(148,163,184,.28);border-radius:8px;padding:10px;margin:10px 0;background:rgba(15,23,42,.35)}.mp-task summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px}.mp-today-task{margin-top:14px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.mp-rate-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mp-timer{position:sticky;top:8px;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-radius:8px;background:#020617;color:white;margin:10px 0}.mp-timer span{font-size:28px;font-weight:800}.mp-player-checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.mp-bars div{display:grid;grid-template-columns:54px 1fr 36px;gap:8px;align-items:center;margin:6px 0}.mp-bars span{height:10px;border-radius:999px;background:#38bdf8;display:block}.mp-bars em{font-style:normal;color:#64748b}@media(max-width:760px){.mp-grid,.mp-rate-grid,.mp-player-checks{grid-template-columns:1fr}.mp-today-task .btn{width:100%}}`;
    document.head.appendChild(s);
  }
  function metric(k, v) { return `<div class="overview-card"><span>${h(k)}</span><b>${h(v)}</b></div>`; }
  function range(id, label, val0) { const val = val0 || 5; return `<label><span class="field-label">${label} <b id="${id}Val">${val}</b></span><input id="${id}" class="slider-input" type="range" min="1" max="10" value="${h(val)}" oninput="document.getElementById('${id}Val').textContent=this.value"></label>`; }
  function val(id) { return (document.getElementById(id) || {}).value || ''; }
  function q(sel) { return (document.querySelector(sel) || {}).value || ''; }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function offsetDate(date, delta) { const d = new Date((date || TODAY()) + 'T00:00:00'); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); }
  function avgNum(xs) { xs = xs.map(Number).filter(n => n > 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : 0; }
  function csv(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }
  function bindCoachCard() { document.getElementById('btnRefreshMentalCoach')?.addEventListener('click', renderCoachDashboard); renderCoachDashboard(); }
  window.MentalPreparation = { render, refresh: render, renderParentPublicAdvice, renderCoachDashboard };
  window.addEventListener('teampro:role-changed', () => { const p = document.getElementById('tab-mental-preparation'); if (p && p.classList.contains('active')) render(); renderParentPublicAdvice(); renderCoachDashboard(); });
  document.addEventListener('DOMContentLoaded', () => setTimeout(bindCoachCard, 0));
})();
