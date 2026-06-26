/* ===================== 每日表單 UI 強化（時段／睡眠防呆／滑桿／尿液色卡／水量AI） ===================== */
const TRAINING_SESSIONS = ['晨操', '下午訓練', '晚上訓練', '無訓練'];
function buildTrainingSessionChips() {
  const box = $id('trainingSessionChips'); if (!box) return;
  box.innerHTML = TRAINING_SESSIONS.map(s => `<button type="button" class="chip session-chip" data-val="${s}">${s}</button>`).join('');
  box.querySelectorAll('.session-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.val === '無訓練') {
        const on = !btn.classList.contains('sel');
        box.querySelectorAll('.session-chip').forEach(b => b.classList.remove('sel'));
        if (on) btn.classList.add('sel');
      } else {
        const none = box.querySelector('.session-chip[data-val="無訓練"]'); if (none) none.classList.remove('sel');
        btn.classList.toggle('sel');
      }
      syncTrainingSession();
    });
  });
}
function syncTrainingSession() {
  const box = $id('trainingSessionChips'), hidden = $id('trainingSession');
  if (!box || !hidden) return;
  hidden.value = Array.from(box.querySelectorAll('.session-chip.sel')).map(b => b.dataset.val).join('、');
}
function setTrainingSession(str) {
  const box = $id('trainingSessionChips'); if (!box) return;
  const want = String(str || '').split(/[、,]/).map(s => s.trim()).filter(Boolean);
  box.querySelectorAll('.session-chip').forEach(b => b.classList.toggle('sel', want.indexOf(b.dataset.val) !== -1));
  syncTrainingSession();
}

const SORENESS_TXT = ['', '幾乎不痠', '輕微痠', '中等痠', '蠻痠的', '非常痠'];
function updateSorenessReadout() {
  const el = $id('soreness'), out = $id('sorenessReadout'); if (!el || !out) return;
  const n = parseInt(el.value, 10) || 1;
  out.textContent = `${n} 分・${SORENESS_TXT[n] || ''}`;
  out.className = 'slider-readout ' + (n >= 4 ? 'bad' : n >= 3 ? 'warn' : 'good');
}
function rpeText(n) {
  if (n <= 2) return '很輕鬆'; if (n <= 4) return '輕鬆';
  if (n <= 6) return '中等'; if (n <= 8) return '吃力';
  return '非常吃力（接近極限）';
}
function updateRpeReadout() {
  const el = $id('rpe'), out = $id('rpeReadout'); if (!el || !out) return;
  const n = parseInt(el.value, 10) || 1;
  out.textContent = `${n} 分・${rpeText(n)}`;
  out.className = 'slider-readout ' + (n >= 9 ? 'bad' : n >= 7 ? 'warn' : 'good');
}
const SWEAT_TXT = ['', '微乎其微', '少量', '中等', '大量', '大量濕透'];
function updateSweatReadout() {
  const el = $id('sweatLevel'), out = $id('sweatReadout'); if (!el || !out) return;
  const n = parseInt(el.value, 10) || 1;
  out.textContent = `${n}/5・${SWEAT_TXT[n] || ''}`;
  out.className = 'slider-readout ' + (n >= 4 ? 'warn' : 'good');
  updateWaterAdvice();
}

const URINE_SWATCHES = [
  { v: '透明無色', color: '#eef6ff', label: '透明' },
  { v: '淡黃清澈', color: '#f3ee9e', label: '淡黃' },
  { v: '黃色', color: '#ecd64b', label: '黃' },
  { v: '深黃', color: '#d2a01c', label: '深黃' },
  { v: '琥珀色', color: '#9a6510', label: '琥珀' }
];
function buildUrineSwatches() {
  const box = $id('urineSwatches'); if (!box) return;
  box.innerHTML = URINE_SWATCHES.map(s =>
    `<button type="button" class="urine-swatch" data-val="${s.v}" title="${escapeHtml(s.v)}"><span class="us-dot" style="background:${s.color}"></span><span class="us-label">${s.label}</span></button>`
  ).join('');
  box.querySelectorAll('.urine-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const hidden = $id('urineStatus');
      const already = btn.classList.contains('sel');
      box.querySelectorAll('.urine-swatch').forEach(b => b.classList.remove('sel'));
      if (!already) btn.classList.add('sel');
      if (hidden) hidden.value = already ? '' : btn.dataset.val;
      updateUrineNote();
    });
  });
}
function syncUrineSwatchSelection() {
  const box = $id('urineSwatches'), hidden = $id('urineStatus'); if (!box || !hidden) return;
  box.querySelectorAll('.urine-swatch').forEach(b => b.classList.toggle('sel', b.dataset.val === hidden.value && hidden.value !== ''));
}

const WATER_FROM_SELECT = { '少於 500ml': 250, '500-1000ml': 750, '1000-1500ml': 1250, '1500-2000ml': 1750, '2000ml 以上': 2200 };
function updateWaterAdvice() {
  const box = $id('waterAdvice'); if (!box) return;
  const w = parseFloat($id('weightKg') ? $id('weightKg').value : '');
  if (isNaN(w) || w <= 0) { box.style.display = 'none'; box.innerHTML = ''; return; }
  let ml = w * 32;
  const intensity = $id('trainingIntensity') ? $id('trainingIntensity').value : '';
  if (/高|比賽/.test(intensity)) ml += 700;
  else if (/中/.test(intensity)) ml += 400;
  else if (/低|輕/.test(intensity)) ml += 200;
  const sweat = parseInt($id('sweatLevel') ? $id('sweatLevel').value : '0', 10) || 0;
  ml += sweat * 150;
  ml = Math.round(ml / 100) * 100;
  const sel = $id('waterIntake') ? $id('waterIntake').value : '';
  const actual = WATER_FROM_SELECT[sel];
  let cmp = '';
  if (actual != null) {
    if (actual >= ml * 0.9) cmp = '　你今天的水量充足 👍';
    else if (actual >= ml * 0.6) cmp = `　你填 ${escapeHtml(sel)}，還差約 <b>${Math.max(0, ml - actual)}ml</b>，記得補水。`;
    else cmp = `　你填 ${escapeHtml(sel)}，<b class="wa-low">明顯不足</b>，請盡快補到 ${ml}ml。`;
  }
  box.style.display = '';
  box.className = 'water-advice' + (actual != null && actual < ml * 0.6 ? ' bad' : '');
  box.innerHTML = `💧 AI 建議今日補水約 <b>${ml} ml</b>（體重 ${w}kg＋強度＋排汗估算）。${cmp}`;
}

function buildRecord() {
  const groupValue = $id('group').value;
  const absenceMode = isAbsenceGroup(groupValue);
  const kpiEnabled = !absenceMode && isDailyKpiAvailable();
  const scoreData = !kpiEnabled
    ? { scores: {}, aspectAvg: {}, total: '', average: '', count: 0 }
    : collectScores();
  const { scores, aspectAvg, total, average } = scoreData;
  const status = absenceMode ? '未出席訓練' : (kpiEnabled ? judgeStatus(average) : '已完成回報');
  const lowItems = kpiEnabled ? findLowItems(scores) : [];
  const lowItemsStr = lowItems.map(l => `${l.item}：${l.score} 分`).join('｜');

  const heightCm = $id('heightCm').value;
  const weightKg = $id('weightKg').value;
  const targetWeightKg = $id('targetWeightKg').value;
  const bmi = computeBmi(heightCm, weightKg);
  const weightGap = computeWeightGap(weightKg, targetWeightKg);
  const bodyStatus = $id('bodyStatus').value;

  // 新增：睡眠 / RPE / 痠痛 / 受傷部位 / 疼痛指數 / 尿液監控
  const bedTime = $id('bedTime') ? $id('bedTime').value : '';
  const wakeTime = $id('wakeTime') ? $id('wakeTime').value : '';
  const sleepHours = $id('sleepHours') ? $id('sleepHours').value : '';
  const sleepQuality = $id('sleepQuality') ? $id('sleepQuality').value : '';
  const soreness = $id('soreness') ? $id('soreness').value : '';
  const rpe = $id('rpe') ? $id('rpe').value : '';
  const injuryArea = $id('injuryArea') ? $id('injuryArea').value : '';
  const painScore = $id('painScore') ? $id('painScore').value : '';
  const painLevel = (painScore === '' ? '' : painGrade(parseInt(painScore, 10) || 0).label);
  const urineStatus = $id('urineStatus') ? $id('urineStatus').value : '';
  const trainingSession = $id('trainingSession') ? $id('trainingSession').value : '';
  const sweatLevel = $id('sweatLevel') ? $id('sweatLevel').value : '';

  // 餐點：文字（學生打的字，給關鍵字分析用）＋快速勾選標籤（給標籤分析用）
  const mealTags = getAllMealTags();
  const mealText = {
    breakfast: $id('breakfast').value,
    lunch: $id('lunch').value,
    dinner: $id('dinner').value,
    snacksDrinks: $id('snacksDrinks').value
  };
  // 存檔字串：把標籤併進餐點欄（不需新增後端欄位）
  const mealStored = {
    breakfast: composeMeal(mealText.breakfast, mealTags.breakfast),
    lunch: composeMeal(mealText.lunch, mealTags.lunch),
    dinner: composeMeal(mealText.dinner, mealTags.dinner),
    snacksDrinks: composeMeal(mealText.snacksDrinks, mealTags.snacksDrinks)
  };
  const nutritionInput = {
    breakfast: mealText.breakfast,
    lunch: mealText.lunch,
    dinner: mealText.dinner,
    snacksDrinks: mealText.snacksDrinks,
    mealTags: mealTags,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    bmi: bmi, weightKg: weightKg, weightGap: weightGap, targetWeightKg: targetWeightKg
  };
  const nutrition = absenceMode
    ? { risks: [], student: '', parent: '', coach: { advice: '' }, nextGoal: '' }
    : analyzeNutrition(nutritionInput);

  // 恢復指數 + 紅燈原因分類（疼痛指數一併納入）
  const recovery = absenceMode
    ? { score: '', state: '' }
    : computeRecovery({ sleepHours, sleepQuality, rpe, soreness, bodyStatus, painScore });
  const nutritionRisks = nutrition.risks.join('、') || '無明顯風險';
  const redCats = absenceMode ? [] : redLightCategories(scores, nutritionRisks, recovery.state);

  const improveTargets = getCheckedImproveTargets().join('｜');
  const mainGoalToday = $id('mainGoalToday') ? $id('mainGoalToday').value : '';

  const rec = {
    recordId: 'r' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    timestamp: new Date().toISOString(),
    mode: 'standard',
    date: $id('date').value || todayStr(),
    name: $id('name').value,
    gradeClass: $id('gradeClass').value,
    group: groupValue,
    trainingTopic: $id('trainingTopic').value,
    absenceReason: $id('absenceReason') ? $id('absenceReason').value.trim() : '',
    absenceMiss: absenceMode && $id('absenceMiss') ? $id('absenceMiss').value.trim() : '',
    absenceCatchup: absenceMode && $id('absenceCatchup') ? $id('absenceCatchup').value.trim() : '',
    absenceHonesty: absenceMode && $id('absenceHonesty') ? $id('absenceHonesty').value : '',
    bodyStatus: bodyStatus,
    moodIndex: getMoodIndex(),
    moodReason: getMoodReason(),
    bedTime: bedTime,
    wakeTime: wakeTime,
    sleepHours: sleepHours,
    sleepQuality: sleepQuality,
    soreness: soreness,
    rpe: rpe,
    injuryArea: injuryArea,
    painScore: painScore,
    painLevel: painLevel,
    urineStatus: urineStatus,
    trainingSession: trainingSession,
    sweatLevel: sweatLevel,
    heightCm: heightCm,
    weightKg: weightKg,
    targetWeightKg: targetWeightKg,
    bmi: bmi,
    weightGap: weightGap,
    breakfast: mealStored.breakfast,
    lunch: mealStored.lunch,
    dinner: mealStored.dinner,
    snacksDrinks: mealStored.snacksDrinks,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    physicalAvg: aspectAvg.physical != null ? aspectAvg.physical : '',
    technicalAvg: aspectAvg.technical != null ? aspectAvg.technical : '',
    focusAvg: aspectAvg.focus != null ? aspectAvg.focus : '',
    disciplineAvg: aspectAvg.discipline != null ? aspectAvg.discipline : '',
    emotionAvg: aspectAvg.emotion != null ? aspectAvg.emotion : '',
    tacticalAvg: aspectAvg.tactical != null ? aspectAvg.tactical : '',
    totalScore: total,
    averageScore: average,
    status: status,
    recoveryScore: recovery.score,
    recoveryState: recovery.state,
    redLightCategories: redCats.join('、'),
    lowItems: lowItemsStr,
    improveTargets: improveTargets,
    mainGoalToday: mainGoalToday,
    reflection: $id('reflection').value,
    tomorrowGoal: $id('tomorrowGoal').value,
    gratitude: $id('gratitude') ? $id('gratitude').value : '',
    encourageTeammateName: $id('encourageTeammate') ? $id('encourageTeammate').value : '',
    encouragementToTeammate: $id('encouragementToTeammate').value,
    nutritionRisks: nutritionRisks,
    nutritionAdviceStudent: nutrition.student,
    nutritionAdviceParent: nutrition.parent,
    nutritionAdviceCoach: JSON.stringify(nutrition.coach),
    rawScoresJson: JSON.stringify(scores),
    rawNutritionJson: JSON.stringify(nutrition)
  };
  // 反思彙整（可讀文字，存一欄，供教練／家長後台顯示）
  rec.absenceReflection = absenceMode
    ? `會少練到：${rec.absenceMiss || '（未填）'}\n打算怎麼補：${rec.absenceCatchup || '（未填）'}\n自我檢視：${rec.absenceHonesty || '（未填）'}`
    : '';
  rec._isAbsence = absenceMode;
  rec._kpiEnabled = kpiEnabled;
  rec._kpiSessionId = kpiEnabled && dailyKpiSession ? dailyKpiSession.sessionId : '';

  // 自由品勢額外欄位（其他項目維持空白）
  if (isFreestyle(rec.group)) {
    FREESTYLE_EXTRA_IDS.forEach(id => { const el = $id(id); rec[id] = el ? el.value : ''; });
  }

  // 暫存（送出時補 LINE / 比較卡用）
  rec._lowItemsArr = lowItems;
  rec._aspectAvg = aspectAvg;
  rec._nutrition = nutrition;
  rec._recovery = recovery;
  rec._redCats = redCats;
  return rec;
}

// 送出進行中旗標，避免連點造成重複送出
let _submitting = false;
// 最近一次送出產生的選手版 LINE 文字（供「送出並分享到 LINE」用）
let lastStudentLineText = '';

// 送出（正式）後直接分享選手版到 LINE
async function submitAndShareLine() {
  lastStudentLineText = '';
  const ok = await doSubmit('official');
  if (ok && lastStudentLineText) {
    // 確實存進 Google Sheet 才開 LINE，避免「LINE 有開、後台沒資料」
    shareToLine(lastStudentLineText);
  } else if (!ok && lastStudentLineText) {
    // 有跑送出流程但存後台失敗 → 不開 LINE，明確告知學生重送
    alert('⚠️ 這筆還沒成功存到後台，所以先不開 LINE。\n請確認網路後，再按一次「送出並分享到 LINE」。');
  }
  // lastStudentLineText 為空＝沒通過必填或取消，已有提示，不重複跳窗
}

// 本機今天是否已有同名紀錄
function localHasToday(name, date) {
  const d = normDate(date);
  return getLocalRecords().some(r => String(r.name) === String(name) && normDate(r.date) === d);
}

// 當日是否已送出過（先看本機，再看雲端最後一筆）
async function alreadySubmittedToday(name, date) {
  if (localHasToday(name, date)) return true;
  try {
    const last = await fetchLastRecord(name);
    if (last && normDate(last.date) === normDate(date)) return true;
  } catch (e) { /* 連線失敗就不擋，讓使用者照常送出 */ }
  return false;
}

// 主送出函式
async function doSubmit(mode) {
  if (_submitting) return false;      // 正在送出，忽略重複點擊
  if (!validateForm()) return false;

  if (mode === 'official' && !getWebAppUrl()) {
    toast('請先到「系統設定」貼上 Google Apps Script Web App URL。');
    switchTab('settings');
    return false;
  }

  // 鎖定送出按鈕，避免連點
  _submitting = true;
  const submitBtns = [$id('btnSubmit'), $id('btnLocalSubmit'), $id('btnSubmitShare')].filter(Boolean);
  submitBtns.forEach(b => b.disabled = true);

  try {
    // 當日重複送出防呆：今天已填過就先確認是否覆蓋
    const name = $id('name').value;
    const date = $id('date').value || todayStr();
    if (await alreadySubmittedToday(name, date)) {
      if (!confirm('⚠️ 你今天已經填過了，要用這次的內容覆蓋今天那筆嗎？')) {
        toast('已取消送出');
        return false;   // finally 會解鎖按鈕
      }
    }
    return await doSubmitInner(mode);
  } finally {
    _submitting = false;
    submitBtns.forEach(b => b.disabled = false);
  }
}

async function doSubmitInner(mode) {
  const rec = buildRecord();
  if (rec._isAbsence) return await doSubmitAbsence(mode, rec);

  // 取得上一筆與歷史（並行），做比較與進步肯定
  const [last, history] = await Promise.all([
    fetchLastRecord(rec.name),
    fetchRecentRecords(rec.name, 60)
  ]);

  // 進步肯定（跟昨天的自己比）
  const affirm = buildAffirmations(rec, last, history);

  // AI 教練回饋（選手／家長／教練三版本）
  const readiness = applyReadiness(rec, history);
  const feedback = buildCoachFeedback(rec, last, history, affirm);
  rec.feedbackStudentText = formatFeedbackText(feedback, 'student');
  rec.feedbackParentText = formatFeedbackText(feedback, 'parent');
  rec.feedbackCoachText = formatFeedbackText(feedback, 'coach');

  // 體重變化提醒
  let weightNote = '';
  if (last) weightNote = weightChangeNote(rec.weightKg, last.weightKg);

  // 產生 LINE 文字
  const lineTexts = buildLineTexts(rec, weightNote, affirm);
  lastStudentLineText = lineTexts.student;   // 供「送出並分享到 LINE」使用
  rec.studentLineText = lineTexts.student;
  rec.parentLineText = lineTexts.parent;
  rec.coachLineText = lineTexts.coach;
  rec.nutritionLineText = lineTexts.nutrition;

  // 移除暫存欄位再送出
  const payload = Object.assign({}, rec);
  delete payload._lowItemsArr; delete payload._aspectAvg; delete payload._nutrition;
  delete payload._recovery; delete payload._redCats; delete payload._isAbsence;
  delete payload._kpiEnabled; delete payload._kpiSessionId;

  let saved = false;   // 是否真的存進後台（official）／本機（local）

  if (mode === 'official') {
    toast('送出中...');
    try {
      const res = await postToWebApp({ action: 'addRecord', payload: payload });
      if (res && res.ok) {
        toast('✅ 已送出到 Google Sheet'); clearDraft(); saved = true;
        if (window.KpiSession && window.KpiSession.refreshStudent) window.KpiSession.refreshStudent();
      }
      else toast('⚠️ 送出失敗：' + (res && res.error ? res.error : '未知錯誤'));
    } catch (e) {
      toast('⚠️ 送出失敗，請檢查網路與 Web App 設定');
    }
    // 同時也存一份本機，方便離線查看
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
  } else {
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
    clearDraft();
    saved = true;
    toast('💾 已存入本機測試資料');
  }

  // 顯示回饋卡（AI 教練回饋卡為主，其餘維持原樣）
  renderCoachFeedbackCard(feedback);
  // 若教練已啟用 OpenAI，背景用 GPT 依語氣＋三明治法重寫三版回饋（失敗自動沿用上面的模板）
  maybeEnhanceWithAiFeedback(rec, feedback);
  if (rec._kpiEnabled) renderCompareCard(rec, last, affirm);
  else { const compare = $id('compareCard'); if (compare) compare.style.display = 'none'; }
  renderNutritionCard(rec);
  renderLineCard(lineTexts);

  // 更新選手成長卡（連續天數／段位即時反映今天這筆）
  renderPlayerCard(rec.name);

  // 回報完成 → 抽 TeamPro 心理成長能量卡（psych-cards.js 未載入時安全略過）
  if (window.PsychCards) try { window.PsychCards.onReportSubmitted(rec.name); } catch (e) {}

  // 捲動到 AI 教練回饋卡
  $id('coachFeedbackCard').scrollIntoView({ behavior: 'smooth' });

  return saved;
}

async function doSubmitAbsence(mode, rec) {
  const lineTexts = buildAbsenceLineTexts(rec);
  applyReadiness(rec, []);
  const feedback = buildCoachFeedback(rec, null, [], null);
  rec.feedbackStudentText = formatFeedbackText(feedback, 'student');
  rec.feedbackParentText = formatFeedbackText(feedback, 'parent');
  rec.feedbackCoachText = formatFeedbackText(feedback, 'coach');
  lastStudentLineText = lineTexts.student;
  rec.studentLineText = lineTexts.student;
  rec.parentLineText = lineTexts.parent;
  rec.coachLineText = lineTexts.coach;
  rec.nutritionLineText = '';

  const payload = Object.assign({}, rec);
  delete payload._lowItemsArr; delete payload._aspectAvg; delete payload._nutrition;
  delete payload._recovery; delete payload._redCats; delete payload._isAbsence;
  delete payload._kpiEnabled; delete payload._kpiSessionId;

  let saved = false;
  if (mode === 'official') {
    toast('送出未出席報告中...');
    try {
      const res = await postToWebApp({ action: 'addRecord', payload: payload });
      if (res && res.ok) { toast('✅ 已送出未出席訓練報告'); clearDraft(); saved = true; }
      else toast('⚠️ 送出失敗：' + (res && res.error ? res.error : '未知錯誤'));
    } catch (e) {
      toast('⚠️ 送出失敗，請檢查網路與 Web App 設定');
    }
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
  } else {
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
    clearDraft();
    saved = true;
    toast('💾 已存入本機未出席報告');
  }

  renderCoachFeedbackCard(feedback);
  renderAbsenceReportCard(rec);
  $id('nutritionCard').style.display = 'none';
  renderLineCard(lineTexts);
  renderPlayerCard(rec.name);
  if (window.PsychCards) try { window.PsychCards.onReportSubmitted(rec.name); } catch (e) {}
  $id('coachFeedbackCard').scrollIntoView({ behavior: 'smooth' });
  return saved;
}

function buildAbsenceLineTexts(rec) {
  const dateText = dateSlash(rec.date);
  const reason = rec.absenceReason || '未填寫';
  const reflectionBlock = rec.absenceReflection ? `\n\n🤔 反思：\n${rec.absenceReflection}` : '';
  const student = `【未出席訓練報告】\n日期：${dateText}\n選手：${rec.name}\n原因：${reason}${reflectionBlock}`;
  const parent = `您好，${rec.name} 今日未出席訓練，系統已收到未出席訓練報告。\n原因：${reason}。\n孩子已寫下反思並規劃補回進度的方式，若需要歡迎與教練聯繫。`;
  const coach = `【未出席訓練回報】\n日期：${dateText}\n選手：${rec.name}\n班級：${rec.gradeClass || '-'}\n原因：${reason}${reflectionBlock}`;
  return { student, parent, coach, nutrition: '未出席訓練，不需填寫飲食建議。' };
}

function renderAbsenceReportCard(rec) {
  const card = $id('compareCard');
  const box = $id('compareContent');
  const reflectionHtml = rec.absenceReflection
    ? `<br><br><b>你的反思：</b><br>${escapeHtml(rec.absenceReflection).replace(/\n/g, '<br>')}` : '';
  box.innerHTML = `
    <div class="hint-box warn">
      <b>未出席訓練報告已建立</b><br>
      日期：${dateSlash(rec.date)}<br>
      選手：${escapeHtml(rec.name)}<br>
      原因：${escapeHtml(rec.absenceReason || '-')}${reflectionHtml}
    </div>
    <div class="hint-box good">把你寫下的補回方式做到，缺的這次就追得回來。明天見 💪</div>`;
  card.style.display = 'block';
}

/* ---- 進步肯定區塊 HTML（徽章＋具體肯定句）---- */
function affirmHtml(affirm) {
  if (!affirm || (!affirm.badges.length && !affirm.lines.length)) return '';
  let html = `<div class="affirm-box"><h4 class="affirm-title">🌟 今日進步肯定</h4>`;
  if (affirm.badges.length) {
    html += `<div class="badge-row">`;
    affirm.badges.forEach(b => html += `<span class="badge">${b.icon} ${b.label}</span>`);
    html += `</div>`;
  }
  affirm.lines.forEach(l => html += `<div class="hint-box good">🎉 ${l}</div>`);
  return html + `</div>`;
}

/* ---- 今日 vs 上次 ---- */
function renderCompareCard(rec, last, affirm) {
  const card = $id('compareCard');
  const box = $id('compareContent');
  if (!last) {
    box.innerHTML = affirmHtml(affirm) +
      `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。下一次就能看到進步比較了！</div>`;
    card.style.display = 'block';
    return;
  }

  const lastTotal = parseFloat(last.totalScore) || 0;
  const diff = round1(rec.totalScore - lastTotal);
  const lastAvg = aspectAvgFromRecord(last);

  let html = affirmHtml(affirm);   // 進步肯定放最上面

  // AI 分析：總分/平均/燈號
  html += `<div class="review-row"><span class="review-label">今日總分</span><span class="review-value">${rec.totalScore} / ${(rec._lowItemsArr ? '' : '')}50</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均分</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${rec.status}</span></div>`;
  const diffTag = diff >= 0 ? `<span class="tag tag-green">+${diff}</span>` : `<span class="tag tag-red">${diff}</span>`;
  html += `<div class="review-row"><span class="review-label">總分 vs 上次</span><span class="review-value">${lastTotal} → ${rec.totalScore}　${diffTag}</span></div>`;

  // 面向差異（只顯示本組有的面向）
  const presentKeys = ASPECT_ORDER.filter(k => rec._aspectAvg[k] != null);
  if (presentKeys.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">面向差異</h4><div class="aspect-grid">`;
    presentKeys.forEach(k => {
      const d = round1((rec._aspectAvg[k] || 0) - (lastAvg[k] || 0));
      const cls = d > 0 ? 'tag-green' : (d < 0 ? 'tag-red' : 'tag-yellow');
      html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="tag ${cls}">${d > 0 ? '+' : ''}${d}</span></div>`;
    });
    html += `</div>`;
  }

  // 紅燈原因分析
  if (rec._redCats && rec._redCats.length) {
    html += `<div class="hint-box warn">🚩 今日紅燈原因：${rec._redCats.join('、')}</div>`;
  }

  // 疲勞與恢復指數
  if (rec._recovery) {
    const rv = rec._recovery;
    const cls = (rv.state === '恢復良好' || rv.state === '可正常訓練') ? 'good' : 'warn';
    html += `<div class="hint-box ${cls}">🔋 恢復指數 ${rv.score}／100 → <b>${rv.state}</b></div>`;
  }

  // 今日訓練建議（最低 1–3 項，教練口吻）
  html += aiTrainingAdviceHtml(rec);

  // 體重變化
  const wDiff = round1(parseFloat(rec.weightKg) - parseFloat(last.weightKg));
  if (!isNaN(wDiff)) {
    const dir = wDiff < 0 ? `下降 ${Math.abs(wDiff)}` : (wDiff > 0 ? `上升 ${wDiff}` : '持平');
    html += `<div class="hint-box">⚖️ 體重變化：${last.weightKg} kg → ${rec.weightKg} kg，${dir} kg</div>`;
    const note = weightChangeNote(rec.weightKg, last.weightKg);
    if (note) html += `<div class="hint-box warn">${note}</div>`;
  }

  // 鼓勵語（成長型思維）：先看進步幅度，再依狀態補一句
  let encourage;
  if (diff > 0) encourage = '今天你有明顯進步，代表你不是只會填表，而是真的把昨天的問題帶進今天訓練裡修正了。能力正在因為你的努力而長大。';
  else if (diff === 0) encourage = '今天和上次差不多，穩定也是一種實力。別急著比輸贏，先讓自己每天強一點。';
  else encourage = '今天分數稍微低一點沒關係，你不是「不行」，只是「還沒」。重要的是你願意面對，明天帶著一個目標進場就會不一樣。';
  html += `<div class="hint-box good">💪 ${encourage}</div>`;
  html += `<div class="hint-box good">🌱 ${encouragementByStatus(rec.status)}</div>`;

  // 自由品勢額外紀錄
  html += freestyleExtraHtml(rec);

  box.innerHTML = html;
  card.style.display = 'block';
}

/* ---- 飲食回饋卡 ---- */
function renderNutritionCard(rec) {
  const card = $id('nutritionCard');
  const box = $id('nutritionContent');
  const n = rec._nutrition;
  const gap = rec.weightGap;
  let gapText = '--';
  if (gap !== null && gap !== undefined) {
    if (gap > 0) gapText = `還有 ${gap} kg`;
    else if (gap < 0) gapText = `已低於目標 ${Math.abs(gap)} kg`;
    else gapText = '已達目標';
  }

  let html = '';
  html += `<div class="review-row"><span class="review-label">今日體重</span><span class="review-value">${rec.weightKg} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi}</span></div>`;
  html += `<div class="review-row"><span class="review-label">距離目標體重</span><span class="review-value">${gapText}</span></div>`;

  // 今日飲食優點
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">✅ 今日飲食優點</h4><div>`;
  (n.pros || []).forEach(p => html += `<span class="tag tag-green">${p}</span>`);
  html += `</div>`;

  // 今日飲食問題
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">⚠️ 今日飲食問題</h4><div>`;
  if (n.problems && n.problems.length) n.problems.forEach(p => html += `<span class="tag tag-orange">${p}</span>`);
  else html += `<span class="tag tag-green">今天飲食大致均衡，繼續保持</span>`;
  html += `</div>`;

  // 明日建議
  html += `<div class="hint-box good">🎯 明日建議：${n.nextGoal}</div>`;

  // 補水提醒
  if (n.hydration) html += `<div class="hint-box">💧 ${n.hydration}</div>`;

  // 賽前控重提醒（距目標過遠才顯示）
  if (n.weightControl) html += `<div class="hint-box warn">⚖️ ${n.weightControl}</div>`;

  // 青少年提醒
  if (rec.bmi && parseFloat(rec.bmi) >= 27) {
    html += `<div class="hint-box warn">提醒：青少年選手不需要過度減重，重點放在訓練恢復與健康習慣。若有需要，請教練與家長一起關心。</div>`;
  }

  box.innerHTML = html;
  card.style.display = 'block';
}

/* ---- LINE 四版本卡 ---- */
function renderLineCard(lineTexts) {
  $id('lineStudent').textContent = lineTexts.student;
  $id('lineParent').textContent = lineTexts.parent;
  $id('lineCoach').textContent = lineTexts.coach;
  $id('lineNutrition').textContent = lineTexts.nutrition;
  $id('lineCard').style.display = 'block';
}

/* ---- 今日訓練建議（最低 1–3 項，教練口吻）---- */
function aiTrainingAdviceHtml(rec) {
  const lowArr = rec._lowItemsArr || [];
  if (!lowArr.length) {
    return `<div class="hint-box good">🏋️ 今日訓練建議：今天沒有明顯弱項，明天可以挑戰更高品質與難度，把「穩定」練成你的強項。</div>`;
  }
  let html = `<h4 style="margin:12px 0 6px;color:var(--blue)">🏋️ 今日訓練建議</h4>`;
  lowArr.forEach(l => {
    const s = suggestionMap[l.item];
    const remind = s ? s.remind : '這一項還需要更穩定。';
    const advice = s ? s.advice : '明天放慢速度，把這個動作做確實再加速。';
    html += `<div class="hint-box warn"><b>${escapeHtml(l.item)}（${l.score} 分）</b>：${escapeHtml(remind)}<br>👉 ${escapeHtml(advice)}</div>`;
  });
  return html;
}

