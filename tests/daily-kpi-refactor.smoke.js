const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

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
    document.getElementById('group').value = '跆拳道對練';
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

  // 7. validateForm blocks a missing chip answer
  const blocked = await page.evaluate(() => {
    const box = document.getElementById('reflectionEvidenceChips');
    box.querySelectorAll('.chip').forEach(b => b.classList.remove('sel'));
    const ok = window.validateForm();
    box.querySelector('[data-value="教練提醒"]').click();
    return ok;
  });
  t('validateForm rejects a missing evidence chip', blocked === false, String(blocked));

  // 8. absence group hides the daily KPI card, training group shows it again
  const visibility = await page.evaluate(() => {
    const sec = document.getElementById('standardKpiSection');
    const g = document.getElementById('group');
    g.value = '未出席訓練';
    window.toggleAbsenceReason(g.value);
    const whenAbsent = sec.style.display;
    g.value = '跆拳道對練';
    window.toggleAbsenceReason(g.value);
    return { whenAbsent, whenTraining: sec.style.display };
  });
  t('daily KPI card hidden when absent, shown when training (no weekly session open)',
    visibility.whenAbsent === 'none' && visibility.whenTraining === '', JSON.stringify(visibility));

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
