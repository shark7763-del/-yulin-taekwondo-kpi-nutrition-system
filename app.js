/* ============================================================
   育林國中跆拳道隊｜選手 KPI＋身體狀態＋AI 飲食建議系統
   app.js — 純前端 JavaScript（不需要任何框架或 CDN）

   主要區塊：
   1. 常數設定（選手名單、選項、KPI 細項、飲食關鍵字、建議對照表）
   2. localStorage 工具（名單、URL、本機測試紀錄）
   3. 分頁切換
   4. 表單初始化與動態 KPI 拉桿
   5. 分數計算、狀態判斷、最低三項
   6. BMI / 體重差距 / 體重變化提醒
   7. 飲食分析 analyzeNutrition（規則式 AI）
   8. 建議對照表 suggestionMap
   9. 上次表現回顧 / 今天我要改善
   10. 送出（正式 / 本機測試）+ 今日 vs 上次 + 飲食回饋 + LINE 四版本
   11. 教練後台
   12. 系統設定（URL、名單管理、匯入匯出）
   13. API 呼叫（postToWebApp）
   ============================================================ */

'use strict';

/* ============================================================
   0. 全域設定（要給「所有學生手機」共用，請填這裡）
   ------------------------------------------------------------
   把你的 Google Apps Script Web App URL（/exec 結尾）貼進
   WEB_APP_URL，存檔 push 到 GitHub 後，所有人打開連結都會
   自動連線、自動拿到雲端共用名單，學生手機不用再自己設定。

   留空字串 '' 時，系統會改用「系統設定」存在各裝置的網址（舊行為）。
   ============================================================ */
const CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzgEfr0ranuG1n6wdUe0he9gCV_WZYXy92xkIQaHHRPjvePSbTA0zR30oavJLRoGrFl0g/exec'
};

/* ============================================================
   1. 常數設定
   ============================================================ */

// 內建預設選手名單
const DEFAULT_PLAYERS = [
  '王冠霖', '謝昊恩', '唐霈昕', '林子棠', '葉承祐', '吳昀蓁',
  '蘇宥嘉', '許景皓', '王柏鈞', '上官哲忻', '林駿堯', '徐洧翎',
  '張晏慈', '曹絜綺', '鄧鈞甯', '陳語玄', '胡馨凌', '高莉妤',
  '陳希恩', '黃粲益', '黃粲祐', '林晏合', '王瀚忠', '許晨熙'
];

// 組別選項
const GROUP_OPTIONS = [
  '對練｜校隊', '品勢｜校隊', '對練｜道館', '品勢｜道館',
  '體能訓練', '傷後恢復', '比賽日', '其他'
];

// 訓練強度選項
const INTENSITY_OPTIONS = ['恢復日', '低', '中', '高', '比賽日'];

// 水量選項
const WATER_OPTIONS = [
  '少於 500ml', '500-1000ml', '1000-1500ml', '1500-2000ml', '2000ml 以上'
];

// 宵夜選項
const LATE_NIGHT_OPTIONS = ['無', '有，少量', '有，偏多'];

// 拉桿分數文字
const SCORE_LABELS = { 1: '很差', 2: '偏弱', 3: '普通', 4: '良好', 5: '非常好' };

/*
   KPI 六大面向細項。
   technical（技術狀態）與 tactical（戰術執行力）會依「對練/品勢」分流，
   故各自提供 spar（對練）與 poomsae（品勢）兩組。
*/
const KPI_ASPECTS = {
  physical: {
    label: '體能狀態',
    items: ['爆發力', '肌力支撐', '心肺耐力', '核心穩定', '身體疲勞度']
  },
  technical: {
    label: '技術狀態',
    spar: ['基本動作', '距離控制', '速度反應', '動作穩定', '技術完成度'],
    poomsae: ['動作準確度', '重心穩定', '力道表現', '節奏控制', '整套完成度']
  },
  focus: {
    label: '專注力',
    items: ['聽指令', '訓練投入', '修正能力', '分心程度', '記住教練提醒']
  },
  discipline: {
    label: '自律態度',
    items: ['準時', '禮貌', '主動訓練', '裝備整理', '對訓練的責任感']
  },
  emotion: {
    label: '情緒控制',
    items: ['被得分後反應', '輸贏態度', '壓力下穩定度', '挫折恢復', '與隊友互動']
  },
  tactical: {
    label: '戰術執行力',
    spar: ['攻擊意圖', '防守反應', '邊界處理', '教練指令執行', '對打判斷'],
    poomsae: ['視線精神', '呼吸與發力', '轉身平衡', '比賽穩定度', '臨場表現']
  }
};

// 面向順序（影響顯示與計算）
const ASPECT_ORDER = ['physical', 'technical', 'focus', 'discipline', 'emotion', 'tactical'];

// 對應到 Sheet 欄位的平均欄位名（選手自評）
const ASPECT_AVG_FIELD = {
  physical: 'physicalAvg', technical: 'technicalAvg', focus: 'focusAvg',
  discipline: 'disciplineAvg', emotion: 'emotionAvg', tactical: 'tacticalAvg'
};

// 教練複評對應的 Sheet 欄位名
const COACH_ASPECT_FIELD = {
  physical: 'coachPhysicalAvg', technical: 'coachTechnicalAvg', focus: 'coachFocusAvg',
  discipline: 'coachDisciplineAvg', emotion: 'coachEmotionAvg', tactical: 'coachTacticalAvg'
};

// 飲食關鍵字
const NUTRITION_KEYWORDS = {
  protein: ['雞', '雞蛋', '蛋', '牛肉', '豬肉', '魚', '蝦', '豆腐', '豆漿', '鮪魚', '牛奶', '優格', '豆干', '毛豆', '乳清', '肉', '海鮮'],
  vegetable: ['青菜', '花椰菜', '高麗菜', '菠菜', '地瓜葉', '空心菜', '菇', '菇類', '杏鮑菇', '蔬菜', '沙拉', '番茄', '小黃瓜', '胡蘿蔔'],
  sugaryDrink: ['奶茶', '手搖', '可樂', '汽水', '紅茶', '綠茶', '珍奶', '果汁', '運動飲料', '含糖', '多多', '養樂多'],
  friedOily: ['炸', '薯條', '鹽酥雞', '雞排', '炸雞', '披薩', '漢堡', '泡麵', '滷味', '火鍋', '燒烤'],
  staple: ['飯', '麵', '地瓜', '馬鈴薯', '吐司', '麵包', '粥', '水餃', '義大利麵', '燕麥', '饅頭']
};

/*
   建議對照表 suggestionMap：細項 -> { 提醒, 建議 }
   涵蓋六大面向常見細項，超過 25 項。
*/
const suggestionMap = {
  // 體能
  '核心穩定': { remind: '核心不穩時，踢擊和轉身都會受影響。', advice: '明天加強棒式、死蟲、側棒式與單腳穩定。' },
  '爆發力': { remind: '爆發力不足，攻擊就會慢半拍。', advice: '明天加入跳箱、藥球拋擲與短距衝刺。' },
  '肌力支撐': { remind: '肌力撐不住，動作後段會走形。', advice: '明天安排深蹲、硬舉輔助與核心肌力。' },
  '心肺耐力': { remind: '心肺撐不住，後段體能會掉。', advice: '明天加入間歇跑與多回合對打模擬。' },
  '身體疲勞度': { remind: '身體太累，技術品質一定下降。', advice: '今晚提早睡，明天先做動態暖身與恢復。' },
  // 技術（對練）
  '基本動作': { remind: '基本動作不穩，後面技術都會晃。', advice: '明天放慢速度，把每個基本動作做標準。' },
  '距離控制': { remind: '不是你不敢打，而是距離還沒有抓準。', advice: '明天加強滑步進出、前腳旋踢距離判斷與攻後退防。' },
  '速度反應': { remind: '反應慢一點，就會被先得分。', advice: '明天加入反應燈、喊聲起腳與防守反擊訓練。' },
  '動作穩定': { remind: '動作不穩，得分會被裁判扣分。', advice: '明天放慢速度確認軌跡，再逐步加速。' },
  '技術完成度': { remind: '技術沒收完，分數就拿不到。', advice: '明天每一腳都要求完整收腳與重心回正。' },
  // 技術（品勢）
  '動作準確度': { remind: '品勢看的是準確，不是用力。', advice: '明天對鏡子確認角度、高度與定位。' },
  '重心穩定': { remind: '重心一晃，整套就扣分。', advice: '明天加強單腳定位與慢速移位練習。' },
  '力道表現': { remind: '力道不是用蠻力，是收放分明。', advice: '明天練習發力瞬間的收緊與停頓。' },
  '節奏控制': { remind: '節奏亂掉，整套就沒有氣勢。', advice: '明天跟著口令數拍，確認快慢分明。' },
  '整套完成度': { remind: '整套要一氣呵成才有說服力。', advice: '明天完整走 3 遍，要求每次都收乾淨。' },
  // 專注
  '聽指令': { remind: '沒聽清楚指令，就會做錯方向。', advice: '明天教練說明時先複誦一次再執行。' },
  '訓練投入': { remind: '投入度不夠，效果就打折。', advice: '明天訓練前先設定一個重點目標。' },
  '修正能力': { remind: '被提醒後沒修正，就會重複錯誤。', advice: '明天每被提醒一次，下一次就立刻調整。' },
  '分心程度': { remind: '注意力還沒有完全鎖住目標。', advice: '明天訓練前先設定一個重點，整堂課只盯住這件事。' },
  '記住教練提醒': { remind: '教練的提醒沒記住，就會一直犯同樣的錯。', advice: '明天把重點寫下來，訓練中提醒自己。' },
  // 自律
  '準時': { remind: '自律不是教練盯出來的，是選手自己要求出來的。', advice: '明天提早 10 分鐘到場，從準時開始。' },
  '禮貌': { remind: '禮貌是跆拳道的根本。', advice: '明天進出道場、對教練與隊友都行禮問好。' },
  '主動訓練': { remind: '等別人推，不如自己先動。', advice: '明天主動補強自己最弱的一項。' },
  '裝備整理': { remind: '裝備亂，心也容易亂。', advice: '明天訓練前後整理好護具與服裝。' },
  '對訓練的責任感': { remind: '把訓練當成自己的事，才會真的進步。', advice: '明天為自己設一個可完成的小任務。' },
  // 情緒
  '被得分後反應': { remind: '真正的穩定，是被得分後還能照計畫打。', advice: '明天加入落後情境對打與呼吸重整訓練。' },
  '輸贏態度': { remind: '輸贏是過程，態度才是實力。', advice: '明天無論輸贏，結束都要復盤一個重點。' },
  '壓力下穩定度': { remind: '壓力下還能穩，才是比賽選手。', advice: '明天加入計時、計分情境提高壓力。' },
  '挫折恢復': { remind: '跌倒不可怕，慢慢爬起來才可惜。', advice: '明天練習失誤後立刻重整再來一次。' },
  '與隊友互動': { remind: '隊友是一起變強的人，不是對手。', advice: '明天主動鼓勵一位隊友。' },
  // 戰術（對練）
  '攻擊意圖': { remind: '不敢出手，就拿不到分。', advice: '明天練習主動進攻組合與假動作起腳。' },
  '防守反應': { remind: '防守慢，就會一直挨打。', advice: '明天加強防守後立即反擊的連結。' },
  '邊界處理': { remind: '邊線不是退路，是戰術提醒。', advice: '明天加強邊線反擊、轉向脫離與場地意識。' },
  '教練指令執行': { remind: '場上願意照指令打，才打得出戰術。', advice: '明天每回合執行一個教練指定戰術。' },
  '對打判斷': { remind: '判斷對了，攻防才會有效率。', advice: '明天練習看距離與時機再決定出手。' },
  // 戰術（品勢）
  '視線精神': { remind: '眼神到位，氣勢就出來。', advice: '明天每個動作確認視線方向與精神。' },
  '呼吸與發力': { remind: '呼吸亂，發力就散。', advice: '明天配合呼吸練習發力的收與放。' },
  '轉身平衡': { remind: '轉身站不穩，就會被扣分。', advice: '明天加強轉身後的定位與重心控制。' },
  '比賽穩定度': { remind: '平時穩，上場才不會亂。', advice: '明天用比賽模擬完整走一次。' },
  '臨場表現': { remind: '臨場的氣勢，是平常累積出來的。', advice: '明天加入觀眾或計分情境練膽量。' }
};

/* ============================================================
   2. localStorage 工具
   ============================================================ */

const LS_KEYS = {
  players: 'yulin_players',
  webAppUrl: 'yulin_webapp_url',
  localRecords: 'yulin_local_records'
};

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
function dateSlash(s) { return (s || '').replace(/-/g, '/'); }

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

/* ============================================================
   4. 表單初始化
   ============================================================ */

// 目前使用的 KPI 細項結構（依組別動態決定），用於計算
let currentKpiStructure = buildKpiStructure('對練｜校隊');

// 依組別決定 technical / tactical 用對練還是品勢細項
function buildKpiStructure(group) {
  const isPoomsae = group && group.indexOf('品勢') !== -1;
  const struct = {};
  ASPECT_ORDER.forEach(key => {
    const aspect = KPI_ASPECTS[key];
    let items;
    if (key === 'technical' || key === 'tactical') {
      items = isPoomsae ? aspect.poomsae : aspect.spar;
    } else {
      items = aspect.items;
    }
    struct[key] = { label: aspect.label, items: items.slice() };
  });
  return struct;
}

// 把選項塞進 select
function fillSelect(el, options, placeholder) {
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
  ['name', 'lastPerfName', 'coachPersonName'].forEach(id => {
    const el = $id(id);
    if (!el) return;
    const prev = el.value;
    fillSelect(el, players, '請選擇選手');
    if (players.indexOf(prev) !== -1) el.value = prev;
  });
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

// 建立 KPI 拉桿 UI
function renderKpiSliders(group) {
  currentKpiStructure = buildKpiStructure(group);
  const container = $id('kpiContainer');
  container.innerHTML = '';

  ASPECT_ORDER.forEach(aspectKey => {
    const aspect = currentKpiStructure[aspectKey];
    const box = document.createElement('div');
    box.className = 'kpi-aspect';
    box.dataset.aspect = aspectKey;

    const head = document.createElement('div');
    head.className = 'kpi-aspect-head';
    head.innerHTML = `<span>${aspect.label}</span><span class="kpi-aspect-avg" id="avg-${aspectKey}">平均 3.0</span>`;
    box.appendChild(head);

    aspect.items.forEach((itemName, idx) => {
      const item = document.createElement('div');
      item.className = 'kpi-item';
      const sliderId = `slider-${aspectKey}-${idx}`;
      item.innerHTML = `
        <div class="kpi-item-row">
          <span class="kpi-item-name">${itemName}</span>
          <span class="kpi-item-score" id="score-${aspectKey}-${idx}">3 分 · 普通</span>
        </div>
        <input type="range" min="1" max="5" step="1" value="3"
               class="kpi-slider" id="${sliderId}"
               data-aspect="${aspectKey}" data-item="${itemName}" />
      `;
      box.appendChild(item);
    });

    container.appendChild(box);
  });

  // 綁定拉桿事件
  container.querySelectorAll('.kpi-slider').forEach(slider => {
    slider.addEventListener('input', onSliderChange);
  });
  recalcAllAspects();
}

function onSliderChange(e) {
  const slider = e.target;
  const val = parseInt(slider.value, 10);
  const [, aspectKey, idx] = slider.id.split('-');
  $id(`score-${aspectKey}-${idx}`).textContent = `${val} 分 · ${SCORE_LABELS[val]}`;
  recalcAspectAvg(aspectKey);
}

function recalcAspectAvg(aspectKey) {
  const sliders = document.querySelectorAll(`.kpi-slider[data-aspect="${aspectKey}"]`);
  if (!sliders.length) return 0;
  let sum = 0;
  sliders.forEach(s => sum += parseInt(s.value, 10));
  const avg = sum / sliders.length;
  const avgEl = $id(`avg-${aspectKey}`);
  if (avgEl) avgEl.textContent = `平均 ${round1(avg)}`;
  return avg;
}

function recalcAllAspects() {
  ASPECT_ORDER.forEach(k => recalcAspectAvg(k));
}

/* ============================================================
   5. 分數計算、狀態、最低三項
   ============================================================ */

// 從目前表單拉桿收集分數
function collectScores() {
  const scores = {};      // { aspectKey: { itemName: value } }
  const aspectAvg = {};   // { aspectKey: avg }
  ASPECT_ORDER.forEach(aspectKey => {
    const sliders = document.querySelectorAll(`.kpi-slider[data-aspect="${aspectKey}"]`);
    scores[aspectKey] = {};
    let sum = 0;
    sliders.forEach(s => {
      const v = parseInt(s.value, 10);
      scores[aspectKey][s.dataset.item] = v;
      sum += v;
    });
    aspectAvg[aspectKey] = sliders.length ? round1(sum / sliders.length) : 0;
  });
  return { scores, aspectAvg };
}

// 總分 = 六大面向平均加總；平均 = 總分 / 6
function computeTotals(aspectAvg) {
  let total = 0;
  ASPECT_ORDER.forEach(k => total += aspectAvg[k]);
  total = round2(total);
  const average = round2(total / 6);
  return { total, average };
}

// 狀態判斷
function judgeStatus(average) {
  if (average >= 4.0) return '🟢 綠燈';
  if (average >= 3.0) return '🟡 黃燈';
  return '🔴 紅燈';
}

// 找出所有低於 3 分的細項，取最低三項（同分依出現順序）
function findLowItems(scores) {
  const list = [];
  ASPECT_ORDER.forEach(aspectKey => {
    const items = scores[aspectKey];
    Object.keys(items).forEach(itemName => {
      const v = items[itemName];
      if (v < 3) list.push({ item: itemName, score: v, aspect: aspectKey });
    });
  });
  // 穩定排序（同分保留出現順序）
  list.sort((a, b) => a.score - b.score);
  return list.slice(0, 3);
}

/* ============================================================
   6. BMI / 體重差距 / 體重變化
   ============================================================ */

function computeBmi(heightCm, weightKg) {
  const h = parseFloat(heightCm), w = parseFloat(weightKg);
  if (!h || !w) return null;
  const m = h / 100;
  return round1(w / m / m);
}

function computeWeightGap(weightKg, targetWeightKg) {
  const w = parseFloat(weightKg), t = parseFloat(targetWeightKg);
  if (isNaN(w) || isNaN(t)) return null;
  return round1(w - t);
}

// 即時更新 BMI 與差距顯示
function updateBmiDisplay() {
  const bmi = computeBmi($id('heightCm').value, $id('weightKg').value);
  $id('bmiDisplay').textContent = bmi !== null ? bmi : '--';
  const gap = computeWeightGap($id('weightKg').value, $id('targetWeightKg').value);
  if (gap === null) { $id('weightGapDisplay').textContent = '--'; return; }
  if (gap > 0) $id('weightGapDisplay').textContent = `還有 ${gap} kg`;
  else if (gap < 0) $id('weightGapDisplay').textContent = `已低於目標 ${Math.abs(gap)} kg`;
  else $id('weightGapDisplay').textContent = '已達目標';
}

// 體重變化提醒（與上次比較）
function weightChangeNote(currentWeight, lastWeight) {
  const cw = parseFloat(currentWeight), lw = parseFloat(lastWeight);
  if (isNaN(cw) || isNaN(lw)) return '';
  const diff = round1(cw - lw);
  if (diff <= -1.5) {
    return `本次體重下降較明顯（${lw} → ${cw} kg，下降 ${Math.abs(diff)} kg），請注意水分與恢復狀況，必要時請教練與家長一起關心。`;
  }
  if (diff >= 1.5) {
    return `本次體重變化較明顯（${lw} → ${cw} kg，上升 ${diff} kg），可能與水分、飲食或訓練恢復有關，請持續觀察，不需要過度焦慮。`;
  }
  return '';
}

/* ============================================================
   7. 飲食分析 analyzeNutrition（規則式 AI）
   ============================================================ */

function containsKeyword(text, keywords) {
  if (!text) return false;
  return keywords.some(k => text.indexOf(k) !== -1);
}
function isEmptyMeal(text) {
  if (!text) return true;
  const t = text.trim();
  return t === '' || t === '沒有' || t === '無' || t === '沒吃' || t === 'x' || t === 'X';
}

/*
   analyzeNutrition：回傳
   {
     risks: [風險字串...],
     student: 選手版建議,
     parent: 家長版建議,
     coach: 教練版觀察(陣列),
     nextGoal: 明日飲食小目標
   }
*/
function analyzeNutrition(data) {
  const { breakfast, lunch, dinner, snacksDrinks, waterIntake, lateNightSnack, trainingIntensity, bmi, weightKg } = data;
  const allFood = [breakfast, lunch, dinner, snacksDrinks].join(' ');

  const hasProtein = containsKeyword(allFood, NUTRITION_KEYWORDS.protein);
  const hasVegetable = containsKeyword(allFood, NUTRITION_KEYWORDS.vegetable);
  const hasStaple = containsKeyword(allFood, NUTRITION_KEYWORDS.staple);
  const hasSugary = containsKeyword(snacksDrinks, NUTRITION_KEYWORDS.sugaryDrink) || containsKeyword(allFood, NUTRITION_KEYWORDS.sugaryDrink);
  const hasFried = containsKeyword(allFood, NUTRITION_KEYWORDS.friedOily);
  const lowWater = (waterIntake === '少於 500ml' || waterIntake === '500-1000ml');
  const hasLateNight = lateNightSnack && lateNightSnack !== '無';
  const heavyLateNight = lateNightSnack === '有，偏多';
  const isHighIntensity = (trainingIntensity === '高' || trainingIntensity === '比賽日');
  const isRecoveryDay = (trainingIntensity === '恢復日');
  const noBreakfast = isEmptyMeal(breakfast);

  const risks = [];
  if (!hasProtein) risks.push('蛋白質不足');
  if (!hasVegetable) risks.push('蔬菜不足');
  if (lowWater) risks.push('水量不足');
  if (hasSugary) risks.push('含糖飲料偏多');
  if (heavyLateNight) risks.push('宵夜偏多');
  else if (hasLateNight) risks.push('宵夜風險');
  if (isHighIntensity && (!hasStaple || !hasProtein)) risks.push('訓練量高但飲食恢復不足');
  if (isHighIntensity && hasFried) risks.push('比賽／高強度前飲食偏油');
  if (isRecoveryDay && hasFried) risks.push('恢復日高熱量偏多');
  if (noBreakfast) risks.push('早餐不足');

  // ---- 選手版 ----
  const sParts = ['🍱 今日飲食建議', ''];
  if (isHighIntensity) sParts.push('你今天訓練量比較高，記得吃夠才有體力恢復。');
  if (!hasProtein) sParts.push('蛋白質稍微不足，建議補充：雞蛋、豆漿、雞肉、魚肉、豆腐。');
  if (!hasVegetable) sParts.push('蔬菜可以再多一點，幫助消化與恢復。');
  if (lowWater) sParts.push('今天水量偏少，明天訓練前記得先補水，避免體能下降。');
  if (hasSugary) sParts.push('含糖飲料可以慢慢減少，換成水或無糖飲品。');
  if (hasLateNight) sParts.push('睡前盡量少吃宵夜，讓身體好好恢復。');
  if (noBreakfast) sParts.push('早餐很重要，明天記得吃一份再來訓練。');
  if (sParts.length === 2) sParts.push('今天飲食大致均衡，繼續保持！');
  sParts.push('');
  sParts.push('記住：想變強，不只靠訓練，也靠吃對東西。');
  const student = sParts.join('\n');

  // ---- 家長版 ----
  const pParts = ['🍱 今日營養提醒', ''];
  if (isHighIntensity) pParts.push('孩子今日訓練量偏高，蛋白質與水分補充可以再加強。');
  else pParts.push('孩子今日的飲食狀況提供給您參考。');
  const proteinList = '蛋、魚、雞肉、豆腐、豆漿';
  if (!hasProtein || isHighIntensity) pParts.push(`建議晚餐可安排${proteinList}等優質蛋白，並增加蔬菜與水分。`);
  if (lowWater) pParts.push('今日水分偏少，可提醒孩子多喝水。');
  if (hasSugary) pParts.push('含糖飲料可適度減少，對訓練恢復更有幫助。');
  if (hasLateNight) pParts.push('睡前飲食可以再注意一下，幫助孩子睡眠與恢復。');
  pParts.push('');
  pParts.push('這不是要求孩子節食，而是幫助孩子恢復體能、穩定訓練狀態。');
  const parent = pParts.join('\n');

  // ---- 教練版（陣列，方便組裝） ----
  const coach = {
    intensity: trainingIntensity || '未填',
    weight: weightKg || '--',
    bmi: bmi !== null && bmi !== undefined ? bmi : '--',
    risks: risks.slice(),
    advice: isHighIntensity
      ? '明日提醒選手訓練後補充蛋白質與水分，避免恢復不足。'
      : '明日提醒選手維持均衡飲食，注意水分與蛋白質補充。'
  };

  // ---- 明日飲食小目標 ----
  let nextGoal = '維持均衡飲食，三餐定時。';
  if (lowWater) nextGoal = '訓練前補水，訓練後補充一份蛋白質。';
  else if (!hasProtein) nextGoal = '每餐加入一份蛋白質（蛋、豆漿、雞肉、魚或豆腐）。';
  else if (hasSugary) nextGoal = '把一杯含糖飲料換成水或無糖飲品。';
  else if (hasLateNight) nextGoal = '今晚減少宵夜，讓身體好好恢復。';

  return { risks, student, parent, coach, nextGoal };
}

/* ============================================================
   8. 上次表現回顧 / 今天我要改善
   ============================================================ */

// 從某筆紀錄取出六大面向平均
function aspectAvgFromRecord(rec) {
  const out = {};
  ASPECT_ORDER.forEach(k => {
    out[k] = parseFloat(rec[ASPECT_AVG_FIELD[k]]) || 0;
  });
  return out;
}

// 解析 lowItems 欄位（字串）成陣列文字
function parseLowItems(rec) {
  // 優先用 rawScoresJson 重新計算，否則用 lowItems 文字
  try {
    if (rec.rawScoresJson) {
      const scores = JSON.parse(rec.rawScoresJson);
      const low = findLowItems(scores);
      if (low.length) return low.map(l => `${l.item}：${l.score} 分`);
    }
  } catch (e) { /* ignore */ }
  if (rec.lowItems) return String(rec.lowItems).split('｜').filter(Boolean);
  return [];
}

// 顯示上次表現回顧卡片（在學生填寫頁）
function renderLastReview(rec, containerId, cardId) {
  const content = $id(containerId);
  const card = cardId ? $id(cardId) : null;

  if (!rec) {
    content.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。</div>`;
    if (card) card.style.display = 'block';
    renderImproveOptions([]); // 沒有上次 -> 顯示六大面向
    return;
  }

  const avg = aspectAvgFromRecord(rec);
  const lowItems = parseLowItems(rec);
  const nutritionRisks = rec.nutritionRisks || '無明顯風險';
  const status = rec.status || judgeStatus(parseFloat(rec.averageScore) || 0);

  // 今日提醒：用最低項組合 suggestionMap
  const remind = buildRemindText(lowItems);

  let html = '';
  html += `<div class="review-row"><span class="review-label">上次日期</span><span class="review-value">${dateSlash(rec.date)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${rec.totalScore} / 30</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${status}</span></div>`;

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">六大面向</h4><div class="aspect-grid">`;
  ASPECT_ORDER.forEach(k => {
    html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`;
  });
  html += `</div>`;

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次身體狀態</h4>`;
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;
  html += `<div class="review-row"><span class="review-label">飲食風險</span><span class="review-value">${nutritionRisks}</span></div>`;

  if (lowItems.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次最低三項</h4><div>`;
    lowItems.forEach((s, i) => html += `<span class="tag tag-red">${i + 1}. ${s}</span>`);
    html += `</div>`;
  }

  html += `<div class="hint-box">📣 教練提醒：${remind}</div>`;

  content.innerHTML = html;
  if (card) card.style.display = 'block';

  // 今天我要改善：帶入上次最低三項
  renderImproveOptions(lowItems.map(s => s.split('：')[0]));
}

// 從最低項組合「今日提醒」文字
function buildRemindText(lowItems) {
  if (!lowItems || !lowItems.length) return '今天維持狀態，把每個動作做確實，就是進步。';
  const names = lowItems.map(s => s.split('：')[0]);
  const reminds = [];
  names.forEach(n => { if (suggestionMap[n]) reminds.push(suggestionMap[n].remind); });
  const top = names.slice(0, 2).join('」和「');
  let text = `昨天不是你不努力，而是「${top}」還需要更穩。`;
  if (reminds.length) text += ' ' + reminds[0];
  text += ' 今天訓練不要急著硬打，先把基本動作與距離做好。';
  return text;
}

// 渲染「今天我要改善」勾選項
function renderImproveOptions(itemNames) {
  const box = $id('improveOptions');
  let options = itemNames;
  if (!options || !options.length) {
    // 沒有上次紀錄 -> 顯示六大面向
    options = ASPECT_ORDER.map(k => KPI_ASPECTS[k].label);
  }
  box.innerHTML = '';
  options.forEach((name, i) => {
    const id = `improve-${i}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${name}" id="${id}"> ${name}`;
    box.appendChild(label);
  });
  $id('improveCard').style.display = 'block';
}

function getCheckedImproveTargets() {
  return Array.from(document.querySelectorAll('#improveOptions input:checked')).map(c => c.value);
}

/* ============================================================
   9. 取得上一筆紀錄（正式或本機）
   ============================================================ */

// 從本機紀錄取某選手最近一筆
function localLastRecord(name) {
  const recs = getLocalRecords().filter(r => r.name === name);
  if (!recs.length) return null;
  // 依 timestamp / date 排序
  recs.sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
  return recs[0];
}
function localRecentRecords(name, limit) {
  const recs = getLocalRecords().filter(r => r.name === name);
  recs.sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
  return recs.slice(0, limit || 7);
}

// 取得上一筆（先試正式 Web App，失敗或無 URL 則用本機）
async function fetchLastRecord(name) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getLastRecordByName', name: name });
      if (res && res.ok) return res.data; // data 可能是 null
    } catch (e) { /* 落回本機 */ }
  }
  return localLastRecord(name);
}

/* ============================================================
   9.5 交叉辯論：更新紀錄 / 計算透明化 / 自評vs教練評
   ============================================================ */

// 更新某筆紀錄欄位（正式優先，本機同步；無 URL 則只更新本機）
async function updateRecordRemote(recordId, fields) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'updateRecord', recordId: recordId, fields: fields });
      if (res && res.ok) { updateLocalRecordFields(recordId, fields); return true; }
    } catch (e) { /* 落回本機 */ }
  }
  return updateLocalRecordFields(recordId, fields);
}
function updateLocalRecordFields(recordId, fields) {
  const arr = getLocalRecords();
  const r = arr.find(x => String(x.recordId) === String(recordId));
  if (r) { Object.assign(r, fields); localStorage.setItem(LS_KEYS.localRecords, JSON.stringify(arr)); return true; }
  return false;
}

// 是否已有教練複評
function hasCoachReview(rec) {
  return rec && rec.coachAverageScore !== undefined && rec.coachAverageScore !== null && String(rec.coachAverageScore) !== '';
}

// 從紀錄取教練六大面向
function coachAspectAvgFromRecord(rec) {
  const out = {};
  ASPECT_ORDER.forEach(k => out[k] = parseFloat(rec[COACH_ASPECT_FIELD[k]]) || 0);
  return out;
}

/* ---- 計算透明化：為什麼是這個燈號（native <details>，免額外 JS） ---- */
function explainStatusFromRecord(rec) {
  let scores = {};
  try { scores = JSON.parse(rec.rawScoresJson || '{}'); } catch (e) { /* */ }
  const avg = aspectAvgFromRecord(rec);
  const lowAspects = ASPECT_ORDER.filter(k => avg[k] < 3).map(k => `${KPI_ASPECTS[k].label}（${avg[k]}）`);
  const low = findLowItems(scores);

  let inner = '';
  inner += `<div class="explain-line">平均 <b>${rec.averageScore}</b> ＝ 總分 <b>${rec.totalScore}</b> ÷ 6</div>`;
  inner += `<div class="explain-line">門檻：平均 ≥ 4.0 🟢　≥ 3.0 🟡　&lt; 3.0 🔴</div>`;
  if (lowAspects.length) inner += `<div class="explain-line">拉低的面向：${lowAspects.join('、')}</div>`;
  if (low.length) inner += `<div class="explain-line">最低細項：${low.map(l => `${l.item} ${l.score}分`).join('、')}</div>`;
  inner += `<div class="explain-line" style="color:var(--text-soft)">每一面向＝該面向 5 個細項平均；六面向平均加總＝總分（滿分 30）。</div>`;

  return `<details class="explain"><summary>🔎 為什麼是「${rec.status}」？</summary><div class="explain-body">${inner}</div></details>`;
}

/* ---- 自評 vs 教練評對照 ---- */
function renderSelfVsCoach(rec) {
  if (!hasCoachReview(rec)) return '';
  const self = aspectAvgFromRecord(rec);
  const coach = coachAspectAvgFromRecord(rec);

  let html = `<h4 style="margin:12px 0 6px;color:var(--blue)">⚖️ 自評 vs 教練評</h4>`;
  html += `<div class="table-scroll"><table class="record-table"><thead><tr><th>面向</th><th>自評</th><th>教練</th><th>差距</th></tr></thead><tbody>`;
  let bigGap = [];
  ASPECT_ORDER.forEach(k => {
    const s = self[k], c = coach[k];
    const gap = round1(c - s);
    let cls = 'tag-yellow';
    if (gap > 0) cls = 'tag-green'; else if (gap < 0) cls = 'tag-red';
    const flag = Math.abs(gap) >= 1 ? ' 💬' : '';
    if (Math.abs(gap) >= 1) bigGap.push(KPI_ASPECTS[k].label);
    html += `<tr><td>${KPI_ASPECTS[k].label}</td><td>${s}</td><td>${c}</td><td><span class="tag ${cls}">${gap > 0 ? '+' : ''}${gap}${flag}</span></td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="review-row"><span class="review-label">教練總分</span><span class="review-value">${rec.coachTotalScore} / 30（${rec.coachStatus || '-'}）</span></div>`;
  if (rec.coachComment) html += `<div class="hint-box">📣 教練評語：${escapeHtml(rec.coachComment)}</div>`;
  if (bigGap.length) html += `<div class="hint-box warn">💬 「${bigGap.join('、')}」你和教練看法差距較大，值得一起討論。<br><span style="color:var(--text-soft)">這裡是讓你說明想法，不是改分數，最終由教練綜合判斷。</span></div>`;
  return html;
}

// 簡單 HTML 跳脫，避免使用者輸入破壞版面
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   10. 送出流程
   ============================================================ */

// 表單驗證
function validateForm() {
  const required = [
    ['name', '選手姓名'], ['gradeClass', '年級／班級'], ['group', '組別'],
    ['trainingTopic', '今日訓練主題'], ['reflection', '今日心得'], ['tomorrowGoal', '明日目標'],
    ['heightCm', '身高'], ['weightKg', '今日體重'],
    ['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'],
    ['waterIntake', '今日水量'], ['trainingIntensity', '今日訓練強度']
  ];
  for (const [id, label] of required) {
    const v = $id(id).value;
    if (!v || !String(v).trim()) { toast(`請填寫：${label}`); $id(id).focus(); return false; }
  }
  const h = parseFloat($id('heightCm').value);
  if (h < 100 || h > 220) { toast('身高似乎不合理，請確認（100–220 cm）'); $id('heightCm').focus(); return false; }
  const w = parseFloat($id('weightKg').value);
  if (w < 25 || w > 150) { toast('體重似乎不合理，請確認（25–150 kg）'); $id('weightKg').focus(); return false; }
  return true;
}

// 收集整筆紀錄物件
function buildRecord() {
  const { scores, aspectAvg } = collectScores();
  const { total, average } = computeTotals(aspectAvg);
  const status = judgeStatus(average);
  const lowItems = findLowItems(scores);
  const lowItemsStr = lowItems.map(l => `${l.item}：${l.score} 分`).join('｜');

  const heightCm = $id('heightCm').value;
  const weightKg = $id('weightKg').value;
  const targetWeightKg = $id('targetWeightKg').value;
  const bmi = computeBmi(heightCm, weightKg);
  const weightGap = computeWeightGap(weightKg, targetWeightKg);

  const nutritionInput = {
    breakfast: $id('breakfast').value,
    lunch: $id('lunch').value,
    dinner: $id('dinner').value,
    snacksDrinks: $id('snacksDrinks').value,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    bmi: bmi, weightKg: weightKg
  };
  const nutrition = analyzeNutrition(nutritionInput);

  const improveTargets = getCheckedImproveTargets().join('｜');
  const mainGoalToday = $id('mainGoalToday').value;

  const rec = {
    recordId: 'r' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    timestamp: new Date().toISOString(),
    date: $id('date').value || todayStr(),
    name: $id('name').value,
    gradeClass: $id('gradeClass').value,
    group: $id('group').value,
    trainingTopic: $id('trainingTopic').value,
    bodyStatus: $id('bodyStatus').value,
    heightCm: heightCm,
    weightKg: weightKg,
    targetWeightKg: targetWeightKg,
    bmi: bmi,
    weightGap: weightGap,
    breakfast: $id('breakfast').value,
    lunch: $id('lunch').value,
    dinner: $id('dinner').value,
    snacksDrinks: $id('snacksDrinks').value,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    physicalAvg: aspectAvg.physical,
    technicalAvg: aspectAvg.technical,
    focusAvg: aspectAvg.focus,
    disciplineAvg: aspectAvg.discipline,
    emotionAvg: aspectAvg.emotion,
    tacticalAvg: aspectAvg.tactical,
    totalScore: total,
    averageScore: average,
    status: status,
    lowItems: lowItemsStr,
    improveTargets: improveTargets,
    mainGoalToday: mainGoalToday,
    reflection: $id('reflection').value,
    tomorrowGoal: $id('tomorrowGoal').value,
    encouragementToTeammate: $id('encouragementToTeammate').value,
    nutritionRisks: nutrition.risks.join('、') || '無明顯風險',
    nutritionAdviceStudent: nutrition.student,
    nutritionAdviceParent: nutrition.parent,
    nutritionAdviceCoach: JSON.stringify(nutrition.coach),
    rawScoresJson: JSON.stringify(scores),
    rawNutritionJson: JSON.stringify(nutrition)
  };

  // 產生 LINE 四版本（需要上一筆做比較，稍後在 submit 時補上）
  rec._lowItemsArr = lowItems;
  rec._aspectAvg = aspectAvg;
  rec._nutrition = nutrition;
  return rec;
}

// 主送出函式
async function doSubmit(mode) {
  if (!validateForm()) return;

  if (mode === 'official' && !getWebAppUrl()) {
    toast('請先到「系統設定」貼上 Google Apps Script Web App URL。');
    switchTab('settings');
    return;
  }

  const rec = buildRecord();

  // 取得上一筆做比較
  const last = await fetchLastRecord(rec.name);

  // 體重變化提醒
  let weightNote = '';
  if (last) weightNote = weightChangeNote(rec.weightKg, last.weightKg);

  // 產生 LINE 文字
  const lineTexts = buildLineTexts(rec, weightNote);
  rec.studentLineText = lineTexts.student;
  rec.parentLineText = lineTexts.parent;
  rec.coachLineText = lineTexts.coach;
  rec.nutritionLineText = lineTexts.nutrition;

  // 移除暫存欄位再送出
  const payload = Object.assign({}, rec);
  delete payload._lowItemsArr; delete payload._aspectAvg; delete payload._nutrition;

  if (mode === 'official') {
    toast('送出中...');
    try {
      const res = await postToWebApp({ action: 'addRecord', payload: payload });
      if (res && res.ok) toast('✅ 已送出到 Google Sheet');
      else toast('⚠️ 送出失敗：' + (res && res.error ? res.error : '未知錯誤'));
    } catch (e) {
      toast('⚠️ 送出失敗，請檢查網路與 Web App 設定');
    }
    // 同時也存一份本機，方便離線查看
    saveLocalRecord(payload);
  } else {
    saveLocalRecord(payload);
    toast('💾 已存入本機測試資料');
  }

  // 顯示三張回饋卡
  renderCompareCard(rec, last);
  renderNutritionCard(rec);
  renderLineCard(lineTexts);

  // 捲動到比較卡
  $id('compareCard').scrollIntoView({ behavior: 'smooth' });
}

/* ---- 今日 vs 上次 ---- */
function renderCompareCard(rec, last) {
  const card = $id('compareCard');
  const box = $id('compareContent');
  if (!last) {
    box.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。下一次就能看到進步比較了！</div>`;
    card.style.display = 'block';
    return;
  }

  const lastTotal = parseFloat(last.totalScore) || 0;
  const diff = round1(rec.totalScore - lastTotal);
  const lastAvg = aspectAvgFromRecord(last);

  // 各面向差異
  const aspectDiffs = ASPECT_ORDER.map(k => ({
    label: KPI_ASPECTS[k].label,
    diff: round1(rec._aspectAvg[k] - lastAvg[k])
  }));
  const sortedUp = aspectDiffs.slice().sort((a, b) => b.diff - a.diff);
  const bestUp = sortedUp[0];
  const worstDown = sortedUp[sortedUp.length - 1];

  let html = '';
  html += `<div class="review-row"><span class="review-label">今日總分</span><span class="review-value">${rec.totalScore}</span></div>`;
  html += `<div class="review-row"><span class="review-label">上次總分</span><span class="review-value">${lastTotal}</span></div>`;
  const diffTag = diff >= 0 ? `<span class="tag tag-green">${diff >= 0 ? '+' : ''}${diff}</span>` : `<span class="tag tag-red">${diff}</span>`;
  html += `<div class="review-row"><span class="review-label">總分差異</span><span class="review-value">${diffTag}</span></div>`;

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">六大面向差異</h4><div class="aspect-grid">`;
  aspectDiffs.forEach(a => {
    const cls = a.diff > 0 ? 'tag-green' : (a.diff < 0 ? 'tag-red' : 'tag-yellow');
    const sign = a.diff > 0 ? '+' : '';
    html += `<div class="aspect-cell">${a.label}<br><span class="tag ${cls}">${sign}${a.diff}</span></div>`;
  });
  html += `</div>`;

  if (bestUp.diff > 0) html += `<div class="hint-box good">📈 進步最多：${bestUp.label} +${bestUp.diff}</div>`;
  if (worstDown.diff < 0) html += `<div class="hint-box warn">📉 需要注意：${worstDown.label} ${worstDown.diff}</div>`;

  // 體重變化
  const wDiff = round1(parseFloat(rec.weightKg) - parseFloat(last.weightKg));
  if (!isNaN(wDiff)) {
    const dir = wDiff < 0 ? `下降 ${Math.abs(wDiff)}` : (wDiff > 0 ? `上升 ${wDiff}` : '持平');
    html += `<div class="hint-box">⚖️ 體重變化：${last.weightKg} kg → ${rec.weightKg} kg，${dir} kg</div>`;
    const note = weightChangeNote(rec.weightKg, last.weightKg);
    if (note) html += `<div class="hint-box warn">${note}</div>`;
  }

  // 鼓勵語
  let encourage;
  if (diff > 0) encourage = '今天你有明顯進步，代表你不是只會填表，而是真的有把昨天的問題帶進今天訓練裡修正。繼續保持。';
  else if (diff === 0) encourage = '今天和上次差不多，穩定也是一種實力。明天再挑一個重點突破。';
  else encourage = '今天分數稍微低一點沒關係，重要的是你有持續紀錄與面對。明天帶著一個目標進場，就會不一樣。';
  html += `<div class="hint-box good">💪 ${encourage}</div>`;

  box.innerHTML = html;
  card.style.display = 'block';
}

/* ---- 飲食回饋卡 ---- */
function renderNutritionCard(rec) {
  const card = $id('nutritionCard');
  const box = $id('nutritionContent');
  const n = rec._nutrition;
  const gap = rec.weightGap;
  let gapText = '--';
  if (gap !== null && gap !== undefined) {
    if (gap > 0) gapText = `還有 ${gap} kg`;
    else if (gap < 0) gapText = `已低於目標 ${Math.abs(gap)} kg`;
    else gapText = '已達目標';
  }

  let html = '';
  html += `<div class="review-row"><span class="review-label">今日體重</span><span class="review-value">${rec.weightKg} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi}</span></div>`;
  html += `<div class="review-row"><span class="review-label">距離目標體重</span><span class="review-value">${gapText}</span></div>`;

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">今日觀察</h4><div>`;
  if (n.risks.length) n.risks.forEach(r => html += `<span class="tag tag-orange">${r}</span>`);
  else html += `<span class="tag tag-green">飲食大致均衡</span>`;
  html += `</div>`;

  html += `<div class="hint-box">${n.student.replace(/\n/g, '<br>')}</div>`;
  html += `<div class="hint-box good">🎯 明日飲食小目標：${n.nextGoal}</div>`;

  // 青少年提醒
  if (rec.bmi && parseFloat(rec.bmi) >= 27) {
    html += `<div class="hint-box warn">提醒：青少年選手不需要過度減重，重點放在訓練恢復與健康習慣。若有需要，請教練與家長一起關心。</div>`;
  }

  box.innerHTML = html;
  card.style.display = 'block';
}

/* ---- LINE 四版本卡 ---- */
function renderLineCard(lineTexts) {
  $id('lineStudent').textContent = lineTexts.student;
  $id('lineParent').textContent = lineTexts.parent;
  $id('lineCoach').textContent = lineTexts.coach;
  $id('lineNutrition').textContent = lineTexts.nutrition;
  $id('lineCard').style.display = 'block';
}

/* ============================================================
   產生 LINE 四版本文字
   ============================================================ */
function buildLineTexts(rec, weightNote) {
  const lowArr = rec._lowItemsArr || [];
  const lowLines = lowArr.map((l, i) => `${i + 1}. ${l.item}：${l.score} 分`).join('\n');
  const remind = buildRemindText(lowArr.map(l => `${l.item}：${l.score} 分`));
  const n = rec._nutrition;

  // 選手版
  const studentLine =
`🥋 育林國中跆拳道隊｜每日 KPI 回饋

姓名：${rec.name}
日期：${dateSlash(rec.date)}
今日狀態：${rec.status}
今日總分：${rec.totalScore} / 30
平均分數：${rec.averageScore} / 5

今天最低三項：

${lowLines || '今天沒有低於 3 分的項目，表現很穩！'}

今天提醒：

${remind}

🍱 今日飲食提醒：

${shortNutrition(n)}

明日目標：

${rec.tomorrowGoal || '把今天的重點再做穩一點。'}

教練相信你，只要願意修正，就一定會進步。`;

  // 家長版
  const topTwo = lowArr.slice(0, 2).map(l => l.item).join('」與「');
  const parentLine =
`🥋 育林國中跆拳道隊｜今日訓練回饋

孩子今日訓練狀態${statusWord(rec.status)}${topTwo ? `，主要需要加強「${topTwo}」` : '，整體表現穩定'}。

教練明天會協助孩子針對訓練方向調整，請家長不用擔心。這份紀錄的重點不是看分數高低，而是讓孩子知道自己哪裡可以進步。

${n.parent}
${weightNote ? '\n⚖️ ' + weightNote + '\n' : ''}
只要願意每天修正一點，孩子的穩定度就會慢慢提升。`;

  // 教練版
  const aspectLines = ASPECT_ORDER.map(k => `${KPI_ASPECTS[k].label}：${rec._aspectAvg[k]}`).join('\n');
  const coachAdvice = lowArr.length
    ? `明日安排「${lowArr.map(l => l.item).join('、')}」個別修正。`
    : '明日維持訓練節奏，挑戰更高目標。';
  const coachLine =
`📊 育林國中跆拳道隊｜KPI 教練紀錄

姓名：${rec.name}
日期：${dateSlash(rec.date)}
組別：${rec.group}
狀態：${rec.status}
總分：${rec.totalScore} / 30
平均：${rec.averageScore} / 5

六大面向：

${aspectLines}

最低三項：

${lowLines || '無'}

建議處理：

${coachAdvice}

🍱 飲食觀察：

今日訓練強度：${rec.trainingIntensity}
體重：${rec.weightKg} kg
BMI：${rec.bmi}

飲食問題：

${n.risks.length ? n.risks.map((r, i) => `${i + 1}. ${r}`).join('\n') : '無明顯風險'}

建議：

${n.coach.advice}${weightNote ? '\n\n⚖️ ' + weightNote : ''}`;

  // 純飲食版
  const nutritionLine =
`🍱 育林國中跆拳道隊｜今日飲食建議

姓名：${rec.name}
日期：${dateSlash(rec.date)}
訓練強度：${rec.trainingIntensity}
體重：${rec.weightKg} kg ／ BMI：${rec.bmi}

飲食風險：
${n.risks.length ? n.risks.map(r => '・' + r).join('\n') : '・無明顯風險'}

${n.student}

🎯 明日飲食小目標：
${n.nextGoal}`;

  return { student: studentLine, parent: parentLine, coach: coachLine, nutrition: nutritionLine };
}

function statusWord(status) {
  if (status.indexOf('紅') !== -1) return '稍微偏低';
  if (status.indexOf('黃') !== -1) return '中等';
  return '良好';
}
function shortNutrition(n) {
  if (!n.risks.length) return '今天飲食大致均衡，繼續保持！';
  const parts = [];
  if (n.risks.indexOf('水量不足') !== -1) parts.push('今天水量偏少');
  if (n.risks.indexOf('蛋白質不足') !== -1) parts.push('蛋白質可以再補一點');
  if (parts.length) return parts.join('，') + '。明天訓練前先補水，訓練後補充一份蛋白質，身體恢復會更好。';
  return '今天有幾項可以加強：' + n.risks.join('、') + '。明天再注意一下，恢復會更好。';
}

/* ============================================================
   11. 教練後台
   ============================================================ */

// 取得所有紀錄（正式優先，否則本機）
async function fetchAllRecords() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAllRecords' });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { /* 落回本機 */ }
  }
  return getLocalRecords();
}

async function refreshCoach() {
  toast('讀取資料中...');
  const all = await fetchAllRecords();
  const filterDate = $id('coachDate').value;
  const statusFilter = $id('coachStatusFilter').value;

  // 今日（或選定日期）紀錄
  let todays = all.filter(r => r.date === filterDate);
  if (statusFilter !== 'all') todays = todays.filter(r => r.status === statusFilter);

  renderOverview(todays);
  renderStatusLists(todays);
  renderAnalysis(todays);
  renderCoachNutrition(todays, all);
  renderInterviewList(todays, all);
  toast('✅ 已更新');
}

function renderOverview(todays) {
  const box = $id('coachOverview');
  const count = todays.length;
  const avg = count ? round2(todays.reduce((s, r) => s + (parseFloat(r.averageScore) || 0), 0) / count) : 0;
  const red = todays.filter(r => r.status && r.status.indexOf('紅') !== -1).length;
  const yellow = todays.filter(r => r.status && r.status.indexOf('黃') !== -1).length;
  const green = todays.filter(r => r.status && r.status.indexOf('綠') !== -1).length;
  const weights = todays.map(r => parseFloat(r.weightKg)).filter(n => !isNaN(n));
  const avgWeight = weights.length ? round1(weights.reduce((a, b) => a + b, 0) / weights.length) : '--';
  const riskCount = todays.filter(r => r.nutritionRisks && r.nutritionRisks !== '無明顯風險').length;
  const lowWaterCount = todays.filter(r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml').length;

  const cells = [
    ['今日提交', count], ['全隊平均', avg], ['🔴 紅燈', red], ['🟡 黃燈', yellow],
    ['🟢 綠燈', green], ['平均體重', avgWeight + ' kg'], ['飲食風險', riskCount], ['水量不足', lowWaterCount]
  ];
  box.innerHTML = cells.map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');
}

function renderStatusLists(todays) {
  const box = $id('coachStatusLists');
  const groups = {
    '🔴 紅燈名單': todays.filter(r => r.status && r.status.indexOf('紅') !== -1),
    '🟡 黃燈名單': todays.filter(r => r.status && r.status.indexOf('黃') !== -1),
    '🟢 綠燈名單': todays.filter(r => r.status && r.status.indexOf('綠') !== -1)
  };
  let html = '';
  Object.keys(groups).forEach(title => {
    const list = groups[title];
    html += `<div class="list-block"><h4>${title}（${list.length}）</h4><div class="name-list">`;
    if (list.length) list.forEach(r => {
      const cls = title.indexOf('紅') !== -1 ? 'tag-red' : (title.indexOf('黃') !== -1 ? 'tag-yellow' : 'tag-green');
      html += `<span class="tag ${cls}">${r.name} (${r.averageScore})</span>`;
    });
    else html += '<span class="review-label">無</span>';
    html += `</div></div>`;
  });
  box.innerHTML = html;
}

function renderAnalysis(todays) {
  const box = $id('coachAnalysis');
  if (!todays.length) { box.innerHTML = '<div class="hint-box">今日尚無紀錄。</div>'; return; }

  // 統計所有低分細項
  const counter = {};
  todays.forEach(r => {
    try {
      const scores = JSON.parse(r.rawScoresJson || '{}');
      const low = findLowItems(scores);
      low.forEach(l => counter[l.item] = (counter[l.item] || 0) + 1);
    } catch (e) {
      (r.lowItems || '').split('｜').filter(Boolean).forEach(s => {
        const name = s.split('：')[0];
        counter[name] = (counter[name] || 0) + 1;
      });
    }
  });
  const sorted = Object.keys(counter).sort((a, b) => counter[b] - counter[a]).slice(0, 3);

  let html = '<h4>全隊最低三項（最多人偏弱）</h4><div class="name-list">';
  if (sorted.length) sorted.forEach((n, i) => html += `<span class="tag tag-red">${i + 1}. ${n}（${counter[n]} 人）</span>`);
  else html += '<span class="review-label">今日沒有明顯共同弱項，表現不錯！</span>';
  html += '</div>';

  if (sorted.length) {
    html += '<h4 style="margin-top:12px">明日訓練建議</h4>';
    sorted.forEach(n => {
      const s = suggestionMap[n];
      if (s) html += `<div class="hint-box"><b>${n}</b>：${s.advice}</div>`;
    });
  }
  box.innerHTML = html;
}

function renderCoachNutrition(todays, all) {
  const box = $id('coachNutrition');
  const riskList = todays.filter(r => r.nutritionRisks && r.nutritionRisks !== '無明顯風險');
  const lowWater = todays.filter(r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml');
  const lateNight = todays.filter(r => r.lateNightSnack && r.lateNightSnack !== '無');
  const highButLow = todays.filter(r => (r.trainingIntensity === '高' || r.trainingIntensity === '比賽日') && r.nutritionRisks && r.nutritionRisks.indexOf('恢復不足') !== -1);

  let html = '';
  html += nameListBlock('🍱 今日飲食風險名單', riskList.map(r => `${r.name}（${r.nutritionRisks}）`), 'tag-orange');
  html += nameListBlock('💧 水量不足名單', lowWater.map(r => r.name), 'tag-blue');
  html += nameListBlock('🌙 宵夜名單', lateNight.map(r => `${r.name}（${r.lateNightSnack}）`), 'tag-orange');
  html += nameListBlock('🔥 訓練強度高但飲食不足', highButLow.map(r => r.name), 'tag-red');

  box.innerHTML = html || '<div class="hint-box">今日尚無飲食紀錄。</div>';
}

function nameListBlock(title, names, cls) {
  let html = `<div class="list-block"><h4>${title}（${names.length}）</h4><div class="name-list">`;
  if (names.length) names.forEach(n => html += `<span class="tag ${cls}">${n}</span>`);
  else html += '<span class="review-label">無</span>';
  html += '</div></div>';
  return html;
}

// 建議晤談名單
function renderInterviewList(todays, all) {
  const box = $id('coachInterview');
  const reasons = {}; // name -> [reasons]
  function add(name, reason) {
    if (!reasons[name]) reasons[name] = [];
    if (reasons[name].indexOf(reason) === -1) reasons[name].push(reason);
  }

  todays.forEach(r => {
    if (r.status && r.status.indexOf('紅') !== -1) add(r.name, '今日紅燈');
    if (parseFloat(r.emotionAvg) < 3) add(r.name, '情緒控制偏低');
    if (parseFloat(r.disciplineAvg) < 3) add(r.name, '自律態度偏低');
    if ((r.trainingIntensity === '高' || r.trainingIntensity === '比賽日') && r.nutritionRisks && r.nutritionRisks.indexOf('恢復不足') !== -1) add(r.name, '高強度但飲食恢復不足');
  });

  // 跨多筆條件：連續兩筆黃/紅、連續兩筆宵夜偏多、連續兩筆水量不足、同細項連 3 筆低、體重單次變化 >1.5
  const byName = {};
  all.forEach(r => { (byName[r.name] = byName[r.name] || []).push(r); });
  Object.keys(byName).forEach(name => {
    const recs = byName[name].slice().sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);
    if (recs.length >= 2) {
      const a = recs[0], b = recs[1];
      const bad = s => s && (s.indexOf('黃') !== -1 || s.indexOf('紅') !== -1);
      if (bad(a.status) && bad(b.status)) add(name, '連續兩筆黃／紅燈');
      if (a.lateNightSnack === '有，偏多' && b.lateNightSnack === '有，偏多') add(name, '連續兩筆宵夜偏多');
      const lw = s => s === '少於 500ml' || s === '500-1000ml';
      if (lw(a.waterIntake) && lw(b.waterIntake)) add(name, '連續兩筆水量不足');
      const wDiff = Math.abs((parseFloat(a.weightKg) || 0) - (parseFloat(b.weightKg) || 0));
      if (wDiff > 1.5) add(name, `體重單次變化 ${round1(wDiff)} kg`);
    }
    // 同細項最近 3 筆都低於 3
    if (recs.length >= 3) {
      const last3 = recs.slice(0, 3);
      const itemLowCount = {};
      last3.forEach(r => {
        try {
          const scores = JSON.parse(r.rawScoresJson || '{}');
          ASPECT_ORDER.forEach(k => {
            Object.keys(scores[k] || {}).forEach(it => {
              if (scores[k][it] < 3) itemLowCount[it] = (itemLowCount[it] || 0) + 1;
            });
          });
        } catch (e) { /* ignore */ }
      });
      Object.keys(itemLowCount).forEach(it => {
        if (itemLowCount[it] >= 3) add(name, `「${it}」最近 3 筆都偏低`);
      });
    }
  });

  // 只顯示今日有出現或有跨筆問題的人
  const names = Object.keys(reasons);
  if (!names.length) { box.innerHTML = '<div class="hint-box good">目前沒有需要特別晤談的選手，狀況穩定。</div>'; return; }

  let html = '';
  names.forEach(name => {
    const rs = reasons[name];
    // 建議處理：抓該人今日最低項
    const todayRec = todays.find(r => r.name === name);
    let advice = '安排個別關心，了解狀況並給予鼓勵。';
    if (todayRec) {
      let low = [];
      try { low = findLowItems(JSON.parse(todayRec.rawScoresJson || '{}')); } catch (e) { /* */ }
      if (low.length) advice = `明日安排「${low.map(l => l.item).join('、')}」個別修正，並提醒訓練後補水與蛋白質補充。`;
    }
    html += `<div class="interview-item"><div class="nm">${name}</div>
      <div style="margin:6px 0"><b>原因：</b>${rs.join('；')}</div>
      <div><b>建議：</b>${advice}</div></div>`;
  });
  box.innerHTML = html;
}

// 個人查詢最近 7 筆
async function loadPersonRecords() {
  const name = $id('coachPersonName').value;
  if (!name) { toast('請選擇選手'); return; }
  let recs;
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getRecentRecordsByName', name: name, limit: 7 });
      recs = (res && res.ok && Array.isArray(res.data)) ? res.data : localRecentRecords(name, 7);
    } catch (e) { recs = localRecentRecords(name, 7); }
  } else {
    recs = localRecentRecords(name, 7);
  }

  const box = $id('coachPersonResult');
  if (!recs.length) { box.innerHTML = '<div class="hint-box">查無紀錄。</div>'; return; }

  let html = '<div class="table-scroll"><table class="record-table"><thead><tr>' +
    '<th>日期</th><th>總分</th><th>平均</th><th>狀態</th><th>體重</th><th>BMI</th><th>飲食風險</th><th>最低三項</th>' +
    '</tr></thead><tbody>';
  recs.forEach(r => {
    html += `<tr>
      <td>${dateSlash(r.date)}</td><td>${r.totalScore}</td><td>${r.averageScore}</td>
      <td>${r.status}</td><td>${r.weightKg}</td><td>${r.bmi}</td>
      <td>${r.nutritionRisks || '-'}</td><td>${(r.lowItems || '-').replace(/｜/g, '<br>')}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  // 六大面向趨勢（文字）
  html += '<h4 style="margin-top:14px">六大面向趨勢（新→舊）</h4><div class="table-scroll"><table class="record-table"><thead><tr><th>日期</th>';
  ASPECT_ORDER.forEach(k => html += `<th>${KPI_ASPECTS[k].label}</th>`);
  html += '</tr></thead><tbody>';
  recs.forEach(r => {
    html += `<tr><td>${dateSlash(r.date)}</td>`;
    ASPECT_ORDER.forEach(k => html += `<td>${r[ASPECT_AVG_FIELD[k]] || '-'}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // ---- 評分與對話（交叉辯論）：每筆一張卡 ----
  html += '<h4 style="margin-top:16px">✍️ 評分與對話</h4>';
  recs.forEach(r => html += renderCoachReviewBlock(r));

  box.innerHTML = html;

  // 綁定每張卡的事件
  recs.forEach(r => wireCoachReviewBlock(r));
}

// 教練評分／回覆卡片
function renderCoachReviewBlock(rec) {
  if (!rec.recordId) {
    return `<div class="card" style="margin-bottom:10px"><b>${dateSlash(rec.date)}</b>　<span class="review-label">舊紀錄，無法評分／回覆</span></div>`;
  }
  const self = aspectAvgFromRecord(rec);
  const coach = hasCoachReview(rec) ? coachAspectAvgFromRecord(rec) : null;

  let html = `<div class="review-card" data-rid="${rec.recordId}">`;
  html += `<div class="review-row"><span class="review-label">${dateSlash(rec.date)}</span><span class="review-value">${rec.status}　${rec.totalScore}/30</span></div>`;

  // 計算透明化
  html += explainStatusFromRecord(rec);
  // 自評 vs 教練評（已評過才顯示）
  html += renderSelfVsCoach(rec);

  // 選手的看法
  if (rec.studentResponse) html += `<div class="hint-box">💬 選手的看法：${escapeHtml(rec.studentResponse)}</div>`;

  // 教練評分表單
  html += `<details class="explain"${coach ? '' : ' open'}><summary>✍️ ${coach ? '修改' : '填寫'}教練評分</summary><div class="explain-body">`;
  ASPECT_ORDER.forEach(k => {
    const def = coach ? coach[k] : Math.round(self[k]);
    html += `<div class="kpi-item" style="border:none;padding:6px 0">
      <div class="kpi-item-row"><span class="kpi-item-name">${KPI_ASPECTS[k].label}<span style="color:var(--text-soft)">（自評 ${self[k]}）</span></span>
      <span class="kpi-item-score" id="crvlbl-${rec.recordId}-${k}">${def}</span></div>
      <input type="range" min="1" max="5" step="0.5" value="${def}" class="kpi-slider coach-review-slider"
             data-rid="${rec.recordId}" data-aspect="${k}" id="crv-${rec.recordId}-${k}" />
    </div>`;
  });
  html += `<label class="field-label">教練評語</label>
    <textarea class="text-input" id="crvcomment-${rec.recordId}" rows="2" placeholder="給這位選手的話…">${escapeHtml(rec.coachComment || '')}</textarea>
    <button type="button" class="btn btn-primary" data-save-review="${rec.recordId}" style="margin-top:8px">💾 儲存教練評分</button>`;
  html += `</div></details>`;

  // 回覆選手
  html += `<label class="field-label">💬 回覆選手</label>
    <textarea class="text-input" id="creply-${rec.recordId}" rows="2" placeholder="回應選手的看法…">${escapeHtml(rec.coachReply || '')}</textarea>
    <button type="button" class="btn btn-secondary" data-send-reply="${rec.recordId}" style="margin-top:8px">📨 送出回覆</button>`;

  html += `</div>`;
  return html;
}

// 綁定教練評分卡事件
function wireCoachReviewBlock(rec) {
  if (!rec.recordId) return;
  // 拉桿即時更新數字
  ASPECT_ORDER.forEach(k => {
    const s = $id(`crv-${rec.recordId}-${k}`);
    if (s) s.addEventListener('input', () => { $id(`crvlbl-${rec.recordId}-${k}`).textContent = s.value; });
  });
  // 儲存評分
  const saveBtn = document.querySelector(`[data-save-review="${rec.recordId}"]`);
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const fields = {};
    let total = 0;
    ASPECT_ORDER.forEach(k => {
      const v = parseFloat($id(`crv-${rec.recordId}-${k}`).value) || 0;
      fields[COACH_ASPECT_FIELD[k]] = v; total += v;
    });
    fields.coachTotalScore = round2(total);
    fields.coachAverageScore = round2(total / 6);
    fields.coachStatus = judgeStatus(total / 6);
    fields.coachComment = $id(`crvcomment-${rec.recordId}`).value.trim();
    saveBtn.disabled = true; saveBtn.textContent = '儲存中...';
    const ok = await updateRecordRemote(rec.recordId, fields);
    saveBtn.disabled = false; saveBtn.textContent = '💾 儲存教練評分';
    toast(ok ? '✅ 已儲存教練評分' : '⚠️ 儲存失敗');
    if (ok) loadPersonRecords(); // 重新整理以顯示對照
  });
  // 送出回覆
  const replyBtn = document.querySelector(`[data-send-reply="${rec.recordId}"]`);
  if (replyBtn) replyBtn.addEventListener('click', async () => {
    const text = $id(`creply-${rec.recordId}`).value.trim();
    replyBtn.disabled = true; replyBtn.textContent = '送出中...';
    const ok = await updateRecordRemote(rec.recordId, { coachReply: text });
    replyBtn.disabled = false; replyBtn.textContent = '📨 送出回覆';
    toast(ok ? '✅ 已送出回覆，選手在「上次表現」看得到' : '⚠️ 送出失敗');
  });
}

/* ============================================================
   12. 上次表現分頁
   ============================================================ */
async function loadLastPerfPage() {
  const name = $id('lastPerfName').value;
  if (!name) { toast('請選擇選手'); return; }
  const rec = await fetchLastRecord(name);
  const card = $id('lastPerfResultCard');
  const box = $id('lastPerfResult');
  if (!rec) {
    box.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。</div>`;
    card.style.display = 'block';
    return;
  }
  // 重用回顧渲染（但不影響填寫頁的改善區）
  renderLastReviewInto(rec, box);
  card.style.display = 'block';
}

function renderLastReviewInto(rec, box) {
  const avg = aspectAvgFromRecord(rec);
  const lowItems = parseLowItems(rec);
  let html = `<h3 class="card-title">📌 上次表現回顧</h3>`;
  html += `<div class="review-row"><span class="review-label">上次日期</span><span class="review-value">${dateSlash(rec.date)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${rec.totalScore} / 30</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${rec.status}</span></div>`;
  html += `<div class="aspect-grid" style="margin-top:10px">`;
  ASPECT_ORDER.forEach(k => html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`);
  html += `</div>`;
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;
  html += `<div class="review-row"><span class="review-label">飲食風險</span><span class="review-value">${rec.nutritionRisks || '無'}</span></div>`;
  if (lowItems.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次最低三項</h4><div>`;
    lowItems.forEach((s, i) => html += `<span class="tag tag-red">${i + 1}. ${s}</span>`);
    html += `</div>`;
  }
  html += `<div class="hint-box">📣 ${buildRemindText(lowItems)}</div>`;

  // 計算透明化
  html += explainStatusFromRecord(rec);

  // 自評 vs 教練評
  html += renderSelfVsCoach(rec);

  if (rec.reflection) html += `<div class="hint-box">📝 上次心得：${escapeHtml(rec.reflection)}</div>`;
  if (rec.tomorrowGoal) html += `<div class="hint-box good">🎯 上次明日目標：${escapeHtml(rec.tomorrowGoal)}</div>`;

  // 選手回應欄（交叉辯論）
  if (rec.recordId) {
    if (rec.coachReply) html += `<div class="hint-box good">💬 教練回覆你：${escapeHtml(rec.coachReply)}</div>`;
    html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💬 我對這筆的看法</h4>`;
    html += `<textarea id="studentResponseBox" class="text-input" rows="2" placeholder="例如：核心穩定我覺得不只 2 分，因為今天…">${escapeHtml(rec.studentResponse || '')}</textarea>`;
    html += `<button type="button" id="btnSendStudentResponse" class="btn btn-secondary" style="margin-top:8px">📨 送出我的看法</button>`;
    html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:6px">這裡是讓你說明想法，幫助教練了解你，不是用來改分數。</div>`;
  } else {
    html += `<div class="hint-box" style="color:var(--text-soft)">這是較早的紀錄，無法回應（新版紀錄才支援交叉辯論）。</div>`;
  }

  box.innerHTML = html;

  // 綁定送出看法
  const btn = $id('btnSendStudentResponse');
  if (btn) {
    btn.addEventListener('click', async () => {
      const text = $id('studentResponseBox').value.trim();
      btn.disabled = true; btn.textContent = '送出中...';
      const ok = await updateRecordRemote(rec.recordId, { studentResponse: text });
      btn.disabled = false; btn.textContent = '📨 送出我的看法';
      toast(ok ? '✅ 已送出你的看法，教練會看到' : '⚠️ 送出失敗，請稍後再試');
    });
  }
}

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

  $id('btnResetPlayers').addEventListener('click', () => {
    savePlayers(DEFAULT_PLAYERS.slice());
    renderPlayerList(); refreshNameSelects();
    syncRosterAndToast('已恢復預設名單');
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

  // 設定教練密碼（= 後端 ADMIN_KEY）
  const setPwdBtn = $id('btnSetCoachPwd');
  if (setPwdBtn) setPwdBtn.addEventListener('click', async () => {
    const np = $id('newCoachPwd').value.trim();
    const st = $id('coachPwdStatus');
    if (!np) { st.className = 'conn-status fail'; st.textContent = '請輸入新密碼。'; return; }
    if (!getWebAppUrl()) { st.className = 'conn-status fail'; st.textContent = '尚未設定 Web App URL。'; return; }
    st.className = 'conn-status info'; st.textContent = '設定中...';
    try {
      // adminKey 用目前已知的密碼（第一次設定時後端尚無密碼，會放行）
      const res = await postToWebApp({ action: 'setLineConfig', adminKey: getLineAdminKey(), newAdminKey: np });
      if (res && res.ok) {
        saveLineAdminKey(np); // 記住，之後改設定/同步名單才不會被擋
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error('回傳非 JSON：' + text.slice(0, 120)); }
}

/* ============================================================
   15. 分頁切換
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
}

/* ============================================================
   15.5 角色登入（選手／家長／教練）
   ------------------------------------------------------------
   純前端「軟性」分流：擋一般使用者亂逛，非真正帳號安全。
   教練密碼用後端 ADMIN_KEY 驗證；選手／家長選身分即可。
   ============================================================ */

const ROLE_KEY = 'yulin_role';

function getRole() {
  try { return JSON.parse(localStorage.getItem(ROLE_KEY)); } catch (e) { return null; }
}
function setRole(role, name) { localStorage.setItem(ROLE_KEY, JSON.stringify({ role: role, name: name || '' })); }
function clearRole() { localStorage.removeItem(ROLE_KEY); }

// 各角色可看的分頁與預設分頁
const ROLE_TABS = {
  student: { allowed: ['student', 'lastperf'], default: 'student' },
  parent: { allowed: ['lastperf'], default: 'lastperf' },
  coach: { allowed: ['student', 'lastperf', 'coach', 'settings'], default: 'coach' }
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

// 進入第二步（選名字 / 輸密碼）
function loginStep2(role) {
  const s1 = $id('loginStep1'), s2 = $id('loginStep2');
  s1.style.display = 'none';
  s2.style.display = 'block';

  if (role === 'coach') {
    s2.innerHTML = `
      <p class="login-hint">請輸入教練密碼</p>
      <input type="password" id="loginCoachPwd" class="text-input" placeholder="教練密碼" />
      <div class="login-step2-actions">
        <button class="login-back" id="loginBack">返回</button>
        <button class="btn btn-primary" id="loginCoachGo" style="flex:1">進入</button>
      </div>
      <p id="loginErr" class="login-sub" style="color:#ff7b7b;display:none;margin-top:10px"></p>`;
    $id('loginBack').addEventListener('click', showLoginOverlay);
    $id('loginCoachGo').addEventListener('click', () => coachLogin());
    $id('loginCoachPwd').addEventListener('keydown', e => { if (e.key === 'Enter') coachLogin(); });
  } else {
    // 選手 / 家長：選名字
    const who = role === 'student' ? '選手' : '孩子';
    const players = getPlayers();
    let opts = players.map(p => `<option value="${p}">${p}</option>`).join('');
    s2.innerHTML = `
      <p class="login-hint">請選擇${who}姓名</p>
      <select id="loginName" class="text-input"><option value="" disabled selected>請選擇${who}</option>${opts}</select>
      <div class="login-step2-actions">
        <button class="login-back" id="loginBack">返回</button>
        <button class="btn btn-primary" id="loginNameGo" style="flex:1">進入</button>
      </div>`;
    $id('loginBack').addEventListener('click', showLoginOverlay);
    $id('loginNameGo').addEventListener('click', () => {
      const name = $id('loginName').value;
      if (!name) { toast('請選擇姓名'); return; }
      finishLogin(role, name);
    });
  }
}

// 教練登入：用後端 ADMIN_KEY 驗證
async function coachLogin() {
  const pwd = $id('loginCoachPwd').value;
  const errEl = $id('loginErr');
  const go = $id('loginCoachGo');
  go.disabled = true; go.textContent = '驗證中...';
  let result = { ok: false, keySet: true };
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'verifyAdmin', adminKey: pwd });
      if (res && res.ok !== undefined) result = res;
    } catch (e) { /* 連線失敗，往下判斷 */ }
  }
  go.disabled = false; go.textContent = '進入';

  if (result.ok) {
    if (result.keySet === false) toast('尚未設定教練密碼，建議到系統設定設一組');
    // 記住教練密碼供名單同步等使用
    if (pwd) saveLineAdminKey(pwd);
    finishLogin('coach', '');
  } else {
    errEl.style.display = 'block';
    errEl.textContent = '密碼錯誤，請再試一次。';
  }
}

// 完成登入
function finishLogin(role, name) {
  setRole(role, name);
  $id('loginOverlay').classList.add('hidden');
  applyRole();
}

// 套用角色權限
function applyRole() {
  const r = getRole();
  if (!r) { showLoginOverlay(); return; }
  const conf = ROLE_TABS[r.role] || ROLE_TABS.student;

  // 分頁顯示控制
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.style.display = conf.allowed.indexOf(b.dataset.tab) !== -1 ? '' : 'none';
  });
  switchTab(conf.default);

  // 身分標籤與切換鈕
  const badge = $id('roleBadge');
  badge.style.display = 'inline-block';
  badge.textContent = ROLE_LABEL[r.role] + (r.name ? '：' + r.name : '');
  $id('btnSwitchRole').style.display = 'block';

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
  } else if (queryCard) {
    queryCard.style.display = '';
  }
}

function setupRoleHandlers() {
  document.querySelectorAll('.login-role-btn').forEach(btn => {
    btn.addEventListener('click', () => loginStep2(btn.dataset.role));
  });
  $id('btnSwitchRole').addEventListener('click', () => {
    clearRole();
    // 解除選手姓名鎖定
    const nameSel = $id('name'); if (nameSel) nameSel.disabled = false;
    const queryCard = $id('lastPerfQueryCard'); if (queryCard) queryCard.style.display = '';
    $id('roleBadge').style.display = 'none';
    $id('btnSwitchRole').style.display = 'none';
    showLoginOverlay();
  });
}

/* ============================================================
   16. 初始化
   ============================================================ */
function init() {
  // 分頁
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 日期預設今天
  $id('date').value = todayStr();
  $id('coachDate').value = todayStr();

  // 下拉選單
  fillSelect($id('group'), GROUP_OPTIONS, '請選擇組別');
  fillSelect($id('waterIntake'), WATER_OPTIONS, '請選擇水量');
  fillSelect($id('lateNightSnack'), LATE_NIGHT_OPTIONS);
  fillSelect($id('trainingIntensity'), INTENSITY_OPTIONS, '請選擇強度');
  refreshNameSelects();

  // KPI 拉桿（預設對練）
  renderKpiSliders('對練｜校隊');

  // 組別改變 -> 重建 KPI（品勢/對練分流）
  $id('group').addEventListener('change', e => {
    renderKpiSliders(e.target.value);
    toast(e.target.value.indexOf('品勢') !== -1 ? '已切換為品勢評分細項' : '已套用對練評分細項');
  });

  // 選姓名 -> 抓上一筆
  $id('name').addEventListener('change', async e => {
    const name = e.target.value;
    if (!name) return;
    toast('讀取上次表現中...');
    const rec = await fetchLastRecord(name);
    renderLastReview(rec, 'lastReviewContent', 'lastReviewCard');
  });

  // BMI 即時計算
  ['heightCm', 'weightKg', 'targetWeightKg'].forEach(id => {
    $id(id).addEventListener('input', updateBmiDisplay);
  });

  // 送出按鈕
  $id('btnSubmit').addEventListener('click', () => doSubmit('official'));
  $id('btnLocalSubmit').addEventListener('click', () => doSubmit('local'));
  $id('btnClear').addEventListener('click', clearForm);

  // 複製按鈕
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = $id(btn.dataset.target).textContent;
      copyText(text);
    });
  });

  // 上次表現分頁
  $id('btnLoadLastPerf').addEventListener('click', loadLastPerfPage);

  // 教練後台
  $id('btnRefreshCoach').addEventListener('click', refreshCoach);
  $id('btnLoadPerson').addEventListener('click', loadPersonRecords);

  // 系統設定
  setupSettingsHandlers();
  renderPlayerList();

  // 角色登入
  setupRoleHandlers();

  // 從雲端拉共用名單（學生手機開連結也會自動拿到最新名單）
  // 拉完名單後再套用角色（選手/家長姓名鎖定才正確）
  loadRosterFromServer().then(() => {
    if (getRole()) applyRole();
    else showLoginOverlay();
  });

  // 初次載入教練後台資料
  refreshCoach();
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
  ['gradeClass', 'trainingTopic', 'heightCm', 'weightKg', 'targetWeightKg',
   'breakfast', 'lunch', 'dinner', 'snacksDrinks',
   'reflection', 'tomorrowGoal', 'encouragementToTeammate', 'mainGoalToday'].forEach(id => $id(id).value = '');
  $id('date').value = todayStr();
  $id('bodyStatus').value = '普通';
  ['group', 'waterIntake', 'trainingIntensity'].forEach(id => $id(id).selectedIndex = 0);
  $id('lateNightSnack').value = '無';
  updateBmiDisplay();
  // 拉桿全部回 3
  document.querySelectorAll('.kpi-slider').forEach(s => { s.value = 3; });
  document.querySelectorAll('.kpi-slider').forEach(s => s.dispatchEvent(new Event('input')));
  // 隱藏回饋卡
  ['compareCard', 'nutritionCard', 'lineCard'].forEach(id => $id(id).style.display = 'none');
  toast('已清空表單');
}

// 啟動
document.addEventListener('DOMContentLoaded', init);
