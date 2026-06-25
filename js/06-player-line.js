/* ============================================================
   選手成長卡（養成型｜段位 / 連續火焰 / 生涯數據 / 能力雷達 / 座右銘）
   ------------------------------------------------------------
   讓學生每天打開就先看到「自己這個角色」養成到哪：用連續火焰製造
   不想斷的動力、用段位與能力雷達製造「我在變強」的養成感。
   段位以「累積訓練天數」決定（重堅持、重努力，不以分數論英雄）。
   ============================================================ */
const PLAYER_BELTS = [
  { min: 0,   name: '見習生', belt: '白帶',   color: '#d8dde6', icon: '🥋' },
  { min: 5,   name: '練習生', belt: '黃帶',   color: '#f1c40f', icon: '🥋' },
  { min: 15,  name: '修行者', belt: '綠帶',   color: '#2ecc71', icon: '🥋' },
  { min: 30,  name: '好手',   belt: '藍帶',   color: '#2e7dd1', icon: '🥋' },
  { min: 50,  name: '強者',   belt: '紅帶',   color: '#e23b3b', icon: '🥋' },
  { min: 80,  name: '高手',   belt: '紅黑帶', color: '#e67e22', icon: '🥋' },
  { min: 120, name: '隊長級', belt: '黑帶',   color: '#f5c518', icon: '🏅' }
];
function computeBelt(days) {
  let cur = PLAYER_BELTS[0];
  for (let i = 0; i < PLAYER_BELTS.length; i++) { if (days >= PLAYER_BELTS[i].min) cur = PLAYER_BELTS[i]; }
  const idx = PLAYER_BELTS.indexOf(cur);
  return { cur: cur, next: PLAYER_BELTS[idx + 1] || null, idx: idx };
}

// 連續紀錄天數：從今天往回數（今天還沒填則從昨天起算，紀錄尚未斷）
function computeStreak(dateSet) {
  let streak = 0;
  const cur = new Date(todayStr() + 'T00:00:00');
  if (!dateSet[ymd(cur)]) cur.setDate(cur.getDate() - 1);
  while (dateSet[ymd(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}

function appKeyMotto(name) { return 'motto:' + name; }

function pcTile(icon, label, val) {
  return `<div class="pc-tile"><div class="pc-tile-icon">${icon}</div>` +
    `<div class="pc-tile-val">${escapeHtml(String(val))}</div><div class="pc-tile-label">${escapeHtml(label)}</div></div>`;
}

async function renderPlayerCard(name) {
  const card = $id('playerCard');
  if (!card) return;
  if (!name) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  $id('playerCardBody').innerHTML = '<div class="hint-box">讀取你的選手卡中…</div>';

  let recs = [];
  try { recs = dedupeLatestByDate((await fetchRecentRecords(name, 90)) || []); } catch (e) { recs = []; }
  const training = recs.filter(r => !isAbsenceRecord(r));

  const dateSet = {};
  recs.forEach(r => { dateSet[normDate(r.date)] = true; });
  const streak = computeStreak(dateSet);
  const trainingDays = new Set(training.map(r => normDate(r.date))).size;
  const ym = todayStr().slice(0, 7);
  const monthCount = training.filter(r => normDate(r.date).slice(0, 7) === ym).length;

  // 個人最佳（PB）
  let pb = 0, pbMax = 50;
  training.forEach(r => { const t = parseFloat(r.totalScore) || 0; if (t > pb) { pb = t; pbMax = recordScoreMax(r); } });

  // 近期戰力（近 30 筆平均）
  const avgs = training.slice(0, 30).map(r => parseFloat(r.averageScore)).filter(v => !isNaN(v));
  const recentAvg = avgs.length ? round1(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
  const power = Math.round(recentAvg * 20);

  // 生涯能力平均（給雷達）
  const avgRec = {};
  ASPECT_ORDER.forEach(k => {
    const field = ASPECT_AVG_FIELD[k];
    const vals = training.map(r => parseFloat(r[field])).filter(v => !isNaN(v) && v > 0);
    avgRec[field] = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  const belt = computeBelt(trainingDays);
  const todayDone = !!dateSet[todayStr()];

  let html = '';
  // Hero：頭像（段位色）＋姓名＋段位＋戰力＋連續火焰
  html += `<div class="pc-hero">
    <div class="pc-avatar" style="border-color:${belt.cur.color};box-shadow:0 0 14px ${belt.cur.color}55">${belt.cur.icon}</div>
    <div class="pc-hero-info">
      <div class="pc-name">${escapeHtml(name)}</div>
      <div class="pc-belt" style="color:${belt.cur.color}">${belt.cur.belt}・${belt.cur.name}</div>
      <div class="pc-power">⚡ 戰力 ${power}　<span class="pc-power-sub">近期平均 ${recentAvg}/5</span></div>
    </div>
    <div class="pc-streak ${streak > 0 ? 'on' : ''}">
      <div class="pc-streak-num">${streak}</div>
      <div class="pc-streak-label">🔥 連續天數</div>
    </div>
  </div>`;

  // 今日提醒（製造不想斷的動力）
  if (todayDone) html += `<div class="pc-today done">✅ 今天已完成紀錄，火焰 +1，明天見！</div>`;
  else if (streak > 0) html += `<div class="pc-today">🔥 今天還沒填！填完就能延續你的 <b>${streak}</b> 天連續紀錄，別讓它斷在今天。</div>`;
  else html += `<div class="pc-today">✍️ 今天填一筆，點燃你的第一道連續火焰，開始養成自己的選手卡。</div>`;

  // 生涯數據
  html += `<div class="pc-stats">
    ${pcTile('🗓️', '生涯訓練天數', trainingDays)}
    ${pcTile('📅', '本月已填', monthCount + ' 次')}
    ${pcTile('🏆', '個人最佳', pb ? (pb + ' / ' + pbMax) : '—')}
  </div>`;

  // 段位進度
  if (belt.next) {
    const span = belt.next.min - belt.cur.min;
    const done = trainingDays - belt.cur.min;
    const pct = Math.max(4, Math.min(100, Math.round(done / span * 100)));
    const remain = belt.next.min - trainingDays;
    html += `<div class="pc-prog">
      <div class="pc-prog-bar"><span style="width:${pct}%;background:${belt.next.color}"></span></div>
      <div class="pc-prog-label">再 <b>${remain}</b> 個訓練日 → 升上 <b style="color:${belt.next.color}">${belt.next.belt}・${belt.next.name}</b></div>
    </div>`;
  } else {
    html += `<div class="pc-prog-label" style="margin-top:10px">🏅 你已達最高段位，繼續守住這份堅持！</div>`;
  }

  // 能力養成雷達（生涯平均 vs 上次單筆 疊圖，一眼看出進退步）
  if (training.length) {
    const avgAspect = aspectAvgFromRecord(avgRec);
    const lastAspect = aspectAvgFromRecord(training[0]);  // training 已依日期由新到舊排序
    const hasLast = ASPECT_ORDER.some(k => lastAspect[k] > 0);
    html += `<h4 class="pc-sec">📊 我的能力養成</h4>`
      + radarChartSVG(avgAspect, hasLast ? lastAspect : null, { selfLabel: '平均', coachLabel: '上次' });
  }

  // 座右銘
  html += `<div id="pcMottoBox"></div>`;

  $id('playerCardBody').innerHTML = html;
  setupMotto(name);
}

// 座右銘：選手自己可編輯，教練／家長唯讀
function setupMotto(name) {
  const box = $id('pcMottoBox');
  if (!box) return;
  const editable = !isParentView() && !isCoachView();
  appGet(appKeyMotto(name), data => {
    if (!$id('pcMottoBox')) return;   // 期間可能已切換選手
    const motto = (data && data.text) ? data.text : '';
    if (editable) {
      box.innerHTML = `<label class="field-label">我的座右銘 ✍️</label>
        <div class="btn-group" style="margin-top:0">
          <input type="text" id="pcMottoInput" class="text-input" style="flex:1" maxlength="40" value="${escapeHtml(motto)}" placeholder="寫一句給自己的話，例如：比昨天更好一點" />
          <button type="button" id="pcMottoSave" class="btn btn-primary" style="flex:0 0 auto;min-width:60px">💾</button>
        </div>`;
      $id('pcMottoSave').addEventListener('click', async () => {
        const t = $id('pcMottoInput').value.trim();
        await appSet(appKeyMotto(name), { text: t });
        toast('✅ 已更新座右銘');
      });
    } else {
      box.innerHTML = motto ? `<div class="pc-motto">❝ ${escapeHtml(motto)} ❞</div>` : '';
    }
  });
}

/* ============================================================
   產生 LINE 四版本文字
   ============================================================ */
function buildLineTexts(rec, weightNote, affirm) {
  if (!rec._kpiEnabled) return buildBasicDailyLineTexts(rec, weightNote);
  const lowArr = rec._lowItemsArr || [];
  const lowLines = lowArr.map((l, i) => `${i + 1}. ${l.item}：${l.score} 分`).join('\n');
  const remind = buildRemindText(lowArr.map(l => `${l.item}：${l.score} 分`));
  const n = rec._nutrition;

  // 進步肯定（徽章 + 最強的一句具體肯定）
  let affirmBlock = '';
  if (affirm && (affirm.badges.length || affirm.lines.length)) {
    const parts = [];
    if (affirm.badges.length) parts.push('🌟 今日肯定：' + affirm.badges.map(b => b.icon + b.label).join('、'));
    if (affirm.lines.length) parts.push('🎉 ' + affirm.lines[0]);
    affirmBlock = '\n' + parts.join('\n') + '\n';
  }

  // 鼓勵隊友（學生有填才顯示）
  const encMsg = (rec.encouragementToTeammate || '').trim();
  const encName = (rec.encourageTeammateName || '').trim();
  const encourageTeammateBlock = encMsg
    ? `\n🤝 想對${encName ? ` ${encName} ` : '隊友'}說的話：\n${encMsg}\n`
    : '';

  // 選手版
  const studentLine =
`🥋 育林國中技擊隊｜每日 KPI 回饋

姓名：${rec.name}
日期：${dateSlash(rec.date)}
今日訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || rec.status}）
今日訓練方向：${rec.trainingDirection || '依教練安排調整'}
今日總分：${scoreMaxText(rec)}
平均分數：${rec.averageScore} / 5
${affirmBlock}
今天最低三項：

${lowLines || '今天沒有低於 3 分的項目，表現很穩！'}

今天提醒：

${remind}

🍱 今日飲食提醒：

${shortNutrition(n)}

明日目標：

${rec.tomorrowGoal || '把今天的重點再做穩一點。'}
${encourageTeammateBlock}
💪 ${encouragementByStatus(rec.status)}

📣 教練的話：${dailyPick(COACH_QUOTES)}

教練相信你，只要願意修正，就一定會進步。`;

  // 家長版
  const topTwo = lowArr.slice(0, 2).map(l => l.item).join('」與「');
  const parentLine =
`🥋 育林國中技擊隊｜今日訓練回饋

孩子今日訓練狀態為「${rec.readinessStatusLight || statusWord(rec.status)}」${topTwo ? `，主要訓練重點會放在「${topTwo}」` : '，整體表現穩定'}。

教練明天會依訓練準備度調整內容，請家長不用擔心。這不是排名，也不是處罰分數，而是協助孩子用更適合的方式訓練。

${n.parent}
${weightNote ? '\n⚖️ ' + weightNote + '\n' : ''}
只要願意每天修正一點，孩子的穩定度就會慢慢提升。`;

  // 教練版
  const aspectLines = presentAspectKeys(rec._aspectAvg).map(k => `${KPI_ASPECTS[k].label}：${rec._aspectAvg[k]}`).join('\n');
  const coachAdvice = lowArr.length
    ? `明日安排「${lowArr.map(l => l.item).join('、')}」個別修正。`
    : '明日維持訓練節奏，挑戰更高目標。';
  // 自由品勢額外紀錄（其他項目為空）
  let fsBlock = '';
  if (rec.group === FREESTYLE_GROUP) {
    const parts = [];
    if (String(rec.aerialKickCount || '').trim() !== '') parts.push(`空中踢擊完成 ${rec.aerialKickCount} 腳`);
    if (String(rec.landingErrors || '').trim() !== '') parts.push(`落地失誤 ${rec.landingErrors} 次`);
    if (String(rec.unlockedMoves || '').trim() !== '') parts.push(`解鎖：${rec.unlockedMoves}`);
    if (parts.length) fsBlock = '\n🤸 自由品勢：' + parts.join('　') + '\n';
  }
  const coachLine =
`📊 育林國中技擊隊｜KPI 教練紀錄

姓名：${rec.name}
日期：${dateSlash(rec.date)}
組別：${rec.group}${fsBlock}
狀態：${rec.status}
TeamPro AI 訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '--'}）
AI 標籤：${rec.aiTags || '無明顯特殊標籤'}
明日訓練方向：${rec.trainingDirection || '依教練安排調整'}
總分：${scoreMaxText(rec)}
平均：${rec.averageScore} / 5

面向平均：

${aspectLines}

最低三項：

${lowLines || '無'}

建議處理：

${coachAdvice}

🍱 飲食觀察：

今日訓練強度：${rec.trainingIntensity}
體重：${rec.weightKg} kg
BMI：${rec.bmi}

飲食問題：

${n.risks.length ? n.risks.map((r, i) => `${i + 1}. ${r}`).join('\n') : '無明顯風險'}

建議：

${n.coach.advice}${weightNote ? '\n\n⚖️ ' + weightNote : ''}`;

  // 純飲食版
  const nutritionLine =
`🍱 育林國中技擊隊｜今日飲食建議

姓名：${rec.name}
日期：${dateSlash(rec.date)}
訓練強度：${rec.trainingIntensity}
體重：${rec.weightKg} kg ／ BMI：${rec.bmi}

飲食風險：
${n.risks.length ? n.risks.map(r => '・' + r).join('\n') : '・無明顯風險'}

${n.student}

🎯 明日飲食小目標：
${n.nextGoal}`;

  return { student: studentLine, parent: parentLine, coach: coachLine, nutrition: nutritionLine };
}

function buildBasicDailyLineTexts(rec, weightNote) {
  const n = rec._nutrition;
  const student = `🥋 育林國中技擊隊｜每日訓練回報\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n` +
    `TeamPro AI 訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '資料累積中'}）\n` +
    `今日訓練方向：${rec.trainingDirection || '依教練安排調整'}\n身體狀況：${rec.bodyStatus || '未填'}\n今日心得：${rec.reflection || '已完成回報'}\n明日目標：${rec.tomorrowGoal || '未填'}\n\n` +
    `🍱 今日飲食提醒：\n${shortNutrition(n)}\n\n📣 教練的話：${dailyPick(COACH_QUOTES)}`;
  const parent = `🥋 育林國中技擊隊｜今日訓練回報\n\n${rec.name} 已完成今日訓練與身體狀態回報。\n訓練狀態：${rec.readinessStatusLight || '資料累積中'}。` +
    `${rec.bodyStatus ? '\n身體狀況：' + rec.bodyStatus : ''}${weightNote ? '\n⚖️ ' + weightNote : ''}\n\n${n.parent || ''}`;
  const coach = `📊 育林國中技擊隊｜每日訓練紀錄\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n組別：${rec.group}\n` +
    `訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '--'}）\nAI 標籤：${rec.aiTags || '無'}\n訓練方向：${rec.trainingDirection || '依教練安排調整'}\n` +
    `身體狀況：${rec.bodyStatus || '未填'}\n今日心得：${rec.reflection || '未填'}\n明日目標：${rec.tomorrowGoal || '未填'}\n\n` +
    `飲食問題：${n.risks && n.risks.length ? n.risks.join('、') : '無明顯風險'}`;
  const nutrition = `🍱 育林國中技擊隊｜今日飲食建議\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n\n${shortNutrition(n)}`;
  return { student: student, parent: parent, coach: coach, nutrition: nutrition };
}

function statusWord(status) {
  if (status.indexOf('紅') !== -1) return '稍微偏低';
  if (status.indexOf('黃') !== -1) return '中等';
  return '良好';
}
function shortNutrition(n) {
  if (!n.risks.length) return '今天飲食大致均衡，繼續保持！';
  const parts = [];
  if (n.risks.indexOf('水量不足') !== -1) parts.push('今天水量偏少');
  if (n.risks.indexOf('蛋白質不足') !== -1) parts.push('蛋白質可以再補一點');
  if (parts.length) return parts.join('，') + '。明天訓練前先補水，訓練後補充一份蛋白質，身體恢復會更好。';
  return '今天有幾項可以加強：' + n.risks.join('、') + '。明天再注意一下，恢復會更好。';
}

