const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('yulin_players', JSON.stringify(['甲同學']));
    window.fetch = async input => {
      const url = String((input && input.url) ? input.url : input || '');
      if (url.indexOf('script.google.com') !== -1) {
        return new Response(JSON.stringify({ ok: false, authRequired: true, error: 'expired' }), { status: 200 });
      }
      throw new Error('unexpected fetch ' + url);
    };
  });

  await page.goto(URL);
  await page.waitForTimeout(1200);

  const results = [];
  const t = (name, ok, extra = '') => results.push({ name, ok, extra });

  const authHandling = await page.evaluate(async () => {
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'student', name: '甲同學', studentId: 'S1', authToken: 'token' }));
    await window.postToWebApp({ action: 'getRecentRecordsByName', name: '甲同學', limit: 30, _background: true });
    const afterBackground = JSON.parse(localStorage.getItem('yulin_role') || 'null');
    await window.postToWebApp({ action: 'addRecord', payload: { name: '甲同學', date: '2026-08-30' }, _criticalAuth: true });
    const afterCritical = localStorage.getItem('yulin_role');
    return { afterBackground, afterCritical };
  });
  t('background authRequired keeps the current role', !!authHandling.afterBackground && authHandling.afterBackground.name === '甲同學', JSON.stringify(authHandling));
  t('critical authRequired still clears the current role', authHandling.afterCritical === null, JSON.stringify(authHandling));

  const coachReadHandling = await page.evaluate(async () => {
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'coach', name: '', teamId: 'yulin-taekwondo', authToken: 'coach-token' }));
    try { await window.fetchAllRecords({ strict: true, force: true }); } catch (e) {}
    return JSON.parse(localStorage.getItem('yulin_role') || 'null');
  });
  t('coach background getAllRecords authRequired does not clear role', !!coachReadHandling && coachReadHandling.role === 'coach', JSON.stringify(coachReadHandling));

  const lazy = await page.evaluate(() => {
    localStorage.setItem('yulin_role', JSON.stringify({ role: 'student', name: '甲同學', studentId: 'S1', authToken: 'token' }));
    let profileCalls = 0;
    const original = window.loadProfile;
    window.loadProfile = async function () { profileCalls++; };
    window.applyRole();
    const afterApply = profileCalls;
    window.switchTab('profile');
    return new Promise(resolve => setTimeout(() => {
      window.loadProfile = original;
      resolve({ afterApply, afterProfileTab: profileCalls });
    }, 30));
  });
  t('applyRole does not eagerly load profile under lazy flag', lazy.afterApply === 0, JSON.stringify(lazy));
  t('profile tab loads profile once on demand', lazy.afterProfileTab === 1, JSON.stringify(lazy));

  t('no page errors', errors.length === 0, errors.join('\n'));
  await browser.close();

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`));
  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} failed`);
    process.exit(1);
  }
  console.log(`\n${results.length}/${results.length} passed`);
})();
