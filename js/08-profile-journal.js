/* ============================================================
   12.8 選手個人檔案（功能四）＋ 家長週報（功能三）
   ============================================================ */
async function loadProfile() {
  const name = $id('profileName').value;
  const card = $id('profileResultCard');
  const box = $id('profileResult');
  if (!box) return;
  if (!name) { toast('請選擇選手'); return; }
  toast('讀取個人檔案中...');
  const history = await fetchRecentRecords(name, 180);
  const recs = dedupeLatestByDate(history || []); // 新→舊
  renderProfile(name, recs);
  if (card) card.style.display = 'block';
  const journalCard = $id('journalQueryCard');
  if (journalCard) setTimeout(() => journalCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function renderProfile(name, recs) {
  const box = $id('profileResult');
  const parentView = isParentView();
  const coachView = isCoachView();

  let html = `<h3 class="card-title">👤 ${escapeHtml(name)}</h3>`;

  if (!recs.length) {
    html += `<div class="hint-box">尚無紀錄，開始每天填寫就會累積個人檔案。</div>`;
    box.innerHTML = html;
    setupProfileGoals(name, null, coachView, parentView);
    return;
  }

  const latest = recs[0];

  // 身高體重變化
  const weights = recs.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wChange = weights.length >= 2 ? `${weights[weights.length - 1]} → ${weights[0]} kg` : (weights.length ? weights[0] + ' kg' : '--');
  html += `<div class="review-row"><span class="review-label">身高</span><span class="review-value">${latest.heightCm || '--'} cm</span></div>`;
  html += `<div class="review-row"><span class="review-label">體重變化</span><span class="review-value">${wChange}</span></div>`;
  html += `<div class="review-row"><span class="review-label">最近狀態</span><span class="review-value">${parentView ? softenForParent(latest.status || '') : (latest.status || '--')}</span></div>`;

  // 7 天 / 30 天趨勢
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">📈 最近 7 天趨勢</h4><div id="profileTrend7"></div>`;
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">📈 最近 30 天趨勢</h4><div id="profileTrend30"></div>`;

  // 飲食狀況
  const riskDays = recs.filter(r => r.nutritionRisks && r.nutritionRisks !== '無明顯風險').length;
  const lowWaterDays = recs.filter(r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml').length;
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🍱 飲食狀況（近 ${recs.length} 筆）</h4>`;
  html += `<div class="review-row"><span class="review-label">有飲食風險的天數</span><span class="review-value">${riskDays}</span></div>`;
  html += `<div class="review-row"><span class="review-label">水量不足的天數</span><span class="review-value">${lowWaterDays}</span></div>`;

  // 紅燈紀錄（家長看溫和版、隱藏教練內部備註）
  const reds = recs.filter(r => r.status && r.status.indexOf('紅') !== -1);
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🔴 ${parentView ? '需要關心的日子' : '紅燈紀錄'}（${reds.length}）</h4>`;
  if (reds.length) {
    reds.slice(0, 10).forEach(r => {
      html += `<div class="redcare-card"><div class="redcare-head"><b>${dateSlash(r.date)}</b><span class="tag tag-red">平均 ${r.averageScore}</span></div>`;
      if (r.redLightReason) html += `<div class="redcare-low">原因：${parentView ? softenForParent(r.redLightReason) : escapeHtml(r.redLightReason)}</div>`;
      if (!parentView && r.redLightHandling) html += `<div class="redcare-suggest">處理：${escapeHtml(r.redLightHandling)}</div>`;
      if (!parentView && r.redLightNote) html += `<div class="hint-box">📝 ${escapeHtml(r.redLightNote)}</div>`;
      html += `</div>`;
    });
  } else {
    html += `<div class="hint-box good">近期沒有紅燈，狀況穩定 👍</div>`;
  }

  // 目標 / 教練備註
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🎯 目標與備註</h4><div id="profileGoals"></div>`;

  // 家長週報
  html += `<div class="btn-group"><button type="button" id="btnParentWeekly" class="btn btn-line-share">📤 產生家長週報</button></div>`;
  html += `<div id="parentWeeklyBox"></div>`;

  box.innerHTML = html;

  // 趨勢圖
  const t7 = $id('profileTrend7'); if (t7) renderTrendSection(t7, recs, 7, { picker: false });
  const t30 = $id('profileTrend30'); if (t30) renderTrendSection(t30, recs, 30, { picker: false });

  // 目標區（教練可編輯）
  appGet(appKeyProfile(name), data => setupProfileGoals(name, data, coachView, parentView));

  // 家長週報
  const wbtn = $id('btnParentWeekly');
  if (wbtn) wbtn.addEventListener('click', () => {
    const text = generateParentWeekly(name, recs);
    const wbox = $id('parentWeeklyBox');
    wbox.innerHTML = `<pre class="line-text">${escapeHtml(text)}</pre>
      <div class="btn-group">
        <button type="button" class="btn btn-line-share" id="btnWeeklyShare">💬 分享到 LINE</button>
        <button type="button" class="btn btn-secondary" id="btnWeeklyCopy">📋 複製</button>
      </div>`;
    $id('btnWeeklyShare').addEventListener('click', () => shareToLine(text));
    $id('btnWeeklyCopy').addEventListener('click', () => copyText(text));
  });
}

// 目標 / 教練備註：教練可編輯並儲存；學生唯讀；家長唯讀且不顯示教練備註
function setupProfileGoals(name, data, coachView, parentView) {
  const box = $id('profileGoals');
  if (!box) return;
  data = data || {};
  if (coachView) {
    box.innerHTML =
      `<label class="field-label">比賽目標</label><input type="text" id="profCompGoal" class="text-input" value="${escapeHtml(data.competitionGoal || '')}" placeholder="例如：全國賽前 8 強" />
       <label class="field-label">階段訓練目標</label><input type="text" id="profStageGoal" class="text-input" value="${escapeHtml(data.stageGoal || '')}" placeholder="例如：這個月把旋踢距離練穩" />
       <label class="field-label">教練備註（內部，家長看不到）</label><textarea id="profCoachNote" class="text-input" rows="2" placeholder="只有教練看得到">${escapeHtml(data.coachNote || '')}</textarea>
       <button type="button" id="btnSaveProfile" class="btn btn-primary" style="margin-top:8px">💾 儲存目標與備註</button>`;
    $id('btnSaveProfile').addEventListener('click', async () => {
      const merged = {
        competitionGoal: $id('profCompGoal').value.trim(),
        stageGoal: $id('profStageGoal').value.trim(),
        coachNote: $id('profCoachNote').value.trim()
      };
      const b = $id('btnSaveProfile');
      b.disabled = true; b.textContent = '儲存中...';
      await appSet(appKeyProfile(name), merged);
      b.disabled = false; b.textContent = '💾 儲存目標與備註';
      toast('✅ 已儲存');
    });
  } else {
    let html = '';
    html += `<div class="review-row"><span class="review-label">比賽目標</span><span class="review-value">${escapeHtml(data.competitionGoal || '—')}</span></div>`;
    html += `<div class="review-row"><span class="review-label">階段訓練目標</span><span class="review-value">${escapeHtml(data.stageGoal || '—')}</span></div>`;
    // 家長看不到教練內部備註；學生可看
    if (!parentView && data.coachNote) html += `<div class="hint-box">📝 教練備註：${escapeHtml(data.coachNote)}</div>`;
    box.innerHTML = html;
  }
}

// 產生家長週報（正向、具體、不只報分數）
function generateParentWeekly(name, recsNewToOld) {
  const recs = recsNewToOld.slice(0, 7).reverse(); // 舊→新
  const n = recs.length;
  const avgOf = arr => arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const totals = recs.map(r => parseFloat(r.totalScore)).filter(v => !isNaN(v));
  const firstT = totals[0], lastT = totals[totals.length - 1];
  const trend = (totals.length >= 2) ? (lastT > firstT ? '進步' : (lastT < firstT ? '持平調整中' : '穩定')) : '剛開始累積';

  // 本週狀態
  const greens = recs.filter(r => r.status && r.status.indexOf('綠') !== -1).length;
  const statusLine = greens >= n - greens ? '整體狀態穩定、投入度高' : '狀態起伏中，仍持續努力';

  // 亮點：六面向最高的一項
  const aspAvg = {};
  ASPECT_ORDER.forEach(k => aspAvg[k] = avgOf(recs.map(r => parseFloat(r[ASPECT_AVG_FIELD[k]])).filter(v => !isNaN(v))));
  const best = ASPECT_ORDER.slice().sort((a, b) => aspAvg[b] - aspAvg[a])[0];
  const worst = ASPECT_ORDER.slice().sort((a, b) => aspAvg[a] - aspAvg[b])[0];

  // 出勤/堅持
  const days = n;

  return `🥋 育林國中技擊隊｜${name} 本週回饋

親愛的家長您好，這是孩子本週（共 ${days} 天紀錄）的訓練摘要：

【本週狀態】
${statusLine}，整體表現${trend}。

【本週亮點】
孩子在「${KPI_ASPECTS[best].label}」表現最亮眼，這份努力值得肯定 👍

【可以再加強】
「${KPI_ASPECTS[worst].label}」還有成長空間，教練會在訓練中陪孩子一起調整，不需要擔心。

【教練的話】
我們看重的不是單次分數，而是孩子每天願不願意面對問題、持續進步。孩子這週有持續記錄、面對自己的狀態，這就是最重要的態度。

【給家長的小提醒】
回家可以多給孩子鼓勵，幫忙留意睡眠、三餐與水分，這些都會直接影響訓練恢復。謝謝您的支持，我們一起陪孩子變得更強 💪`;
}

function monthStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function journalSafePart(s) {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
}

function journalInRange(dateStr, fromMonth, toMonth) {
  const m = normDate(dateStr).slice(0, 7);
  if (!m) return false;
  if (fromMonth && m < fromMonth) return false;
  if (toMonth && m > toMonth) return false;
  return true;
}

function journalRangeLabel(fromMonth, toMonth) {
  if (!fromMonth && !toMonth) return '全部資料';
  if (fromMonth && toMonth) return `${fromMonth.replace('-', ' 年 ')} 月 ～ ${toMonth.replace('-', ' 年 ')} 月`;
  if (fromMonth) return `${fromMonth.replace('-', ' 年 ')} 月起`;
  return `～ ${toMonth.replace('-', ' 年 ')} 月`;
}

function journalFileNo(scope, fromMonth, toMonth) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `JR-${journalSafePart(scope || 'single')}-${journalSafePart(fromMonth || 'ALL')}-${journalSafePart(toMonth || 'ALL')}-${stamp}`;
}

function journalCoachLabel() {
  const el = $id('journalCoachName');
  const raw = el ? String(el.value || '').trim() : '';
  return raw || '教練簽核';
}

function refreshJournalFileNo() {
  const fileNoEl = $id('journalFileNo');
  if (!fileNoEl) return '';
  const scope = ($id('profileName') && $id('profileName').value) || 'journal';
  const fromMonth = ($id('journalMonthFrom') && $id('journalMonthFrom').value.trim()) || '';
  const toMonth = ($id('journalMonthTo') && $id('journalMonthTo').value.trim()) || '';
  const fileNo = journalFileNo(scope, fromMonth, toMonth);
  fileNoEl.value = fileNo;
  return fileNo;
}

function journalStatusTone(rec) {
  const s = String(rec.readinessStatusLight || rec.status || '');
  if (s.indexOf('紅') !== -1) return 'red';
  if (s.indexOf('橘') !== -1) return 'orange';
  if (s.indexOf('黃') !== -1) return 'yellow';
  return 'green';
}

function journalText(v, fallback) {
  const text = String(v == null ? '' : v).trim();
  return text ? escapeHtml(text).replace(/\n/g, '<br>') : (fallback || '—');
}

/* 日誌趨勢圖：純 SVG（屬性內聯，html2canvas 友善，不會空白）。
   series：[{ name, color, vals:[數值|null] }]；vals 與 xLabels 對齊。 */
function jrShortDate(d) {
  const s = normDate(d);
  const m = s.slice(5, 7).replace(/^0/, ''), day = s.slice(8, 10).replace(/^0/, '');
  return (m && day) ? `${m}/${day}` : '';
}
function jrTrendChart(title, subtitle, series, yMin, yMax, xLabels, opts) {
  opts = opts || {};
  const W = 760, H = opts.height || 220, PL = 42, PR = 16, PT = opts.labels ? 30 : 16, PB = 30;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const n = series[0] ? series[0].vals.length : 0;
  const span = (yMax - yMin) || 1;
  const xAt = i => PL + (n <= 1 ? innerW / 2 : innerW * i / (n - 1));
  const yAt = v => PT + innerH * (1 - (v - yMin) / span);
  // 明確 width/height 屬性＝有固有尺寸，不會被瀏覽器塌成 0 高（多餘空白頁主因）
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;height:auto;display:block" font-family="Microsoft JhengHei, PingFang TC, sans-serif">`;
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const v = yMin + span * t, y = yAt(v).toFixed(1);
    svg += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#e7edf5" stroke-width="1"/>`;
    svg += `<text x="${PL - 7}" y="${(parseFloat(y) + 4).toFixed(1)}" font-size="11" fill="#9aa4b2" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
  });
  if (opts.area && series[0]) {
    const s = series[0]; let d = '', started = false, firstX = null, lastX = null;
    s.vals.forEach((v, i) => {
      if (v == null || isNaN(v)) return;
      const x = xAt(i).toFixed(1), y = yAt(v).toFixed(1);
      d += (started ? 'L' : 'M') + x + ' ' + y + ' ';
      if (!started) { started = true; firstX = x; }
      lastX = x;
    });
    if (started) { const base = yAt(yMin).toFixed(1); svg += `<path d="${d}L${lastX} ${base} L${firstX} ${base} Z" fill="${s.fill || 'rgba(31,157,85,0.16)'}" stroke="none"/>`; }
  }
  series.forEach(s => {
    let d = '', pen = false;
    s.vals.forEach((v, i) => {
      if (v == null || isNaN(v)) { pen = false; return; }
      d += (pen ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1) + ' ';
      pen = true;
    });
    if (d) svg += `<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (n <= 31) s.vals.forEach((v, i) => { if (v != null && !isNaN(v)) svg += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2"/>`; });
    if (opts.labels && series.length === 1 && n <= 20) s.vals.forEach((v, i) => { if (v != null && !isNaN(v)) svg += `<text x="${xAt(i).toFixed(1)}" y="${(yAt(v) - 9).toFixed(1)}" font-size="11" fill="#36506e" text-anchor="middle" font-weight="700">${Math.round(v * 10) / 10}</text>`; });
  });
  const step = n <= 12 ? 1 : Math.ceil(n / 10);
  for (let i = 0; i < n; i += step) svg += `<text x="${xAt(i).toFixed(1)}" y="${H - 9}" font-size="10" fill="#9aa4b2" text-anchor="middle">${escapeHtml(xLabels[i] || '')}</text>`;
  if (n > 1 && (n - 1) % step !== 0) svg += `<text x="${xAt(n - 1).toFixed(1)}" y="${H - 9}" font-size="10" fill="#9aa4b2" text-anchor="middle">${escapeHtml(xLabels[n - 1] || '')}</text>`;
  svg += `</svg>`;
  const legend = series.length > 1 ? `<div class="jr-chart-legend">${series.map(s => `<span class="jr-chart-key"><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="jr-chart"><div class="jr-chart-h">${escapeHtml(title)}${subtitle ? ` <small>${escapeHtml(subtitle)}</small>` : ''}</div>${legend}${svg}</div>`;
}
function jrStat(value, label, sub) {
  return `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(String(value))}</div><div class="mr-stat-label">${escapeHtml(label)}</div>${sub ? `<div class="mr-stat-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
}
// 成長趨勢總覽頁（報告第一頁）；資料 < 2 筆時回空字串（不插頁）
function jrBuildTrendPage(name, ordered, fileNo, rangeLabel) {
  if (!ordered || ordered.length < 2) return '';
  const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  const xLabels = ordered.map(r => jrShortDate(r.date));
  const readiness = ordered.map(r => num(r.finalReadinessScore));
  const rpe = ordered.map(r => num(r.rpe));
  const pain = ordered.map(r => num(r.painScore));
  const weight = ordered.map(r => num(r.weightKg));
  const target = ordered.map(r => num(r.targetWeightKg));
  const has = arr => arr.filter(v => v != null).length >= 2;
  if (!has(readiness) && !has(rpe) && !has(pain) && !has(weight)) return '';

  // 主圖（一目了然）：準備度填色面積曲線＋每點數字
  const hero = has(readiness)
    ? jrTrendChart('訓練準備度走勢', '0–100，越高代表越適合高品質訓練', [{ name: '準備度', color: '#1f9d55', fill: 'rgba(31,157,85,0.16)', vals: readiness }], 0, 100, xLabels, { height: 340, area: true, labels: true })
    : '';

  // 副圖：RPE+疼痛、體重 vs 目標
  let sub = '';
  if (has(rpe) || has(pain)) {
    const s = [];
    if (has(rpe)) s.push({ name: 'RPE 主觀強度', color: '#d97316', vals: rpe });
    if (has(pain)) s.push({ name: '疼痛分數', color: '#c0392b', vals: pain });
    sub += `<div>${jrTrendChart('疲勞與疼痛', '0–10', s, 0, 10, xLabels, { height: 200 })}</div>`;
  }
  if (has(weight)) {
    const all = weight.concat(target).filter(v => v != null);
    let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (lo === hi) { lo -= 1; hi += 1; } else { const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad; }
    const s = [{ name: '今日體重', color: '#1f4e79', vals: weight }];
    if (has(target)) s.push({ name: '目標體重', color: '#8893a3', vals: target });
    sub += `<div>${jrTrendChart('體重 vs 目標', 'kg', s, Math.floor(lo), Math.ceil(hi), xLabels, { height: 200 })}</div>`;
  }

  // 重點數字列
  const readyVals = readiness.filter(v => v != null);
  const rpeVals = rpe.filter(v => v != null);
  const painVals = pain.filter(v => v != null);
  const greenCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('綠') !== -1).length;
  const yellowCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('黃') !== -1).length;
  const redCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('紅') !== -1).length;
  const avgReady = readyVals.length ? Math.round(readyVals.reduce((a, b) => a + b, 0) / readyVals.length) : '—';
  let dirText = '—';
  if (readyVals.length >= 2) {
    const d = Math.round(readyVals[readyVals.length - 1] - readyVals[0]);
    dirText = d >= 5 ? `↑ 進步 ${d}` : d <= -5 ? `↓ 下滑 ${Math.abs(d)}` : '→ 持平';
  }
  const stats = `<div class="mr-grid mr-grid-4">` +
    jrStat(ordered.length, '紀錄天數', rangeLabel) +
    jrStat(avgReady, '平均準備度', dirText) +
    jrStat(`${greenCount}/${yellowCount}/${redCount}`, '綠 / 黃 / 紅', '燈號天數') +
    jrStat(rpeVals.length ? round1(rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) : '—', 'RPE 平均', painVals.length ? `疼痛最高 ${Math.max.apply(null, painVals)}` : '') +
    `</div>`;

  let html = `<section class="mr-page">`;
  html += `<div class="mr-page-head"><div class="mr-page-title">成長趨勢總覽</div><div class="mr-page-meta">${escapeHtml(name)}｜${escapeHtml(rangeLabel)}</div></div>`;
  html += stats;
  html += hero;
  if (sub) html += `<div class="mr-two-col jr-sub-charts">${sub}</div>`;
  html += `<div class="mr-page-foot">成長趨勢總覽｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;
  return html;
}

function buildPersonalJournalReport(name, recs, fromMonth, toMonth) {
  const ordered = dedupeLatestByDate(recs || []).slice().reverse(); // 舊→新
  const total = ordered.length;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const totalScoreVals = ordered.map(r => parseFloat(r.totalScore)).filter(v => !isNaN(v));
  const avgScore = totalScoreVals.length ? round1(totalScoreVals.reduce((a, b) => a + b, 0) / totalScoreVals.length) : null;
  const readinessVals = ordered.map(r => parseFloat(r.finalReadinessScore)).filter(v => !isNaN(v));
  const avgReadiness = readinessVals.length ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length) : null;
  const greenCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('綠') !== -1).length;
  const yellowCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('黃') !== -1).length;
  const orangeCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('橘') !== -1).length;
  const redCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('紅') !== -1).length;
  const bodyRiskDays = ordered.filter(r => String(r.bodyStatus || '') === '疲勞' || String(r.bodyStatus || '') === '不舒服' || String(r.bodyStatus || '') === '受傷中').length;
  const lowSleepDays = ordered.filter(r => {
    const s = parseFloat(r.sleepHours);
    return !isNaN(s) && s < 7;
  }).length;
  const rangeLabel = journalRangeLabel(fromMonth, toMonth);
  const fileNo = journalFileNo(name, fromMonth, toMonth);
  const coachName = journalCoachLabel();

  function statCard(value, label, sub, tone) {
    return `<div class="mr-stat ${tone || ''}"><div class="mr-stat-val">${escapeHtml(String(value))}</div><div class="mr-stat-label">${escapeHtml(label)}</div>${sub ? `<div class="mr-stat-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
  }

  const summaryLines = [];
  summaryLines.push(`訓練紀錄 ${total} 天`);
  if (first && last) summaryLines.push(`區間 ${dateSlash(first.date)} ～ ${dateSlash(last.date)}`);
  if (avgScore != null) summaryLines.push(`平均總分 ${avgScore}`);
  if (avgReadiness != null) summaryLines.push(`平均準備度 ${avgReadiness}`);
  if (bodyRiskDays) summaryLines.push(`身體提醒 ${bodyRiskDays} 天`);
  if (lowSleepDays) summaryLines.push(`睡眠不足 ${lowSleepDays} 天`);

  const summaryCoach = ordered.length ? buildCoachFeedback(
    ordered[ordered.length - 1],
    ordered.length > 1 ? ordered[ordered.length - 2] : null,
    ordered.slice(0, Math.max(ordered.length - 1, 0)),
    buildAffirmations(ordered[ordered.length - 1], ordered.length > 1 ? ordered[ordered.length - 2] : null, ordered.slice(0, Math.max(ordered.length - 1, 0)))
  ).versions.coach : null;

  let html = `<div class="mr-report jr-report">`;
  // 報告第一頁：成長趨勢總覽（一目了然的曲線圖）
  html += jrBuildTrendPage(name, ordered, fileNo, rangeLabel);
  html += `<section class="mr-page">`;
  html += `<div class="mr-cover">`;
  html += `<div class="mr-cover-title">個人訓練日誌</div>`;
  html += `<div class="mr-cover-sub">${escapeHtml(name)}</div>`;
  html += `<div class="mr-cover-month">${escapeHtml(rangeLabel)}</div>`;
  html += `<div class="mr-cover-use">供訓練管理與正式備查使用</div>`;
  html += `<div class="jr-file-no">文件編號：${escapeHtml(fileNo)}</div>`;
  html += `</div>`;
  html += `<div class="mr-grid mr-grid-4">`;
  html += statCard(total, '紀錄天數', rangeLabel);
  html += statCard(avgScore != null ? avgScore : '—', '平均總分', avgScore != null ? '/ 150' : '');
  html += statCard(avgReadiness != null ? avgReadiness : '—', '平均準備度', avgReadiness != null ? '/ 100' : '');
  html += statCard(`${greenCount}/${yellowCount}/${orangeCount}/${redCount}`, '綠黃橘紅', '綠 / 黃 / 橘 / 紅');
  html += `</div>`;
  html += `<div class="mr-two-col">`;
  html += `<div class="mr-panel blue"><div class="mr-panel-h">文件摘要</div><ul class="jr-mini-list">` +
    summaryLines.map(t => `<li>${escapeHtml(t)}</li>`).join('') +
    `</ul></div>`;
  html += `<div class="mr-panel green"><div class="mr-panel-h">AI 教練摘要</div>` +
    (summaryCoach ? `<div class="jr-longtext">${escapeHtml(summaryCoach.affirm).replace(/\n/g, '<br>')}</div>
      <div class="jr-summary-note">觀察：${escapeHtml(summaryCoach.watch).replace(/\n/g, '<br>')}</div>
      <div class="jr-summary-note">任務：${escapeHtml(summaryCoach.oneThing).replace(/\n/g, '<br>')}</div>` : '<div class="mr-empty sm">尚無可用資料。</div>') +
    `</div>`;
  html += `</div>`;
  html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
  html += `<div class="mr-privacy">日誌內容依訓練日期彙整，預設以最新資料為準。若同一天有多筆紀錄，會保留最新一筆。</div>`;
  html += `<div class="mr-page-foot">育林國中技擊隊個人訓練日誌｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;

  ordered.forEach((rec, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const before = ordered.slice(0, idx);
    const current = Object.assign({}, rec);
    applyReadiness(current, before);
    const affirm = buildAffirmations(current, prev, before);
    const fb = buildCoachFeedback(current, prev, before, affirm);
    const coach = fb.versions.coach;
    const scores = [];
    if (String(current.trainingTopic || '').trim()) scores.push(current.trainingTopic);
    if (String(current.lowItems || '').trim()) scores.push(`弱項：${current.lowItems}`);
    if (String(current.improveTargets || '').trim()) scores.push(`改善：${current.improveTargets}`);
    const bodyBits = [];
    if (String(current.bodyStatus || '').trim()) bodyBits.push(current.bodyStatus);
    if (String(current.sleepHours || '').trim()) bodyBits.push(`睡眠 ${current.sleepHours} 小時`);
    if (String(current.sleepQuality || '').trim()) bodyBits.push(`睡眠品質 ${current.sleepQuality}`);
    if (String(current.soreness || '').trim()) bodyBits.push(`痠痛 ${current.soreness}/5`);
    if (String(current.rpe || '').trim()) bodyBits.push(`RPE ${current.rpe}/10`);
    if (String(current.injuryArea || '').trim()) bodyBits.push(`不適部位 ${current.injuryArea}`);
    if (String(current.painScore || '').trim()) bodyBits.push(`疼痛 ${current.painScore}/10`);
    if (String(current.urineStatus || '').trim()) bodyBits.push(`尿液 ${current.urineStatus}`);

    html += `<section class="mr-page">`;
    html += `<div class="mr-page-head"><div class="mr-page-title">${escapeHtml(dateSlash(current.date))}｜${escapeHtml(name)}</div><div class="mr-page-meta">${escapeHtml(current.group || '訓練紀錄')}｜第 ${idx + 1} / ${total} 筆</div></div>`;
    html += `<div class="mr-grid mr-grid-4">`;
    html += statCard(current.group || '—', '項目', current.trainingTopic || '訓練主題');
    html += statCard(current.averageScore != null && current.averageScore !== '' ? current.averageScore : '—', '平均 / 總分', current.totalScore != null && current.totalScore !== '' ? `總分 ${current.totalScore}` : '');
    html += statCard(current.readinessStatusLight || current.status || '—', '狀態', current.finalReadinessScore != null && current.finalReadinessScore !== '' ? `準備度 ${current.finalReadinessScore}` : '');
    html += statCard(current.bodyStatus || '—', '身體狀態', bodyBits.slice(1, 3).join(' · '));
    html += `</div>`;

    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel blue"><div class="mr-panel-h">訓練課表</div>` +
      `<div class="jr-longtext">${journalText(current.trainingTopic, '未填')}</div>` +
      `<ul class="jr-mini-list">` +
      `<li>訓練強度：${escapeHtml(current.trainingIntensity || '—')}</li>` +
      `<li>訓練組別：${escapeHtml(current.group || '—')}</li>` +
      `<li>課表重點：${scores.length ? scores.map(s => escapeHtml(s)).join('；') : '—'}</li>` +
      `</ul></div>`;
    html += `<div class="mr-panel yellow"><div class="mr-panel-h">訓練心得</div>` +
      `<div class="jr-longtext">${journalText(current.reflection, '未填')}</div>` +
      `<div class="jr-summary-note">明日目標：${journalText(current.tomorrowGoal, '—')}</div>` +
      `${String(current.gratitude || '').trim() ? `<div class="jr-summary-note">感謝：${journalText(current.gratitude)}</div>` : ''}` +
      `</div>`;
    html += `</div>`;

    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel red"><div class="mr-panel-h">身體狀態</div>` +
      `<ul class="jr-mini-list">` +
      `<li>${escapeHtml(bodyBits.length ? bodyBits.join('；') : '—')}</li>` +
      `<li>飲食風險：${escapeHtml(current.nutritionRisks || '無')}</li>` +
      `<li>恢復提醒：${escapeHtml(current.recoveryState || '—')}</li>` +
      `</ul></div>`;
    html += `<div class="mr-panel green"><div class="mr-panel-h">教練回饋（AI 草稿）</div>` +
      `<div class="jr-longtext">【今日狀態】${escapeHtml(coach.affirm).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【觀察】${escapeHtml(coach.watch).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【任務】${escapeHtml(coach.oneThing).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【提醒】${escapeHtml(coach.quote).replace(/\n/g, '<br>')}</div>` +
      `</div>`;
    html += `</div>`;
    html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
    html += `<div class="mr-privacy">本頁由系統自動整理，教練可在送出紀錄後直接核對與調整後再正式輸出。</div>`;
    html += `<div class="mr-page-foot">第 ${idx + 1} / ${total} 頁｜${escapeHtml(fileNo)}</div>`;
    html += `</section>`;
  });

  html += `</div>`;

  const fileBase = `育林國中技擊隊_個人訓練日誌_${journalSafePart(name)}_${journalSafePart(fromMonth || 'all')}_${journalSafePart(toMonth || 'all')}_${journalSafePart(fileNo)}`;
  const pdfRecords = buildPdfRecordsFromOrderedRecords(ordered, name, fileNo);
  return { html, fileBase, fileNo, coachName, records: pdfRecords };
}

let _currentJournalReport = null;

function clearPersonalJournalPreview(showHint) {
  _currentJournalReport = null;
  const previewCard = $id('journalPreviewCard');
  const preview = $id('journalPreview');
  const downloadBtn = $id('btnDownloadJournalPdf');
  const printBtn = $id('btnPrintJournal');
  if (downloadBtn) downloadBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;
  if (preview) preview.innerHTML = showHint ? '<div class="hint-box">請先選擇選手與月份區間，然後產生日誌預覽。</div>' : '';
  if (previewCard) previewCard.style.display = showHint ? 'block' : 'none';
}

function renderPersonalJournalPreview(report) {
  const previewCard = $id('journalPreviewCard');
  const preview = $id('journalPreview');
  const downloadBtn = $id('btnDownloadJournalPdf');
  const printBtn = $id('btnPrintJournal');
  if (!previewCard || !preview) return;
  if (!report) {
    preview.innerHTML = '<div class="hint-box">請先選擇選手與月份區間，然後產生日誌預覽。</div>';
    previewCard.style.display = 'block';
    if (downloadBtn) downloadBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;
    return;
  }
  preview.innerHTML = report.html;
  previewCard.style.display = 'block';
  if (downloadBtn) downloadBtn.disabled = false;
  if (printBtn) printBtn.disabled = false;
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildBatchJournalReport(names, grouped, fromMonth, toMonth) {
  const scope = `batch-${names.length}`;
  const fileNo = journalFileNo(scope, fromMonth, toMonth);
  const coachName = journalCoachLabel();
  const rangeLabel = journalRangeLabel(fromMonth, toMonth);
  let html = `<div class="mr-report jr-report">`;
  html += `<section class="mr-page">`;
  html += `<div class="mr-cover">`;
  html += `<div class="mr-cover-title">全隊個人訓練日誌</div>`;
  html += `<div class="mr-cover-sub">${escapeHtml(names.join('、'))}</div>`;
  html += `<div class="mr-cover-month">${escapeHtml(rangeLabel)}</div>`;
  html += `<div class="mr-cover-use">批次匯出・供正式備查使用</div>`;
  html += `<div class="jr-file-no">文件編號：${escapeHtml(fileNo)}</div>`;
  html += `</div>`;
  html += `<div class="mr-grid mr-grid-3">`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${names.length}</div><div class="mr-stat-label">匯出人數</div><div class="mr-stat-sub">${escapeHtml(rangeLabel)}</div></div>`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${Object.keys(grouped).length}</div><div class="mr-stat-label">有資料人數</div><div class="mr-stat-sub">至少 1 筆紀錄</div></div>`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(coachName)}</div><div class="mr-stat-label">教練簽名</div><div class="mr-stat-sub">文件編號：${escapeHtml(fileNo)}</div></div>`;
  html += `</div>`;
  html += `<div class="mr-panel blue"><div class="mr-panel-h">批次摘要</div><ul class="jr-mini-list">` +
    `<li>已依月份區間彙整每位選手資料。</li>` +
    `<li>每位選手保留同一天最新一筆紀錄。</li>` +
    `<li>下方逐位輸出，便於上傳與歸檔。</li>` +
    `</ul></div>`;
  html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
  html += `<div class="mr-page-foot">全隊批次個人訓練日誌｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;

  names.forEach((name, idx) => {
    const recs = grouped[name] || [];
    const ordered = dedupeLatestByDate(recs || []).slice().reverse();
    if (!ordered.length) return;
    const last = ordered[ordered.length - 1];
    const before = ordered.slice(0, Math.max(ordered.length - 1, 0));
    const prev = ordered.length > 1 ? ordered[ordered.length - 2] : null;
    const current = Object.assign({}, last);
    applyReadiness(current, before);
    const aff = buildAffirmations(current, prev, before);
    const fb = buildCoachFeedback(current, prev, before, aff);
    const coach = fb.versions.coach;
    const fileNoLine = `${fileNo}-${String(idx + 1).padStart(2, '0')}`;
    html += `<section class="mr-page">`;
    html += `<div class="mr-page-head"><div class="mr-page-title">${escapeHtml(name)}｜個人訓練日誌</div><div class="mr-page-meta">文件編號 ${escapeHtml(fileNoLine)}｜${ordered.length} 筆</div></div>`;
    html += `<div class="mr-grid mr-grid-4">`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${ordered.length}</div><div class="mr-stat-label">紀錄天數</div><div class="mr-stat-sub">${escapeHtml(rangeLabel)}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.finalReadinessScore != null ? String(current.finalReadinessScore) : '—')}</div><div class="mr-stat-label">最新準備度</div><div class="mr-stat-sub">${escapeHtml(current.readinessStatusLight || current.status || '—')}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.bodyStatus || '—')}</div><div class="mr-stat-label">最新身體狀態</div><div class="mr-stat-sub">${escapeHtml(current.trainingTopic || '—')}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.averageScore != null && current.averageScore !== '' ? String(current.averageScore) : '—')}</div><div class="mr-stat-label">最新平均</div><div class="mr-stat-sub">${escapeHtml(current.totalScore != null && current.totalScore !== '' ? String(current.totalScore) : '—')}</div></div>`;
    html += `</div>`;
    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel blue"><div class="mr-panel-h">訓練紀錄</div><ul class="jr-mini-list">` +
      ordered.slice(0, 8).map(r => `<li>${escapeHtml(dateSlash(r.date))}｜${escapeHtml(r.trainingTopic || '未填')}｜${escapeHtml(r.status || r.readinessStatusLight || '—')}${r.finalReadinessScore != null && r.finalReadinessScore !== '' ? `｜${escapeHtml(String(r.finalReadinessScore))}` : ''}</li>`).join('') +
      `</ul></div>`;
    html += `<div class="mr-panel green"><div class="mr-panel-h">AI 教練摘要</div>` +
      `<div class="jr-longtext">【今日狀態】${escapeHtml(coach.affirm).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【觀察】${escapeHtml(coach.watch).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【任務】${escapeHtml(coach.oneThing).replace(/\n/g, '<br>')}</div>` +
      `</div>`;
    html += `</div>`;
    html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNoLine)}</div></div></div>`;
    html += `<div class="mr-privacy">批次匯出頁面只顯示該選手資料。</div>`;
    html += `<div class="mr-page-foot">第 ${idx + 1} / ${names.length} 位｜${escapeHtml(fileNoLine)}</div>`;
    html += `</section>`;
  });

  html += `</div>`;
  const fileBase = `育林國中技擊隊_全隊個人訓練日誌_${journalSafePart(fromMonth || 'all')}_${journalSafePart(toMonth || 'all')}_${journalSafePart(fileNo)}`;
  let pdfRecords = [];
  names.forEach(name => {
    const ordered = dedupeLatestByDate(grouped[name] || []).slice().reverse();
    pdfRecords = pdfRecords.concat(buildPdfRecordsFromOrderedRecords(ordered, name, fileNo));
  });
  return { html, fileBase, fileNo, coachName, records: pdfRecords };
}

async function loadPersonalJournal() {
  const name = $id('profileName').value;
  const fromMonth = $id('journalMonthFrom').value.trim();
  const toMonth = $id('journalMonthTo').value.trim();
  const card = $id('journalPreviewCard');
  if (!name) { toast('請選擇選手'); return; }
  if (fromMonth && toMonth && fromMonth > toMonth) { toast('開始月份不能晚於結束月份'); return; }
  toast('讀取個人訓練日誌中...');
  const all = await fetchRecentRecords(name, 9999);
  const filtered = (all || []).filter(r => journalInRange(r.date, fromMonth, toMonth));
  const recs = dedupeLatestByDate(filtered || []).slice().reverse(); // 舊→新
  if (!recs.length) {
    clearPersonalJournalPreview(true);
    if (card) card.style.display = 'block';
    toast('這個區間沒有資料');
    return;
  }
  _currentJournalReport = buildPersonalJournalReport(name, recs, fromMonth, toMonth);
  const fileNoEl = $id('journalFileNo');
  if (fileNoEl) fileNoEl.value = _currentJournalReport.fileNo || journalFileNo(name, fromMonth, toMonth);
  renderPersonalJournalPreview(_currentJournalReport);
  if (card) card.style.display = 'block';
  toast('✅ 日誌已產生');
}

async function loadPersonalJournalBatch() {
  if (!isCoachView()) { toast('全隊批次匯出僅供教練使用'); return; }
  const fromMonth = $id('journalMonthFrom').value.trim();
  const toMonth = $id('journalMonthTo').value.trim();
  if (fromMonth && toMonth && fromMonth > toMonth) { toast('開始月份不能晚於結束月份'); return; }
  const btn = $id('btnLoadJournalBatch');
  if (btn) { btn.dataset.txt = btn.dataset.txt || btn.textContent; btn.disabled = true; btn.textContent = '讀取中...'; }
  toast('讀取全隊個人訓練日誌中...');
  try {
    // 一次撈全部紀錄再本機分組，避免每位選手各打一次後端造成卡住
    const all = await fetchAllRecords();
    const grouped = {};
    (all || []).forEach(r => {
      const nm = String(r && r.name || '').trim();
      if (!nm || !journalInRange(r.date, fromMonth, toMonth)) return;
      (grouped[nm] = grouped[nm] || []).push(r);
    });
    const roster = getPlayers();
    const names = roster.filter(n => grouped[n] && grouped[n].length);
    Object.keys(grouped).forEach(n => { if (names.indexOf(n) === -1) names.push(n); });
    if (!names.length) { clearPersonalJournalPreview(true); toast('這個區間沒有可匯出的全隊資料'); return; }
    names.forEach(n => { grouped[n] = dedupeLatestByDate(grouped[n]); });
    _currentJournalReport = buildBatchJournalReport(names, grouped, fromMonth, toMonth);
    const fileNoEl = $id('journalFileNo');
    if (fileNoEl) fileNoEl.value = _currentJournalReport.fileNo || journalFileNo('batch', fromMonth, toMonth);
    renderPersonalJournalPreview(_currentJournalReport);
    toast(`✅ 全隊批次日誌已產生（${names.length} 人）`);
  } catch (e) {
    console.error(e);
    toast('全隊批次匯出失敗，請重試或縮小月份範圍');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.txt || '🗂️ 全隊批次匯出'; }
  }
}

function truncateText(text, maxLength = 450) {
  if (!text) return '-';
  const clean = String(text).trim();
  if (!clean) return '-';
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + '……';
}

function pdfText(v, fallback) {
  const s = String(v == null ? '' : v).trim();
  return s || fallback || '-';
}

function pdfEsc(s) {
  return escapeHtml(pdfText(s));
}

function pdfStripMealTags(s) {
  return String(s || '').replace(/〔[^〕]*〕/g, '').replace(/\[[^\]]*\]/g, '').trim();
}

function buildPdfRecordsFromOrderedRecords(ordered, athleteName, fileNo) {
  ordered = ordered || [];
  return ordered.map((rec, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const before = ordered.slice(0, idx);
    const current = Object.assign({}, rec);
    applyReadiness(current, before);
    const affirm = buildAffirmations(current, prev, before);
    const fb = buildCoachFeedback(current, prev, before, affirm);
    const coach = (fb && fb.versions && fb.versions.coach) || {};
    const trainingParts = [];
    if (current.trainingTopic) trainingParts.push(`訓練主題：${current.trainingTopic}`);
    if (current.trainingIntensity) trainingParts.push(`訓練強度：${current.trainingIntensity}`);
    if (current.group) trainingParts.push(`訓練組別：${current.group}`);
    if (current.lowItems) trainingParts.push(`弱項：${current.lowItems}`);
    if (current.improveTargets) trainingParts.push(`改善目標：${current.improveTargets}`);

    const noteParts = [];
    if (current.reflection) noteParts.push(current.reflection);
    if (current.tomorrowGoal) noteParts.push(`明日目標：${current.tomorrowGoal}`);
    if (current.gratitude) noteParts.push(`感謝：${current.gratitude}`);

    const bodyParts = [];
    if (current.bodyStatus) bodyParts.push(`身體狀態：${current.bodyStatus}`);
    if (current.sleepHours) bodyParts.push(`睡眠：${current.sleepHours} 小時`);
    if (current.sleepQuality) bodyParts.push(`睡眠品質：${current.sleepQuality}`);
    if (current.soreness) bodyParts.push(`痠痛：${current.soreness}/5`);
    if (current.rpe) bodyParts.push(`RPE：${current.rpe}/10`);
    if (current.injuryArea) bodyParts.push(`不適部位：${current.injuryArea}`);
    if (current.painScore) bodyParts.push(`疼痛：${current.painScore}/10`);
    if (current.urineStatus) bodyParts.push(`尿液：${current.urineStatus}`);

    const recoveryParts = [];
    if (current.nutritionRisks) recoveryParts.push(`飲食風險：${current.nutritionRisks}`);
    if (current.recoveryState) recoveryParts.push(`恢復提醒：${current.recoveryState}`);
    if (current.breakfast) recoveryParts.push(`早餐：${pdfStripMealTags(current.breakfast) || current.breakfast}`);
    if (current.lunch) recoveryParts.push(`午餐：${pdfStripMealTags(current.lunch) || current.lunch}`);
    if (current.dinner) recoveryParts.push(`晚餐：${pdfStripMealTags(current.dinner) || current.dinner}`);
    if (current.waterIntake) recoveryParts.push(`水分：${current.waterIntake}`);

    const suggestionParts = [];
    if (coach.affirm) suggestionParts.push(`今日狀態：${coach.affirm}`);
    if (coach.watch) suggestionParts.push(`觀察：${coach.watch}`);
    if (coach.oneThing) suggestionParts.push(`任務：${coach.oneThing}`);
    if (coach.quote) suggestionParts.push(`提醒：${coach.quote}`);

    return {
      date: dateSlash(current.date),
      athleteName: athleteName || current.name || '',
      trainingType: current.group || current.trainingTopic || '-',
      averageScore: current.averageScore != null && current.averageScore !== '' ? String(current.averageScore) : (current.totalScore != null && current.totalScore !== '' ? String(current.totalScore) : '-'),
      status: current.readinessStatusLight || current.status || '-',
      trainingContent: trainingParts.join('\n') || '-',
      trainingNote: noteParts.join('\n') || '-',
      bodyStatus: bodyParts.join('\n') || '-',
      nutritionRecovery: recoveryParts.join('\n') || '-',
      aiSuggestion: suggestionParts.join('\n') || '-',
      fileNo: fileNo || ''
    };
  });
}

function buildPdfReportPages(records) {
  const wrapper = document.createElement('div');
  wrapper.id = 'pdf-export-root';
  wrapper.style.position = 'absolute';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.transform = 'translateX(-120vw)';
  wrapper.style.width = '210mm';
  wrapper.style.background = '#ffffff';
  wrapper.style.pointerEvents = 'none';

  (records || []).forEach((record, index) => {
    const page = document.createElement('div');
    page.className = 'pdf-page';

    page.innerHTML = `
      <div class="pdf-header">
        <div>
          <h1>TeamPro 選手訓練報告</h1>
          <p>${pdfEsc(record.date)} ｜ ${pdfEsc(record.athleteName)}</p>
        </div>
        <div class="pdf-page-number">第 ${index + 1} / ${records.length} 頁</div>
      </div>

      <div class="pdf-summary-grid">
        <div class="pdf-summary-card">
          <span>項目</span>
          <strong>${pdfEsc(record.trainingType || '-')}</strong>
        </div>
        <div class="pdf-summary-card">
          <span>平均分數</span>
          <strong>${pdfEsc(record.averageScore || '-')}</strong>
        </div>
        <div class="pdf-summary-card">
          <span>狀態</span>
          <strong>${pdfEsc(record.status || '-')}</strong>
        </div>
      </div>

      <div class="pdf-grid">
        <section class="pdf-card">
          <h2>訓練課表</h2>
          <p>${pdfEsc(truncateText(record.trainingContent))}</p>
        </section>

        <section class="pdf-card">
          <h2>訓練心得</h2>
          <p>${pdfEsc(truncateText(record.trainingNote))}</p>
        </section>

        <section class="pdf-card">
          <h2>身體狀態</h2>
          <p>${pdfEsc(truncateText(record.bodyStatus))}</p>
        </section>

        <section class="pdf-card">
          <h2>飲食與恢復</h2>
          <p>${pdfEsc(truncateText(record.nutritionRecovery))}</p>
        </section>

        <section class="pdf-card pdf-card-wide">
          <h2>教練回饋 / AI 建議</h2>
          <p>${pdfEsc(truncateText(record.aiSuggestion))}</p>
        </section>
      </div>

      <div class="pdf-footer">
        <div>教練簽核：________________</div>
        <div>本報告由 TeamPro 自動產生${record.fileNo ? '｜' + pdfEsc(record.fileNo) : ''}</div>
      </div>
    `;

    wrapper.appendChild(page);
  });

  document.body.appendChild(wrapper);
  return wrapper;
}

function generatePdfFileName() {
  const base = (_currentJournalReport && _currentJournalReport.fileBase) || 'TeamPro_選手訓練報告';
  return journalSafePart(base) + '.pdf';
}

async function downloadPDF(records) {
  if (!records || !records.length) {
    alert('目前沒有可匯出的報告資料');
    return;
  }
  const h2c = window.html2canvas;
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (typeof h2c !== 'function' || typeof jsPDFCtor !== 'function') {
    if (typeof toast === 'function') toast('PDF 元件載入中，請稍後再試');
    return;
  }

  const pdfRoot = buildPdfReportPages(records);
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const pages = Array.from(pdfRoot.querySelectorAll('.pdf-page'));
    const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      const canvas = await h2c(pages[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        windowHeight: 1123
      });
      const img = canvas.toDataURL('image/jpeg', 0.98);
      let imgW = pw;
      let imgH = pw * canvas.height / canvas.width;
      if (imgH > ph) {
        imgH = ph;
        imgW = ph * canvas.width / canvas.height;
      }
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', (pw - imgW) / 2, 0, imgW, imgH);
    }
    pdf.save(generatePdfFileName());
  } finally {
    pdfRoot.remove();
  }
}

async function downloadPersonalJournalPdf() {
  if (!_currentJournalReport || !_currentJournalReport.html) { toast('請先產生日誌預覽'); return; }
  toast('產生 PDF 中，請稍候...');
  try {
    await downloadPDF(_currentJournalReport.records || []);
    toast('✅ PDF 已下載');
  } catch (e) {
    console.error(e);
    toast('PDF 產生失敗，請改用列印');
  }
}

function printPersonalJournal() {
  if (!_currentJournalReport) { toast('請先產生日誌預覽'); return; }
  const preview = $id('journalPreview');
  const node = preview ? (preview.querySelector('.mr-report') || preview) : null;
  if (!node) { toast('找不到日誌內容'); return; }
  const win = window.open('', '_blank');
  if (!win) { toast('請允許彈出視窗以列印'); return; }
  win.document.open();
  win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />
    <title>${journalSafePart(_currentJournalReport.fileBase)}</title>
    <link rel="stylesheet" href="style.css?v=20260624a" />
    <link rel="stylesheet" href="monthly-report.css?v=20260624d" />
    <style>body{margin:0;background:#fff;} .mr-report{box-shadow:none;} .mr-page{margin:0 auto 0;} </style>
  </head><body class="mr-print-window">${node.outerHTML}
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
  </body></html>`);
  win.document.close();
  win.focus();
}

