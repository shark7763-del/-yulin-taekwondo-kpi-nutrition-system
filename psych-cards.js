/* TeamPro 心理成長能量卡：純前端收藏系統，不依賴後端。 */
(function () {
  'use strict';

  const STORAGE_KEY = 'teampro_psych_cards';
  const LEGACY_KEYS = ['psychCards', 'teamproPsychCards', 'yulin_psych_cards'];
  const RARITY_WEIGHTS = { N: 55, R: 25, SR: 13, SSR: 6, UR: 1 };
  const RARITY_LABELS = { N: '普通', R: '稀有', SR: '超稀有', SSR: '傳說', UR: '隱藏' };
  const VISUAL_ICONS = { breakthrough: '🚪', calm: '◌', growth: '🌱', light: '✦', resilience: '🌿', focus: '◎', courage: '➜', healing: '☁', gratitude: '☀', belief: '⟡' };
  const SERIES = [
    { name: '心理突破系列', count: 25, visualType: 'breakthrough', colorTheme: 'gold', keywords: ['突破', '跨越', '撐住', '再試一次'], cards: [['把光找回來', '有時候不是你不夠好，只是你暫時忘了自己原本就有光。', '今天對自己說一句肯定的話，不要只看缺點。'], ['卡住也能打開', '卡住不是停住，而是在提醒你換一個方向再試。', '今天遇到卡住的地方，先停三秒，再重新做一次。']] },
    { name: '正念成長系列', count: 25, visualType: 'growth', colorTheme: 'softCyan', keywords: ['呼吸', '當下', '慢慢來', '覺察'], cards: [['你可以慢慢來', '進步不是一下子變很強，而是一天一點點，慢慢把自己養起來。', '今天訓練結束後，想一件自己比昨天更好的地方。'], ['接住此刻', '不用急著把所有問題解完，先接住現在的自己。', '今天心亂時，做三次慢慢的深呼吸。']] },
    { name: '自我相信系列', count: 20, visualType: 'belief', colorTheme: 'blue', keywords: ['相信自己', '我做得到', '累積', '價值'], cards: [['相信練過的自己', '你不必每天都很有把握，但可以相信那些認真累積。', '今天開始前，對自己說一次「我準備好了」。'], ['不先否定自己', '還沒開始就否定自己，會錯過看見能力的機會。', '今天把一句「我不行」改成「我先試試看」。']] },
    { name: '壓力調整系列', count: 20, visualType: 'healing', colorTheme: 'teal', keywords: ['壓力', '緊張', '焦慮', '放鬆'], cards: [['先把呼吸放慢', '緊張不是壞事，它只是提醒你：這件事很重要。', '今天緊張時，吸氣四拍、吐氣六拍，做三輪。'], ['壓力也能帶路', '壓力不一定要推開，先穩住它，再讓它變成力量。', '今天感到壓力時，寫下你現在最能做的一件小事。']] },
    { name: '情緒穩定系列', count: 20, visualType: 'calm', colorTheme: 'deepBlue', keywords: ['冷靜', '穩定', '呼吸', '平靜'], cards: [['先穩住自己', '不是每一次都要很厲害，先讓自己穩下來，就已經很棒了。', '今天如果心有點亂，先停下來做三次深呼吸，再開始下一個動作。'], ['把心收回來', '外面的聲音很多，真正能幫你的，是把心收回自己手上。', '今天被影響時，先看向一個固定點，回到眼前任務。']] },
    { name: '失敗修復系列', count: 20, visualType: 'resilience', colorTheme: 'green', keywords: ['失誤', '修復', '重來', '挫折'], cards: [['再站起來', '跌倒不代表你不行，願意再站起來，才是你真正的力量。', '今天如果出現失誤，不急著否定自己，先把下一次做好。'], ['失誤後三秒', '失誤只是訊息，不是對你的判決。', '今天失誤後，給自己三秒調整，再做下一次。']] },
    { name: '勇氣行動系列', count: 20, visualType: 'courage', colorTheme: 'purple', keywords: ['勇氣', '行動', '面對', '第一步'], cards: [['帶著害怕也前進', '勇敢不是完全不怕，是你明明會怕，還是願意往前走一步。', '今天去做一件你本來有點想逃避的事。'], ['先做再說', '等到完全不怕才開始，常常會等很久；先做一點就好。', '今天完成一件原本想拖延的小事。']] },
    { name: '專注當下系列', count: 20, visualType: 'focus', colorTheme: 'indigo', keywords: ['現在', '專注', '心流', '眼前任務'], cards: [['做好這一下', '不用一次把整場想完，把眼前這一下做好就夠了。', '今天每次分心時，把注意力放回下一個動作。'], ['回到呼吸', '專注不是永遠不分心，而是每次分心都願意回來。', '今天注意到分心時，先深呼吸一次再繼續。']] },
    { name: '內在力量系列', count: 15, visualType: 'light', colorTheme: 'navy', keywords: ['沉穩', '韌性', '耐心', '堅持'], cards: [['安靜也很強', '真正的力量，不一定很大聲；它也可以是安靜地不放棄。', '今天在累的時候，安靜完成一個該完成的部分。'], ['把根扎深', '看得見的進步，來自看不見的耐心。', '今天選一個基本小事，專心把它做完整。']] },
    { name: '溫暖陪伴系列', count: 15, visualType: 'gratitude', colorTheme: 'rose', keywords: ['鼓勵', '支持', '同伴', '陪伴'], cards: [['有人和你一起', '你不需要一個人把所有事扛完，身邊一直有人願意陪你。', '今天主動鼓勵一位隊友。'], ['把溫暖傳出去', '一句真心的支持，可能剛好接住一個人的今天。', '今天對教練、隊友或自己說一句謝謝。']] }
  ];
  const FALLBACK_TITLES = ['再試一次', '留一點空間', '把步伐放穩', '今天的一小步', '看見自己的努力', '不急著證明', '讓心慢下來', '往前一點點'];
  const FALLBACK_QUOTES = ['你正在學習的路上，慢一點沒有關係，停下整理後還能繼續。', '今天不需要把自己逼得很滿，穩穩完成眼前的事，就是可靠的進步。', '當你願意回到自己能做的地方，力量就會慢慢回來。', '每一次願意調整，都是在替明天的你留下底氣。'];
  const FALLBACK_MISSIONS = ['今天把注意力放回眼前這一下。', '今天遇到不順時，先深呼吸三次再繼續。', '今天結束後，寫下一件值得肯定自己的事。', '今天主動對一位隊友說一句支持的話。'];
  const rarityPlan = (() => {
    const values = [].concat(Array(100).fill('N'), Array(50).fill('R'), Array(30).fill('SR'), Array(15).fill('SSR'), Array(5).fill('UR'));
    let seed = 20260626;
    for (let i = values.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [values[i], values[j]] = [values[j], values[i]]; }
    return values;
  })();
  const PSYCH_CARD_LIBRARY = (() => {
    let serial = 0;
    return SERIES.flatMap(series => Array.from({ length: series.count }, (_, index) => {
      const sample = series.cards[index];
      const title = sample ? sample[0] : `${FALLBACK_TITLES[index % FALLBACK_TITLES.length]}・${series.name.replace('系列', '')}`;
      return { id: `TP-${String(++serial).padStart(3, '0')}`, title, series: series.name, rarity: rarityPlan[serial - 1], icon: VISUAL_ICONS[series.visualType], visualType: series.visualType, colorTheme: series.colorTheme, quote: sample ? sample[1] : FALLBACK_QUOTES[(serial + index) % FALLBACK_QUOTES.length], mission: sample ? sample[2] : FALLBACK_MISSIONS[(serial + index) % FALLBACK_MISSIONS.length], keywords: series.keywords };
    }));
  })();

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function emptyData() { return { ownedCards: [], lastDrawAt: '', totalDraws: 0 }; }
  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object') return emptyData();
    let cards = raw.ownedCards || raw.cards || raw.owned || [];
    if (!Array.isArray(cards) && typeof cards === 'object') cards = Object.keys(cards).map(id => ({ id, duplicateCount: Math.max(0, (cards[id] || 1) - 1) }));
    return { ownedCards: (Array.isArray(cards) ? cards : []).map(card => typeof card === 'string' ? { id: card, acquiredAt: new Date().toISOString(), duplicateCount: 0 } : { id: card.id, acquiredAt: card.acquiredAt || new Date().toISOString(), duplicateCount: Number(card.duplicateCount || card.duplicates || 0) }).filter(card => PSYCH_CARD_LIBRARY.some(item => item.id === card.id)), lastDrawAt: raw.lastDrawAt || raw.lastDraw || '', totalDraws: Number(raw.totalDraws || 0) };
  }
  function getData() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return normalizeData(JSON.parse(current));
      for (const key of LEGACY_KEYS) { const value = localStorage.getItem(key); if (value) return normalizeData(JSON.parse(value)); }
    } catch (error) { console.warn('TeamPro 心理卡資料讀取失敗，已使用空收藏。', error); }
    return emptyData();
  }
  function saveData(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data))); } catch (error) { console.warn('TeamPro 心理卡資料儲存失敗。', error); } }
  function pickRarity() { const roll = Math.random() * 100; let sum = 0; return Object.keys(RARITY_WEIGHTS).find(rarity => (sum += RARITY_WEIGHTS[rarity]) >= roll) || 'N'; }
  function drawPsychCard() {
    const rarity = pickRarity(); const pool = PSYCH_CARD_LIBRARY.filter(card => card.rarity === rarity); const card = pool[Math.floor(Math.random() * pool.length)]; const data = getData();
    const owned = data.ownedCards.find(item => item.id === card.id); if (owned) owned.duplicateCount = Number(owned.duplicateCount || 0) + 1; else data.ownedCards.push({ id: card.id, acquiredAt: new Date().toISOString(), duplicateCount: 0 });
    data.lastDrawAt = new Date().toISOString(); data.totalDraws = Number(data.totalDraws || 0) + 1; saveData(data); return { card, duplicate: !!owned };
  }
  function addPsychCard() { return drawPsychCard(); }
  function ensureModal() {
    if (document.getElementById('psychCardPackModal')) return;
    const modal = document.createElement('div'); modal.id = 'psychCardPackModal'; modal.className = 'psych-card-pack-modal'; modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="psych-card-pack-backdrop" data-close-psych-pack></div><div class="psych-card-pack-panel" role="dialog" aria-modal="true" aria-label="我的心理卡夾"><div class="psych-card-pack-head"><div><h3>TeamPro 心理成長能量卡</h3><small>心理突破 × 正念成長｜每天一張，陪你慢慢變強</small></div><button type="button" data-close-psych-pack aria-label="關閉卡夾">✕</button></div><div id="psychCardPackContent" class="psych-card-pack-content"></div></div>';
    document.body.appendChild(modal);
  }
  function ensureButton() {
    if (document.getElementById('psychCardPackBtn')) return;
    const button = document.createElement('button'); button.type = 'button'; button.id = 'psychCardPackBtn'; button.className = 'psych-card-pack-btn'; button.dataset.openPsychPack = ''; button.textContent = '我的心理卡夾'; document.body.appendChild(button);
  }
  function cardHTML(card, owned, compact) {
    if (!owned) return `<button type="button" class="psych-card psych-card-locked" aria-label="尚未取得的卡片"><span class="psych-card-id">${esc(card.id)}</span><span class="psych-card-lock">?</span><span>尚未取得</span></button>`;
    return `<button type="button" class="psych-card rarity-${card.rarity.toLowerCase()}${compact ? ' compact' : ''}" data-psych-card-id="${card.id}"><span class="psych-card-id">${card.id}</span><span class="psych-card-rarity">${card.rarity}｜${RARITY_LABELS[card.rarity]}</span><span class="psych-card-series">${esc(card.series)}</span><span class="psych-card-icon visual-${card.visualType}">${esc(card.icon)}</span><strong class="psych-card-title">${esc(card.title)}</strong>${compact ? '' : `<span class="psych-card-quote">${esc(card.quote)}</span><span class="psych-card-mission">今日小任務：${esc(card.mission)}</span>`}${owned.duplicateCount ? `<span class="psych-card-duplicate">重複 ×${owned.duplicateCount}</span>` : ''}</button>`;
  }
  function renderPsychCardPack(sortBy) {
    ensureModal(); const content = document.getElementById('psychCardPackContent'); if (!content) return;
    const data = getData(); const ownedMap = new Map(data.ownedCards.map(item => [item.id, item])); const cards = PSYCH_CARD_LIBRARY.slice();
    const mode = sortBy || content.dataset.sort || 'id'; content.dataset.sort = mode;
    if (mode === 'rarity') cards.sort((a, b) => ['UR', 'SSR', 'SR', 'R', 'N'].indexOf(a.rarity) - ['UR', 'SSR', 'SR', 'R', 'N'].indexOf(b.rarity) || a.id.localeCompare(b.id));
    const rarityStats = Object.keys(RARITY_LABELS).map(rarity => `${rarity} ${data.ownedCards.filter(item => PSYCH_CARD_LIBRARY.find(card => card.id === item.id).rarity === rarity).length}`).join('　');
    const seriesStats = SERIES.map(series => `<span>${esc(series.name.replace('系列', ''))} ${data.ownedCards.filter(item => PSYCH_CARD_LIBRARY.find(card => card.id === item.id).series === series.name).length}/${series.count}</span>`).join('');
    content.innerHTML = `<div class="psych-card-pack-stats"><b>已收集 ${data.ownedCards.length} / 200</b><span>${Math.round(data.ownedCards.length / 200 * 100)}% 完成</span><small>${rarityStats}</small></div><div class="psych-card-sort"><button type="button" data-psych-sort="id" class="${mode === 'id' ? 'active' : ''}">依編號</button><button type="button" data-psych-sort="rarity" class="${mode === 'rarity' ? 'active' : ''}">依稀有度</button></div><div class="psych-card-series-stats">${seriesStats}</div><div class="psych-card-grid">${cards.map(card => cardHTML(card, ownedMap.get(card.id), true)).join('')}</div>`;
  }
  function openPsychCardPack() { ensureButton(); ensureModal(); renderPsychCardPack(); const modal = document.getElementById('psychCardPackModal'); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
  function closePsychCardPack() { const modal = document.getElementById('psychCardPackModal'); if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } document.querySelectorAll('.psych-card-detail-modal').forEach(item => item.remove()); }
  function showCardDetail(id) { const card = PSYCH_CARD_LIBRARY.find(item => item.id === id); const owned = getData().ownedCards.find(item => item.id === id); if (!card || !owned) return; document.querySelectorAll('.psych-card-detail-modal').forEach(item => item.remove()); const detail = document.createElement('div'); detail.className = 'psych-card-detail-modal open'; detail.innerHTML = `<div class="psych-card-pack-backdrop" data-close-psych-detail></div><div class="psych-card-detail-panel">${cardHTML(card, owned, false)}<button type="button" class="btn btn-secondary" data-close-psych-detail>關閉</button></div>`; document.body.appendChild(detail); }
  function showDrawResult(result) { openPsychCardPack(); showCardDetail(result.card.id); if (typeof toast === 'function') toast(result.duplicate ? `抽到重複卡：${result.card.title}（已累計）` : `抽到 ${result.card.rarity} 卡：${result.card.title}`); }
  function init() {
    ensureButton(); ensureModal();
    document.addEventListener('click', event => { const open = event.target.closest('#psychCardPackBtn, .psych-card-pack-btn, [data-open-psych-pack]'); if (open) { event.preventDefault(); openPsychCardPack(); return; } if (event.target.closest('[data-close-psych-pack]')) { closePsychCardPack(); return; } if (event.target.closest('[data-close-psych-detail]')) { event.target.closest('.psych-card-detail-modal').remove(); return; } const sort = event.target.closest('[data-psych-sort]'); if (sort) { renderPsychCardPack(sort.dataset.psychSort); return; } const card = event.target.closest('[data-psych-card-id]'); if (card) showCardDetail(card.dataset.psychCardId); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePsychCardPack(); });
  }
  window.openPsychCardPack = openPsychCardPack; window.closePsychCardPack = closePsychCardPack; window.renderPsychCardPack = renderPsychCardPack; window.addPsychCard = addPsychCard; window.drawPsychCard = drawPsychCard; window.PSYCH_CARD_LIBRARY = PSYCH_CARD_LIBRARY;
  window.PsychCards = { onReportSubmitted: function () { showDrawResult(drawPsychCard()); }, showCollection: openPsychCardPack, drawPsychCard, addPsychCard };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
