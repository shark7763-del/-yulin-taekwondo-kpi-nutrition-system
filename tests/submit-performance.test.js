const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const daily = fs.readFileSync(path.join(root, 'js', '04-daily-submit.js'), 'utf8');
const forms = fs.readFileSync(path.join(root, 'js', '03-forms-scoring.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', '09-settings-auth.js'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js', '01-config-data.js'), 'utf8');

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

const doSubmitInner = daily.slice(daily.indexOf('async function doSubmitInner'), daily.indexOf('async function doSubmitAbsence'));
const addRecordLocked = code.slice(code.indexOf('function addRecordLocked_'), code.indexOf('// 讀取全部紀錄為物件陣列'));
const addRecord = code.slice(code.indexOf('function addRecord(payload)'), code.indexOf('function addRecordLocked_'));

t('feature flags exist for rollback', /USE_OPTIMIZED_RECORD_READ:\s*true/.test(config) &&
  /USE_LAZY_PROFILE_LOAD:\s*true/.test(config) &&
  /USE_OPTIMIZED_SUBMIT_CONTEXT:\s*true/.test(config), '');
t('fetchSubmitContext API is implemented on the frontend', /async function fetchSubmitContext/.test(forms) && /action:\s*'getSubmitContext'/.test(forms), '');
// 限制筆數不能低於 60：buildAffirmations 用這份歷史判斷「個人最佳 PB」，
// 視窗縮小會讓早就破過的紀錄被當成新 PB 而誤發徽章。
const submitCtxCall = /const submitContext = await fetchSubmitContext\(name, date, (\d+)\)/.exec(daily);
t('submit path uses getSubmitContext before doSubmitInner', !!submitCtxCall, '');
t('submit context keeps a >= 60 record window (PB detection)',
  !!submitCtxCall && Number(submitCtxCall[1]) >= 60, submitCtxCall && submitCtxCall[1]);
t('doSubmitInner no longer performs duplicate last and recent reads', !/Promise\.all\(\s*\[\s*fetchLastRecord\(rec\.name\),\s*fetchRecentRecords\(rec\.name,\s*60\)/s.test(doSubmitInner), '');
t('submit buttons are disabled and labelled while submitting', /b\.disabled = true; b\.textContent = '正在送出\.\.\.'/.test(daily), '');
t('getSubmitContext is exposed by the backend router', /case 'getSubmitContext':\s*return jsonOut\(getSubmitContext\(data\)\);/.test(code), '');
t('LockService remains in addRecord', /LockService\.getScriptLock\(\)/.test(addRecord) && /tryLock\(15000\)/.test(addRecord), '');
t('LINE push runs after the lock block, not inside addRecordLocked_', !/pushRecordToLine/.test(addRecordLocked) && /saved\.line = pushRecordToLine\(payload\)/.test(addRecord), '');
t('mainWriteSucceeded is returned separately from LINE status', /mainWriteSucceeded:\s*true/.test(addRecordLocked), '');
t('performance diagnostics can be disabled in production', /DEBUG_PERFORMANCE:\s*false/.test(config) && /var DEBUG_PERFORMANCE = false;/.test(code), '');
t('background read authRequired is not an immediate logout path', /_background:\s*true/.test(forms) && /background request returned authRequired; session kept/.test(auth), '');

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`));
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`);
  process.exit(1);
}
console.log(`\n${results.length}/${results.length} passed`);
