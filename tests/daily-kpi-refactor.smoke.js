const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // 有些測試會故意觸發錯誤路徑（例如 AI 授權失敗），那些 console.error 是預期的，
  // 不該被當成「頁面壞掉」。只忽略我們自己標記過的。
  const EXPECTED_CONSOLE = ['[AI 教練回覆]'];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (EXPECTED_CONSOLE.some(tag => text.includes(tag))) return;
    errors.push('console: ' + text);
  });

  // #name and #encourageTeammate are <select>s populated from the localStorage roster.
  // Without seeding it they have no options, `select.value = '...'` silently stays '',
  // and every validation assertion below would pass for the wrong reason.
  await page.addInitScript(() => {
    localStorage.setItem('yulin_players', JSON.stringify(['測試選手', '隊友一號', '隊友二號']));
    // CONFIG.WEB_APP_URL 寫死了正式後端，頁面 init() 會真的打過去（getAuthConfig）。
    // 測試不該碰線上環境，也不該讓結果隨後端當下的設定而跳動 —— 直接擋掉。
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = String((input && input.url) ? input.url : (input || ''));
      if (url.indexOf('script.google.com') !== -1) return Promise.reject(new Error('blocked in tests'));
      return realFetch.call(window, input, init);
    };
  });

  await page.goto(URL);
  await page.waitForTimeout(1500);

  const results = [];
  const t = (name, ok, extra) => results.push({ name, ok, extra });

  // 1. every override actually landed
  const wired = await page.evaluate(() => ({
    refactor: !!window.__TEAMPRO_KPI_REFACTOR__,
    hasOrigBuild: typeof window.__origBuildRecord === 'function',
    hasOrigValidate: typeof window.__origValidateForm === 'function',
    hasOrigToggle: typeof window.__origToggleAbsenceReason === 'function',
    dailyAvailable: window.isDailyKpiAvailable()
  }));
  t('refactor module loaded + wrapped originals',
    wired.refactor && wired.hasOrigBuild && wired.hasOrigValidate && wired.hasOrigToggle && wired.dailyAvailable === true,
    JSON.stringify(wired));

  // 2. daily six-aspect cards render
  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#kpiContainer [data-field]')).map(el => el.dataset.field));
  t('6 daily aspect cards rendered', cards.length === 6, cards.join(','));

  // 3. score them all, then check the bundle maps onto the LEGACY aspect keys
  const bundle = await page.evaluate(() => {
    const fields = ['dailyTechnicalScore', 'dailyTacticalScore', 'dailyPhysicalScore', 'dailyMentalScore', 'dailyAttitudeScore', 'dailyRecoveryScore'];
    const vals = [5, 4, 3, 2, 4, 'na'];
    fields.forEach((f, i) => {
      const card = document.getElementById('daily-card-' + f);
      card.querySelector('[data-daily-value="' + vals[i] + '"]').click();
    });
    return window.collectScores();
  });
  const aspKeys = Object.keys(bundle.aspectAvg).sort().join(',');
  t('aspectAvg uses legacy keys (discipline/emotion/focus)',
    aspKeys === 'discipline,emotion,focus,physical,tactical,technical', aspKeys);
  t('N/A aspect -> null average, no empty item score',
    bundle.aspectAvg.emotion === null && Object.keys(bundle.scores.emotion).length === 1
      && bundle.scores.emotion['恢復'] === 'N/A',
    JSON.stringify(bundle.scores.emotion));
  t('total/average over numeric scores only (5+4+3+2+4=18, avg 3.6)',
    bundle.total === 18 && bundle.average === 3.6, bundle.total + '/' + bundle.average);
  t('recordFields keyed by dailyXxxScore',
    bundle.recordFields.dailyTechnicalScore === 5 && bundle.recordFields.dailyRecoveryScore === 'N/A',
    JSON.stringify(bundle.recordFields));

  // 4. findLowItems must not flag the N/A aspect as a red light
  const low = await page.evaluate(() => findLowItems(window.collectScores().scores).map(l => l.item));
  t('findLowItems only flags the real <3 aspect', low.length === 1 && low[0] === '心理', low.join(','));

  // 5. usefulness scoring accepts the short chip values
  const useful = await page.evaluate(() => {
    const meta = {
      reflectionType: '我發現問題', reflectionAspect: '技術',
      reflectionEvent: '右腳橫踢收腳太慢，對打時被反擊三次',
      reflectionEvidence: '教練提醒', reflectionResult: '還沒處理',
      nextActionType: '重複練習', nextAction: '收腳後立刻回架式，每組練二十下'
    };
    return computeReportUsefulness({ reflectionMetaJson: JSON.stringify(meta) });
  });
  t('short chip answers still score (evidence/result no longer length-gated)',
    useful.evidenceOk && useful.resultOk && useful.eventOk && useful.nextOk && useful.score === 100,
    JSON.stringify(useful));

  // 6. reflection chips render and feed buildRecord
  const rec = await page.evaluate(() => {
    const pick = (boxId, value) => {
      const box = document.getElementById(boxId);
      const btn = Array.from(box.querySelectorAll('.chip')).find(b => b.dataset.value === value);
      btn.click();
    };
    pick('reflectionTypeChips', '我發現問題');
    pick('reflectionAspectChips', '技術');
    pick('reflectionEvidenceChips', '教練提醒');
    pick('reflectionResultChips', '還沒處理');
    pick('nextActionTypeChips', '重複練習');
    document.getElementById('reflection').value = '右腳橫踢收腳太慢，對打時被反擊三次';
    document.getElementById('tomorrowGoal').value = '收腳後立刻回架式，每組練二十下';
    document.getElementById('name').value = '測試選手';
    document.getElementById('group').value = '對打';
    if (!document.getElementById('name').value) throw new Error('roster not seeded: #name stayed empty');
    const r = window.buildRecord();
    return {
      dailyTechnicalScore: r.dailyTechnicalScore,
      dailyRecoveryScore: r.dailyRecoveryScore,
      technicalAvg: r.technicalAvg,
      focusAvg: r.focusAvg,
      disciplineAvg: r.disciplineAvg,
      emotionAvg: r.emotionAvg,
      totalScore: r.totalScore,
      averageScore: r.averageScore,
      status: r.status,
      reflection: r.reflection,
      tomorrowGoal: r.tomorrowGoal,
      instrumentVersion: r.instrumentVersion,
      reportUsefulness: r.reportUsefulness,
      reportUsefulnessScore: r.reportUsefulnessScore,
      lowItems: r.lowItems,
      metaAspect: JSON.parse(r.reflectionMetaJson || '{}').reflectionAspect
    };
  });
  t('buildRecord writes the six dailyXxxScore columns',
    rec.dailyTechnicalScore === 5 && rec.dailyRecoveryScore === 'N/A', JSON.stringify(rec));
  t('legacy aspect averages populated (focus/discipline/emotion)',
    rec.technicalAvg === 5 && rec.focusAvg === 2 && rec.disciplineAvg === 4 && rec.emotionAvg === '',
    [rec.technicalAvg, rec.focusAvg, rec.disciplineAvg, rec.emotionAvg].join('|'));
  t('composed reflection + goal text',
    /右腳橫踢/.test(rec.reflection) && /重複練習/.test(rec.tomorrowGoal),
    rec.reflection + ' // ' + rec.tomorrowGoal);
  t('instrument version + usefulness stamped on the record',
    rec.instrumentVersion === 'daily-6-reflection-v1' && rec.reportUsefulnessScore === 100,
    rec.instrumentVersion + ' ' + rec.reportUsefulness + ' ' + rec.reportUsefulnessScore);
  t('status from daily average 3.6 -> yellow', rec.status === '🟡 黃燈', rec.status);
  t('meta json round-trips the chip answers', rec.metaAspect === '技術', rec.metaAspect);

  // 7. validateForm against a COMPLETE form.
  //    The baseline assertion matters: without it, every "rejects X" test below would
  //    pass simply because some unrelated required field was still empty.
  await page.evaluate(() => {
    window.__fillValidForm = () => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const pickSelect = id => { const el = document.getElementById(id); if (el && el.options.length > 1) el.selectedIndex = 1; };
      const chip = (boxId, value) => {
        const box = document.getElementById(boxId);
        const btn = Array.from(box.querySelectorAll('.chip')).find(b => b.dataset.value === value);
        if (btn && !btn.classList.contains('sel')) btn.click();
      };
      // group first: changing it re-renders the aspect cards and reflection chips
      const g = document.getElementById('group');
      g.value = '對打';
      g.dispatchEvent(new Event('change', { bubbles: true }));

      set('name', '測試選手');
      ['schoolLevel', 'grade', 'classCode', 'waterIntake', 'trainingIntensity'].forEach(pickSelect);
      set('trainingMinutes', '90');
      set('trainingTopic', '旋踢距離控制');
      set('heightCm', '165');
      set('weightKg', '55');
      set('breakfast', '蛋餅豆漿');
      set('lunch', '雞腿便當');
      set('dinner', '魚飯花椰菜');
      set('sleepHours', '8');
      set('soreness', '2');
      set('rpe', '5');
      set('painScore', '0');

      ['dailyTechnicalScore', 'dailyTacticalScore', 'dailyPhysicalScore',
       'dailyMentalScore', 'dailyAttitudeScore', 'dailyRecoveryScore'].forEach(f => {
        document.getElementById('daily-card-' + f).querySelector('[data-daily-value="4"]').click();
      });

      chip('reflectionTypeChips', '我發現問題');
      chip('reflectionAspectChips', '技術');
      chip('reflectionEvidenceChips', '教練提醒');
      chip('reflectionResultChips', '還沒處理');
      chip('nextActionTypeChips', '重複練習');
      set('reflection', '右腳橫踢收腳太慢，對打時被反擊三次');
      set('tomorrowGoal', '收腳後立刻回架式，每組練二十下');
      set('gratitude', '謝謝教練今天特別教我旋踢');
      set('encourageTeammate', '');
      set('encouragementToTeammate', '');
    };
  });

  const baseline = await page.evaluate(() => { window.__fillValidForm(); return window.validateForm(); });
  t('a fully filled form actually passes validateForm', baseline === true, String(baseline));

  const gratitudeCases = await page.evaluate(() => {
    const out = {};
    window.__fillValidForm();
    document.getElementById('gratitude').value = '';
    out.noGratitude = window.validateForm();

    window.__fillValidForm();
    const te = document.getElementById('encourageTeammate');
    out.teammateOptions = te.options.length;
    if (te.options.length > 1) {
      te.selectedIndex = 1;
      document.getElementById('encouragementToTeammate').value = '';
      out.teammateNoMessage = window.validateForm();
      document.getElementById('encouragementToTeammate').value = '今天練得很拼，繼續加油！';
      out.teammateWithMessage = window.validateForm();
    }

    window.__fillValidForm();
    out.noTeammateAtAll = window.validateForm();
    return out;
  });
  t('gratitude is now required', gratitudeCases.noGratitude === false, JSON.stringify(gratitudeCases));
  t('leaving the teammate unpicked still submits',
    gratitudeCases.noTeammateAtAll === true, String(gratitudeCases.noTeammateAtAll));
  t('the roster actually populated the teammate select',
    gratitudeCases.teammateOptions > 1, String(gratitudeCases.teammateOptions));
  t('picking a teammate without a message is blocked',
    gratitudeCases.teammateNoMessage === false, JSON.stringify(gratitudeCases));
  t('picking a teammate with a message submits',
    gratitudeCases.teammateWithMessage === true, JSON.stringify(gratitudeCases));

  const chipCases = await page.evaluate(() => {
    const out = {};
    window.__fillValidForm();
    document.getElementById('reflectionEvidenceChips').querySelectorAll('.chip').forEach(b => b.classList.remove('sel'));
    out.noEvidence = window.validateForm();

    window.__fillValidForm();
    document.getElementById('daily-card-dailyMentalScore').dataset.value = '';
    out.unscoredAspect = window.validateForm();

    window.__fillValidForm();
    document.getElementById('reflection').value = '很好';
    out.genericReflection = window.validateForm();
    return out;
  });
  t('validateForm rejects a missing evidence chip', chipCases.noEvidence === false, JSON.stringify(chipCases));
  t('validateForm rejects an unscored aspect', chipCases.unscoredAspect === false, JSON.stringify(chipCases));
  t('validateForm rejects a canned one-word reflection', chipCases.genericReflection === false, JSON.stringify(chipCases));

  // 8. absence group hides the daily KPI card, training group shows it again
  const visibility = await page.evaluate(() => {
    const sec = document.getElementById('standardKpiSection');
    const g = document.getElementById('group');
    g.value = '未出席訓練';
    window.toggleAbsenceReason(g.value);
    const whenAbsent = sec.style.display;
    g.value = '對打';
    window.toggleAbsenceReason(g.value);
    return { whenAbsent, whenTraining: sec.style.display };
  });
  t('daily KPI card hidden when absent, shown when training (no weekly session open)',
    visibility.whenAbsent === 'none' && visibility.whenTraining === '', JSON.stringify(visibility));

  // 8b. changing the group dropdown must drive the absence + freestyle toggles.
  //     renderKpiSliders() owns that wiring; the refactor override dropped it once and
  //     picking 未出席訓練 left the reason box hidden while validateForm demanded it.
  const groupWiring = await page.evaluate(() => {
    const g = document.getElementById('group');
    const fire = v => { g.value = v; g.dispatchEvent(new Event('change', { bubbles: true })); };
    const snap = () => ({
      absenceWrap: getComputedStyle(document.getElementById('absenceReasonWrap')).display,
      freestyle: getComputedStyle(document.getElementById('freestyleSection')).display,
      encourage: getComputedStyle(document.getElementById('encourageFold')).display,
      kpi: getComputedStyle(document.getElementById('standardKpiSection')).display
    });
    fire('未出席訓練');
    const absent = snap();
    fire('自由品勢');
    const freestyle = snap();
    fire('對打');
    const spar = snap();
    return { absent, freestyle, spar };
  });
  t('picking 未出席訓練 reveals the reason box and hides training-only sections',
    groupWiring.absent.absenceWrap !== 'none' && groupWiring.absent.encourage === 'none'
      && groupWiring.absent.kpi === 'none',
    JSON.stringify(groupWiring.absent));
  t('picking 自由品勢 shows the freestyle fields',
    groupWiring.freestyle.freestyle !== 'none' && groupWiring.freestyle.absenceWrap === 'none',
    JSON.stringify(groupWiring.freestyle));
  t('back to a normal training group restores the training sections',
    groupWiring.spar.kpi !== 'none' && groupWiring.spar.encourage !== 'none'
      && groupWiring.spar.freestyle === 'none' && groupWiring.spar.absenceWrap === 'none',
    JSON.stringify(groupWiring.spar));

  // 9. weekly KPI form builds without the qsa ReferenceError
  const weekly = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'studentKpiForm';
    document.body.appendChild(host);
    try {
      window.KpiSession._buildStudentKpiForm(host, { sessionId: 'test-session' });
    } catch (e) { return { error: String(e) }; }
    const items = host.querySelectorAll('[data-wk-item]').length;
    host.querySelector('[data-wk-value="4"]').click();
    const badge = document.getElementById('wk-badge-technical');
    return { items, badge: badge ? badge.textContent : null, summary: document.getElementById('wkSummary').textContent };
  });
  t('weekly 30-item form builds and per-aspect badges update',
    !weekly.error && weekly.items === 30 && /平均 4/.test(weekly.badge || '') && /1\/30/.test(weekly.summary || ''),
    JSON.stringify(weekly));

  // 10. trend range labels say 筆 (records), not 天 (days) — allRecs.slice(0, n) takes the
  //     last N *records*, so gaps in reporting don't consume slots. The old 「近 30 天」
  //     label made a chart ending 06/27 look like a data bug when it was correct.
  const trend = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // 10 scored days spread over 2 months, plus one absence that must be excluded
    const recs = [
      { date: '2026-06-01', group: '對打', averageScore: 3.0, totalScore: 90 },
      { date: '2026-06-02', group: '對打', averageScore: 3.5, totalScore: 105 },
      { date: '2026-06-03', group: '對打', averageScore: 4.0, totalScore: 120 },
      { date: '2026-06-10', group: '對打', averageScore: 4.2, totalScore: 126 },
      { date: '2026-06-27', group: '對打', averageScore: 2.97, totalScore: 89 },
      { date: '2026-07-03', group: '未出席訓練', status: '未出席訓練' }
    ];
    window.renderTrendSection(host, recs, 30, {});
    const btn = Array.from(host.querySelectorAll('.trend-btn')).find(b => b.dataset.key === 'totalScore');
    if (btn) btn.click();
    return {
      rangeLabels: Array.from(host.querySelectorAll('.trend-range-btn')).map(b => b.textContent),
      summary: host.querySelector('.trend-summary').textContent,
      xLabels: Array.from(host.querySelectorAll('.trend-chart-box text')).map(t => t.textContent)
    };
  });
  t('range buttons are labelled 筆, not 天',
    trend.rangeLabels.every(l => !l.includes('天')), JSON.stringify(trend.rangeLabels));
  t('summary counts 筆 and shows the real date span',
    /5 筆（06\/01～06\/27）/.test(trend.summary), trend.summary);
  t('absence record stays excluded from the curve',
    !trend.summary.includes('07/03') && !trend.xLabels.includes('07/03'),
    trend.summary + ' | ' + trend.xLabels.join(','));

  // 11. a failed load must not leave the coach dashboard blank — that reads exactly like
  //     "nobody reported today", and the toast explaining it disappears after a few seconds.
  const loadErr = await page.evaluate(async () => {
    const boxes = ['coachRedLight', 'coachQuickScoreList', 'coachReadinessGroups', 'coachRiskTracking'];
    boxes.forEach(id => { const b = document.getElementById(id); if (b) b.innerHTML = ''; });
    window.fetchAllRecords = async () => { throw new Error('AUTH_REQUIRED'); };
    await window.refreshCoach();
    const filled = boxes.map(id => {
      const b = document.getElementById(id);
      return { id, present: !!b, text: b ? b.textContent.trim() : '' };
    });
    const hasRelogin = !!document.querySelector('.coach-relogin');
    // 準備度分組是多欄 grid，橫幅若沒跨列會被擠成一行一個字
    const groups = document.getElementById('coachReadinessGroups');
    const banner = groups && groups.querySelector('.coach-load-error');
    const spanInfo = banner
      ? { gridColumn: getComputedStyle(banner).gridColumn, w: Math.round(banner.getBoundingClientRect().width),
          parentW: Math.round(groups.getBoundingClientRect().width) }
      : null;
    const spansGrid = !!spanInfo && spanInfo.w >= spanInfo.parentW - 4;

    window.clearCoachLoadError();
    const afterClear = boxes.map(id => (document.getElementById(id) || {}).textContent || '');
    return { filled, afterClear, hasRelogin, spanInfo, spansGrid };
  });
  t('a failed load writes a visible reason into every coach panel',
    loadErr.filled.every(b => !b.present || b.text.includes('這裡是空的，因為資料沒讀進來')),
    JSON.stringify(loadErr.filled.map(b => [b.id, b.text.slice(0, 30)])));
  t('the AUTH_REQUIRED code is translated into plain language',
    loadErr.filled.some(b => b.text.includes('教練登入已過期')),
    JSON.stringify(loadErr.filled.map(b => b.text.slice(0, 60))));
  t('an expired session offers a re-login button instead of instructions',
    loadErr.hasRelogin, String(loadErr.hasRelogin));
  t('the banner spans the whole grid row (not squeezed into one column)',
    loadErr.spansGrid, JSON.stringify(loadErr.spanInfo));
  // 上次表現查詢的名單面板也不能靜默退回本機空資料
  const reported = await page.evaluate(async () => {
    const list = document.getElementById('todayReportedList');
    const sum = document.getElementById('lastPerfSummaryRow');
    if (!list) return { missing: true };
    // 這支開頭有 `if (role !== 'coach') return`，測試瀏覽器沒有角色會直接返回
    const savedRole = localStorage.getItem('yulin_role');
    window.setRole('coach', '測試教練', { authToken: 'test-token' });
    let strictSeen = null;
    window.fetchAllRecords = async opts => { strictSeen = !!(opts && opts.strict); throw new Error('AUTH_REQUIRED'); };
    await window.refreshTodayReportedList();
    if (savedRole) localStorage.setItem('yulin_role', savedRole); else localStorage.removeItem('yulin_role');
    return {
      strictSeen,
      listText: list.textContent,
      sumText: sum ? sum.textContent : '',
      hasRelogin: !!list.querySelector('.coach-relogin')
    };
  });
  t('the reported-list panel asks for records in strict mode',
    reported.missing || reported.strictSeen === true, JSON.stringify(reported));
  t('a failed load no longer reads as 還沒有選手回報',
    reported.missing || (!reported.listText.includes('還沒有選手回報')
      && reported.listText.includes('資料沒讀進來')), (reported.listText || '').slice(0, 80));
  t('the 0/0/0 counters are blanked when the load failed',
    reported.missing || !/0/.test(reported.sumText), reported.sumText);

  t('clearCoachLoadError removes the banner again',
    loadErr.afterClear.every(x => !x.includes('這裡是空的')), JSON.stringify(loadErr.afterClear));

  // 12. streak alerts must respect the selected date. They used to run over every record
  //     ever, so a student who stopped reporting in June still showed as an active risk.
  const risk = await page.evaluate(() => {
    const box = document.getElementById('coachRiskTracking');
    const mk = (name, date, extra) => Object.assign({
      name, date, group: '對打', waterIntake: '少於 500ml', lateNightSnack: '無'
    }, extra || {});
    // 停填的選手：最後三筆都在兩個月前
    const stale = ['2026-06-26', '2026-06-27', '2026-06-28'].map(d => mk('停填選手', d));
    // 仍在回報的選手：最近三天都水量不足
    const fresh = ['2026-08-26', '2026-08-27', '2026-08-28'].map(d => mk('現役選手', d));
    const all = stale.concat(fresh);

    window.renderRiskTracking([], all, '2026-08-28');
    const onDate = box.textContent;
    // 把日期切回六月，停填選手就應該重新出現
    window.renderRiskTracking([], all, '2026-06-28');
    const inJune = box.textContent;
    return { onDate, inJune };
  });
  t('a student who stopped reporting in June is not an active risk today',
    !risk.onDate.includes('停填選手'), risk.onDate.replace(/\s+/g, ' ').slice(0, 160));
  t('a currently-reporting student still raises the alert',
    risk.onDate.includes('現役選手') && risk.onDate.includes('水量不足'),
    risk.onDate.replace(/\s+/g, ' ').slice(0, 160));
  t('each alert states which record it is based on',
    /依 08\/28 紀錄/.test(risk.onDate), risk.onDate.replace(/\s+/g, ' ').slice(0, 160));
  t('viewing an older date brings that period back',
    risk.inJune.includes('停填選手') && !risk.inJune.includes('現役選手'),
    risk.inJune.replace(/\s+/g, ' ').slice(0, 160));

  // 13. the legacy name-only login must be fail-CLOSED. The backend bypass was removed in
  //     the B-01 audit, so showing the button when the config is unknown offers a dead end.
  //     AUTH_CONFIG is a module-scoped `let` (not on window), so read it via loadAuthConfig()'s
  //     return value rather than poking at the global.
  const legacy = await page.evaluate(async () => {
    const out = {};
    const savedUrl = localStorage.getItem('yulin_webapp_url');
    const savedPost = window.postToWebApp;

    // 後端讀不到設定時，不可以退回成「開啟」（也就是預設必須是關）
    localStorage.setItem('yulin_webapp_url', 'https://example.invalid/exec');
    window.postToWebApp = async () => { throw new Error('offline'); };
    out.afterFailedFetch = (await window.loadAuthConfig()).legacyLoginEnabled;

    // 後端明確說開啟時要跟著開啟
    window.postToWebApp = async () => ({ ok: true, legacyLoginEnabled: true });
    out.afterBackendSaysOn = (await window.loadAuthConfig()).legacyLoginEnabled;

    // 後端明確說關閉時要關掉（不能被前一次的 true 黏住）
    window.postToWebApp = async () => ({ ok: true, legacyLoginEnabled: false });
    out.afterBackendSaysOff = (await window.loadAuthConfig()).legacyLoginEnabled;

    // 純本機模式沒有後端可驗證，姓名登入是唯一入口，要放行。
    // 注意：getWebAppUrl() 會優先回寫死在 CONFIG.WEB_APP_URL 的網址，清 localStorage
    // 進不了本機模式，只有把該常數清空的自架版本才會走到，所以這裡直接覆寫函式。
    const savedGetUrl = window.getWebAppUrl;
    window.getWebAppUrl = () => '';
    out.localOnlyMode = (await window.loadAuthConfig()).legacyLoginEnabled;
    window.getWebAppUrl = savedGetUrl;

    if (savedUrl) localStorage.setItem('yulin_webapp_url', savedUrl);
    window.postToWebApp = savedPost;
    return out;
  });
  t('never having loaded the config leaves it closed (default is OFF)',
    legacy.afterFailedFetch === false, JSON.stringify(legacy));
  t('backend can still turn it on explicitly',
    legacy.afterBackendSaysOn === true, JSON.stringify(legacy));
  t('backend turning it off actually turns it off',
    legacy.afterBackendSaysOff === false, JSON.stringify(legacy));
  t('local-only mode still allows name login',
    legacy.localOnlyMode === true, JSON.stringify(legacy));

  // 14. risk items are clickable and remember how the coach handled them
  const handled = await page.evaluate(async () => {
    const box = document.getElementById('coachRiskTracking');
    const store = {};
    window.appGetAll = async () => JSON.parse(JSON.stringify(store));
    window.appSet = async (k, v) => { if (v === null) delete store[k]; else store[k] = v; return true; };
    let viewDate = '2026-08-28';
    window.refreshCoach = async () => {
      await window.loadRiskHandles();
      window.renderRiskTracking([], all, viewDate);
    };
    const mk = (name, date) => ({ name, date, group: '對打', waterIntake: '少於 500ml', lateNightSnack: '無' });
    const all = ['2026-08-26', '2026-08-27', '2026-08-28'].map(d => mk('阿明', d));

    await window.loadRiskHandles();
    window.renderRiskTracking([], all, '2026-08-28');
    const chip = box.querySelector('.risk-chip');
    const out = { clickable: !!chip, beforeText: chip ? chip.textContent : '' };

    chip.click();
    const panel = box.querySelector('.risk-handle-panel');
    out.panelOpened = panel && !panel.hasAttribute('hidden');
    out.options = Array.from(panel.querySelectorAll('[data-risk-status]')).map(b => b.dataset.riskStatus);

    // 沒選處置就儲存 → 應該擋下來，不能寫進去
    panel.querySelector('.risk-handle-save').click();
    await new Promise(r => setTimeout(r, 60));
    out.savedWithoutStatus = Object.keys(store).length;

    Array.from(panel.querySelectorAll('[data-risk-status]')).find(b => b.dataset.riskStatus === '防護員已處理').click();
    panel.querySelector('.risk-handle-note').value = '腳踝冰敷，明天回報';
    panel.querySelector('.risk-handle-save').click();
    await new Promise(r => setTimeout(r, 200));
    out.storeKeys = Object.keys(store);
    out.stored = store[Object.keys(store)[0]] || null;
    out.afterText = (box.querySelector('.risk-chip') || {}).textContent || '';

    // 處理後又有更新的紀錄 → 要提醒「又出現」
    // （日期篩選也要跟著往後，否則新紀錄會被 endDate 濾掉）
    all.push(mk('阿明', '2026-09-02'));
    viewDate = '2026-09-02';
    await window.refreshCoach();
    out.staleText = (box.querySelector('.risk-chip') || {}).textContent || '';
    return out;
  });
  t('risk items render as clickable buttons', handled.clickable, String(handled.clickable));
  t('clicking opens the handling panel with the coach options',
    handled.panelOpened && handled.options.includes('防護員已處理') && handled.options.includes('已聯繫家長'),
    JSON.stringify(handled.options));
  t('saving without picking a status is refused',
    handled.savedWithoutStatus === 0, String(handled.savedWithoutStatus));
  t('the handling is stored under riskHandle:<name>:<type>',
    handled.storeKeys.length === 1 && /^riskHandle:阿明:water$/.test(handled.storeKeys[0]),
    JSON.stringify(handled.storeKeys));
  t('status, note and basis date are all recorded',
    handled.stored && handled.stored.status === '防護員已處理'
      && handled.stored.note === '腳踝冰敷，明天回報' && handled.stored.basisDate === '2026-08-28',
    JSON.stringify(handled.stored));
  t('a handled item is marked as handled',
    handled.afterText.includes('✅ 防護員已處理'), handled.afterText);
  t('a newer record after handling flags it as recurring',
    handled.staleText.includes('後又出現'), handled.staleText);

  // 15. Apps Script 的 /exec 會 302；在某些瀏覽器／登入狀態下 POST 會退化成無 body 的 GET，
  //     後端回 pong，呼叫端就拿到「看似成功卻沒資料」的回應。必須擋下來並帶 query 動作。
  const lostAction = await page.evaluate(async () => {
    const calls = [];
    const realFetch = window.fetch;
    window.fetch = async (u, init) => {
      calls.push(String(u));
      return { text: async () => JSON.stringify({ ok: true, message: 'pong', time: 'x' }) };
    };
    const out = {};
    try {
      await window.postToWebApp({ action: 'getAllRecords' });
      out.threw = false;
    } catch (e) { out.threw = true; out.msg = e.message; }
    out.urlHadAction = calls.some(u => u.indexOf('action=getAllRecords') !== -1);

    // 真的問 ping 時，pong 是正確答案，不可以被誤擋
    try { out.pingResult = await window.postToWebApp({ action: 'ping' }); }
    catch (e) { out.pingResult = 'THREW: ' + e.message; }

    window.fetch = realFetch;
    return out;
  });
  t('the action is also sent in the query string',
    lostAction.urlHadAction, JSON.stringify(lostAction).slice(0, 160));
  t('a pong reply to a non-ping request is rejected, not returned as success',
    lostAction.threw === true && /動作遺失/.test(lostAction.msg || ''), JSON.stringify(lostAction).slice(0, 200));
  t('a genuine ping still succeeds',
    lostAction.pingResult && lostAction.pingResult.message === 'pong', JSON.stringify(lostAction.pingResult));

  // 16. AI 教練回覆的四種情境。重點是：一定要有可用文字，而且技術細節
  //     （授權失敗、HTTP 狀態碼、Exception 全文）不得出現在給人看的訊息裡。
  const aiCases = await page.evaluate(async () => {
    const ctx = {
      name: '阿明', rangeDays: 7, averageScore: 3.8, scoreDelta: 0,
      records: [], recentFlags: [], recentTrend: '穩定',
      strongestArea: '體能', weakestArea: '技術',
      reflection: '今天旋踢比較穩', tomorrowGoal: '收腳快一點',
      traitLabel: '', traitSummary: '', communicationTips: '', trainingTips: '',
      latest: { name: '阿明', averageScore: 3.8 }
    };
    const run = async stub => {
      window.postToWebApp = stub;
      const r = await window.generateCoachReplyFromPerformance(ctx, 'default');
      return { source: r.source, reason: r.reason || '', hasText: !!(r.text && r.text.trim()) };
    };
    return {
      AI_SUCCESS: await run(async () => ({ ok: true, versions: { student: { affirm: '今天很穩' } } })),
      AI_AUTH_ERROR: await run(async () => ({
        ok: false, errorCode: 'AI_AUTH_ERROR', error: 'AI 服務暫時無法使用' })),
      AI_TIMEOUT: await run(async () => ({
        ok: false, errorCode: 'AI_TIMEOUT', error: 'AI 服務暫時無法使用' })),
      AI_HTTP_ERROR: await run(async () => ({
        ok: false, errorCode: 'AI_HTTP_ERROR', error: 'AI 服務暫時無法使用' })),
      AI_THROWS: await run(async () => { throw new Error('你沒有呼叫「UrlFetchApp.fetch」的權限。必要權限：https://www.googleapis.com/auth/script.external_request'); }),
      AI_DISABLED: await run(async () => ({ ok: false, disabled: true, error: 'AI 回饋未啟用' })),
      AI_NO_KEY: await run(async () => ({ ok: false, disabled: true, error: '尚未設定 API Key' })),
      AI_CAPPED: await run(async () => ({ ok: false, capped: true }))
    };
  });
  const leaks = /UrlFetchApp|Exception|googleapis\.com|script\.external_request|HTTP|[0-9]{3}/;
  t('AI_SUCCESS：AI 回覆正常',
    aiCases.AI_SUCCESS.source === 'ai' && !aiCases.AI_SUCCESS.reason, JSON.stringify(aiCases.AI_SUCCESS));
  ['AI_AUTH_ERROR', 'AI_TIMEOUT', 'AI_HTTP_ERROR', 'AI_THROWS'].forEach(k => {
    const c = aiCases[k];
    t(`${k}：退回模板且有可用文字`, c.source === 'fallback' && c.hasText, JSON.stringify(c));
    t(`${k}：畫面訊息不含技術細節`,
      c.reason === 'AI 服務目前暫時無法使用，已自動切換至教練回覆模板。' && !leaks.test(c.reason),
      c.reason);
  });
  t('教練自己能處理的狀態仍照實說明（未啟用／未設金鑰／額度用完）',
    /尚未啟用/.test(aiCases.AI_DISABLED.reason) && /金鑰/.test(aiCases.AI_NO_KEY.reason)
      && /上限/.test(aiCases.AI_CAPPED.reason),
    [aiCases.AI_DISABLED.reason, aiCases.AI_NO_KEY.reason, aiCases.AI_CAPPED.reason].join(' | '));

  console.log('');
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '   -> ' + r.extra)));
  console.log('');
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 12).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
