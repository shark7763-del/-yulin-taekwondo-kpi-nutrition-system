/* ============================================================
   權限工具：家長視圖只看溫和摘要、隱藏教練內部備註
   ============================================================ */
function isParentView() { const r = getRole(); return !!(r && r.role === 'parent'); }
function isCoachView() { const r = getRole(); return !!(r && r.role === 'coach'); }

// 把較尖銳的字眼轉成對家長溫和的說法
function softenForParent(text) {
  if (!text) return text;
  let t = String(text);
  const map = {
    '受傷': '身體狀況需要留意', '疲勞': '較疲累需要休息', '態度': '訓練投入',
    '情緒': '心情狀態', '學業壓力': '課業較忙', '紅燈': '需要關心',
    '低分': '還在進步中', '偏低': '還在進步中'
  };
  Object.keys(map).forEach(k => { t = t.split(k).join(map[k]); });
  return t;
}

// 建立 KPI 拉桿 UI（六面向各 5 題，共 30 題；1–5 分制）。
// 自由品勢另外顯示 3 個額外欄位區塊。
function renderKpiSliders(group) {
  currentGroup = group;
  const fsSection = $id('freestyleSection');
  if (fsSection) fsSection.style.display = isFreestyle(group) ? '' : 'none';
  toggleAbsenceReason(group);

  const container = $id('kpiContainer');
  container.innerHTML = '';

  // 頂部：全隊總摘要（保留 #kpiSummary 供 recalcKpiSummary 更新）
  const head = document.createElement('div');
  head.className = 'kpi-aspect-head kpi-overall-head';
  head.innerHTML = `<span>${escapeHtml(group)}　六大面向・30 項</span><span class="kpi-aspect-avg" id="kpiSummary">總分 90 / 150・平均 3・🟡 黃燈</span>`;
  container.appendChild(head);

  // 依六大面向分區塊（idx 維持 0–29 扁平編號，計分/草稿不受影響）
  let idx = 0;
  ASPECT_ORDER.forEach(aspectKey => {
    const aspect = KPI_ASPECTS[aspectKey];
    if (!aspect) return;

    const section = document.createElement('section');
    section.className = 'kpi-section';
    section.dataset.aspect = aspectKey;

    const sHead = document.createElement('button');
    sHead.type = 'button';
    sHead.className = 'kpi-section-head';
    sHead.innerHTML =
      `<span class="kpi-section-title">${KPI_ASPECT_ICON[aspectKey] || ''} ${escapeHtml(aspect.label)}` +
      `<span class="kpi-section-count">5 項</span></span>` +
      `<span class="kpi-section-right"><span class="kpi-section-avg" id="aspectAvg-${aspectKey}">3.0</span>` +
      `<span class="kpi-section-caret">▾</span></span>`;
    section.appendChild(sHead);

    const body = document.createElement('div');
    body.className = 'kpi-section-body';
    aspect.items.forEach(itemName => {
      const item = document.createElement('div');
      item.className = 'kpi-item';
      item.innerHTML = `
        <div class="kpi-item-row">
          <span class="kpi-item-name">${escapeHtml(itemName)}</span>
          <span class="kpi-item-score kpi-untouched" id="score-${idx}">滑動評分</span>
        </div>
        <input type="range" min="1" max="5" step="1" value="3"
               class="kpi-slider is-untouched" id="slider-${idx}"
               data-aspect="${aspectKey}" data-item="${itemName}" data-idx="${idx}" data-touched="0" />
        <div class="kpi-anchor kpi-anchor-hint" id="anchor-${idx}">← 拉一下，看看每一分代表什麼</div>
      `;
      body.appendChild(item);
      idx++;
    });
    section.appendChild(body);

    // 點標題收合／展開該面向，方便逐區評分
    sHead.addEventListener('click', () => section.classList.toggle('collapsed'));
    container.appendChild(section);
  });

  container.querySelectorAll('.kpi-slider').forEach(slider => {
    slider.addEventListener('input', onSliderChange);
  });
  recalcKpiSummary();
}

function toggleAbsenceReason(group) {
  const wrap = $id('absenceReasonWrap');
  const absent = isAbsenceGroup(group);
  if (wrap) wrap.style.display = absent ? '' : 'none';
  document.querySelectorAll('.training-only').forEach(el => {
    if (el.id === 'freestyleSection') {
      el.style.display = (!absent && isFreestyle(group)) ? '' : 'none';
    } else if (el.id === 'standardKpiSection') {
      el.style.display = (!absent && isDailyKpiAvailable()) ? '' : 'none';
    } else {
      el.style.display = absent ? 'none' : '';
    }
  });
  if (absent) {
    const topic = $id('trainingTopic');
    if (topic && !topic.value.trim()) topic.value = '未出席訓練';
    buildAbsenceChips();
    renderAbsenceImpact();
  } else if (wrap) {
    const imp = $id('absenceImpact'); if (imp) imp.style.display = 'none';
  }
}

// 建立未出席反思快捷 chip（點了把文字加入／移出對應 textarea）
function buildAbsenceChips() {
  buildChipToggler('absenceMissChips', 'absenceMiss', ABSENCE_MISS_CHIPS);
  buildChipToggler('absenceCatchupChips', 'absenceCatchup', ABSENCE_CATCHUP_CHIPS);
}
function buildChipToggler(boxId, targetId, items) {
  const box = $id(boxId);
  if (!box || box.dataset.ready) return;
  box.innerHTML = '';
  items.forEach(label => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = label;
    chip.addEventListener('click', () => {
      const ta = $id(targetId);
      if (!ta) return;
      const on = chip.classList.toggle('sel');
      let parts = ta.value.split(/[、,]\s*/).map(s => s.trim()).filter(Boolean);
      if (on) { if (parts.indexOf(label) === -1) parts.push(label); }
      else { parts = parts.filter(p => p !== label); }
      ta.value = parts.join('、');
    });
    box.appendChild(chip);
  });
  box.dataset.ready = '1';
}

/* ---- 飲食快速勾選標籤 ---- */
// 建立每餐的可點選標籤（state 直接掛在 chip 的 .sel class 上）
function buildMealTagChips() {
  Object.keys(MEAL_TAG_BOX).forEach(meal => {
    const box = $id(MEAL_TAG_BOX[meal]);
    if (!box || box.dataset.ready) return;
    box.innerHTML = '';
    (MEAL_TAG_OPTIONS[meal] || []).forEach(key => {
      const def = MEAL_TAG_DEFS[key];
      if (!def) return;
      const chip = document.createElement('span');
      chip.className = 'chip' + (def.kind === 'warn' ? ' chip-warn' : '');
      chip.textContent = def.label;
      chip.dataset.label = def.label;
      chip.addEventListener('click', () => {
        chip.classList.toggle('sel');
        saveDraft();
      });
      box.appendChild(chip);
    });
    box.dataset.ready = '1';
  });
}
// 讀某餐目前勾選的標籤文字陣列
function getMealTags(meal) {
  const box = $id(MEAL_TAG_BOX[meal]);
  if (!box) return [];
  return Array.from(box.querySelectorAll('.chip.sel')).map(c => c.dataset.label);
}
// 還原某餐的勾選狀態（草稿用）
function setMealTags(meal, tags) {
  const box = $id(MEAL_TAG_BOX[meal]);
  if (!box) return;
  const want = (tags || []).map(String);
  box.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('sel', want.indexOf(c.dataset.label) !== -1);
  });
}
// 全部餐點標籤一起讀 { breakfast:[], lunch:[], dinner:[], snacksDrinks:[] }
function getAllMealTags() {
  const out = {};
  Object.keys(MEAL_TAG_BOX).forEach(meal => { out[meal] = getMealTags(meal); });
  return out;
}
// 清空所有勾選
function clearMealTags() {
  Object.keys(MEAL_TAG_BOX).forEach(meal => {
    const box = $id(MEAL_TAG_BOX[meal]);
    if (box) box.querySelectorAll('.chip.sel').forEach(c => c.classList.remove('sel'));
  });
}

// 依個人最近出席紀錄，算出請假的累積影響，顯示在未出席表單上方
async function renderAbsenceImpact() {
  const box = $id('absenceImpact');
  if (!box) return;
  const name = $id('name') ? $id('name').value : '';
  if (!isAbsenceGroup($id('group').value) || !name) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = '<span class="review-label">讀取你的出席紀錄中…</span>';
  const dateStr = $id('date').value || todayStr();
  let recents = [];
  try { recents = await fetchRecentRecords(name, 90); } catch (e) { recents = []; }
  const ym = normDate(dateStr).slice(0, 7);
  const monthRecs = recents.filter(r => normDate(r.date).slice(0, 7) === ym && normDate(r.date) !== normDate(dateStr));
  const monthAbsent = monthRecs.filter(isAbsenceRecord).length;
  const monthPresent = monthRecs.filter(r => !isAbsenceRecord(r)).length;
  const sorted = recents.filter(r => normDate(r.date) !== normDate(dateStr))
    .sort((a, b) => normDate(b.date).localeCompare(normDate(a.date)));
  let streak = 0;
  for (const r of sorted) { if (isAbsenceRecord(r)) break; streak++; }
  const willBe = monthAbsent + 1;
  let html = `📅 本月（${ym}）：出席 <b>${monthPresent}</b> 次、未出席 <b>${monthAbsent}</b> 次<br>`;
  html += `📝 今天送出後，本月就是第 <b class="${willBe >= 3 ? 'imp-warn' : ''}">${willBe}</b> 次未出席`;
  if (willBe >= 3) html += `<br><span class="imp-warn">⚠️ 一個月未出席 ${willBe} 次，累積起來會明顯落後隊友，身手和體能都要花更多時間補回來。</span>`;
  if (streak >= 2) html += `<br>🔥 你之前<b>連續出席 ${streak} 次</b>，今天請假這個紀錄就會歸零。`;
  html += `<br>💪 隊友今天都在練。如果真的非請不可，把下面幾題想清楚，回來就追得回來。`;
  box.innerHTML = html;
}

// 分數對應顏色等級（1-2 紅、3 黃、4-5 綠）
function scoreLevelClass(val) {
  return val >= 4 ? 'lv-green' : val >= 3 ? 'lv-yellow' : 'lv-red';
}

// 套用某拉桿「已評分」的顯示：分數文字、錨點描述、顏色
function applySliderDisplay(slider) {
  const val = parseInt(slider.value, 10);
  const idx = slider.dataset.idx;
  const item = slider.dataset.item;
  const scoreEl = $id(`score-${idx}`);
  if (scoreEl) {
    scoreEl.textContent = `${val} 分 · ${SCORE_LABELS[val]}`;
    scoreEl.classList.remove('kpi-untouched', 'lv-red', 'lv-yellow', 'lv-green');
    scoreEl.classList.add(scoreLevelClass(val));
  }
  const anchorEl = $id(`anchor-${idx}`);
  const anchors = KPI_ANCHORS[item];
  if (anchorEl) {
    anchorEl.classList.remove('kpi-anchor-hint', 'lv-red', 'lv-yellow', 'lv-green');
    anchorEl.textContent = (anchors && anchors[val - 1]) ? anchors[val - 1] : '';
    anchorEl.classList.add(scoreLevelClass(val));
  }
}

// 把某拉桿重設回「未評分」狀態（不計入分數，必須動過才能送出）
function resetSliderUntouched(slider) {
  slider.value = 3;
  slider.dataset.touched = '0';
  slider.classList.add('is-untouched');
  const idx = slider.dataset.idx;
  const scoreEl = $id(`score-${idx}`);
  if (scoreEl) {
    scoreEl.textContent = '滑動評分';
    scoreEl.classList.remove('lv-red', 'lv-yellow', 'lv-green');
    scoreEl.classList.add('kpi-untouched');
  }
  const anchorEl = $id(`anchor-${idx}`);
  if (anchorEl) {
    anchorEl.textContent = '← 拉一下，看看每一分代表什麼';
    anchorEl.classList.remove('lv-red', 'lv-yellow', 'lv-green');
    anchorEl.classList.add('kpi-anchor-hint');
  }
}

function onSliderChange(e) {
  const slider = e.target;
  slider.dataset.touched = '1';
  slider.classList.remove('is-untouched');
  applySliderDisplay(slider);
  recalcKpiSummary();
}

// 即時更新總分/平均/燈號摘要（只計入「已評分」的項目，未評分不灌水）
function recalcKpiSummary() {
  const sliders = document.querySelectorAll('#kpiContainer .kpi-slider');
  if (!sliders.length) return;
  const total = sliders.length;
  let sum = 0, done = 0;
  const aSum = {}, aCnt = {};
  sliders.forEach(s => {
    if (s.dataset.touched !== '1') return;   // 未評分不計入
    const v = parseInt(s.value, 10);
    sum += v; done++;
    const a = s.dataset.aspect;
    aSum[a] = (aSum[a] || 0) + v; aCnt[a] = (aCnt[a] || 0) + 1;
  });
  const el = $id('kpiSummary');
  if (el) {
    const remain = total - done;
    if (done === 0) {
      el.textContent = `尚未評分・共 ${total} 項`;
    } else {
      const avg = round2(sum / done);
      const base = `已評 ${done}/${total}・平均 ${avg}・${judgeStatus(avg)}`;
      el.textContent = remain > 0 ? `${base}・還有 ${remain} 項未評分` : `總分 ${sum} / ${total * 5}・平均 ${avg}・${judgeStatus(avg)}`;
    }
  }

  // 各面向平均徽章（只算已評分；該面向全未評顯示「—」）
  ASPECT_ORDER.forEach(a => {
    const badge = $id(`aspectAvg-${a}`);
    if (!badge) return;
    badge.classList.remove('lv-red', 'lv-yellow', 'lv-green', 'lv-none');
    if (!aCnt[a]) { badge.textContent = '—'; badge.classList.add('lv-none'); return; }
    const av = round1(aSum[a] / aCnt[a]);
    badge.textContent = av.toFixed(1);
    badge.classList.add(av >= 4 ? 'lv-green' : av >= 3 ? 'lv-yellow' : 'lv-red');
  });
}

// 自由品勢額外欄位顯示用：有值才回傳一列 review-row
function freestyleExtraHtml(rec) {
  if (rec.group !== FREESTYLE_GROUP) return '';
  const row = (label, v, unit) => (v !== undefined && v !== null && String(v).trim() !== '')
    ? `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${escapeHtml(String(v))}${unit || ''}</span></div>` : '';
  let html = row('空中踢擊完成', rec.aerialKickCount, ' 腳');
  html += row('落地失誤', rec.landingErrors, ' 次');
  html += row('解鎖高難度動作', rec.unlockedMoves, '');
  return html;
}

/* ============================================================
   5. 分數計算、狀態、最低三項
   ============================================================ */

// 從目前表單拉桿收集分數（30 項扁平模型）
// 回傳：scores 仍依面向分桶（給 findLowItems / rawScoresJson 相容）、
//       aspectAvg（六面向各 5 題平均）、total（30 項加總 /150）、
//       average（total / 項目數）、count。
function collectScores() {
  const sliders = Array.from(document.querySelectorAll('#kpiContainer .kpi-slider'));
  const scores = {};        // { aspectKey: { itemName: value } }
  const sums = {}, counts = {};
  let total = 0;
  sliders.forEach(s => {
    const v = parseInt(s.value, 10);
    const a = s.dataset.aspect, item = s.dataset.item;
    if (!scores[a]) { scores[a] = {}; sums[a] = 0; counts[a] = 0; }
    scores[a][item] = v;
    sums[a] += v; counts[a] += 1;
    total += v;
  });
  const aspectAvg = {};
  Object.keys(sums).forEach(a => { aspectAvg[a] = round1(sums[a] / counts[a]); });
  const count = sliders.length || 1;
  const average = round2(total / count);
  return { scores, aspectAvg, total: round2(total), average, count };
}

// 保留相容：由 aspectAvg 估總分（舊呼叫用；新流程直接用 collectScores 的 total）
function computeTotals(aspectAvg) {
  let total = 0, n = 0;
  Object.keys(aspectAvg || {}).forEach(k => { total += aspectAvg[k]; n++; });
  total = round2(total);
  const average = round2(n ? total / n : 0);
  return { total, average };
}

// 狀態判斷
function judgeStatus(average) {
  if (average >= 4.0) return '🟢 綠燈';
  if (average >= 3.0) return '🟡 黃燈';
  return '🔴 紅燈';
}

/*
   疲勞與恢復指數：100 起扣分 → 對應五級恢復狀態。
   input: { sleepHours, sleepQuality, rpe, soreness, bodyStatus, painScore }
*/
function computeRecovery(input) {
  let score = 100;
  const sh = parseFloat(input.sleepHours);
  const rpe = parseFloat(input.rpe);
  const sore = parseFloat(input.soreness);
  const pain = parseFloat(input.painScore);
  if (!isNaN(sh) && sh < 6) score -= 25;
  if (input.sleepQuality === '差') score -= 20;
  if (!isNaN(rpe) && rpe > 8) score -= 20;
  if (!isNaN(sore) && sore >= 4) score -= 20;
  if (!isNaN(pain)) { if (pain >= 7) score -= 30; else if (pain >= 4) score -= 15; }
  if (input.bodyStatus === '疲勞') score -= 15;
  else if (input.bodyStatus === '不舒服') score -= 25;
  else if (input.bodyStatus === '受傷中') score -= 40;
  if (score < 0) score = 0;

  let state;
  if (score >= 80) state = '恢復良好';
  else if (score >= 60) state = '可正常訓練';
  else if (score >= 40) state = '注意疲勞';
  else if (score >= 20) state = '建議降低強度';
  else state = '建議教練關懷';
  return { score: score, state: state };
}

// 紅燈原因分類：回傳如 ['技術紅燈','戰術紅燈','恢復紅燈']
function redLightCategories(scores, nutritionRisks, recoveryState) {
  const cats = [];
  const seen = {};
  Object.keys(scores || {}).forEach(aspectKey => {
    const items = scores[aspectKey] || {};
    const low = Object.keys(items).some(it => items[it] < 3);
    if (low) {
      const label = ASPECT_REDLABEL[aspectKey];
      if (label && label !== '整體' && !seen[label]) { seen[label] = true; cats.push(label + '紅燈'); }
    }
  });
  if (nutritionRisks && nutritionRisks !== '無明顯風險') cats.push('飲食紅燈');
  if (recoveryState === '建議降低強度' || recoveryState === '建議教練關懷') cats.push('恢復紅燈');
  return cats;
}

// 找出所有低於 3 分的細項，取最低三項（同分依出現順序）
function findLowItems(scores) {
  const list = [];
  Object.keys(scores || {}).forEach(aspectKey => {
    const items = scores[aspectKey] || {};
    Object.keys(items).forEach(itemName => {
      const v = items[itemName];
      if (v < 3) list.push({ item: itemName, score: v, aspect: aspectKey });
    });
  });
  // 穩定排序（同分保留出現順序）
  list.sort((a, b) => a.score - b.score);
  return list.slice(0, 3);
}

/* ============================================================
   6. BMI / 體重差距 / 體重變化
   ============================================================ */

function computeBmi(heightCm, weightKg) {
  const h = parseFloat(heightCm), w = parseFloat(weightKg);
  if (!h || !w) return null;
  const m = h / 100;
  return round1(w / m / m);
}

function computeWeightGap(weightKg, targetWeightKg) {
  const w = parseFloat(weightKg), t = parseFloat(targetWeightKg);
  if (isNaN(w) || isNaN(t)) return null;
  return round1(w - t);
}

// 即時更新 BMI 與差距顯示
function updateBmiDisplay() {
  const bmi = computeBmi($id('heightCm').value, $id('weightKg').value);
  $id('bmiDisplay').textContent = bmi !== null ? bmi : '--';
  const gap = computeWeightGap($id('weightKg').value, $id('targetWeightKg').value);
  if (gap === null) { $id('weightGapDisplay').textContent = '--'; return; }
  if (gap > 0) $id('weightGapDisplay').textContent = `還有 ${gap} kg`;
  else if (gap < 0) $id('weightGapDisplay').textContent = `已低於目標 ${Math.abs(gap)} kg`;
  else $id('weightGapDisplay').textContent = '已達目標';
}

// 體重變化提醒（與上次比較）
function weightChangeNote(currentWeight, lastWeight) {
  const cw = parseFloat(currentWeight), lw = parseFloat(lastWeight);
  if (isNaN(cw) || isNaN(lw)) return '';
  const diff = round1(cw - lw);
  if (diff <= -1.5) {
    return `本次體重下降較明顯（${lw} → ${cw} kg，下降 ${Math.abs(diff)} kg），請注意水分與恢復狀況，必要時請教練與家長一起關心。`;
  }
  if (diff >= 1.5) {
    return `本次體重變化較明顯（${lw} → ${cw} kg，上升 ${diff} kg），可能與水分、飲食或訓練恢復有關，請持續觀察，不需要過度焦慮。`;
  }
  return '';
}

/* ============================================================
   7. 飲食分析 analyzeNutrition（規則式 AI）
   ============================================================ */

function containsKeyword(text, keywords) {
  if (!text) return false;
  return keywords.some(k => text.indexOf(k) !== -1);
}
function isEmptyMeal(text) {
  if (!text) return true;
  const t = text.trim();
  return t === '' || t === '沒有' || t === '無' || t === '沒吃' || t === 'x' || t === 'X';
}

/*
   analyzeNutrition：回傳
   {
     risks: [風險字串...],
     student: 選手版建議,
     parent: 家長版建議,
     coach: 教練版觀察(陣列),
     nextGoal: 明日飲食小目標
   }
*/
function analyzeNutrition(data) {
  const { breakfast, lunch, dinner, snacksDrinks, waterIntake, lateNightSnack, trainingIntensity, bmi, weightKg } = data;
  const allFood = [breakfast, lunch, dinner, snacksDrinks].join(' ');

  // 快速勾選標籤（優先採用）；舊資料／沒勾選時自動退回關鍵字判斷。
  // 同時相容兩種來源：data.mealTags（送出時即時勾選）與餐點字串裡的 〔…〕（讀回的歷史紀錄）。
  const mt = data.mealTags || {};
  const allTags = [].concat(
    mt.breakfast || parseMeal(breakfast).tags,
    mt.lunch || parseMeal(lunch).tags,
    mt.dinner || parseMeal(dinner).tags,
    mt.snacksDrinks || parseMeal(snacksDrinks).tags
  );
  const hasTag = (label) => allTags.indexOf(label) !== -1;

  const hasProtein = hasTag('蛋白質') || containsKeyword(allFood, NUTRITION_KEYWORDS.protein);
  const hasVegetable = hasTag('蔬菜') || containsKeyword(allFood, NUTRITION_KEYWORDS.vegetable);
  const hasStaple = hasTag('主食') || containsKeyword(allFood, NUTRITION_KEYWORDS.staple);
  const hasFruit = hasTag('水果') || containsKeyword(allFood, NUTRITION_KEYWORDS.fruit);
  const hasSugary = hasTag('含糖飲料') || containsKeyword(snacksDrinks, NUTRITION_KEYWORDS.sugaryDrink) || containsKeyword(allFood, NUTRITION_KEYWORDS.sugaryDrink);
  const hasFried = hasTag('油炸') || containsKeyword(allFood, NUTRITION_KEYWORDS.friedOily);
  const lowWater = (waterIntake === '少於 500ml' || waterIntake === '500-1000ml');
  const hasLateNight = lateNightSnack && lateNightSnack !== '無';
  const heavyLateNight = lateNightSnack === '有，偏多';
  const isHighIntensity = (trainingIntensity === '高' || trainingIntensity === '比賽日');
  const isRecoveryDay = (trainingIntensity === '恢復日');
  // 早餐：文字空 且 沒勾任何早餐標籤，才算沒吃
  const breakfastTags = mt.breakfast || parseMeal(breakfast).tags;
  const noBreakfast = isEmptyMeal(parseMeal(breakfast).text) && (!breakfastTags || !breakfastTags.length);

  const risks = [];
  if (!hasProtein) risks.push('蛋白質不足');
  if (!hasVegetable) risks.push('蔬菜不足');
  if (lowWater) risks.push('水量不足');
  if (hasSugary) risks.push('含糖飲料偏多');
  if (heavyLateNight) risks.push('宵夜偏多');
  else if (hasLateNight) risks.push('宵夜風險');
  if (isHighIntensity && (!hasStaple || !hasProtein)) risks.push('訓練量高但飲食恢復不足');
  if (isHighIntensity && hasFried) risks.push('比賽／高強度前飲食偏油');
  if (isRecoveryDay && hasFried) risks.push('恢復日高熱量偏多');
  if (noBreakfast) risks.push('早餐不足');

  // ---- 選手版 ----
  const sParts = ['🍱 今日飲食建議', ''];
  if (isHighIntensity) sParts.push('你今天訓練量比較高，記得吃夠才有體力恢復。');
  if (!hasProtein) sParts.push('蛋白質稍微不足，建議補充：雞蛋、豆漿、雞肉、魚肉、豆腐。');
  if (!hasVegetable) sParts.push('蔬菜可以再多一點，幫助消化與恢復。');
  if (lowWater) sParts.push('今天水量偏少，明天訓練前記得先補水，避免體能下降。');
  if (hasSugary) sParts.push('含糖飲料可以慢慢減少，換成水或無糖飲品。');
  if (hasLateNight) sParts.push('睡前盡量少吃宵夜，讓身體好好恢復。');
  if (noBreakfast) sParts.push('早餐很重要，明天記得吃一份再來訓練。');
  if (sParts.length === 2) sParts.push('今天飲食大致均衡，繼續保持！');
  sParts.push('');
  sParts.push('記住：想變強，不只靠訓練，也靠吃對東西。');
  const student = sParts.join('\n');

  // ---- 家長版 ----
  const pParts = ['🍱 今日營養提醒', ''];
  if (isHighIntensity) pParts.push('孩子今日訓練量偏高，蛋白質與水分補充可以再加強。');
  else pParts.push('孩子今日的飲食狀況提供給您參考。');
  const proteinList = '蛋、魚、雞肉、豆腐、豆漿';
  if (!hasProtein || isHighIntensity) pParts.push(`建議晚餐可安排${proteinList}等優質蛋白，並增加蔬菜與水分。`);
  if (lowWater) pParts.push('今日水分偏少，可提醒孩子多喝水。');
  if (hasSugary) pParts.push('含糖飲料可適度減少，對訓練恢復更有幫助。');
  if (hasLateNight) pParts.push('睡前飲食可以再注意一下，幫助孩子睡眠與恢復。');
  pParts.push('');
  pParts.push('這不是要求孩子節食，而是幫助孩子恢復體能、穩定訓練狀態。');
  const parent = pParts.join('\n');

  // ---- 教練版（陣列，方便組裝） ----
  const coach = {
    intensity: trainingIntensity || '未填',
    weight: weightKg || '--',
    bmi: bmi !== null && bmi !== undefined ? bmi : '--',
    risks: risks.slice(),
    advice: isHighIntensity
      ? '明日提醒選手訓練後補充蛋白質與水分，避免恢復不足。'
      : '明日提醒選手維持均衡飲食，注意水分與蛋白質補充。'
  };

  // ---- 明日飲食小目標 ----
  let nextGoal = '維持均衡飲食，三餐定時。';
  if (lowWater) nextGoal = '訓練前補水，訓練後補充一份蛋白質。';
  else if (!hasProtein) nextGoal = '每餐加入一份蛋白質（蛋、豆漿、雞肉、魚或豆腐）。';
  else if (hasSugary) nextGoal = '把一杯含糖飲料換成水或無糖飲品。';
  else if (hasLateNight) nextGoal = '今晚減少宵夜，讓身體好好恢復。';

  // ---- 今日飲食優點 / 問題（青少年安全語氣）----
  const pros = [];
  if (hasProtein) pros.push('有吃到蛋白質，對肌肉修復很好');
  if (hasVegetable) pros.push('有攝取蔬菜，幫助消化與恢復');
  if (hasStaple) pros.push('有補充主食，訓練才有能量');
  if (hasFruit) pros.push('有吃水果，補充維生素與水分');
  if (!hasSugary) pros.push('沒有過多含糖飲料，很棒');
  if (!hasLateNight) pros.push('沒有吃宵夜，有助睡眠恢復');
  if (!pros.length) pros.push('今天有完成飲食紀錄，這就是好的開始');

  const problems = [];
  if (!hasProtein) problems.push('蛋白質偏少（蛋、豆漿、雞肉、魚、豆腐可補）');
  if (!hasVegetable) problems.push('蔬菜偏少');
  if (lowWater) problems.push('水量偏少');
  if (hasSugary) problems.push('含糖飲料偏多');
  if (heavyLateNight) problems.push('宵夜偏多');
  if (noBreakfast) problems.push('早餐不足');

  // ---- 賽前控重提醒（只在距目標過遠才顯示；青少年安全語氣，不提脫水/節食）----
  let weightControl = '';
  const gap = parseFloat(data.weightGap);
  if (!isNaN(gap) && gap >= 2) {
    weightControl = `目前體重距目標約 ${round1(gap)} kg。請用「規律三餐＋少含糖飲料與油炸、訓練量穩定」的方式慢慢調整，不要不吃飯、也不要脫水減重，安全最重要。如接近比賽再請教練協助安排。`;
  }

  // ---- 補水提醒 ----
  const hydration = lowWater
    ? '今天水分偏少，明天起訓練前先喝水，訓練中小口補水，訓練後也要補回流失的水分。'
    : '水分維持得不錯，繼續保持訓練前中後都有補水。';

  return { risks, student, parent, coach, nextGoal, pros, problems, weightControl, hydration };
}

/* ============================================================
   8. 上次表現回顧 / 今天我要改善
   ============================================================ */

// 從某筆紀錄取出六大面向平均
function aspectAvgFromRecord(rec) {
  const out = {};
  ASPECT_ORDER.forEach(k => {
    out[k] = parseFloat(rec[ASPECT_AVG_FIELD[k]]) || 0;
  });
  return out;
}

function recordScoreMax(rec) {
  // 優先依實際題數計算，兼容舊制 6/10 題與新制 30 題。
  try {
    const scores = JSON.parse((rec && rec.rawScoresJson) || '{}');
    let n = 0;
    Object.keys(scores).forEach(k => { n += Object.keys(scores[k] || {}).length; });
    if (n > 0) return n * 5;
  } catch (e) { /* 落回下面判斷 */ }
  const total = parseFloat(rec && rec.totalScore) || 0;
  if (total > 50) return 150;
  return total > 30 ? 50 : 30;
}

function presentAspectKeys(avg) {
  return ASPECT_ORDER.filter(k => avg && avg[k] !== undefined && avg[k] !== null && avg[k] !== '' && !isNaN(parseFloat(avg[k])));
}

function presentAspectKeysFromRecord(rec) {
  return ASPECT_ORDER.filter(k => {
    const v = rec && rec[ASPECT_AVG_FIELD[k]];
    return v !== undefined && v !== null && String(v) !== '' && !isNaN(parseFloat(v));
  });
}

function scoreMaxText(rec) {
  return `${rec.totalScore || 0} / ${recordScoreMax(rec)}`;
}

function scoreCountFromRecord(rec, scores) {
  let count = 0;
  Object.keys(scores || {}).forEach(k => { count += Object.keys(scores[k] || {}).length; });
  if (count) return count;
  return recordScoreMax(rec) / 5;
}

// 解析 lowItems 欄位（字串）成陣列文字
function parseLowItems(rec) {
  // 優先用 rawScoresJson 重新計算，否則用 lowItems 文字
  try {
    if (rec.rawScoresJson) {
      const scores = JSON.parse(rec.rawScoresJson);
      const low = findLowItems(scores);
      if (low.length) return low.map(l => `${l.item}：${l.score} 分`);
    }
  } catch (e) { /* ignore */ }
  if (rec.lowItems) return String(rec.lowItems).split('｜').filter(Boolean);
  return [];
}

// 顯示上次表現回顧卡片（在學生填寫頁）
function renderLastReview(rec, containerId, cardId) {
  const content = $id(containerId);
  const card = cardId ? $id(cardId) : null;

  if (!rec) {
    content.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。</div>`;
    if (card) card.style.display = 'block';
    renderImproveOptions([]); // 沒有上次 -> 顯示六大面向
    return;
  }

  const avg = aspectAvgFromRecord(rec);
  const lowItems = parseLowItems(rec);
  const nutritionRisks = rec.nutritionRisks || '無明顯風險';
  const status = rec.status || judgeStatus(parseFloat(rec.averageScore) || 0);

  // 今日提醒：用最低項組合 suggestionMap
  const remind = buildRemindText(lowItems);

  let html = '';
  html += `<div class="review-row"><span class="review-label">上次日期</span><span class="review-value">${dateSlash(rec.date)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${scoreMaxText(rec)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${status}</span></div>`;

  const presentKeys = presentAspectKeysFromRecord(rec);
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">面向平均</h4><div class="aspect-grid">`;
  presentKeys.forEach(k => {
    html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`;
  });
  html += `</div>`;
  html += radarFromRecord(rec);  // 六大面向雷達圖

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次身體狀態</h4>`;
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;

  // 當日飲食狀況（讓選手回顧前一天吃了什麼）
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
  html += `<div class="review-row"><span class="review-label">飲食風險</span><span class="review-value">${nutritionRisks}</span></div>`;

  if (lowItems.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次最低三項</h4><div>`;
    lowItems.forEach((s, i) => html += `<span class="tag tag-red">${i + 1}. ${s}</span>`);
    html += `</div>`;
  }

  html += `<div class="hint-box">📣 教練提醒：${remind}</div>`;

  content.innerHTML = html;
  if (card) card.style.display = 'block';

  // 今天我要改善：帶入上次最低三項
  renderImproveOptions(lowItems.map(s => s.split('：')[0]));
}

// 從最低項組合「今日提醒」文字
function buildRemindText(lowItems) {
  if (!lowItems || !lowItems.length) return '今天維持狀態，把每個動作做確實，就是進步。';
  const names = lowItems.map(s => s.split('：')[0]);
  const reminds = [];
  names.forEach(n => { if (suggestionMap[n]) reminds.push(suggestionMap[n].remind); });
  const top = names.slice(0, 2).join('」和「');
  let text = `昨天不是你不努力，而是「${top}」還需要更穩。`;
  if (reminds.length) text += ' ' + reminds[0];
  text += ' 今天訓練不要急著硬打，先把基本動作與距離做好。';
  return text;
}

// 渲染「今天我要改善」勾選項
function renderImproveOptions(itemNames) {
  const box = $id('improveOptions');
  if (!box) return;   // 「今天我要改善」已移除
  let options = itemNames;
  if (!options || !options.length) {
    // 沒有上次紀錄 -> 顯示六大面向
    options = ASPECT_ORDER.map(k => KPI_ASPECTS[k].label);
  }
  box.innerHTML = '';
  options.forEach((name, i) => {
    const id = `improve-${i}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${name}" id="${id}"> ${name}`;
    box.appendChild(label);
  });
  const card = $id('improveCard');
  if (card) card.style.display = 'block';
}

function getCheckedImproveTargets() {
  return Array.from(document.querySelectorAll('#improveOptions input:checked')).map(c => c.value);
}

/* ============================================================
   9. 取得上一筆紀錄（正式或本機）
   ============================================================ */

// 從本機紀錄取某選手最近一筆
function localLastRecord(name) {
  const recs = getLocalRecords().filter(r => r.name === name);
  if (!recs.length) return null;
  // 依 timestamp / date 排序
  recs.sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
  return recs[0];
}
function localRecentRecords(name, limit) {
  const recs = getLocalRecords().filter(r => r.name === name);
  recs.sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
  return recs.slice(0, limit || 7);
}

// 取得上一筆（先試正式 Web App，失敗或無 URL 則用本機）
async function fetchLastRecord(name) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getLastRecordByName', name: name });
      if (res && res.ok) return res.data; // data 可能是 null
    } catch (e) { /* 落回本機 */ }
  }
  return localLastRecord(name);
}

// 取得某選手最近 N 筆（正式優先，否則本機）
async function fetchRecentRecords(name, limit) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getRecentRecordsByName', name: name, limit: limit || 60 });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { /* 落回本機 */ }
  }
  return localRecentRecords(name, limit || 60);
}

async function fetchParents() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getParents' });
      if (res && res.ok && Array.isArray(res.data)) {
        saveParentsLocal(res.data);
        return res.data;
      }
    } catch (e) { /* 落回本機 */ }
  }
  return getParentsLocal();
}

async function fetchAttendanceReports(name, limit) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAttendanceReportsByName', studentName: name, name: name, limit: limit || 60 });
      if (res && res.ok && Array.isArray(res.data)) return normalizeAttendanceReports(res.data);
    } catch (e) { /* 落回本機 */ }
  }
  const local = getAttendanceReportsLocal().filter(r => String(r.studentName || r.name || '').trim() === String(name).trim());
  return normalizeAttendanceReports(local).slice(0, limit || 60);
}

async function fetchAllAttendanceReports() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAllAttendanceReports' });
      if (res && res.ok && Array.isArray(res.data)) return normalizeAttendanceReports(res.data);
    } catch (e) { /* 落回本機 */ }
  }
  return normalizeAttendanceReports(getAttendanceReportsLocal());
}

/* ============================================================
   9.6 進步肯定（跟昨天的自己比 / 成長型思維）
   ------------------------------------------------------------
   buildAffirmations：依今天這筆 rec、上一筆 last、歷史 history，
   算出徽章與具體肯定句。純前端計算，不寫入 Sheet。
   ============================================================ */

// 從一筆紀錄取某細項分數（找遍六大面向）
function itemScoreFromRecord(scoresObj, itemName) {
  for (let i = 0; i < ASPECT_ORDER.length; i++) {
    const k = ASPECT_ORDER[i];
    if (scoresObj[k] && scoresObj[k][itemName] != null) return scoresObj[k][itemName];
  }
  return null;
}

// Date -> yyyy-mm-dd
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function buildAffirmations(rec, last, history) {
  const badges = [];   // [{icon,label}]
  const lines = [];    // 具體肯定句
  const todayTotal = parseFloat(rec.totalScore) || 0;

  // 排除「今天這一天」的歷史（避免重送把自己當成過去）
  const past = (history || [])
    .filter(r => normDate(r.date) !== normDate(rec.date))
    .sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);

  // ① 弱項翻轉：上次最低項，今天變高
  if (last) {
    let lastScores = {}, todayScores = {};
    try { lastScores = JSON.parse(last.rawScoresJson || '{}'); } catch (e) { /* */ }
    try { todayScores = JSON.parse(rec.rawScoresJson || '{}'); } catch (e) { /* */ }
    const lastLow = findLowItems(lastScores); // 上次低於 3 分的最低三項
    let flipped = false;
    lastLow.forEach(l => {
      const todayVal = itemScoreFromRecord(todayScores, l.item);
      if (todayVal != null && todayVal > l.score) {
        lines.push(`「${l.item}」${l.score} → ${todayVal}，你把昨天的弱點練成了今天的成長！`);
        flipped = true;
      }
    });
    if (flipped) badges.push({ icon: '🔁', label: '弱項翻轉' });
  }

  // ② 總分進步
  const lastTotal = last ? (parseFloat(last.totalScore) || 0) : null;
  if (lastTotal != null && todayTotal > lastTotal) {
    badges.push({ icon: '⭐', label: '進步之星' });
  }

  // ③ 個人最佳 PB：超越歷史最佳總分
  if (past.length) {
    const prevBest = Math.max.apply(null, past.map(r => parseFloat(r.totalScore) || 0));
    if (todayTotal > prevBest) {
      badges.push({ icon: '🏆', label: '個人最佳' });
      lines.push(`總分 ${todayTotal}，刷新你的個人最佳紀錄（之前最佳 ${prevBest}）！`);
    }
  }

  // ④ 連續進步（今天 > 上次 且 上次 > 上上次）
  if (past.length >= 2) {
    const t0 = parseFloat(past[0].totalScore) || 0;
    const t1 = parseFloat(past[1].totalScore) || 0;
    if (todayTotal > t0 && t0 > t1) badges.push({ icon: '📈', label: '連續進步' });
  }

  // ⑤ 連續紀錄天數（含今天，往回數連續有填的日子）
  const dateSet = {};
  (history || []).forEach(r => { dateSet[normDate(r.date)] = true; });
  dateSet[normDate(rec.date)] = true;
  let streak = 0;
  const cur = new Date(rec.date);
  while (dateSet[ymd(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
  if (streak >= 2) badges.push({ icon: '🔥', label: `連續紀錄 ${streak} 天` });

  // ⑥ 狀態與健康習慣徽章
  if (String(rec.status).indexOf('綠') !== -1) badges.push({ icon: '🟢', label: '綠燈狀態' });
  if (rec.nutritionRisks === '無明顯風險') badges.push({ icon: '🥗', label: '飲食零風險' });
  if (rec.waterIntake === '2000ml 以上' || rec.waterIntake === '1500-2000ml') badges.push({ icon: '💧', label: '水分達標' });

  return { badges, lines };
}

/* ============================================================
   9.5 交叉辯論：更新紀錄 / 計算透明化 / 自評vs教練評
   ============================================================ */

// 更新某筆紀錄欄位（正式優先，本機同步；無 URL 則只更新本機）
async function updateRecordRemote(recordId, fields) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'updateRecord', recordId: recordId, fields: fields });
      if (res && res.ok) { updateLocalRecordFields(recordId, fields); return true; }
    } catch (e) { /* 落回本機 */ }
  }
  return updateLocalRecordFields(recordId, fields);
}
function updateLocalRecordFields(recordId, fields) {
  const arr = getLocalRecords();
  const r = arr.find(x => String(x.recordId) === String(recordId));
  if (r) { Object.assign(r, fields); localStorage.setItem(LS_KEYS.localRecords, JSON.stringify(arr)); return true; }
  return false;
}

// 是否已有教練複評
function hasCoachReview(rec) {
  return rec && rec.coachAverageScore !== undefined && rec.coachAverageScore !== null && String(rec.coachAverageScore) !== '';
}

// 從紀錄取教練六大面向
function coachAspectAvgFromRecord(rec) {
  const out = {};
  ASPECT_ORDER.forEach(k => out[k] = parseFloat(rec[COACH_ASPECT_FIELD[k]]) || 0);
  return out;
}

/* ---- 計算透明化：為什麼是這個燈號（native <details>，免額外 JS） ---- */
function explainStatusFromRecord(rec) {
  let scores = {};
  try { scores = JSON.parse(rec.rawScoresJson || '{}'); } catch (e) { /* */ }
  const avg = aspectAvgFromRecord(rec);
  const presentKeys = presentAspectKeysFromRecord(rec);
  const lowAspects = presentKeys.filter(k => avg[k] < 3).map(k => `${KPI_ASPECTS[k].label}（${avg[k]}）`);
  const low = findLowItems(scores);
  const count = scoreCountFromRecord(rec, scores);

  let inner = '';
  inner += `<div class="explain-line">平均 <b>${rec.averageScore}</b> ＝ 總分 <b>${rec.totalScore}</b> ÷ ${count}</div>`;
  inner += `<div class="explain-line">門檻：平均 ≥ 4.0 🟢　≥ 3.0 🟡　&lt; 3.0 🔴</div>`;
  if (lowAspects.length) inner += `<div class="explain-line">拉低的面向：${lowAspects.join('、')}</div>`;
  if (low.length) inner += `<div class="explain-line">最低細項：${low.map(l => `${l.item} ${l.score}分`).join('、')}</div>`;
  inner += `<div class="explain-line" style="color:var(--text-soft)">新紀錄為六面向共 30 項 KPI（滿分 150），平均分決定燈號；舊紀錄依原題數顯示。</div>`;

  return `<details class="explain"><summary>🔎 為什麼是「${rec.status}」？</summary><div class="explain-body">${inner}</div></details>`;
}

/* ---- 自評 vs 教練評對照 ---- */
function renderSelfVsCoach(rec) {
  if (!hasCoachReview(rec)) return '';
  const self = aspectAvgFromRecord(rec);
  const coach = coachAspectAvgFromRecord(rec);
  const keys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;

  let html = `<h4 style="margin:12px 0 6px;color:var(--blue)">⚖️ 自評 vs 教練評</h4>`;
  html += `<div class="table-scroll"><table class="record-table"><thead><tr><th>面向</th><th>自評</th><th>教練</th><th>差距</th></tr></thead><tbody>`;
  let bigGap = [];
  keys.forEach(k => {
    const s = self[k], c = coach[k];
    const gap = round1(c - s);
    let cls = 'tag-yellow';
    if (gap > 0) cls = 'tag-green'; else if (gap < 0) cls = 'tag-red';
    const flag = Math.abs(gap) >= 1 ? ' 💬' : '';
    if (Math.abs(gap) >= 1) bigGap.push(KPI_ASPECTS[k].label);
    html += `<tr><td>${KPI_ASPECTS[k].label}</td><td>${s}</td><td>${c}</td><td><span class="tag ${cls}">${gap > 0 ? '+' : ''}${gap}${flag}</span></td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="review-row"><span class="review-label">教練總分</span><span class="review-value">${rec.coachTotalScore} / ${keys.length * 5 || 30}（${rec.coachStatus || '-'}）</span></div>`;
  if (rec.coachComment) html += `<div class="hint-box">📣 教練評語：${escapeHtml(rec.coachComment)}</div>`;
  if (bigGap.length) html += `<div class="hint-box warn">💬 「${bigGap.join('、')}」你和教練看法差距較大，值得一起討論。<br><span style="color:var(--text-soft)">這裡是讓你說明想法，不是改分數，最終由教練綜合判斷。</span></div>`;
  return html;
}

/* ---- 六大面向雷達圖（純 SVG 手繪，不需任何圖表庫） ---- */
// selfAvg / coachAvg 皆為 { physical:.., technical:.., ... }；coachAvg 可省略
function radarChartSVG(selfAvg, coachAvg, opts) {
  const selfLabel = (opts && opts.selfLabel) || '自評';
  const coachLabel = (opts && opts.coachLabel) || '教練評';
  const size = 260, cx = size / 2, cy = size / 2, R = 88, MAX = 5;
  const labels = ['體能', '技術', '專注', '自律', '情緒', '戰術'];
  const keys = ASPECT_ORDER;

  // 第 i 軸、距中心 radius 的座標（從正上方開始，順時針每 60°）
  function polar(i, radius) {
    const ang = (-90 + i * 60) * Math.PI / 180;
    return [cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)];
  }
  function valuePoints(obj) {
    return keys.map((k, i) => {
      const v = Math.max(0, Math.min(MAX, parseFloat(obj[k]) || 0));
      const [x, y] = polar(i, R * v / MAX);
      return `${round1(x)},${round1(y)}`;
    }).join(' ');
  }

  // 背景同心多邊形（1~5 圈）
  let grid = '';
  for (let ring = 1; ring <= MAX; ring++) {
    const pts = keys.map((k, i) => { const [x, y] = polar(i, R * ring / MAX); return `${round1(x)},${round1(y)}`; }).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="#2c3442" stroke-width="1"/>`;
  }
  // 軸線 + 標籤
  let axes = '', labelSvg = '';
  for (let i = 0; i < 6; i++) {
    const [x, y] = polar(i, R);
    axes += `<line x1="${cx}" y1="${cy}" x2="${round1(x)}" y2="${round1(y)}" stroke="#2c3442" stroke-width="1"/>`;
    const [lx, ly] = polar(i, R + 20);
    labelSvg += `<text x="${round1(lx)}" y="${round1(ly)}" fill="#aab2c0" font-size="13" text-anchor="middle" dominant-baseline="middle">${labels[i]}</text>`;
  }
  // 自評多邊形（金）
  let poly = `<polygon points="${valuePoints(selfAvg)}" fill="rgba(245,197,24,0.25)" stroke="#f5c518" stroke-width="2.5"/>`;
  // 教練多邊形（藍虛線）
  let legend = `<span class="radar-leg"><i style="background:#f5c518"></i>${selfLabel}</span>`;
  if (coachAvg) {
    poly += `<polygon points="${valuePoints(coachAvg)}" fill="rgba(46,125,209,0.18)" stroke="#2e7dd1" stroke-width="2.5" stroke-dasharray="5 3"/>`;
    legend += `<span class="radar-leg"><i style="background:#2e7dd1"></i>${coachLabel}</span>`;
  }

  return `<div class="radar-wrap"><svg viewBox="0 0 ${size} ${size}" class="radar">${grid}${axes}${poly}${labelSvg}</svg><div class="radar-legend">${legend}</div></div>`;
}

// 從紀錄畫雷達圖（自動判斷有無教練評）
function radarFromRecord(rec) {
  const selfAvg = aspectAvgFromRecord(rec);
  const coachAvg = hasCoachReview(rec) ? coachAspectAvgFromRecord(rec) : null;
  return radarChartSVG(selfAvg, coachAvg);
}

/* ============================================================
   七天成長趨勢折線圖（純 SVG，股票走勢風）
   ============================================================ */

// series: [{label, value}] 由舊到新；range: {min,max}
function trendChartSVG(series, range) {
  const W = 640, H = 250, padL = 38, padR = 16, padT = 22, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = series.length;
  if (!n) return '<div class="hint-box">尚無足夠資料繪製趨勢。</div>';

  const minV = range.min, maxV = range.max, span = (maxV - minV) || 1;
  const xAt = i => padL + (n === 1 ? plotW / 2 : plotW * i / (n - 1));
  const yAt = v => padT + plotH * (1 - (Math.max(minV, Math.min(maxV, v)) - minV) / span);

  // 水平格線 + Y 軸刻度
  let grid = '';
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = minV + span * t / ticks;
    const y = yAt(val);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#2c3442" stroke-width="1"/>`;
    grid += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" fill="#aab2c0" font-size="11" text-anchor="end">${round1(val)}</text>`;
  }

  // 趨勢顏色：尾 >= 首 為綠（上升），否則紅
  const up = series[n - 1].value >= series[0].value;
  const lineColor = up ? '#2ecc71' : '#e74c3c';
  const areaColor = up ? 'rgba(46,204,113,0.16)' : 'rgba(231,76,60,0.16)';

  // 線與填色
  let dPath = '', area = '';
  series.forEach((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    dPath += `${cmd} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)} `;
  });
  area = dPath + `L ${xAt(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  // 資料點 + 數值 + X 軸日期
  let pts = '', xlabels = '';
  series.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.value);
    pts += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${lineColor}"/>`;
    pts += `<text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" fill="#f2f4f8" font-size="11" text-anchor="middle">${round1(p.value)}</text>`;
    xlabels += `<text x="${x.toFixed(1)}" y="${H - 12}" fill="#aab2c0" font-size="10.5" text-anchor="middle">${p.label}</text>`;
  });

  return `<div class="trend-wrap"><svg viewBox="0 0 ${W} ${H}" class="trend-chart">
    ${grid}
    <path d="${area}" fill="${areaColor}" stroke="none"/>
    <path d="${dPath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts}${xlabels}
  </svg></div>`;
}

// 把一筆紀錄的 KPI 表現換算成 0–100% 完成度（相容舊 /50 與新 /150 量表）。
// 優先用平均分（1–5，兩種量表通用）×20；沒有平均分時，依總分大小推估滿分基準。
function scorePercent(r) {
  const avg = parseFloat(r.averageScore);
  if (!isNaN(avg) && avg > 0) return round1(Math.min(100, avg * 20));
  const t = parseFloat(r.totalScore);
  if (isNaN(t) || t <= 0) return null; // 沒填 KPI 的當天回 null（趨勢圖會跳過，不畫成 0）
  const base = t > 50 ? 150 : 50; // >50 一定是新版 /150；否則視為舊版 /50
  return round1(Math.min(100, (t / base) * 100));
}

// 在 box 內渲染「可切換指標」的七天趨勢圖
function renderTrendSection(box, records, days, opts) {
  opts = opts || {};
  // 同一天只留一筆（新→舊）。不在這裡切片，改由「範圍選擇器」決定要看幾天。
  // 過濾未出席紀錄：請假日沒有 KPI/體重分數，留著會被當 0 分，使曲線假性暴跌、誤導 AI 分析。
  const allRecs = dedupeLatestByDate(records).filter(r => !isAbsenceRecord(r));
  if (allRecs.length < 2) {
    box.innerHTML = '<div class="hint-box">至少要 2 天的紀錄才看得出趨勢，繼續每天紀錄就會出現成長曲線！</div>';
    return;
  }

  const METRICS = [
    // 總分改為「完成度%」：KPI 量表歷經 /50（舊）與 /150（新）兩種滿分，
    // 直接畫原始總分會因基準不同而暴衝。改用平均分換算百分比（滿分 5 → 100%），
    // 新舊紀錄一致可比，不再有假跳動。
    { key: 'totalScore', label: '總分%', max: 100, min: 0, derive: scorePercent },
    { key: 'averageScore', label: '平均', max: 5, min: 0 },
    { key: 'physicalAvg', label: '體能', max: 5, min: 0 },
    { key: 'technicalAvg', label: '技術', max: 5, min: 0 },
    { key: 'focusAvg', label: '專注', max: 5, min: 0 },
    { key: 'disciplineAvg', label: '自律', max: 5, min: 0 },
    { key: 'emotionAvg', label: '情緒', max: 5, min: 0 },
    { key: 'tacticalAvg', label: '戰術', max: 5, min: 0 },
    { key: 'weightKg', label: '體重', max: null, min: null }
  ];
  let cur = METRICS[0];

  // 範圍選擇器：讓使用者把較舊的紀錄（如 5 月）也整合進來看
  // opts.picker === false（個人檔案的固定 7/30 兩張圖）則不顯示選擇器
  const showPicker = opts.picker !== false && allRecs.length > 7;
  const RANGES = [{ n: 7, label: '近 7 天' }];
  if (allRecs.length > 7) RANGES.push({ n: 30, label: '近 30 天' });
  if (allRecs.length > 30) RANGES.push({ n: 99999, label: '全部' });
  let range = Math.min(days || 7, allRecs.length);

  let html = '';
  if (showPicker) {
    html += `<div class="trend-range">`;
    RANGES.forEach(r => html += `<button type="button" class="trend-range-btn" data-range="${r.n}">${r.label}</button>`);
    html += `</div>`;
  }
  html += `<div class="trend-btns">`;
  METRICS.forEach(m => html += `<button type="button" class="trend-btn" data-key="${m.key}">${m.label}</button>`);
  html += `</div><div class="trend-chart-box"></div><div class="trend-summary"></div>`;
  html += `<button type="button" class="btn btn-secondary trend-ai-btn">🤖 AI 一鍵分析起伏</button><div class="trend-ai-box"></div>`;
  box.innerHTML = html;

  const chartBox = box.querySelector('.trend-chart-box');
  const summaryBox = box.querySelector('.trend-summary');
  const aiBox = box.querySelector('.trend-ai-box');

  function draw() {
    box.querySelectorAll('.trend-btn').forEach(b => b.classList.toggle('active', b.dataset.key === cur.key));
    box.querySelectorAll('.trend-range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.range, 10) === range));

    const recs = allRecs.slice(0, range).reverse(); // 取目前範圍，改為舊→新
    const valOf = r => {
      if (cur.derive) return cur.derive(r);
      const v = parseFloat(r[cur.key]);
      return isNaN(v) ? null : v;
    };
    // 沒填該指標的當天（值為 null）直接跳過，不畫成 0 造成假性暴跌
    const pts = recs.map(r => ({ r, v: valOf(r) })).filter(p => p.v !== null && p.v !== undefined);
    if (pts.length < 2) {
      chartBox.innerHTML = '<div class="hint-box">這個指標目前有效資料不足 2 天，無法畫出趨勢。</div>';
      summaryBox.innerHTML = '';
      return;
    }
    const vals = pts.map(p => p.v);
    let min = cur.min, max = cur.max;
    if (min === null || max === null) { // 體重：動態範圍
      const mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      min = Math.floor(mn - 1); max = Math.ceil(mx + 1);
      if (max - min < 2) max = min + 2;
    }
    const series = pts.map(p => ({ label: dateSlash(p.r.date).slice(5), value: p.v }));
    chartBox.innerHTML = trendChartSVG(series, { min, max });

    const first = vals[0], last = vals[vals.length - 1];
    const diff = round1(last - first);
    const dir = diff > 0 ? `📈 上升 ${diff}` : (diff < 0 ? `📉 下降 ${Math.abs(diff)}` : '➡️ 持平');
    summaryBox.innerHTML = `<b>${cur.label}</b>：${pts.length} 天從 <b>${round1(first)}</b> → <b>${round1(last)}</b>　<span class="${diff >= 0 ? 'up' : 'down'}">${dir}</span>`;
  }

  box.querySelectorAll('.trend-btn').forEach(b => b.addEventListener('click', () => {
    cur = METRICS.find(m => m.key === b.dataset.key) || METRICS[0];
    if (aiBox) aiBox.innerHTML = '';
    draw();
  }));
  box.querySelectorAll('.trend-range-btn').forEach(b => b.addEventListener('click', () => {
    range = Math.min(parseInt(b.dataset.range, 10), allRecs.length);
    if (aiBox) aiBox.innerHTML = '';
    draw();
  }));
  const aiBtn = box.querySelector('.trend-ai-btn');
  if (aiBtn) aiBtn.addEventListener('click', () => {
    const recs = allRecs.slice(0, range).reverse();
    aiBox.innerHTML = analyzeTrendSeries(recs, cur, METRICS);
  });
  draw();
}

/* ============================================================
   AI 趨勢分析（規則式）：解讀目前指標的起伏 + 跨面向掃描
   ------------------------------------------------------------
   recs：舊→新排序的紀錄；cur：目前選的指標；metrics：全部指標定義。
   純前端規則式（與 analyzeNutrition / buildCoachFeedback 同路線）。
   ============================================================ */
function analyzeTrendSeries(recs, cur, metrics) {
  if (!recs || recs.length < 2) return `<div class="hint-box">至少要 2 天紀錄才能分析起伏。</div>`;
  const valOf = (m, r) => {
    if (m.derive) return m.derive(r);
    const v = parseFloat(r[m.key]);
    return isNaN(v) ? null : v;
  };
  // 沒填該指標的當天排除，避免被當 0 分誤判成暴跌
  const pts = recs.map(r => ({ d: dateSlash(r.date).slice(5), v: valOf(cur, r) }))
    .filter(p => p.v !== null && p.v !== undefined)
    .map(p => ({ d: p.d, v: round1(p.v) }));
  if (pts.length < 2) return `<div class="hint-box">這個指標目前有效資料不足 2 天，無法分析起伏。</div>`;
  const vals = pts.map(p => p.v);
  const n = vals.length;
  const first = vals[0], last = vals[n - 1];
  const diff = round1(last - first);
  const higherBetter = cur.key !== 'weightKg';

  // 高峰 / 低谷
  let pk = 0, tr = 0;
  vals.forEach((v, i) => { if (v > vals[pk]) pk = i; if (v < vals[tr]) tr = i; });

  // 波動：相鄰變化的平均絕對值，相對於平均值歸一
  const swings = [];
  for (let i = 1; i < n; i++) swings.push(Math.abs(vals[i] - vals[i - 1]));
  const avgSwing = swings.length ? round1(swings.reduce((a, b) => a + b, 0) / swings.length) : 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const ratio = mean ? avgSwing / mean : 0;
  let volword, volcls;
  if (ratio < 0.05) { volword = '相當穩定'; volcls = 'good'; }
  else if (ratio < 0.12) { volword = '小幅起伏'; volcls = ''; }
  else { volword = '起伏明顯'; volcls = 'warn'; }

  // 結尾連續走向
  let streak = 1, sign = Math.sign(round1(vals[n - 1] - vals[n - 2]) || 0);
  for (let i = n - 2; i > 0; i--) {
    const s = Math.sign(round1(vals[i] - vals[i - 1]) || 0);
    if (s === sign && s !== 0) streak++; else break;
  }
  let momentum;
  if (sign > 0) momentum = `近 ${streak} 個紀錄${higherBetter ? '持續上升 📈' : '持續增加'}`;
  else if (sign < 0) momentum = `近 ${streak} 個紀錄${higherBetter ? '持續下滑 📉' : '持續下降'}`;
  else momentum = '最近持平';

  // 整體方向用語（體重中性，其他越高越好）
  let dirword, dircls;
  if (diff === 0) { dirword = '整體持平'; dircls = ''; }
  else if (!higherBetter) { dirword = `體重${diff > 0 ? '上升' : '下降'} ${Math.abs(diff)}`; dircls = ''; }
  else if (diff > 0) { dirword = `整體進步 +${diff}`; dircls = 'good'; }
  else { dirword = `整體下滑 ${diff}`; dircls = 'warn'; }

  // 跨面向掃描（六大面向，第一筆 vs 最後一筆）
  const aspectKeys = ['physicalAvg', 'technicalAvg', 'focusAvg', 'disciplineAvg', 'emotionAvg', 'tacticalAvg'];
  const ups = [], downs = [];
  aspectKeys.forEach(k => {
    const m = metrics.find(x => x.key === k); if (!m) return;
    const a = parseFloat(recs[0][k]), b = parseFloat(recs[recs.length - 1][k]);
    if (isNaN(a) || isNaN(b)) return;
    const d = round1(b - a);
    if (d >= 0.3) ups.push(`${m.label} +${d}`);
    else if (d <= -0.3) downs.push(`${m.label} ${d}`);
  });

  // 教練提醒
  let tip;
  if (!higherBetter) {
    tip = '體重變化請搭配訓練強度與目標體重一起看，短期波動多與水分有關，不需過度緊張。';
  } else if (diff > 0 && volcls !== 'warn') {
    tip = '走勢向上且穩定，保持目前的訓練與作息節奏，並把進步最多的面向變成習慣。';
  } else if (sign < 0 && streak >= 2) {
    tip = `留意近期連續下滑，先確認睡眠、疲勞與課業壓力${downs.length ? '，特別是「' + downs[0].split(' ')[0] + '」面向' : ''}，必要時和選手聊聊。`;
  } else if (volcls === 'warn') {
    tip = '分數起伏偏大，可能與睡眠、心情或訓練強度不穩有關，建議穩定作息、固定回報時間。';
  } else {
    tip = '整體大致持平，可挑一個面向設定明確小目標，創造下一段成長。';
  }

  let h = `<div class="trend-ai-card">`;
  h += `<div class="trend-ai-title">🤖 AI 起伏分析・<b>${escapeHtml(cur.label)}</b>（${n} 天）</div>`;
  h += `<ul class="trend-ai-list">`;
  h += `<li>走勢：<span class="tai ${dircls}">${dirword}</span>（${round1(first)} → ${round1(last)}）</li>`;
  h += `<li>波動：<span class="tai ${volcls}">${volword}</span>（平均每次變化 ${avgSwing}）</li>`;
  h += `<li>高峰：${pts[pk].d}（${pts[pk].v}）｜低谷：${pts[tr].d}（${pts[tr].v}）</li>`;
  h += `<li>近期動能：${momentum}</li>`;
  if (ups.length || downs.length) {
    h += `<li>面向掃描：`;
    if (ups.length) h += `<span class="tai good">📈 ${ups.join('、')}</span>　`;
    if (downs.length) h += `<span class="tai warn">📉 ${downs.join('、')}</span>`;
    h += `</li>`;
  }
  h += `</ul>`;
  h += `<div class="trend-ai-tip">💡 ${tip}</div>`;
  h += `</div>`;
  return h;
}

// 簡單 HTML 跳脫，避免使用者輸入破壞版面
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   10. 送出流程
   ============================================================ */

// 表單驗證
// 若欄位在收合的 <details> 內，先展開再聚焦，避免使用者看不到被提示的欄位
function focusField(id) {
  const el = $id(id);
  if (!el) return;
  let p = el.parentElement;
  while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
  el.focus();
}

function validateForm() {
  const group = $id('group').value;
  if (isAbsenceGroup(group)) {
    const required = [
      ['name', '選手姓名'], ['gradeClass', '年級／班級'], ['group', '組別'], ['absenceReason', '未出席訓練原因']
    ];
    for (const [id, label] of required) {
      const v = $id(id).value;
      if (!v || !String(v).trim()) { toast(`請填寫：${label}`); focusField(id); return false; }
    }
    return true;
  }
  const required = [
    ['name', '選手姓名'], ['gradeClass', '年級／班級'], ['group', '組別'],
    ['trainingTopic', '今日訓練主題'], ['reflection', '今日心得'], ['tomorrowGoal', '明日目標'],
    ['heightCm', '身高'], ['weightKg', '今日體重'],
    ['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'],
    ['waterIntake', '今日水量'], ['trainingIntensity', '今日訓練強度']
  ];
  for (const [id, label] of required) {
    const v = $id(id).value;
    if (!v || !String(v).trim()) { toast(`請填寫：${label}`); $id(id).focus(); return false; }
  }
  const h = parseFloat($id('heightCm').value);
  if (h < 100 || h > 220) { toast('身高似乎不合理，請確認（100–220 cm）'); $id('heightCm').focus(); return false; }
  const w = parseFloat($id('weightKg').value);
  if (w < 25 || w > 150) { toast('體重似乎不合理，請確認（25–150 kg）'); $id('weightKg').focus(); return false; }

  // KPI 必填：每一項都要實際滑過（打破「全留 3 分」），只在每日 KPI 開放時檢查
  if (isDailyKpiAvailable()) {
    const untouched = Array.from(document.querySelectorAll('#kpiContainer .kpi-slider'))
      .filter(s => s.dataset.touched !== '1');
    if (untouched.length) {
      const first = untouched[0];
      const sec = first.closest('.kpi-section');
      if (sec) sec.classList.remove('collapsed');     // 展開該面向方便評分
      toast(`還有 ${untouched.length} 項 KPI 沒評分，每一項都拉一下再送出`);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.focus();
      return false;
    }
  }

  return true;
}

// 收集整筆紀錄物件（六面向共 30 項 KPI；總分/150、平均決定燈號）
