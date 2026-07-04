/* ============================================================
   2. localStorage 工具
   ============================================================ */

const LS_KEYS = {
  players: 'yulin_players',
  webAppUrl: 'yulin_webapp_url',
  localRecords: 'yulin_local_records',
  formDraft: 'yulin_form_draft',
  parents: 'yulin_parents',
  attendanceReports: 'yulin_attendance_reports',
  coachScores: 'yulin_coach_scores'
};

function getAthleteIdForName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const players = getPlayers();
  const idx = players.indexOf(n);
  if (idx >= 0) return 'S' + String(idx + 1).padStart(3, '0');
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = ((hash << 5) - hash + n.charCodeAt(i)) | 0;
  return 'S' + String(Math.abs(hash) % 10000).padStart(4, '0');
}

function getPlayers() {
  try {
    const raw = localStorage.getItem(LS_KEYS.players);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) { /* 忽略，回傳預設 */ }
  return DEFAULT_PLAYERS.slice();
}
function savePlayers(arr) { localStorage.setItem(LS_KEYS.players, JSON.stringify(arr)); }
// 內建 CONFIG.WEB_APP_URL 優先（給所有裝置共用）；否則用各裝置自存的網址
function getWebAppUrl() { return (CONFIG.WEB_APP_URL || '').trim() || localStorage.getItem(LS_KEYS.webAppUrl) || ''; }
function saveWebAppUrl(url) { localStorage.setItem(LS_KEYS.webAppUrl, url); }

function getLocalRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.localRecords)) || []; }
  catch (e) { return []; }
}
function saveLocalRecord(record) {
  const arr = getLocalRecords();
  arr.push(record);
  localStorage.setItem(LS_KEYS.localRecords, JSON.stringify(arr));
}

function getParentsLocal() {
  try {
    const raw = localStorage.getItem(LS_KEYS.parents);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (e) { /* */ }
  return DEFAULT_PARENTS.slice();
}

function saveParentsLocal(arr) { localStorage.setItem(LS_KEYS.parents, JSON.stringify(arr)); }

function getAttendanceReportsLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.attendanceReports)) || []; }
  catch (e) { return []; }
}

function saveAttendanceReportsLocal(arr) { localStorage.setItem(LS_KEYS.attendanceReports, JSON.stringify(arr)); }

/* ============================================================
   3. 通用小工具
   ============================================================ */

function $(sel) { return document.querySelector(sel); }
function $id(id) { return document.getElementById(id); }

function toast(msg) {
  const t = $id('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 將 yyyy-mm-dd 轉成 yyyy/mm/dd 顯示
function dateSlash(s) { return normDate(s).replace(/-/g, '/'); }

/*
   把任意日期值正規化成 yyyy-mm-dd。
   Google Sheet 會把日期字串自動轉成 Date，讀回來經 JSON 會變成
   "2026-06-02T16:00:00.000Z"（UTC）這種格式，直接字串比對會對不上，
   因此後台篩選日期前一律先過這個函式。
*/
function normDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  // 已是 yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // yyyy/mm/dd（可能後面還有時間）
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // ISO 或其他可被 Date 解析的格式 -> 用本地時區還原日期
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  return s;
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

/* ============================================================
   4. 表單初始化
   ============================================================ */

// 目前使用的組別（KPI 依組別決定）
let currentGroup = '跆拳道對練';
let dailyKpiOpen = false;
let dailyKpiSession = null;

function setDailyKpiAvailability(open, session) {
  dailyKpiOpen = !!open;
  dailyKpiSession = dailyKpiOpen ? (session || null) : null;
  updateDailyKpiVisibility();
}

function updateDailyKpiVisibility() {
  const section = $id('standardKpiSection');
  if (!section) return;
  const role = getRole();
  const coachPreview = role && role.role === 'coach';
  const absent = isAbsenceGroup($id('group') ? $id('group').value : '');
  section.style.display = (!absent && (dailyKpiOpen || coachPreview)) ? '' : 'none';
}

function isDailyKpiAvailable() {
  const role = getRole();
  return !!(dailyKpiOpen || (role && role.role === 'coach'));
}

window.setDailyKpiAvailability = setDailyKpiAvailability;

// 把選項塞進 select
function fillSelect(el, options, placeholder) {
  if (el && el.tagName === 'INPUT') {
    const listId = el.getAttribute('list');
    const dl = listId ? $id(listId) : null;
    if (placeholder) el.placeholder = placeholder;
    if (dl) {
      dl.innerHTML = '';
      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        dl.appendChild(opt);
      });
    }
    return;
  }
  el.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = placeholder; opt.disabled = true; opt.selected = true;
    el.appendChild(opt);
  }
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    el.appendChild(opt);
  });
}

// 更新所有姓名下拉選單
function refreshNameSelects() {
  const players = getPlayers();
  ['name', 'lastPerfName', 'coachPersonName', 'taskAssignName', 'preCompName', 'profileName'].forEach(id => {
    const el = $id(id);
    if (!el) return;
    const prev = el.value;
    fillSelect(el, players, '請選擇選手');
    if (players.indexOf(prev) !== -1) el.value = prev;
  });
  // 想鼓勵的隊友（選填）
  const te = $id('encourageTeammate');
  if (te) {
    const prev = te.value;
    fillSelect(te, players, '（選填）選擇要鼓勵的隊友');
    if (players.indexOf(prev) !== -1) te.value = prev;
  }
}

// 渲染「鼓勵的內容」快捷按鈕（點一下帶入文字框）
function renderEncourageChips() {
  const box = $id('encourageQuick');
  if (!box) return;
  box.innerHTML = '';
  ENCOURAGE_PRESETS.forEach(text => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      const ta = $id('encouragementToTeammate');
      ta.value = ta.value.trim() ? (ta.value.trim() + '\n' + text) : text;
    });
    box.appendChild(chip);
  });
}

// 渲染「感謝今天的人事物」快捷按鈕（點一下帶入文字框）
function renderGratitudeChips() {
  const box = $id('gratitudeQuick');
  if (!box) return;
  box.innerHTML = '';
  GRATITUDE_PRESETS.forEach(text => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      const ta = $id('gratitude');
      ta.value = ta.value.trim() ? (ta.value.trim() + '\n' + text) : text;
      saveDraft();
    });
    box.appendChild(chip);
  });
}

/* ---- 今日心情指數（表情單選 + 原因快捷）---- */
function renderMoodPicker() {
  const box = $id('moodPicker');
  if (!box || box.dataset.ready) return;
  box.innerHTML = '';
  MOOD_OPTIONS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood-btn';
    btn.dataset.mood = m.v;
    btn.innerHTML = `<span class="mood-emoji">${m.emoji}</span><span class="mood-label">${m.label}</span>`;
    btn.addEventListener('click', () => {
      const on = btn.classList.contains('sel');
      box.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
      if (!on) btn.classList.add('sel');   // 再點一次可取消
      const showReason = box.querySelector('.mood-btn.sel');
      const lbl = $id('moodReasonLabel');
      if (lbl) lbl.style.display = showReason ? '' : 'none';
      updateMoodCareNote();
      saveDraft();
    });
    box.appendChild(btn);
  });
  box.dataset.ready = '1';
  // 原因快捷（可複選，點一下切換 .sel）
  const rc = $id('moodReasonChips');
  if (rc && !rc.dataset.ready) {
    rc.innerHTML = '';
    MOOD_REASON_CHIPS.forEach(label => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = label;
      chip.addEventListener('click', () => { chip.classList.toggle('sel'); saveDraft(); });
      rc.appendChild(chip);
    });
    rc.dataset.ready = '1';
  }
}
// 讀目前選的心情值（沒選回 ''）
function getMoodIndex() {
  const sel = document.querySelector('#moodPicker .mood-btn.sel');
  return sel ? sel.dataset.mood : '';
}
function setMoodIndex(v) {
  const box = $id('moodPicker'); if (!box) return;
  box.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('sel', String(b.dataset.mood) === String(v)));
  const lbl = $id('moodReasonLabel');
  if (lbl) lbl.style.display = v ? '' : 'none';
  updateMoodCareNote();
}

// 心情偏低（≤2）時，提醒學生主動尋求可信任成人協助。
function updateMoodCareNote() {
  const note = $id('moodCareNote');
  if (!note) return;
  const v = parseFloat(getMoodIndex());
  if (!isNaN(v) && v <= 2) {
    note.style.display = '';
    note.innerHTML = `今天心情好像有點低 💛 要不要到 <a href="${SOLACE_URL}" target="_blank" rel="noopener">解憂信箱</a> 跟運動心理教練說說？不用勉強自己一個人扛。`;
  } else {
    note.style.display = 'none';
    note.innerHTML = '';
  }
}
/* ---- 睡眠：用就寢/起床時間算時長，AI 判讀是否充足 ---- */
// 跨午夜處理：起床早於就寢時自動 +24 小時
function computeSleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const b = bed.split(':').map(Number), w = wake.split(':').map(Number);
  if (b.length < 2 || w.length < 2 || [b[0], b[1], w[0], w[1]].some(isNaN)) return null;
  let mins = (w[0] * 60 + w[1]) - (b[0] * 60 + b[1]);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}
// 國中生建議睡眠 8–10 小時
function sleepVerdict(h) {
  if (h == null) return null;
  if (h < 6) return { label: '明顯不足', cls: 'bad', tip: '睡不到 6 小時，恢復會打折，今天訓練特別留意疲勞與專注。' };
  if (h < 7) return { label: '偏少', cls: 'warn', tip: '低於建議量（國中生建議 8–10 小時），盡量提早就寢補回來。' };
  if (h <= 10) return { label: '充足', cls: 'good', tip: '睡眠充足，有利恢復、長高與專注，繼續保持 👍' };
  return { label: '偏多', cls: 'warn', tip: '睡很久也可能代表身體太累或作息不規律，注意固定作息。' };
}
function updateSleepCalc() {
  const bedEl = $id('bedTime'), wakeEl = $id('wakeTime'), hidden = $id('sleepHours');
  if (!bedEl || !wakeEl || !hidden) return;
  const h = computeSleepHours(bedEl.value, wakeEl.value);
  hidden.value = (h == null ? '' : h);
  const box = $id('sleepCalc');
  if (!box) return;
  if (h == null) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const v = sleepVerdict(h);
  box.style.display = '';
  box.className = 'sleep-calc ' + v.cls;
  box.innerHTML = `🛌 睡眠時長 <b>${h}</b> 小時・AI 判讀：<b>${v.label}</b><br><span class="sleep-tip">${v.tip}</span>`;
  // 防呆：時數極端 → 可能就寢/起床填反了
  const warn = $id('sleepWarn');
  if (warn) {
    if (h >= 14 || h < 3.5) {
      warn.style.display = '';
      warn.textContent = `⚠️ 睡眠時數看起來怪怪的（${h} 小時）—— 確認「就寢」填的是晚上睡覺時間、「起床」填的是早上時間，別填反囉。`;
    } else { warn.style.display = 'none'; warn.textContent = ''; }
  }
}

/* ---- 受傷疼痛指數 0–10：依分級顯示體感與關懷 ---- */
function painGrade(n) {
  if (n <= 0) return { label: '完全不痛', cls: 'p0' };
  if (n <= 3) return { label: '輕度疼痛', cls: 'p1' };
  if (n <= 6) return { label: '中度疼痛', cls: 'p2' };
  if (n <= 9) return { label: '重度疼痛', cls: 'p3' };
  return { label: '痛到極限', cls: 'p4' };
}
function updatePainReadout() {
  const sl = $id('painScore');
  if (!sl) return;
  const n = parseInt(sl.value, 10) || 0;
  const g = painGrade(n);
  if ($id('painNum')) $id('painNum').textContent = n;
  if ($id('painLabel')) $id('painLabel').textContent = g.label;
  const ro = $id('painReadout'); if (ro) ro.className = 'pain-readout ' + g.cls;
  const care = $id('painCare');
  if (care) {
    // 教練管理提醒（非醫療診斷）：依疼痛分級給訓練處理方向
    if (n >= 10) { care.style.display = ''; care.className = 'pain-care bad'; care.textContent = '🛑 立即停止訓練，馬上告知教練與家長，必要時就醫檢查，先不要再活動該部位。'; }
    else if (n >= 7) { care.style.display = ''; care.className = 'pain-care bad'; care.textContent = '⚠️ 停止專項訓練，改做恢復與觀察，務必告知教練；若持續或加劇，請通知家長並評估就醫。'; }
    else if (n >= 4) { care.style.display = ''; care.className = 'pain-care warn'; care.textContent = '💛 降低訓練強度，避免高衝擊、爆發與對抗動作，並讓教練知道狀況。'; }
    else if (n >= 1) { care.style.display = ''; care.className = 'pain-care'; care.textContent = '🟢 可正常訓練，記得確實熱身、收操，並留意該部位是否變化。'; }
    else { care.style.display = 'none'; care.textContent = ''; }
  }
}

/* ---- 尿液顏色監控：脫水快篩 ---- */
const URINE_NOTE = {
  '透明無色': ['', '水分可能略過量，正常喝就好，不用一直灌水。'],
  '淡黃清澈': ['good', '水分充足，補水狀態理想，繼續保持 👍'],
  '黃色': ['warn', '水分稍微不足，再補一些開水。'],
  '深黃': ['bad', '身體缺水了，請盡快補充 500ml 以上開水。'],
  '琥珀色': ['bad', '嚴重缺水！請立即補水並告知教練，避免熱衰竭或抽筋。']
};
function updateUrineNote() {
  const sel = $id('urineStatus'), box = $id('urineNote');
  if (!sel || !box) return;
  const v = sel.value, info = URINE_NOTE[v];
  if (!v || !info) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = '';
  box.className = 'urine-note ' + (info[0] || '');
  box.innerHTML = '💧 ' + info[1];
}

// 心情原因：moodReasonChips 用 buildChipToggler 綁到一個隱藏欄位；這裡直接讀已選 chip
function getMoodReason() {
  const box = $id('moodReasonChips');
  if (!box) return '';
  return Array.from(box.querySelectorAll('.chip.sel')).map(c => c.textContent).join('、');
}
function setMoodReason(str) {
  const box = $id('moodReasonChips');
  if (!box) return;
  const want = String(str || '').split(/[、,]/).map(s => s.trim()).filter(Boolean);
  box.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', want.indexOf(c.textContent) !== -1));
}
function clearMood() {
  const box = $id('moodPicker'); if (box) box.querySelectorAll('.mood-btn.sel').forEach(b => b.classList.remove('sel'));
  const rc = $id('moodReasonChips'); if (rc) rc.querySelectorAll('.chip.sel').forEach(c => c.classList.remove('sel'));
  const lbl = $id('moodReasonLabel'); if (lbl) lbl.style.display = 'none';
  updateMoodCareNote();
}

/* ---- 名單雲端同步（全裝置共用）---- */

// 從 Google Sheet 拉名單（學生手機開連結時自動取得最新名單）
async function loadRosterFromServer() {
  if (!getWebAppUrl()) return;
  try {
    const res = await postToWebApp({ action: 'getRoster' });
    if (res && res.ok && Array.isArray(res.data) && res.data.length) {
      savePlayers(res.data);     // 更新本機快取
      refreshNameSelects();
      renderPlayerList();
    }
  } catch (e) { /* 安靜失敗，沿用本機名單 */ }
}

// 把目前名單推到 Google Sheet（教練改名單後呼叫）
async function pushRosterToServer() {
  if (!getWebAppUrl()) return false;
  try {
    const res = await postToWebApp({ action: 'setRoster', players: getPlayers(), adminKey: getLineAdminKey() });
    return !!(res && res.ok);
  } catch (e) { return false; }
}

/* ============================================================
   通用同步儲存（appdata）：本機優先 + 有雲端就同步
   ------------------------------------------------------------
   給新功能（教練指定任務、個人檔案目標/備註等）用。
   key 例：task:<name>:<yyyy-mm-dd>、profile:<name>
   ============================================================ */

function appLocalKey(key) { return 'yulin_app_' + key; }

// 讀：先回本機快取（同步），同時背景向雲端要最新值並回填 + 觸發 callback
function appGet(key, cb) {
  let val = null;
  try { const raw = localStorage.getItem(appLocalKey(key)); if (raw) val = JSON.parse(raw); } catch (e) { /* */ }
  if (getWebAppUrl()) {
    postToWebApp({ action: 'getAppData', key: key }).then(res => {
      if (res && res.ok && res.data !== undefined && res.data !== null) {
        try { localStorage.setItem(appLocalKey(key), JSON.stringify(res.data)); } catch (e) { /* */ }
        if (cb) cb(res.data);
      } else if (cb) cb(val);
    }).catch(() => { if (cb) cb(val); });
  } else if (cb) {
    cb(val);
  }
  return val;
}

// 寫：先寫本機，有雲端就同步（回傳 Promise<boolean>）
async function appSet(key, value) {
  try { localStorage.setItem(appLocalKey(key), JSON.stringify(value)); } catch (e) { /* */ }
  if (!getWebAppUrl()) return false;
  try {
    const res = await postToWebApp({ action: 'setAppData', key: key, value: value, adminKey: getLineAdminKey() });
    return !!(res && res.ok);
  } catch (e) { return false; }
}

function appKeyTask(name, date) { return 'task:' + name + ':' + normDate(date); }
function appKeyProfile(name) { return 'profile:' + name; }
function appKeyTrait(name) { return 'trait:' + String(name || '').trim(); }

// 取某前綴的所有資料（雲端優先，否則掃本機）。回傳 Promise<{key:value}>
async function appGetAll(prefix) {
  const local = {};
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getAllAppData', prefix: prefix || '' });
      if (res && res.ok && res.data && typeof res.data === 'object') {
        Object.assign(local, res.data);
      }
    } catch (e) { /* 落回本機 */ }
  }
  const lp = 'yulin_app_';
  for (let i = 0; i < localStorage.length; i++) {
    const lk = localStorage.key(i);
    if (lk && lk.indexOf(lp) === 0) {
      const key = lk.slice(lp.length);
      if (prefix && key.indexOf(prefix) !== 0) continue;
      try {
        if (local[key] === undefined) local[key] = JSON.parse(localStorage.getItem(lk));
      } catch (e) { /* */ }
    }
  }
  return local;
}

