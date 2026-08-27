(function () {
  'use strict';

  if (window.__TEAMPRO_KPI_REFACTOR__) return;
  window.__TEAMPRO_KPI_REFACTOR__ = true;

  // legacy 是全站既有的面向鍵（KPI_ASPECTS / 雷達圖 / 月報 / 準備度都吃這組），
  // 不能只用新的 mental/attitude/recovery，否則 focusAvg、disciplineAvg、emotionAvg 全部會變空值。
  const DAILY_ASPECTS = [
    { key: 'dailyTechnicalScore', aspect: 'technical', legacy: 'technical', label: '技術', icon: '🎯', hint: '今天的動作細節、準確度與穩定度。' },
    { key: 'dailyTacticalScore', aspect: 'tactical', legacy: 'tactical', label: '戰術', icon: '♟️', hint: '今天的距離、時機與攻防判斷。' },
    { key: 'dailyPhysicalScore', aspect: 'physical', legacy: 'physical', label: '體能', icon: '💪', hint: '今天的爆發、耐力與協調感。' },
    { key: 'dailyMentalScore', aspect: 'mental', legacy: 'focus', label: '心理', icon: '🧠', hint: '今天的專注、壓力與自信。' },
    { key: 'dailyAttitudeScore', aspect: 'attitude', legacy: 'discipline', label: '態度', icon: '🔥', hint: '今天的投入、紀律與修正速度。' },
    { key: 'dailyRecoveryScore', aspect: 'recovery', legacy: 'emotion', label: '恢復', icon: '🛌', hint: '今天的睡眠、痠痛、疼痛與身體恢復。' }
  ];

  const SCORE_HINTS = {
    1: '1 分：幾乎做不到，已影響訓練',
    2: '2 分：偶爾做到，但多次需要提醒',
    3: '3 分：基本完成，但表現不穩定',
    4: '4 分：多數時間能穩定完成，會自己修正',
    5: '5 分：疲勞或壓力下仍能穩定運用',
    na: 'N/A：今天沒有練到，無法判斷'
  };

  const REFLECTION_TYPES = [
    '我有進步',
    '我發現問題',
    '表現差不多',
    '身體不舒服',
    '今天沒有訓練'
  ];
  const REFLECTION_ASPECTS = ['技術', '戰術', '體能', '心理', '態度', '恢復／身體', '其他'];
  const REFLECTION_EVIDENCE = ['教練提醒', '隊友回饋', '自己實際成功／失敗', '影片看到', '對打或比賽結果', '身體感受', '目前無法確認'];
  const REFLECTION_RESULTS = ['有改善', '沒有改善', '還沒處理', '尚未驗證'];
  const NEXT_ACTION_TYPES = ['重複練習', '調整動作', '調整距離', '改變攻防方式', '請教練協助', '請隊友觀察', '休息或處理疼痛', '尚未想到'];
  const GENERIC_TEXT = ['很好', '還好', '普通', '很累', '加油', '努力', '更努力', '練好', '不知道', '沒什麼', '無', '沒有'];
  const DAILY_REFLECTION_VERSION = 'daily-6-reflection-v1';

  function $id(id) { return document.getElementById(id); }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function qsa(root, sel) { return Array.from((root || document).querySelectorAll(sel)); }
  function isNa(v) { return text(v).toUpperCase() === 'N/A'; }
  function normalizeChoice(value) {
    const v = text(value);
    if (!v) return '';
    if (v.toUpperCase() === 'N/A' || v === 'na') return 'na';
    return v;
  }
  function scoreToNumber(value) {
    const v = normalizeChoice(value);
    if (v === 'na' || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function aspectKeyToField(aspect) {
    const row = DAILY_ASPECTS.find(x => x.legacy === aspect || x.aspect === aspect);
    return row ? row.key : aspect;
  }
  function fieldToAspectKey(field) {
    const row = DAILY_ASPECTS.find(x => x.key === field);
    return row ? row.legacy : field;
  }
  function getSelectedChipTexts(boxId) {
    const box = $id(boxId);
    if (!box) return [];
    return qsa(box, '.chip.sel').map(el => text(el.dataset.value || el.textContent));
  }
  function setSelectedChipTexts(boxId, values) {
    const box = $id(boxId);
    if (!box) return;
    const want = (values || []).map(normalizeChoice);
    qsa(box, '.chip').forEach(btn => {
      const value = normalizeChoice(btn.dataset.value || btn.textContent);
      const on = want.indexOf(value) !== -1;
      btn.classList.toggle('sel', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function buildChoiceChips(boxId, values, selected) {
    const box = $id(boxId);
    if (!box) return;
    box.innerHTML = values.map(v => `<button type="button" class="chip${text(v).indexOf('不舒服') !== -1 ? ' chip-warn' : ''}" data-value="${esc(v)}">${esc(v)}</button>`).join('');
    setSelectedChipTexts(boxId, selected ? [selected] : []);
    qsa(box, '.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = normalizeChoice(btn.dataset.value || btn.textContent);
        const isOn = btn.classList.contains('sel');
        qsa(box, '.chip').forEach(other => {
          other.classList.remove('sel');
          other.setAttribute('aria-pressed', 'false');
        });
        if (!isOn) {
          btn.classList.add('sel');
          btn.setAttribute('aria-pressed', 'true');
        }
      });
    });
  }
  function genericResponse(v) {
    return GENERIC_TEXT.indexOf(text(v)) !== -1;
  }
  function scoreHint(v) {
    return SCORE_HINTS[normalizeChoice(v)] || '';
  }
  function dailySelections() {
    const out = {};
    DAILY_ASPECTS.forEach(aspect => {
      const card = $id(`daily-card-${aspect.key}`);
      out[aspect.key] = card ? normalizeChoice(card.dataset.value || '') : '';
    });
    return out;
  }
  function setDailySelection(field, value) {
    const card = $id(`daily-card-${field}`);
    if (!card) return;
    card.dataset.value = normalizeChoice(value);
    qsa(card, '[data-daily-value]').forEach(btn => {
      const v = normalizeChoice(btn.dataset.dailyValue);
      btn.classList.toggle('sel', v === normalizeChoice(value));
      btn.setAttribute('aria-pressed', v === normalizeChoice(value) ? 'true' : 'false');
    });
    const badge = $id(`daily-badge-${field}`);
    if (badge) {
      const selected = normalizeChoice(value);
      badge.textContent = selected === 'na' ? 'N/A' : (selected ? `${selected} 分` : '尚未評分');
      badge.className = 'kpi-aspect-avg ' + (selected === 'na' ? 'lv-none' : selected ? (Number(selected) >= 4 ? 'lv-green' : Number(selected) >= 3 ? 'lv-yellow' : 'lv-red') : 'lv-none');
    }
    const note = $id(`daily-note-${field}`);
    if (note) {
      const selected = normalizeChoice(value);
      note.textContent = selected ? scoreHint(selected) : `${aspectLabel(field)}：${DAILY_ASPECTS.find(x => x.key === field)?.hint || ''}`;
    }
    recalcDailySummary();
    updatePainCoachWrap();
  }
  function aspectLabel(field) {
    const row = DAILY_ASPECTS.find(x => x.key === field);
    return row ? row.label : field;
  }
  function renderDailyKpi() {
    const section = $id('standardKpiSection');
    const container = $id('kpiContainer');
    if (!section || !container) return;
    const legend = section.querySelector('legend');
    if (legend) legend.textContent = '今日六大面向快速自評 📈';
    section.style.display = isAbsenceGroup($id('group') ? $id('group').value : '') ? 'none' : '';
    const draft = readRefactorDraft();
    container.innerHTML = `
      <div class="kpi-aspect-head kpi-overall-head">
        <span>今日六大面向快速自評</span>
        <span class="kpi-aspect-avg" id="dailySummaryBadge">尚未評分</span>
      </div>
      <div class="kpi-section-list">
        ${DAILY_ASPECTS.map(aspect => `
          <section class="kpi-section daily-kpi-section" id="daily-card-${aspect.key}" data-field="${aspect.key}" data-value="">
            <div class="kpi-section-head">
              <span class="kpi-section-title">${aspect.icon} ${esc(aspect.label)}</span>
              <span class="kpi-section-right"><span class="kpi-aspect-avg lv-none" id="daily-badge-${aspect.key}">尚未評分</span></span>
            </div>
            <div class="kpi-section-body">
              <div class="kpi-item-row"><span class="kpi-item-name">${esc(aspect.hint)}</span></div>
              <div class="quick-chips daily-score-chips">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="chip" data-daily-value="${n}">${n}</button>`).join('')}
                <button type="button" class="chip chip-warn" data-daily-value="na">N/A</button>
              </div>
              <div class="daily-score-note" id="daily-note-${aspect.key}">${esc(aspect.hint)}</div>
            </div>
          </section>
        `).join('')}
      </div>`;

    qsa(container, '[data-daily-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-field]');
        if (!card) return;
        const field = card.dataset.field;
        const value = normalizeChoice(btn.dataset.dailyValue);
        const current = normalizeChoice(card.dataset.value);
        setDailySelection(field, current === value ? '' : value);
      });
    });

    DAILY_ASPECTS.forEach(aspect => {
      const selected = draft && draft._dailyScores ? draft._dailyScores[aspect.key] : '';
      setDailySelection(aspect.key, selected || '');
    });
    recalcDailySummary();
    updatePainCoachWrap();
  }

  function recalcDailySummary() {
    const scores = dailySelections();
    let sum = 0;
    let count = 0;
    let naCount = 0;
    let untouched = 0;
    DAILY_ASPECTS.forEach(aspect => {
      const value = scores[aspect.key];
      if (!value) {
        untouched += 1;
        return;
      }
      if (value === 'na') {
        naCount += 1;
        return;
      }
      const n = Number(value);
      if (Number.isFinite(n)) {
        sum += n;
        count += 1;
      }
    });
    const badge = $id('dailySummaryBadge');
    if (!badge) return;
    if (!count && !naCount && !untouched) {
      badge.textContent = '尚未評分';
      badge.className = 'kpi-aspect-avg lv-none';
      return;
    }
    if (!count) {
      badge.textContent = (!untouched && naCount) ? `全部 N/A｜${naCount} 項` : '尚未評分';
      badge.className = 'kpi-aspect-avg lv-none';
      return;
    }
    const avg = Math.round((sum / count) * 10) / 10;
    badge.textContent = `已評 ${DAILY_ASPECTS.length - untouched}/${DAILY_ASPECTS.length}・平均 ${avg}`;
    badge.className = 'kpi-aspect-avg ' + (avg >= 4 ? 'lv-green' : avg >= 3 ? 'lv-yellow' : 'lv-red');
    const sectionBadge = $id('kpiSummary');
    if (sectionBadge) {
      sectionBadge.textContent = `${avg >= 4 ? '🟢 綠燈' : avg >= 3 ? '🟡 黃燈' : '🔴 紅燈'}｜已完成 ${DAILY_ASPECTS.length - untouched}/${DAILY_ASPECTS.length} 項${naCount ? `｜N/A ${naCount}` : ''}`;
    }
  }

  function updatePainCoachWrap() {
    const wrap = $id('painCoachWrap');
    const score = Number(($id('painScore') && $id('painScore').value) || 0);
    const body = text($id('bodyStatus') && $id('bodyStatus').value);
    const needs = body === '身體不舒服' || body === '受傷中' || score >= 4;
    if (wrap) wrap.style.display = needs ? '' : 'none';
    const select = $id('painCoachInformed');
    if (needs && select && !text(select.value)) {
      select.value = score >= 4 ? '尚未告知' : '今天沒有這個問題';
    }
  }

  function collectDailyKpiBundle() {
    const scores = {};
    const aspectAvg = {};
    let sum = 0;
    let count = 0;
    const lowItems = [];
    DAILY_ASPECTS.forEach(aspect => {
      const value = normalizeChoice($id(`daily-card-${aspect.key}`) ? $id(`daily-card-${aspect.key}`).dataset.value : '');
      const field = fieldToAspectKey(aspect.key);
      scores[field] = {};
      if (!value) {
        // 留空白不塞進 scores：'' 會被 `< 3` 當成 0，變成假紅燈。
        aspectAvg[field] = null;
        return;
      }
      if (value === 'na') {
        scores[field][aspect.label] = 'N/A';
        aspectAvg[field] = null;
        return;
      }
      const n = Number(value);
      scores[field][aspect.label] = n;
      aspectAvg[field] = Math.round(n * 10) / 10;
      sum += n;
      count += 1;
      if (n < 3) lowItems.push({ item: aspect.label, score: n, aspect: field });
    });
    const total = count ? Math.round(sum * 10) / 10 : 0;
    const average = count ? Math.round((sum / count) * 10) / 10 : '';
    const status = average === '' ? '已完成回報' : (average >= 4 ? '🟢 綠燈' : average >= 3 ? '🟡 黃燈' : '🔴 紅燈');
    return {
      scores,
      aspectAvg,
      total,
      average,
      count,
      lowItems,
      lowItemsText: lowItems.map(l => `${l.item}：${l.score} 分`).join('｜'),
      recordFields: DAILY_ASPECTS.reduce((acc, aspect) => {
        const v = normalizeChoice($id(`daily-card-${aspect.key}`) ? $id(`daily-card-${aspect.key}`).dataset.value : '');
        acc[aspect.key] = v === '' ? '' : (v === 'na' ? 'N/A' : Number(v));
        return acc;
      }, {}),
      status
    };
  }

  function collectScores() {
    return collectDailyKpiBundle();
  }

  function collectReflectionMeta() {
    const meta = {
      reflectionType: getSelectedChipTexts('reflectionTypeChips')[0] || '',
      reflectionAspect: getSelectedChipTexts('reflectionAspectChips')[0] || '',
      reflectionEvent: text($id('reflection') && $id('reflection').value),
      reflectionEvidence: getSelectedChipTexts('reflectionEvidenceChips')[0] || '',
      reflectionResult: getSelectedChipTexts('reflectionResultChips')[0] || '',
      nextActionType: getSelectedChipTexts('nextActionTypeChips')[0] || '',
      nextAction: text($id('tomorrowGoal') && $id('tomorrowGoal').value)
    };
    return meta;
  }

  function composeReflectionText(meta) {
    const parts = [];
    if (meta.reflectionType) parts.push(`今天在${meta.reflectionAspect || '訓練'}方面${meta.reflectionType}`);
    if (meta.reflectionEvent) parts.push(`具體發生：${meta.reflectionEvent}`);
    if (meta.reflectionEvidence) parts.push(`證據來自${meta.reflectionEvidence}`);
    if (meta.reflectionResult) parts.push(`目前${meta.reflectionResult}`);
    return parts.join('，');
  }

  function composeTomorrowGoal(meta) {
    const next = meta.nextAction || '';
    if (!next) return '';
    if (meta.nextActionType && meta.nextActionType !== '尚未想到') return `${meta.nextActionType}：${next}`;
    return next;
  }

  function reportUsefulness(meta) {
    const eventText = meta.reflectionEvent || '';
    const nextText = meta.nextAction || '';
    const usableNextText = nextText === '尚未想到' ? '' : nextText;
    const specificEvent = eventText && !genericResponse(eventText) && eventText.length >= 8;
    const hasEvidence = !!text(meta.reflectionEvidence);
    const hasNext = !!usableNextText && !genericResponse(usableNextText);
    const actionable = hasNext && usableNextText.length >= 8;
    const score = [specificEvent, hasEvidence, hasNext, actionable].filter(Boolean).length;
    const label = score >= 4 ? '回報完整' : score === 3 ? '回報具體' : score === 2 ? '需要補充' : '建議教練追問';
    return { score, label, specificEvent, hasEvidence, hasNext, actionable };
  }

  function readRefactorDraft() {
    try {
      const raw = localStorage.getItem(LS_KEYS.formDraft);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function patchRefactorDraft(mutator) {
    try {
      const raw = localStorage.getItem(LS_KEYS.formDraft);
      const draft = raw ? JSON.parse(raw) : {};
      mutator(draft);
      localStorage.setItem(LS_KEYS.formDraft, JSON.stringify(draft));
    } catch (e) {}
  }

  function saveRefactorDraftExtras() {
    patchRefactorDraft(draft => {
      draft._dailyScores = dailySelections();
      draft._reflectionMeta = collectReflectionMeta();
      draft._painCoachInformed = text($id('painCoachInformed') && $id('painCoachInformed').value);
    });
  }

  function restoreRefactorDraftExtras() {
    const draft = readRefactorDraft();
    if (!draft) return false;
    if (draft._dailyScores) {
      Object.keys(draft._dailyScores).forEach(key => setDailySelection(key, draft._dailyScores[key]));
    }
    if (draft._reflectionMeta) {
      const meta = draft._reflectionMeta;
      setSelectedChipTexts('reflectionTypeChips', meta.reflectionType ? [meta.reflectionType] : []);
      setSelectedChipTexts('reflectionAspectChips', meta.reflectionAspect ? [meta.reflectionAspect] : []);
      setSelectedChipTexts('reflectionEvidenceChips', meta.reflectionEvidence ? [meta.reflectionEvidence] : []);
      setSelectedChipTexts('reflectionResultChips', meta.reflectionResult ? [meta.reflectionResult] : []);
      setSelectedChipTexts('nextActionTypeChips', meta.nextActionType ? [meta.nextActionType] : []);
      if ($id('reflection')) $id('reflection').value = meta.reflectionEvent || '';
      if ($id('tomorrowGoal')) $id('tomorrowGoal').value = meta.nextAction || '';
    }
    if ($id('painCoachInformed') && draft._painCoachInformed) $id('painCoachInformed').value = draft._painCoachInformed;
    recalcDailySummary();
    return true;
  }

  function updateDailyKpiVisibility() {
    const section = $id('standardKpiSection');
    if (!section) return;
    const absent = isAbsenceGroup($id('group') ? $id('group').value : '');
    section.style.display = absent ? 'none' : '';
  }

  function renderReflectionControls() {
    buildChoiceChips('reflectionTypeChips', REFLECTION_TYPES, readRefactorDraft()?._reflectionMeta?.reflectionType || '');
    buildChoiceChips('reflectionAspectChips', REFLECTION_ASPECTS, readRefactorDraft()?._reflectionMeta?.reflectionAspect || '');
    buildChoiceChips('reflectionEvidenceChips', REFLECTION_EVIDENCE, readRefactorDraft()?._reflectionMeta?.reflectionEvidence || '');
    buildChoiceChips('reflectionResultChips', REFLECTION_RESULTS, readRefactorDraft()?._reflectionMeta?.reflectionResult || '');
    buildChoiceChips('nextActionTypeChips', NEXT_ACTION_TYPES, readRefactorDraft()?._reflectionMeta?.nextActionType || '');
  }

  function clearReflectionControls() {
    ['reflectionTypeChips', 'reflectionAspectChips', 'reflectionEvidenceChips', 'reflectionResultChips', 'nextActionTypeChips'].forEach(id => {
      const box = $id(id);
      if (box) qsa(box, '.chip').forEach(btn => btn.classList.remove('sel'));
    });
  }

  function validateForm() {
    if (typeof syncGradeClassFields === 'function') syncGradeClassFields();
    if (typeof syncPainAreaField === 'function') syncPainAreaField();
    const group = text($id('group') && $id('group').value);
    const absent = isAbsenceGroup(group);
    const requiredBase = [
      ['name', '選手姓名'],
      ['schoolLevel', '學制'],
      ['grade', '年級'],
      ['classCode', '班級代碼'],
      ['group', '組別']
    ];
    for (const [id, label] of requiredBase) {
      const v = text($id(id) && $id(id).value);
      if (!v) { toast(`請填寫：${label}`); $id(id).focus(); return false; }
    }

    if (absent) {
      const miss = text($id('absenceReason') && $id('absenceReason').value);
      if (!miss) { toast('請填寫：未出席訓練原因'); $id('absenceReason').focus(); return false; }
      return true;
    }

    const required = [
      ['trainingMinutes', '今日訓練分鐘數'],
      ['trainingTopic', '今日訓練主題'],
      ['heightCm', '身高'],
      ['weightKg', '今日體重'],
      ['breakfast', '早餐'],
      ['lunch', '午餐'],
      ['dinner', '晚餐'],
      ['waterIntake', '今日水量'],
      ['trainingIntensity', '今日訓練強度']
    ];
    for (const [id, label] of required) {
      const v = text($id(id) && $id(id).value);
      if (!v) { toast(`請填寫：${label}`); focusField(id); return false; }
    }

    const numChecks = [
      ['trainingMinutes', '今日訓練分鐘數', 0, 360],
      ['sleepHours', '睡眠時數', 3, 14],
      ['soreness', '肌肉痠痛程度', 1, 7],
      ['rpe', 'RPE', 1, 10],
      ['painScore', '疼痛指數', 0, 10]
    ];
    for (const [id, label, min, max] of numChecks) {
      const raw = text($id(id) && $id(id).value);
      if (!raw) { toast(`請填寫：${label}`); focusField(id); return false; }
      const n = Number(raw);
      if (!Number.isFinite(n) || String(raw).match(/[^\d.-]/)) {
        toast(`${label} 必須是數字，不能填文字`);
        focusField(id);
        return false;
      }
      if (n < min || n > max) {
        toast(`${label} 必須介於 ${min}–${max}`);
        focusField(id);
        return false;
      }
    }

    if (Number($id('painScore').value) > 0 && !text($id('painArea').value)) {
      toast('疼痛指數大於 0 時，請選擇受傷／不適部位');
      focusField('painArea');
      return false;
    }

    const body = text($id('bodyStatus') && $id('bodyStatus').value);
    const pain = Number($id('painScore') && $id('painScore').value);
    if ((body === '身體不舒服' || body === '受傷中' || pain >= 4) && !text($id('painCoachInformed') && $id('painCoachInformed').value)) {
      toast('疼痛高分或身體不舒服時，請先補上是否已告知教練');
      focusField('painCoachInformed');
      return false;
    }

    const daily = dailySelections();
    const missing = DAILY_ASPECTS.filter(a => !daily[a.key]);
    if (missing.length) {
      toast(`還有 ${missing.length} 項今天尚未評分，請先選 1–5 或 N/A`);
      focusField(missing[0].key);
      return false;
    }

    const reflectionType = getSelectedChipTexts('reflectionTypeChips')[0] || '';
    const reflectionAspect = getSelectedChipTexts('reflectionAspectChips')[0] || '';
    const reflectionEvent = text($id('reflection') && $id('reflection').value);
    const evidence = getSelectedChipTexts('reflectionEvidenceChips')[0] || '';
    const result = getSelectedChipTexts('reflectionResultChips')[0] || '';
    const nextAction = text($id('tomorrowGoal') && $id('tomorrowGoal').value);
    const nextActionType = getSelectedChipTexts('nextActionTypeChips')[0] || '';

    if (!reflectionType || !reflectionAspect || !reflectionEvent || !evidence || !result || !nextAction || !nextActionType) {
      toast('請完成今日心得的三步驟與下一步');
      if (!reflectionType) focusField('reflectionTypeChips');
      else if (!reflectionAspect) focusField('reflectionAspectChips');
      else if (!reflectionEvent) focusField('reflection');
      else if (!evidence) focusField('reflectionEvidenceChips');
      else if (!result) focusField('reflectionResultChips');
      else if (!nextAction) focusField('tomorrowGoal');
      else focusField('nextActionTypeChips');
      return false;
    }

    if (genericResponse(reflectionEvent) || genericResponse(nextAction)) {
      toast('請把心得寫成具體事件與下一步，不要只填「很好／還好／加油」');
      if (genericResponse(reflectionEvent)) focusField('reflection');
      else focusField('tomorrowGoal');
      return false;
    }

    if (reflectionType === '今天沒有訓練' && !absent) {
      toast('如果今天沒有訓練，請把組別切成「未出席訓練」');
      focusField('group');
      return false;
    }

    return true;
  }

  function buildRecord() {
    const base = typeof window.__origBuildRecord === 'function' ? window.__origBuildRecord() : (typeof window._origBuildRecord === 'function' ? window._origBuildRecord() : null);
    const rec = base || {};
    const meta = collectReflectionMeta();
    const reflectionText = composeReflectionText(meta);
    const nextGoal = composeTomorrowGoal(meta);
    const daily = collectDailyKpiBundle();

    rec.reflection = reflectionText || rec.reflection || '';
    rec.tomorrowGoal = nextGoal || rec.tomorrowGoal || '';
    rec.reflectionMetaJson = JSON.stringify(meta);
    rec.instrumentVersion = DAILY_REFLECTION_VERSION;
    // 回報有用度只留一套算法：以 05-feedback-readiness 的 computeReportUsefulness 為準，
    // 這裡的 reportUsefulness() 只在該檔還沒載入時當備援（分數級距不同，不可混用）。
    const usefulness = (typeof computeReportUsefulness === 'function')
      ? computeReportUsefulness(rec)
      : reportUsefulness(meta);
    rec.reportUsefulness = usefulness.label;
    rec.reportUsefulnessScore = usefulness.score;
    rec.reportUsefulnessJson = JSON.stringify(usefulness);
    if (!isAbsenceGroup(rec.group)) {
      DAILY_ASPECTS.forEach(aspect => { rec[aspect.key] = daily.recordFields[aspect.key]; });
      rec.totalScore = daily.total;
      rec.averageScore = daily.average;
      rec.status = daily.status;
      rec.lowItems = daily.lowItemsText;
    }
    return rec;
  }

  function saveDraft() {
    if (typeof window.__origSaveDraft === 'function') window.__origSaveDraft();
    saveRefactorDraftExtras();
  }

  function restoreDraft() {
    const restored = typeof window.__origRestoreDraft === 'function' ? window.__origRestoreDraft() : false;
    restoreRefactorDraftExtras();
    renderReflectionControls();
    updatePainCoachWrap();
    return restored || !!readRefactorDraft();
  }

  function clearForm() {
    if (typeof window.__origClearForm === 'function') window.__origClearForm();
    clearReflectionControls();
    DAILY_ASPECTS.forEach(aspect => setDailySelection(aspect.key, ''));
    if ($id('painCoachInformed')) $id('painCoachInformed').value = '';
    updatePainCoachWrap();
    recalcDailySummary();
  }

  // 注意：原本 03-forms-scoring 的 renderKpiSliders 除了畫拉桿，還負責切換
  // #freestyleSection 與呼叫 toggleAbsenceReason()。組別下拉的 change handler
  // （10-init.js）就是靠它連動，覆寫時漏掉會讓「未出席訓練」選了卻看不到原因欄位，
  // 而 validateForm 又要求填 → 表單直接卡死送不出去。
  function renderKpiSliders(group) {
    const g = group == null ? ($id('group') ? $id('group').value : '') : group;
    const fsSection = $id('freestyleSection');
    if (fsSection) fsSection.style.display = (typeof isFreestyle === 'function' && isFreestyle(g)) ? '' : 'none';
    if (typeof window.toggleAbsenceReason === 'function') window.toggleAbsenceReason(g);
    renderDailyKpi();
    renderReflectionControls();
    updatePainCoachWrap();
  }

  function focusField(id) {
    const el = $id(id);
    if (!el) return;
    let p = el.parentElement;
    while (p) {
      if (p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
    if (typeof el.focus === 'function') el.focus();
  }

  // 先保留原始函式，讓每日其他區塊仍能沿用原流程，再在外層補上 refactor 版本。
  if (typeof window.buildRecord === 'function') window.__origBuildRecord = window.buildRecord;
  if (typeof window.saveDraft === 'function') window.__origSaveDraft = window.saveDraft;
  if (typeof window.restoreDraft === 'function') window.__origRestoreDraft = window.restoreDraft;
  if (typeof window.clearForm === 'function') window.__origClearForm = window.clearForm;
  if (typeof window.validateForm === 'function') window.__origValidateForm = window.validateForm;
  if (typeof window.renderKpiSliders === 'function') window.__origRenderKpiSliders = window.renderKpiSliders;
  if (typeof window.updatePainReadout === 'function') window.__origUpdatePainReadout = window.updatePainReadout;

  window.collectScores = collectScores;
  window.buildRecord = buildRecord;
  window.saveDraft = saveDraft;
  window.restoreDraft = restoreDraft;
  window.clearForm = clearForm;
  window.validateForm = validateForm;
  window.renderKpiSliders = renderKpiSliders;
  window.updateDailyKpiVisibility = updateDailyKpiVisibility;
  window.updatePainCoachWrap = updatePainCoachWrap;

  // 每日六大面向自評已經和「每週 30 項 KPI」脫鉤：不管教練有沒有開週 KPI，
  // 每天都要填。原本的 isDailyKpiAvailable() 綁在週 KPI session 上，
  // 會讓 toggleAbsenceReason 把 #standardKpiSection 藏起來，但 validateForm 又要求評分 → 送不出去。
  window.isDailyKpiAvailable = function () { return true; };

  if (typeof window.toggleAbsenceReason === 'function') {
    window.__origToggleAbsenceReason = window.toggleAbsenceReason;
    window.toggleAbsenceReason = function (group) {
      window.__origToggleAbsenceReason(group);
      updateDailyKpiVisibility();
    };
  }

  if (window.__origUpdatePainReadout) {
    window.updatePainReadout = function () {
      window.__origUpdatePainReadout();
      updatePainCoachWrap();
    };
  }

  // 初始化時先補一次選項。
  document.addEventListener('DOMContentLoaded', function () {
    renderReflectionControls();
    updatePainCoachWrap();
    renderDailyKpi();
  });
})();
