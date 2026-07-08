/* ============================================================
   13. 系統設定：URL 與名單管理
   ============================================================ */

function renderPlayerList() {
  const list = getPlayers();
  const ul = $id('playerList');
  ul.innerHTML = '';
  list.forEach((name, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="p-name">${name}</span>
      <button class="edit" data-idx="${idx}">✏️ 修改</button>
      <button class="del" data-idx="${idx}">🗑️ 刪除</button>`;
    ul.appendChild(li);
  });

  // 綁定刪除
  ul.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const arr = getPlayers();
      arr.splice(idx, 1);
      savePlayers(arr);
      renderPlayerList();
      refreshNameSelects();
      syncRosterAndToast('已刪除');
    });
  });
  // 綁定修改（切換成輸入框）
  ul.querySelectorAll('button.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const arr = getPlayers();
      const li = btn.parentElement;
      li.innerHTML = `
        <input class="p-edit" value="${arr[idx]}" />
        <button class="save">💾 儲存</button>
        <button class="del cancel">✖ 取消</button>`;
      li.querySelector('.save').addEventListener('click', () => {
        const newName = li.querySelector('.p-edit').value.trim();
        if (newName) { arr[idx] = newName; savePlayers(arr); }
        renderPlayerList(); refreshNameSelects(); syncRosterAndToast('已修改');
      });
      li.querySelector('.cancel').addEventListener('click', renderPlayerList);
    });
  });
}

function setupSettingsHandlers() {
  // 顯示目前 URL
  $id('webAppUrl').value = getWebAppUrl();
  if (getWebAppUrl()) showConn('info', '目前已設定 Web App URL。');

  $id('btnSaveUrl').addEventListener('click', () => {
    const url = $id('webAppUrl').value.trim();
    saveWebAppUrl(url);
    if (url) showConn('info', '已儲存 Web App URL，建議按「測試連線」確認。');
    else showConn('info', '已清空 URL，目前為本機測試模式。');
    toast('已儲存設定');
  });

  $id('btnClearUrl').addEventListener('click', () => {
    saveWebAppUrl('');
    $id('webAppUrl').value = '';
    showConn('info', '已清除，目前為本機測試模式。');
    toast('已清除設定');
  });

  $id('btnTestConn').addEventListener('click', async () => {
    const url = $id('webAppUrl').value.trim();
    if (!url) { showConn('fail', '請先輸入 Web App URL。'); return; }
    saveWebAppUrl(url);
    showConn('info', '測試中...');
    try {
      const res = await postToWebApp({ action: 'ping' });
      if (res && res.ok) showConn('ok', '連線成功，可以開始使用。');
      else showConn('fail', '連線失敗，請確認 Web App URL 與部署權限。');
    } catch (e) {
      showConn('fail', '連線失敗，請確認 Web App URL 與部署權限。');
    }
  });

  // 名單管理
  $id('btnAddPlayer').addEventListener('click', () => {
    const name = $id('newPlayerName').value.trim();
    if (!name) { toast('請輸入姓名'); return; }
    const arr = getPlayers();
    if (arr.indexOf(name) !== -1) { toast('名單已有此選手'); return; }
    arr.push(name); savePlayers(arr);
    $id('newPlayerName').value = '';
    renderPlayerList(); refreshNameSelects();
    syncRosterAndToast('已新增');
  });

  $id('btnResetPlayers').addEventListener('click', async () => {
    await loadRosterFromServer();
    toast('已重新載入雲端名單');
  });

  $id('btnExportPlayers').addEventListener('click', () => {
    $id('importExportBox').value = JSON.stringify(getPlayers(), null, 2);
    toast('已匯出到下方文字框');
  });

  $id('btnImportPlayers').addEventListener('click', () => {
    try {
      const arr = JSON.parse($id('importExportBox').value);
      if (!Array.isArray(arr) || !arr.length) throw new Error('格式錯誤');
      savePlayers(arr.map(String));
      renderPlayerList(); refreshNameSelects();
      syncRosterAndToast('已匯入名單');
    } catch (e) { toast('匯入失敗：請確認是 JSON 陣列格式'); }
  });

  // 設定教練密碼：後端只保存雜湊
  const setPwdBtn = $id('btnSetCoachPwd');
  if (setPwdBtn) setPwdBtn.addEventListener('click', async () => {
    const np = $id('newCoachPwd').value.trim();
    const st = $id('coachPwdStatus');
    if (np.length < 8) { st.className = 'conn-status fail'; st.textContent = '教練密碼至少需要 8 個字元。'; return; }
    if (!getWebAppUrl()) { st.className = 'conn-status fail'; st.textContent = '尚未設定 Web App URL。'; return; }
    st.className = 'conn-status info'; st.textContent = '設定中...';
    try {
      const res = await postToWebApp({ action: 'setCoachPassword', newPassword: np });
      if (res && res.ok) {
        $id('newCoachPwd').value = '';
        st.className = 'conn-status ok'; st.textContent = '✅ 教練密碼已設定。';
      } else {
        st.className = 'conn-status fail'; st.textContent = '設定失敗：' + ((res && res.error) || '請確認舊密碼');
      }
    } catch (e) { st.className = 'conn-status fail'; st.textContent = '設定失敗，請檢查連線。'; }
  });

  // 手動同步名單到雲端
  const syncBtn = $id('btnSyncRoster');
  if (syncBtn) syncBtn.addEventListener('click', async () => {
    if (!getWebAppUrl()) { toast('未設定 Web App URL，無法同步'); return; }
    syncBtn.disabled = true; syncBtn.textContent = '同步中...';
    const ok = await pushRosterToServer();
    syncBtn.disabled = false; syncBtn.textContent = '☁️ 同步名單到雲端';
    toast(ok ? '✅ 名單已同步，所有裝置都會更新' : '⚠️ 同步失敗（檢查 URL 或管理密碼）');
  });

  // ---- LINE 推播設定 ----
  setupLineHandlers();

  // ---- 本週之星設定 ----
  setupStarHandlers();
}

/* ============================================================
   本週之星設定（前端，共用 ADMIN_KEY）
   ============================================================ */
function showStarStatus(type, msg) {
  const el = $id('starStatus');
  if (!el) return;
  el.className = 'conn-status ' + type;
  el.textContent = msg;
}

async function loadStarStatus() {
  if (!getWebAppUrl()) { showStarStatus('', '尚未設定 Web App URL（仍會以「開啟」顯示）。'); return; }
  try {
    const res = await postToWebApp({ action: 'getStarConfig' });
    if (res && res.ok && res.data) {
      $id('starEnabled').checked = !!res.data.enabled;
      showStarStatus('ok', '✅ 目前狀態：' + (res.data.enabled ? '顯示中' : '已關閉'));
    } else {
      showStarStatus('fail', '讀取失敗：' + ((res && res.error) || '請確認後端是否已更新部署'));
    }
  } catch (e) { showStarStatus('fail', '讀取失敗，請檢查連線。'); }
}

function setupStarHandlers() {
  const saveBtn = $id('btnSaveStar');
  const refreshBtn = $id('btnRefreshStar');
  const keyEl = $id('starAdminKey');
  if (!saveBtn) return;

  // 還原管理密碼（與 LINE 共用同一組 ADMIN_KEY）
  if (keyEl) keyEl.value = getLineAdminKey();

  saveBtn.addEventListener('click', async () => {
    if (!getWebAppUrl()) { showStarStatus('fail', '請先在上方設定並儲存 Web App URL。'); return; }
    const adminKey = keyEl ? keyEl.value.trim() : '';
    saveLineAdminKey(adminKey);
    saveBtn.disabled = true; saveBtn.textContent = '儲存中...';
    try {
      const res = await postToWebApp({ action: 'setStarConfig', adminKey: adminKey, enabled: $id('starEnabled').checked });
      if (res && res.ok) {
        showStarStatus('ok', '✅ 已儲存：' + (res.data && res.data.enabled ? '顯示中' : '已關閉'));
        renderWeeklyStars();
      } else {
        showStarStatus('fail', '儲存失敗：' + ((res && res.error) || '請確認管理密碼/部署'));
      }
    } catch (e) { showStarStatus('fail', '儲存失敗，請檢查連線。'); }
    saveBtn.disabled = false; saveBtn.textContent = '💾 儲存設定';
  });

  if (refreshBtn) refreshBtn.addEventListener('click', loadStarStatus);

  loadStarStatus();
}

// 改完名單後：本機已存，若有雲端則一併推上去
async function syncRosterAndToast(msg) {
  if (getWebAppUrl()) {
    const ok = await pushRosterToServer();
    toast(ok ? msg + '（已同步雲端）' : msg + '（雲端同步失敗，僅存本機）');
  } else {
    toast(msg);
  }
}

/* ============================================================
   LINE 推播設定（前端）
   ============================================================ */

// 管理密碼存在 localStorage，方便重複操作（token 不存前端，只在送出時打字）
function getLineAdminKey() { return localStorage.getItem('yulin_line_adminkey') || ''; }
function saveLineAdminKey(k) { localStorage.setItem('yulin_line_adminkey', k); }

function showLineStatus(type, msg) {
  const el = $id('lineStatus');
  el.className = 'conn-status ' + type;
  el.textContent = msg;
}

function setupLineHandlers() {
  // 還原管理密碼
  $id('lineAdminKey').value = getLineAdminKey();

  // 儲存推播設定
  $id('btnSaveLine').addEventListener('click', async () => {
    if (!getWebAppUrl()) { showLineStatus('fail', '請先在上方設定並儲存 Web App URL。'); return; }
    const adminKey = $id('lineAdminKey').value.trim();
    saveLineAdminKey(adminKey);
    const body = {
      action: 'setLineConfig',
      adminKey: adminKey,
      targetId: $id('lineTargetId').value.trim(),
      versions: $id('lineVersions').value,
      enabled: $id('lineEnabled').checked
    };
    const tk = $id('lineToken').value.trim();
    if (tk) body.token = tk; // 有填才更新 token，避免覆蓋成空
    showLineStatus('info', '儲存中...');
    try {
      const res = await postToWebApp(body);
      if (res && res.ok) {
        showLineStatus('ok', '已儲存推播設定。' + (res.data && res.data.enabled ? '（已啟用）' : '（未啟用）'));
        $id('lineToken').value = ''; // 清掉畫面上的 token
        applyLineStatus(res.data);
      } else {
        showLineStatus('fail', '儲存失敗：' + (res && res.error ? res.error : '未知錯誤'));
      }
    } catch (e) { showLineStatus('fail', '儲存失敗，請確認 Web App URL 與部署。'); }
  });

  // 測試推播
  $id('btnTestLine').addEventListener('click', async () => {
    if (!getWebAppUrl()) { showLineStatus('fail', '請先設定 Web App URL。'); return; }
    showLineStatus('info', '推播測試中...');
    try {
      const res = await postToWebApp({ action: 'lineTest', adminKey: $id('lineAdminKey').value.trim() });
      if (res && res.ok) showLineStatus('ok', '✅ 已送出測試訊息，請到 LINE 確認。');
      else showLineStatus('fail', '推播失敗：' + (res && res.error ? res.error : '請確認 token 與目標 ID'));
    } catch (e) { showLineStatus('fail', '推播失敗，請檢查設定。'); }
  });

  // 自動帶入 Webhook 捕獲的群組 ID
  $id('btnGetGroupId').addEventListener('click', async () => {
    if (!getWebAppUrl()) { showLineStatus('fail', '請先設定 Web App URL。'); return; }
    showLineStatus('info', '讀取捕獲 ID...');
    try {
      const res = await postToWebApp({ action: 'getLineLastSource' });
      if (res && res.ok && res.data && res.data.lastSourceId) {
        $id('lineTargetId').value = res.data.lastSourceId;
        showLineStatus('ok', `已帶入（${res.data.lastSourceType || '來源'}）ID，記得按「儲存推播設定」。`);
      } else {
        showLineStatus('fail', '尚未捕獲到 ID。請把官方帳號加入群組後，在群組發一句話再試。');
      }
    } catch (e) { showLineStatus('fail', '讀取失敗。'); }
  });

  // 讀取目前狀態
  $id('btnRefreshLine').addEventListener('click', loadLineStatus);

  // 啟動時若已設定 URL，自動帶出目前 LINE 狀態
  if (getWebAppUrl()) loadLineStatus();
}

async function loadLineStatus() {
  if (!getWebAppUrl()) { showLineStatus('info', '尚未設定 Web App URL，無法讀取 LINE 狀態。'); return; }
  try {
    const res = await postToWebApp({ action: 'getLineStatus' });
    if (res && res.ok) applyLineStatus(res.data);
  } catch (e) { /* 安靜失敗 */ }
}

function applyLineStatus(s) {
  if (!s) return;
  $id('lineEnabled').checked = !!s.enabled;
  if (s.targetId) $id('lineTargetId').value = s.targetId;
  if (s.versions) $id('lineVersions').value = s.versions;
  const parts = [];
  parts.push(s.enabled ? '推播已啟用' : '推播未啟用');
  parts.push(s.hasToken ? `Token：${s.tokenMasked}` : 'Token：未設定');
  parts.push(s.targetId ? `目標：${s.targetId}` : '目標：未設定');
  if (s.adminKeyRequired) parts.push('需管理密碼');
  showLineStatus(s.hasToken && s.targetId && s.enabled ? 'ok' : 'info', parts.join('｜'));
}

function showConn(type, msg) {
  const el = $id('connStatus');
  el.className = 'conn-status ' + type;
  el.textContent = msg;
}

/* ============================================================
   14. API 呼叫
   ============================================================ */

/*
   postToWebApp：以 POST 呼叫 Apps Script Web App。
   使用 text/plain 以避免 CORS preflight（Apps Script 對 simple request 較友善）。
*/
async function postToWebApp(body) {
  const url = getWebAppUrl();
  if (!url) throw new Error('未設定 Web App URL');
  const role = getRole();
  const requestBody = Object.assign({}, body);
  if (role && role.authToken && !requestBody.authToken) requestBody.authToken = role.authToken;
  if (role && !role.authToken && AUTH_CONFIG.legacyLoginEnabled) {
    requestBody.legacyRole = role.role;
    requestBody.legacyName = role.name || '';
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(requestBody)
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { throw new Error('回傳非 JSON：' + text.slice(0, 120)); }
  // 後端回報 session 過期／未授權時，主動提示重新登入，
  // 避免呼叫端（如 fetchAllRecords）靜默落回本機空資料，害教練後台誤顯示「全體未回報」。
  if (parsed && parsed.ok === false && parsed.authRequired) notifySessionExpired();
  return parsed;
}

function dispatchRoleChanged() {
  try {
    window.dispatchEvent(new CustomEvent('teampro:role-changed'));
  } catch (e) {
    try { window.dispatchEvent(new Event('teampro:role-changed')); } catch (err) {}
  }
}

// 全域 session 過期處理（同一波只提示一次，避免多個請求同時洗版）
let _sessionExpiredShown = false;
function notifySessionExpired() {
  if (_sessionExpiredShown) return;
  _sessionExpiredShown = true;
  try { toast('⚠️ 登入已過期，請重新登入後再讀取資料'); } catch (e) {}
  try { clearRole(); } catch (e) {}
  try { if (typeof showLoginOverlay === 'function') showLoginOverlay(); } catch (e) {}
}

/* ============================================================
   15. 分頁切換
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
  if (tabName === 'parent') renderParentDashboard();
  if (tabName === 'lastperf') {
    setTimeout(() => {
      if (typeof refreshTodayReportedList === 'function') refreshTodayReportedList();
    }, 0);
  }
  if (tabName === 'trait' && window.TraitRadar) {
    setTimeout(() => {
      const r = getRole();
      if (r && r.role === 'coach' && typeof window.TraitRadar.refreshCoach === 'function') window.TraitRadar.refreshCoach();
      else if (typeof window.TraitRadar.refresh === 'function') window.TraitRadar.refresh();
    }, 0);
  }
}

/* ============================================================
   15.5 角色登入（選手／家長／教練）
   ------------------------------------------------------------
   純前端「軟性」分流：擋一般使用者亂逛，非真正帳號安全。
   教練密碼用後端 ADMIN_KEY 驗證；選手／家長選身分即可。
   ============================================================ */

const ROLE_KEY = 'yulin_role';
let AUTH_CONFIG = { legacyLoginEnabled: true };
let ACCOUNT_ADMIN_DATA = { students: [], parents: [] };

function getRole() {
  try { return JSON.parse(localStorage.getItem(ROLE_KEY)); } catch (e) { return null; }
}
function setRole(role, name, auth) {
  auth = auth || {};
  localStorage.setItem(ROLE_KEY, JSON.stringify({
    role: role,
    name: name || auth.studentName || '',
    studentId: auth.studentId || '',
    teamId: auth.teamId || '',
    parentId: auth.parentId || '',
    authToken: auth.authToken || auth.token || ''
  }));
}
function clearRole() { localStorage.removeItem(ROLE_KEY); }

// 各角色可看的分頁與預設分頁
const ROLE_TABS = {
  student: { allowed: ['student', 'lastperf', 'profile', 'trait'], default: 'student' },
  parent: { allowed: ['parent'], default: 'parent' },
  coach: { allowed: ['lastperf', 'coach', 'profile', 'trait', 'settings'], default: 'coach' }
};
const ROLE_LABEL = { student: '🥋 選手', parent: '👨‍👩‍👧 家長', coach: '📊 教練' };

// 顯示登入畫面
function showLoginOverlay() {
  const ov = $id('loginOverlay');
  ov.classList.remove('hidden');
  $id('loginStep1').style.display = 'block';
  $id('loginStep2').style.display = 'none';
  $id('loginStep2').innerHTML = '';
}

async function loadAuthConfig() {
  if (!getWebAppUrl()) return AUTH_CONFIG;
  try {
    const res = await postToWebApp({ action: 'getAuthConfig' });
    if (res && res.ok) AUTH_CONFIG = res;
  } catch (e) { /* 沿用過渡預設 */ }
  return AUTH_CONFIG;
}

function loginError(message) {
  const el = $id('loginErr');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = message;
}

function loginField(id, label, type, attrs) {
  return `<label class="field-label" for="${id}">${label}</label><input id="${id}" class="text-input" type="${type || 'text'}" ${attrs || ''} />`;
}

// 進入第二步（新制驗證；過渡模式另以文字入口顯示）
function loginStep2(role) {
  const s1 = $id('loginStep1'), s2 = $id('loginStep2');
  s1.style.display = 'none';
  s2.style.display = 'block';

  if (role === 'coach') {
    s2.innerHTML = `
      <p class="login-hint">請輸入教練密碼</p>
      ${loginField('loginCoachPwd', '教練密碼', 'password', 'placeholder="教練密碼" autocomplete="current-password"')}
      <div class="login-step2-actions">
        <button class="login-back" id="loginBack">返回</button>
        <button class="btn btn-primary" id="loginCoachGo" style="flex:1">進入</button>
      </div>
      <p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none;margin-top:10px"></p>`;
    $id('loginBack').addEventListener('click', showLoginOverlay);
    $id('loginCoachGo').addEventListener('click', () => coachLogin());
    $id('loginCoachPwd').addEventListener('keydown', e => { if (e.key === 'Enter') coachLogin(); });
  } else if (role === 'student') {
    s2.innerHTML = `
      <p class="login-hint">選手登入</p>
      ${loginField('loginStudentName', '姓名', 'text', 'placeholder="輸入姓名" autocomplete="username"')}
      ${loginField('loginStudentPin', '4 位數 PIN', 'password', 'placeholder="4 位數 PIN" inputmode="numeric" maxlength="4" autocomplete="current-password"')}
      <div class="login-step2-actions">
        <button class="login-back" id="loginBack">返回</button>
        <button class="btn btn-primary" id="loginStudentGo" style="flex:1">登入</button>
      </div>
      <button type="button" class="login-alt" id="loginStudentActivate">首次登入／重新設定 PIN</button>
      ${AUTH_CONFIG.legacyLoginEnabled ? '<button type="button" class="login-alt" id="loginStudentLegacy">舊制過渡登入</button>' : ''}
      <p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none;margin-top:10px"></p>`;
    $id('loginBack').addEventListener('click', showLoginOverlay);
    $id('loginStudentGo').addEventListener('click', studentAccountLogin);
    $id('loginStudentActivate').addEventListener('click', showStudentActivation);
    if ($id('loginStudentLegacy')) $id('loginStudentLegacy').addEventListener('click', () => showLegacyLogin('student'));
  } else {
    s2.innerHTML = `
      <p class="login-hint">家長登入</p>
      ${loginField('loginParentStudentName', '孩子姓名', 'text', 'placeholder="輸入孩子姓名" autocomplete="username"')}
      ${loginField('loginParentLast4', '手機後四碼', 'password', 'placeholder="手機後四碼" inputmode="numeric" maxlength="4" autocomplete="current-password"')}
      <div class="login-step2-actions">
        <button class="login-back" id="loginBack">返回</button>
        <button class="btn btn-primary" id="loginParentGo" style="flex:1">登入</button>
      </div>
      <button type="button" class="login-alt" id="loginParentFirst">首次完整手機驗證</button>
      ${AUTH_CONFIG.legacyLoginEnabled ? '<button type="button" class="login-alt" id="loginParentLegacy">舊制過渡登入</button>' : ''}
      <p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none;margin-top:10px"></p>`;
    $id('loginBack').addEventListener('click', showLoginOverlay);
    $id('loginParentGo').addEventListener('click', parentAccountLogin);
    $id('loginParentFirst').addEventListener('click', showParentVerification);
    if ($id('loginParentLegacy')) $id('loginParentLegacy').addEventListener('click', () => showLegacyLogin('parent'));
  }
}

function showStudentActivation() {
  const s2 = $id('loginStep2');
  s2.innerHTML = `<p class="login-hint">首次啟用／重新設定 PIN</p>
    ${loginField('activateStudentName', '姓名', 'text', 'placeholder="輸入姓名"')}
    ${loginField('activateCode', '教練提供的啟用碼', 'text', 'placeholder="6 位數啟用碼" inputmode="numeric" maxlength="6"')}
    ${loginField('activatePin', '設定 4 位數 PIN', 'password', 'inputmode="numeric" maxlength="4"')}
    ${loginField('activatePinConfirm', '再次確認 PIN', 'password', 'inputmode="numeric" maxlength="4"')}
    <div class="login-step2-actions"><button class="login-back" id="loginBack">返回</button><button class="btn btn-primary" id="activateGo" style="flex:1">完成啟用</button></div>
    <p class="login-security-note">不可使用 0000、1111、1234、4321、9999。</p><p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none"></p>`;
  $id('loginBack').addEventListener('click', () => loginStep2('student'));
  $id('activateGo').addEventListener('click', studentActivateAccount);
}

function showParentVerification() {
  const s2 = $id('loginStep2');
  s2.innerHTML = `<p class="login-hint">家長首次驗證</p>
    ${loginField('verifyParentStudentName', '孩子姓名', 'text', 'placeholder="輸入孩子姓名"')}
    ${loginField('verifyParentPhone', '教練預先建立的完整手機', 'tel', 'placeholder="例如 0912345678" inputmode="tel"')}
    <div class="login-step2-actions"><button class="login-back" id="loginBack">返回</button><button class="btn btn-primary" id="verifyParentGo" style="flex:1">驗證</button></div>
    <p class="login-security-note">手機必須先由教練建立或核准，無法自行新增綁定。</p><p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none"></p>`;
  $id('loginBack').addEventListener('click', () => loginStep2('parent'));
  $id('verifyParentGo').addEventListener('click', parentFirstVerify);
}

function showLegacyLogin(role) {
  const s2 = $id('loginStep2');
  s2.innerHTML = `<p class="login-hint">舊制過渡登入</p>
    ${loginField('legacyLoginName', role === 'student' ? '選手姓名' : '孩子姓名', 'text', 'placeholder="輸入完整姓名"')}
    <div class="login-step2-actions"><button class="login-back" id="loginBack">返回</button><button class="btn btn-primary" id="legacyLoginGo" style="flex:1">進入</button></div>
    <p class="login-security-note">此入口僅供帳號轉換期間使用，教練可在後台關閉。</p><p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none"></p>`;
  $id('loginBack').addEventListener('click', () => loginStep2(role));
  $id('legacyLoginGo').addEventListener('click', () => {
    const name = $id('legacyLoginName').value.trim();
    if (!name) return loginError('請輸入姓名。');
    finishLogin(role, name);
  });
}

async function runLogin(buttonId, request, role) {
  const button = $id(buttonId);
  button.disabled = true; const oldText = button.textContent; button.textContent = '驗證中...';
  try {
    const res = await postToWebApp(request);
    if (!res || !res.ok) { loginError((res && res.error) || '登入失敗，請稍後再試。'); return; }
    const user = res.user || {};
    setRole(role, user.studentName || '', Object.assign({}, user, { authToken: res.authToken }));
    if (role === 'parent' && res.consentRequired) {
      showParentConsent();
      return;
    }
    $id('loginOverlay').classList.add('hidden');
    applyRole();
  } catch (e) { loginError('無法連線驗證，請稍後再試。'); }
  finally { button.disabled = false; button.textContent = oldText; }
}

function studentAccountLogin() {
  return runLogin('loginStudentGo', { action: 'studentLogin', studentName: $id('loginStudentName').value.trim(), pin: $id('loginStudentPin').value }, 'student');
}
function studentActivateAccount() {
  return runLogin('activateGo', { action: 'studentActivate', studentName: $id('activateStudentName').value.trim(), activationCode: $id('activateCode').value.trim(), pin: $id('activatePin').value, pinConfirm: $id('activatePinConfirm').value }, 'student');
}
function parentAccountLogin() {
  return runLogin('loginParentGo', { action: 'parentLogin', studentName: $id('loginParentStudentName').value.trim(), parentPhoneLast4: $id('loginParentLast4').value }, 'parent');
}
function parentFirstVerify() {
  return runLogin('verifyParentGo', { action: 'parentVerify', studentName: $id('verifyParentStudentName').value.trim(), parentPhone: $id('verifyParentPhone').value }, 'parent');
}

function showParentConsent() {
  const s2 = $id('loginStep2');
  $id('loginStep1').style.display = 'none';
  s2.style.display = 'block';
  s2.innerHTML = `<p class="login-hint">家長同意與個資告知</p>
    <div class="consent-notice">本系統用於訓練管理、運動傷害風險追蹤、家長溝通與匿名研究分析，不作為公開排名、懲罰或醫療診斷使用。家長端僅能查看自己孩子的訓練摘要與教練公開提醒，不會顯示其他學生資料。</div>
    <label class="consent-row"><input type="checkbox" id="consentTrainingData"> 同意訓練資料使用</label>
    <label class="consent-row"><input type="checkbox" id="consentHealthData"> 同意健康資料使用</label>
    <label class="consent-row"><input type="checkbox" id="consentLineNotice"> 同意 LINE 通知</label>
    <label class="consent-row"><input type="checkbox" id="consentAnonymousResearch"> 同意匿名研究分析</label>
    <label class="consent-row"><input type="checkbox" id="consentReport"> 同意報告產生</label>
    <div class="login-step2-actions"><button class="login-back" id="consentCancel">取消</button><button class="btn btn-primary" id="consentGo" style="flex:1">同意並繼續</button></div>
    <p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none"></p>`;
  $id('consentCancel').addEventListener('click', () => { clearRole(); showLoginOverlay(); });
  $id('consentGo').addEventListener('click', submitParentConsent);
}

async function submitParentConsent() {
  const button = $id('consentGo');
  button.disabled = true; button.textContent = '儲存中...';
  try {
    const res = await postToWebApp({
      action: 'parentConsent',
      consentTrainingData: $id('consentTrainingData').checked,
      consentHealthData: $id('consentHealthData').checked,
      consentParentNotice: true,
      consentReport: $id('consentReport').checked,
      consentLineNotice: $id('consentLineNotice').checked,
      consentAnonymousResearch: $id('consentAnonymousResearch').checked
    });
    if (!res || !res.ok) { loginError((res && res.error) || '同意資料儲存失敗。'); return; }
    const user = res.user || {};
    setRole('parent', user.studentName || '', Object.assign({}, user, { authToken: res.authToken }));
    $id('loginOverlay').classList.add('hidden');
    applyRole();
  } catch (e) { loginError('無法連線，請稍後再試。'); }
  finally { button.disabled = false; button.textContent = '同意並繼續'; }
}

/*
   登入姓名搜尋選擇器：上方輸入框即時過濾，下方名單點選即選定。
   選定值寫入隱藏的 #loginName（沿用既有 finishLogin 流程）。
*/
function setupLoginNamePicker(players, role) {
  const search = $id('loginNameSearch');
  const list = $id('loginNameList');
  const hidden = $id('loginName');
  if (!search || !list || !hidden) return;

  function renderList(keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    const matched = players.filter(p => !kw || String(p).toLowerCase().indexOf(kw) !== -1);
    if (!matched.length) {
      list.innerHTML = `<div class="login-name-empty">找不到「${escapeHtml(keyword)}」，請確認輸入或換個關鍵字</div>`;
      return;
    }
    list.innerHTML = matched.map(p =>
      `<button type="button" class="login-name-item${hidden.value === p ? ' sel' : ''}" data-name="${escapeHtml(p)}">${escapeHtml(p)}</button>`
    ).join('');
  }

  function selectName(name) {
    hidden.value = name;
    search.value = name;
    list.querySelectorAll('.login-name-item').forEach(b => b.classList.toggle('sel', b.dataset.name === name));
  }

  list.addEventListener('click', e => {
    const btn = e.target.closest('.login-name-item');
    if (!btn) return;
    selectName(btn.dataset.name);
  });

  search.addEventListener('input', () => {
    // 打字時清掉先前選定（避免顯示與實際不符）；完全相符才視為選定
    const exact = players.find(p => p === search.value.trim());
    hidden.value = exact || '';
    renderList(search.value);
  });

  // Enter：若只剩一個候選或完全相符就直接選定並進入
  search.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = resolveLoginName(players);
    if (name) { selectName(name); finishLogin(role, name); }
  });

  renderList('');
}

// 解析目前登入要用的姓名：優先隱藏選定值，其次輸入框完全相符，再其次唯一候選
function resolveLoginName(players) {
  const hidden = $id('loginName');
  const search = $id('loginNameSearch');
  if (hidden && hidden.value) return hidden.value;
  const kw = search ? search.value.trim() : '';
  if (!kw) return '';
  const exact = players.find(p => p === kw);
  if (exact) return exact;
  const matched = players.filter(p => String(p).toLowerCase().indexOf(kw.toLowerCase()) !== -1);
  return matched.length === 1 ? matched[0] : '';
}

// 教練登入：密碼只送後端驗證，前端不保存明碼
async function coachLogin() {
  const pwd = $id('loginCoachPwd').value;
  const errEl = $id('loginErr');
  const go = $id('loginCoachGo');

  // 一律擋空白密碼，避免「直接按進入」就闖進教練後台
  if (!pwd || !pwd.trim()) {
    errEl.style.display = 'block';
    errEl.textContent = '請輸入教練密碼。';
    return;
  }

  go.disabled = true; go.textContent = '驗證中...';
  let result = { ok: false };
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'coachLogin', coachPassword: pwd });
      if (res && res.ok !== undefined) result = res;
    } catch (e) { /* 連線失敗，往下判斷 */ }
  }
  go.disabled = false; go.textContent = '進入';

  if (result.ok) {
    const user = result.user || {};
    setRole('coach', '', Object.assign({}, user, { authToken: result.authToken }));
    _sessionExpiredShown = false; // 重新登入成功，解除過期提示鎖
    $id('loginOverlay').classList.add('hidden');
    applyRole();
  } else {
    loginError(result.error || '登入資訊不正確。');
  }
}

// 完成登入
function finishLogin(role, name) {
  setRole(role, name);
  _sessionExpiredShown = false; // 重新登入成功，解除過期提示鎖
  $id('loginOverlay').classList.add('hidden');
  applyRole();
}

// 套用角色權限
function applyRole() {
  const r = getRole();
  if (!r) { showLoginOverlay(); return; }
  const conf = ROLE_TABS[r.role] || ROLE_TABS.student;
  if (r.role !== 'coach') setDailyKpiAvailability(false, null);

  // 新制選手／家長的姓名欄只保留自己的身分，不把全隊選項留在 DOM。
  if ((r.role === 'student' || r.role === 'parent') && r.name) {
    ['name', 'lastPerfName', 'profileName'].forEach(id => setSelectOnlyName(id, r.name));
  } else if (r.role === 'coach') {
    refreshNameSelects();
  }

  // 分頁顯示控制
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.style.display = conf.allowed.indexOf(b.dataset.tab) !== -1 ? '' : 'none';
  });
  const studentTab = document.querySelector('.tab-btn[data-tab="student"]');
  const profileTab = document.querySelector('.tab-btn[data-tab="profile"]');
  const traitTab = document.querySelector('.tab-btn[data-tab="trait"]');
  if (studentTab) studentTab.textContent = '📝 今日回報';
  if (profileTab) profileTab.textContent = r.role === 'coach' ? '👤 個人檔案' : '👤 我的檔案';
  if (traitTab) traitTab.textContent = r.role === 'coach' ? '🎭 學生特質雷達' : '🎭 成長風格';
  // 通用設定：家長後台模組關閉時，隱藏家長分頁
  if (!getBrand().modParent) {
    const pb = document.querySelector('.tab-btn[data-tab="parent"]');
    if (pb) pb.style.display = 'none';
  }
  switchTab(conf.default);

  // 身分標籤與切換鈕
  const badge = $id('roleBadge');
  badge.style.display = 'inline-block';
  badge.textContent = ROLE_LABEL[r.role] + (r.name ? '：' + r.name : '');
  $id('btnSwitchRole').style.display = 'block';

  // 「💾 本機測試送出」只給教練看；學生/家長誤按會以為填完，其實沒進後台
  const localBtn = $id('btnLocalSubmit');
  if (localBtn) localBtn.style.display = (r.role === 'coach') ? '' : 'none';

  // 解憂信箱：只給選手看（家長/教練端不顯示這個情感入口）
  const tabSolace = $id('tabSolace');
  if (tabSolace) tabSolace.style.display = (r.role === 'student') ? '' : 'none';
  // 心理卡夾是選手的個人成長收藏，家長與教練端不顯示導覽入口。
  const tabPsychPack = $id('tabPsychPack');
  if (tabPsychPack) tabPsychPack.style.display = (r.role === 'student') ? '' : 'none';

  // 選手：鎖定姓名為自己
  if (r.role === 'student' && r.name) {
    const nameSel = $id('name');
    if (nameSel) { nameSel.value = r.name; nameSel.disabled = true; nameSel.dispatchEvent(new Event('change')); }
    const lp = $id('lastPerfName'); if (lp) lp.value = r.name;
  } else {
    const nameSel = $id('name'); if (nameSel) nameSel.disabled = false;
  }

  // 家長：鎖定孩子、隱藏查詢列、自動載入
  const queryCard = $id('lastPerfQueryCard');
  if (r.role === 'parent' && r.name) {
    const lp = $id('lastPerfName'); if (lp) lp.value = r.name;
    if (queryCard) queryCard.style.display = 'none';
    loadLastPerfPage();
    renderParentDashboard();
  } else if (queryCard) {
    queryCard.style.display = '';
  }

  // 個人檔案：選手/家長鎖定自己、隱藏選擇列、自動載入；教練可自由查
  const profileQuery = $id('profileQueryCard');
  const pn = $id('profileName');
  if ((r.role === 'student' || r.role === 'parent') && r.name) {
    if (pn) pn.value = r.name;
    if (profileQuery) profileQuery.style.display = 'none';
    loadProfile();
  } else if (profileQuery) {
    profileQuery.style.display = '';
  }

  if (r.role === 'coach') {
    loadRosterFromServer().then(() => refreshAccountAdmin());
    refreshCoach();
    loadAiConfig();
    if (typeof refreshTodayReportedList === 'function') refreshTodayReportedList();
  }
  if (window.TraitRadar && typeof window.TraitRadar.onRoleApplied === 'function') {
    Promise.resolve(window.TraitRadar.onRoleApplied(r)).catch(() => {});
  } else if (r.role === 'student' && traitTab) {
    switchTab('trait');
  }
  dispatchRoleChanged();

  // 今日我該做什麼（選手／家長導引卡）
  renderTodayGuide();
}

function setSelectOnlyName(id, name) {
  const el = $id(id);
  if (!el) return;
  if (el.tagName === 'INPUT') {
    el.value = name;
    const listId = el.getAttribute('list');
    const dl = listId ? $id(listId) : null;
    if (dl) {
      dl.innerHTML = '';
      const option = document.createElement('option');
      option.value = name;
      dl.appendChild(option);
    }
    return;
  }
  if (el.tagName !== 'SELECT') return;
  el.innerHTML = '';
  const option = document.createElement('option');
  option.value = name; option.textContent = name;
  el.appendChild(option);
  el.value = name;
}

function setupRoleHandlers() {
  document.querySelectorAll('.login-role-btn').forEach(btn => {
    btn.addEventListener('click', () => loginStep2(btn.dataset.role));
  });
  $id('btnSwitchRole').addEventListener('click', () => {
    const current = getRole();
    if (current && current.authToken && getWebAppUrl()) postToWebApp({ action: 'logout' }).catch(() => {});
    clearRole();
    // 解除選手姓名鎖定
    const nameSel = $id('name'); if (nameSel) nameSel.disabled = false;
    const queryCard = $id('lastPerfQueryCard'); if (queryCard) queryCard.style.display = '';
    const profileQuery = $id('profileQueryCard'); if (profileQuery) profileQuery.style.display = '';
    $id('roleBadge').style.display = 'none';
    $id('btnSwitchRole').style.display = 'none';
    showLoginOverlay();
    dispatchRoleChanged();
  });
}

/* ============================================================
   15.6 教練帳號與家長管理
   ============================================================ */

function accountDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? escapeHtml(value) : d.toLocaleString('zh-TW', { hour12: false });
}

async function refreshAccountAdmin() {
  const studentBox = $id('studentAccountAdmin');
  const parentBox = $id('parentAccountAdmin');
  if (!studentBox || !parentBox || !isCoachView()) return;
  try {
    if (window.TraitRadar && typeof window.TraitRadar.loadCache === 'function') await window.TraitRadar.loadCache();
    const res = await postToWebApp({ action: 'getAccountAdminData' });
    if (!res || !res.ok) throw new Error((res && res.error) || '讀取失敗');
    const data = res.data || { students: [], parents: [] };
    ACCOUNT_ADMIN_DATA = data;
    $id('legacyLoginEnabled').checked = !!data.legacyLoginEnabled;

    studentBox.innerHTML = `<table><thead><tr><th>選手</th><th>狀態</th><th>最近登入</th><th>PIN</th><th>操作</th></tr></thead><tbody>${
      data.students.map(s => `<tr><td>${(window.TraitRadar && window.TraitRadar.nameHtml) ? window.TraitRadar.nameHtml(s.studentName) : escapeHtml(s.studentName)}</td><td>${escapeHtml(s.accountStatus || 'pending')}${s.lockedUntil ? '<br><span class="tag tag-red">鎖定</span>' : ''}</td><td>${accountDate(s.lastLoginAt)}</td><td>${s.pinSet ? '已設定' : '待啟用'}</td><td class="account-actions">
        <button type="button" data-student-action="generateActivation" data-student-id="${escapeHtml(s.studentId)}">產生啟用碼</button>
        <button type="button" data-student-action="resetPin" data-student-id="${escapeHtml(s.studentId)}">重設 PIN</button>
        <button type="button" data-student-action="unlock" data-student-id="${escapeHtml(s.studentId)}">解除鎖定</button>
        <button type="button" data-student-action="${s.accountStatus === 'disabled' ? 'enable' : 'disable'}" data-student-id="${escapeHtml(s.studentId)}">${s.accountStatus === 'disabled' ? '啟用' : '停用'}</button>
      </td></tr>`).join('') || '<tr><td colspan="5">尚無選手帳號，請先同步名單並執行 setupSheet。</td></tr>'
    }</tbody></table>`;

    const studentSelect = $id('accountParentStudent');
    studentSelect.innerHTML = '<option value="">選擇孩子</option>' + data.students.map(s => `<option value="${escapeHtml(s.studentId)}">${escapeHtml(s.studentName)}</option>`).join('');

    parentBox.innerHTML = `<table><thead><tr><th>孩子</th><th>家長</th><th>手機</th><th>綁定／同意</th><th>最近登入</th><th>操作</th></tr></thead><tbody>${
      data.parents.map(p => `<tr><td>${(window.TraitRadar && window.TraitRadar.nameHtml) ? window.TraitRadar.nameHtml(p.studentName) : escapeHtml(p.studentName)}</td><td>${escapeHtml(p.parentName || '-')}</td><td>${escapeHtml(p.parentPhone || '-')}</td><td>${escapeHtml(p.bindStatus || 'pending')} / ${escapeHtml(p.consentStatus || 'pending')}</td><td>${accountDate(p.lastLoginAt)}</td><td class="account-actions">
        <button type="button" data-parent-action="edit" data-parent-id="${escapeHtml(p.parentId)}" data-student-id="${escapeHtml(p.studentId)}" data-parent-name="${escapeHtml(p.parentName || '')}" data-parent-phone="${escapeHtml(p.parentPhone || '')}">更新手機</button>
        <button type="button" data-parent-action="unlock" data-parent-id="${escapeHtml(p.parentId)}">解除鎖定</button>
        <button type="button" data-parent-action="unbind" data-parent-id="${escapeHtml(p.parentId)}">解除綁定</button>
        <button type="button" data-parent-action="${p.bindStatus === 'disabled' ? 'enable' : 'disable'}" data-parent-id="${escapeHtml(p.parentId)}">${p.bindStatus === 'disabled' ? '啟用' : '停用查看'}</button>
      </td></tr>`).join('') || '<tr><td colspan="6">尚未建立家長資料。</td></tr>'
    }</tbody></table>`;
  } catch (e) {
    studentBox.innerHTML = `<div class="hint-box warn">帳號資料讀取失敗：${escapeHtml(e.message)}</div>`;
  }
}

async function runStudentAccountAction(studentId, accountAction) {
  const res = await postToWebApp({ action: 'studentAccountAction', studentId, accountAction });
  if (!res || !res.ok) { toast((res && res.error) || '操作失敗'); return; }
  if (res.activationCode) alert(`啟用碼：${res.activationCode}\n有效期限：${accountDate(res.expiresAt)}\n請以安全方式提供給該選手。`);
  else toast('帳號狀態已更新');
  refreshAccountAdmin();
}

function setupAccountAdminHandlers() {
  const card = $id('accountAdminCard');
  if (!card) return;
  $id('btnRefreshAccounts').addEventListener('click', refreshAccountAdmin);
  $id('btnGeneratePendingCodes').addEventListener('click', generatePendingActivationCodes);
  $id('btnCopyActivationCodes').addEventListener('click', () => copyText($id('activationBatchText').value));
  $id('legacyLoginEnabled').addEventListener('change', async e => {
    const res = await postToWebApp({ action: 'setLegacyLoginEnabled', enabled: e.target.checked });
    if (!res || !res.ok) { e.target.checked = !e.target.checked; toast((res && res.error) || '設定失敗'); return; }
    AUTH_CONFIG.legacyLoginEnabled = !!res.legacyLoginEnabled;
    toast(e.target.checked ? '舊制過渡登入已開啟' : '舊制過渡登入已關閉');
  });
  $id('studentAccountAdmin').addEventListener('click', e => {
    const btn = e.target.closest('[data-student-action]');
    if (btn) runStudentAccountAction(btn.dataset.studentId, btn.dataset.studentAction).catch(() => toast('操作失敗'));
  });
  $id('parentAccountAdmin').addEventListener('click', async e => {
    const btn = e.target.closest('[data-parent-action]');
    if (!btn) return;
    if (btn.dataset.parentAction === 'edit') {
      $id('accountParentStudent').value = btn.dataset.studentId;
      $id('accountParentName').value = btn.dataset.parentName;
      $id('accountParentPhone').value = btn.dataset.parentPhone;
      $id('btnSaveParentAccount').dataset.parentId = btn.dataset.parentId;
      $id('accountParentPhone').focus();
      return;
    }
    const res = await postToWebApp({ action: 'parentAccountAction', parentId: btn.dataset.parentId, accountAction: btn.dataset.parentAction });
    toast(res && res.ok ? '家長帳號已更新' : ((res && res.error) || '操作失敗'));
    if (res && res.ok) refreshAccountAdmin();
  });
  $id('btnSaveParentAccount').addEventListener('click', async e => {
    const body = {
      action: 'upsertParentAccount', parentId: e.currentTarget.dataset.parentId || '',
      studentId: $id('accountParentStudent').value,
      parentName: $id('accountParentName').value.trim(), parentPhone: $id('accountParentPhone').value.trim()
    };
    const res = await postToWebApp(body);
    toast(res && res.ok ? '家長資料已儲存，首次登入前需用完整手機驗證' : ((res && res.error) || '儲存失敗'));
    if (res && res.ok) {
      e.currentTarget.dataset.parentId = '';
      $id('accountParentName').value = ''; $id('accountParentPhone').value = '';
      refreshAccountAdmin();
    }
  });
}

async function generatePendingActivationCodes() {
  const pending = (ACCOUNT_ADMIN_DATA.students || []).filter(s => s.accountStatus !== 'disabled' && (!s.pinSet || s.pinResetRequired));
  if (!pending.length) { toast('目前沒有待啟用的選手'); return; }
  const button = $id('btnGeneratePendingCodes');
  const lines = [];
  button.disabled = true;
  try {
    for (let i = 0; i < pending.length; i++) {
      button.textContent = `產生中 ${i + 1}/${pending.length}`;
      const student = pending[i];
      const res = await postToWebApp({ action: 'studentAccountAction', studentId: student.studentId, accountAction: 'generateActivation' });
      if (res && res.ok && res.activationCode) lines.push(`${student.studentName}：${res.activationCode}（72 小時內有效）`);
      else lines.push(`${student.studentName}：產生失敗`);
    }
    $id('activationBatchText').value = lines.join('\n');
    $id('activationBatchResult').style.display = 'block';
    toast(`已產生 ${lines.filter(line => line.indexOf('產生失敗') === -1).length} 組啟用碼`);
    refreshAccountAdmin();
  } finally {
    button.disabled = false;
    button.textContent = '批次產生待啟用碼';
  }
}

/* ============================================================
   15.9 今日我該做什麼（依角色導引）
   ============================================================ */
function guideItem(icon, text, targetId) {
  return `<li class="tg-item"${targetId ? ` data-goto="${targetId}"` : ''}>` +
    `<span class="tg-ic">${icon}</span><span class="tg-txt">${text}</span>` +
    `${targetId ? '<span class="tg-arrow">›</span>' : ''}</li>`;
}
function renderTodayGuide() {
  const r = getRole();
  if (!r) return;
  if (r.role === 'student') {
    const card = $id('studentTodayGuide'), list = $id('studentTodayGuideList');
    if (!card || !list) return;
    const kpiOpen =
      (window.KpiSession && typeof window.KpiSession.isStudentOpen === 'function' && window.KpiSession.isStudentOpen()) ||
      ((typeof isDailyKpiAvailable === 'function') && isDailyKpiAvailable());
    list.innerHTML = [
      guideItem('📝', '<b>今天有訓練</b>：填下方「每日基本回報」', 'studentForm'),
      guideItem('🤔', '<b>今天沒出席</b>：把「組別」選未出席，誠實填未出席反思', 'studentForm'),
      kpiOpen
        ? guideItem('📈', '<b>教練已開啟本週 KPI</b>：記得完成 30 項 KPI 回報', 'studentKpiCard')
        : guideItem('📈', '本週 KPI 尚未開啟，先把每日回報填好就好', ''),
      guideItem('🧑‍🏫', '送出後往下看「AI 教練回饋卡」的鼓勵與明日任務', 'coachFeedbackCard')
    ].join('');
    card.style.display = '';
  } else if (r.role === 'parent') {
    const card = $id('parentTodayGuide'), list = $id('parentTodayGuideList');
    if (!card || !list) return;
    list.innerHTML = [
      guideItem('🗓️', '看看孩子最近 7 天的訓練狀態', 'parentSevenDays'),
      guideItem('📊', '確認孩子本週出席情況', 'parentWeekStats'),
      guideItem('🔁', '是否有需要在家協助的補訓任務', 'parentMakeupTasks'),
      guideItem('📣', '閱讀教練今天給家長的提醒', 'parentCoachNotes')
    ].join('');
    card.style.display = '';
  }
}
window.renderTodayGuide = renderTodayGuide;
function setupTodayGuideNav() {
  document.addEventListener('click', e => {
    const it = e.target.closest('.tg-item[data-goto]');
    if (!it) return;
    const t = $id(it.dataset.goto);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ============================================================
   15.91 今日戰情室（教練後台頂部：可點擊展開名單）
   ============================================================ */
/* 身體狀態燈號（依需求規格的明確判斷邏輯：疼痛 / RPE / 睡眠 / 尿液 / 心情）
   與 KPI 表現燈號（judgeStatus）不同，這裡看的是「今天身體適不適合練」。
   history：同一人新→舊排序的紀錄，用來判斷「連續兩次」紅燈條件。 */
function specBodyLight(rec, history) {
  if (!rec) return { key: 'green', label: '🟢 綠燈' };
  const body = String(rec.bodyStatus || '');
  const sleep = String(rec.sleepQuality || '');
  const rpe = nval(rec.rpe);
  const pain = nval(rec.painScore);
  const urine = String(rec.urineStatus || '');
  const mood = nval(rec.moodIndex);
  // 連續兩次（含今天）：取最近兩筆判斷
  const recent2 = dedupeLatestByDate(history || []).slice(0, 2);
  const streak2 = matcher => recent2.length >= 2 && recent2.every(matcher);

  // 紅燈
  if ((pain !== null && pain >= 7) ||
      (rpe !== null && rpe >= 9) ||
      urine === '琥珀色' ||
      streak2(r => String(r.sleepQuality || '') === '差') ||
      streak2(r => { const m = nval(r.moodIndex); return m !== null && m <= 2; }) ||
      streak2(r => { const x = nval(r.rpe); return x !== null && x >= 8; }) ||
      streak2(r => { const p = nval(r.painScore); return p !== null && p >= 4; })) {
    return { key: 'red', label: '🔴 紅燈' };
  }
  // 黃燈
  if (body === '疲勞' || body === '不舒服' || body === '受傷中' ||
      sleep === '差' ||
      (rpe !== null && rpe >= 7) ||
      (pain !== null && pain >= 4) ||
      urine === '深黃' ||
      (mood !== null && mood <= 2)) {
    return { key: 'yellow', label: '🟡 黃燈' };
  }
  return { key: 'green', label: '🟢 綠燈' };
}

let _warRoomLists = {};
function renderCoachWarRoom(todays, all) {
  const grid = $id('coachWarRoomGrid');
  if (!grid) return;
  const roster = getPlayers();
  const nameOf = r => String(r.name || '').trim();
  const reportedNames = Array.from(new Set((todays || []).map(nameOf).filter(Boolean)));
  const missingNames = roster.filter(n => reportedNames.indexOf(n) === -1);
  const rate = roster.length ? Math.round(reportedNames.length / roster.length * 100) : 0;
  // 身體狀態燈號：依規格規則計算（連續兩次需要個人歷史）
  const histOf = name => (all || []).filter(x => String(x.name || '').trim() === name);
  (todays || []).forEach(r => { r._bodyLight = specBodyLight(r, histOf(nameOf(r))).key; });
  const byLight = key => (todays || []).filter(r => r._bodyLight === key);
  const painList = (todays || []).filter(r => (nval(r.painScore) || 0) >= 4);
  const rpeList = (todays || []).filter(r => (nval(r.rpe) || 0) >= 8);
  const sleepList = (todays || []).filter(r => r.sleepQuality === '差');
  const moodList = (todays || []).filter(r => { const m = nval(r.moodIndex); return m !== null && m <= 2; });
  const notifyList = (todays || []).filter(r =>
    r._bodyLight === 'red' ||
    (nval(r.painScore) || 0) >= 7 ||
    /受傷風險|需要關心|脫水風險/.test(String(r.aiTags || '')));

  const cards = [
    { key: 'rate', label: '今日填寫率', num: rate + '%', tone: rate >= 80 ? 'good' : 'warn', names: reportedNames, sub: `${reportedNames.length}/${roster.length} 人` },
    { key: 'missing', label: '未回報', num: missingNames.length, tone: missingNames.length ? 'warn' : 'good', names: missingNames },
    { key: 'green', label: '🟢 綠燈', num: byLight('green').length, tone: 'good', names: byLight('green').map(nameOf) },
    { key: 'yellow', label: '🟡 黃燈', num: byLight('yellow').length, tone: 'warn', names: byLight('yellow').map(nameOf) },
    { key: 'red', label: '🔴 紅燈', num: byLight('red').length, tone: byLight('red').length ? 'danger' : 'good', names: byLight('red').map(nameOf) },
    { key: 'pain', label: '疼痛 4 分以上', num: painList.length, tone: painList.length ? 'danger' : 'good', names: painList.map(r => painAlertText(r)), html: painList.map(r => painAlertItemHtml(r)).join('') },
    { key: 'rpe', label: 'RPE 8 以上', num: rpeList.length, tone: rpeList.length ? 'warn' : 'good', names: rpeList.map(r => `${nameOf(r)}（RPE ${nval(r.rpe)}）`) },
    { key: 'sleep', label: '睡眠差', num: sleepList.length, tone: sleepList.length ? 'warn' : 'good', names: sleepList.map(nameOf) },
    { key: 'mood', label: '心情低落', num: moodList.length, tone: moodList.length ? 'warn' : 'good', names: moodList.map(nameOf) },
    { key: 'notify', label: '需家長通知', num: notifyList.length, tone: notifyList.length ? 'danger' : 'good', names: notifyList.map(r => painScoreValue(r) >= 7 ? `${painAlertText(r)}｜建議通知家長` : nameOf(r)) }
  ];
  _warRoomLists = {};
  cards.forEach(c => { _warRoomLists[c.key] = { label: c.label, names: c.names, html: c.html || '' }; });

  grid.innerHTML = cards.map(c =>
    `<button type="button" class="warroom-cell ${c.tone}" data-wr="${c.key}">` +
    `<span class="wr-num">${c.num}</span>` +
    `<span class="wr-label">${c.label}</span>` +
    `${c.sub ? `<span class="wr-sub">${c.sub}</span>` : ''}</button>`
  ).join('');

  const listBox = $id('coachWarRoomList');
  if (listBox) { listBox.style.display = 'none'; listBox.innerHTML = ''; }

  if (!grid.dataset.bound) {
    grid.dataset.bound = '1';
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.warroom-cell');
      if (!btn) return;
      const data = _warRoomLists[btn.dataset.wr];
      if (!data) return;
      grid.querySelectorAll('.warroom-cell').forEach(b => b.classList.toggle('active', b === btn));
      const lb = $id('coachWarRoomList');
      if (!lb) return;
      lb.style.display = '';
      lb.innerHTML = `<h4 class="wr-list-title">${data.label}（${data.names.length}）</h4>` +
        (data.html
          ? data.html
          : data.names.length
          ? `<div class="wr-names">${data.names.map(n => `<span class="wr-name">${escapeHtml(n)}</span>`).join('')}</div>`
          : '<p class="review-label">目前沒有名單 ✅</p>');
    });
  }
}

/* ============================================================
   15.92 隊伍 / 運動項目通用設定（商業化：一校一套可改品牌與模組）
   ============================================================ */
const BRAND_KEY = 'yulin_brand';
const BRAND_DEFAULT = {
  teamName: '育林國中技擊隊',
  orgName: '育林國中',
  sports: '跆拳道・武術',
  groups: '',
  kpiDomains: '',
  modFreestyle: true, modNutrition: true, modPrecomp: true, modParent: true
};
function getBrand() {
  try { return Object.assign({}, BRAND_DEFAULT, JSON.parse(localStorage.getItem(BRAND_KEY)) || {}); }
  catch (e) { return Object.assign({}, BRAND_DEFAULT); }
}
function saveBrand(b) { localStorage.setItem(BRAND_KEY, JSON.stringify(b)); }
function brandModHidden(id, on) {
  const el = $id(id);
  if (el) el.classList.toggle('brand-hidden', !on);
}
function applyBrand() {
  const b = getBrand();
  const subtitle = `${b.sports} ｜ TeamPro AI 訓練準備度系統`;
  document.querySelectorAll('.app-title').forEach(el => { el.textContent = b.teamName; });
  document.querySelectorAll('.app-subtitle').forEach(el => { el.textContent = subtitle; });
  const lt = document.querySelector('.login-title'); if (lt) lt.textContent = b.teamName;
  const ls = document.querySelector('.login-sub'); if (ls) ls.textContent = subtitle;
  try { document.title = b.teamName + '｜TeamPro AI 訓練準備度系統'; } catch (e) { /* */ }
  // 模組開關（關閉時隱藏對應區塊；不動到必填欄位邏輯）
  brandModHidden('freestyleSection', b.modFreestyle);
  brandModHidden('nutritionCard', b.modNutrition);
  brandModHidden('coachNutritionCard', b.modNutrition);
  brandModHidden('preCompCard', b.modPrecomp);
}
function renderBrandSettings() {
  const b = getBrand();
  const set = (id, v) => { const el = $id(id); if (el) el.value = v; };
  const chk = (id, v) => { const el = $id(id); if (el) el.checked = !!v; };
  set('brandTeamName', b.teamName);
  set('brandOrgName', b.orgName);
  set('brandSports', b.sports);
  set('brandGroups', b.groups);
  set('brandKpiDomains', b.kpiDomains);
  chk('brandModFreestyle', b.modFreestyle);
  chk('brandModNutrition', b.modNutrition);
  chk('brandModPrecomp', b.modPrecomp);
  chk('brandModParent', b.modParent);
}
function setupBrandHandlers() {
  const saveBtn = $id('btnSaveBrand');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    const val = id => { const el = $id(id); return el ? String(el.value || '').trim() : ''; };
    const on = id => { const el = $id(id); return el ? el.checked : true; };
    const b = {
      teamName: val('brandTeamName') || BRAND_DEFAULT.teamName,
      orgName: val('brandOrgName'),
      sports: val('brandSports') || BRAND_DEFAULT.sports,
      groups: val('brandGroups'),
      kpiDomains: val('brandKpiDomains'),
      modFreestyle: on('brandModFreestyle'),
      modNutrition: on('brandModNutrition'),
      modPrecomp: on('brandModPrecomp'),
      modParent: on('brandModParent')
    };
    saveBrand(b);
    applyBrand();
    const st = $id('brandStatus');
    if (st) { st.textContent = '✅ 已儲存並套用通用設定'; st.className = 'conn-status ok'; }
    toast('✅ 通用設定已儲存');
    const r = getRole(); if (r) applyRole();
  });
  const resetBtn = $id('btnResetBrand');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    localStorage.removeItem(BRAND_KEY);
    renderBrandSettings();
    applyBrand();
    const st = $id('brandStatus');
    if (st) { st.textContent = '↩️ 已還原為預設值'; st.className = 'conn-status info'; }
    toast('已還原預設');
    const r = getRole(); if (r) applyRole();
  });
}

