/* ============================================================
   11. 教練後台
   ============================================================ */

// 取得所有紀錄（正式優先，否則本機）
async function fetchAllRecords() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAllRecords' });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { /* 落回本機 */ }
  }
  return getLocalRecords();
}

function getLocalCoachScores() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.coachScores)) || []; }
  catch (e) { return []; }
}
function saveLocalCoachScores(arr) { localStorage.setItem(LS_KEYS.coachScores, JSON.stringify(arr || [])); }
async function fetchCoachScores(date) {
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getCoachScores', date: date || todayStr() });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { toast('⚠️ 教練簡評讀取失敗，暫用本機資料'); }
  }
  return getLocalCoachScores().filter(r => normDate(r.date) === normDate(date || todayStr()));
}
async function saveCoachScoreRow(row) {
  const payload = Object.assign({ timestamp: new Date().toISOString() }, row);
  if (getWebAppUrl()) {
    const res = await postToWebApp({ action: 'saveCoachScore', payload: payload });
    if (!res || !res.ok) throw new Error((res && res.error) || '儲存教練簡評失敗');
  }
  const arr = getLocalCoachScores();
  const idx = arr.findIndex(r => normDate(r.date) === normDate(payload.date) && String(r.studentName) === String(payload.studentName));
  if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], payload);
  else arr.push(payload);
  saveLocalCoachScores(arr);
  return payload;
}
function mergeCoachScores(records, scores) {
  const map = {};
  (scores || []).forEach(s => { map[normDate(s.date) + '|' + String(s.studentName || '').trim()] = s; });
  (records || []).forEach(r => {
    const s = map[normDate(r.date) + '|' + String(r.name || '').trim()];
    if (s) Object.assign(r, {
      coachAttitudeScore: s.coachAttitudeScore,
      coachTechniqueScore: s.coachTechniqueScore,
      coachExecutionScore: s.coachExecutionScore,
      coachRiskScore: s.coachRiskScore,
      coachPublicNote: s.coachPublicNote,
      coachPrivateNote: s.coachPrivateNote
    });
  });
  return records;
}

const COACH_REPLY_LS_KEY = 'teampro_coach_replies';
const COACH_REPLY_TEMPLATE_BANK = {
  stable: [
    '{name}，你最近整體狀態算穩，代表基本訓練有在累積。接下來不要只求完成，重點放在{weakest}和每一次動作品質，把穩定變成更有水準的穩定。',
    '{name}，近{rangeDays}天表現沒有太大亂掉，這是好事。現在要做的是把細節守住，尤其{weakest}不要放掉，每天一點點修，狀態會更扎實。',
    '{name}，最近狀態維持得住，表示你有把訓練節奏抓回來。接下來把{weakest}補起來，不用急著衝，先把該做的做到確實。',
    '{name}，這幾天表現穩定，教練要你繼續守住節奏。今天訓練不要飄，把{weakest}和恢復做好，穩定才會真的變成實力。',
    '{name}，近期沒有明顯掉下去，這代表你有基本盤。接下來把{strongest}保持住，再把{weakest}補強，訓練品質會更完整。'
  ],
  improve: [
    '{name}，你最近有往上走，這不是運氣，是你有累積。接下來不要因為進步就鬆掉，把{strongest}繼續守住，再把{weakest}補起來。',
    '{name}，近{rangeDays}天看得出來有進步，這點值得肯定。下一步不是亂加強度，而是把細節做穩，尤其{weakest}要更專心處理。',
    '{name}，你的狀態正在拉起來，教練看得到。今天繼續用這個節奏訓練，把好的部分留住，弱的地方一次修一點就好。',
    '{name}，最近表現有變好，代表你前面的努力有回來。不要急著證明自己，把每一回合做確實，進步就會更穩。',
    '{name}，這幾天有起色，繼續保持。訓練時把注意力放在{weakest}，不要只看分數，動作品質守住才是真的進步。'
  ],
  decline: [
    '{name}，最近狀態有往下掉，先不要急著否定自己。這代表身體或專注需要調整，今天把訓練量和節奏顧好，先從{weakest}穩回來。',
    '{name}，近{rangeDays}天有下滑，教練要你先面對，不要硬撐。今天重點不是衝強度，是把基本動作、恢復和{weakest}重新整理好。',
    '{name}，最近分數掉一點不代表你不行，是提醒我們要調整。先把睡眠、恢復和訓練專注顧好，狀態穩了再往上拉。',
    '{name}，這幾天狀態比較低，今天先不要亂拚。把{weakest}當主題，降低失誤、守住節奏，先讓自己回到穩定。',
    '{name}，近期表現下來了，教練希望你不要逃避。先從小地方做回來，基本動作確實、心態穩住，後面才有辦法再拉高。'
  ],
  focus: [
    '{name}，最近要特別注意專注度。你不是做不到，是有些細節容易放掉，今天每一組先抓一個重點，做好眼前這一下。',
    '{name}，這幾天專注需要拉回來。訓練時不要想太多，把注意力放在當下動作，失誤後三秒調整，馬上回到下一次。',
    '{name}，專注是你這幾天最要守的東西。今天不要被前一次失誤影響，每次開始前先吸一口氣，把節奏抓回來。',
    '{name}，你最近不是沒有努力，是專注容易散。今天訓練先把目標變小，每一回合只守一個重點，做完再看下一個。',
    '{name}，今天教練要你把心收回來。先不要急著求快，把基本動作看清楚、做確實，專注回來，分數自然會回來。'
  ],
  physical: [
    '{name}，最近體能要多注意，不是硬撐就會變強。今天把熱身、恢復和節奏做好，強度可以有，但不要超過身體能承受的範圍。',
    '{name}，你的體能狀態需要補起來。今天訓練先把呼吸和節奏抓穩，該休息就休息，動作品質不要因為累就掉掉。',
    '{name}，這幾天體能是重點。先不要只想拚速度，把基本耐力、恢復和動作品質守住，身體拉起來後強度才加得上去。',
    '{name}，體能偏弱時更要聰明訓練。今天不要亂衝，把每一組完成品質顧好，收操和補水也要做確實。',
    '{name}，最近身體負荷要看緊。訓練時如果開始散掉，就先把節奏降回來，品質守住比硬撐更重要。'
  ],
  emotion: [
    '{name}，最近情緒有點起伏，先不用急著壓掉它。今天先讓自己穩下來，失誤後不要衝動，吸一口氣再回到下一次。',
    '{name}，情緒不穩時，訓練最重要的是先穩住。今天不要被一句話或一次失誤帶走，把心收回動作上。',
    '{name}，這幾天心情比較容易影響表現。教練要你先把節奏放慢，該講的可以講，但訓練時先回到眼前任務。',
    '{name}，你不是不能練，是情緒需要整理。今天先不急著要求完美，把每一次回到穩定都當成訓練的一部分。',
    '{name}，最近情緒要顧好。遇到卡住不要馬上否定自己，先停三秒，再把下一個動作完成。'
  ],
  discipline: [
    '{name}，最近自律要再拉高一點。不是教練盯才做，而是你自己要知道今天該完成什麼，把小事做好，狀態才會穩。',
    '{name}，這幾天要把自律補回來。訓練前準備、補水、收操和紀錄都不要省，這些小事會直接影響你的表現。',
    '{name}，自律不是口號，是每一天該做的事有沒有做到。今天先把一件容易偷懶的事做完整，從這裡開始拉回來。',
    '{name}，你有能力，但最近要更要求自己。不要等被提醒才動，把基本規矩做好，訓練品質才會跟著上來。',
    '{name}，今天把自律當目標。該熱身、該補水、該收操、該記錄，都確實做完，這就是你變穩的底。'
  ],
  recovery: [
    '{name}，最近恢復狀況要注意。今天訓練先不要硬撐，把睡眠、伸展和低強度技術做好，身體顧好才有本錢進步。',
    '{name}，恢復不足時不能只靠意志力。今天先把強度控住，動作品質守住，訓練後收操和補水要確實。',
    '{name}，這幾天身體需要被照顧。不是退步，是調整節奏，先把恢復做好，狀態才拉得回來。',
    '{name}，今天不要把疲勞當成小事。訓練可以做，但要聰明做，先顧恢復和基本動作，不要硬衝。',
    '{name}，恢復是訓練的一部分。今天把睡眠、補水、伸展放進目標裡，身體穩了，後面才加得上去。'
  ],
  goal: [
    '{name}，你有寫目標，這很好，接下來要把它變成今天真的做得到的事。不要只想結果，先把眼前一個重點完成。',
    '{name}，你的目標方向是清楚的。今天訓練就圍繞這個目標做，不用做很多，先把一件事做扎實。',
    '{name}，有目標就要落到行動。今天把「{goal}」拆小，先完成最前面那一步，做到了再往下一步走。',
    '{name}，你知道自己要改什麼，這是進步的開始。今天不要分心，把目標放在訓練裡，一次做好一個重點。',
    '{name}，目標不是寫完就好，是拿來提醒自己。今天把{weakest}和你設定的目標連起來，訓練會更有方向。'
  ],
  encouragement: [
    '{name}，最近不管分數怎樣，教練要你先穩住。你不是沒有能力，只是需要把節奏找回來，今天先完成一個小進步。',
    '{name}，這幾天如果覺得卡住，不要急著放棄。先把基本動作做好，把心穩住，教練看的是你願不願意繼續調整。',
    '{name}，你可以不用一下子變很強，但不能放掉自己。今天先把一件該做的事完成，慢慢把狀態拉回來。',
    '{name}，教練知道你有時候會急，但先穩住。把今天能控制的事情做好，分數和狀態會慢慢回來。',
    '{name}，不要只盯著不好的地方。你有能做好的部分，今天把它守住，再補一個弱點，就夠了。'
  ]
};

function yesNo(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  const s = String(value || '').trim();
  if (!s) return '否';
  return ['是', 'yes', 'true', '1', '已', '有'].indexOf(s.toLowerCase()) !== -1 ? '是' : s;
}

function painScoreValue(rec) {
  const n = parseFloat(rec && rec.painScore);
  return isNaN(n) ? 0 : n;
}
function painAreaText(rec) {
  const area = String((rec && rec.injuryArea) || '').trim();
  return area || '未填部位';
}
function painAlertText(rec) {
  const score = painScoreValue(rec);
  const parts = [String((rec && rec.name) || '').trim() || '未命名', painAreaText(rec), `${score}分`];
  if (score >= 7) parts.push('重度疼痛');
  return parts.join('｜');
}
function painAlertItemHtml(rec) {
  const score = painScoreValue(rec);
  return `<div class="pain-alert-item">
    <span class="pain-alert-name">${escapeHtml((rec && rec.name) || '未命名')}</span>
    <span class="pain-alert-sep">｜</span>
    <span class="pain-alert-area">${escapeHtml(painAreaText(rec))}</span>
    <span class="pain-alert-sep">｜</span>
    <span class="pain-alert-score">${escapeHtml(String(score))}分</span>
    ${score >= 7 ? '<span class="pain-alert-severe">重度疼痛</span>' : ''}
  </div>`;
}
function renderPainAlertBlock(records) {
  const list = (records || []).filter(r => painScoreValue(r) >= 4);
  let html = `<div class="list-block pain-alert-block"><h4>疼痛 4 分以上（${list.length}）</h4>`;
  if (list.length) html += list.map(painAlertItemHtml).join('');
  else html += '<span class="review-label">無</span>';
  html += '</div>';
  return html;
}

function normalizeAttendanceStatus(status, row) {
  const s = String(status || '').trim();
  if (s.indexOf('補訓完成') !== -1) return '補訓完成';
  if (s.indexOf('早退') !== -1) return '早退';
  if (s.indexOf('遲到') !== -1) return '遲到';
  if (s.indexOf('休息') !== -1) return '休息日';
  if (s.indexOf('請假') !== -1) return '未出席已請假';
  if (s.indexOf('缺席') !== -1 || s.indexOf('未出席未請假') !== -1) return '未出席未請假';
  if (s.indexOf('未填') !== -1 || s.indexOf('尚未') !== -1) return '尚未填寫';
  if (s.indexOf('已訓練') !== -1 || s.indexOf('準時') !== -1 || s.indexOf('出席') !== -1) return '已訓練';
  if (yesNo(row && row.kpiSubmitted) === '是') return '已訓練';
  return '尚未填寫';
}

function attendanceColor(status, row) {
  const s = normalizeAttendanceStatus(status, row);
  if (s === '已訓練' || s === '補訓完成') return 'green';
  if (s === '未出席已請假') return 'blue';
  if (s === '尚未填寫') return 'yellow';
  if (s === '遲到' || s === '早退') return 'orange';
  if (s === '未出席未請假') return 'red';
  if (s === '休息日') return 'gray';
  return 'yellow';
}

function normalizeAttendanceReports(rows) {
  return (rows || []).map(row => {
    const date = normDate(row.date || row.timestamp);
    const status = normalizeAttendanceStatus(row.attendanceStatus || row.status, row);
    return {
      timestamp: row.timestamp || '',
      date: date,
      studentName: row.studentName || row.name || '',
      attendanceStatus: status,
      checkInTime: row.checkInTime || '',
      checkOutTime: row.checkOutTime || '',
      absenceReason: row.absenceReason || '',
      informedCoach: yesNo(row.informedCoach),
      parentConfirmed: yesNo(row.parentConfirmed),
      kpiSubmitted: yesNo(row.kpiSubmitted),
      makeupTask: row.makeupTask || '',
      makeupStatus: row.makeupStatus || '',
      coachPublicNote: row.coachPublicNote || row.coachReply || '',
      coachPrivateNote: row.coachPrivateNote || row.redLightNote || '',
      absenceReflection: row.absenceReflection || '',
      finalReadinessScore: row.finalReadinessScore || '',
      readinessStatusLight: row.readinessStatusLight || '',
      trainingDirection: row.trainingDirection || ''
    };
  }).filter(r => r.studentName && r.date).sort((a, b) => a.date < b.date ? 1 : -1);
}

function attendanceReportFromRecord(rec) {
  const absent = isAbsenceGroup(rec.group);
  const reason = String(rec.absenceReason || '').trim();
  return {
    timestamp: rec.timestamp || rec.date || '',
    date: normDate(rec.date),
    studentName: rec.name,
    attendanceStatus: absent ? (reason ? '未出席已請假' : '未出席未請假') : '已訓練',
    checkInTime: '',
    checkOutTime: '',
    absenceReason: reason,
    informedCoach: '是',
    parentConfirmed: yesNo(rec.parentNote ? '是' : ''),
    kpiSubmitted: '是',
    makeupTask: '',
    makeupStatus: '',
    coachPublicNote: rec.coachReply || '',
    coachPrivateNote: rec.redLightNote || '',
    absenceReflection: rec.absenceReflection || '',
    finalReadinessScore: rec.finalReadinessScore || '',
    readinessStatusLight: rec.readinessStatusLight || '',
    trainingDirection: rec.trainingDirection || ''
  };
}

function mergeAttendanceWithKpi(attendanceRows, kpiRows, studentName) {
  const map = {};
  normalizeAttendanceReports(attendanceRows)
    .filter(r => !studentName || String(r.studentName || '').trim() === String(studentName || '').trim())
    .forEach(r => { map[(r.studentName || '') + ':' + r.date] = r; });
  (kpiRows || []).filter(r => !studentName || String(r.name || '').trim() === String(studentName || '').trim()).forEach(rec => {
    const derived = attendanceReportFromRecord(rec);
    const key = (derived.studentName || '') + ':' + derived.date;
    if (!map[key]) map[key] = derived;
    else {
      map[key].kpiSubmitted = '是';
      if (!map[key].absenceReflection && derived.absenceReflection) map[key].absenceReflection = derived.absenceReflection;
      if (!map[key].absenceReason && derived.absenceReason) map[key].absenceReason = derived.absenceReason;
      if (!map[key].finalReadinessScore && derived.finalReadinessScore) map[key].finalReadinessScore = derived.finalReadinessScore;
      if (!map[key].readinessStatusLight && derived.readinessStatusLight) map[key].readinessStatusLight = derived.readinessStatusLight;
      if (!map[key].trainingDirection && derived.trainingDirection) map[key].trainingDirection = derived.trainingDirection;
    }
  });
  return Object.values(map).sort((a, b) => a.date < b.date ? 1 : -1);
}

function dateAdd(dateStr, delta) {
  const d = new Date(normDate(dateStr) + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return ymd(d);
}

function recentDates(days) {
  const out = [];
  for (let i = 0; i < days; i++) out.push(dateAdd(todayStr(), -i));
  return out;
}

function weekDates() {
  const start = weekStartMondayStr();
  return Array.from({ length: 7 }, (_, i) => dateAdd(start, i)).filter(d => d <= todayStr());
}

function monthDates() {
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const out = [];
  for (let d = first; d <= todayStr(); d = dateAdd(d, 1)) out.push(d);
  return out;
}

function reportByDate(rows) {
  const map = {};
  rows.forEach(r => { if (!map[r.date]) map[r.date] = r; });
  return map;
}

function attendanceStats(rows, dates) {
  const map = reportByDate(rows);
  const periodRows = dates.map(d => map[d] || { date: d, attendanceStatus: '尚未填寫', kpiSubmitted: '否' });
  const expectedRows = periodRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) !== '休息日');
  const present = expectedRows.filter(r => ['已訓練', '遲到', '早退', '補訓完成'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  const absent = expectedRows.filter(r => ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  const late = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '遲到').length;
  const leaveEarly = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '早退').length;
  const makeupDone = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '補訓完成' || String(r.makeupStatus || '').indexOf('完成') !== -1).length;
  const makeupTotal = expectedRows.filter(r => r.makeupTask || ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  return {
    expected: expectedRows.length,
    present,
    absent,
    late,
    leaveEarly,
    makeupDone,
    attendanceRate: expectedRows.length ? Math.round(present / expectedRows.length * 100) + '%' : '--',
    makeupRate: makeupTotal ? Math.round(makeupDone / makeupTotal * 100) + '%' : '--'
  };
}

function renderStatsCells(box, cells) {
  box.innerHTML = cells.map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');
}

function parentNoticeText(studentName, status) {
  return `您好，今日系統尚未收到 ${studentName} 的訓練紀錄。目前狀態為：${status}。若今日請假，請協助確認原因；若已完成訓練，請提醒孩子補填紀錄。謝謝。`;
}
function parentReadinessHelp(row) {
  const light = String(row.readinessStatusLight || '');
  if (light.indexOf('強化') !== -1 || light.indexOf('穩定') !== -1) return '今天狀態穩定，請協助維持規律飲食、補水與睡眠。';
  if (light.indexOf('調整') !== -1) return '今天適合調整訓練量，請協助孩子今晚提早休息並補足水分。';
  if (light.indexOf('保護') !== -1) return '今天以保護身體為主，請留意睡眠、疼痛與疲勞是否持續。';
  if (light.indexOf('關懷') !== -1) return '今天先不追求強度，請用關心方式了解孩子身體或生活壓力。';
  return '請協助維持規律作息、補水與正常飲食。';
}

function coachAttendanceNoticeText(names) {
  return `今日未完成訓練紀錄名單：${names.length ? names.join('、') : '無'}。請確認是否為請假、缺席或尚未填寫。`;
}

async function renderParentDashboard() {
  const role = getRole();
  if (!role || role.role !== 'parent' || !role.name) return;
  const studentName = role.name;
  const [attendanceRows, kpiRows] = await Promise.all([
    fetchAttendanceReports(studentName, 90),
    fetchRecentRecords(studentName, 90)
  ]);
  const rows = mergeAttendanceWithKpi(attendanceRows, kpiRows, studentName);
  const byDate = reportByDate(rows);
  const todayRow = byDate[todayStr()] || { date: todayStr(), studentName, attendanceStatus: '尚未填寫', kpiSubmitted: '否' };
  const todayStatus = normalizeAttendanceStatus(todayRow.attendanceStatus, todayRow);
  const todayColor = attendanceColor(todayStatus, todayRow);

  const intro = $id('parentDashboardIntro');
  if (intro) intro.textContent = `${studentName}｜家長只能查看此孩子個人資料，不顯示全隊排名、其他學生或教練內部備註。`;

  $id('parentTodayStatus').innerHTML = `
    <div class="parent-status-card parent-status-${todayColor}">
      <strong>${todayStatus}</strong>
      <div class="review-label">日期：${dateSlash(todayRow.date)}｜KPI：${todayRow.kpiSubmitted || '否'}｜補訓：${todayRow.makeupStatus || '無'}</div>
      ${todayRow.finalReadinessScore ? `<div class="hint-box good">TeamPro AI 訓練準備度：${escapeHtml(todayRow.finalReadinessScore)}｜${escapeHtml(todayRow.readinessStatusLight || '')}<br>${escapeHtml(parentReadinessHelp(todayRow))}</div>` : ''}
      ${todayRow.absenceReason ? `<div class="review-label">未出席原因：${escapeHtml(todayRow.absenceReason)}</div>` : ''}
      ${todayRow.absenceReflection ? `<div class="reflection-cell">🤔 孩子的反思：<br>${escapeHtml(todayRow.absenceReflection).replace(/\n/g, '<br>')}</div>` : ''}
      ${todayRow.coachPublicNote ? `<div class="hint-box good">教練提醒：${escapeHtml(todayRow.coachPublicNote)}</div>` : ''}
    </div>`;

  const seven = recentDates(7).map(d => byDate[d] || { date: d, studentName, attendanceStatus: '尚未填寫', kpiSubmitted: '否' });
  $id('parentSevenDays').innerHTML = `
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>日期</th><th>出席狀態</th><th>是否填寫 KPI</th><th>未出席原因</th><th>補訓狀態</th><th>教練提醒</th></tr></thead>
      <tbody>${seven.map(r => {
        const st = normalizeAttendanceStatus(r.attendanceStatus, r);
        const color = attendanceColor(st, r);
        return `<tr><td>${dateSlash(r.date)}</td><td><span class="status-dot ${color}">${st}</span></td><td>${r.kpiSubmitted || '否'}</td><td>${escapeHtml(r.absenceReason || '-')}</td><td>${escapeHtml(r.makeupStatus || '-')}</td><td>${escapeHtml(r.coachPublicNote || '-')}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;

  const ws = attendanceStats(rows, weekDates());
  renderStatsCells($id('parentWeekStats'), [
    ['應到天數', ws.expected], ['實到天數', ws.present], ['未出席次數', ws.absent],
    ['遲到次數', ws.late], ['早退次數', ws.leaveEarly], ['補訓完成數', ws.makeupDone]
  ]);

  const ms = attendanceStats(rows, monthDates());
  renderStatsCells($id('parentMonthStats'), [
    ['應到天數', ms.expected], ['實到天數', ms.present], ['出席率', ms.attendanceRate],
    ['未出席次數', ms.absent], ['遲到次數', ms.late], ['早退次數', ms.leaveEarly], ['補訓完成率', ms.makeupRate]
  ]);

  const makeupRows = rows.filter(r => r.makeupTask || ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1);
  $id('parentMakeupTasks').innerHTML = makeupRows.length ? `
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>缺席日期</th><th>缺席原因</th><th>補訓任務</th><th>完成狀態</th><th>教練確認狀態</th></tr></thead>
      <tbody>${makeupRows.slice(0, 12).map(r => `<tr><td>${dateSlash(r.date)}</td><td>${escapeHtml(r.absenceReason || '-')}</td><td>${escapeHtml(r.makeupTask || '待教練指派')}</td><td>${escapeHtml(r.makeupStatus || '待補訓')}</td><td>${escapeHtml(r.informedCoach || '-')}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="hint-box good">目前沒有待補訓任務。</div>';

  const notes = rows.filter(r => r.coachPublicNote).slice(0, 8);
  $id('parentCoachNotes').innerHTML = notes.length
    ? notes.map(r => `<div class="hint-box good"><b>${dateSlash(r.date)}</b><br>${escapeHtml(r.coachPublicNote)}</div>`).join('')
    : '<div class="review-label">目前沒有公開給家長的提醒。</div>';

  const notice = parentNoticeText(studentName, todayStatus);
  $id('parentLineNotice').textContent = notice;
  const copyBtn = $id('btnParentCopyNotice');
  const shareBtn = $id('btnParentShareNotice');
  if (copyBtn) copyBtn.onclick = () => copyText(notice);
  if (shareBtn) shareBtn.onclick = () => shareToLine(notice);
}

function upsertAttendanceReportFromKpi(payload) {
  const arr = getAttendanceReportsLocal();
  const derived = attendanceReportFromRecord(payload);
  const idx = arr.findIndex(r => String(r.studentName || r.name || '').trim() === derived.studentName && normDate(r.date) === derived.date);
  if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], derived, { kpiSubmitted: '是', attendanceStatus: arr[idx].attendanceStatus || '已訓練' });
  else arr.push(derived);
  saveAttendanceReportsLocal(arr);
}

async function renderCoachAttendanceReports(todays) {
  const box = $id('coachAttendanceReports');
  if (!box) return;
  const filterDate = $id('coachDate').value || todayStr();
  const allReports = await fetchAllAttendanceReports();
  const allRecords = await fetchAllRecords();
  let rows = mergeAttendanceWithKpi(allReports, allRecords, '').filter(r => normDate(r.date) === filterDate);
  if (!rows.length && Array.isArray(todays)) rows = todays.map(attendanceReportFromRecord);
  const roster = getPlayers();
  const byName = {};
  rows.forEach(r => { byName[String(r.studentName || '').trim()] = r; });
  const missingNames = roster.filter(name => {
    const r = byName[name];
    return !r || ['尚未填寫', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1;
  });
  const notice = coachAttendanceNoticeText(missingNames);
  box.innerHTML = `
    <div class="hint-box warn">${escapeHtml(notice)}</div>
    <div class="btn-group">
      <button type="button" id="btnCoachCopyAttendanceNotice" class="btn btn-secondary">📋 複製教練通知</button>
      <button type="button" id="btnCoachShareAttendanceNotice" class="btn btn-line-share">💬 分享到 LINE</button>
    </div>
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>日期</th><th>選手</th><th>出席狀態</th><th>KPI</th><th>未出席原因</th><th>家長確認</th><th>補訓任務</th><th>補訓狀態</th><th>公開提醒</th><th>教練內部備註</th></tr></thead>
      <tbody>${roster.map(name => {
        const r = byName[name] || { date: filterDate, studentName: name, attendanceStatus: '尚未填寫', kpiSubmitted: '否' };
        const st = normalizeAttendanceStatus(r.attendanceStatus, r);
        const reasonCell = r.absenceReason
          ? `${escapeHtml(r.absenceReason)}${r.absenceReflection ? `<div class="reflection-cell">🤔 ${escapeHtml(r.absenceReflection)}</div>` : ''}`
          : '-';
        return `<tr><td>${dateSlash(r.date)}</td><td>${escapeHtml(name)}</td><td><span class="status-dot ${attendanceColor(st, r)}">${st}</span></td><td>${r.kpiSubmitted || '否'}</td><td>${reasonCell}</td><td>${escapeHtml(r.parentConfirmed || '否')}</td><td>${escapeHtml(r.makeupTask || '-')}</td><td>${escapeHtml(r.makeupStatus || '-')}</td><td>${escapeHtml(r.coachPublicNote || '-')}</td><td>${escapeHtml(r.coachPrivateNote || '-')}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
  const copyBtn = $id('btnCoachCopyAttendanceNotice');
  const shareBtn = $id('btnCoachShareAttendanceNotice');
  if (copyBtn) copyBtn.addEventListener('click', () => copyText(notice));
  if (shareBtn) shareBtn.addEventListener('click', () => shareToLine(notice));
}

/* ============================================================
   11.3 本週之星（努力型、正向、不露分數）
   ------------------------------------------------------------
   依據「努力/過程」而非能力：最堅持（填寫天數）、進步最多（本週首尾差）、
   最佳隊友（鼓勵次數）、最自律（自律面向）。每類只表揚 1 人、只露名字＋
   正向標籤，不秀全班分數。教練可在系統設定關閉（後端 STAR_ENABLED）。
   ============================================================ */

// 本週起始（週一 00:00）
function weekStartMondayStr() {
  const x = new Date();
  const day = (x.getDay() + 6) % 7; // 週一=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return ymd(x);
}

function computeWeeklyStars(all) {
  const startStr = weekStartMondayStr();
  const wk = (all || []).filter(r => r && r.name && normDate(r.date) >= startStr);
  if (!wk.length) return [];

  const byName = {};
  wk.forEach(r => {
    const n = r.name;
    if (!byName[n]) byName[n] = { dates: {}, recs: [] };
    byName[n].dates[normDate(r.date)] = true;
    byName[n].recs.push(r);
  });
  const names = Object.keys(byName);
  const stars = [];
  let best;

  // 🔥 最堅持：本週填最多天（≥2 才表揚）
  best = null;
  names.forEach(n => {
    const days = Object.keys(byName[n].dates).length;
    if (!best || days > best.v) best = { name: n, v: days };
  });
  if (best && best.v >= 2) stars.push({ icon: '🔥', label: '最堅持', name: best.name, note: `本週紀錄 ${best.v} 天，超有毅力！` });

  // 📈 進步最多：本週最早 vs 最晚 平均分差（>0、≥2 筆）
  best = null;
  names.forEach(n => {
    const recs = byName[n].recs.slice().sort((a, b) => normDate(a.date) < normDate(b.date) ? -1 : 1);
    if (recs.length < 2) return;
    const first = parseFloat(recs[0].averageScore), last = parseFloat(recs[recs.length - 1].averageScore);
    if (isNaN(first) || isNaN(last)) return;
    const delta = last - first;
    if (delta > 0 && (!best || delta > best.v)) best = { name: n, v: delta };
  });
  if (best) stars.push({ icon: '📈', label: '進步最多', name: best.name, note: `本週進步 +${round1(best.v)} 分，繼續衝！` });

  // 🤝 最佳隊友：本週最常鼓勵隊友（≥1）
  best = null;
  names.forEach(n => {
    const c = byName[n].recs.filter(r => (r.encouragementToTeammate || '').trim()).length;
    if (!best || c > best.v) best = { name: n, v: c };
  });
  if (best && best.v >= 1) stars.push({ icon: '🤝', label: '最佳隊友', name: best.name, note: `本週鼓勵隊友 ${best.v} 次，超暖！` });

  // 🎯 最自律：本週自律面向平均最高
  best = null;
  names.forEach(n => {
    const arr = byName[n].recs.map(r => parseFloat(r.disciplineAvg)).filter(v => !isNaN(v));
    if (!arr.length) return;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (!best || avg > best.v) best = { name: n, v: avg };
  });
  if (best) stars.push({ icon: '🎯', label: '最自律', name: best.name, note: `自律表現亮眼（${round1(best.v)} 分）` });

  return stars;
}

async function renderWeeklyStars() {
  const card = $id('weeklyStarCard');
  const box = $id('weeklyStarContent');
  if (!card || !box) return;

  // 開關（後端 STAR_ENABLED，預設開；讀不到也預設開）
  let enabled = true;
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getStarConfig' });
      if (res && res.ok && res.data && typeof res.data.enabled !== 'undefined') enabled = !!res.data.enabled;
    } catch (e) { /* 預設開 */ }
  }
  if (!enabled) { card.style.display = 'none'; return; }

  const all = await fetchAllRecords();
  const stars = computeWeeklyStars(all);
  if (!stars.length) { card.style.display = 'none'; return; }

  box.innerHTML = stars.map(s =>
    `<div class="star-row">
       <span class="star-cat">${s.icon} ${s.label}</span>
       <span class="star-name">${escapeHtml(s.name)}</span>
       <span class="star-note">${escapeHtml(s.note)}</span>
     </div>`
  ).join('');
  card.style.display = 'block';
}

// 同一人同一天只保留最新一筆（依 timestamp，缺則用 date）
function dedupeLatestByName(records) {
  const map = {};
  records.forEach(r => {
    const k = String(r.name || '').trim();
    if (!k) return;
    if (!map[k]) { map[k] = r; return; }
    const tNew = new Date(r.timestamp || r.date || 0).getTime();
    const tOld = new Date(map[k].timestamp || map[k].date || 0).getTime();
    if (tNew >= tOld) map[k] = r;
  });
  return Object.keys(map).map(k => map[k]);
}

// 同一天只保留最新一筆（給單一選手的紀錄用），回傳新→舊排序
function dedupeLatestByDate(records) {
  const map = {};
  records.forEach(r => {
    const k = normDate(r.date);
    if (!k) return;
    if (!map[k]) { map[k] = r; return; }
    const tNew = new Date(r.timestamp || r.date || 0).getTime();
    const tOld = new Date(map[k].timestamp || map[k].date || 0).getTime();
    if (tNew >= tOld) map[k] = r;
  });
  return Object.keys(map).sort((a, b) => a < b ? 1 : -1).map(k => map[k]);
}

// 無外部 AI 服務時的穩定 fallback。每組至少 5 種，不依賴任何可能缺少的欄位。
const COACH_AI_REPLY_TEMPLATES = {
  '強化組': [
    '{name}，今天狀態不錯，可以把高品質技術、速度和對打模擬拉起來。但強度上來前，先把動作細節守住，不要只求做快。',
    '{name}，今天可以加強，但不是亂衝。把節奏、反應和爆發力做好，每一組都要有品質，這樣的加強才有價值。',
    '{name}，狀態好就把握今天，把該練的強度做出來。不過動作一亂就先收，品質守住，進步才會留下來。',
    '{name}，今天有條件往上拉。技術速度可以提高一點，但記得控制節奏，做對比做多更重要。',
    '{name}，今天身體有回應，可以挑戰高品質內容。先把基本動作做穩，再把強度推上去，別急著一次全開。'
  ],
  '穩定組': [
    '{name}，今天照正常節奏訓練就好。把細節補齊、把動作品質做穩，該完成的內容一項一項完成。',
    '{name}，今天狀態穩定，不用想太多。重點放在節奏和細節，把每一次練習做紮實，就是今天最好的收穫。',
    '{name}，今天維持正常強度，先求穩再求快。技術有問題就馬上修正，不要把小錯誤一直帶下去。',
    '{name}，今天按計畫做，品質要比數量重要。把專注留在眼前動作，穩穩完成就很好。',
    '{name}，今天不需要硬加碼，把自己的節奏守住。細節做好、呼吸穩住，訓練結束時要知道自己進步在哪裡。'
  ],
  '調整組': [
    '{name}，今天先不要硬衝，總量降一點沒關係。把基本功、技術修正和節奏做好，先讓狀態回到穩定。',
    '{name}，今天的重點是調整，不是證明自己。強度先收住，把動作做乾淨，明天才有力氣繼續往上。',
    '{name}，今天照自己的節奏來，先避開不必要的硬撐。技術細節做好、身體感覺顧好，這就是有效訓練。',
    '{name}，今天把訓練量控制住，遇到卡住先慢下來修正。穩住節奏後再往下做，不用急著跟別人比。',
    '{name}，今天先把基礎做回來。動作穩、呼吸穩、心也穩，狀態才會慢慢拉回來。'
  ],
  '保護組': [
    '{name}，今天先不要硬撐。分數落在保護組，代表身體需要被照顧；強度降下來，先做好恢復、伸展和低強度技術。',
    '{name}，今天重點不是拚強度，是把身體顧好。先避開高強度訓練，把恢復、基本動作和心理狀態穩住。',
    '{name}，今天教練希望你先穩住，不要因為想跟上大家就硬撐。保護組不是退步，是提醒我們要聰明訓練。',
    '{name}，今天先把恢復排前面。身體有不舒服就說，低強度把動作做順就好，狀態回來後再往上拉。',
    '{name}，今天先照顧身體再談表現。把伸展、呼吸和低強度技術做好，留住恢復的空間，這也是訓練。'
  ],
  '關懷組': [
    '{name}，今天教練會多關心你的狀態，不急著要求你做多好。先把身體、心情和眼前的訓練方向整理好，我們一步一步來。',
    '{name}，今天先不要給自己太大壓力。有不舒服或心裡卡住的地方就說，我們先把最重要的一件事做好。',
    '{name}，今天不用急著證明自己。先把狀態穩住、把方向弄清楚，教練會陪你把訓練慢慢接回來。',
    '{name}，今天先照顧好自己，訓練可以調整。你只要把眼前能做的事情做好，其他的我們一起想辦法。',
    '{name}，今天教練在意的是你有沒有穩住，不是一次做到多完美。先從呼吸、基本動作和一個小目標開始。'
  ]
};

function generateCoachAiReply(playerData, mode) {
  const data = playerData || {};
  const templates = COACH_AI_REPLY_TEMPLATES[data.group || data.readinessGroup || '穩定組'] || COACH_AI_REPLY_TEMPLATES['穩定組'];
  const variant = Math.abs(Number(data.aiVariant || 0));
  let reply = templates[variant % templates.length].replace('{name}', String(data.name || '你').trim());
  if (mode === 'coachStyle') {
    const endings = ['今天照這個方向做，不用多想。', '先把這件事做好，其他明天再說。', '有狀況直接講，別自己硬扛。', '做穩了再加，不需要逞強。', '記住，今天的任務就是把自己顧好。'];
    reply += endings[variant % endings.length];
  }
  return reply;
}

function renderCoachReadinessOverview(todays, all) {
  const box = $id('coachReadinessOverview');
  const groupsBox = $id('coachReadinessGroups');
  if (!box || !groupsBox) return;
  const roster = getPlayers();
  const reported = todays.length;
  const missing = Math.max(0, roster.length - reported);
  const avg = reported ? Math.round(todays.reduce((s, r) => s + (nval(r.finalReadinessScore) || 0), 0) / reported) : 0;
  const countBy = label => todays.filter(r => String(r.readinessStatusLight || '').indexOf(label) !== -1).length;
  const highRisk = todays.filter(r => String(r.aiTags || '').match(/受傷風險|高風險|需要關心|脫水風險|睡眠不足/) || (nval(r.finalReadinessScore) || 100) < 55);
  box.innerHTML = [
    ['全隊平均準備度', reported ? avg + ' 分' : '--'],
    ['綠燈人數', countBy('綠燈')],
    ['黃燈人數', countBy('黃燈')],
    ['橘燈人數', countBy('橘燈')],
    ['紅燈人數', countBy('紅燈')],
    ['今日未回報', missing],
    ['高風險名單', highRisk.length]
  ].map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');

  const buckets = { '強化組': [], '穩定組': [], '調整組': [], '保護組': [], '關懷組': [] };
  todays.forEach(r => {
    const light = readinessLight(nval(r.finalReadinessScore) || 0);
    buckets[light.group].push(r);
  });
  const replyTemplates = {
    '強化組': '{name}，今天狀態很好，可以安排高品質技術、速度、對打模擬與爆發力訓練。不過記得，狀態好更要把動作品質守住，不是只有衝強度。',
    '穩定組': '{name}，今天狀態穩定，正常訓練即可。重點放在細節修正、節奏穩定與品質維持，把該做的穩穩完成。',
    '調整組': '{name}，今天狀態需要調整，不急著硬衝。訓練先降低總量，重點放在技術修正、基本功、節奏與動作品質。',
    '保護組': '{name}，今天先以保護與恢復為主，避免高強度訓練。可以安排伸展、低強度技術、恢復、心理調整，先把身體顧好。',
    '關懷組': '{name}，今天教練會多關心你的狀態。不急著要求表現，先把身體、心情和訓練方向整理好，我們一步一步來。'
  };
  let selectedKey = groupsBox.dataset.selectedReadinessPlayer || '';
  const players = [];
  groupsBox.innerHTML = Object.keys(buckets).map(name => {
    const list = buckets[name];
    return `<div class="readiness-group"><h4>${name}（${list.length}）</h4>` +
      (list.length ? list.map((r, index) => {
        const key = `${name}:${String(r.name || '').trim()}:${index}`;
        const playerIndex = players.push({ r, name, key }) - 1;
        const isActive = selectedKey === key;
        const score = r.finalReadinessScore || '--';
        const lightText = r.readinessStatusLight || `${name}`;
        const reply = replyTemplates[name].replace('{name}', String(r.name || '').trim());
        return `<div class="readiness-person readiness-player-card${isActive ? ' active' : ''}" data-readiness-player="${playerIndex}" role="button" tabindex="0" aria-expanded="${isActive}"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(score)}｜${escapeHtml(lightText)}</span><small>${escapeHtml(r.trainingDirection || '')}</small>${isActive ? `<div class="quick-reply-panel" data-quick-reply-panel>
          <div class="quick-reply-title">教練快速回覆區</div><div class="quick-reply-meta">選手：${escapeHtml(r.name)}｜今日分數：${escapeHtml(score)}｜${escapeHtml(lightText)}｜${name}</div>
          <div class="quick-reply-ai-actions"><button type="button" class="quick-reply-ai-btn primary" data-quick-ai="default" data-quick-ai-player="${playerIndex}">⚡ AI代擬</button><button type="button" class="quick-reply-ai-btn" data-quick-ai="rewrite" data-quick-ai-player="${playerIndex}">換一句</button><button type="button" class="quick-reply-ai-btn" data-quick-ai="coachStyle" data-quick-ai-player="${playerIndex}">✏️ 用我的語氣</button></div>
          <textarea class="quick-reply-textarea" aria-label="${escapeHtml(r.name)} 的教練回覆">${escapeHtml(reply)}</textarea>
          <div class="quick-reply-actions"><button type="button" class="quick-reply-confirm-btn" data-quick-confirm>✓ 確認套用</button><button type="button" class="btn btn-secondary" data-quick-copy="${playerIndex}">複製回覆</button><button type="button" class="btn btn-primary" data-quick-line="${playerIndex}">分享 LINE</button></div>
        </div>` : ''}</div>`;
      }).join('') : '<p class="review-label">無</p>') +
      `</div>`;
  }).join('');
  groupsBox._readinessPlayers = players;
  groupsBox.onclick = async function (event) {
    const confirmButton = event.target.closest('[data-quick-confirm]');
    if (confirmButton) {
      event.stopPropagation();
      const panel = confirmButton.closest('.quick-reply-panel');
      const textarea = panel && panel.querySelector('.quick-reply-textarea');
      if (!textarea || !textarea.value.trim()) { toast('請先輸入教練回覆'); return; }
      panel.classList.add('is-confirmed');
      confirmButton.textContent = '✓ 已確認套用';
      toast('✅ 已確認回覆內容，可直接複製或分享 LINE');
      return;
    }
    const aiButton = event.target.closest('[data-quick-ai]');
    if (aiButton) {
      event.stopPropagation();
      const item = players[Number(aiButton.dataset.quickAiPlayer)];
      const panel = aiButton.closest('.quick-reply-panel');
      const textarea = panel && panel.querySelector('.quick-reply-textarea');
      if (!item || !textarea) return;
      const originalText = aiButton.textContent;
      aiButton.disabled = true;
      aiButton.textContent = '產生中...';
      try {
        // 預留非同步介面，日後可在此接入後端 AI；目前必定有內建模板可用。
        await new Promise(resolve => setTimeout(resolve, 120));
        const nextVariant = Number(panel.dataset.aiVariant || 0) + 1;
        panel.dataset.aiVariant = String(nextVariant);
        textarea.value = generateCoachAiReply(Object.assign({}, item.r, { group: item.name, aiVariant: nextVariant }), aiButton.dataset.quickAi);
        panel.classList.remove('is-confirmed');
        const confirm = panel.querySelector('[data-quick-confirm]'); if (confirm) confirm.textContent = '✓ 確認套用';
      } catch (e) {
        const nextVariant = Number(panel.dataset.aiVariant || 0) + 1;
        textarea.value = generateCoachAiReply(Object.assign({}, item.r, { group: item.name, aiVariant: nextVariant }), 'default');
        if (typeof toast === 'function') toast('AI 代擬失敗，已使用內建模板。');
      } finally {
        aiButton.disabled = false;
        aiButton.textContent = originalText;
      }
      return;
    }
    const actionButton = event.target.closest('[data-quick-copy], [data-quick-line]');
    const card = event.target.closest('.readiness-player-card');
    if (actionButton) {
      event.stopPropagation();
      const item = players[Number(actionButton.dataset.quickCopy || actionButton.dataset.quickLine)];
      const panel = actionButton.closest('.quick-reply-panel');
      const message = panel && panel.querySelector('.quick-reply-textarea') ? panel.querySelector('.quick-reply-textarea').value.trim() : '';
      if (actionButton.hasAttribute('data-quick-copy')) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(message);
          else {
            const fallback = document.createElement('textarea'); fallback.value = message; fallback.style.position = 'fixed'; fallback.style.opacity = '0'; document.body.appendChild(fallback); fallback.select(); document.execCommand('copy'); fallback.remove();
          }
          toast('✅ 已複製教練回覆');
        } catch (e) { toast('⚠️ 無法複製，請手動複製文字'); }
      } else if (item) {
        const r = item.r;
        const lineText = `TeamPro 教練回覆\n選手：${r.name}\n今日狀態：${r.finalReadinessScore || '--'}｜${r.readinessStatusLight || item.name}\n分組：${item.name}\n\n教練提醒：\n${message}\n\n今天照這個方向訓練，穩穩做好。`;
        window.open(`https://line.me/R/msg/text/?${encodeURIComponent(lineText)}`, '_blank', 'noopener');
      }
      return;
    }
    if (!card) return;
    const item = players[Number(card.dataset.readinessPlayer)];
    if (!item) return;
    groupsBox.dataset.selectedReadinessPlayer = selectedKey === item.key ? '' : item.key;
    renderCoachReadinessOverview(todays, all);
  };
  groupsBox.oninput = function (event) {
    if (!event.target.matches('.quick-reply-textarea')) return;
    const panel = event.target.closest('.quick-reply-panel');
    if (!panel) return;
    panel.classList.remove('is-confirmed');
    const confirm = panel.querySelector('[data-quick-confirm]'); if (confirm) confirm.textContent = '✓ 確認套用';
  };
  groupsBox.onkeydown = function (event) { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.readiness-player-card')) { event.preventDefault(); event.target.closest('.readiness-player-card').click(); } };
}

function coachScoreButtons(field, value) {
  const cur = String(value || '');
  return `<div class="coach-score-row" data-field="${field}">` +
    [1, 2, 3, 4, 5].map(n => `<button type="button" class="coach-score-btn ${cur === String(n) ? 'sel' : ''}" data-score="${n}" title="${escapeHtml(COACH_SCORE_HELP[field][n - 1])}">${n}<small>${escapeHtml(COACH_SCORE_HELP[field][n - 1])}</small></button>`).join('') +
    `</div>`;
}
function renderCoachQuickScores(todays, coachScores) {
  const box = $id('coachQuickScoreList');
  if (!box) return;
  const date = $id('coachDate').value || todayStr();
  const byName = {};
  todays.forEach(r => { byName[String(r.name || '').trim()] = r; });
  const scoreMap = {};
  (coachScores || []).forEach(s => { scoreMap[String(s.studentName || '').trim()] = s; });
  const names = Array.from(new Set(
    getPlayers()
      .concat((todays || []).map(r => r.name).filter(Boolean))
      .concat((coachScores || []).map(r => r.studentName).filter(Boolean))
  ));
  box.innerHTML = names.map(name => {
    const r = byName[name] || {};
    const s = Object.assign({}, scoreMap[name] || {}, r);
    const readiness = r.name ? buildReadinessAnalysis(s, []) : null;
    const scored = !!(s.coachAttitudeScore && s.coachTechniqueScore && s.coachExecutionScore && s.coachRiskScore);
    return `<div class="coach-score-card collapsed${scored ? ' is-scored' : ''}" data-name="${escapeHtml(name)}">
      <div class="coach-score-head">
        <div class="coach-score-head-main"><b>${escapeHtml(name)}${scored ? ' <span class="coach-score-done">✓ 已評</span>' : ''}</b><span>${r.name ? `${readiness.finalReadinessScore}｜${readiness.statusLight}` : '今日尚未回報，可先建立教練簡評'}</span></div>
        <span class="coach-score-caret" aria-hidden="true">▾</span>
      </div>
      <div class="coach-score-body">
        <label>訓練態度 ${coachScoreButtons('coachAttitudeScore', s.coachAttitudeScore)}</label>
        <label>技術表現 ${coachScoreButtons('coachTechniqueScore', s.coachTechniqueScore)}</label>
        <label>執行力 ${coachScoreButtons('coachExecutionScore', s.coachExecutionScore)}</label>
        <label>風險判斷 ${coachScoreButtons('coachRiskScore', s.coachRiskScore)}</label>
        <textarea class="text-input coach-public-note" rows="2" placeholder="教練公開提醒，可給家長看">${escapeHtml(s.coachPublicNote || '')}</textarea>
        <textarea class="text-input coach-private-note" rows="2" placeholder="教練私密備註，只給教練後台看">${escapeHtml(s.coachPrivateNote || '')}</textarea>
        <button type="button" class="btn btn-primary btn-save-coach-score">儲存簡評</button>
      </div>
    </div>`;
  }).join('');
  // 點卡片標題收合／展開（點「儲存簡評」按鈕不觸發）
  box.querySelectorAll('.coach-score-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.btn-save-coach-score')) return;
      head.closest('.coach-score-card').classList.toggle('collapsed');
    });
  });
  box.querySelectorAll('.coach-score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.coach-score-row');
      row.querySelectorAll('.coach-score-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });
  box.querySelectorAll('.btn-save-coach-score').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.coach-score-card');
      const row = { date: date, studentName: card.dataset.name };
      card.querySelectorAll('.coach-score-row').forEach(r => {
        const sel = r.querySelector('.coach-score-btn.sel');
        row[r.dataset.field] = sel ? sel.dataset.score : '';
      });
      row.coachPublicNote = card.querySelector('.coach-public-note').value.trim();
      row.coachPrivateNote = card.querySelector('.coach-private-note').value.trim();
      if (!row.coachAttitudeScore || !row.coachTechniqueScore || !row.coachExecutionScore || !row.coachRiskScore) {
        toast('請先完成 4 個教練簡評分數');
        return;
      }
      btn.disabled = true; btn.textContent = '儲存中...';
      try {
        await saveCoachScoreRow(row);
        const existing = byName[row.studentName];
        if (existing && existing.recordId) {
          Object.assign(existing, row);
          const rd = applyReadiness(existing, []);
          await updateRecordRemote(existing.recordId, {
            coachAttitudeScore: row.coachAttitudeScore,
            coachTechniqueScore: row.coachTechniqueScore,
            coachExecutionScore: row.coachExecutionScore,
            coachRiskScore: row.coachRiskScore,
            coachPublicNote: row.coachPublicNote,
            coachPrivateNote: row.coachPrivateNote,
            selfScore: existing.selfScore,
            coachScore: existing.coachScore,
            readinessRecoveryScore: existing.readinessRecoveryScore,
            attendanceScore: existing.attendanceScore,
            riskPenalty: existing.riskPenalty,
            finalReadinessScore: existing.finalReadinessScore,
            readinessStatusLight: existing.readinessStatusLight,
            aiTags: existing.aiTags,
            trainingDirection: existing.trainingDirection,
            readinessJson: existing.readinessJson
          });
        }
        toast('✅ 已儲存教練今日簡評');
        await refreshCoach();
      } catch (e) {
        toast('⚠️ ' + e.message);
      } finally {
        btn.disabled = false; btn.textContent = '儲存簡評';
      }
    });
  });
}

async function refreshCoach() {
  toast('讀取資料中...');
  const all = await fetchAllRecords();
  const filterDate = $id('coachDate').value;
  const statusFilter = $id('coachStatusFilter').value;
  const coachScores = await fetchCoachScores(filterDate);

  // 今日（或選定日期）紀錄（日期先正規化，避免 Sheet 把日期轉成 Date 物件導致比對失敗）
  let todays = all.filter(r => normDate(r.date) === filterDate);
  // 同一人同一天只保留最新一筆，避免重複送出灌水（含舊資料已存在的重複）
  todays = dedupeLatestByName(todays);
  mergeCoachScores(todays, coachScores);
  todays.forEach(r => applyReadiness(r, all.filter(x => String(x.name) === String(r.name))));
  if (statusFilter !== 'all') todays = todays.filter(r => r.status === statusFilter);

  renderCoachWarRoom(todays, all);
  renderCoachReadinessOverview(todays, all);
  renderCoachQuickScores(todays, coachScores);
  renderOverview(todays);
  renderCoachSimpleGroups(todays);
  renderRiskTracking(todays, all);
  renderTeamMood(todays);
  renderSubmitStatus(todays);
  renderCoachAttendanceReports(todays);
  renderStatusLists(todays);
  renderRedLightCoaching(todays);
  renderAnalysis(todays);
  renderCoachNutrition(todays, all);
  renderCoachAlerts(all);
  renderInterviewList(todays, all);
  renderCoachTasks();
  toast('✅ 已更新');
}

function renderOverview(todays) {
  const box = $id('coachOverview');
  if (!box) return;
  const roster = getPlayers();
  const count = todays.length;
  const missing = Math.max(0, roster.length - count);
  const redYellow = todays.filter(r =>
    String(r.status || '').indexOf('紅') !== -1 || String(r.status || '').indexOf('黃') !== -1 ||
    String(r.readinessStatusLight || '').indexOf('紅') !== -1 || String(r.readinessStatusLight || '').indexOf('黃') !== -1 ||
    String(r.readinessStatusLight || '').indexOf('橘') !== -1
  ).length;
  const painAlertCount = todays.filter(r => painScoreValue(r) >= 4).length;
  const rpeHigh = todays.filter(r => nval(r.rpe) !== null && nval(r.rpe) >= 8).length;
  const sleepBad = todays.filter(r => String(r.sleepQuality || '') === '差' || (nval(r.sleepHours) !== null && nval(r.sleepHours) < 6)).length;
  const moodLow = todays.filter(r => nval(r.moodIndex) !== null && nval(r.moodIndex) <= 2).length;
  const parentNotify = todays.filter(r => painScoreValue(r) >= 7 || /受傷風險|需要關心|脫水風險|高風險/.test(String(r.aiTags || ''))).length;
  const cells = [
    ['已回報', count],
    ['未回報', missing],
    ['紅黃燈', redYellow],
    ['疼痛 4 分以上', painAlertCount],
    ['RPE 8 以上', rpeHigh],
    ['睡眠差', sleepBad],
    ['心情低落', moodLow],
    ['需家長通知', parentNotify]
  ];
  box.innerHTML = cells.map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');
}

function renderCoachSimpleGroups(todays) {
  const box = $id('coachTodayGroups');
  if (!box) return;
  const buckets = { '強化組': [], '穩定組': [], '調整組': [], '保護組': [], '關懷組': [] };
  (todays || []).forEach(r => {
    const light = readinessLight(nval(r.finalReadinessScore) || 0);
    buckets[light.group].push(r);
  });
  box.innerHTML = Object.keys(buckets).map(group => {
    const list = buckets[group];
    return `<div class="readiness-group"><h4>${group}（${list.length}）</h4>` +
      (list.length ? `<div class="name-list">${list.map(r => `<span class="tag">${escapeHtml(r.name || '')}</span>`).join('')}</div>` : '<p class="review-label">無</p>') +
      `</div>`;
  }).join('');
}

function riskItem(text, cls) {
  return `<span class="tag ${cls || 'tag-orange'}">${escapeHtml(text)}</span>`;
}
function renderRiskBlock(title, items, empty) {
  return `<div class="risk-block"><h4>${title}（${items.length}）</h4><div class="name-list">${items.length ? items.join('') : `<span class="review-label">${empty || '目前無'}</span>`}</div></div>`;
}
function renderRiskTracking(todays, all) {
  const box = $id('coachRiskTracking');
  if (!box) return;
  const bodyRisks = [];
  const mentalRisks = [];
  const trainingRisks = [];
  const parentNotify = [];

  (todays || []).forEach(r => {
    const pain = painScoreValue(r);
    if (pain >= 4) {
      const label = `${r.name || ''}｜${painAreaText(r)}｜${pain}分${pain >= 7 ? '｜重度疼痛' : ''}`;
      bodyRisks.push(riskItem(label, pain >= 7 ? 'tag-red' : 'tag-orange'));
      if (pain >= 7) parentNotify.push(riskItem(`${label}｜建議通知家長`, 'tag-red'));
    }
    const sleep = nval(r.sleepHours);
    if (String(r.sleepQuality || '') === '差' || (sleep !== null && sleep < 6)) bodyRisks.push(riskItem(`${r.name || ''}｜睡眠差${sleep !== null ? `｜${sleep}小時` : ''}`, 'tag-orange'));
    const mood = nval(r.moodIndex);
    if (mood !== null && mood <= 2) mentalRisks.push(riskItem(`${r.name || ''}｜心情低落｜${mood}/5`, 'tag-orange'));
    const rpe = nval(r.rpe);
    if (rpe !== null && rpe >= 8) trainingRisks.push(riskItem(`${r.name || ''}｜RPE ${rpe}`, 'tag-orange'));
    if (/需要關心|高風險硬撐|受傷風險|脫水風險/.test(String(r.aiTags || ''))) trainingRisks.push(riskItem(`${r.name || ''}｜${String(r.aiTags || '').split('、').filter(Boolean).slice(0, 2).join('、')}`, 'tag-red'));
  });

  const byName = {};
  (all || []).forEach(r => { if (r && r.name) (byName[r.name] = byName[r.name] || []).push(r); });
  Object.keys(byName).forEach(name => {
    const alerts = computeAlerts(dedupeLatestByDate(byName[name]));
    alerts.forEach(a => {
      const item = riskItem(`${name}｜${a.text.replace(/^[^\s]+\s*/, '')}`, a.level === 'watch' ? 'tag-green' : 'tag-orange');
      if (/情緒|心情/.test(a.text)) mentalRisks.push(item);
      else if (/睡眠|疼痛|宵夜|水量/.test(a.text)) bodyRisks.push(item);
      else trainingRisks.push(item);
    });
  });

  if (!parentNotify.length) {
    (todays || []).filter(r => /需要關心|受傷風險|高風險/.test(String(r.aiTags || ''))).forEach(r => {
      parentNotify.push(riskItem(`${r.name || ''}｜${String(r.aiTags || '').split('、')[0] || '需要關心'}`, 'tag-red'));
    });
  }

  box.innerHTML =
    renderRiskBlock('身體風險', bodyRisks, '身體狀況穩定') +
    renderRiskBlock('心理風險', mentalRisks, '心理狀態穩定') +
    renderRiskBlock('訓練風險', trainingRisks, '訓練負荷穩定') +
    renderRiskBlock('家長通知', parentNotify, '目前無需通知');
}

/* ---- 團隊今日心情：一眼看出全隊氣氛，並抓出需要關心的人 ---- */
function renderTeamMood(todays) {
  const box = $id('coachMood');
  if (!box) return;

  const withMood = todays.filter(r => String(r.moodIndex || '').trim() !== '' && !isNaN(parseFloat(r.moodIndex)));
  if (!withMood.length) {
    box.innerHTML = `<div class="hint-box">今天還沒有人填心情指數。學生在「填寫頁 → 今日心情指數」勾選後，這裡就會顯示全隊氣氛。</div>`;
    return;
  }

  const vals = withMood.map(r => parseFloat(r.moodIndex));
  const avg = round1(vals.reduce((a, b) => a + b, 0) / vals.length);
  const low = withMood.filter(r => parseFloat(r.moodIndex) <= 2);
  const mid = withMood.filter(r => parseFloat(r.moodIndex) === 3);
  const high = withMood.filter(r => parseFloat(r.moodIndex) >= 4);

  // 團隊氣氛燈號
  let teamLight, teamWord, cls;
  if (avg >= 4) { teamLight = '🟢'; teamWord = '全隊氣氛愉快'; cls = 'good'; }
  else if (avg >= 3) { teamLight = '🟡'; teamWord = '氣氛普通，留意個別狀況'; cls = ''; }
  else { teamLight = '🔴'; teamWord = '低氣壓，今天多給點關心'; cls = 'warn'; }

  const faceAvg = moodMeta(Math.round(avg)) ? moodMeta(Math.round(avg)).emoji : '🙂';

  let html = `<div class="mood-team-head ${cls}">
    <span class="mood-team-face">${faceAvg}</span>
    <div><div class="mood-team-light">${teamLight} ${teamWord}</div>
    <div class="mood-team-sub">平均心情 ${avg} / 5　（${withMood.length} 人已回報）</div></div>
  </div>`;

  // 分布
  html += `<div class="overview-grid" style="margin-top:12px">
    ${moodDistCell('😄🙂 開心', high.length, 'green')}
    ${moodDistCell('😐 普通', mid.length, 'yellow')}
    ${moodDistCell('😕😣 低落', low.length, 'red')}
  </div>`;

  // 需要關心名單（心情 ≤ 2）
  if (low.length) {
    html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💛 今天需要關心（${low.length}）</h4>`;
    low.sort((a, b) => parseFloat(a.moodIndex) - parseFloat(b.moodIndex)).forEach(r => {
      const reason = String(r.moodReason || '').trim();
      html += `<div class="redcare-card"><div class="redcare-head"><b>${escapeHtml(r.name)}</b><span class="tag tag-red">${moodText(r.moodIndex)}</span></div>`;
      if (reason) html += `<div class="redcare-low">原因：${escapeHtml(reason)}</div>`;
      html += `</div>`;
    });
    html += `<div class="hint-box">這幾位今天心情偏低，訓練前後找機會關心一下，別讓情緒累積。</div>`;
  } else {
    html += `<div class="hint-box good">今天沒有人心情偏低 👍</div>`;
  }

  box.innerHTML = html;
}
function moodDistCell(label, n, color) {
  return `<div class="ov-cell"><span class="ov-num" style="color:var(--${color})">${n}</span><span class="ov-label">${label}</span></div>`;
}

/* ---- 已填寫 / 未填寫名單（對照全隊名單）---- */
function renderSubmitStatus(todays) {
  const box = $id('coachSubmitStatus');
  if (!box) return;
  const roster = getPlayers();

  // 已填寫姓名（去重）
  const submittedSet = {};
  todays.forEach(r => { if (r.name) submittedSet[String(r.name).trim()] = true; });

  const submitted = roster.filter(n => submittedSet[n]);
  const notSubmitted = roster.filter(n => !submittedSet[n]);
  // 有填寫但不在名單上的（例如名單改過、或臨時填的）
  const extra = Object.keys(submittedSet).filter(n => roster.indexOf(n) === -1);

  // 卡片標題：未填 > 0 時顯示紅字提醒
  const title = $id('coachSubmitTitle');
  if (title) {
    if (notSubmitted.length) {
      title.innerHTML = `📝 填寫狀況 <span style="color:var(--red,#ff6b6b)">（未填 ${notSubmitted.length} 人）</span>`;
    } else {
      title.innerHTML = `📝 填寫狀況 <span style="color:var(--green,#39d98a)">（全員已填）</span>`;
    }
  }

  let html = '';
  html += `<div class="review-row"><span class="review-label">填寫進度</span>` +
          `<span class="review-value">${submitted.length} / ${roster.length} 人（未填 ${notSubmitted.length} 人）</span></div>`;

  html += `<div class="list-block"><h4>✅ 已填寫（${submitted.length}）</h4><div class="name-list">`;
  if (submitted.length) submitted.forEach(n => html += `<span class="tag tag-green">${n}</span>`);
  else html += '<span class="review-label">尚無人填寫</span>';
  html += `</div></div>`;

  html += `<div class="list-block"><h4>⭕ 未填寫（${notSubmitted.length}）</h4>`;
  if (notSubmitted.length) {
    html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-bottom:6px">👆 點選姓名挑選要催繳的對象（預設全選）</div>`;
    html += `<div style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" id="btnPickAll" class="btn btn-secondary" style="padding:4px 12px">全選</button>
      <button type="button" id="btnPickNone" class="btn btn-secondary" style="padding:4px 12px">全不選</button>
    </div>`;
    html += `<div class="name-list" id="notSubmittedList">`;
    notSubmitted.forEach(n => html += `<span class="tag tag-red tag-pick sel" data-name="${n}">${n}</span>`);
    html += `</div>`;
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button type="button" id="btnShareRemind" class="btn btn-line-share">💬 分享催繳到 LINE<span id="remindCount"></span></button>
      <button type="button" id="btnCopyNotSubmitted" class="btn btn-secondary">📋 複製名單</button>
    </div>`;
  } else {
    html += `<div class="name-list"><span class="review-label">全員都填了，太棒了！</span></div>`;
  }
  html += `</div>`;

  if (extra.length) {
    html += `<div class="list-block"><h4>❓ 名單外（${extra.length}）</h4><div class="name-list">`;
    extra.forEach(n => html += `<span class="tag tag-orange">${n}</span>`);
    html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:4px">這些人有填寫但不在目前名單，可能是改名或臨時填寫。</div></div></div>`;
  }

  box.innerHTML = html;

  // 取得目前勾選（點選）的未填姓名
  function getPicked() {
    return Array.from(box.querySelectorAll('.tag-pick.sel')).map(e => e.dataset.name);
  }

  // 更新催繳按鈕上的人數
  function updateRemindCount() {
    const cntEl = $id('remindCount');
    if (cntEl) cntEl.textContent = `（${getPicked().length}）`;
  }

  // 催繳訊息文字（只含勾選的人）。改名避免和全域 buildRemindText（教練提醒語）衝突。
  function buildAttendanceRemindText(names) {
    const dateStr = dateSlash($id('coachDate').value || todayStr());
    const fillUrl = location.origin + location.pathname;
    return `🥋 育林國中技擊隊｜今日 KPI 填寫提醒
日期：${dateStr}

以下同學今天還沒填寫，請記得完成自己的訓練紀錄 🙏

${names.map(n => '・' + n).join('\n')}

（填寫進度：${submitted.length} / ${roster.length} 人）

👉 點我填寫：
${fillUrl}`;
  }

  // 點選姓名切換選取
  const listEl = $id('notSubmittedList');
  if (listEl) {
    listEl.addEventListener('click', e => {
      const tag = e.target.closest('.tag-pick');
      if (!tag) return;
      tag.classList.toggle('sel');
      updateRemindCount();
    });
  }
  // 全選 / 全不選
  const pickAllBtn = $id('btnPickAll');
  if (pickAllBtn) pickAllBtn.addEventListener('click', () => {
    box.querySelectorAll('.tag-pick').forEach(t => t.classList.add('sel'));
    updateRemindCount();
  });
  const pickNoneBtn = $id('btnPickNone');
  if (pickNoneBtn) pickNoneBtn.addEventListener('click', () => {
    box.querySelectorAll('.tag-pick').forEach(t => t.classList.remove('sel'));
    updateRemindCount();
  });

  // 複製名單（只含勾選）
  const copyBtn = $id('btnCopyNotSubmitted');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const picked = getPicked();
    if (!picked.length) { toast('請至少點選一位'); return; }
    copyText(buildAttendanceRemindText(picked));
  });

  // 分享催繳到 LINE（免費分享，跳出 LINE 選群組送出，不吃推播額度）
  const shareBtn = $id('btnShareRemind');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    const picked = getPicked();
    if (!picked.length) { toast('請至少點選一位'); return; }
    shareToLine(buildAttendanceRemindText(picked));
  });

  updateRemindCount();
}

function renderStatusLists(todays) {
  const box = $id('coachStatusLists');
  const groups = {
    '🔴 紅燈名單': todays.filter(r => r.status && r.status.indexOf('紅') !== -1),
    '🟡 黃燈名單': todays.filter(r => r.status && r.status.indexOf('黃') !== -1),
    '🟢 綠燈名單': todays.filter(r => r.status && r.status.indexOf('綠') !== -1)
  };
  let html = '';
  Object.keys(groups).forEach(title => {
    const list = groups[title];
    html += `<div class="list-block"><h4>${title}（${list.length}）</h4><div class="name-list">`;
    if (list.length) list.forEach(r => {
      const cls = title.indexOf('紅') !== -1 ? 'tag-red' : (title.indexOf('黃') !== -1 ? 'tag-yellow' : 'tag-green');
      html += `<span class="tag ${cls}">${r.name} (${r.averageScore})</span>`;
    });
    else html += '<span class="review-label">無</span>';
    html += `</div></div>`;
  });
  html += renderPainAlertBlock(todays);
  box.innerHTML = html;
}

/* ---- 紅黃燈關懷：教練給方向與鼓勵（送出後選手在「上次表現」看得到）---- */
function renderRedLightCoaching(todays) {
  const box = $id('coachRedLight');
  if (!box) return;
  // 紅燈優先、其次黃燈
  const reds = todays.filter(r => r.status && r.status.indexOf('紅') !== -1);
  const yellows = todays.filter(r => r.status && r.status.indexOf('黃') !== -1);
  const list = reds.concat(yellows);
  if (!list.length) {
    box.innerHTML = '<div class="hint-box good">今天沒有紅燈或黃燈選手，狀況穩定 👍</div>';
    return;
  }

  let html = '';
  list.forEach(r => {
    const isRed = r.status && r.status.indexOf('紅') !== -1;
    const tagCls = isRed ? 'tag-red' : 'tag-yellow';
    const lampTxt = isRed ? '🔴 紅燈' : '🟡 黃燈';
    const groupName = readinessLight(nval(r.finalReadinessScore) || 0).group;
    const issues = [];
    if (painScoreValue(r) >= 4) issues.push(`疼痛：${painAreaText(r)} ${painScoreValue(r)}分`);
    if (nval(r.sleepHours) !== null && nval(r.sleepHours) < 6) issues.push(`睡眠：${nval(r.sleepHours)}小時`);
    else if (String(r.sleepQuality || '') === '差') issues.push('睡眠差');
    if (nval(r.moodIndex) !== null && nval(r.moodIndex) <= 2) issues.push(`心情低落：${nval(r.moodIndex)}/5`);
    if (nval(r.rpe) !== null && nval(r.rpe) >= 8) issues.push(`RPE：${nval(r.rpe)}`);
    let low = [];
    try { low = findLowItems(JSON.parse(r.rawScoresJson || '{}')); } catch (e) { /* */ }
    const lowText = low.length ? low.map(l => `${l.item}(${l.score})`).join('、') : '—';
    if (!issues.length && low.length) issues.push('技術/KPI 偏弱');
    const suggested = (low.length && suggestionMap[low[0].item]) ? suggestionMap[low[0].item].advice : '明天先把基本動作與節奏做穩。';
    const canTarget = !!r.recordId;

    html += `<div class="redcare-card ${isRed ? '' : 'is-yellow'}" data-rid="${r.recordId || ''}">`;
    html += `<div class="redcare-head"><b>${escapeHtml(r.name || '')}｜${escapeHtml(r.averageScore || r.finalReadinessScore || '--')}｜${lampTxt}｜${escapeHtml(groupName)}</b><span class="tag ${tagCls}">今日回覆</span></div>`;
    html += `<div class="redcare-low">主要問題：${escapeHtml(issues.join(' / ') || '今日狀態需教練確認')}</div>`;
    if (low.length) html += `<div class="redcare-low">KPI 提醒：${escapeHtml(lowText)}</div>`;
    html += `<div class="redcare-suggest">💡 建議方向：${suggested}</div>`;
    if (r.coachReply) html += `<div class="hint-box good">✅ 已送出給選手：${escapeHtml(r.coachReply)}</div>`;

    if (canTarget) {
      html += `<div class="redcare-divider"></div>`;
      html += `<textarea class="text-input" id="redmsg-${r.recordId}" rows="2" placeholder="給 ${r.name} 的方向與鼓勵…（可用下方快捷語帶入）">${escapeHtml(r.coachReply || '')}</textarea>`;
      html += `<div class="quick-chips redcare-chips" id="redchips-${r.recordId}" style="display:none;"></div>`;
      html += `<div class="redcare-actions">
        <button type="button" class="btn btn-ai btn-sm" data-redai="${r.recordId}">✨ AI 代擬</button>
        <button type="button" class="btn btn-ghost btn-sm" data-redtoggle="${r.recordId}">💬 快捷語 ▾</button>
        <button type="button" class="btn btn-primary" data-redsend="${r.recordId}">📨 送出給選手</button>
        <button type="button" class="btn btn-primary" data-redsavecoachreply="${r.recordId}">✅ 儲存教練回覆</button>
        <button type="button" class="btn btn-line-share" data-redshare="${r.recordId}">💬 分享到 LINE</button>
      </div>`;

      // 紅燈處理紀錄（原因 / 處理方式 / 備註）
      const curReasons = String(r.redLightReason || '').split('、').filter(Boolean);
      const curHandling = String(r.redLightHandling || '').split('、').filter(Boolean);
      html += `<div class="redcare-divider"></div>`;
      html += `<div class="redcare-low">📋 紅燈處理紀錄</div>`;
      html += `<div style="color:var(--text-soft);font-size:0.8rem;margin:2px 0">原因分類</div><div class="name-list">`;
      RED_LIGHT_REASONS.forEach(x => html += `<span class="tag tag-pick reason-pick ${curReasons.indexOf(x) !== -1 ? 'sel' : ''}" data-rid="${r.recordId}" data-val="${x}">${x}</span>`);
      html += `</div>`;
      html += `<div style="color:var(--text-soft);font-size:0.8rem;margin:6px 0 2px">處理方式</div><div class="name-list">`;
      RED_LIGHT_HANDLINGS.forEach(x => html += `<span class="tag tag-pick handle-pick ${curHandling.indexOf(x) !== -1 ? 'sel' : ''}" data-rid="${r.recordId}" data-val="${x}">${x}</span>`);
      html += `</div>`;
      html += `<textarea class="text-input" id="rednote-${r.recordId}" rows="2" placeholder="處理備註（選填）" style="margin-top:8px">${escapeHtml(r.redLightNote || '')}</textarea>`;
      html += `<button type="button" class="btn btn-secondary" data-redsave="${r.recordId}" style="margin-top:6px">💾 儲存處理紀錄</button>`;
    } else {
      html += `<div class="hint-box">這是較舊的紀錄，無法直接送出（新版紀錄才支援）。可用個人查詢或當面給予。</div>`;
    }
    html += `</div>`;
  });
  box.innerHTML = html;

  // 組成要分享／送出的訊息
  function careMessage(r, text) {
    return `🥋 育林國中技擊隊｜教練的話
給：${r.name}
日期：${dateSlash(r.date)}

${text}

教練相信你，明天一起調整 💪`;
  }

  // 共用：對單一選手呼叫 GPT 代擬並填入輸入框；回傳狀態字串
  async function aiDraftFor(r) {
    const ta = $id(`redmsg-${r.recordId}`);
    if (!ta) return 'fail';
    let low = [];
    try { low = findLowItems(JSON.parse(r.rawScoresJson || '{}')); } catch (e) { /* */ }
    const lowText = low.length ? low.map(l => `${l.item}(${l.score})`).join('、') : '';
    const suggested = (low.length && suggestionMap[low[0].item]) ? suggestionMap[low[0].item].advice : '明天先把基本動作與節奏做穩。';
    try {
      const record = Object.assign({}, r, { _statusLabel: r.status || '', aiTags: lowText });
      const res = await postToWebApp({ action: 'aiCoachFeedback', record: record });
      if (res && res.ok && res.versions && res.versions.student) {
        const v = res.versions.student;
        ta.value = [v.affirm, v.watch, v.oneThing ? ('明天：' + v.oneThing) : '', v.quote ? ('「' + v.quote + '」') : '']
          .filter(Boolean).join('\n');
        ta.dataset.generatedByAi = 'true';
        return res.cached ? 'cached' : 'ok';
      }
      if (res && res.capped) { ta.value = suggested; ta.dataset.generatedByAi = 'false'; return 'capped'; }
      if (res && res.disabled) { ta.value = suggested; ta.dataset.generatedByAi = 'false'; return 'disabled'; }
      return 'fail';
    } catch (e) { return 'fail'; }
  }

  // 快捷語 + 送出 + 分享按鈕
  list.forEach(r => {
    if (!r.recordId) return;
    const chipBox = $id(`redchips-${r.recordId}`);
    if (chipBox) {
      COACH_DIRECTION_PRESETS.forEach(text => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = text.length > 18 ? text.slice(0, 18) + '…' : text;
        chip.title = text;
        chip.addEventListener('click', () => {
          const ta = $id(`redmsg-${r.recordId}`);
          ta.value = ta.value.trim() ? (ta.value.trim() + '\n' + text) : text;
        });
        chipBox.appendChild(chip);
      });
    }
    // ✨ AI 代擬：用 GPT 依教練語氣、針對此選手今天的偏弱項擬「方向與鼓勵」填入輸入框
    const aiBtn = box.querySelector(`[data-redai="${r.recordId}"]`);
    if (aiBtn) aiBtn.addEventListener('click', async () => {
      aiBtn.disabled = true; const old = aiBtn.textContent; aiBtn.textContent = '✨ 生成中…';
      const st = await aiDraftFor(r);
      const MSG = { ok: '✨ AI 已依你的語氣代擬，過目後再送出', cached: '✨ 已帶入 AI 代擬（快取，未扣費）',
        capped: '今日 AI 次數已達上限，已帶入系統建議', disabled: 'AI 未啟用，已帶入系統建議', fail: '⚠️ AI 代擬失敗，請稍後再試' };
      toast(MSG[st] || MSG.fail);
      aiBtn.disabled = false; aiBtn.textContent = old;
    });

    const toggleBtn = box.querySelector(`[data-redtoggle="${r.recordId}"]`);
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const cb = $id(`redchips-${r.recordId}`);
      if (!cb) return;
      const show = cb.style.display === 'none';
      cb.style.display = show ? 'flex' : 'none';
      toggleBtn.textContent = show ? '💬 快捷語 ▴' : '💬 快捷語 ▾';
    });
    const btn = box.querySelector(`[data-redsend="${r.recordId}"]`);
    if (btn) btn.addEventListener('click', async () => {
      const text = $id(`redmsg-${r.recordId}`).value.trim();
      if (!text) { toast('請先輸入要給選手的話'); return; }
      btn.disabled = true; btn.textContent = '送出中...';
      const ta = $id(`redmsg-${r.recordId}`);
      const ok = await saveCoachReplyRemote({
        timestamp: new Date().toISOString(),
        studentName: r.name,
        recordDate: r.date,
        rangeDays: '單筆',
        sourceRecordId: r.recordId,
        replyText: text,
        summaryText: r.status || '',
        generatedByAI: ta && ta.dataset.generatedByAi === 'true',
        confirmedByCoach: true
      }, r);
      btn.disabled = false; btn.textContent = '📨 送出給選手';
      toast(ok ? '✅ 已送出，選手在「上次表現」看得到' : '⚠️ 送出失敗，請檢查連線');
      if (ok) { r.coachReply = text; renderRedLightCoaching(todays); }
    });
    const saveReplyBtn = box.querySelector(`[data-redsavecoachreply="${r.recordId}"]`);
    if (saveReplyBtn) saveReplyBtn.addEventListener('click', async () => {
      const ta = $id(`redmsg-${r.recordId}`);
      const text = ta.value.trim();
      if (!text) { toast('請先輸入教練回覆'); return; }
      saveReplyBtn.disabled = true; saveReplyBtn.textContent = '儲存中...';
      const ok = await saveCoachReplyRemote({
        timestamp: new Date().toISOString(),
        studentName: r.name,
        recordDate: r.date,
        rangeDays: '單筆',
        sourceRecordId: r.recordId,
        replyText: text,
        summaryText: r.status || '',
        generatedByAI: ta.dataset.generatedByAi === 'true',
        confirmedByCoach: true
      }, r);
      saveReplyBtn.disabled = false; saveReplyBtn.textContent = '✅ 儲存教練回覆';
      toast(ok ? '✅ 已儲存教練回覆，選手可在上次表現查看。' : '儲存失敗，請稍後再試。');
      if (ok) renderRedLightCoaching(todays);
    });
    const shareBtn = box.querySelector(`[data-redshare="${r.recordId}"]`);
    if (shareBtn) shareBtn.addEventListener('click', () => {
      const text = $id(`redmsg-${r.recordId}`).value.trim();
      if (!text) { toast('請先輸入要給選手的話'); return; }
      shareToLine(careMessage(r, text));
    });
    // 紅燈處理紀錄：勾選切換 + 儲存
    box.querySelectorAll(`.tag-pick[data-rid="${r.recordId}"]`).forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('sel'));
    });
    const saveRed = box.querySelector(`[data-redsave="${r.recordId}"]`);
    if (saveRed) saveRed.addEventListener('click', async () => {
      const reasons = Array.from(box.querySelectorAll(`.reason-pick.sel[data-rid="${r.recordId}"]`)).map(e => e.dataset.val).join('、');
      const handling = Array.from(box.querySelectorAll(`.handle-pick.sel[data-rid="${r.recordId}"]`)).map(e => e.dataset.val).join('、');
      const note = $id(`rednote-${r.recordId}`).value.trim();
      saveRed.disabled = true; saveRed.textContent = '儲存中...';
      const ok = await updateRecordRemote(r.recordId, { redLightReason: reasons, redLightHandling: handling, redLightNote: note });
      saveRed.disabled = false; saveRed.textContent = '💾 儲存處理紀錄';
      toast(ok ? '✅ 已儲存紅燈處理紀錄' : '⚠️ 儲存失敗，請檢查連線');
      if (ok) { r.redLightReason = reasons; r.redLightHandling = handling; r.redLightNote = note; }
    });
  });

  // ⚡ 一鍵全隊 AI 代擬：依序為每位紅黃燈選手代擬並填入，最後給總結（用 onclick 避免重複綁定）
  const allBtn = $id('btnRedAllAi');
  if (allBtn) {
    const targets = list.filter(r => r.recordId);
    allBtn.style.display = targets.length ? '' : 'none';
    allBtn.onclick = async () => {
      if (!targets.length) return;
      allBtn.disabled = true;
      const old = allBtn.textContent;
      let ai = 0, cached = 0, sugg = 0, failed = 0, disabled = false;
      for (let i = 0; i < targets.length; i++) {
        allBtn.textContent = `✨ 代擬中 ${i + 1}/${targets.length}…`;
        const st = await aiDraftFor(targets[i]);
        if (st === 'ok') ai++;
        else if (st === 'cached') { ai++; cached++; }
        else if (st === 'capped') sugg++;          // 達上限：已填入系統建議，cap 檢查不扣費，繼續
        else if (st === 'disabled') { disabled = true; break; }  // AI 整個沒開：停下提醒
        else failed++;
      }
      allBtn.disabled = false; allBtn.textContent = old;
      if (disabled && ai === 0 && sugg === 0) { toast('AI 尚未啟用，請先到「系統設定 → AI 教練回饋」開啟'); return; }
      let msg = `✨ 已代擬 ${ai} 位，請逐一過目後送出`;
      if (cached) msg += `（含 ${cached} 位快取未扣費）`;
      if (sugg) msg += `；${sugg} 位達當日上限改填系統建議`;
      if (failed) msg += `；${failed} 位失敗`;
      toast(msg);
    };
  }
}

function renderAnalysis(todays) {
  const box = $id('coachAnalysis');
  if (!todays.length) { box.innerHTML = '<div class="hint-box">今日尚無紀錄。</div>'; return; }

  // 統計所有低分細項
  const counter = {};
  todays.forEach(r => {
    try {
      const scores = JSON.parse(r.rawScoresJson || '{}');
      const low = findLowItems(scores);
      low.forEach(l => counter[l.item] = (counter[l.item] || 0) + 1);
    } catch (e) {
      (r.lowItems || '').split('｜').filter(Boolean).forEach(s => {
        const name = s.split('：')[0];
        counter[name] = (counter[name] || 0) + 1;
      });
    }
  });
  const sorted = Object.keys(counter).sort((a, b) => counter[b] - counter[a]).slice(0, 3);

  let html = '<h4>全隊最低三項（最多人偏弱）</h4><div class="name-list">';
  if (sorted.length) sorted.forEach((n, i) => html += `<span class="tag tag-red">${i + 1}. ${n}（${counter[n]} 人）</span>`);
  else html += '<span class="review-label">今日沒有明顯共同弱項，表現不錯！</span>';
  html += '</div>';

  if (sorted.length) {
    html += '<h4 style="margin-top:12px">明日訓練建議</h4>';
    sorted.forEach(n => {
      const s = suggestionMap[n];
      if (s) html += `<div class="hint-box"><b>${n}</b>：${s.advice}</div>`;
    });
  }
  box.innerHTML = html;
}

function renderCoachNutrition(todays, all) {
  const box = $id('coachNutrition');
  const riskList = todays.filter(r => r.nutritionRisks && r.nutritionRisks !== '無明顯風險');
  const lowWater = todays.filter(r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml');
  const lateNight = todays.filter(r => r.lateNightSnack && r.lateNightSnack !== '無');
  const highButLow = todays.filter(r => (r.trainingIntensity === '高' || r.trainingIntensity === '比賽日') && r.nutritionRisks && r.nutritionRisks.indexOf('恢復不足') !== -1);

  let html = '';
  html += nameListBlock('🍱 今日飲食風險名單', riskList.map(r => `${r.name}（${r.nutritionRisks}）`), 'tag-orange');
  html += nameListBlock('💧 水量不足名單', lowWater.map(r => r.name), 'tag-blue');
  html += nameListBlock('🌙 宵夜名單', lateNight.map(r => `${r.name}（${r.lateNightSnack}）`), 'tag-orange');
  html += nameListBlock('🔥 訓練強度高但飲食不足', highButLow.map(r => r.name), 'tag-red');

  box.innerHTML = html || '<div class="hint-box">今日尚無飲食紀錄。</div>';
}

function nameListBlock(title, names, cls) {
  let html = `<div class="list-block"><h4>${title}（${names.length}）</h4><div class="name-list">`;
  if (names.length) names.forEach(n => html += `<span class="tag ${cls}">${n}</span>`);
  else html += '<span class="review-label">無</span>';
  html += '</div></div>';
  return html;
}

// 建議晤談名單
function renderInterviewList(todays, all) {
  const box = $id('coachInterview');
  const reasons = {}; // name -> [reasons]
  function add(name, reason) {
    if (!reasons[name]) reasons[name] = [];
    if (reasons[name].indexOf(reason) === -1) reasons[name].push(reason);
  }

  todays.forEach(r => {
    if (r.status && r.status.indexOf('紅') !== -1) add(r.name, '今日紅燈');
    if (r.readinessStatusLight && r.readinessStatusLight.indexOf('紅燈') !== -1) add(r.name, '準備度紅燈關懷日');
    if (r.readinessStatusLight && r.readinessStatusLight.indexOf('橘燈') !== -1) add(r.name, '準備度橘燈保護日');
    if (painScoreValue(r) >= 7) add(r.name, `${painAreaText(r)}｜疼痛 ${painScoreValue(r)} 分｜建議通知家長`);
    if ((parseFloat(r.coachRiskScore) || 5) <= 2) add(r.name, '教練風險判斷偏高');
    if (String(r.aiTags || '').indexOf('高風險硬撐') !== -1) add(r.name, '高風險硬撐');
    if (parseFloat(r.emotionAvg) < 3) add(r.name, '情緒控制偏低');
    if (parseFloat(r.disciplineAvg) < 3) add(r.name, '自律態度偏低');
    if ((r.trainingIntensity === '高' || r.trainingIntensity === '比賽日') && r.nutritionRisks && r.nutritionRisks.indexOf('恢復不足') !== -1) add(r.name, '高強度但飲食恢復不足');
  });

  // 跨多筆條件：連續兩筆黃/紅、連續兩筆宵夜偏多、連續兩筆水量不足、同細項連 3 筆低、體重單次變化 >1.5
  const byName = {};
  all.forEach(r => { (byName[r.name] = byName[r.name] || []).push(r); });
  Object.keys(byName).forEach(name => {
    const recs = byName[name].slice().sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
    if (recs.length >= 2) {
      const a = recs[0], b = recs[1];
      const bad = s => s && (s.indexOf('黃') !== -1 || s.indexOf('紅') !== -1);
      if (bad(a.status) && bad(b.status)) add(name, '連續兩筆黃／紅燈');
      if (String(a.readinessStatusLight || '').indexOf('紅燈') !== -1 && String(b.readinessStatusLight || '').indexOf('紅燈') !== -1) add(name, '連續兩天紅燈');
      if ((parseFloat(a.sleepHours) || 99) < 6 && (parseFloat(b.sleepHours) || 99) < 6) add(name, '連續睡眠不足');
      if (a.lateNightSnack === '有，偏多' && b.lateNightSnack === '有，偏多') add(name, '連續兩筆宵夜偏多');
      const lw = s => s === '少於 500ml' || s === '500-1000ml';
      if (lw(a.waterIntake) && lw(b.waterIntake)) add(name, '連續兩筆水量不足');
      const wDiff = Math.abs((parseFloat(a.weightKg) || 0) - (parseFloat(b.weightKg) || 0));
      if (wDiff > 1.5) add(name, `體重單次變化 ${round1(wDiff)} kg`);
    }
    // 同細項最近 3 筆都低於 3
    if (recs.length >= 3) {
      const last3 = recs.slice(0, 3);
      const itemLowCount = {};
      last3.forEach(r => {
        try {
          const scores = JSON.parse(r.rawScoresJson || '{}');
          ASPECT_ORDER.forEach(k => {
            Object.keys(scores[k] || {}).forEach(it => {
              if (scores[k][it] < 3) itemLowCount[it] = (itemLowCount[it] || 0) + 1;
            });
          });
        } catch (e) { /* ignore */ }
      });
      Object.keys(itemLowCount).forEach(it => {
        if (itemLowCount[it] >= 3) add(name, `「${it}」最近 3 筆都偏低`);
      });
    }
  });

  // 只顯示今日有出現或有跨筆問題的人
  const names = Object.keys(reasons);
  if (!names.length) { box.innerHTML = '<div class="hint-box good">目前沒有需要特別晤談的選手，狀況穩定。</div>'; return; }

  let html = '';
  names.forEach(name => {
    const rs = reasons[name];
    // 建議處理：抓該人今日最低項
    const todayRec = todays.find(r => r.name === name);
    let advice = '安排個別關心，了解狀況並給予鼓勵。';
    if (todayRec) {
      let low = [];
      try { low = findLowItems(JSON.parse(todayRec.rawScoresJson || '{}')); } catch (e) { /* */ }
      if (low.length) advice = `明日安排「${low.map(l => l.item).join('、')}」個別修正，並提醒訓練後補水與蛋白質補充。`;
    }
    html += `<div class="interview-item"><div class="nm">${name}</div>
      <div style="margin:6px 0"><b>原因：</b>${rs.join('；')}</div>
      <div><b>建議：</b>${advice}</div></div>`;
  });
  box.innerHTML = html;
}

/* ============================================================
   11.5 教練指定任務（功能一）
   ============================================================ */

const TASK_DONE_OPTIONS = ['未完成', '部分完成', '完成', '超越目標'];

// 學生填寫頁：載入並顯示今日任務
function loadStudentTask(name) {
  const card = $id('taskCard');
  const box = $id('taskContent');
  if (!card || !box || !name) { if (card) card.style.display = 'none'; return; }
  const date = $id('date') ? ($id('date').value || todayStr()) : todayStr();
  appGet(appKeyTask(name, date), data => renderStudentTask(name, date, data));
}

function renderStudentTask(name, date, data) {
  const card = $id('taskCard');
  const box = $id('taskContent');
  if (!card || !box) return;
  if (!data || !data.task) { card.style.display = 'none'; return; }

  let html = `<div class="hint-box">🎯 ${escapeHtml(data.task)}</div>`;
  if (data.coachObservation) html += `<div class="hint-box good">👀 教練觀察：${escapeHtml(data.coachObservation)}</div>`;
  if (data.coachNextStep) html += `<div class="hint-box good">➡️ 下一步：${escapeHtml(data.coachNextStep)}</div>`;

  html += `<label class="field-label">任務完成度</label>`;
  html += `<select id="taskCompletion" class="text-input">` +
    TASK_DONE_OPTIONS.map(o => `<option value="${o}"${data.completion === o ? ' selected' : ''}>${o}</option>`).join('') + `</select>`;
  html += `<label class="field-label">想跟教練說的（選填）</label>`;
  html += `<textarea id="taskStudentNote" class="text-input" rows="2" placeholder="例如：旋踢距離我覺得比昨天穩了">${escapeHtml(data.studentNote || '')}</textarea>`;
  html += `<button type="button" id="btnReportTask" class="btn btn-primary" style="margin-top:8px">📨 回報完成度</button>`;
  box.innerHTML = html;
  card.style.display = 'block';

  $id('btnReportTask').addEventListener('click', async () => {
    const merged = Object.assign({}, data, {
      completion: $id('taskCompletion').value,
      studentNote: $id('taskStudentNote').value.trim()
    });
    const btn = $id('btnReportTask');
    btn.disabled = true; btn.textContent = '回報中...';
    await appSet(appKeyTask(name, date), merged);
    btn.disabled = false; btn.textContent = '📨 回報完成度';
    toast('✅ 已回報任務完成度');
    renderStudentTask(name, date, merged);
  });
}

// 教練後台：任務指派 + 完成狀況
function setupTaskHandlers() {
  const dateEl = $id('taskDate');
  if (dateEl && !dateEl.value) dateEl.value = todayStr();
  const assignBtn = $id('btnAssignTask');
  if (assignBtn) assignBtn.addEventListener('click', async () => {
    const name = $id('taskAssignName').value;
    const date = $id('taskDate').value || todayStr();
    const task = $id('taskAssignText').value.trim();
    if (!name) { toast('請選擇選手'); return; }
    if (!task) { toast('請輸入任務內容'); return; }
    const prev = appGet(appKeyTask(name, date)) || {};
    assignBtn.disabled = true; assignBtn.textContent = '指派中...';
    await appSet(appKeyTask(name, date), Object.assign({}, prev, { task: task }));
    assignBtn.disabled = false; assignBtn.textContent = '🎯 指派任務';
    $id('taskAssignText').value = '';
    toast('✅ 已指派任務');
    renderCoachTasks();
  });
  const refreshBtn = $id('btnRefreshTasks');
  if (refreshBtn) refreshBtn.addEventListener('click', renderCoachTasks);
}

async function renderCoachTasks() {
  const box = $id('coachTaskList');
  if (!box) return;
  const date = $id('taskDate') ? ($id('taskDate').value || todayStr()) : todayStr();
  box.innerHTML = '<div class="hint-box">讀取中...</div>';
  const all = await appGetAll('task:');
  // 篩出當天的任務
  const rows = Object.keys(all)
    .filter(k => k.endsWith(':' + normDate(date)))
    .map(k => ({ name: k.split(':')[1], data: all[k] }))
    .filter(r => r.data && r.data.task);

  if (!rows.length) { box.innerHTML = '<div class="hint-box">這天還沒指派任何任務。</div>'; return; }

  let html = '';
  rows.forEach(r => {
    const d = r.data;
    const doneTag = d.completion
      ? `<span class="tag ${d.completion === '未完成' ? 'tag-red' : (d.completion === '部分完成' ? 'tag-yellow' : 'tag-green')}">${d.completion}</span>`
      : `<span class="tag tag-orange">未回報</span>`;
    html += `<div class="redcare-card" data-tname="${escapeHtml(r.name)}">`;
    html += `<div class="redcare-head"><b>${escapeHtml(r.name)}</b>${doneTag}</div>`;
    html += `<div class="redcare-low">🎯 ${escapeHtml(d.task)}</div>`;
    if (d.studentNote) html += `<div class="hint-box">💬 選手回報：${escapeHtml(d.studentNote)}</div>`;
    html += `<label class="field-label">教練觀察</label><textarea class="text-input" id="tobs-${escapeHtml(r.name)}" rows="2" placeholder="這次任務的觀察…">${escapeHtml(d.coachObservation || '')}</textarea>`;
    html += `<label class="field-label">下一步建議</label><textarea class="text-input" id="tnext-${escapeHtml(r.name)}" rows="2" placeholder="下一步要練什麼…">${escapeHtml(d.coachNextStep || '')}</textarea>`;
    html += `<button type="button" class="btn btn-primary" data-tsave="${escapeHtml(r.name)}" style="margin-top:8px">💾 儲存觀察</button>`;
    html += `</div>`;
  });
  box.innerHTML = html;

  rows.forEach(r => {
    const btn = box.querySelector(`[data-tsave="${CSS.escape(r.name)}"]`);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const merged = Object.assign({}, r.data, {
        coachObservation: $id(`tobs-${r.name}`).value.trim(),
        coachNextStep: $id(`tnext-${r.name}`).value.trim()
      });
      btn.disabled = true; btn.textContent = '儲存中...';
      await appSet(appKeyTask(r.name, date), merged);
      btn.disabled = false; btn.textContent = '💾 儲存觀察';
      toast('✅ 已儲存，選手填寫時看得到');
    });
  });
}

/* ============================================================
   11.6 連續警示系統（功能五）
   ============================================================ */
function computeAlerts(recs) {
  // recs：同一選手、已依日期去重、新→舊
  const alerts = [];
  const has = n => recs.length >= n;
  const recent = n => recs.slice(0, n);
  const every = (n, pred) => has(n) && recent(n).every(pred);
  const num = (r, f) => parseFloat(r[f]);
  const lowWater = r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml';
  // 該指標在窗內是否逐步上升（最新 > 窗內最舊）
  const improving = (n, f) => has(n) && (num(recent(n)[0], f) > num(recent(n)[n - 1], f));

  if (every(2, r => r.bodyStatus === '受傷中'))
    alerts.push({ level: 'warn', text: '🤕 連續 2 天回報受傷中，建議調整訓練量並關心' });
  else if (every(2, r => r.bodyStatus === '疲勞' || r.bodyStatus === '受傷中'))
    alerts.push({ level: 'warn', text: '😪 連續 2 天疲勞，注意休息與恢復' });

  if (recs[0] && painScoreValue(recs[0]) >= 7) {
    alerts.push({ level: 'warn', text: `🩹 ${painAreaText(recs[0])}｜疼痛 ${painScoreValue(recs[0])} 分｜建議通知家長` });
  } else if (every(2, r => painScoreValue(r) >= 4)) {
    alerts.push({ level: 'warn', text: `🩹 連續疼痛警示｜${painAreaText(recs[0])}｜最近疼痛 ${painScoreValue(recs[0])} 分` });
  }

  if (every(3, lowWater)) alerts.push({ level: 'warn', text: '💧 連續 3 天水量不足，提醒補水' });
  if (every(2, r => r.lateNightSnack && r.lateNightSnack !== '無'))
    alerts.push({ level: 'warn', text: '🌙 連續 2 次宵夜，注意飲食與睡眠' });

  if (every(3, r => num(r, 'emotionAvg') < 3)) {
    if (improving(3, 'emotionAvg')) alerts.push({ level: 'watch', text: '📈 情緒分數偏低但逐日進步中（進步觀察中）' });
    else alerts.push({ level: 'warn', text: '😔 連續 3 天情緒偏低，建議個別關心' });
  }
  if (every(3, r => num(r, 'technicalAvg') < 3)) {
    if (improving(3, 'technicalAvg')) alerts.push({ level: 'watch', text: '📈 技術分數偏低但逐日進步中（進步觀察中）' });
    else alerts.push({ level: 'warn', text: '🥋 連續 3 天技術偏低，安排技術修正' });
  }
  return alerts;
}

function renderCoachAlerts(all) {
  const box = $id('coachAlerts');
  if (!box) return;
  const byName = {};
  (all || []).forEach(r => { if (r && r.name) (byName[r.name] = byName[r.name] || []).push(r); });

  let html = '';
  Object.keys(byName).forEach(name => {
    const recs = dedupeLatestByDate(byName[name]); // 新→舊
    const alerts = computeAlerts(recs);
    if (!alerts.length) return;
    html += `<div class="redcare-card"><div class="redcare-head"><b>${escapeHtml(name)}</b></div>`;
    alerts.forEach(a => {
      const cls = a.level === 'watch' ? 'good' : 'warn';
      html += `<div class="hint-box ${cls}">${a.text}</div>`;
    });
    html += `</div>`;
  });
  box.innerHTML = html || '<div class="hint-box good">目前沒有連續警示，全隊狀況穩定 👍</div>';
}

/* ============================================================
   11.7 賽前狀態雷達（功能六）
   ============================================================ */
async function loadPreComp() {
  const name = $id('preCompName').value;
  const box = $id('preCompResult');
  if (!box) return;
  if (!name) { toast('請選擇選手'); return; }
  box.innerHTML = '<div class="hint-box">分析中...</div>';
  const history = await fetchRecentRecords(name, 30);
  const recs = dedupeLatestByDate(history || []).slice(0, 5); // 最近 5 筆
  if (!recs.length) { box.innerHTML = '<div class="hint-box">查無紀錄。</div>'; return; }

  // 六面向平均
  const avg = {};
  ASPECT_ORDER.forEach(k => {
    const vals = recs.map(r => parseFloat(r[ASPECT_AVG_FIELD[k]])).filter(v => !isNaN(v));
    avg[k] = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });
  const overall = round2(ASPECT_ORDER.reduce((s, k) => s + avg[k], 0) / 6);

  // 體重趨勢、恢復（疲勞/受傷天數）
  const weights = recs.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wTxt = weights.length >= 2 ? `${weights[weights.length - 1]} → ${weights[0]} kg` : (weights.length ? weights[0] + ' kg' : '--');
  const fatigueDays = recs.filter(r => r.bodyStatus === '疲勞' || r.bodyStatus === '受傷中').length;
  const injured = recs.some(r => r.bodyStatus === '受傷中');

  // 結論
  let verdict, vClass;
  if (injured) { verdict = '🚑 受傷風險：先確認傷勢，未恢復前不建議全力出賽'; vClass = 'warn'; }
  else if (overall >= 4) { verdict = '✅ 可出賽：狀態穩定，維持節奏即可'; vClass = 'good'; }
  else if (overall >= 3.5) { verdict = '🟢 可出賽但需觀察：再把最弱面向顧好'; vClass = 'good'; }
  else if (overall >= 3) { verdict = '🟡 建議調整訓練量：先把基礎與恢復補起來'; vClass = 'warn'; }
  else { verdict = '🔴 建議家長溝通：近期狀態偏低，需要一起關心調整'; vClass = 'warn'; }
  if (!injured && fatigueDays >= 3) verdict += '（近期疲勞偏多，留意恢復）';

  let html = `<div class="review-row"><span class="review-label">分析依據</span><span class="review-value">最近 ${recs.length} 筆</span></div>`;
  html += `<div class="review-row"><span class="review-label">綜合平均</span><span class="review-value">${overall} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">體重趨勢</span><span class="review-value">${wTxt}</span></div>`;
  html += `<div class="review-row"><span class="review-label">疲勞/受傷天數</span><span class="review-value">${fatigueDays} / ${recs.length}</span></div>`;
  html += radarChartSVG(avg);
  html += `<div class="hint-box ${vClass}">${verdict}</div>`;
  box.innerHTML = html;
}

// 個人查詢最近 7 筆
async function loadPersonRecords() {
  const name = $id('coachPersonName').value;
  if (!name) { toast('請選擇選手'); return; }
  let recs;
  const url = getWebAppUrl();
  if (url) {
    try {
      // 多抓一些，去重後再取 7 筆（避免舊重複資料把名額占滿）
      const res = await postToWebApp({ action: 'getRecentRecordsByName', name: name, limit: 40 });
      recs = (res && res.ok && Array.isArray(res.data)) ? res.data : localRecentRecords(name, 40);
    } catch (e) { recs = localRecentRecords(name, 40); }
  } else {
    recs = localRecentRecords(name, 40);
  }

  // 同一天只保留最新一筆，並取最近 7 天
  recs = dedupeLatestByDate(recs).slice(0, 7);

  const box = $id('coachPersonResult');
  if (!recs.length) { box.innerHTML = '<div class="hint-box">查無紀錄。</div>'; return; }

  let html = '<h4 style="margin-bottom:8px">📈 七天成長趨勢</h4><div id="personTrendBox"></div>';
  html += '<div class="table-scroll"><table class="record-table"><thead><tr>' +
    '<th>日期</th><th>總分</th><th>平均</th><th>狀態</th><th>體重</th><th>BMI</th><th>飲食風險</th><th>最低三項</th>' +
    '</tr></thead><tbody>';
  recs.forEach(r => {
    html += `<tr>
      <td>${dateSlash(r.date)}</td><td>${r.totalScore}</td><td>${r.averageScore}</td>
      <td>${r.status}</td><td>${r.weightKg}</td><td>${r.bmi}</td>
      <td>${r.nutritionRisks || '-'}</td><td>${(r.lowItems || '-').replace(/｜/g, '<br>')}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  // 六大面向趨勢（文字）
  html += '<h4 style="margin-top:14px">六大面向趨勢（新→舊）</h4><div class="table-scroll"><table class="record-table"><thead><tr><th>日期</th>';
  ASPECT_ORDER.forEach(k => html += `<th>${KPI_ASPECTS[k].label}</th>`);
  html += '</tr></thead><tbody>';
  recs.forEach(r => {
    html += `<tr><td>${dateSlash(r.date)}</td>`;
    ASPECT_ORDER.forEach(k => html += `<td>${r[ASPECT_AVG_FIELD[k]] || '-'}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // 訓練時段與身體狀態（含新欄位：時段、排汗量）
  html += '<h4 style="margin-top:14px">訓練時段與身體狀態（新→舊）</h4><div class="table-scroll"><table class="record-table"><thead><tr>' +
    '<th>日期</th><th>訓練時段</th><th>RPE</th><th>痠痛</th><th>排汗</th><th>睡眠</th><th>尿液</th><th>疼痛</th>' +
    '</tr></thead><tbody>';
  recs.forEach(r => {
    const sweatTxt = (r.sweatLevel !== '' && r.sweatLevel != null) ? (r.sweatLevel + '/5') : '-';
    const sleepTxt = (String(r.sleepHours || '').trim() !== '') ? (r.sleepHours + 'h' + (r.sleepQuality ? '・' + r.sleepQuality : '')) : '-';
    const painTxt = (r.painScore !== '' && r.painScore != null && String(r.painScore) !== '0') ? (r.painScore + '/10') : (String(r.painScore) === '0' ? '0' : '-');
    html += `<tr>
      <td>${dateSlash(r.date)}</td>
      <td>${escapeHtml(r.trainingSession || '-')}</td>
      <td>${r.rpe ? r.rpe + '/10' : '-'}</td>
      <td>${r.soreness ? r.soreness + '/5' : '-'}</td>
      <td>${escapeHtml(sweatTxt)}</td>
      <td>${escapeHtml(sleepTxt)}</td>
      <td>${escapeHtml(r.urineStatus || '-')}</td>
      <td>${escapeHtml(painTxt)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  // ---- 評分與對話（交叉辯論）：每筆一張卡 ----
  html += '<h4 style="margin-top:16px">✍️ 評分與對話</h4>';
  recs.forEach(r => html += renderCoachReviewBlock(r));

  box.innerHTML = html;

  // 七天成長趨勢圖
  const ptb = $id('personTrendBox');
  if (ptb) renderTrendSection(ptb, recs);

  // 綁定每張卡的事件
  recs.forEach(r => wireCoachReviewBlock(r));
}

// 教練評分／回覆卡片
function renderCoachReviewBlock(rec) {
  if (!rec.recordId) {
    return `<div class="card" style="margin-bottom:10px"><b>${dateSlash(rec.date)}</b>　<span class="review-label">舊紀錄，無法評分／回覆</span></div>`;
  }
  const self = aspectAvgFromRecord(rec);
  const coach = hasCoachReview(rec) ? coachAspectAvgFromRecord(rec) : null;
  const reviewKeys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;

  let html = `<div class="review-card" data-rid="${rec.recordId}">`;
  html += `<div class="review-row"><span class="review-label">${dateSlash(rec.date)}</span><span class="review-value">${rec.status}　${scoreMaxText(rec)}</span></div>`;

  // 六大面向雷達圖（自評＋教練評疊圖）
  html += radarFromRecord(rec);

  // 計算透明化
  html += explainStatusFromRecord(rec);
  // 自評 vs 教練評（已評過才顯示）
  html += renderSelfVsCoach(rec);

  // 選手的看法
  if (rec.studentResponse) html += `<div class="hint-box">💬 選手的看法：${escapeHtml(rec.studentResponse)}</div>`;
  // 家長留言
  if (rec.parentNote) html += `<div class="hint-box">👨‍👩‍👧 家長留言：${escapeHtml(rec.parentNote)}</div>`;

  // 教練評分表單
  html += `<details class="explain"${coach ? '' : ' open'}><summary>✍️ ${coach ? '修改' : '填寫'}教練評分</summary><div class="explain-body">`;
  reviewKeys.forEach(k => {
    const def = coach ? coach[k] : Math.round(self[k]);
    html += `<div class="kpi-item" style="border:none;padding:6px 0">
      <div class="kpi-item-row"><span class="kpi-item-name">${KPI_ASPECTS[k].label}<span style="color:var(--text-soft)">（自評 ${self[k]}）</span></span>
      <span class="kpi-item-score" id="crvlbl-${rec.recordId}-${k}">${def}</span></div>
      <input type="range" min="1" max="5" step="0.5" value="${def}" class="kpi-slider coach-review-slider"
             data-rid="${rec.recordId}" data-aspect="${k}" id="crv-${rec.recordId}-${k}" />
    </div>`;
  });
  html += `<label class="field-label">教練評語</label>
    <textarea class="text-input" id="crvcomment-${rec.recordId}" rows="2" placeholder="給這位選手的話…">${escapeHtml(rec.coachComment || '')}</textarea>
    <button type="button" class="btn btn-primary" data-save-review="${rec.recordId}" style="margin-top:8px">💾 儲存教練評分</button>`;
  html += `</div></details>`;

  // 回覆選手
  html += `<label class="field-label">💬 回覆選手</label>
    <textarea class="text-input" id="creply-${rec.recordId}" rows="2" placeholder="回應選手的看法…">${escapeHtml(rec.coachReply || '')}</textarea>
    <button type="button" class="btn btn-secondary" data-send-reply="${rec.recordId}" style="margin-top:8px">📨 送出回覆</button>`;

  html += `</div>`;
  return html;
}

// 綁定教練評分卡事件
function wireCoachReviewBlock(rec) {
  if (!rec.recordId) return;
  const reviewKeys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;
  // 拉桿即時更新數字
  reviewKeys.forEach(k => {
    const s = $id(`crv-${rec.recordId}-${k}`);
    if (s) s.addEventListener('input', () => { $id(`crvlbl-${rec.recordId}-${k}`).textContent = s.value; });
  });
  // 儲存評分
  const saveBtn = document.querySelector(`[data-save-review="${rec.recordId}"]`);
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const fields = {};
    let total = 0;
    reviewKeys.forEach(k => {
      const v = parseFloat($id(`crv-${rec.recordId}-${k}`).value) || 0;
      fields[COACH_ASPECT_FIELD[k]] = v; total += v;
    });
    fields.coachTotalScore = round2(total);
    fields.coachAverageScore = round2(total / reviewKeys.length);
    fields.coachStatus = judgeStatus(total / reviewKeys.length);
    fields.coachComment = $id(`crvcomment-${rec.recordId}`).value.trim();
    saveBtn.disabled = true; saveBtn.textContent = '儲存中...';
    const ok = await updateRecordRemote(rec.recordId, fields);
    saveBtn.disabled = false; saveBtn.textContent = '💾 儲存教練評分';
    toast(ok ? '✅ 已儲存教練評分' : '⚠️ 儲存失敗');
    if (ok) loadPersonRecords(); // 重新整理以顯示對照
  });
  // 送出回覆
  const replyBtn = document.querySelector(`[data-send-reply="${rec.recordId}"]`);
  if (replyBtn) replyBtn.addEventListener('click', async () => {
    const text = $id(`creply-${rec.recordId}`).value.trim();
    replyBtn.disabled = true; replyBtn.textContent = '送出中...';
    const ok = await updateRecordRemote(rec.recordId, { coachReply: text });
    replyBtn.disabled = false; replyBtn.textContent = '📨 送出回覆';
    toast(ok ? '✅ 已送出回覆，選手在「上次表現」看得到' : '⚠️ 送出失敗');
  });
}

/* ============================================================
   12. 上次表現分頁
   ============================================================ */
function getCoachReplyStore() {
  try {
    const data = JSON.parse(localStorage.getItem(COACH_REPLY_LS_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}
function saveCoachReplyStore(row) {
  const arr = getCoachReplyStore();
  arr.unshift(row);
  localStorage.setItem(COACH_REPLY_LS_KEY, JSON.stringify(arr.slice(0, 300)));
}
function coachReplyDateValue(v) {
  const d = new Date(v || '');
  return isNaN(d.getTime()) ? null : d;
}
function isCoachReplyWithinDays(reply, baseDate, days) {
  const base = coachReplyDateValue(normDate(baseDate) || todayStr());
  const date = coachReplyDateValue(normDate(reply.recordDate) || reply.timestamp);
  if (!base || !date) return false;
  base.setHours(23, 59, 59, 999);
  const start = new Date(base);
  start.setDate(start.getDate() - ((days || 7) - 1));
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= base;
}
function normalizeCoachReplyRow(row) {
  return {
    timestamp: row.timestamp || row.createdAt || '',
    studentName: row.studentName || row.name || '',
    recordDate: row.recordDate || row.date || '',
    rangeDays: row.rangeDays || '',
    sourceRecordId: row.sourceRecordId || row.recordId || '',
    replyText: row.replyText || row.coachReplyText || row.coachReply || '',
    summaryText: row.summaryText || row.summary || '',
    generatedByAI: row.generatedByAI === true || String(row.generatedByAI).toLowerCase() === 'true',
    confirmedByCoach: row.confirmedByCoach !== false && String(row.confirmedByCoach).toLowerCase() !== 'false'
  };
}
async function fetchCoachRepliesForStudent(name, recordDate, limit) {
  let rows = [];
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getCoachReplies', studentName: name, recordDate: recordDate || '', limit: limit || 10 });
      if (res && res.ok && Array.isArray(res.replies)) rows = res.replies;
    } catch (e) { /* local fallback */ }
  }
  if (!rows.length) {
    rows = getCoachReplyStore().filter(r => String(r.studentName || '').trim() === String(name || '').trim());
  }
  return rows.map(normalizeCoachReplyRow)
    .filter(r => r.replyText && r.confirmedByCoach)
    .sort((a, b) => String(b.timestamp || b.recordDate).localeCompare(String(a.timestamp || a.recordDate)));
}
async function pickStudentCoachReply(name, rec) {
  if (rec && rec.coachReply) {
    return normalizeCoachReplyRow({
      timestamp: rec.reviewUpdatedAt || rec.timestamp || '',
      studentName: rec.name || name,
      recordDate: rec.date || '',
      sourceRecordId: rec.recordId || '',
      replyText: rec.coachReply,
      generatedByAI: false,
      confirmedByCoach: true
    });
  }
  const rows = await fetchCoachRepliesForStudent(name, rec ? rec.date : '', 10);
  const exact = rec ? rows.find(r =>
    (r.sourceRecordId && rec.recordId && String(r.sourceRecordId) === String(rec.recordId)) ||
    (r.recordDate && normDate(r.recordDate) === normDate(rec.date))
  ) : null;
  if (exact) return exact;
  return rows.find(r => isCoachReplyWithinDays(r, rec ? rec.date : todayStr(), 7)) || null;
}
function coachReplyTimeText(reply) {
  const raw = reply && (reply.timestamp || reply.recordDate);
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return dateSlash(raw);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}
function studentCoachReplyHtml(reply) {
  if (!reply || !reply.replyText) {
    return `<div class="student-coach-reply-card">
      <div class="student-coach-reply-empty">教練目前還沒有針對這筆紀錄回覆。你可以先看上次心得與目標，照著方向慢慢修正。</div>
    </div>`;
  }
  const meta = [];
  const time = coachReplyTimeText(reply);
  if (time) meta.push(`回覆時間：${escapeHtml(time)}`);
  if (reply.generatedByAI && reply.confirmedByCoach) meta.push('AI 協助整理，教練已確認');
  return `<div class="student-coach-reply-card">
    <div class="student-coach-reply-body">教練看完你最近的紀錄後，給你的方向：<br><br>「${escapeHtml(reply.replyText)}」</div>
    ${meta.length ? `<div class="student-coach-reply-meta">${meta.join('<br>')}</div>` : ''}
  </div>`;
}
async function renderStudentCoachReplyCard(name, rec, box) {
  const target = $id('studentCoachReplyMount');
  const mount = target || box;
  if (!mount) return;
  const role = (getRole() || {}).role;
  if (role === 'coach') return;
  const reply = await pickStudentCoachReply(name, rec);
  if (target) target.innerHTML = studentCoachReplyHtml(reply);
  else mount.insertAdjacentHTML('beforeend', studentCoachReplyHtml(reply));
}
async function saveCoachReplyRemote(row, rec) {
  const payload = Object.assign({
    recordDate: rec ? rec.date : '',
    sourceRecordId: rec ? rec.recordId : '',
    generatedByAI: false,
    confirmedByCoach: true,
    createdBy: 'coach'
  }, row);
  let ok = false;
  if (rec && rec.recordId) ok = await updateRecordRemote(rec.recordId, { coachReply: payload.replyText });
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'saveCoachReply', payload: payload });
      ok = ok || !!(res && res.ok);
    } catch (e) { /* local fallback */ }
  }
  saveCoachReplyStore(payload);
  if (rec) rec.coachReply = payload.replyText;
  return ok;
}
function getCoachAiStyleText() {
  const el = $id('aiStyle');
  if (el && el.value) return el.value.trim();
  try {
    const cached = JSON.parse(localStorage.getItem('teampro_ai_config_cache') || '{}');
    return cached.style || '';
  } catch (e) { return ''; }
}
function averageNumber(values) {
  const nums = (values || []).map(v => parseFloat(v)).filter(v => !isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function coachReplyRangeRecords(history, days) {
  const rows = dedupeLatestByDate(history || []);
  if (!rows.length) return [];
  const latestDate = normDate(rows[0].date) || todayStr();
  const end = new Date(latestDate); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - ((days || 7) - 1));
  return rows.filter(r => {
    const d = new Date(normDate(r.date));
    return !isNaN(d.getTime()) && d >= start && d <= end;
  });
}
function coachReplyAreaStats(records) {
  const stats = ASPECT_ORDER.map(k => {
    const vals = (records || []).map(r => parseFloat(r[ASPECT_AVG_FIELD[k]])).filter(v => !isNaN(v));
    const avg = vals.length ? averageNumber(vals) : null;
    return { key: k, label: KPI_ASPECTS[k].label, avg: avg };
  }).filter(x => x.avg != null);
  let strongest = null, weakest = null;
  stats.forEach(s => {
    if (!strongest || s.avg > strongest.avg) strongest = s;
    if (!weakest || s.avg < weakest.avg) weakest = s;
  });
  return { stats, strongest, weakest };
}
function buildCoachPerformanceContext(name, rec, history, rangeDays) {
  const records = coachReplyRangeRecords(history || (rec ? [rec] : []), rangeDays || 7);
  if (!records.length && rec) records.push(rec);
  const oldToNew = records.slice().reverse();
  const totals = oldToNew.map(r => parseFloat(r.totalScore)).filter(v => !isNaN(v));
  const avgs = oldToNew.map(r => parseFloat(r.averageScore)).filter(v => !isNaN(v));
  const first = totals.length ? totals[0] : null;
  const last = totals.length ? totals[totals.length - 1] : null;
  const delta = (first != null && last != null) ? round1(last - first) : null;
  const area = coachReplyAreaStats(records);
  const latest = records[0] || rec || {};
  const lowScoreCount = totals.filter(v => v < 60).length;
  const recentFlags = [];
  if (delta != null && delta >= 5) recentFlags.push('近期進步');
  if (delta != null && delta <= -5) recentFlags.push('近期下滑');
  if (lowScoreCount >= 2) recentFlags.push('連續低分');
  if ((parseFloat(latest.recoveryScore) || 100) < 60 || (parseFloat(latest.sleepHours) || 8) < 6.5) recentFlags.push('恢復不足');
  if ((parseFloat(latest.moodIndex) || 5) <= 2) recentFlags.push('情緒起伏');
  return {
    name: name || latest.name || '',
    rangeDays: rangeDays || 7,
    records: records,
    latest: latest,
    scoreMin: totals.length ? Math.min.apply(null, totals) : null,
    scoreMax: totals.length ? Math.max.apply(null, totals) : null,
    recentTrend: delta == null ? '資料不足' : (delta > 2 ? '上升' : (delta < -2 ? '下降' : '穩定')),
    scoreDelta: delta,
    averageScore: avgs.length ? round1(averageNumber(avgs)) : (latest.averageScore || ''),
    strongestArea: area.strongest ? area.strongest.label : '',
    weakestArea: area.weakest ? area.weakest.label : '',
    areaStats: area.stats,
    reflection: latest.reflection || '',
    tomorrowGoal: latest.tomorrowGoal || '',
    mood: latest.mood || latest.moodIndex || '',
    sleep: latest.sleepHours || latest.sleepQuality || '',
    recovery: latest.recoveryScore || '',
    nutrition: latest.nutritionRisks || latest.nutritionAdviceCoach || latest.nutritionAdviceParent || '',
    recentFlags: recentFlags,
    coachStyleText: getCoachAiStyleText()
  };
}
function coachPerformanceSummaryHtml(ctx) {
  const lines = [];
  if (ctx.scoreMin != null && ctx.scoreMax != null) lines.push(`近${ctx.rangeDays}天總分約落在 ${ctx.scoreMin}～${ctx.scoreMax}`);
  if (ctx.averageScore) lines.push(`平均分約 ${ctx.averageScore}`);
  if (ctx.scoreDelta != null) lines.push(`最近趨勢：${ctx.recentTrend}${ctx.scoreDelta ? `（${ctx.scoreDelta > 0 ? '+' : ''}${ctx.scoreDelta}）` : ''}`);
  if (ctx.strongestArea) lines.push(`相對穩定：${ctx.strongestArea}`);
  if (ctx.weakestArea) lines.push(`優先補強：${ctx.weakestArea}`);
  if (ctx.reflection) lines.push(`上次心得提到：${ctx.reflection}`);
  if (ctx.tomorrowGoal) lines.push(`明日目標是：${ctx.tomorrowGoal}`);
  if (ctx.recentFlags.length) lines.push(`提醒標籤：${ctx.recentFlags.join('、')}`);
  if (!lines.length) lines.push('目前資料不足，建議先以最近一筆紀錄和現場觀察回覆。');
  return `<div class="coach-reply-summary"><b>AI摘要</b><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>`;
}
function pickCoachReplyType(ctx) {
  const weak = ctx.weakestArea || '';
  if (ctx.recentFlags.indexOf('近期下滑') !== -1 || ctx.recentFlags.indexOf('連續低分') !== -1) return 'decline';
  if (ctx.recentFlags.indexOf('恢復不足') !== -1) return 'recovery';
  if (ctx.recentFlags.indexOf('情緒起伏') !== -1 || weak.indexOf('情緒') !== -1) return 'emotion';
  if (weak.indexOf('專注') !== -1) return 'focus';
  if (weak.indexOf('體能') !== -1 || weak.indexOf('體重') !== -1) return 'physical';
  if (weak.indexOf('自律') !== -1) return 'discipline';
  if (ctx.tomorrowGoal) return 'goal';
  if (ctx.recentFlags.indexOf('近期進步') !== -1) return 'improve';
  if (!ctx.records || ctx.records.length < 2) return 'encouragement';
  return 'stable';
}
function fillCoachReplyTemplate(tpl, ctx) {
  return tpl
    .replace(/\{name\}/g, ctx.name || '你')
    .replace(/\{rangeDays\}/g, ctx.rangeDays || 7)
    .replace(/\{weakest\}/g, ctx.weakestArea || '細節')
    .replace(/\{strongest\}/g, ctx.strongestArea || '穩定的地方')
    .replace(/\{goal\}/g, ctx.tomorrowGoal || '今天的目標');
}
function generateCoachReplyFallback(ctx, mode) {
  const type = pickCoachReplyType(ctx);
  const bank = COACH_REPLY_TEMPLATE_BANK[type] || COACH_REPLY_TEMPLATE_BANK.stable;
  const seed = Math.abs(((ctx.name || '').length * 7) + ((ctx.records || []).length * 3) + (ctx.scoreDelta || 0));
  const offset = mode === 'rewrite' ? 1 : (mode === 'coachStyle' ? 2 : 0);
  let text = fillCoachReplyTemplate(bank[(seed + offset) % bank.length], ctx);
  if (mode === 'coachStyle') text = text.replace(/接下來/g, '接著').replace(/教練要你/g, '我希望你').replace(/這是好事/g, '這點可以');
  return text;
}
async function generateCoachReplyFromPerformance(playerContext, mode) {
  const ctx = playerContext || {};
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'aiCoachPerformanceReply', context: ctx, mode: mode || 'default' });
      if (res && res.ok && res.replyText) return { text: res.replyText, source: 'ai' };
      if (res && res.ok && res.data && res.data.replyText) return { text: res.data.replyText, source: 'ai' };
    } catch (e) { /* fallback */ }
    try {
      const record = Object.assign({}, ctx.latest || {}, {
        name: ctx.name,
        _statusLabel: ctx.recentTrend,
        aiTags: [
          `近${ctx.rangeDays}天平均 ${ctx.averageScore || '-'}`,
          ctx.strongestArea ? `穩定：${ctx.strongestArea}` : '',
          ctx.weakestArea ? `補強：${ctx.weakestArea}` : '',
          ctx.recentFlags && ctx.recentFlags.length ? `提醒：${ctx.recentFlags.join('、')}` : ''
        ].filter(Boolean).join('；'),
        reflection: ctx.reflection,
        tomorrowGoal: ctx.tomorrowGoal
      });
      const res = await postToWebApp({ action: 'aiCoachFeedback', record: record });
      if (res && res.ok && res.versions && res.versions.student) {
        const v = res.versions.student;
        const text = [v.affirm, v.watch, v.oneThing ? `今天方向：${v.oneThing}` : '', v.quote ? `「${v.quote}」` : ''].filter(Boolean).join(' ');
        if (text.trim()) return { text: text.trim(), source: 'ai' };
      }
    } catch (e) { /* fallback */ }
  }
  return { text: generateCoachReplyFallback(ctx, mode || 'default'), source: 'fallback' };
}
function coachReplyLineText(ctx, reply) {
  return `TeamPro 教練回覆
選手：${ctx.name}
觀察區間：近${ctx.rangeDays}天

教練回覆：
${reply}

繼續照這個方向調整，穩穩把自己拉上來。`;
}
function renderCoachPerformanceReplyAssistant(name, rec, history, rangeDays) {
  const card = $id('coachReplyAssistantCard');
  const box = $id('coachReplyAssistant');
  if (!card || !box) return;
  const role = (getRole() || {}).role;
  if (role !== 'coach') { card.style.display = 'none'; box.innerHTML = ''; return; }
  const ctx = buildCoachPerformanceContext(name, rec, history || [], rangeDays || 7);
  card.style.display = 'block';
  const saved = (rec && rec.coachReply) || generateCoachReplyFallback(ctx, 'default');
  box.innerHTML = `
    <h3 class="card-title">🧑‍🏫 教練回覆助手</h3>
    <div class="review-row"><span class="review-label">選手</span><span class="review-value">${escapeHtml(ctx.name || '-')}</span></div>
    <div class="review-row"><span class="review-label">區間</span><span class="review-value">近${ctx.rangeDays}天</span></div>
    ${coachPerformanceSummaryHtml(ctx)}
    <div class="coach-reply-ai-actions">
      <button type="button" class="coach-reply-ai-btn primary" data-coach-reply-ai="default">⚡ AI代擬回覆</button>
      <button type="button" class="coach-reply-ai-btn" data-coach-reply-ai="rewrite">換一句</button>
      <button type="button" class="coach-reply-ai-btn" data-coach-reply-ai="coachStyle">✏️ 用我的語氣</button>
    </div>
    <textarea id="coachReplyDraft" class="coach-reply-textarea" placeholder="AI 代擬後可直接修改，再複製、分享或儲存。">${escapeHtml(saved)}</textarea>
    <div class="coach-reply-actions">
      <button type="button" class="btn btn-secondary" id="btnCopyCoachReply">複製回覆</button>
      <button type="button" class="btn btn-primary" id="btnLineCoachReply">分享 LINE</button>
      <button type="button" class="btn btn-primary" id="btnSaveCoachReply">✅ 儲存教練回覆</button>
    </div>`;
  box.querySelectorAll('[data-coach-reply-ai]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-coach-reply-ai') || 'default';
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = '產生中...';
      const ta = $id('coachReplyDraft');
      try {
        const result = await generateCoachReplyFromPerformance(ctx, mode);
        if (ta) {
          ta.value = result.text || generateCoachReplyFallback(ctx, mode);
          ta.dataset.generatedByAi = result.source === 'ai' ? 'true' : 'false';
        }
        toast(result.source === 'ai' ? '✨ AI 已代擬回覆' : 'AI 未啟用或呼叫失敗，已使用內建模板');
      } catch (e) {
        if (ta) {
          ta.value = generateCoachReplyFallback(ctx, mode);
          ta.dataset.generatedByAi = 'false';
        }
        toast('AI 代擬失敗，已使用內建模板');
      }
      btn.disabled = false; btn.textContent = old;
    });
  });
  const copyBtn = $id('btnCopyCoachReply');
  if (copyBtn) copyBtn.addEventListener('click', () => copyText(($id('coachReplyDraft') || {}).value || ''));
  const lineBtn = $id('btnLineCoachReply');
  if (lineBtn) lineBtn.addEventListener('click', () => {
    const text = (($id('coachReplyDraft') || {}).value || '').trim();
    if (!text) { toast('請先輸入教練回覆'); return; }
    window.open('https://line.me/R/msg/text/?' + encodeURIComponent(coachReplyLineText(ctx, text)), '_blank');
  });
  const saveBtn = $id('btnSaveCoachReply');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const text = (($id('coachReplyDraft') || {}).value || '').trim();
    if (!text) { toast('請先輸入教練回覆'); return; }
    saveBtn.disabled = true; saveBtn.textContent = '儲存中...';
    const ta = $id('coachReplyDraft');
    const row = {
      timestamp: new Date().toISOString(),
      studentName: ctx.name,
      recordDate: rec ? rec.date : '',
      rangeDays: ctx.rangeDays ? `近${ctx.rangeDays}天` : '近7天',
      sourceRecordId: rec ? rec.recordId : '',
      summaryText: (box.querySelector('.coach-reply-summary') || {}).textContent || '',
      replyText: text,
      generatedByAI: ta && ta.dataset.generatedByAi === 'true',
      confirmedByCoach: true,
      createdBy: 'coach'
    };
    const ok = await saveCoachReplyRemote(row, rec);
    saveBtn.disabled = false; saveBtn.textContent = '✅ 儲存教練回覆';
    toast(ok ? '✅ 已儲存教練回覆，選手可在上次表現查看。' : '儲存失敗，請稍後再試。');
  });
}

async function loadLastPerfPage() {
  const name = $id('lastPerfName').value;
  if (!name) { toast('請選擇選手'); return; }
  toast('讀取中...');
  // 同時抓最近一筆與歷史（畫趨勢圖）
  const [rec, history] = await Promise.all([
    fetchLastRecord(name),
    fetchRecentRecords(name, 180)
  ]);
  const card = $id('lastPerfResultCard');
  const box = $id('lastPerfResult');
  const trendCard = $id('trendCard');
  const trendBox = $id('trendBox');
  const role = (getRole() || {}).role;

  // 七天成長趨勢圖
  if (trendCard && trendBox) {
    if (role === 'coach') {
      renderTrendSection(trendBox, history || []);
      trendCard.style.display = 'block';
    } else {
      trendCard.style.display = 'none';
      trendBox.innerHTML = '';
    }
  }

  if (!rec) {
    box.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。</div>`;
    card.style.display = 'block';
    renderCoachPerformanceReplyAssistant(name, null, history || [], 7);
    return;
  }
  // 重用回顧渲染（但不影響填寫頁的改善區）
  renderLastReviewInto(rec, box);
  card.style.display = 'block';
  const inlineTrend = $id('lastPerfTrendInline');
  if (inlineTrend) renderTrendSection(inlineTrend, history || []);
  await renderStudentCoachReplyCard(name, rec, box);
  renderCoachPerformanceReplyAssistant(name, rec, history || [rec], 7);
}

/* ============================================================
   12.5 個人週報（純前端現算，不寫入 Sheet、不動後端）
   ------------------------------------------------------------
   撈最近紀錄 → 篩出近 7 天 → 算出席/KPI/身體恢復/心情/飲食五段，
   並產生可一鍵複製的「家長版 LINE 週報」。
   ============================================================ */

// 今天往前 n 天的 yyyy-mm-dd
function daysAgoYmd(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
  return ymd(d);
}

async function loadWeeklyReport() {
  const name = $id('lastPerfName').value;
  if (!name) { toast('請先選擇選手'); return; }
  toast('產生本週報告中...');
  const [history, leaves] = await Promise.all([
    fetchRecentRecords(name, 60),
    fetchAttendanceReports(name, 60).catch(() => [])
  ]);
  const rpt = buildWeeklyReport(name, history || [], leaves || []);
  const card = $id('weeklyReportCard');
  const box = $id('weeklyReportBox');
  box.innerHTML = rpt.html;
  card.style.display = 'block';
  const copyBtn = $id('btnCopyWeeklyLine');
  if (copyBtn) { copyBtn.style.display = rpt.lineText ? '' : 'none'; copyBtn.onclick = () => copyText(rpt.lineText); }
  const printBtn = $id('btnPrintWeekly');
  if (printBtn) { printBtn.style.display = rpt.lineText ? '' : 'none'; printBtn.onclick = () => window.print(); }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 取一組紀錄某欄位的數字（過濾掉空值）
function weeklyNums(arr, key) {
  return arr.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
}
function weeklyMean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

function buildWeeklyReport(name, history, leaves) {
  const today = ymd(new Date());
  const wkStart = daysAgoYmd(6);            // 近 7 天（含今天）
  const pvStart = daysAgoYmd(13), pvEnd = daysAgoYmd(7); // 對比的上一週

  const all = dedupeLatestByDate(history);  // 新→舊，每天一筆
  const inWk = d => d >= wkStart && d <= today;
  const week = all.filter(r => inWk(normDate(r.date)));
  const prev = all.filter(r => { const d = normDate(r.date); return d >= pvStart && d <= pvEnd; });
  const leaveWeek = (leaves || []).filter(r => inWk(normDate(r.date)));

  const range = `${dateSlash(wkStart)} ~ ${dateSlash(today)}`;

  // 完全沒資料
  if (!week.length && !leaveWeek.length) {
    return {
      html: `<h3 class="card-title">📊 ${escapeHtml(name)}｜本週報告</h3>
        <div class="wk-range">${range}</div>
        <div class="hint-box">本週還沒有任何紀錄。每天送出一筆，週報就會自動長出 5 條成長曲線 🌱</div>`,
      lineText: ''
    };
  }

  const oldToNew = week.slice().reverse(); // 舊→新，方便看趨勢
  const latest = week[0];                  // 本週最新一筆

  // ── ① 出席 ──
  const trainDays = week.length, leaveDays = leaveWeek.length;

  // ── ② KPI ──
  const wkAvg = weeklyMean(weeklyNums(week, 'averageScore'));
  const pvAvg = weeklyMean(weeklyNums(prev, 'averageScore'));
  let avgTrend = '';
  if (wkAvg != null && pvAvg != null) {
    const d = round1(wkAvg - pvAvg);
    avgTrend = d > 0 ? `較上週上升 ${d}` : (d < 0 ? `較上週下降 ${Math.abs(d)}` : '與上週持平');
  }
  // 各面向本週平均、與上週差
  const aspectStat = ASPECT_ORDER.map(k => {
    const cur = weeklyMean(weeklyNums(week, ASPECT_AVG_FIELD[k]));
    const old = weeklyMean(weeklyNums(prev, ASPECT_AVG_FIELD[k]));
    return { k, label: KPI_ASPECTS[k].label, cur, diff: (cur != null && old != null) ? round1(cur - old) : null };
  }).filter(a => a.cur != null);
  let weakest = null, mostImproved = null;
  aspectStat.forEach(a => {
    if (!weakest || a.cur < weakest.cur) weakest = a;
    if (a.diff != null && a.diff > 0 && (!mostImproved || a.diff > mostImproved.diff)) mostImproved = a;
  });
  const wkStatus = wkAvg != null ? judgeStatus(wkAvg) : '—';

  // ── ③ 身體與恢復 ──
  const wSeries = oldToNew.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wFirst = wSeries.length ? wSeries[0] : null;
  const wLast = wSeries.length ? wSeries[wSeries.length - 1] : null;
  const wDiff = (wFirst != null && wLast != null) ? round1(wLast - wFirst) : null;
  const gap = parseFloat(latest && latest.weightGap);
  const recMean = weeklyMean(weeklyNums(week, 'recoveryScore'));
  const highLoadDays = week.filter(r => parseFloat(r.rpe) >= 8 || parseFloat(r.soreness) >= 4).length;
  const lowSleepDays = week.filter(r => { const s = parseFloat(r.sleepHours); return !isNaN(s) && s < 7; }).length;
  let recTone = 'good', recWord = '恢復良好';
  if (recMean != null) {
    if (recMean < 60) { recTone = 'bad'; recWord = '恢復偏差，注意過度訓練'; }
    else if (recMean < 75) { recTone = 'warn'; recWord = '恢復普通，留意睡眠與負荷'; }
  }

  // ── ④ 心情 ──
  const moodVals = week.map(r => parseFloat(r.moodIndex)).filter(v => !isNaN(v));
  const moodMean = weeklyMean(moodVals);
  const lowMoodDays = moodVals.filter(v => v <= 2).length;
  const suggestSolace = lowMoodDays >= 2 || (latest && parseFloat(latest.moodIndex) <= 2);

  // ── ⑤ 飲食 ──
  const riskDays = week.filter(r => String(r.nutritionRisks || '').trim()).length;
  const snackDays = week.filter(r => /有/.test(String(r.lateNightSnack || ''))).length;
  const lowWaterDays = week.filter(r => /少於 500|500-1000/.test(String(r.waterIntake || ''))).length;
  let foodTip = '飲食習慣穩定，繼續保持均衡。';
  if (snackDays >= 2) foodTip = `本週宵夜 ${snackDays} 天，睡前盡量改成水或無糖豆漿。`;
  else if (lowWaterDays >= 2) foodTip = `本週有 ${lowWaterDays} 天水量偏少，訓練日記得多補水。`;
  else if (riskDays >= 2) foodTip = '有幾天飲食有小提醒，多補蛋白質與蔬菜會更好。';

  // ── 🎯 下週小目標 ──
  const nextGoal = weakest
    ? `下週把「${weakest.label}」再往上推 0.5 分（本週 ${round1(weakest.cur)}）。`
    : '維持每天紀錄，讓成長被看見。';

  /* ---------- HTML ---------- */
  const tone = t => t === 'good' ? 'wk-good' : (t === 'warn' ? 'wk-warn' : 'wk-bad');
  const fmt = (v, suffix) => v == null ? '—' : (round1(v) + (suffix || ''));
  let h = `<h3 class="card-title">📊 ${escapeHtml(name)}｜本週報告</h3><div class="wk-range">${range}</div>`;

  // ① 出席
  h += `<div class="wk-sec"><div class="wk-sec-h">✅ 本週出席</div>
    <div class="wk-stat-row">
      <div class="wk-stat"><span class="wk-num">${trainDays}</span><span class="wk-cap">訓練天數</span></div>
      <div class="wk-stat"><span class="wk-num">${leaveDays}</span><span class="wk-cap">請假天數</span></div>
    </div></div>`;

  // ② KPI
  h += `<div class="wk-sec"><div class="wk-sec-h">📈 KPI 表現</div>
    <div class="review-row"><span class="review-label">本週均分</span><span class="review-value">${fmt(wkAvg, ' / 5')}　${wkStatus}</span></div>`;
  if (avgTrend) h += `<div class="review-row"><span class="review-label">與上週比</span><span class="review-value ${wkAvg >= (pvAvg || 0) ? 'up' : 'down'}">${avgTrend}</span></div>`;
  if (mostImproved) h += `<div class="review-row"><span class="review-label">最進步面向</span><span class="review-value up">💪 ${mostImproved.label}（+${mostImproved.diff}）</span></div>`;
  if (weakest) h += `<div class="review-row"><span class="review-label">最該加強</span><span class="review-value">🎯 ${weakest.label}（${round1(weakest.cur)}）</span></div>`;
  h += `</div>`;

  // ③ 身體與恢復
  h += `<div class="wk-sec"><div class="wk-sec-h">💪 身體與恢復</div>`;
  if (wFirst != null) {
    const dTxt = wDiff > 0 ? `+${wDiff}` : (wDiff < 0 ? `${wDiff}` : '持平');
    h += `<div class="review-row"><span class="review-label">體重變化</span><span class="review-value">${round1(wFirst)} → ${round1(wLast)} kg（${dTxt}）</span></div>`;
  }
  if (!isNaN(gap)) {
    const gTxt = gap > 0 ? `距目標還差 ${round1(gap)} kg` : (gap < 0 ? `已低於目標 ${round1(Math.abs(gap))} kg` : '剛好達標');
    h += `<div class="review-row"><span class="review-label">目標體重</span><span class="review-value">${gTxt}</span></div>`;
  }
  if (recMean != null) h += `<div class="review-row"><span class="review-label">恢復指數</span><span class="review-value ${tone(recTone)}">${Math.round(recMean)} / 100　${recWord}</span></div>`;
  if (highLoadDays || lowSleepDays) h += `<div class="review-row"><span class="review-label">負荷提醒</span><span class="review-value">高負荷 ${highLoadDays} 天 · 睡眠不足 ${lowSleepDays} 天</span></div>`;
  if (recTone === 'bad') h += `<div class="hint-box wk-bad-box">⚠️ 本週恢復偏低，建議安排恢復日、顧好睡眠，必要時與教練討論調整訓練量。</div>`;
  h += `</div>`;

  // ④ 心情
  if (moodVals.length) {
    h += `<div class="wk-sec"><div class="wk-sec-h">🙂 心情曲線</div>
      <div class="review-row"><span class="review-label">本週平均</span><span class="review-value">${fmt(moodMean, ' / 5')}　${moodMean != null ? moodMeta(Math.round(moodMean)).emoji : ''}</span></div>`;
    if (lowMoodDays) h += `<div class="review-row"><span class="review-label">低落天數</span><span class="review-value ${lowMoodDays >= 2 ? 'wk-warn' : ''}">${lowMoodDays} 天</span></div>`;
    if (suggestSolace) h += `<div class="hint-box wk-warn-box">本週心情有點起伏，建議主動和教練、家長或可信任的師長談談。</div>`;
    h += `</div>`;
  }

  // ⑤ 飲食
  h += `<div class="wk-sec"><div class="wk-sec-h">🍱 飲食提醒</div>
    <div class="wk-stat-row">
      <div class="wk-stat"><span class="wk-num">${riskDays}</span><span class="wk-cap">有提醒天數</span></div>
      <div class="wk-stat"><span class="wk-num">${snackDays}</span><span class="wk-cap">宵夜天數</span></div>
      <div class="wk-stat"><span class="wk-num">${lowWaterDays}</span><span class="wk-cap">水量不足</span></div>
    </div>
    <div class="hint-box">${foodTip}</div></div>`;

  // 🎯 下週小目標
  h += `<div class="hint-box good wk-goal">🎯 下週小目標：${nextGoal}</div>`;

  /* ---------- 家長版 LINE 文字 ---------- */
  const L = [];
  L.push(`🥋 ${name}｜本週訓練週報`);
  L.push(`📅 ${range}`);
  L.push('');
  L.push(`✅ 出席：訓練 ${trainDays} 天、請假 ${leaveDays} 天`);
  if (wkAvg != null) L.push(`📊 本週狀態：均分 ${round1(wkAvg)} / 5　${wkStatus.replace(/^[^ ]+ /, '')}${avgTrend ? `（${avgTrend}）` : ''}`);
  if (mostImproved) L.push(`💪 最進步：${mostImproved.label}（+${mostImproved.diff}）`);
  if (weakest) L.push(`🎯 可再加強：${weakest.label}`);
  if (wFirst != null) L.push(`⚖️ 體重：${round1(wFirst)} → ${round1(wLast)} kg（${wDiff > 0 ? '+' : ''}${wDiff}）`);
  if (recMean != null) L.push(`😴 恢復指數：${Math.round(recMean)} / 100（${recWord}）`);
  if (moodMean != null) L.push(`🙂 心情：平均 ${round1(moodMean)} / 5${lowMoodDays >= 2 ? '，本週較有起伏，再多陪伴一下' : ''}`);
  L.push(`🍱 飲食：${foodTip}`);
  L.push(`🎯 下週小目標：${nextGoal}`);
  L.push('');
  L.push('—— 育林國中跆拳道隊');

  return { html: h, lineText: L.join('\n') };
}

function renderLastReviewInto(rec, box) {
  const avg = aspectAvgFromRecord(rec);
  const lowItems = parseLowItems(rec);
  let html = `<div class="lastperf-sections">
    <section class="lastperf-section">
      <h3 class="card-title">🧑‍🏫 教練給我的回覆</h3>
      <div id="studentCoachReplyMount"></div>
    </section>
    <section class="lastperf-section">
      <h3 class="card-title">🎯 這次我要修正什麼</h3>
      <div class="hint-box">${escapeHtml(buildRemindText(lowItems))}</div>
    </section>
    <section class="lastperf-section">
      <h3 class="card-title">📈 近 7 天成長趨勢</h3>
      <div id="lastPerfTrendInline"></div>
    </section>
    <details class="lastperf-section lastperf-details" open>
      <summary>📌 上次紀錄回顧</summary>`;
  html += `<h3 class="card-title">📌 上次紀錄回顧</h3>`;
  html += `<div class="review-row"><span class="review-label">上次日期</span><span class="review-value">${dateSlash(rec.date)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${scoreMaxText(rec)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${rec.status}</span></div>`;
  html += `<div class="aspect-grid" style="margin-top:10px">`;
  presentAspectKeysFromRecord(rec).forEach(k => html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`);
  html += `</div>`;
  // 雷達圖移至「選手成長卡」做平均 vs 上次疊圖，此處保留六格數字即可，避免重複
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;

  // 當日飲食狀況（給家長看孩子每天吃什麼＋家長版建議）
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">🍱 當日飲食狀況</h4>`;
  const mealRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${escapeHtml(val || '—').replace(/\n/g, '<br>')}</span></div>`;
  const foodRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${mealValueHtml(val)}</span></div>`;
  html += foodRow('早餐', rec.breakfast);
  html += foodRow('午餐', rec.lunch);
  html += foodRow('晚餐', rec.dinner);
  if (rec.snacksDrinks) html += foodRow('點心／飲料', rec.snacksDrinks);
  html += mealRow('今日水量', rec.waterIntake);
  html += mealRow('宵夜', rec.lateNightSnack);
  html += mealRow('訓練強度', rec.trainingIntensity);
  html += `<div class="review-row"><span class="review-label">飲食風險</span><span class="review-value">${rec.nutritionRisks || '無明顯風險'}</span></div>`;
  if (rec.nutritionAdviceParent) {
    html += `<div class="hint-box">${escapeHtml(rec.nutritionAdviceParent).replace(/\n/g, '<br>')}</div>`;
  }

  // 自由品勢額外紀錄
  html += freestyleExtraHtml(rec);

  if (lowItems.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次最低三項</h4><div>`;
    lowItems.forEach((s, i) => html += `<span class="tag tag-red">${i + 1}. ${s}</span>`);
    html += `</div>`;
  }
  html += `<div class="hint-box">📣 ${buildRemindText(lowItems)}</div>`;

  // 計算透明化
  html += explainStatusFromRecord(rec);

  // 自評 vs 教練評
  html += renderSelfVsCoach(rec);

  if (rec.reflection) html += `<div class="hint-box">📝 上次心得：${escapeHtml(rec.reflection)}</div>`;
  if (rec.tomorrowGoal) html += `<div class="hint-box good">🎯 上次明日目標：${escapeHtml(rec.tomorrowGoal)}</div>`;

  html += `</details>
    <section class="lastperf-section">
      <h3 class="card-title">💬 我想補充給教練</h3>`;

  // 回應區依身分分流：家長用獨立「家長留言」欄，不覆蓋學生的自我回應
  const viewRole = (getRole() || {}).role;
  if (rec.recordId) {
    if (viewRole === 'parent') {
      if (rec.studentResponse) html += `<div class="hint-box">💬 孩子的看法：${escapeHtml(rec.studentResponse)}</div>`;
      html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💬 家長留言給教練</h4>`;
      html += `<textarea id="parentNoteBox" class="text-input" rows="2" placeholder="想讓教練知道的狀況，例如：最近睡得比較少、這週鼻子過敏…">${escapeHtml(rec.parentNote || '')}</textarea>`;
      html += `<button type="button" id="btnSendParentNote" class="btn btn-secondary" style="margin-top:8px">📨 送出給教練</button>`;
      html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:6px">這是家長與教練的溝通，不會蓋掉孩子的自我紀錄。</div>`;
    } else {
      html += `<textarea id="studentResponseBox" class="text-input" rows="2" placeholder="例如：核心穩定我覺得不只 2 分，因為今天…">${escapeHtml(rec.studentResponse || '')}</textarea>`;
      html += `<button type="button" id="btnSendStudentResponse" class="btn btn-secondary" style="margin-top:8px">📨 送出補充</button>`;
      html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:6px">這裡是讓你說明想法，幫助教練了解你，不是用來改分數。</div>`;
      if (rec.parentNote) html += `<div class="hint-box" style="margin-top:10px">👨‍👩‍👧 家長留言：${escapeHtml(rec.parentNote)}</div>`;
    }
  } else {
    html += `<div class="hint-box" style="color:var(--text-soft)">這是較早的紀錄，無法回應（新版紀錄才支援交叉辯論）。</div>`;
  }
  html += `</section></div>`;

  box.innerHTML = html;

  // 綁定：選手送出看法
  const btn = $id('btnSendStudentResponse');
  if (btn) {
    btn.addEventListener('click', async () => {
      const text = $id('studentResponseBox').value.trim();
      btn.disabled = true; btn.textContent = '送出中...';
      const ok = await updateRecordRemote(rec.recordId, { studentResponse: text });
      btn.disabled = false; btn.textContent = '📨 送出補充';
      toast(ok ? '✅ 已送出你的看法，教練會看到' : '⚠️ 送出失敗，請稍後再試');
    });
  }
  // 綁定：家長留言給教練
  const pbtn = $id('btnSendParentNote');
  if (pbtn) {
    pbtn.addEventListener('click', async () => {
      const text = $id('parentNoteBox').value.trim();
      pbtn.disabled = true; pbtn.textContent = '送出中...';
      const ok = await updateRecordRemote(rec.recordId, { parentNote: text });
      pbtn.disabled = false; pbtn.textContent = '📨 送出給教練';
      toast(ok ? '✅ 已送出給教練' : '⚠️ 送出失敗，請稍後再試');
    });
  }
}

