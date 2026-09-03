/* 日常 UI 不得存在「無限制 fetchAllRecords」的守門測試。
   ------------------------------------------------------------
   2026-09 的事故是這樣來的：日常互動 UI 用「先抓全部再本機 filter」的寫法。
   資料小的時候看不出來；records 長到 1812 列（11.86MB / 6 頁）之後，
   每一次互動都變成多頁大型傳輸，把「一次可能失敗」放大成「六次都不能失敗」，
   手機上就出現 Failed to fetch，整個區塊掛掉。

   所以：只有真正需要完整歷史的功能（研究匯出／完整備份）可以無限制呼叫。
   其餘一律要帶 bounded 參數（dashboard / sinceDate / date+days）。

   未來有人在日常 UI 再寫一次 fetchAllRecords() 而沒有 bounded 參數時，
   這支測試會直接失敗，並指出檔名與行號。 */
const fs = require('fs');
const path = require('path');
const B = path.join(__dirname, '..');

const results = [];
const t = (name, ok, extra = '') => results.push({ name, ok, extra });

// 唯一允許無限制讀取的呼叫點（E 類：真正需要完整歷史）
const ALLOWED_FULL_HISTORY = [
  { file: 'js/12-research-data.js', fn: 'loadResearchRecords', why: '研究資料匯出，需要完整歷史' }
];

const FILES = ['js/07-coach-dashboard.js', 'js/08-profile-journal.js', 'js/12-research-data.js',
  'monthly-report.js', 'kpi-session.js', 'js/03-forms-scoring.js', 'js/04-daily-submit.js',
  'js/05-feedback-readiness.js', 'js/09-settings-auth.js', 'js/10-init.js', 'js/11-trait-radar.js',
  'js/13-mental-preparation.js', 'js/14-kpi-refactor.js'];

// bounded 的判準：呼叫時帶了會限制讀取範圍的參數
const BOUNDED_HINTS = ['dashboard:', 'sinceDate:', 'sinceDate ', 'Opts)', 'opts)'];

function enclosingFunction(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (m) return m[1];
    const m2 = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/.exec(lines[i]);
    if (m2) return m2[1];
  }
  return '(top-level)';
}

const violations = [];
const bounded = [];
for (const rel of FILES) {
  const full = path.join(B, rel);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // 略過定義本身與註解
    const trimmed = line.trim();
    if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
    if (/function fetchAllRecords/.test(line)) return;
    if (!/\bfetchAllRecords\s*\(/.test(line)) return;

    // 取這一行到後面 6 行當作呼叫的參數範圍（多行物件參數）
    const chunk = lines.slice(i, i + 7).join('\n');
    const callArgs = chunk.slice(chunk.indexOf('fetchAllRecords('));
    const isBounded = BOUNDED_HINTS.some(h => callArgs.indexOf(h) !== -1);
    const entry = { file: rel, line: i + 1, fn: enclosingFunction(lines, i), code: trimmed.slice(0, 80) };
    if (isBounded) bounded.push(entry);
    else violations.push(entry);
  });
}

const allowedKey = e => ALLOWED_FULL_HISTORY.some(a => a.file === e.file && a.fn === e.fn);
const realViolations = violations.filter(e => !allowedKey(e));
const allowedSeen = violations.filter(allowedKey);

t('日常 UI（A～D 類）沒有任何無限制的 fetchAllRecords()',
  realViolations.length === 0,
  realViolations.map(e => `${e.file}:${e.line} ${e.fn}() → ${e.code}`).join('  ||  '));

t('研究匯出仍然保有完整歷史讀取（E 類沒有被誤縮）',
  allowedSeen.length === ALLOWED_FULL_HISTORY.length,
  allowedSeen.length + ' / ' + ALLOWED_FULL_HISTORY.length);

t('bounded 呼叫點數量合理（有真的改到，不是把呼叫刪光）',
  bounded.length >= 5, bounded.length + ' 個 bounded 呼叫點');

/* 個別釘住這次修掉的四個點，避免有人「順手改回去」 */
const coach = fs.readFileSync(path.join(B, 'js', '07-coach-dashboard.js'), 'utf8');

t('loadTodayReportedStudents 走 bounded（今日回報名單）',
  /loadTodayReportedStudents[\s\S]{0,1200}?dashboard:\s*true/.test(coach)
    && coach.includes('TODAY_REPORT_HISTORY_DAYS'), '');

t('renderWeeklyStars 只讀本週',
  /renderWeeklyStars[\s\S]{0,1500}?WEEKLY_STARS_DAYS/.test(coach)
    && coach.includes('weekStartMondayStr()'), '');

t('loadLastPerfPage 只讀該選手，不再抓整隊完整歷史',
  /loadLastPerfPage[\s\S]{0,2000}?fetchRecentRecords\(name, LAST_PERF_HISTORY_LIMIT\)/.test(coach), '');

t('renderCoachAttendanceReports 不再自己打後端（改用傳進來的當日資料）',
  /renderCoachAttendanceReports[\s\S]{0,1500}?const allRecords = Array\.isArray\(todays\)/.test(coach)
    && !/renderCoachAttendanceReports[\s\S]{0,1500}?await fetchAllRecords\(\)/.test(coach), '');

/* 寫入型 API 絕對不可以走進會自動重試的讀取層 */
const auth = fs.readFileSync(path.join(B, 'js', '09-settings-auth.js'), 'utf8');
t('safeReadRequest 明確拒絕寫入型 action（重試會造成重複寫入）',
  auth.includes('safeReadRequest 不接受寫入型 action'), '');
['addRecord', 'updateRecord', 'saveCoachScore', 'saveCoachReply'].forEach(a => {
  t('寫入型 action 在拒絕清單內：' + a,
    new RegExp("WRITE_ACTIONS[\\s\\S]{0,1500}?'" + a + "'").test(auth), '');
});
t('沒有任何地方把寫入型 action 丟進 safeReadRequest',
  !/safeReadRequest\(\s*\{\s*action:\s*'(addRecord|updateRecord|saveCoachScore|saveCoachReply|submitWeeklyKpi)'/.test(coach + auth), '');

console.log('');
results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n        -> ' + r.extra)));
console.log('\nbounded 呼叫點：');
bounded.forEach(e => console.log('  ' + (e.file + ':' + e.line).padEnd(34) + e.fn + '()'));
console.log('允許完整歷史：');
allowedSeen.forEach(e => console.log('  ' + (e.file + ':' + e.line).padEnd(34) + e.fn + '()'));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
