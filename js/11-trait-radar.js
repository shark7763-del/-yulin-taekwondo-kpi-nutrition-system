/* ============================================================
   學生特質雷達
   - 一次性情境測驗
   - 教練後台特質標籤 / 修正
   - appdata key: trait:<studentName>
   ============================================================ */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function notify(msg) { if (typeof toast === 'function') toast(msg); }
  function role() { try { return (typeof getRole === 'function') ? getRole() : null; } catch (e) { return null; } }
  function nameKey(name) { return String(name || '').trim(); }
  function traitKey(name) { return (typeof appKeyTrait === 'function') ? appKeyTrait(name) : 'trait:' + nameKey(name); }
  function appGetAsync(key) {
    return new Promise(resolve => {
      if (typeof appGet !== 'function') { resolve(null); return; }
      try {
        const immediate = appGet(key, data => resolve(data || null));
        if (immediate !== undefined) setTimeout(() => resolve(immediate || null), 0);
      } catch (e) { resolve(null); }
    });
  }

  const TRAITS = {
    rocket: {
      label: '火箭型',
      tone: 'rocket',
      keywords: ['啟動快', '目標感強', '喜歡速度'],
      communication: '先講目的，再講一個下一步。',
      encouragement: '先肯定他的啟動與執行，再給一個明確目標。',
      correction: '一次只修一個重點，示範後立刻讓他再做。',
      competitionReminder: '賽前給清楚流程與起手節奏，避免資訊太多。',
      setbackResponse: '先把節奏收回來，再拆成一個小步驟。',
      parentAdvice: '家長用短句肯定就好，不要連續追問。',
      avoid: '不要一次講太多，避免他抓不到重點。'
    },
    volcano: {
      label: '火山型',
      tone: 'volcano',
      keywords: ['能量大', '情緒熱', '爆發快'],
      communication: '先接住情緒，再給重點。',
      encouragement: '公開肯定很有效，但要短、明確、不要拖長。',
      correction: '先讓他冷卻 10 秒，再開始修動作。',
      competitionReminder: '賽前先穩呼吸和節奏，避免能量太滿。',
      setbackResponse: '先讓他把感受說完，再回到下一個動作。',
      parentAdvice: '先聽他講完，再給一句支持。',
      avoid: '不要在情緒上來時連續糾正。'
    },
    shield: {
      label: '盾牌型',
      tone: 'shield',
      keywords: ['重視安全', '喜歡穩定', '規則感'],
      communication: '先說清楚流程與安全感，再談修正。',
      encouragement: '給他穩定感與確定的步驟。',
      correction: '分步修正，不要一次改太多。',
      competitionReminder: '賽前需要確定的流程與固定節奏。',
      setbackResponse: '先確認他有沒有安全感，再慢慢往前推。',
      parentAdvice: '讓家長知道孩子需要穩定與清楚的步驟。',
      avoid: '不要突然改規則或一直換說法。'
    },
    cheetah: {
      label: '獵豹型',
      tone: 'cheetah',
      keywords: ['反應快', '看得快', '想立刻做'],
      communication: '講重點、講速度、講下一步。',
      encouragement: '用短句鼓勵，讓他直接進入行動。',
      correction: '給明確目標，做完就回饋。',
      competitionReminder: '賽前要幫他收斂，別讓他太急。',
      setbackResponse: '先停一下，再把下一個目標說小一點。',
      parentAdvice: '家長可以給快速肯定，不要拉太長。',
      avoid: '不要一直細碎講解，會讓他分心。'
    },
    growth: {
      label: '成長型',
      tone: 'growth',
      keywords: ['願意修正', '會反思', '持續累積'],
      communication: '先說哪裡有進步，再說下一步怎麼修。',
      encouragement: '把進步講具體，讓他知道自己有在前進。',
      correction: '用提問帶他自己想出修正方法。',
      competitionReminder: '賽前提醒他抓住流程與穩定感。',
      setbackResponse: '先整理發生了什麼，再把下一步排好。',
      parentAdvice: '家長適合問他今天學到什麼。',
      avoid: '不要只看結果，忽略他的累積。'
    }
  };

  const QUESTIONS = [
    {
      id: 'q1',
      q: '教練剛講完一個新動作，你最常先做什麼？',
      opts: [
        { text: '馬上試一次，先動起來再調整', type: 'rocket' },
        { text: '先把氣勢拉高，做起來才有感覺', type: 'volcano' },
        { text: '先確認安全、位置和步驟', type: 'shield' },
        { text: '先找最快抓到感覺的方法', type: 'cheetah' },
        { text: '先想為什麼要這樣做，再慢慢修', type: 'growth' }
      ]
    },
    {
      id: 'q2',
      q: '比賽前一晚，你最需要哪一種教練帶法？',
      opts: [
        { text: '直接告訴我今天要做哪三件事', type: 'rocket' },
        { text: '給我一句能把火點起來的話', type: 'volcano' },
        { text: '把流程講清楚，我就會安心', type: 'shield' },
        { text: '簡短有力，讓我立刻進入狀態', type: 'cheetah' },
        { text: '先回顧我這段時間的累積，再提醒下一步', type: 'growth' }
      ]
    },
    {
      id: 'q3',
      q: '如果今天被糾正，你通常會先有什麼反應？',
      opts: [
        { text: '我想立刻再試一次', type: 'rocket' },
        { text: '我會有點激動，但也想快點修好', type: 'volcano' },
        { text: '我需要先知道是不是安全、是不是做錯', type: 'shield' },
        { text: '我會想快點知道哪裡要改', type: 'cheetah' },
        { text: '我會先想為什麼錯，再自己調整', type: 'growth' }
      ]
    },
    {
      id: 'q4',
      q: '當你卡住時，哪種方式最有幫助？',
      opts: [
        { text: '給我一個明確目標，我就能衝', type: 'rocket' },
        { text: '先讓我把情緒放掉，再重新開始', type: 'volcano' },
        { text: '先把規則和步驟再說一次', type: 'shield' },
        { text: '直接給我一個短任務，我比較好動', type: 'cheetah' },
        { text: '先整理目前問題，再一個個修', type: 'growth' }
      ]
    },
    {
      id: 'q5',
      q: '在團隊裡，你比較像哪一種角色？',
      opts: [
        { text: '先帶頭開始做', type: 'rocket' },
        { text: '氣氛起來時我最有能量', type: 'volcano' },
        { text: '我喜歡把大家拉回穩定', type: 'shield' },
        { text: '我會提醒大家快速進入狀況', type: 'cheetah' },
        { text: '我喜歡邊做邊修，慢慢變好', type: 'growth' }
      ]
    },
    {
      id: 'q6',
      q: '如果今天訓練有點不順，你最容易怎麼想？',
      opts: [
        { text: '先把下一輪做好，別停太久', type: 'rocket' },
        { text: '我會有點悶，但很快又想拼回來', type: 'volcano' },
        { text: '先確認自己有沒有哪裡不舒服', type: 'shield' },
        { text: '我想快點找到問題點', type: 'cheetah' },
        { text: '我會想記下來，下次再修正', type: 'growth' }
      ]
    },
    {
      id: 'q7',
      q: '教練對你說話時，你最容易被哪一種方式帶動？',
      opts: [
        { text: '直接給任務，我就會做', type: 'rocket' },
        { text: '一句有感覺的提醒，我就會醒', type: 'volcano' },
        { text: '講清楚流程和標準，我最安心', type: 'shield' },
        { text: '短短幾句、節奏快，我最好接', type: 'cheetah' },
        { text: '先肯定我有進步，再說下一步', type: 'growth' }
      ]
    }
  ];

  const CHECKS = [
    '被糾正後會馬上調整',
    '遇到壓力會說出來',
    '需要被盯才會動',
    '會主動幫助隊友',
    '適合公開鼓勵',
    '適合私下提醒',
    '比賽前容易緊張',
    '對目標數字有反應'
  ];

  const state = {
    loaded: false,
    cacheRole: '',
    map: {},
    selectedCoach: '',
    quiz: null,
    studentCacheName: ''
  };

  function blankRecord(name) {
    return {
      studentName: name,
      version: 1,
      completedAt: '',
      updatedAt: '',
      updatedBy: '',
      typeKey: '',
      label: '',
      keywords: [],
      communication: '',
      encouragement: '',
      correction: '',
      competitionReminder: '',
      setbackResponse: '',
      parentAdvice: '',
      avoid: '',
      coachLabelOverride: '',
      coachChecks: {},
      coachNotes: '',
      surveyAnswers: {},
      rawScore: {}
    };
  }

  function mergeRecord(raw, name) {
    const record = blankRecord(name);
    if (!raw) return record;
    Object.keys(record).forEach(k => {
      if (raw[k] !== undefined && raw[k] !== null) record[k] = raw[k];
    });
    if (!record.studentName) record.studentName = name;
    if (!record.keywords || !Array.isArray(record.keywords)) record.keywords = [];
    if (!record.coachChecks || typeof record.coachChecks !== 'object') record.coachChecks = {};
    if (!record.surveyAnswers || typeof record.surveyAnswers !== 'object') record.surveyAnswers = {};
    if (!record.rawScore || typeof record.rawScore !== 'object') record.rawScore = {};
    return record;
  }

  function labelForKey(typeKey) {
    return (TRAITS[typeKey] && TRAITS[typeKey].label) || '未測驗';
  }

  function toneForKey(typeKey) {
    return (TRAITS[typeKey] && TRAITS[typeKey].tone) || 'none';
  }

  function effectiveLabel(record) {
    if (!record) return '未測驗';
    return record.coachLabelOverride || record.label || labelForKey(record.typeKey);
  }

  function traitBadgeHtml(name) {
    const record = state.map[nameKey(name)];
    const label = effectiveLabel(record);
    const tone = record ? toneForKey(record.coachLabelOverride ? record.coachLabelOverrideKey || record.typeKey : record.typeKey) : 'none';
    const title = record ? '點擊看完整特質卡' : '尚未完成特質測驗';
    return `<button type="button" class="trait-badge trait-badge-${esc(record ? tone : 'none')}" data-trait-open="${esc(nameKey(name))}" title="${esc(title)}">${esc(label)}</button>`;
  }

  function traitBadgeSpan(name) {
    const record = state.map[nameKey(name)];
    const label = effectiveLabel(record);
    const tone = record ? toneForKey(record.coachLabelOverride ? record.coachLabelOverrideKey || record.typeKey : record.typeKey) : 'none';
    const title = record ? '點擊看完整特質卡' : '尚未完成特質測驗';
    return `<span class="trait-badge trait-badge-${esc(record ? tone : 'none')} trait-badge-inline" data-trait-open="${esc(nameKey(name))}" title="${esc(title)}">${esc(label)}</span>`;
  }

  function traitNameHtml(name) {
    return `<span class="trait-name-wrap"><span class="trait-name-text">${esc(name)}</span>${traitBadgeHtml(name)}</span>`;
  }

  function traitNameInlineHtml(name) {
    return `<span class="trait-name-wrap"><span class="trait-name-text">${esc(name)}</span>${traitBadgeSpan(name)}</span>`;
  }

  function currentRecord(name) {
    return state.map[nameKey(name)] || null;
  }

  async function loadCache(force) {
    const r = role();
    const roleKey = r && r.role ? r.role : '';
    if (state.loaded && !force && state.cacheRole === roleKey) return state.map;
    try {
      state.map = {};
      if (r && r.role === 'student') {
        const name = studentName();
        if (name) {
          const raw = await loadStudentTrait(name);
          if (raw) state.map[name] = normalizeTraitRecord(raw, name);
        }
      } else if (r && r.role === 'coach') {
        const list = await loadAllStudentTraits();
        if (list && list.length) {
          list.forEach(item => {
            const key = nameKey(item.studentName || '');
            if (key) state.map[key] = normalizeTraitRecord(item, key);
          });
        }
      }
      state.cacheRole = roleKey;
    } catch (e) {}
    try { localStorage.setItem('yulin_trait_cache', JSON.stringify(state.map)); } catch (e) {}
    state.loaded = true;
    return state.map;
  }

  function loadLocalCache() {
    try {
      const raw = JSON.parse(localStorage.getItem('yulin_trait_cache') || '{}');
      if (raw && typeof raw === 'object') {
        state.map = {};
        Object.keys(raw).forEach(k => { state.map[nameKey(k)] = normalizeTraitRecord(raw[k], nameKey(k)); });
        state.loaded = true;
        state.cacheRole = role() && role().role ? role().role : '';
      }
    } catch (e) {}
  }

  function normalizeTraitRecord(raw, name) {
    const record = mergeRecord(raw || {}, nameKey(name));
    const rawScore = record.traitScore || record.rawScore || {};
    const typeKey = nameKey(record.traitType || record.typeKey || pickType(rawScore));
    const type = TRAITS[typeKey] || TRAITS.growth;
    const label = nameKey(record.traitLabel || record.label || type.label);
    record.studentName = nameKey(record.studentName || name);
    record.traitType = typeKey;
    record.typeKey = typeKey;
    record.traitLabel = label;
    record.label = label;
    record.traitScore = rawScore && typeof rawScore === 'object' ? rawScore : {};
    record.rawScore = record.traitScore;
    record.traitSummary = String(record.traitSummary || record.description || '').trim() || `${type.label}：${type.keywords.join('／')}`;
    record.description = record.traitSummary;
    record.communicationTips = String(record.communicationTips || record.communication || type.communication).trim();
    record.communication = record.communicationTips;
    record.trainingTips = String(record.trainingTips || record.correction || type.correction).trim();
    record.correction = record.trainingTips;
    record.keywords = Array.isArray(record.keywords) && record.keywords.length ? record.keywords.slice(0, 3) : type.keywords.slice(0, 3);
    record.encouragement = String(record.encouragement || type.encouragement).trim();
    record.competitionReminder = String(record.competitionReminder || type.competitionReminder).trim();
    record.setbackResponse = String(record.setbackResponse || type.setbackResponse).trim();
    record.parentAdvice = String(record.parentAdvice || type.parentAdvice).trim();
    record.avoid = String(record.avoid || type.avoid).trim();
    record.completedAt = record.completedAt || record.updatedAt || '';
    record.updatedAt = record.updatedAt || record.completedAt || '';
    return record;
  }

  function cacheTraitRecord(raw, name) {
    const record = normalizeTraitRecord(raw, name);
    const key = nameKey(record.studentName || name);
    if (!key) return null;
    state.map[key] = record;
    try { localStorage.setItem('yulin_trait_cache', JSON.stringify(state.map)); } catch (e) {}
    state.loaded = true;
    state.cacheRole = role() && role().role ? role().role : state.cacheRole;
    return record;
  }

  function overlayTraitRecord(base, overlay) {
    if (!base) return normalizeTraitRecord(overlay || {}, (overlay && overlay.studentName) || '');
    if (!overlay) return normalizeTraitRecord(base, base.studentName || '');
    const merged = Object.assign({}, base);
    ['coachLabelOverride', 'coachLabelOverrideKey', 'coachChecks', 'coachNotes', 'completedAt', 'updatedAt', 'updatedBy'].forEach(k => {
      if (overlay[k] !== undefined && overlay[k] !== null && overlay[k] !== '') merged[k] = overlay[k];
    });
    if (overlay.label) merged.traitLabel = overlay.label;
    if (overlay.typeKey) merged.traitType = overlay.typeKey;
    if (overlay.description) merged.traitSummary = overlay.description;
    if (overlay.keywords) merged.keywords = overlay.keywords;
    if (overlay.communicationTips) merged.communicationTips = overlay.communicationTips;
    if (overlay.trainingTips) merged.trainingTips = overlay.trainingTips;
    if (overlay.communication) merged.communication = overlay.communication;
    if (overlay.correction) merged.correction = overlay.correction;
    if (overlay.encouragement) merged.encouragement = overlay.encouragement;
    if (overlay.avoid) merged.avoid = overlay.avoid;
    if (overlay.competitionReminder) merged.competitionReminder = overlay.competitionReminder;
    if (overlay.setbackResponse) merged.setbackResponse = overlay.setbackResponse;
    if (overlay.parentAdvice) merged.parentAdvice = overlay.parentAdvice;
    if (overlay.rawScore) merged.traitScore = overlay.rawScore;
    if (overlay.answers) merged.surveyAnswers = overlay.answers;
    return normalizeTraitRecord(merged, merged.studentName || base.studentName || '');
  }

  async function traitApi(action, payload) {
    if (!getWebAppUrl()) return null;
    try {
      const res = await postToWebApp(Object.assign({ action: action }, payload || {}));
      return res && res.ok ? res : null;
    } catch (e) {
      return null;
    }
  }

  async function loadStudentTrait(name) {
    const student = nameKey(name || studentName());
    if (!student) return null;
    const cached = currentRecord(student);
    if (cached && cached.studentName) return cached;
    const res = await traitApi('getStudentTrait', { studentName: student });
    let rec = res && res.trait ? res.trait : null;
    const overlay = typeof appGetAsync === 'function' ? await appGetAsync(traitKey(student)) : null;
    if (rec && overlay) rec = overlayTraitRecord(rec, overlay);
    if (rec) return cacheTraitRecord(rec, student);
    if (overlay) return cacheTraitRecord(overlay, student);
    const local = currentRecord(student);
    return local && local.studentName ? local : null;
  }

  async function loadAllStudentTraits() {
    const res = await traitApi('getAllStudentTraits', {});
    let overlays = {};
    try {
      if (typeof appGetAll === 'function') overlays = await appGetAll('trait:');
    } catch (e) { overlays = {}; }
    const list = [];
    if (res && Array.isArray(res.traits)) {
      res.traits.forEach(item => {
        const name = item.studentName || '';
        const overlay = overlays[traitKey(name)] || overlays['trait:' + nameKey(name)] || overlays['trait:' + String(name || '').trim()];
        const rec = cacheTraitRecord(overlay ? overlayTraitRecord(item, overlay) : item, name);
        if (rec) list.push(rec);
      });
    }
    Object.keys(overlays || {}).forEach(key => {
      const name = nameKey(String(key).replace(/^trait:/, ''));
      if (!name || state.map[name]) return;
      const rec = cacheTraitRecord(overlays[key], name);
      if (rec) list.push(rec);
    });
    return list;
  }

  function scoreResult(answers) {
    const score = { rocket: 0, volcano: 0, shield: 0, cheetah: 0, growth: 0 };
    QUESTIONS.forEach(q => {
      const a = answers[q.id];
      if (!a) return;
      score[a] = (score[a] || 0) + 1;
    });
    return score;
  }

  function pickType(score) {
    return Object.keys(score).sort((a, b) => {
      if (score[b] !== score[a]) return score[b] - score[a];
      return ['growth', 'shield', 'rocket', 'cheetah', 'volcano'].indexOf(a) - ['growth', 'shield', 'rocket', 'cheetah', 'volcano'].indexOf(b);
    })[0] || 'growth';
  }

  function buildRecord(name, answers) {
    const score = scoreResult(answers);
    const typeKey = pickType(score);
    const type = TRAITS[typeKey] || TRAITS.growth;
    const summary = `${type.label}：${type.keywords.join('／')}。${type.communication}`;
    return {
      studentName: name,
      version: 1,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'student',
      traitType: typeKey,
      traitLabel: type.label,
      traitScore: score,
      traitSummary: summary,
      communicationTips: type.communication,
      trainingTips: type.correction,
      typeKey: typeKey,
      label: type.label,
      keywords: type.keywords.slice(0, 3),
      communication: type.communication,
      encouragement: type.encouragement,
      correction: type.correction,
      competitionReminder: type.competitionReminder,
      setbackResponse: type.setbackResponse,
      parentAdvice: type.parentAdvice,
      avoid: type.avoid,
      coachLabelOverride: '',
      coachChecks: {},
      coachNotes: '',
      surveyAnswers: answers,
      rawScore: score
    };
  }

  function completed(name) {
    const rec = currentRecord(name);
    return !!(rec && rec.completedAt);
  }

  function studentName() {
    const r = role();
    return nameKey(r && r.name);
  }

  function resultHtml(record, name) {
    const normalized = record ? normalizeTraitRecord(record, name) : null;
    const display = normalized ? (normalized.coachLabelOverride || normalized.traitLabel || normalized.label || labelForKey(normalized.typeKey)) : '未測驗';
    const catalog = normalized ? (TRAITS[normalized.typeKey] || TRAITS.growth) : TRAITS.growth;
    return `
      <div class="trait-hero">
        <div class="trait-hero-title">你的目前特質</div>
        <div class="trait-hero-label">${esc(display)}</div>
        <div class="trait-hero-note">這不是固定標籤，只是幫助教練更了解你的學習與溝通方式。</div>
      </div>
      <div class="trait-summary-strip">
        <div class="trait-summary-chip ${catalog.tone}">${esc(display)}</div>
        <div class="trait-summary-chip none">${esc((normalized && normalized.traitSummary) || (catalog.keywords.join('／')))}</div>
      </div>
      <div class="trait-detail-grid">
        <div class="trait-detail-card"><h4>三個關鍵字</h4><p>${esc((normalized && normalized.keywords && normalized.keywords.join('／')) || catalog.keywords.join('／'))}</p></div>
        <div class="trait-detail-card"><h4>特質摘要</h4><p>${esc((normalized && normalized.traitSummary) || `${display}：${catalog.keywords.join('／')}`)}</p></div>
        <div class="trait-detail-card"><h4>適合的溝通方式</h4><p>${esc((normalized && normalized.communicationTips) || (normalized ? normalized.communication : catalog.communication))}</p></div>
        <div class="trait-detail-card"><h4>訓練安排建議</h4><p>${esc((normalized && normalized.trainingTips) || (normalized ? normalized.correction : catalog.correction))}</p></div>
        <div class="trait-detail-card"><h4>適合的鼓勵方式</h4><p>${esc((normalized && normalized.encouragement) || catalog.encouragement)}</p></div>
        <div class="trait-detail-card"><h4>修正動作建議</h4><p>${esc((normalized && normalized.correction) || catalog.correction)}</p></div>
        <div class="trait-detail-card"><h4>比賽前提醒</h4><p>${esc((normalized && normalized.competitionReminder) || catalog.competitionReminder)}</p></div>
        <div class="trait-detail-card"><h4>遇到挫折時</h4><p>${esc((normalized && normalized.setbackResponse) || catalog.setbackResponse)}</p></div>
        <div class="trait-detail-card"><h4>家長溝通建議</h4><p>${esc((normalized && normalized.parentAdvice) || catalog.parentAdvice)}</p></div>
        <div class="trait-detail-card"><h4>不建議的帶法</h4><p>${esc((normalized && normalized.avoid) || catalog.avoid)}</p></div>
      </div>
      <div class="trait-disclaimer">本測驗僅作為教練教學與溝通參考，不作為心理診斷、醫療判斷或升學篩選依據。學生特質會隨著年齡、訓練經驗與環境改變，結果僅代表目前傾向。</div>
    `;
  }

  async function renderStudentTraitCard(studentNameValue, container, opts) {
    const mount = typeof container === 'string' ? el(container) : container;
    if (!mount) return null;
    const name = nameKey(studentNameValue || studentName());
    const options = opts || {};
    let rec = currentRecord(name);
    if (!rec || !rec.studentName) {
      const roleName = role() && role().role;
      if (roleName === 'coach') {
        await loadAllStudentTraits();
        rec = currentRecord(name);
      } else {
        rec = await loadStudentTrait(name);
      }
    }
    const html = rec ? `
      <div class="student-trait-card">
        <div class="student-trait-title">選手特質卡</div>
        <div class="student-trait-label">${esc(name)}｜${esc(effectiveLabel(rec))}</div>
        <div class="student-trait-section">${escapeHtml((rec.traitSummary || rec.description || '')).replace(/\n/g, '<br>')}</div>
        <div class="student-trait-section"><b>教練溝通建議：</b>${escapeHtml(rec.communicationTips || rec.communication || '')}</div>
        <div class="student-trait-section"><b>訓練安排建議：</b>${escapeHtml(rec.trainingTips || rec.correction || '')}</div>
      </div>` : `
      <div class="student-trait-card">
        <div class="student-trait-title">選手特質卡</div>
        <div class="student-trait-empty">尚未完成特質卡測驗</div>
      </div>`;
    if (options.replace === false) mount.insertAdjacentHTML('beforeend', html);
    else mount.innerHTML = html;
    return rec;
  }

  async function attachTraitToCoachContext(playerContext) {
    const ctx = playerContext || {};
    const name = nameKey(ctx.name || ctx.studentName || '');
    if (!name) return ctx;
    const rec = await loadStudentTrait(name);
    if (rec) {
      ctx.traitType = rec.traitType || rec.typeKey || '';
      ctx.traitLabel = rec.traitLabel || rec.label || '';
      ctx.traitScore = rec.traitScore || rec.rawScore || {};
      ctx.traitSummary = rec.traitSummary || rec.description || '';
      ctx.communicationTips = rec.communicationTips || rec.communication || '';
      ctx.trainingTips = rec.trainingTips || rec.correction || '';
    }
    return ctx;
  }

  function renderStudentIntro() {
    const root = el('traitRadarRoot');
    if (!root) return;
    const name = studentName();
    const record = currentRecord(name);
    root.innerHTML = `
      <div class="trait-page-grid">
        <div class="trait-panel">
          <div class="trait-page-kicker">學生特質雷達</div>
          <h3 class="card-title">完成我的成長風格測驗</h3>
          <p class="review-label">大約 5 分鐘，會用情境題快速了解你偏好的學習方式、溝通方式、動機來源、壓力反應與團隊角色。</p>
          <div class="trait-disclaimer">本測驗僅作為教練教學與溝通參考，不作為心理診斷、醫療判斷或升學篩選依據。學生特質會隨著年齡、訓練經驗與環境改變，結果僅代表目前傾向。</div>
          <div class="trait-start-row">
            <button type="button" class="btn btn-primary" data-trait-start="1">${record && record.completedAt ? '重新測驗' : '開始測驗'}</button>
          </div>
          <div class="trait-intro-list">
            <div>情境題，不像考試。</div>
            <div>完成後會顯示你目前偏向的特質類型。</div>
            <div>教練可以在後台看到標籤與建議。</div>
          </div>
        </div>
        <div class="trait-panel">
          ${record && record.completedAt ? resultHtml(record, name) : '<div class="hint-box">完成測驗後，這裡會顯示你的特質雷達結果。</div>'}
        </div>
      </div>`;
  }

  function renderStudentQuiz() {
    const root = el('traitRadarRoot');
    if (!root) return;
    const q = state.quiz;
    if (!q) {
      renderStudentIntro();
      return;
    }
    const idx = q.index || 0;
    const question = QUESTIONS[idx];
    const total = QUESTIONS.length;
    const progress = Math.round((idx / total) * 100);
    const selected = q.answers[question.id];
    root.innerHTML = `
      <div class="trait-page-grid">
        <div class="trait-panel trait-quiz-panel">
          <div class="trait-page-kicker">學生特質雷達</div>
          <h3 class="card-title">完成我的成長風格測驗</h3>
          <div class="trait-progress"><span style="width:${progress}%"></span></div>
          <div class="trait-progress-text">第 ${idx + 1} / ${total} 題</div>
          <div class="trait-question">${esc(question.q)}</div>
          <div class="trait-options">
            ${question.opts.map(opt => `
              <button type="button" class="trait-option ${selected === opt.type ? 'active' : ''}" data-trait-answer="${esc(opt.type)}" data-trait-q="${esc(question.id)}">
                <span class="trait-option-text">${esc(opt.text)}</span>
                <span class="trait-option-arrow">›</span>
              </button>`).join('')}
          </div>
          <div class="trait-quiz-actions">
            <button type="button" class="btn btn-ghost" data-trait-back ${idx > 0 ? '' : 'disabled'}>上一題</button>
            <span class="trait-quiz-hint">情境題，直接選最像你的那個</span>
          </div>
          <div class="trait-disclaimer">本測驗僅作為教練教學與溝通參考，不作為心理診斷、醫療判斷或升學篩選依據。學生特質會隨著年齡、訓練經驗與環境改變，結果僅代表目前傾向。</div>
        </div>
        <div class="trait-panel">
          <div class="hint-box">做完後會產生特質標籤給教練參考。這不是固定標籤，只是目前傾向。</div>
        </div>
      </div>`;
  }

  function renderStudentResult() {
    const root = el('traitRadarRoot');
    if (!root) return;
    const name = studentName();
    const record = currentRecord(name);
    root.innerHTML = `
      <div class="trait-page-grid">
        <div class="trait-panel">
          <div class="trait-page-kicker">學生特質雷達</div>
          <h3 class="card-title">完成我的成長風格測驗</h3>
          <div class="trait-result-name">${esc(name)}｜${esc(effectiveLabel(record))}</div>
          <div class="trait-disclaimer">本測驗僅作為教練教學與溝通參考，不作為心理診斷、醫療判斷或升學篩選依據。學生特質會隨著年齡、訓練經驗與環境改變，結果僅代表目前傾向。</div>
          <div class="trait-start-row">
            <button type="button" class="btn btn-primary" data-trait-start="1">重新測驗</button>
          </div>
        </div>
        <div class="trait-panel">${resultHtml(record, name)}</div>
      </div>`;
  }

  function quizStateReset() {
    state.quiz = { name: studentName(), index: 0, answers: {} };
  }

  function moveQuiz(delta) {
    if (!state.quiz) return;
    const next = Math.max(0, Math.min(QUESTIONS.length - 1, state.quiz.index + delta));
    state.quiz.index = next;
    renderStudentQuiz();
  }

  async function saveStudentTraitResult(result) {
    const payload = result || {};
    const name = nameKey(payload.studentName || studentName());
    if (!name) return false;
    const record = normalizeTraitRecord(Object.assign({}, payload, {
      studentName: name,
      traitType: payload.traitType || payload.typeKey || '',
      traitLabel: payload.traitLabel || payload.label || '',
      traitScore: payload.traitScore || payload.rawScore || {},
      traitSummary: payload.traitSummary || payload.description || '',
      communicationTips: payload.communicationTips || payload.communication || '',
      trainingTips: payload.trainingTips || payload.correction || '',
      completedAt: payload.completedAt || new Date().toISOString(),
      updatedAt: payload.updatedAt || new Date().toISOString(),
      updatedBy: payload.updatedBy || 'student'
    }), name);
    const res = await traitApi('saveStudentTrait', record);
    if (!res || !res.trait) {
      cacheTraitRecord(record, name);
      return false;
    }
    cacheTraitRecord(res.trait, name);
    return true;
  }

  async function saveStudentResult() {
    if (!state.quiz || !state.quiz.name) return false;
    const record = buildRecord(state.quiz.name, state.quiz.answers);
    const ok = await saveStudentTraitResult(record);
    state.quiz = null;
    await loadCache(true);
    return ok;
  }

  function renderCoachList() {
    const root = el('traitRadarRoot');
    if (!root) return;
    const roster = (typeof getPlayers === 'function' ? getPlayers() : []);
    const names = roster.length ? roster.slice() : Object.keys(state.map);
    const counts = { rocket: 0, volcano: 0, shield: 0, cheetah: 0, growth: 0, none: 0 };
    names.forEach(n => {
      const rec = state.map[n];
      if (rec && rec.typeKey) counts[rec.coachLabelOverrideKey || rec.typeKey] = (counts[rec.coachLabelOverrideKey || rec.typeKey] || 0) + 1;
      else counts.none += 1;
    });
    const selected = state.selectedCoach || names[0] || '';
    const selectedRec = currentRecord(selected);
    root.innerHTML = `
      <div class="trait-page-grid trait-coach-grid">
        <div class="trait-panel trait-coach-list">
          <div class="trait-page-kicker">學生特質雷達</div>
          <h3 class="card-title">學生特質雷達</h3>
          <div class="trait-summary-strip">
            ${Object.keys(TRAITS).map(k => `<div class="trait-summary-chip ${TRAITS[k].tone}">${esc(TRAITS[k].label)} ${counts[k] || 0}</div>`).join('')}
            <div class="trait-summary-chip none">未測驗 ${counts.none}</div>
          </div>
          <div class="trait-coach-note">點擊特質標籤可以展開完整特質卡。學生第一次登入會先進入測驗。</div>
          <div class="trait-coach-list-grid">
            ${names.map(n => {
              const rec = state.map[n];
              const active = selected === n ? ' active' : '';
              return `<button type="button" class="trait-coach-student${active}" data-trait-select="${esc(n)}">
                <span class="trait-coach-student-name">${esc(n)}</span>
                <span class="trait-coach-student-badge">${traitBadgeSpan(n)}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="trait-panel">
          ${selectedRec ? renderCoachDetail(selectedRec) : '<div class="hint-box">請先選擇一位學生。</div>'}
        </div>
      </div>`;
  }

  function renderCoachDetail(record) {
    const normalized = normalizeTraitRecord(record, record.studentName || '');
    const type = TRAITS[normalized.typeKey] || TRAITS.growth;
    const display = effectiveLabel(normalized);
    const checks = record.coachChecks || {};
    return `
      <div class="trait-coach-detail">
        <div class="trait-hero">
          <div class="trait-hero-title">目前主要特質</div>
          <div class="trait-hero-label">${esc(normalized.studentName)}｜${esc(display)}</div>
          <div class="trait-hero-note">點開標籤可回到完整特質頁，下面可做教練修正。</div>
        </div>
        <div class="student-trait-card">
          <div class="student-trait-title">選手特質卡</div>
          <div class="student-trait-label">${esc(normalized.studentName)}｜${esc(display)}</div>
          <div class="student-trait-section">${esc(normalized.traitSummary || `${display}：${type.keywords.join('／')}`)}</div>
          <div class="student-trait-section"><b>教練溝通建議：</b>${esc(normalized.communicationTips || type.communication)}</div>
          <div class="student-trait-section"><b>訓練安排建議：</b>${esc(normalized.trainingTips || type.correction)}</div>
        </div>
        <div class="trait-detail-grid">
          <div class="trait-detail-card"><h4>三個關鍵字</h4><p>${esc((normalized.keywords || type.keywords).join('／'))}</p></div>
          <div class="trait-detail-card"><h4>特質摘要</h4><p>${esc(normalized.traitSummary || `${display}：${type.keywords.join('／')}`)}</p></div>
          <div class="trait-detail-card"><h4>適合的溝通方式</h4><p>${esc(normalized.communicationTips || normalized.communication || type.communication)}</p></div>
          <div class="trait-detail-card"><h4>訓練安排建議</h4><p>${esc(normalized.trainingTips || normalized.correction || type.correction)}</p></div>
          <div class="trait-detail-card"><h4>適合的鼓勵方式</h4><p>${esc(normalized.encouragement || type.encouragement)}</p></div>
          <div class="trait-detail-card"><h4>修正動作時的建議</h4><p>${esc(normalized.correction || type.correction)}</p></div>
          <div class="trait-detail-card"><h4>比賽前提醒方式</h4><p>${esc(normalized.competitionReminder || type.competitionReminder)}</p></div>
          <div class="trait-detail-card"><h4>遇到挫折時的處理方式</h4><p>${esc(normalized.setbackResponse || type.setbackResponse)}</p></div>
          <div class="trait-detail-card"><h4>家長溝通建議</h4><p>${esc(normalized.parentAdvice || type.parentAdvice)}</p></div>
          <div class="trait-detail-card"><h4>不建議的帶法</h4><p>${esc(normalized.avoid || type.avoid)}</p></div>
        </div>
        <div class="trait-coach-editor">
          <label class="field-label">教練修正後的主要特質</label>
          <select class="text-input" data-trait-coach-label>
            ${Object.keys(TRAITS).map(k => `<option value="${esc(k)}"${(normalized.coachLabelOverrideKey || normalized.typeKey) === k ? ' selected' : ''}>${esc(TRAITS[k].label)}</option>`).join('')}
          </select>
          <label class="field-label">教練觀察修正</label>
          <div class="trait-check-grid">
            ${CHECKS.map(ch => `<label class="trait-check"><input type="checkbox" data-trait-check="${esc(ch)}"${checks[ch] ? ' checked' : ''}><span>${esc(ch)}</span></label>`).join('')}
          </div>
          <label class="field-label">教練補充</label>
          <textarea class="text-input" rows="3" data-trait-notes placeholder="每月或每學期更新，可補充觀察與帶法">${esc(normalized.coachNotes || '')}</textarea>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" data-trait-save="${esc(normalized.studentName)}">✅ 儲存教練觀察修正</button>
          </div>
          <div class="trait-disclaimer">本測驗僅作為教練教學與溝通參考，不作為心理診斷、醫療判斷或升學篩選依據。學生特質會隨著年齡、訓練經驗與環境改變，結果僅代表目前傾向。</div>
        </div>
      </div>`;
  }

  async function saveCoachReview(name) {
    const rec = currentRecord(name) || blankRecord(name);
    const root = el('traitRadarRoot');
    const panel = root ? root.querySelector('.trait-coach-detail') : null;
    if (!panel) return;
    const select = panel.querySelector('[data-trait-coach-label]');
    const notes = panel.querySelector('[data-trait-notes]');
    const checks = {};
    panel.querySelectorAll('[data-trait-check]').forEach(cb => { checks[cb.getAttribute('data-trait-check')] = !!cb.checked; });
    const typeKey = select ? select.value : rec.typeKey;
    const type = TRAITS[typeKey] || TRAITS.growth;
    const merged = Object.assign({}, rec, {
      coachLabelOverrideKey: typeKey,
      coachLabelOverride: type.label,
      coachChecks: checks,
      coachNotes: notes ? notes.value.trim() : '',
      updatedAt: new Date().toISOString(),
      updatedBy: 'coach'
    });
    await appSet(traitKey(name), merged);
    state.map[nameKey(name)] = normalizeTraitRecord(merged, name);
    try { localStorage.setItem('yulin_trait_cache', JSON.stringify(state.map)); } catch (e) {}
    notify('✅ 已儲存學生特質修正');
    await loadCache(true);
    render();
    if (typeof refreshAccountAdmin === 'function') refreshAccountAdmin().catch(() => {});
  }

  function render() {
    const root = el('traitRadarRoot');
    if (!root) return;
    const r = role();
    if (!r) { root.innerHTML = '<div class="hint-box">請先登入。</div>'; return; }
    if (r.role === 'coach') renderCoachList();
    else if (completed(studentName())) renderStudentResult();
    else renderStudentIntro();
  }

  async function refresh() {
    await loadCache();
    const r = role();
    if (!r) return;
    if (r.role === 'coach') {
      renderCoachList();
      return;
    }
    const name = studentName();
    if (!name) return;
    if (!completed(name)) {
      if (state.quiz && state.quiz.name !== name) quizStateReset();
      if (!state.quiz) quizStateReset();
      renderStudentQuiz();
    } else {
      state.quiz = null;
      renderStudentResult();
    }
  }

  async function onRoleApplied(currentRole) {
    await loadCache();
    if (!currentRole) return;
    if (currentRole.role === 'student') {
      const name = studentName();
      if (name && !completed(name)) {
        if (typeof switchTab === 'function') switchTab('trait');
        quizStateReset();
        renderStudentQuiz();
      } else {
        renderStudentResult();
      }
    } else if (currentRole.role === 'coach') {
      renderCoachList();
    }
  }

  function openFromBadge(name) {
    state.selectedCoach = nameKey(name);
    const r = role();
    if (r && r.role === 'coach') {
      if (typeof switchTab === 'function') switchTab('trait');
      renderCoachList();
    } else if (r && r.role === 'student') {
      if (typeof switchTab === 'function') switchTab('trait');
      renderStudentResult();
    }
  }

  function selectCoachStudent(name) {
    state.selectedCoach = nameKey(name);
    const r = role();
    if (r && r.role === 'coach') {
      renderCoachList();
    } else {
      openFromBadge(name);
    }
  }

  function maybeShowStudentIntro() {
    const r = role();
    if (!r || r.role !== 'student') return;
    const name = studentName();
    if (name && !completed(name) && typeof switchTab === 'function') switchTab('trait');
  }

  document.addEventListener('click', async e => {
    const badge = e.target.closest('[data-trait-open]');
    if (badge) {
      e.preventDefault();
      openFromBadge(badge.getAttribute('data-trait-open'));
      return;
    }
    const select = e.target.closest('[data-trait-select]');
    if (select) {
      e.preventDefault();
      selectCoachStudent(select.getAttribute('data-trait-select'));
      return;
    }
    const start = e.target.closest('[data-trait-start]');
    if (start) {
      e.preventDefault();
      quizStateReset();
      renderStudentQuiz();
      return;
    }
    const back = e.target.closest('[data-trait-back]');
    if (back) {
      e.preventDefault();
      moveQuiz(-1);
      return;
    }
    const answer = e.target.closest('[data-trait-answer]');
    if (answer) {
      e.preventDefault();
      if (!state.quiz) quizStateReset();
      const qid = answer.getAttribute('data-trait-q');
      const type = answer.getAttribute('data-trait-answer');
      state.quiz.answers[qid] = type;
      const idx = QUESTIONS.findIndex(q => q.id === qid);
      if (idx < QUESTIONS.length - 1) {
        state.quiz.index = idx + 1;
        renderStudentQuiz();
      } else {
        try {
          const ok = await saveStudentResult();
          notify(ok ? '✅ 已完成成長風格測驗' : '儲存失敗，請稍後再試。');
          renderStudentResult();
          if (typeof switchTab === 'function') switchTab('trait');
        } catch (err) {
          notify('儲存失敗，請稍後再試。');
        }
      }
      return;
    }
    const save = e.target.closest('[data-trait-save]');
    if (save) {
      e.preventDefault();
      await saveCoachReview(save.getAttribute('data-trait-save'));
      return;
    }
  });

  async function boot() {
    loadLocalCache();
    await loadCache();
    maybeShowStudentIntro();
    const r = role();
    if (r && r.role === 'coach') renderCoachList();
    if (r && r.role === 'student') {
      const name = studentName();
      if (name && completed(name)) renderStudentResult();
      else renderStudentIntro();
    }
  }

  window.TraitRadar = {
    loadCache: loadCache,
    loadStudentTrait: loadStudentTrait,
    loadAllStudentTraits: loadAllStudentTraits,
    refresh: refresh,
    refreshCoach: async function () { await loadCache(true); renderCoachList(); },
    refreshStudent: async function () { await loadCache(true); const r = role(); if (r && r.role === 'student') render(); },
    onRoleApplied: onRoleApplied,
    saveStudentTraitResult: saveStudentTraitResult,
    badgeHtml: traitBadgeHtml,
    badgeSpanHtml: traitBadgeSpan,
    nameHtml: traitNameHtml,
    nameInlineHtml: traitNameInlineHtml,
    labelFor: effectiveLabel,
    recordFor: currentRecord,
    renderStudentTraitCard: renderStudentTraitCard,
    attachTraitToCoachContext: attachTraitToCoachContext,
    open: openFromBadge,
    selectCoachStudent: selectCoachStudent,
    maybeShowStudentIntro: maybeShowStudentIntro
  };
  window.traitBadgeHtml = traitBadgeHtml;
  window.traitNameHtml = traitNameHtml;
  window.traitLabelFor = effectiveLabel;
  window.saveStudentTraitResult = saveStudentTraitResult;
  window.loadStudentTrait = loadStudentTrait;
  window.loadAllStudentTraits = loadAllStudentTraits;
  window.renderStudentTraitCard = renderStudentTraitCard;
  window.attachTraitToCoachContext = attachTraitToCoachContext;

  boot().catch(() => {});
})();
