const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // #name and #encourageTeammate are <select>s populated from the localStorage roster.
  // Without seeding it they have no options, `select.value = '...'` silently stays '',
  // and every validation assertion below would pass for the wrong reason.
  await page.addInitScript(() => {
    localStorage.setItem('yulin_players', JSON.stringify(['測試選手', '隊友一號', '隊友二號']));
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
