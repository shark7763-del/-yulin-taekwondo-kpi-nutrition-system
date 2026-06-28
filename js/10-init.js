/* ============================================================
   16. 初始化
   ============================================================ */
function init() {
  // 分頁
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === 'lastperf' && typeof refreshTodayReportedList === 'function') refreshTodayReportedList();
    });
  });

  // 解憂信箱分頁鈕：開新分頁到外站，不切換內部分頁
  const tabSolace = $id('tabSolace');
  if (tabSolace) tabSolace.addEventListener('click', () => {
    window.open(SOLACE_URL, '_blank', 'noopener');
    toast('💌 已開啟解憂信箱');
  });
  const tabPsychPack = $id('tabPsychPack');
  if (tabPsychPack) tabPsychPack.addEventListener('click', () => {
    if (typeof openPsychCardPack === 'function') openPsychCardPack();
    else toast('我的卡夾尚未載入，請稍後再試');
  });

  // 日期預設今天
  $id('date').value = todayStr();
  $id('coachDate').value = todayStr();

  // 每日教練語錄
  const quoteEl = $id('dailyQuoteText');
  if (quoteEl) quoteEl.textContent = dailyPick(COACH_QUOTES);

  // 下拉選單
  fillSelect($id('group'), GROUP_OPTIONS, '請選擇組別');
  buildAbsenceChips();   // 未出席訓練反思快捷選項
  buildMealTagChips();   // 飲食快速勾選標籤
  fillSelect($id('waterIntake'), WATER_OPTIONS, '請選擇水量');
  fillSelect($id('lateNightSnack'), LATE_NIGHT_OPTIONS);
  fillSelect($id('trainingIntensity'), INTENSITY_OPTIONS, '請選擇強度');
  refreshNameSelects();
  renderEncourageChips();
  renderGratitudeChips();   // 感謝今天的人事物
  renderMoodPicker();   // 今日心情指數

  // KPI 拉桿（預設對練）
  renderKpiSliders('跆拳道對練');

  // 組別改變 -> 重建 KPI（自由品勢 / 品勢 / 對練分流）
  $id('group').addEventListener('change', e => {
    const g = e.target.value;
    renderKpiSliders(g);
    if (isAbsenceGroup(g)) toast('已切換為未出席訓練報告');
    else if (isFreestyle(g)) toast('已切換為自由品勢評分細項');
    else if (g === '跆拳道品勢') toast('已切換為品勢評分細項');
    else toast('已套用對練評分細項');
  });

  // 選姓名 -> 抓上一筆 + 自動帶入不太會變的欄位
  $id('name').addEventListener('change', async e => {
    const name = e.target.value;
    if (!name) return;
    toast('讀取上次表現中...');
    loadStudentTask(name);   // 今日任務
    renderPlayerCard(name);  // 選手成長卡
    const rec = await fetchLastRecord(name);
    renderLastReview(rec, 'lastReviewContent', 'lastReviewCard');
    autofillFromLast(rec);
    if (isAbsenceGroup($id('group').value)) renderAbsenceImpact();
    saveDraft();
  });

  // BMI 即時計算
  ['heightCm', 'weightKg', 'targetWeightKg'].forEach(id => {
    $id(id).addEventListener('input', updateBmiDisplay);
  });

  // 睡眠（就寢/起床時間）→ 即時算時長 + AI 判讀
  ['bedTime', 'wakeTime'].forEach(id => { const el = $id(id); if (el) el.addEventListener('input', updateSleepCalc); });
  // 受傷疼痛指數 0–10
  { const p = $id('painScore'); if (p) p.addEventListener('input', updatePainReadout); }
  { const pr = $id('painRefToggle'); if (pr) pr.addEventListener('click', () => { const r = $id('painRef'); if (r) r.style.display = (r.style.display === 'none' ? '' : 'none'); }); }
  // 訓練時段 chips ＋ 尿液色卡
  buildTrainingSessionChips();
  buildUrineSwatches();
  // 痠痛／RPE／排汗 滑桿即時文字
  { const s = $id('soreness'); if (s) s.addEventListener('input', updateSorenessReadout); }
  { const r = $id('rpe'); if (r) r.addEventListener('input', updateRpeReadout); }
  { const sw = $id('sweatLevel'); if (sw) sw.addEventListener('input', updateSweatReadout); }
  // 水量 AI 建議：體重／強度／水量改變時更新
  { const wk = $id('weightKg'); if (wk) wk.addEventListener('input', updateWaterAdvice); }
  { const ti = $id('trainingIntensity'); if (ti) ti.addEventListener('change', updateWaterAdvice); }
  { const wi = $id('waterIntake'); if (wi) wi.addEventListener('change', updateWaterAdvice); }
  // 初次顯示
  updateSleepCalc(); updatePainReadout(); updateUrineNote();
  updateSorenessReadout(); updateRpeReadout(); updateSweatReadout(); updateWaterAdvice();

  // 表單草稿自動保存（填一半關掉也不會不見）
  const saveDraftDebounced = debounce(saveDraft, 400);
  const studentForm = $id('studentForm');
  if (studentForm) ['input', 'change'].forEach(ev => studentForm.addEventListener(ev, saveDraftDebounced));
  const mgt = $id('mainGoalToday');
  if (mgt) mgt.addEventListener('input', saveDraftDebounced);

  // 送出按鈕
  $id('btnSubmit').addEventListener('click', () => doSubmit('official'));
  const btnSubmitShare = $id('btnSubmitShare');
  if (btnSubmitShare) btnSubmitShare.addEventListener('click', submitAndShareLine);
  $id('btnLocalSubmit').addEventListener('click', () => doSubmit('local'));
  $id('btnClear').addEventListener('click', clearForm);

  // 複製按鈕
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = $id(btn.dataset.target).textContent;
      copyText(text);
    });
  });

  // 分享到 LINE 按鈕（跳出 LINE 讓使用者選群組／好友）
  document.querySelectorAll('.btn-line-share').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.dataset.target) return;
      const text = $id(btn.dataset.target).textContent;
      shareToLine(text);
    });
  });

  // 上次表現分頁
  $id('btnLoadLastPerf').addEventListener('click', loadLastPerfPage);
  { const b = $id('btnWeeklyReport'); if (b) b.addEventListener('click', loadWeeklyReport); }
  document.querySelectorAll('.lastperf-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof applyTodayReportFilter === 'function') applyTodayReportFilter(btn.dataset.lastperfFilter || 'all');
    });
  });
  { const b = $id('btnRefreshTodayReported'); if (b) b.addEventListener('click', () => {
    if (typeof refreshTodayReportedList === 'function') refreshTodayReportedList();
  }); }

  // 教練後台
  $id('btnRefreshCoach').addEventListener('click', refreshCoach);
  $id('btnLoadPerson').addEventListener('click', loadPersonRecords);

  // 教練戰情室：任務指派、賽前分析
  setupTaskHandlers();
  const btnPreComp = $id('btnPreComp');
  if (btnPreComp) btnPreComp.addEventListener('click', loadPreComp);

  // 個人檔案
  const btnLoadProfile = $id('btnLoadProfile');
  if (btnLoadProfile) btnLoadProfile.addEventListener('click', loadProfile);
  const profileName = $id('profileName');
  if (profileName) profileName.addEventListener('change', () => {
    clearPersonalJournalPreview();
    refreshJournalFileNo();
  });
  const journalMonthFrom = $id('journalMonthFrom');
  const journalMonthTo = $id('journalMonthTo');
  if (journalMonthFrom) journalMonthFrom.addEventListener('change', () => {
    clearPersonalJournalPreview();
    refreshJournalFileNo();
  });
  if (journalMonthTo) journalMonthTo.addEventListener('change', () => {
    clearPersonalJournalPreview();
    refreshJournalFileNo();
  });
  const journalCoachName = $id('journalCoachName');
  if (journalCoachName) journalCoachName.addEventListener('change', () => {
    clearPersonalJournalPreview();
    refreshJournalFileNo();
  });
  const btnLoadJournal = $id('btnLoadJournal');
  if (btnLoadJournal) btnLoadJournal.addEventListener('click', loadPersonalJournal);
  const btnLoadJournalBatch = $id('btnLoadJournalBatch');
  if (btnLoadJournalBatch) btnLoadJournalBatch.addEventListener('click', loadPersonalJournalBatch);
  const btnDownloadJournalPdf = $id('btnDownloadJournalPdf');
  if (btnDownloadJournalPdf) btnDownloadJournalPdf.addEventListener('click', downloadPersonalJournalPdf);
  const btnPrintJournal = $id('btnPrintJournal');
  if (btnPrintJournal) btnPrintJournal.addEventListener('click', printPersonalJournal);
  refreshJournalFileNo();

  // 系統設定
  setupSettingsHandlers();
  renderPlayerList();

  // 角色登入
  setupRoleHandlers();
  setupAccountAdminHandlers();

  // 先讀取後端登入模式；新制選手／家長不下載全隊名單。
  loadAuthConfig().then(() => {
    const role = getRole();
    if (role) applyRole();
    else showLoginOverlay();
    setTimeout(() => {
      const activeLastPerf = document.querySelector('#tab-lastperf.active');
      if (activeLastPerf && typeof refreshTodayReportedList === 'function') refreshTodayReportedList();
    }, 150);
    // 角色套用後再還原草稿（選手姓名鎖定才正確）；有還原才提示
    if (restoreDraft()) toast('📝 已還原上次未送出的草稿');
  });

  // 隊伍／運動項目通用設定（品牌與模組）
  applyBrand();
  renderBrandSettings();
  setupBrandHandlers();

  // AI 教練回饋（OpenAI）設定
  setupAiHandlers();

  // PWA 安裝按鈕
  setupPwaInstall();

  // 今日我該做什麼：導引卡點擊捲動
  setupTodayGuideNav();

  // 本週之星（學生填寫頁上方）
  renderWeeklyStars();
}

/*
   分享到 LINE：用官方分享網址開啟 LINE，由使用者自己選要分享到哪個
   群組或好友（不需要任何 token、不需後端）。手機與桌機版 LINE 皆支援。
*/
function shareToLine(text) {
  if (!text || !text.trim()) { toast('沒有可分享的內容'); return; }
  // 1) 先複製到剪貼簿，當作萬用後備：桌機沒有 LINE App、或瀏覽器擋彈窗時，
  //    使用者仍可直接切到 LINE 群組長按貼上。
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    fallbackCopy(text);
  }
  // 2) 再嘗試開啟 LINE 分享頁，讓使用者自己選群組／好友（手機裝 LINE 會帶入文字）。
  //    改用現行的 /R/share 端點，比舊的 /R/msg/text/ 對群組支援更穩。
  const url = 'https://line.me/R/share?text=' + encodeURIComponent(text);
  const win = window.open(url, '_blank');
  if (!win) {
    toast('✅ 內容已複製，請切到 LINE 手動貼到群組（未裝 LINE 或被擋彈窗）');
  } else {
    toast('✅ 已複製並開啟 LINE，選好群組後若沒自動帶入文字，直接貼上即可');
  }
}

// 複製文字（相容無 navigator.clipboard 的情況）
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('✅ 已複製')).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('✅ 已複製'); }
  catch (e) { toast('複製失敗，請手動長按選取'); }
  document.body.removeChild(ta);
}

// 清空表單
function clearForm() {
  ['gradeClass', 'trainingTopic', 'absenceReason', 'absenceMiss', 'absenceCatchup', 'heightCm', 'weightKg', 'targetWeightKg',
   'breakfast', 'lunch', 'dinner', 'snacksDrinks',
   'reflection', 'tomorrowGoal', 'gratitude', 'encouragementToTeammate', 'mainGoalToday'].forEach(id => { const el = $id(id); if (el) el.value = ''; });
  if ($id('absenceHonesty')) $id('absenceHonesty').selectedIndex = 0;
  document.querySelectorAll('#absenceMissChips .chip, #absenceCatchupChips .chip').forEach(c => c.classList.remove('sel'));
  clearMealTags();
  $id('date').value = todayStr();
  $id('bodyStatus').value = '普通';
  ['group', 'waterIntake', 'trainingIntensity'].forEach(id => $id(id).selectedIndex = 0);
  toggleAbsenceReason($id('group').value);
  if ($id('encourageTeammate')) $id('encourageTeammate').selectedIndex = 0;
  $id('lateNightSnack').value = '無';
  // 睡眠 / 疼痛 / 尿液：清空並刷新 AI 顯示
  ['bedTime', 'wakeTime', 'sleepHours', 'injuryArea'].forEach(id => { const el = $id(id); if (el) el.value = ''; });
  if ($id('sleepQuality')) $id('sleepQuality').value = '普通';
  if ($id('urineStatus')) $id('urineStatus').value = '';
  if ($id('painScore')) $id('painScore').value = 0;
  // 滑桿回預設、時段與尿液色卡清空
  if ($id('soreness')) $id('soreness').value = 2;
  if ($id('rpe')) $id('rpe').value = 5;
  if ($id('sweatLevel')) $id('sweatLevel').value = 2;
  if (typeof setTrainingSession === 'function') setTrainingSession('');
  updateSleepCalc(); updatePainReadout(); updateUrineNote();
  if (typeof syncUrineSwatchSelection === 'function') syncUrineSwatchSelection();
  if (typeof updateSorenessReadout === 'function') updateSorenessReadout();
  if (typeof updateRpeReadout === 'function') updateRpeReadout();
  if (typeof updateSweatReadout === 'function') updateSweatReadout();
  clearMood();
  // 清空自由品勢額外欄位
  FREESTYLE_EXTRA_IDS.forEach(id => { const el = $id(id); if (el) { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; } });
  updateBmiDisplay();
  // 拉桿全部重設回「未評分」（必須重新逐項評分）
  document.querySelectorAll('.kpi-slider').forEach(s => resetSliderUntouched(s));
  recalcKpiSummary();
  // 隱藏回饋卡
  ['coachFeedbackCard', 'compareCard', 'nutritionCard', 'lineCard'].forEach(id => { const el = $id(id); if (el) el.style.display = 'none'; });
  clearDraft();
  toast('已清空表單');
}

/* ============================================================
   12.5 表單草稿自動保存 + 自動帶入上次資料
   ------------------------------------------------------------
   - 草稿：邊填邊存 localStorage，重開／不小心關掉自動還原，送出成功才清。
   - 自動帶入：選姓名後，把不太會天天變的欄位（身高/班級/組別/目標體重）
     從「上一筆」帶入，且只在欄位還空白時帶，不覆蓋學生已輸入的內容。
   ============================================================ */

// 草稿要保存的欄位（簡單欄位，KPI 拉桿另外處理）
const DRAFT_FIELDS = [
  'date', 'name', 'gradeClass', 'group', 'trainingTopic', 'absenceReason', 'absenceMiss', 'absenceCatchup', 'absenceHonesty', 'bodyStatus',
  'bedTime', 'wakeTime', 'sleepQuality', 'soreness', 'rpe', 'injuryArea', 'painScore', 'trainingSession', 'sweatLevel',
  'heightCm', 'weightKg', 'targetWeightKg',
  'breakfast', 'lunch', 'dinner', 'snacksDrinks', 'waterIntake', 'urineStatus', 'lateNightSnack', 'trainingIntensity',
  'reflection', 'tomorrowGoal', 'gratitude', 'encourageTeammate', 'encouragementToTeammate', 'mainGoalToday'
].concat(FREESTYLE_EXTRA_IDS);

function debounce(fn, ms) {
  let t;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

function saveDraft() {
  const d = { _savedAt: Date.now() };
  DRAFT_FIELDS.forEach(id => { const el = $id(id); if (el) d[id] = el.value; });
  d._kpi = {};
  document.querySelectorAll('.kpi-slider').forEach(s => { if (s.dataset.touched === '1') d._kpi[s.id] = s.value; });
  d._mealTags = getAllMealTags();   // 飲食快速勾選狀態
  d._mood = getMoodIndex();         // 今日心情指數
  d._moodReason = getMoodReason();
  try { localStorage.setItem(LS_KEYS.formDraft, JSON.stringify(d)); } catch (e) { /* 容量滿就略過 */ }
}

function clearDraft() {
  try { localStorage.removeItem(LS_KEYS.formDraft); } catch (e) { /* */ }
}

// 還原草稿；回傳是否真的有還原內容
function restoreDraft() {
  let d;
  try { d = JSON.parse(localStorage.getItem(LS_KEYS.formDraft)); } catch (e) { return false; }
  if (!d) return false;
  // 只還原「今天」的草稿，昨天的舊草稿直接丟掉
  if (d.date && d.date !== todayStr()) { clearDraft(); return false; }

  const nameLocked = $id('name') && $id('name').disabled;
  // 先還原組別並重建對應 KPI 拉桿，再套拉桿數值
  if (d.group) { const g = $id('group'); if (g) { g.value = d.group; renderKpiSliders(d.group); } }
  DRAFT_FIELDS.forEach(id => {
    if (id === 'group') return;
    if (id === 'name' && nameLocked) return; // 選手姓名已鎖定，不被草稿蓋掉
    const el = $id(id);
    if (el && d[id] !== undefined) el.value = d[id];
  });
  if (d._kpi) Object.keys(d._kpi).forEach(sid => {
    const s = $id(sid);
    if (s) { s.value = d._kpi[sid]; s.dispatchEvent(new Event('input')); }
  });
  if (d._mealTags) Object.keys(d._mealTags).forEach(meal => setMealTags(meal, d._mealTags[meal]));
  if (d._mood) setMoodIndex(d._mood);
  if (d._moodReason) setMoodReason(d._moodReason);
  if (typeof setTrainingSession === 'function') setTrainingSession(d.trainingSession || '');
  updateBmiDisplay();
  updateSleepCalc(); updatePainReadout(); updateUrineNote();
  if (typeof syncUrineSwatchSelection === 'function') syncUrineSwatchSelection();
  if (typeof updateSorenessReadout === 'function') updateSorenessReadout();
  if (typeof updateRpeReadout === 'function') updateRpeReadout();
  if (typeof updateSweatReadout === 'function') updateSweatReadout();
  return true;
}

// 從上一筆帶入不太會變的欄位（只填空白欄，不覆蓋已輸入）
function autofillFromLast(rec) {
  if (!rec) return;
  let filled = false;
  const map = { gradeClass: rec.gradeClass, heightCm: rec.heightCm, targetWeightKg: rec.targetWeightKg };
  Object.keys(map).forEach(id => {
    const el = $id(id);
    const val = map[id];
    if (el && !String(el.value).trim() && val != null && String(val).trim() !== '') {
      el.value = val; filled = true;
    }
  });
  // 組別：空白才帶，並重建 KPI 拉桿
  const g = $id('group');
  if (g && (!g.value || g.selectedIndex === 0) && rec.group) {
    g.value = rec.group; renderKpiSliders(rec.group); filled = true;
  }
  if (filled) { updateBmiDisplay(); toast('已帶入上次的身高/班級/組別，記得確認 🙂'); }
}

// 啟動
/* ===================== PWA 安裝按鈕 ===================== */
function pwaIsStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
let _pwaPrompt = null;

// 偵測「App 內建瀏覽器」（LINE / FB / IG / 微信…）——這些瀏覽器沒有「加入主畫面」
function pwaInApp(ua) {
  return /\bLine\b|\bFBAN\b|\bFBAV\b|Instagram|MicroMessenger|FB_IAB/i.test(ua);
}

// 一鍵複製網址（給 in-app 瀏覽器用，貼到 Safari/Chrome）
async function pwaCopyUrl(targetBtn) {
  const url = location.href.split('#')[0];
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; }
  catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      ok = document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e2) { ok = false; }
  }
  if (targetBtn) {
    const old = targetBtn.textContent;
    targetBtn.textContent = ok ? '✅ 已複製，去貼到瀏覽器' : '長按上方網址手動複製';
    setTimeout(() => { targetBtn.textContent = old; }, 2600);
  }
  return ok;
}

// 圖文安裝引導彈窗
function pwaShowGuide(kind) {
  document.getElementById('pwaGuideMask')?.remove();
  const url = location.href.split('#')[0];
  const mask = document.createElement('div');
  mask.id = 'pwaGuideMask';
  mask.className = 'pwa-guide-mask';
  let inner = '';
  if (kind === 'inapp') {
    inner = `
      <h3>用 Safari / Chrome 開啟才能安裝</h3>
      <p class="pwa-guide-sub">你現在是用 LINE（或 FB / IG）內建的瀏覽器開啟，這種瀏覽器<b>沒有「加入主畫面」功能</b>。請依下面 2 步：</p>
      <ol class="pwa-guide-steps">
        <li><b>複製網址</b>（按下方按鈕）</li>
        <li>iPhone 開 <b>Safari</b>／Android 開 <b>Chrome</b>，貼上網址打開，再按一次「安裝」</li>
      </ol>
      <div class="pwa-guide-url">${url}</div>
      <button id="pwaCopyBtn" class="pwa-guide-primary">📋 複製網址</button>
      <p class="pwa-guide-tip">小提醒：iPhone 右上角也可能有「在 Safari 開啟」的選項，更快。</p>`;
  } else if (kind === 'ios') {
    inner = `
      <h3>加到 iPhone 桌面（3 步）</h3>
      <ol class="pwa-guide-steps pwa-guide-steps-lg">
        <li>按螢幕<b>最下方中間</b>的「分享」鈕 <span class="pwa-ico">⬆️</span></li>
        <li>往下滑，點「<b>加入主畫面</b>」 <span class="pwa-ico">➕</span></li>
        <li>右上角按「<b>新增</b>」即完成</li>
      </ol>
      <p class="pwa-guide-tip">⚠️ 一定要用 <b>Safari</b> 開啟才看得到「分享」鈕。</p>`;
  } else { // android 找不到鈕
    inner = `
      <h3>找不到安裝鈕？</h3>
      <ol class="pwa-guide-steps">
        <li>按瀏覽器右上角「<b>⋮</b>」</li>
        <li>選「<b>安裝應用程式</b>／加到主畫面」</li>
      </ol>
      <p class="pwa-guide-tip">若仍找不到，可能已安裝過——請長按桌面圖示移除後再安裝一次。</p>`;
  }
  mask.innerHTML = `<div class="pwa-guide-card">${inner}<button id="pwaGuideClose" class="pwa-guide-close">關閉</button></div>`;
  document.body.appendChild(mask);
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  document.getElementById('pwaGuideClose')?.addEventListener('click', () => mask.remove());
  document.getElementById('pwaCopyBtn')?.addEventListener('click', (e) => pwaCopyUrl(e.currentTarget));
}

function setupPwaInstall() {
  const btn = $id('pwaInstallBtn');
  if (!btn) return;
  if (pwaIsStandalone()) { btn.style.display = 'none'; return; } // 已在 App 內就不顯示
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  const inApp = pwaInApp(ua);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaPrompt = e;
    btn.style.display = '';
  });
  window.addEventListener('appinstalled', () => { _pwaPrompt = null; btn.style.display = 'none'; });

  // iOS / App 內建瀏覽器 都沒有 beforeinstallprompt → 主動顯示按鈕，點了給教學
  if (isIOS || inApp) btn.style.display = '';
  if (inApp) btn.textContent = '📲 安裝到桌面（請用瀏覽器開）';

  btn.addEventListener('click', async () => {
    if (inApp) { pwaShowGuide('inapp'); return; }   // LINE/FB/IG 內建瀏覽器：先請他換瀏覽器
    if (_pwaPrompt) {
      _pwaPrompt.prompt();
      try { await _pwaPrompt.userChoice; } catch (e) { /* */ }
      _pwaPrompt = null; btn.style.display = 'none';
    } else if (isIOS) {
      pwaShowGuide('ios');
    } else {
      pwaShowGuide('android');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
