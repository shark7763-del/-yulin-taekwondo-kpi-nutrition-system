/* ============================================================
   研究資料管理：匿名化、資料品質、CSV 匯出、風險處置追蹤
   ============================================================ */

const RESEARCH_CSV = {
  records: [
    'date', 'athleteCode', 'athleteId', 'schoolLevel', 'grade', 'classCode', 'groupType',
    'trainingMinutes', 'sleepHours', 'sleepQuality', 'soreness', 'rpe', 'painScore', 'painArea',
    'emotionIndex', 'physicalAvg', 'technicalAvg', 'tacticalAvg', 'focusAvg', 'disciplineAvg',
    'recoveryAvg', 'finalReadinessScore', 'readinessStatusLight', 'trainingAdvice', 'aiLabel'
  ],
  aiScores: [
    'date', 'athleteCode', 'selfScore', 'coachScore', 'recoveryScore', 'attendanceScore',
    'riskPenalty', 'finalReadinessScore', 'readinessStatusLight', 'trainingAdvice', 'aiLabel',
    'algorithmType'
  ],
  riskFlags: [
    'riskId', 'athleteCode', 'athleteId', 'date', 'riskType', 'riskLevel', 'riskReason',
    'suggestedAction', 'isReviewed', 'reviewedAt', 'reviewedBy', 'actionTaken',
    'followUpDate', 'isResolved', 'resolvedAt', 'coachNote'
  ],
  coachScores: [
    'date', 'athleteCode', 'coachAttitudeScore', 'coachTechnicalScore', 'coachExecutionScore',
    'coachRiskScore', 'coachOverallScore', 'coachPublicNote', 'coachPrivateNote'
  ],
  weekly: [
    'weekId', 'athleteCode', 'recordsCount', 'avgReadinessScore', 'avgSleepHours',
    'avgPainScore', 'avgRpe', 'greenCount', 'yellowCount', 'orangeCount', 'redCount'
  ],
  consent: [
    'athleteCode', 'consentTrainingData', 'consentHealthData', 'consentLineNotice',
    'consentAnonymousResearch', 'consentReport', 'consentStatus'
  ],
  roster: ['athleteCode', 'athleteId', 'schoolLevel', 'grade', 'classCode', 'groupType']
};

function researchRange() {
  return {
    start: normDate(($id('researchStartDate') || {}).value || '2026-06-01'),
    end: normDate(($id('researchEndDate') || {}).value || '2026-08-31')
  };
}

function inResearchRange(rec, range) {
  const d = normDate(rec && rec.date);
  return d && (!range.start || d >= range.start) && (!range.end || d <= range.end);
}

function athleteNameOf(rec) { return String((rec && (rec.name || rec.studentName)) || '').trim(); }

function researchRoster(records) {
  const names = [];
  getPlayers().forEach(n => { if (n && names.indexOf(n) === -1) names.push(n); });
  (records || []).forEach(r => { const n = athleteNameOf(r); if (n && names.indexOf(n) === -1) names.push(n); });
  return names.map((name, i) => ({ name, athleteCode: 'A' + String(i + 1).padStart(2, '0'), athleteId: getAthleteIdForName(name) }));
}

function codeMapFromRoster(roster) {
  const map = {};
  (roster || []).forEach(r => { map[r.name] = r; });
  return map;
}

function cleanNumber(v, min, max) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Math.max(min, Math.min(max, n));
}

function cleanLight(v) {
  const s = String(v || '');
  if (s.indexOf('紅') !== -1) return '紅燈';
  if (s.indexOf('橘') !== -1) return '橘燈';
  if (s.indexOf('黃') !== -1) return '黃燈';
  if (s.indexOf('綠') !== -1) return '綠燈';
  return '';
}

function cleanGroupType(v) {
  const g = normalizeGroupType(v || '');
  return ['對打', '品勢', '自由品勢', '散打', '體能', '復健', '比賽', '休息'].indexOf(g) !== -1 ? g : '';
}

function cleanRecord(rec, cmap) {
  const name = athleteNameOf(rec);
  const meta = cmap[name] || { athleteCode: '', athleteId: rec.athleteId || '' };
  const painArea = rec.painArea || rec.injuryArea || '';
  return {
    date: normDate(rec.date),
    athleteCode: meta.athleteCode,
    athleteId: rec.athleteId || meta.athleteId,
    schoolLevel: rec.schoolLevel || '',
    grade: rec.grade || '',
    classCode: rec.classCode || '',
    groupType: cleanGroupType(rec.groupType || rec.group),
    trainingMinutes: cleanNumber(rec.trainingMinutes, 0, 360),
    sleepHours: cleanNumber(rec.sleepHours, 3, 14),
    sleepQuality: ['差', '普通', '好'].indexOf(rec.sleepQuality) !== -1 ? rec.sleepQuality : '',
    soreness: cleanNumber(rec.soreness, 1, 7),
    rpe: cleanNumber(rec.rpe, 1, 10),
    painScore: cleanNumber(rec.painScore, 0, 10),
    painArea: ['膝', '腳踝', '腰', '髖', '腳背', '大腿', '小腿', '手肘', '其他'].indexOf(painArea) !== -1 ? painArea : '',
    emotionIndex: cleanNumber(rec.emotionIndex || rec.moodIndex, 1, 5),
    physicalAvg: cleanNumber(rec.physicalAvg, 1, 5),
    technicalAvg: cleanNumber(rec.technicalAvg, 1, 5),
    tacticalAvg: cleanNumber(rec.tacticalAvg, 1, 5),
    focusAvg: cleanNumber(rec.focusAvg, 1, 5),
    disciplineAvg: cleanNumber(rec.disciplineAvg, 1, 5),
    recoveryAvg: cleanNumber(rec.recoveryAvg || rec.emotionAvg, 1, 5),
    finalReadinessScore: cleanNumber(rec.finalReadinessScore, 0, 100),
    readinessStatusLight: cleanLight(rec.readinessStatusLight),
    trainingAdvice: rec.trainingAdvice || rec.trainingDirection || '',
    aiLabel: rec.aiLabel || rec.aiTags || ''
  };
}

function riskFlagsFromRecords(records, cmap) {
  const flags = [];
  (records || []).forEach(rec => {
    const clean = cleanRecord(rec, cmap);
    const pain = Number(clean.painScore);
    const tags = String(rec.aiTags || rec.aiLabel || '').split('、').filter(Boolean);
    if (pain >= 4) tags.push(pain >= 7 ? '疼痛高風險' : '疼痛中度');
    tags.forEach(tag => {
      if (!/風險|不足|關心|硬撐|疼痛|脫水|睡眠|警示/.test(tag)) return;
      const high = /高|紅|受傷|脫水|重大|7|8|9|10/.test(tag) || pain >= 7;
      flags.push({
        riskId: rec.riskId || ('RF-' + clean.date.replace(/-/g, '') + '-' + clean.athleteCode + '-' + String(flags.length + 1).padStart(3, '0')),
        athleteCode: clean.athleteCode,
        athleteId: clean.athleteId,
        date: clean.date,
        riskType: tag,
        riskLevel: high ? 'high' : 'medium',
        riskReason: rec.riskReason || clean.aiLabel || clean.readinessStatusLight,
        suggestedAction: rec.suggestedAction || clean.trainingAdvice || '請教練依現場狀態調整訓練量。',
        isReviewed: rec.isReviewed || '否',
        reviewedAt: rec.reviewedAt || '',
        reviewedBy: rec.reviewedBy || '',
        actionTaken: rec.actionTaken || '',
        followUpDate: rec.followUpDate || '',
        isResolved: rec.isResolved || '否',
        resolvedAt: rec.resolvedAt || '',
        coachNote: rec.coachNote || ''
      });
    });
  });
  return flags;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, headers) {
  return '\ufeff' + [headers.join(',')].concat((rows || []).map(r => headers.map(h => csvEscape(r[h])).join(','))).join('\n');
}

function downloadCsv(filename, rows, headers) {
  const blob = new Blob([toCsv(rows, headers)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function weekId(date) {
  const d = new Date(normDate(date) + 'T00:00:00');
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

function buildWeeklyRows(records) {
  const groups = {};
  records.forEach(r => {
    const k = weekId(r.date) + '|' + r.athleteCode;
    (groups[k] = groups[k] || []).push(r);
  });
  return Object.keys(groups).map(k => {
    const list = groups[k];
    const nums = key => list.map(r => Number(r[key])).filter(Number.isFinite);
    const avg = key => { const a = nums(key); return a.length ? round2(a.reduce((s, n) => s + n, 0) / a.length) : ''; };
    const cnt = light => list.filter(r => r.readinessStatusLight === light).length;
    return {
      weekId: k.split('|')[0],
      athleteCode: k.split('|')[1],
      recordsCount: list.length,
      avgReadinessScore: avg('finalReadinessScore'),
      avgSleepHours: avg('sleepHours'),
      avgPainScore: avg('painScore'),
      avgRpe: avg('rpe'),
      greenCount: cnt('綠燈'),
      yellowCount: cnt('黃燈'),
      orangeCount: cnt('橘燈'),
      redCount: cnt('紅燈')
    };
  });
}

function countMissing(rows, headers) {
  const total = rows.length * headers.length;
  if (!total) return 0;
  let miss = 0;
  rows.forEach(r => headers.forEach(h => { if (r[h] === '' || r[h] == null) miss++; }));
  return Math.round(miss / total * 1000) / 10;
}

function countAbnormal(rows) {
  return rows.filter(r =>
    r.sleepHours === '' || r.rpe === '' || r.painScore === '' ||
    !r.readinessStatusLight || !r.groupType
  ).length;
}

function barChart(title, data) {
  const max = Math.max(1, ...Object.values(data));
  return `<div class="research-chart"><h4>${escapeHtml(title)}</h4>` + Object.keys(data).map(k => {
    const n = data[k];
    return `<div class="research-bar-row"><span>${escapeHtml(k)}</span><b>${n}</b><i style="width:${Math.round(n / max * 100)}%"></i></div>`;
  }).join('') + '</div>';
}

function frequency(rows, key) {
  const out = {};
  rows.forEach(r => { const v = String(r[key] || '未填'); out[v] = (out[v] || 0) + 1; });
  return out;
}

async function loadResearchRecords() {
  const all = await fetchAllRecords();
  const range = researchRange();
  return (all || []).filter(r => inResearchRange(r, range));
}

async function renderResearchDashboard() {
  const raw = await loadResearchRecords();
  const roster = researchRoster(raw);
  const cmap = codeMapFromRoster(roster);
  const clean = raw.map(r => cleanRecord(r, cmap));
  const flags = riskFlagsFromRecords(raw, cmap);
  const athletes = new Set(clean.map(r => r.athleteCode).filter(Boolean));
  const days = new Set(clean.map(r => r.date).filter(Boolean));
  const rosterCount = roster.length || athletes.size;
  const dailyRate = days.size && rosterCount ? Math.round(clean.length / (days.size * rosterCount) * 1000) / 10 : 0;
  const weekSet = new Set(clean.map(r => weekId(r.date)));
  const weeklyRate = weekSet.size && rosterCount ? Math.round(clean.length / (weekSet.size * rosterCount * 7) * 1000) / 10 : 0;
  const consentRate = estimateConsentRate(roster);
  const overview = $id('researchOverview');
  if (overview) {
    const cells = [
      ['總回報筆數', clean.length], ['相異選手數', athletes.size], ['每日回報率', dailyRate + '%'],
      ['每週回報率', weeklyRate + '%'], ['缺失值比例', countMissing(clean, RESEARCH_CSV.records) + '%'],
      ['異常值數量', countAbnormal(clean)], ['家長同意率', consentRate + '%']
    ];
    overview.innerHTML = cells.map(c => `<div class="ov-cell"><span class="ov-num">${escapeHtml(c[1])}</span><span class="ov-label">${escapeHtml(c[0])}</span></div>`).join('');
  }
  const charts = $id('researchCharts');
  if (charts) {
    charts.innerHTML =
      barChart('睡眠時數分布', bucketNums(clean, 'sleepHours', [6, 7, 8, 10])) +
      barChart('疼痛分數分布', bucketNums(clean, 'painScore', [1, 4, 7, 10])) +
      barChart('RPE 分布', bucketNums(clean, 'rpe', [3, 5, 7, 9])) +
      barChart('AI 準備度分布', bucketNums(clean, 'finalReadinessScore', [40, 55, 70, 85])) +
      barChart('紅黃綠橘燈分布', frequency(clean, 'readinessStatusLight')) +
      barChart('風險旗標類型統計', frequency(flags, 'riskType')) +
      barChart('風險旗標處理率', frequency(flags.map(f => Object.assign({}, f, { resolvedGroup: f.isResolved === '是' ? '已結案' : '未結案' })), 'resolvedGroup')) +
      barChart('最近 8–12 週全隊趨勢', frequency(buildWeeklyRows(clean), 'weekId'));
  }
  renderResearchRiskFlags(flags);
}

function bucketNums(rows, key, cuts) {
  const labels = cuts.map((c, i) => i === 0 ? `<${c}` : `${cuts[i - 1]}-${c - 0.1}`).concat([`>=${cuts[cuts.length - 1]}`]);
  const out = {};
  labels.forEach(l => { out[l] = 0; });
  rows.forEach(r => {
    const n = Number(r[key]);
    if (!Number.isFinite(n)) { out['未填'] = (out['未填'] || 0) + 1; return; }
    let idx = cuts.findIndex(c => n < c);
    if (idx < 0) idx = labels.length - 1;
    out[labels[idx]]++;
  });
  return out;
}

function estimateConsentRate(roster) {
  try {
    const parents = getParentsLocal();
    if (!roster.length || !parents.length) return 0;
    const agreed = parents.filter(p => p.consentStatus === 'agreed' || p.consentAnonymousResearch || p.consentTrainingData).length;
    return Math.round(agreed / roster.length * 1000) / 10;
  } catch (e) { return 0; }
}

function renderResearchRiskFlags(flags) {
  const box = $id('researchRiskFlags');
  if (!box) return;
  const unresolvedHigh = flags.filter(f => f.riskLevel === 'high' && f.isResolved !== '是');
  box.innerHTML = (unresolvedHigh.length ? `<div class="hint-box warn"><b>高風險未處理：${unresolvedHigh.length} 筆</b>。每筆 high risk 必須填寫處置紀錄後才能結案。</div>` : '<div class="hint-box good">目前沒有 high risk 未處理。</div>') +
    `<div class="table-scroll"><table class="record-table"><thead><tr><th>riskId</th><th>date</th><th>athleteCode</th><th>riskLevel</th><th>riskType</th><th>actionTaken</th><th>isResolved</th></tr></thead><tbody>` +
    flags.slice(0, 80).map(f => `<tr><td>${escapeHtml(f.riskId)}</td><td>${escapeHtml(f.date)}</td><td>${escapeHtml(f.athleteCode)}</td><td>${escapeHtml(f.riskLevel)}</td><td>${escapeHtml(f.riskType)}</td><td>${escapeHtml(f.actionTaken || '-')}</td><td>${escapeHtml(f.isResolved)}</td></tr>`).join('') +
    `</tbody></table></div>`;
}

async function exportResearchData() {
  const raw = await loadResearchRecords();
  const roster = researchRoster(raw);
  const cmap = codeMapFromRoster(roster);
  const clean = raw.map(r => cleanRecord(r, cmap));
  const flags = riskFlagsFromRecords(raw, cmap);
  const coach = raw.map(r => {
    const c = cleanRecord(r, cmap);
    const tech = r.coachTechnicalScore || r.coachTechniqueScore || '';
    const vals = [r.coachAttitudeScore, tech, r.coachExecutionScore, r.coachRiskScore].map(Number).filter(Number.isFinite);
    return {
      date: c.date, athleteCode: c.athleteCode,
      coachAttitudeScore: cleanNumber(r.coachAttitudeScore, 0, 100),
      coachTechnicalScore: cleanNumber(tech, 0, 100),
      coachExecutionScore: cleanNumber(r.coachExecutionScore, 0, 100),
      coachRiskScore: cleanNumber(r.coachRiskScore, 0, 100),
      coachOverallScore: r.coachOverallScore || (vals.length === 4 ? Math.round(vals.reduce((s, n) => s + n, 0) / 4) : ''),
      coachPublicNote: r.coachPublicNote || '',
      coachPrivateNote: r.coachPrivateNote || ''
    };
  });
  const ai = raw.map(r => {
    const c = cleanRecord(r, cmap);
    return {
      date: c.date, athleteCode: c.athleteCode, selfScore: cleanNumber(r.selfScore, 0, 100),
      coachScore: cleanNumber(r.coachScore, 0, 100), recoveryScore: cleanNumber(r.readinessRecoveryScore || r.recoveryScore, 0, 100),
      attendanceScore: cleanNumber(r.attendanceScore, 0, 100), riskPenalty: cleanNumber(r.riskPenalty, 0, 100),
      finalReadinessScore: c.finalReadinessScore, readinessStatusLight: c.readinessStatusLight,
      trainingAdvice: c.trainingAdvice, aiLabel: c.aiLabel, algorithmType: 'rule-based algorithm'
    };
  });
  const rosterRows = roster.map(r => {
    const latest = raw.filter(x => athleteNameOf(x) === r.name).sort((a, b) => normDate(b.date).localeCompare(normDate(a.date)))[0] || {};
    const c = cleanRecord(latest, cmap);
    return { athleteCode: r.athleteCode, athleteId: r.athleteId, schoolLevel: c.schoolLevel, grade: c.grade, classCode: c.classCode, groupType: c.groupType };
  });
  const consent = roster.map(r => ({
    athleteCode: r.athleteCode, consentTrainingData: '', consentHealthData: '', consentLineNotice: '',
    consentAnonymousResearch: '', consentReport: '', consentStatus: ''
  }));
  [
    ['records_clean.csv', clean, RESEARCH_CSV.records],
    ['ai_scores_clean.csv', ai, RESEARCH_CSV.aiScores],
    ['risk_flags_clean.csv', flags, RESEARCH_CSV.riskFlags],
    ['coach_scores_clean.csv', coach, RESEARCH_CSV.coachScores],
    ['weekly_kpi_reports_clean.csv', buildWeeklyRows(clean), RESEARCH_CSV.weekly],
    ['parent_consent_summary.csv', consent, RESEARCH_CSV.consent],
    ['anonymized_roster.csv', rosterRows, RESEARCH_CSV.roster]
  ].forEach(([name, rows, headers], i) => setTimeout(() => downloadCsv(name, rows, headers), i * 250));
  const st = $id('researchExportStatus');
  if (st) { st.textContent = '✅ 已產生 7 個 CSV 檔案'; st.className = 'conn-status ok'; }
}

function setupResearchHandlers() {
  const refresh = $id('btnRefreshResearch');
  if (refresh) refresh.addEventListener('click', renderResearchDashboard);
  const exp = $id('btnExportResearchZip');
  if (exp) exp.addEventListener('click', exportResearchData);
  const rosterBtn = $id('btnExportAnonymizedRoster');
  if (rosterBtn) rosterBtn.addEventListener('click', async () => {
    const raw = await loadResearchRecords();
    const roster = researchRoster(raw).map(r => ({ athleteCode: r.athleteCode, athleteId: r.athleteId, schoolLevel: '', grade: '', classCode: '', groupType: '' }));
    downloadCsv('anonymized_roster.csv', roster, RESEARCH_CSV.roster);
  });
}
