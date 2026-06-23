/* ============================================================
   育林國中技擊隊｜選手 KPI＋身體狀態＋AI 飲食建議系統
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
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxyPgaXgpOA4oyRVxswOWkyvWv5iLC6QTkzOPUSIDl20wE1hBFVXAaSamy3cmvDz_LW/exec'
};

/* ============================================================
   1. 常數設定
   ============================================================ */

// 公開前端不內嵌選手名單；教練驗證後才從受保護的 roster API 載入。
const DEFAULT_PLAYERS = [];

const PARENT_FIELDS = ['parentId', 'parentName', 'phone', 'lineId', 'studentName', 'loginCode', 'status'];
const ATTENDANCE_REPORT_FIELDS = [
  'timestamp', 'date', 'studentName', 'attendanceStatus', 'checkInTime', 'checkOutTime',
  'absenceReason', 'informedCoach', 'parentConfirmed', 'kpiSubmitted', 'makeupTask',
  'makeupStatus', 'coachPublicNote', 'coachPrivateNote'
];

const DEFAULT_PARENTS = DEFAULT_PLAYERS.map((name, index) => ({
  parentId: 'P' + String(index + 1).padStart(3, '0'),
  parentName: name + '家長',
  phone: '',
  lineId: '',
  studentName: name,
  loginCode: 'P' + String(index + 1).padStart(2, '0') + '2026',
  status: 'active'
}));

// 運動項目選單（組別）
const GROUP_OPTIONS = [
  '跆拳道對練', '跆拳道品勢', '自由品勢', '武術套路', '散打', '未出席訓練'
];

const ABSENCE_GROUP = '未出席訓練';
// 未出席訓練反思問答：快捷選項
const ABSENCE_MISS_CHIPS = ['體能耐力', '技術手感', '對打反應', '團隊默契', '比賽經驗', '自律習慣'];
const ABSENCE_CATCHUP_CHIPS = ['回家自主訓練', '明天提早到加練', '看比賽/教學影片', '做核心與伸展', '向教練請教進度'];
// 是否為未出席（請假）紀錄：組別或狀態任一符合
function isAbsenceRecord(r) { return !!r && (isAbsenceGroup(r.group) || String(r.status) === '未出席訓練'); }

/* ============================================================
   自由品勢（Freestyle Poomsae）
   ------------------------------------------------------------
   沿用固定 30 項 /150 運動科學量表，另外多 3 個自由品勢紀錄欄位
   （空中踢擊完成幾腳/落地失誤幾次/解鎖動作）。
   ============================================================ */
const FREESTYLE_GROUP = '自由品勢';

/*
   自由品勢額外紀錄欄位。type：text / number。
   id 同時是 DOM input id 與紀錄欄位名（對應 Sheet 既有欄位）。
*/
const FREESTYLE_EXTRA_FIELDS = [
  { id: 'aerialKickCount', label: '空中踢擊完成幾腳', type: 'number', placeholder: '例如：3', step: '1' },
  { id: 'landingErrors', label: '落地失誤幾次', type: 'number', placeholder: '例如：1', step: '1' },
  { id: 'unlockedMoves', label: '解鎖哪些高難度動作', type: 'text', placeholder: '例如：540 旋風踢、空中側踢' }
];

// 全部 freestyle 額外欄位 id（草稿、清空、收集共用）
const FREESTYLE_EXTRA_IDS = FREESTYLE_EXTRA_FIELDS.map(f => f.id);

function isFreestyle(group) { return group === FREESTYLE_GROUP; }
function isAbsenceGroup(group) { return group === ABSENCE_GROUP; }

// 訓練強度選項
const INTENSITY_OPTIONS = ['恢復日', '低', '中', '高', '比賽日'];

// 水量選項
const WATER_OPTIONS = [
  '少於 500ml', '500-1000ml', '1000-1500ml', '1500-2000ml', '2000ml 以上'
];

// 宵夜選項
const LATE_NIGHT_OPTIONS = ['無', '有，少量', '有，偏多'];

// 今日心情指數（1–5，不計入 KPI 分數，只供關懷與團隊氣氛觀察）
const MOOD_OPTIONS = [
  { v: 1, emoji: '😣', label: '很低落' },
  { v: 2, emoji: '😕', label: '有點累/煩' },
  { v: 3, emoji: '😐', label: '普通' },
  { v: 4, emoji: '🙂', label: '還不錯' },
  { v: 5, emoji: '😄', label: '很好' }
];
const MOOD_REASON_CHIPS = ['課業忙', '睡不好', '和同學/朋友', '家裡的事', '訓練不順', '身體不適', '沒事就是累', '心情很好'];
// 解憂信箱（外站，另一個 repo），心情低或主動想說話時引導過去
const SOLACE_URL = 'https://shark7763-del.github.io/athlete-solace-box/';
function moodMeta(v) { return MOOD_OPTIONS.find(m => String(m.v) === String(v)) || null; }
function moodText(v) { const m = moodMeta(v); return m ? `${m.emoji} ${m.label}` : ''; }

// 拉桿分數文字
const SCORE_LABELS = { 1: '很差', 2: '偏弱', 3: '普通', 4: '良好', 5: '非常好' };

/*
   每個 KPI 細項的「行為錨點」：1~5 分各一句具體描述，讓選手看得懂今天該打幾分，
   打破「沒把握就一律給 3 分」的中間化傾向。陣列 index 0→1分 … 4→5分。
   描述以「今天這堂訓練的狀態」為視角，3 分=有缺口的真實中間、非缺省值。
   key 必須與 KPI_ASPECTS 各面向 items 的名稱完全一致。
*/
const KPI_ANCHORS = {
  // 技術
  '動作準確度': ['常打偏，角度位置都跑掉', '打得到但常偏一兩成', '大致打中，偶爾偏掉', '多數命中正確點位', '幾乎每下都在準心'],
  '動作穩定度': ['重心晃、收腿軟，常踉蹌', '勉強站住但晃動明顯', '大致穩，動作偶爾走樣', '收發腳穩、很少晃', '全程不晃，落地像釘住'],
  '速度與反應': ['慢半拍，反應已太遲', '跟得上但偏慢，常被搶先', '速度普通，不快不慢', '出手俐落，能即時反應', '又快又脆，對方一動我就到'],
  '力量傳遞': ['只有手腳動，軟綿綿', '有用到腰胯但不連貫', '普通，打得出但不夠透', '蹬地轉胯到位，打靶清脆', '全身串成一股力，又透又響'],
  '技術完成度': ['做一半就斷，沒收尾', '勉強做完但漏一堆細節', '做得完，完成度普通', '起手到收尾完整', '一氣呵成，毫無缺漏'],
  // 戰術
  '距離控制': ['完全抓不到，踢空或貼太近', '偶爾抓到，常太遠太近', '大致抓得到，偶爾失準', '多數打在有效距離', '進退距離隨我掌控'],
  '出手時機': ['老是亂出手，時機全錯', '偶爾抓對，常太早太晚', '時機普通，抓得到一半', '多半抓到對的時機', '破綻一露我就出手'],
  '攻防轉換': ['攻完愣住，被打也不切防', '轉換慢，卡在攻或守', '能切換但慢一拍', '攻完能順勢防守', '攻守無縫，擋完馬上反打'],
  '對手判讀': ['完全看不懂，被牽著走', '偶爾猜中，多半被騙', '大致看得出習慣', '讀出多數意圖，少被騙', '對手一動我就知下一步'],
  '教練戰術執行': ['戰術完全沒做到', '記得一點但場上做不出', '大致照做，執行普通', '多數指令能落實', '怎麼交代我就怎麼打'],
  // 體能
  '爆發力': ['蹬不起來，起腿慢又沉', '有力但發不快', '普通，起腿一般', '起腿夠快夠猛，蹬地有彈性', '一蹬就到位，爆發力十足'],
  '肌力': ['出力就軟，撐不住', '有力但稍重就吃力', '普通，一般動作扛得住', '力量足，踢擊抗衡有底氣', '力量飽滿，壓得住人'],
  '肌耐力': ['沒幾下就痠到動不了', '撐一陣就明顯沒力', '撐得住，後段會累', '反覆訓練力量不太掉', '整堂都不軟，穩到最後'],
  '心肺耐力': ['動兩下就喘到要停', '容易喘，恢復也慢', '普通，中段開始喘', '高強度撐得久', '整堂不虛，恢復又快'],
  '敏捷與協調': ['手腳打結，常絆到', '勉強連得起但卡卡', '普通，複雜動作會亂', '步法靈活，手腳配合順', '又快又順，身體完全聽使喚'],
  // 心理
  '專注力': ['教練提醒3次以上才回神', '常恍神，自己很難拉回', '偶爾飄走但能自己抓回', '多數很專心，換項目才短暫分心', '整堂沒分心，叫我做立刻進入'],
  '壓力穩定': ['一被糾正或落後就慌、想放棄', '容易急躁，要久才冷靜', '會緊張但深呼吸能繼續', '壓力大還能照常做動作', '越有壓力越冷靜'],
  '自信心': ['很怕做錯，不太敢出手', '多數沒把握，要看別人', '熟的有把握，難的會猶豫', '大部分都敢做、相信自己', '什麼都敢試，相信能完成'],
  '挫折恢復': ['失誤後卡住，影響整堂', '要好幾分鐘或教練講才振作', '沮喪一下，休息一輪能繼續', '失誤後很快調整', '一失誤馬上歸零，更想做好'],
  '訓練動機': ['很不想來，只想結束', '提不起勁，做完規定就好', '願意做，但沒想加練', '想練好，願意多做一兩組', '主動加練、想挑戰更難的'],
  // 生理
  '睡眠恢復': ['幾乎沒睡好，一直想睡很沒力', '睡不夠或一直醒，起床還累', '普通，夠用但不飽', '睡得不錯，精神算好', '睡得很飽，清醒有電'],
  '精神恢復': ['完全沒電，腦袋鈍提不起勁', '比較累，要硬撐', '普通，能正常訓練', '精神不錯，頭腦清楚', '精神超好，反應快很想動'],
  '肌肉舒適度': ['全身痠緊，動起來卡又痛', '好幾處明顯痠，影響動作', '有點痠但熱身後就好', '大致放鬆，只有一點緊', '很鬆很順，完全沒痠痛'],
  '傷勢安全度': ['有地方明顯痛，某些動作不敢做', '舊傷會痛，要避開某些動作', '有點不舒服，小心做沒問題', '幾乎沒感覺，只留意一下', '完全沒有受傷顧慮'],
  '整體恢復感': ['還很累，根本沒恢復好', '恢復一半，勉強練很吃力', '恢復得差不多，正常沒問題', '恢復不錯，身體輕快有餘力', '完全恢復滿格，狀態很好'],
  // 態度
  '準時與紀律': ['我今天遲到了', '卡點才到，有點趕', '我準時到、換好裝', '我提早到、自己暖身', '我提早到還幫排器材'],
  '訓練投入': ['我今天一直放空', '教練盯著才動', '該做的我有做完', '我自己加練幾下', '累了我還是頂著做'],
  '主動修正': ['被講還是老樣子', '教練提醒才改', '講一次我就改', '自己發現錯就調', '改完還教旁邊的人'],
  '接受指導': ['被教會擺臉色', '嘴上應、沒在聽', '我有聽、有照做', '我會追問怎麼更好', '聽完馬上用出來'],
  '團隊合作': ['我今天只顧自己', '別人喊我才幫', '該配合我有配合', '我會主動補位', '我帶氣氛、罩學弟']
};

/*
   KPI 六大面向細項。
   technical（技術狀態）與 tactical（戰術執行力）會依「對練/品勢」分流，
   故各自提供 spar（對練）與 poomsae（品勢）兩組。
*/
const KPI_ASPECTS = {
  physical: {
    label: '體能',
    items: ['爆發力', '肌力', '肌耐力', '心肺耐力', '敏捷與協調']
  },
  technical: {
    label: '技術',
    items: ['動作準確度', '動作穩定度', '速度與反應', '力量傳遞', '技術完成度']
  },
  focus: {
    label: '心理',
    items: ['專注力', '壓力穩定', '自信心', '挫折恢復', '訓練動機']
  },
  discipline: {
    label: '態度',
    items: ['準時與紀律', '訓練投入', '主動修正', '接受指導', '團隊合作']
  },
  emotion: {
    label: '生理',
    items: ['睡眠恢復', '精神恢復', '肌肉舒適度', '傷勢安全度', '整體恢復感']
  },
  tactical: {
    label: '戰術',
    items: ['距離控制', '出手時機', '攻防轉換', '對手判讀', '教練戰術執行']
  }
};

// 面向順序（影響顯示與計算）
const ASPECT_ORDER = ['technical', 'tactical', 'physical', 'focus', 'discipline', 'emotion'];

// 各面向圖示（KPI 分區標題用）
const KPI_ASPECT_ICON = {
  technical: '🎯', tactical: '♟️', physical: '💪',
  focus: '🧠', discipline: '🔥', emotion: '🛌'
};

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

// 面向 -> 紅燈原因分類名稱（給 AI 紅燈原因分析用）
const ASPECT_REDLABEL = {
  physical: '體能', technical: '技術', tactical: '戰術',
  focus: '心理', discipline: '態度', emotion: '生理', overall: '整體'
};

// 商業版固定六面向各 5 題，共 30 題；運動組別不改變核心量表，確保趨勢可比較。
function groupKpiItems() {
  return ASPECT_ORDER.flatMap(aspect => KPI_ASPECTS[aspect].items.map(name => ({ n: name, a: aspect })));
}

// 飲食關鍵字
const NUTRITION_KEYWORDS = {
  protein: ['雞', '雞蛋', '蛋', '牛肉', '豬肉', '魚', '蝦', '豆腐', '豆漿', '鮪魚', '牛奶', '優格', '豆干', '毛豆', '乳清', '肉', '海鮮'],
  vegetable: ['青菜', '花椰菜', '高麗菜', '菠菜', '地瓜葉', '空心菜', '菇', '菇類', '杏鮑菇', '蔬菜', '沙拉', '番茄', '小黃瓜', '胡蘿蔔'],
  sugaryDrink: ['奶茶', '手搖', '可樂', '汽水', '紅茶', '綠茶', '珍奶', '果汁', '運動飲料', '含糖', '多多', '養樂多'],
  friedOily: ['炸', '薯條', '鹽酥雞', '雞排', '炸雞', '披薩', '漢堡', '泡麵', '滷味', '火鍋', '燒烤'],
  staple: ['飯', '麵', '地瓜', '馬鈴薯', '吐司', '麵包', '粥', '水餃', '義大利麵', '燕麥', '饅頭'],
  fruit: ['水果', '蘋果', '香蕉', '芭樂', '橘子', '柳丁', '葡萄', '西瓜', '芒果', '鳳梨', '奇異果', '藍莓', '番茄', '小番茄', '木瓜']
};

/*
   飲食快速勾選標籤：學生若只填「便當／營養午餐」這種籠統字眼，
   靠關鍵字抓不到吃了什麼，改用這排標籤直接勾選吃到的類別。
   kind = 'good'（營養好）或 'warn'（要提醒，含糖飲料／油炸）。
   每餐的標籤存進該餐欄位的 〔…〕 後綴（見 composeMeal / parseMeal），
   不需新增後端欄位。tag 文字務必與分析用的判斷字串一致。
*/
const MEAL_TAG_DEFS = {
  staple:  { label: '主食',   kind: 'good' },
  protein: { label: '蛋白質', kind: 'good' },
  veg:     { label: '蔬菜',   kind: 'good' },
  fruit:   { label: '水果',   kind: 'good' },
  sugary:  { label: '含糖飲料', kind: 'warn' },
  fried:   { label: '油炸',   kind: 'warn' }
};
const MEAL_TAG_OPTIONS = {
  breakfast:    ['staple', 'protein', 'veg', 'fruit', 'sugary', 'fried'],
  lunch:        ['staple', 'protein', 'veg', 'fruit', 'sugary', 'fried'],
  dinner:       ['staple', 'protein', 'veg', 'fruit', 'sugary', 'fried'],
  snacksDrinks: ['fruit', 'protein', 'sugary', 'fried']
};
const MEAL_TAG_BOX = { breakfast: 'tagsBreakfast', lunch: 'tagsLunch', dinner: 'tagsDinner', snacksDrinks: 'tagsSnacksDrinks' };
const MEAL_TAG_LABELS = Object.keys(MEAL_TAG_DEFS).map(k => MEAL_TAG_DEFS[k].label);

// 把使用者輸入的餐點文字與勾選標籤合併成存檔字串（標籤放 〔…〕 後綴）
function composeMeal(text, tags) {
  const t = (text || '').trim();
  if (!tags || !tags.length) return t;
  return (t ? t + ' ' : '') + '〔' + tags.join('・') + '〕';
}
// 從存檔字串拆出 { text, tags }；舊資料沒有 〔…〕 就回傳整串為 text、tags 空陣列
function parseMeal(str) {
  const s = (str || '').toString();
  const m = s.match(/^([\s\S]*?)\s*〔([^〕]*)〕\s*$/);
  if (!m) return { text: s.trim(), tags: [] };
  return { text: m[1].trim(), tags: m[2].split(/[・,、]/).map(x => x.trim()).filter(Boolean) };
}
// 餐點欄顯示：文字 ＋ 標籤小色塊（含糖飲料／油炸用紅色，其餘綠色）
function mealValueHtml(val) {
  const { text, tags } = parseMeal(val);
  let h = escapeHtml(text || '—').replace(/\n/g, '<br>');
  if (tags.length) {
    h += ' ' + tags.map(t => {
      const warn = (t === '含糖飲料' || t === '油炸');
      return `<span class="tag ${warn ? 'tag-red' : 'tag-green'}" style="font-size:0.72rem;padding:1px 8px;">${escapeHtml(t)}</span>`;
    }).join('');
  }
  return h;
}

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
  // 技術（武術套路）
  '動作規格': { remind: '套路看的是規格，到位才有分。', advice: '明天對鏡子確認手型、步型與定勢角度。' },
  '手眼身法步': { remind: '手眼身法步不合一，動作就會散。', advice: '明天放慢分解，確認手到、眼到、身到、步到。' },
  '勁力順達': { remind: '勁力沒順達，動作看起來軟。', advice: '明天練發勁的起於腳、達於梢，收放分明。' },
  '協調連貫': { remind: '動作銜接卡頓就失分。', advice: '明天把段落串起來慢走，再逐步加速求順。' },
  '套路完整度': { remind: '整套要一氣呵成才有說服力。', advice: '明天完整走 3 遍，要求每次都收乾淨不漏勢。' },
  // 戰術（武術套路・演練）
  '節奏韻律': { remind: '節奏亂掉，整套就沒有氣勢。', advice: '明天分清快慢動靜，動如脫兔、靜如山岳。' },
  '精神表現': { remind: '眼神到位，氣勢就出來。', advice: '明天每個定勢確認眼神與精氣神。' },
  '難度完成': { remind: '難度動作沒站穩就會扣分。', advice: '明天先求難度落地穩，寧穩不貪。' },
  '穩定度': { remind: '平時穩，上場才不會亂。', advice: '明天加強定勢與跳躍落地的重心控制。' },
  '整體演練水平': { remind: '演練水平是平常累積出來的。', advice: '明天用比賽模擬完整演練一次。' },
  // 技術（自由品勢）
  '空中踢擊': { remind: '空中踢擊不穩就先別貪高。', advice: '明天先降低難度，把騰空與落地站穩了再加。' },
  '旋轉動作': { remind: '旋轉站不穩會整套被扣。', advice: '明天放慢轉速、固定軸心與視線定點。' },
  '特技難度': { remind: '難度動作沒把握就有受傷風險。', advice: '明天拆解成單一動作分段練，有把握再串回。' },
  '完整度': { remind: '整套沒收乾淨就拿不到分。', advice: '明天完整跑 3 遍，每次都要收乾淨不漏動作。' },
  '安全控制': { remind: '安全永遠擺第一。', advice: '明天強化核心與落地緩衝，寧降難度不硬做。' },
  // 戰術（自由品勢・演練）
  '創意編排': { remind: '編排不順，整套就斷掉。', advice: '明天重點練段落銜接，讓動作一氣呵成。' },
  '音樂契合': { remind: '沒對到重拍就少了氣勢。', advice: '明天跟著重拍走，數拍確認每個 8 拍落點。' },
  '連續踢擊': { remind: '連續踢擊斷掉就扣分。', advice: '明天放慢先求連續不落地，再加速。' },
  '動作連結': { remind: '上一動沒帶到下一動就會卡。', advice: '明天練收勢直接帶起下一個動作。' },
  '表現力': { remind: '表現力是眼神、氣勢與張力。', advice: '明天每個定點動作要停得住、撐得滿。' },
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
   1.5 教練語錄 & 選手鼓勵語模組
   ------------------------------------------------------------
   COACH_QUOTES：每日輪播的精神標語（依日期決定，當天固定不變）。
   ENCOURAGEMENTS：依當日狀態（紅／黃／綠燈）給不同口吻的鼓勵，
   送出後與 LINE 選手版會用到。
   ============================================================ */
const COACH_QUOTES = [
  '冠軍不是贏在比賽當天，而是贏在沒人看見的每一次練習。',
  '禮義廉恥、忍耐克己、百折不屈——這是跆拳道，也是做人。',
  '今天的汗水，是明天站上場上的底氣。',
  '不怕慢，只怕站著不動。每天進步一點點就好。',
  '輸了一場不會怎樣，放棄練習才真的輸了。',
  '把基本動作做到最好的人，最後都站得最久。',
  '累的時候再撐一下，那一下就是和別人拉開差距的地方。',
  '強者不是不會跌倒，而是每次都願意再站起來。',
  '你今天願意面對自己的弱點，就已經比昨天更強了。',
  '腳會痠、會累，但目標不會自己走過來，要你去追。',
  '紀律，是你想偷懶時還是選擇把動作做完。',
  '對手很強沒關係，把每一腳踢好，就是你最好的回應。',
  '真正的對手不是別人，是昨天的自己。',
  '比賽比的不只是技術，是誰平常準備得更踏實。',
  '先學會尊重對手與隊友，才配得上勝利。',
  '練習時多流一滴汗，比賽時就少流一滴淚。',
  '穩住呼吸，穩住重心，你比自己想像的更強。',
  '每一次喊聲，都是在告訴自己：我準備好了。',
  '進步是安靜的，它藏在你每天重複的小事裡。',
  '今天好好練，未來的你會謝謝現在不放棄的自己。',
  // ── 成長型思維（參考《心態致勝》Carol Dweck）──
  '你不是「做不到」，只是「還沒做到」。差的只是時間與練習。',
  '能力不是天生固定的，它會因為你的努力而長大。',
  '與其證明自己有多強，不如讓自己每天變得更強一點。',
  '失敗不是你的標籤，而是這次還缺的那塊拼圖。',
  '別人稱讚你贏，要記得：真正值得驕傲的是你下的功夫。',
  '遇到很難的動作，代表你的大腦正在變強。',
  '「我還不會」這句話的重點，是「還」——它正在路上。',
  '挑戰會讓你成長，舒適圈只會讓你停在原地。',
  '把「我天生就這樣」改成「我可以練到那樣」，你就贏一半了。',
  '在乎進步勝過在乎輸贏的人，最後走得最遠。',
  '錯誤是大腦在學習的聲音，不要怕犯，要怕不修正。',
  '今天比昨天的自己強一點，就是最棒的勝利。',
  // ── 一、紀律與堅持 ──
  '今天的訓練，不是為了舒服，是為了讓比賽時不害怕。',
  '你流下的每一滴汗，都會在場上變成底氣。',
  '真正的強者，不是每天都想練，而是不想練的時候也出現。',
  '沒有人天生穩定，穩定是一次一次訓練出來的。',
  '比賽只看結果，但結果來自你每天的選擇。',
  '練習時多要求自己，賽場上才會少一點後悔。',
  '不要怕慢，只怕你停下來。',
  '能每天完成基本功的人，最後都不會太差。',
  '高手不是沒有失誤，而是失誤後還能馬上回來。',
  '今天偷懶的動作，明天會在比賽中露出破綻。',
  '你不是在跟別人比，你是在超越昨天的自己。',
  '每一次重複，都在替未來的自己鋪路。',
  '認真不是做給教練看，是做給未來的自己看。',
  '場上沒有僥倖，只有平常準備得夠不夠。',
  '你現在吃的苦，會變成以後別人追不上的地方。',
  '不是有信心才去做，是做了才會有信心。',
  '一個動作練到不用想，才是真正屬於你。',
  '不要只想贏，要先學會讓自己值得贏。',
  '訓練不是懲罰，是給自己變強的機會。',
  '你越願意面對弱點，進步就越快。',
  '每天進步一點點，時間會替你累積成差距。',
  '不要怕被要求，因為被要求代表你還有更高的可能。',
  '今天多撐一秒，明天就多一分勝算。',
  '真正的冠軍，先在訓練場養成。',
  '做到別人不想做的，你才有機會成為別人做不到的。',
  // ── 二、抗壓與自信 ──
  '緊張不是壞事，它代表你在乎。',
  '害怕不是退縮的理由，而是證明你正在挑戰自己。',
  '你可以緊張，但不能放棄相信自己。',
  '比賽時最重要的，不是完全不怕，而是怕也敢上場。',
  '你已經準備很久了，現在只需要相信訓練過的自己。',
  '失誤不可怕，可怕的是失誤後你不敢再出手。',
  '把注意力放在下一個動作，不要困在上一個失誤。',
  '你不需要完美，你需要穩定完成當下。',
  '心亂的時候，先把呼吸找回來。',
  '專注眼前一秒，勝利才會慢慢靠近。',
  '對手很強沒關係，你也不是空手走到這裡。',
  '相信自己，不是因為你一定會贏，而是因為你願意全力以赴。',
  '心裡越慌，動作越要簡單清楚。',
  '場上沒有時間懷疑自己，只有時間執行。',
  '你的勇敢，不是沒有恐懼，而是帶著恐懼繼續完成。',
  '別讓一次失敗，否定你一路的努力。',
  '你不是突然變強，是一直沒有放棄。',
  '把壓力看成提醒，不要看成阻礙。',
  '你越能穩住自己，對手越難打亂你。',
  '真正的自信，是知道自己失誤了也能再站起來。',
  '不要急著證明自己，先穩穩完成自己該做的。',
  '你能不能贏，先從你敢不敢相信自己開始。',
  '沒有人能替你上場，但你的努力會陪你上場。',
  '抬頭、呼吸、相信自己，你已經走到這裡了。',
  // ── 三、體能：吃苦與突破 ──
  '最後一組最痛苦，也最有價值。',
  '身體想停的時候，意志要先站出來。',
  '體能不是一天練成，但一天不練就會退步。',
  '你現在撐過去，未來比賽就多一口氣。',
  '疲勞時還能保持動作，才是真本事。',
  '不是練到累就好，是累的時候還能正確。',
  '每一次快撐不住，都是突破的門口。',
  '你的極限，常常比你想像的更遠。',
  '不要被疲勞騙了，你還可以再多一下。',
  '體能是技術的地基，地基穩，表現才穩。',
  '多一分體能，就少一分慌張。',
  '場上最後能不能撐住，取決於平常有沒有撐住。',
  '今天累，是因為你正在變強。',
  '痛苦會過去，但訓練留下的能力會留下。',
  '強度不是敵人，放棄才是。',
  '身體很誠實，你有沒有練，它都會記得。',
  '別怕喘，喘過去就是進步。',
  '真正的體能，是在最累時還能做出正確選擇。',
  '比賽的最後一秒，靠的是平常多練的那一下。',
  '每一次蹲下去，都是為了站得更穩。',
  '每一次衝刺，都是在訓練你的決心。',
  '肌肉會酸，但信念不能軟。',
  '你不是被訓練打敗，你是在訓練裡重生。',
  '撐過去，你會發現自己比想像中更強。',
  // ── 四、團隊與態度 ──
  '一個人可以走很快，一個團隊可以走很遠。',
  '你今天的態度，會影響整個隊伍的氣氛。',
  '不要只想自己變強，也要讓身邊的人一起變強。',
  '隊友不是競爭者，是一起撐過辛苦的人。',
  '你認真，旁邊的人也會被你帶起來。',
  '真正的團隊，是有人累了，大家一起拉他一把。',
  '不要小看自己的努力，隊友都看在眼裡。',
  '你的一句加油，可能就是隊友撐下去的力量。',
  '一支強隊，不只是技術強，是態度一致。',
  '團隊的榮耀，來自每個人都不偷懶。',
  '今天你幫隊友，明天隊友也會成為你的力量。',
  '練習場上的互相要求，是比賽場上的互相信任。',
  '不要只當選手，要當能讓團隊變好的選手。',
  '真正的學長姐，不只是比較強，而是願意帶人。',
  '隊伍的高度，取決於每個人願意負責的程度。',
  '贏的時候一起榮耀，輸的時候一起承擔。',
  '一個人的鬆懈，會讓整個隊伍付出代價。',
  '你不是一個人在練，你背後有教練、隊友和家人。',
  '團隊最強的力量，是彼此不放棄。',
  '被隊友信任，是一種責任，也是一種榮耀。',
  '今天你為團隊多做一點，明天團隊會為你多撐一點。',
  '不要怕被提醒，願意被提醒的人才會進步。',
  '強隊不是沒有問題，是大家願意一起解決問題。',
  '你在隊上的樣子，會變成學弟妹學習的樣子。',
  '讓自己成為隊伍裡正向的力量。',
  // ── 六、賽後鼓勵 ──
  '贏了要感恩，輸了要學習。',
  '今天的結果不是終點，是下一次進步的起點。',
  '你可以難過，但不要停在難過裡。',
  '輸掉一場比賽，不代表輸掉你的價值。',
  '每一次失敗，都在教你下一次怎麼更好。',
  '今天沒做到的，明天就回訓練場補回來。',
  '真正重要的，是你願不願意從結果中學習。',
  '贏的人繼續練，輸的人更要練。',
  '眼淚可以流，但腳步不能停。',
  '成績會過去，態度會留下來。',
  '你今天的挫折，會成為未來成功的養分。',
  '不要急著否定自己，先看見自己哪裡進步了。',
  '比賽輸贏只是一天，運動員的路很長。',
  '今天知道不足，代表你有機會變得更完整。',
  '輸了不可怕，不敢面對才可怕。',
  '你不是失敗，你只是還在成長。',
  '每一次檢討，都是下一次突破的開始。',
  '勝利值得開心，失敗也值得尊重。',
  '因為你敢上場，所以你已經比昨天更勇敢。',
  '不要讓結果定義你，讓態度決定你下一步。',
  '今天的痛，會變成明天的提醒。',
  '你可以失望，但不要失去方向。',
  '真正成熟的選手，會把輸贏變成養分。',
  '回到訓練場，就是最好的回答。',
  '下一次，讓今天的遺憾變成你的力量。',
  // ── 七、KPI 回報／每日回饋 ──
  '今天有回報，就是你願意面對自己的開始。',
  '數據不是拿來責備你，是幫助你更了解自己。',
  '每一次紀錄，都是你成長的證據。',
  '不怕分數低，只怕不知道自己哪裡要調整。',
  '誠實回報，比漂亮數字更重要。',
  '你願意記錄，代表你開始為自己的表現負責。',
  '今天狀態不好沒關係，知道原因就能調整。',
  '運動員不只要會練，也要會觀察自己。',
  '每天多了解自己一點，比賽就多一分掌控感。',
  '數據會說話，但態度決定你怎麼回應它。',
  '回報不是作業，是你變強的地圖。',
  '今天的低分，不是失敗，是提醒。',
  '身體狀態要誠實，訓練安排才會準確。',
  '真正聰明的選手，會從紀錄中找到進步方向。',
  '別小看每天一分鐘回報，它會累積成你的成長軌跡。',
  '你越懂自己，就越能控制比賽。',
  '每一次填寫，都是在和未來的自己對話。',
  '今天的數據，是明天調整的依據。',
  '能面對自己的狀態，就是成熟運動員的開始。',
  '沒有紀錄，就很難看見真正的改變。',
  '你不是為了分數而回報，是為了更清楚地進步。',
  '好的運動員，不只靠感覺，也靠紀錄。',
  '每天的回報，會讓努力變得看得見。',
  '狀態不好時更要記錄，因為那才是最需要被了解的時候。',
  '你的成長，不會被一天定義，但會被每天累積。',
  // ── 八、海報／短句 ──
  '精神一到，何事難求；意志一堅，萬難可破。',
  '堅持到底，才看得見真正的自己。',
  '不怕慢，只怕停。',
  '強者不是天生，是練出來的。',
  '每一次努力，都算數。',
  '把基本做到極致，就是高手。',
  '你今天的自律，會成為明天的底氣。',
  '成功的路不擁擠，因為堅持的人不多。',
  '不要等準備好了才開始，開始了才會準備好。',
  '汗水不會騙人，時間也不會辜負努力的人。',
  '場上三分鐘，場下千百次。',
  '你有多自律，就有多自由。',
  '今天不舒服，明天才會不一樣。',
  '不是因為看見希望才堅持，是堅持才會看見希望。',
  '真正的對手，是想放棄的自己。',
  '態度決定高度，細節決定成敗。',
  '把每一天，都練成自己的底氣。',
  '你可以輸給對手，但不能輸給懶惰。',
  '冠軍不是喊出來的，是一天一天做出來的。',
  '每一次跌倒，都是重新站穩的機會。',
  '沒有白走的路，只有還沒發光的努力。',
  '把不可能，練成習慣。',
  '心要穩，眼要準，腳步要堅定。',
  '不要害怕壓力，壓力會把你磨成更強的樣子。',
  '今天的你，比昨天多撐一下，就已經贏了一次。'
];

/*
   依狀態給鼓勵語：每個狀態多句，避免每天一樣。
   key 用燈號文字裡的關鍵字（紅／黃／綠）。
*/
const ENCOURAGEMENTS = {
  red: [
    '你不是不行，只是「還沒」做到。今天的弱項就是明天的功課，一項一項補回來。',
    '紅燈不是你的標籤，是這次還缺的那塊拼圖。願意面對它，你已經在進步了。',
    '狀態低的時候最能看出一個人——你今天還是來練、還是記錄了，這就是強者的選擇。',
    '分數低沒關係，重點是你有沒有從中學到一件事。明天帶著它進場，就會不一樣。'
  ],
  yellow: [
    '已經站得住了，差的只是再多一點專注與方法。把最弱的一項顧好，綠燈就在前面。',
    '穩定也是一種實力。別急著證明自己有多強，先讓自己每天強一點。',
    '中等不是終點，是往上爬的起點。明天挑一個重點突破，你做得到。'
  ],
  green: [
    '今天很棒！但要記得——真正值得驕傲的不是分數，是你下的功夫。繼續保持。',
    '綠燈是你把問題帶進訓練裡修正的結果。能力會因為努力長大，明天挑戰更高目標。',
    '表現很穩，把這份手感記住。別停在舒適圈，下一個挑戰會讓你更強。'
  ]
};

// 鼓勵隊友的快捷用語（點一下帶入內容欄）
const ENCOURAGE_PRESETS = [
  '今天練得很拼，繼續加油！',
  '你的動作越來越穩了，很棒！',
  '謝謝你今天陪我對練，一起變強！',
  '不要灰心，下次一定更好！',
  '看到你很努力，我也要跟上你！',
  '你的精神喊聲超有氣勢，讚！',
  '受傷要好好休息，我們等你回來！',
  '一起加油，比賽我們互相罩！'
];

// 感謝今天的人事物快捷用語（點一下帶入內容欄）
const GRATITUDE_PRESETS = [
  '謝謝教練今天的指導',
  '謝謝隊友陪我一起練習',
  '謝謝爸媽的接送與支持',
  '謝謝今天沒有放棄的自己',
  '謝謝身體今天撐住了',
  '謝謝對手讓我學到東西'
];

// 紅燈原因分類 / 處理方式（教練後台勾選）
const RED_LIGHT_REASONS = ['疲勞', '受傷', '飲食', '情緒', '技術', '態度', '學業壓力'];
const RED_LIGHT_HANDLINGS = ['已談話', '已通知家長', '已調整訓練量', '持續觀察'];

// 教練給紅燈選手的方向＋鼓勵快捷語（成長型思維口吻）
const COACH_DIRECTION_PRESETS = [
  '今天紅燈沒關係，先好好休息，明天我們一項一項調整。',
  '你今天有來、有記錄，這就是負責任的態度。明天從基本動作開始穩住。',
  '分數只是提醒，不是定義你。明天先把最弱那一項練紮實。',
  '辛苦了，先把身體恢復顧好，狀態回來表現就回來。',
  '我看到你願意面對問題，這比分數更重要。明天一起修正。',
  '別跟別人比，跟昨天的自己比，明天進步一點點就好。'
];

/* 依日期挑一句（同一天固定），讓「每日語錄」整天不變 */
function dailyPick(arr) {
  if (!arr || !arr.length) return '';
  const d = new Date();
  const seed = d.getFullYear() * 1000 + (d.getMonth() + 1) * 50 + d.getDate();
  return arr[seed % arr.length];
}
/* 隨機挑一句 */
function randomPick(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}
/* 依狀態（燈號文字）挑一句鼓勵語 */
function encouragementByStatus(status) {
  const s = String(status || '');
  let key = 'yellow';
  if (s.indexOf('綠') !== -1) key = 'green';
  else if (s.indexOf('紅') !== -1) key = 'red';
  return randomPick(ENCOURAGEMENTS[key]);
}

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

// 取某前綴的所有資料（雲端優先，否則掃本機）。回傳 Promise<{key:value}>
async function appGetAll(prefix) {
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getAllAppData', prefix: prefix || '' });
      if (res && res.ok && res.data) return res.data;
    } catch (e) { /* 落回本機 */ }
  }
  const out = {};
  const lp = 'yulin_app_';
  for (let i = 0; i < localStorage.length; i++) {
    const lk = localStorage.key(i);
    if (lk && lk.indexOf(lp) === 0) {
      const key = lk.slice(lp.length);
      if (prefix && key.indexOf(prefix) !== 0) continue;
      try { out[key] = JSON.parse(localStorage.getItem(lk)); } catch (e) { /* */ }
    }
  }
  return out;
}

/* ============================================================
   權限工具：家長視圖只看溫和摘要、隱藏教練內部備註
   ============================================================ */
function isParentView() { const r = getRole(); return !!(r && r.role === 'parent'); }
function isCoachView() { const r = getRole(); return !!(r && r.role === 'coach'); }

// 把較尖銳的字眼轉成對家長溫和的說法
function softenForParent(text) {
  if (!text) return text;
  let t = String(text);
  const map = {
    '受傷': '身體狀況需要留意', '疲勞': '較疲累需要休息', '態度': '訓練投入',
    '情緒': '心情狀態', '學業壓力': '課業較忙', '紅燈': '需要關心',
    '低分': '還在進步中', '偏低': '還在進步中'
  };
  Object.keys(map).forEach(k => { t = t.split(k).join(map[k]); });
  return t;
}

// 建立 KPI 拉桿 UI（六面向各 5 題，共 30 題；1–5 分制）。
// 自由品勢另外顯示 3 個額外欄位區塊。
function renderKpiSliders(group) {
  currentGroup = group;
  const fsSection = $id('freestyleSection');
  if (fsSection) fsSection.style.display = isFreestyle(group) ? '' : 'none';
  toggleAbsenceReason(group);

  const container = $id('kpiContainer');
  container.innerHTML = '';

  // 頂部：全隊總摘要（保留 #kpiSummary 供 recalcKpiSummary 更新）
  const head = document.createElement('div');
  head.className = 'kpi-aspect-head kpi-overall-head';
  head.innerHTML = `<span>${escapeHtml(group)}　六大面向・30 項</span><span class="kpi-aspect-avg" id="kpiSummary">總分 90 / 150・平均 3・🟡 黃燈</span>`;
  container.appendChild(head);

  // 依六大面向分區塊（idx 維持 0–29 扁平編號，計分/草稿不受影響）
  let idx = 0;
  ASPECT_ORDER.forEach(aspectKey => {
    const aspect = KPI_ASPECTS[aspectKey];
    if (!aspect) return;

    const section = document.createElement('section');
    section.className = 'kpi-section';
    section.dataset.aspect = aspectKey;

    const sHead = document.createElement('button');
    sHead.type = 'button';
    sHead.className = 'kpi-section-head';
    sHead.innerHTML =
      `<span class="kpi-section-title">${KPI_ASPECT_ICON[aspectKey] || ''} ${escapeHtml(aspect.label)}` +
      `<span class="kpi-section-count">5 項</span></span>` +
      `<span class="kpi-section-right"><span class="kpi-section-avg" id="aspectAvg-${aspectKey}">3.0</span>` +
      `<span class="kpi-section-caret">▾</span></span>`;
    section.appendChild(sHead);

    const body = document.createElement('div');
    body.className = 'kpi-section-body';
    aspect.items.forEach(itemName => {
      const item = document.createElement('div');
      item.className = 'kpi-item';
      item.innerHTML = `
        <div class="kpi-item-row">
          <span class="kpi-item-name">${escapeHtml(itemName)}</span>
          <span class="kpi-item-score kpi-untouched" id="score-${idx}">滑動評分</span>
        </div>
        <input type="range" min="1" max="5" step="1" value="3"
               class="kpi-slider is-untouched" id="slider-${idx}"
               data-aspect="${aspectKey}" data-item="${itemName}" data-idx="${idx}" data-touched="0" />
        <div class="kpi-anchor kpi-anchor-hint" id="anchor-${idx}">← 拉一下，看看每一分代表什麼</div>
      `;
      body.appendChild(item);
      idx++;
    });
    section.appendChild(body);

    // 點標題收合／展開該面向，方便逐區評分
    sHead.addEventListener('click', () => section.classList.toggle('collapsed'));
    container.appendChild(section);
  });

  container.querySelectorAll('.kpi-slider').forEach(slider => {
    slider.addEventListener('input', onSliderChange);
  });
  recalcKpiSummary();
}

function toggleAbsenceReason(group) {
  const wrap = $id('absenceReasonWrap');
  const absent = isAbsenceGroup(group);
  if (wrap) wrap.style.display = absent ? '' : 'none';
  document.querySelectorAll('.training-only').forEach(el => {
    if (el.id === 'freestyleSection') {
      el.style.display = (!absent && isFreestyle(group)) ? '' : 'none';
    } else if (el.id === 'standardKpiSection') {
      el.style.display = (!absent && isDailyKpiAvailable()) ? '' : 'none';
    } else {
      el.style.display = absent ? 'none' : '';
    }
  });
  if (absent) {
    const topic = $id('trainingTopic');
    if (topic && !topic.value.trim()) topic.value = '未出席訓練';
    buildAbsenceChips();
    renderAbsenceImpact();
  } else if (wrap) {
    const imp = $id('absenceImpact'); if (imp) imp.style.display = 'none';
  }
}

// 建立未出席反思快捷 chip（點了把文字加入／移出對應 textarea）
function buildAbsenceChips() {
  buildChipToggler('absenceMissChips', 'absenceMiss', ABSENCE_MISS_CHIPS);
  buildChipToggler('absenceCatchupChips', 'absenceCatchup', ABSENCE_CATCHUP_CHIPS);
}
function buildChipToggler(boxId, targetId, items) {
  const box = $id(boxId);
  if (!box || box.dataset.ready) return;
  box.innerHTML = '';
  items.forEach(label => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = label;
    chip.addEventListener('click', () => {
      const ta = $id(targetId);
      if (!ta) return;
      const on = chip.classList.toggle('sel');
      let parts = ta.value.split(/[、,]\s*/).map(s => s.trim()).filter(Boolean);
      if (on) { if (parts.indexOf(label) === -1) parts.push(label); }
      else { parts = parts.filter(p => p !== label); }
      ta.value = parts.join('、');
    });
    box.appendChild(chip);
  });
  box.dataset.ready = '1';
}

/* ---- 飲食快速勾選標籤 ---- */
// 建立每餐的可點選標籤（state 直接掛在 chip 的 .sel class 上）
function buildMealTagChips() {
  Object.keys(MEAL_TAG_BOX).forEach(meal => {
    const box = $id(MEAL_TAG_BOX[meal]);
    if (!box || box.dataset.ready) return;
    box.innerHTML = '';
    (MEAL_TAG_OPTIONS[meal] || []).forEach(key => {
      const def = MEAL_TAG_DEFS[key];
      if (!def) return;
      const chip = document.createElement('span');
      chip.className = 'chip' + (def.kind === 'warn' ? ' chip-warn' : '');
      chip.textContent = def.label;
      chip.dataset.label = def.label;
      chip.addEventListener('click', () => {
        chip.classList.toggle('sel');
        saveDraft();
      });
      box.appendChild(chip);
    });
    box.dataset.ready = '1';
  });
}
// 讀某餐目前勾選的標籤文字陣列
function getMealTags(meal) {
  const box = $id(MEAL_TAG_BOX[meal]);
  if (!box) return [];
  return Array.from(box.querySelectorAll('.chip.sel')).map(c => c.dataset.label);
}
// 還原某餐的勾選狀態（草稿用）
function setMealTags(meal, tags) {
  const box = $id(MEAL_TAG_BOX[meal]);
  if (!box) return;
  const want = (tags || []).map(String);
  box.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('sel', want.indexOf(c.dataset.label) !== -1);
  });
}
// 全部餐點標籤一起讀 { breakfast:[], lunch:[], dinner:[], snacksDrinks:[] }
function getAllMealTags() {
  const out = {};
  Object.keys(MEAL_TAG_BOX).forEach(meal => { out[meal] = getMealTags(meal); });
  return out;
}
// 清空所有勾選
function clearMealTags() {
  Object.keys(MEAL_TAG_BOX).forEach(meal => {
    const box = $id(MEAL_TAG_BOX[meal]);
    if (box) box.querySelectorAll('.chip.sel').forEach(c => c.classList.remove('sel'));
  });
}

// 依個人最近出席紀錄，算出請假的累積影響，顯示在未出席表單上方
async function renderAbsenceImpact() {
  const box = $id('absenceImpact');
  if (!box) return;
  const name = $id('name') ? $id('name').value : '';
  if (!isAbsenceGroup($id('group').value) || !name) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = '<span class="review-label">讀取你的出席紀錄中…</span>';
  const dateStr = $id('date').value || todayStr();
  let recents = [];
  try { recents = await fetchRecentRecords(name, 90); } catch (e) { recents = []; }
  const ym = normDate(dateStr).slice(0, 7);
  const monthRecs = recents.filter(r => normDate(r.date).slice(0, 7) === ym && normDate(r.date) !== normDate(dateStr));
  const monthAbsent = monthRecs.filter(isAbsenceRecord).length;
  const monthPresent = monthRecs.filter(r => !isAbsenceRecord(r)).length;
  const sorted = recents.filter(r => normDate(r.date) !== normDate(dateStr))
    .sort((a, b) => normDate(b.date).localeCompare(normDate(a.date)));
  let streak = 0;
  for (const r of sorted) { if (isAbsenceRecord(r)) break; streak++; }
  const willBe = monthAbsent + 1;
  let html = `📅 本月（${ym}）：出席 <b>${monthPresent}</b> 次、未出席 <b>${monthAbsent}</b> 次<br>`;
  html += `📝 今天送出後，本月就是第 <b class="${willBe >= 3 ? 'imp-warn' : ''}">${willBe}</b> 次未出席`;
  if (willBe >= 3) html += `<br><span class="imp-warn">⚠️ 一個月未出席 ${willBe} 次，累積起來會明顯落後隊友，身手和體能都要花更多時間補回來。</span>`;
  if (streak >= 2) html += `<br>🔥 你之前<b>連續出席 ${streak} 次</b>，今天請假這個紀錄就會歸零。`;
  html += `<br>💪 隊友今天都在練。如果真的非請不可，把下面幾題想清楚，回來就追得回來。`;
  box.innerHTML = html;
}

// 分數對應顏色等級（1-2 紅、3 黃、4-5 綠）
function scoreLevelClass(val) {
  return val >= 4 ? 'lv-green' : val >= 3 ? 'lv-yellow' : 'lv-red';
}

// 套用某拉桿「已評分」的顯示：分數文字、錨點描述、顏色
function applySliderDisplay(slider) {
  const val = parseInt(slider.value, 10);
  const idx = slider.dataset.idx;
  const item = slider.dataset.item;
  const scoreEl = $id(`score-${idx}`);
  if (scoreEl) {
    scoreEl.textContent = `${val} 分 · ${SCORE_LABELS[val]}`;
    scoreEl.classList.remove('kpi-untouched', 'lv-red', 'lv-yellow', 'lv-green');
    scoreEl.classList.add(scoreLevelClass(val));
  }
  const anchorEl = $id(`anchor-${idx}`);
  const anchors = KPI_ANCHORS[item];
  if (anchorEl) {
    anchorEl.classList.remove('kpi-anchor-hint', 'lv-red', 'lv-yellow', 'lv-green');
    anchorEl.textContent = (anchors && anchors[val - 1]) ? anchors[val - 1] : '';
    anchorEl.classList.add(scoreLevelClass(val));
  }
}

// 把某拉桿重設回「未評分」狀態（不計入分數，必須動過才能送出）
function resetSliderUntouched(slider) {
  slider.value = 3;
  slider.dataset.touched = '0';
  slider.classList.add('is-untouched');
  const idx = slider.dataset.idx;
  const scoreEl = $id(`score-${idx}`);
  if (scoreEl) {
    scoreEl.textContent = '滑動評分';
    scoreEl.classList.remove('lv-red', 'lv-yellow', 'lv-green');
    scoreEl.classList.add('kpi-untouched');
  }
  const anchorEl = $id(`anchor-${idx}`);
  if (anchorEl) {
    anchorEl.textContent = '← 拉一下，看看每一分代表什麼';
    anchorEl.classList.remove('lv-red', 'lv-yellow', 'lv-green');
    anchorEl.classList.add('kpi-anchor-hint');
  }
}

function onSliderChange(e) {
  const slider = e.target;
  slider.dataset.touched = '1';
  slider.classList.remove('is-untouched');
  applySliderDisplay(slider);
  recalcKpiSummary();
}

// 即時更新總分/平均/燈號摘要（只計入「已評分」的項目，未評分不灌水）
function recalcKpiSummary() {
  const sliders = document.querySelectorAll('#kpiContainer .kpi-slider');
  if (!sliders.length) return;
  const total = sliders.length;
  let sum = 0, done = 0;
  const aSum = {}, aCnt = {};
  sliders.forEach(s => {
    if (s.dataset.touched !== '1') return;   // 未評分不計入
    const v = parseInt(s.value, 10);
    sum += v; done++;
    const a = s.dataset.aspect;
    aSum[a] = (aSum[a] || 0) + v; aCnt[a] = (aCnt[a] || 0) + 1;
  });
  const el = $id('kpiSummary');
  if (el) {
    const remain = total - done;
    if (done === 0) {
      el.textContent = `尚未評分・共 ${total} 項`;
    } else {
      const avg = round2(sum / done);
      const base = `已評 ${done}/${total}・平均 ${avg}・${judgeStatus(avg)}`;
      el.textContent = remain > 0 ? `${base}・還有 ${remain} 項未評分` : `總分 ${sum} / ${total * 5}・平均 ${avg}・${judgeStatus(avg)}`;
    }
  }

  // 各面向平均徽章（只算已評分；該面向全未評顯示「—」）
  ASPECT_ORDER.forEach(a => {
    const badge = $id(`aspectAvg-${a}`);
    if (!badge) return;
    badge.classList.remove('lv-red', 'lv-yellow', 'lv-green', 'lv-none');
    if (!aCnt[a]) { badge.textContent = '—'; badge.classList.add('lv-none'); return; }
    const av = round1(aSum[a] / aCnt[a]);
    badge.textContent = av.toFixed(1);
    badge.classList.add(av >= 4 ? 'lv-green' : av >= 3 ? 'lv-yellow' : 'lv-red');
  });
}

// 自由品勢額外欄位顯示用：有值才回傳一列 review-row
function freestyleExtraHtml(rec) {
  if (rec.group !== FREESTYLE_GROUP) return '';
  const row = (label, v, unit) => (v !== undefined && v !== null && String(v).trim() !== '')
    ? `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${escapeHtml(String(v))}${unit || ''}</span></div>` : '';
  let html = row('空中踢擊完成', rec.aerialKickCount, ' 腳');
  html += row('落地失誤', rec.landingErrors, ' 次');
  html += row('解鎖高難度動作', rec.unlockedMoves, '');
  return html;
}

/* ============================================================
   5. 分數計算、狀態、最低三項
   ============================================================ */

// 從目前表單拉桿收集分數（30 項扁平模型）
// 回傳：scores 仍依面向分桶（給 findLowItems / rawScoresJson 相容）、
//       aspectAvg（六面向各 5 題平均）、total（30 項加總 /150）、
//       average（total / 項目數）、count。
function collectScores() {
  const sliders = Array.from(document.querySelectorAll('#kpiContainer .kpi-slider'));
  const scores = {};        // { aspectKey: { itemName: value } }
  const sums = {}, counts = {};
  let total = 0;
  sliders.forEach(s => {
    const v = parseInt(s.value, 10);
    const a = s.dataset.aspect, item = s.dataset.item;
    if (!scores[a]) { scores[a] = {}; sums[a] = 0; counts[a] = 0; }
    scores[a][item] = v;
    sums[a] += v; counts[a] += 1;
    total += v;
  });
  const aspectAvg = {};
  Object.keys(sums).forEach(a => { aspectAvg[a] = round1(sums[a] / counts[a]); });
  const count = sliders.length || 1;
  const average = round2(total / count);
  return { scores, aspectAvg, total: round2(total), average, count };
}

// 保留相容：由 aspectAvg 估總分（舊呼叫用；新流程直接用 collectScores 的 total）
function computeTotals(aspectAvg) {
  let total = 0, n = 0;
  Object.keys(aspectAvg || {}).forEach(k => { total += aspectAvg[k]; n++; });
  total = round2(total);
  const average = round2(n ? total / n : 0);
  return { total, average };
}

// 狀態判斷
function judgeStatus(average) {
  if (average >= 4.0) return '🟢 綠燈';
  if (average >= 3.0) return '🟡 黃燈';
  return '🔴 紅燈';
}

/*
   疲勞與恢復指數：100 起扣分 → 對應五級恢復狀態。
   input: { sleepHours, sleepQuality, rpe, soreness, bodyStatus, painScore }
*/
function computeRecovery(input) {
  let score = 100;
  const sh = parseFloat(input.sleepHours);
  const rpe = parseFloat(input.rpe);
  const sore = parseFloat(input.soreness);
  const pain = parseFloat(input.painScore);
  if (!isNaN(sh) && sh < 6) score -= 25;
  if (input.sleepQuality === '差') score -= 20;
  if (!isNaN(rpe) && rpe > 8) score -= 20;
  if (!isNaN(sore) && sore >= 4) score -= 20;
  if (!isNaN(pain)) { if (pain >= 7) score -= 30; else if (pain >= 4) score -= 15; }
  if (input.bodyStatus === '疲勞') score -= 15;
  else if (input.bodyStatus === '不舒服') score -= 25;
  else if (input.bodyStatus === '受傷中') score -= 40;
  if (score < 0) score = 0;

  let state;
  if (score >= 80) state = '恢復良好';
  else if (score >= 60) state = '可正常訓練';
  else if (score >= 40) state = '注意疲勞';
  else if (score >= 20) state = '建議降低強度';
  else state = '建議教練關懷';
  return { score: score, state: state };
}

// 紅燈原因分類：回傳如 ['技術紅燈','戰術紅燈','恢復紅燈']
function redLightCategories(scores, nutritionRisks, recoveryState) {
  const cats = [];
  const seen = {};
  Object.keys(scores || {}).forEach(aspectKey => {
    const items = scores[aspectKey] || {};
    const low = Object.keys(items).some(it => items[it] < 3);
    if (low) {
      const label = ASPECT_REDLABEL[aspectKey];
      if (label && label !== '整體' && !seen[label]) { seen[label] = true; cats.push(label + '紅燈'); }
    }
  });
  if (nutritionRisks && nutritionRisks !== '無明顯風險') cats.push('飲食紅燈');
  if (recoveryState === '建議降低強度' || recoveryState === '建議教練關懷') cats.push('恢復紅燈');
  return cats;
}

// 找出所有低於 3 分的細項，取最低三項（同分依出現順序）
function findLowItems(scores) {
  const list = [];
  Object.keys(scores || {}).forEach(aspectKey => {
    const items = scores[aspectKey] || {};
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

  // 快速勾選標籤（優先採用）；舊資料／沒勾選時自動退回關鍵字判斷。
  // 同時相容兩種來源：data.mealTags（送出時即時勾選）與餐點字串裡的 〔…〕（讀回的歷史紀錄）。
  const mt = data.mealTags || {};
  const allTags = [].concat(
    mt.breakfast || parseMeal(breakfast).tags,
    mt.lunch || parseMeal(lunch).tags,
    mt.dinner || parseMeal(dinner).tags,
    mt.snacksDrinks || parseMeal(snacksDrinks).tags
  );
  const hasTag = (label) => allTags.indexOf(label) !== -1;

  const hasProtein = hasTag('蛋白質') || containsKeyword(allFood, NUTRITION_KEYWORDS.protein);
  const hasVegetable = hasTag('蔬菜') || containsKeyword(allFood, NUTRITION_KEYWORDS.vegetable);
  const hasStaple = hasTag('主食') || containsKeyword(allFood, NUTRITION_KEYWORDS.staple);
  const hasFruit = hasTag('水果') || containsKeyword(allFood, NUTRITION_KEYWORDS.fruit);
  const hasSugary = hasTag('含糖飲料') || containsKeyword(snacksDrinks, NUTRITION_KEYWORDS.sugaryDrink) || containsKeyword(allFood, NUTRITION_KEYWORDS.sugaryDrink);
  const hasFried = hasTag('油炸') || containsKeyword(allFood, NUTRITION_KEYWORDS.friedOily);
  const lowWater = (waterIntake === '少於 500ml' || waterIntake === '500-1000ml');
  const hasLateNight = lateNightSnack && lateNightSnack !== '無';
  const heavyLateNight = lateNightSnack === '有，偏多';
  const isHighIntensity = (trainingIntensity === '高' || trainingIntensity === '比賽日');
  const isRecoveryDay = (trainingIntensity === '恢復日');
  // 早餐：文字空 且 沒勾任何早餐標籤，才算沒吃
  const breakfastTags = mt.breakfast || parseMeal(breakfast).tags;
  const noBreakfast = isEmptyMeal(parseMeal(breakfast).text) && (!breakfastTags || !breakfastTags.length);

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

  // ---- 今日飲食優點 / 問題（青少年安全語氣）----
  const pros = [];
  if (hasProtein) pros.push('有吃到蛋白質，對肌肉修復很好');
  if (hasVegetable) pros.push('有攝取蔬菜，幫助消化與恢復');
  if (hasStaple) pros.push('有補充主食，訓練才有能量');
  if (hasFruit) pros.push('有吃水果，補充維生素與水分');
  if (!hasSugary) pros.push('沒有過多含糖飲料，很棒');
  if (!hasLateNight) pros.push('沒有吃宵夜，有助睡眠恢復');
  if (!pros.length) pros.push('今天有完成飲食紀錄，這就是好的開始');

  const problems = [];
  if (!hasProtein) problems.push('蛋白質偏少（蛋、豆漿、雞肉、魚、豆腐可補）');
  if (!hasVegetable) problems.push('蔬菜偏少');
  if (lowWater) problems.push('水量偏少');
  if (hasSugary) problems.push('含糖飲料偏多');
  if (heavyLateNight) problems.push('宵夜偏多');
  if (noBreakfast) problems.push('早餐不足');

  // ---- 賽前控重提醒（只在距目標過遠才顯示；青少年安全語氣，不提脫水/節食）----
  let weightControl = '';
  const gap = parseFloat(data.weightGap);
  if (!isNaN(gap) && gap >= 2) {
    weightControl = `目前體重距目標約 ${round1(gap)} kg。請用「規律三餐＋少含糖飲料與油炸、訓練量穩定」的方式慢慢調整，不要不吃飯、也不要脫水減重，安全最重要。如接近比賽再請教練協助安排。`;
  }

  // ---- 補水提醒 ----
  const hydration = lowWater
    ? '今天水分偏少，明天起訓練前先喝水，訓練中小口補水，訓練後也要補回流失的水分。'
    : '水分維持得不錯，繼續保持訓練前中後都有補水。';

  return { risks, student, parent, coach, nextGoal, pros, problems, weightControl, hydration };
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

function recordScoreMax(rec) {
  // 優先依實際題數計算，兼容舊制 6/10 題與新制 30 題。
  try {
    const scores = JSON.parse((rec && rec.rawScoresJson) || '{}');
    let n = 0;
    Object.keys(scores).forEach(k => { n += Object.keys(scores[k] || {}).length; });
    if (n > 0) return n * 5;
  } catch (e) { /* 落回下面判斷 */ }
  const total = parseFloat(rec && rec.totalScore) || 0;
  if (total > 50) return 150;
  return total > 30 ? 50 : 30;
}

function presentAspectKeys(avg) {
  return ASPECT_ORDER.filter(k => avg && avg[k] !== undefined && avg[k] !== null && avg[k] !== '' && !isNaN(parseFloat(avg[k])));
}

function presentAspectKeysFromRecord(rec) {
  return ASPECT_ORDER.filter(k => {
    const v = rec && rec[ASPECT_AVG_FIELD[k]];
    return v !== undefined && v !== null && String(v) !== '' && !isNaN(parseFloat(v));
  });
}

function scoreMaxText(rec) {
  return `${rec.totalScore || 0} / ${recordScoreMax(rec)}`;
}

function scoreCountFromRecord(rec, scores) {
  let count = 0;
  Object.keys(scores || {}).forEach(k => { count += Object.keys(scores[k] || {}).length; });
  if (count) return count;
  return recordScoreMax(rec) / 5;
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
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${scoreMaxText(rec)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${status}</span></div>`;

  const presentKeys = presentAspectKeysFromRecord(rec);
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">面向平均</h4><div class="aspect-grid">`;
  presentKeys.forEach(k => {
    html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`;
  });
  html += `</div>`;
  html += radarFromRecord(rec);  // 六大面向雷達圖

  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">上次身體狀態</h4>`;
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;

  // 當日飲食狀況（讓選手回顧前一天吃了什麼）
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">🍱 當日飲食狀況</h4>`;
  const mealRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${escapeHtml(val || '—').replace(/\n/g, '<br>')}</span></div>`;
  const foodRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${mealValueHtml(val)}</span></div>`;
  html += foodRow('早餐', rec.breakfast);
  html += foodRow('午餐', rec.lunch);
  html += foodRow('晚餐', rec.dinner);
  if (rec.snacksDrinks) html += foodRow('點心／飲料', rec.snacksDrinks);
  html += mealRow('今日水量', rec.waterIntake);
  html += mealRow('宵夜', rec.lateNightSnack);
  html += mealRow('訓練強度', rec.trainingIntensity);
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
  if (!box) return;   // 「今天我要改善」已移除
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
  const card = $id('improveCard');
  if (card) card.style.display = 'block';
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

// 取得某選手最近 N 筆（正式優先，否則本機）
async function fetchRecentRecords(name, limit) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getRecentRecordsByName', name: name, limit: limit || 60 });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { /* 落回本機 */ }
  }
  return localRecentRecords(name, limit || 60);
}

async function fetchParents() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getParents' });
      if (res && res.ok && Array.isArray(res.data)) {
        saveParentsLocal(res.data);
        return res.data;
      }
    } catch (e) { /* 落回本機 */ }
  }
  return getParentsLocal();
}

async function fetchAttendanceReports(name, limit) {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAttendanceReportsByName', studentName: name, name: name, limit: limit || 60 });
      if (res && res.ok && Array.isArray(res.data)) return normalizeAttendanceReports(res.data);
    } catch (e) { /* 落回本機 */ }
  }
  const local = getAttendanceReportsLocal().filter(r => String(r.studentName || r.name || '').trim() === String(name).trim());
  return normalizeAttendanceReports(local).slice(0, limit || 60);
}

async function fetchAllAttendanceReports() {
  const url = getWebAppUrl();
  if (url) {
    try {
      const res = await postToWebApp({ action: 'getAllAttendanceReports' });
      if (res && res.ok && Array.isArray(res.data)) return normalizeAttendanceReports(res.data);
    } catch (e) { /* 落回本機 */ }
  }
  return normalizeAttendanceReports(getAttendanceReportsLocal());
}

/* ============================================================
   9.6 進步肯定（跟昨天的自己比 / 成長型思維）
   ------------------------------------------------------------
   buildAffirmations：依今天這筆 rec、上一筆 last、歷史 history，
   算出徽章與具體肯定句。純前端計算，不寫入 Sheet。
   ============================================================ */

// 從一筆紀錄取某細項分數（找遍六大面向）
function itemScoreFromRecord(scoresObj, itemName) {
  for (let i = 0; i < ASPECT_ORDER.length; i++) {
    const k = ASPECT_ORDER[i];
    if (scoresObj[k] && scoresObj[k][itemName] != null) return scoresObj[k][itemName];
  }
  return null;
}

// Date -> yyyy-mm-dd
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function buildAffirmations(rec, last, history) {
  const badges = [];   // [{icon,label}]
  const lines = [];    // 具體肯定句
  const todayTotal = parseFloat(rec.totalScore) || 0;

  // 排除「今天這一天」的歷史（避免重送把自己當成過去）
  const past = (history || [])
    .filter(r => normDate(r.date) !== normDate(rec.date))
    .sort((a, b) => (a.timestamp || a.date) < (b.timestamp || b.date) ? 1 : -1);

  // ① 弱項翻轉：上次最低項，今天變高
  if (last) {
    let lastScores = {}, todayScores = {};
    try { lastScores = JSON.parse(last.rawScoresJson || '{}'); } catch (e) { /* */ }
    try { todayScores = JSON.parse(rec.rawScoresJson || '{}'); } catch (e) { /* */ }
    const lastLow = findLowItems(lastScores); // 上次低於 3 分的最低三項
    let flipped = false;
    lastLow.forEach(l => {
      const todayVal = itemScoreFromRecord(todayScores, l.item);
      if (todayVal != null && todayVal > l.score) {
        lines.push(`「${l.item}」${l.score} → ${todayVal}，你把昨天的弱點練成了今天的成長！`);
        flipped = true;
      }
    });
    if (flipped) badges.push({ icon: '🔁', label: '弱項翻轉' });
  }

  // ② 總分進步
  const lastTotal = last ? (parseFloat(last.totalScore) || 0) : null;
  if (lastTotal != null && todayTotal > lastTotal) {
    badges.push({ icon: '⭐', label: '進步之星' });
  }

  // ③ 個人最佳 PB：超越歷史最佳總分
  if (past.length) {
    const prevBest = Math.max.apply(null, past.map(r => parseFloat(r.totalScore) || 0));
    if (todayTotal > prevBest) {
      badges.push({ icon: '🏆', label: '個人最佳' });
      lines.push(`總分 ${todayTotal}，刷新你的個人最佳紀錄（之前最佳 ${prevBest}）！`);
    }
  }

  // ④ 連續進步（今天 > 上次 且 上次 > 上上次）
  if (past.length >= 2) {
    const t0 = parseFloat(past[0].totalScore) || 0;
    const t1 = parseFloat(past[1].totalScore) || 0;
    if (todayTotal > t0 && t0 > t1) badges.push({ icon: '📈', label: '連續進步' });
  }

  // ⑤ 連續紀錄天數（含今天，往回數連續有填的日子）
  const dateSet = {};
  (history || []).forEach(r => { dateSet[normDate(r.date)] = true; });
  dateSet[normDate(rec.date)] = true;
  let streak = 0;
  const cur = new Date(rec.date);
  while (dateSet[ymd(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
  if (streak >= 2) badges.push({ icon: '🔥', label: `連續紀錄 ${streak} 天` });

  // ⑥ 狀態與健康習慣徽章
  if (String(rec.status).indexOf('綠') !== -1) badges.push({ icon: '🟢', label: '綠燈狀態' });
  if (rec.nutritionRisks === '無明顯風險') badges.push({ icon: '🥗', label: '飲食零風險' });
  if (rec.waterIntake === '2000ml 以上' || rec.waterIntake === '1500-2000ml') badges.push({ icon: '💧', label: '水分達標' });

  return { badges, lines };
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
  const presentKeys = presentAspectKeysFromRecord(rec);
  const lowAspects = presentKeys.filter(k => avg[k] < 3).map(k => `${KPI_ASPECTS[k].label}（${avg[k]}）`);
  const low = findLowItems(scores);
  const count = scoreCountFromRecord(rec, scores);

  let inner = '';
  inner += `<div class="explain-line">平均 <b>${rec.averageScore}</b> ＝ 總分 <b>${rec.totalScore}</b> ÷ ${count}</div>`;
  inner += `<div class="explain-line">門檻：平均 ≥ 4.0 🟢　≥ 3.0 🟡　&lt; 3.0 🔴</div>`;
  if (lowAspects.length) inner += `<div class="explain-line">拉低的面向：${lowAspects.join('、')}</div>`;
  if (low.length) inner += `<div class="explain-line">最低細項：${low.map(l => `${l.item} ${l.score}分`).join('、')}</div>`;
  inner += `<div class="explain-line" style="color:var(--text-soft)">新紀錄為六面向共 30 項 KPI（滿分 150），平均分決定燈號；舊紀錄依原題數顯示。</div>`;

  return `<details class="explain"><summary>🔎 為什麼是「${rec.status}」？</summary><div class="explain-body">${inner}</div></details>`;
}

/* ---- 自評 vs 教練評對照 ---- */
function renderSelfVsCoach(rec) {
  if (!hasCoachReview(rec)) return '';
  const self = aspectAvgFromRecord(rec);
  const coach = coachAspectAvgFromRecord(rec);
  const keys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;

  let html = `<h4 style="margin:12px 0 6px;color:var(--blue)">⚖️ 自評 vs 教練評</h4>`;
  html += `<div class="table-scroll"><table class="record-table"><thead><tr><th>面向</th><th>自評</th><th>教練</th><th>差距</th></tr></thead><tbody>`;
  let bigGap = [];
  keys.forEach(k => {
    const s = self[k], c = coach[k];
    const gap = round1(c - s);
    let cls = 'tag-yellow';
    if (gap > 0) cls = 'tag-green'; else if (gap < 0) cls = 'tag-red';
    const flag = Math.abs(gap) >= 1 ? ' 💬' : '';
    if (Math.abs(gap) >= 1) bigGap.push(KPI_ASPECTS[k].label);
    html += `<tr><td>${KPI_ASPECTS[k].label}</td><td>${s}</td><td>${c}</td><td><span class="tag ${cls}">${gap > 0 ? '+' : ''}${gap}${flag}</span></td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="review-row"><span class="review-label">教練總分</span><span class="review-value">${rec.coachTotalScore} / ${keys.length * 5 || 30}（${rec.coachStatus || '-'}）</span></div>`;
  if (rec.coachComment) html += `<div class="hint-box">📣 教練評語：${escapeHtml(rec.coachComment)}</div>`;
  if (bigGap.length) html += `<div class="hint-box warn">💬 「${bigGap.join('、')}」你和教練看法差距較大，值得一起討論。<br><span style="color:var(--text-soft)">這裡是讓你說明想法，不是改分數，最終由教練綜合判斷。</span></div>`;
  return html;
}

/* ---- 六大面向雷達圖（純 SVG 手繪，不需任何圖表庫） ---- */
// selfAvg / coachAvg 皆為 { physical:.., technical:.., ... }；coachAvg 可省略
function radarChartSVG(selfAvg, coachAvg, opts) {
  const selfLabel = (opts && opts.selfLabel) || '自評';
  const coachLabel = (opts && opts.coachLabel) || '教練評';
  const size = 260, cx = size / 2, cy = size / 2, R = 88, MAX = 5;
  const labels = ['體能', '技術', '專注', '自律', '情緒', '戰術'];
  const keys = ASPECT_ORDER;

  // 第 i 軸、距中心 radius 的座標（從正上方開始，順時針每 60°）
  function polar(i, radius) {
    const ang = (-90 + i * 60) * Math.PI / 180;
    return [cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)];
  }
  function valuePoints(obj) {
    return keys.map((k, i) => {
      const v = Math.max(0, Math.min(MAX, parseFloat(obj[k]) || 0));
      const [x, y] = polar(i, R * v / MAX);
      return `${round1(x)},${round1(y)}`;
    }).join(' ');
  }

  // 背景同心多邊形（1~5 圈）
  let grid = '';
  for (let ring = 1; ring <= MAX; ring++) {
    const pts = keys.map((k, i) => { const [x, y] = polar(i, R * ring / MAX); return `${round1(x)},${round1(y)}`; }).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="#2c3442" stroke-width="1"/>`;
  }
  // 軸線 + 標籤
  let axes = '', labelSvg = '';
  for (let i = 0; i < 6; i++) {
    const [x, y] = polar(i, R);
    axes += `<line x1="${cx}" y1="${cy}" x2="${round1(x)}" y2="${round1(y)}" stroke="#2c3442" stroke-width="1"/>`;
    const [lx, ly] = polar(i, R + 20);
    labelSvg += `<text x="${round1(lx)}" y="${round1(ly)}" fill="#aab2c0" font-size="13" text-anchor="middle" dominant-baseline="middle">${labels[i]}</text>`;
  }
  // 自評多邊形（金）
  let poly = `<polygon points="${valuePoints(selfAvg)}" fill="rgba(245,197,24,0.25)" stroke="#f5c518" stroke-width="2.5"/>`;
  // 教練多邊形（藍虛線）
  let legend = `<span class="radar-leg"><i style="background:#f5c518"></i>${selfLabel}</span>`;
  if (coachAvg) {
    poly += `<polygon points="${valuePoints(coachAvg)}" fill="rgba(46,125,209,0.18)" stroke="#2e7dd1" stroke-width="2.5" stroke-dasharray="5 3"/>`;
    legend += `<span class="radar-leg"><i style="background:#2e7dd1"></i>${coachLabel}</span>`;
  }

  return `<div class="radar-wrap"><svg viewBox="0 0 ${size} ${size}" class="radar">${grid}${axes}${poly}${labelSvg}</svg><div class="radar-legend">${legend}</div></div>`;
}

// 從紀錄畫雷達圖（自動判斷有無教練評）
function radarFromRecord(rec) {
  const selfAvg = aspectAvgFromRecord(rec);
  const coachAvg = hasCoachReview(rec) ? coachAspectAvgFromRecord(rec) : null;
  return radarChartSVG(selfAvg, coachAvg);
}

/* ============================================================
   七天成長趨勢折線圖（純 SVG，股票走勢風）
   ============================================================ */

// series: [{label, value}] 由舊到新；range: {min,max}
function trendChartSVG(series, range) {
  const W = 640, H = 250, padL = 38, padR = 16, padT = 22, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = series.length;
  if (!n) return '<div class="hint-box">尚無足夠資料繪製趨勢。</div>';

  const minV = range.min, maxV = range.max, span = (maxV - minV) || 1;
  const xAt = i => padL + (n === 1 ? plotW / 2 : plotW * i / (n - 1));
  const yAt = v => padT + plotH * (1 - (Math.max(minV, Math.min(maxV, v)) - minV) / span);

  // 水平格線 + Y 軸刻度
  let grid = '';
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = minV + span * t / ticks;
    const y = yAt(val);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#2c3442" stroke-width="1"/>`;
    grid += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" fill="#aab2c0" font-size="11" text-anchor="end">${round1(val)}</text>`;
  }

  // 趨勢顏色：尾 >= 首 為綠（上升），否則紅
  const up = series[n - 1].value >= series[0].value;
  const lineColor = up ? '#2ecc71' : '#e74c3c';
  const areaColor = up ? 'rgba(46,204,113,0.16)' : 'rgba(231,76,60,0.16)';

  // 線與填色
  let dPath = '', area = '';
  series.forEach((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    dPath += `${cmd} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)} `;
  });
  area = dPath + `L ${xAt(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  // 資料點 + 數值 + X 軸日期
  let pts = '', xlabels = '';
  series.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.value);
    pts += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${lineColor}"/>`;
    pts += `<text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" fill="#f2f4f8" font-size="11" text-anchor="middle">${round1(p.value)}</text>`;
    xlabels += `<text x="${x.toFixed(1)}" y="${H - 12}" fill="#aab2c0" font-size="10.5" text-anchor="middle">${p.label}</text>`;
  });

  return `<div class="trend-wrap"><svg viewBox="0 0 ${W} ${H}" class="trend-chart">
    ${grid}
    <path d="${area}" fill="${areaColor}" stroke="none"/>
    <path d="${dPath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts}${xlabels}
  </svg></div>`;
}

// 把一筆紀錄的 KPI 表現換算成 0–100% 完成度（相容舊 /50 與新 /150 量表）。
// 優先用平均分（1–5，兩種量表通用）×20；沒有平均分時，依總分大小推估滿分基準。
function scorePercent(r) {
  const avg = parseFloat(r.averageScore);
  if (!isNaN(avg) && avg > 0) return round1(Math.min(100, avg * 20));
  const t = parseFloat(r.totalScore);
  if (isNaN(t) || t <= 0) return null; // 沒填 KPI 的當天回 null（趨勢圖會跳過，不畫成 0）
  const base = t > 50 ? 150 : 50; // >50 一定是新版 /150；否則視為舊版 /50
  return round1(Math.min(100, (t / base) * 100));
}

// 在 box 內渲染「可切換指標」的七天趨勢圖
function renderTrendSection(box, records, days, opts) {
  opts = opts || {};
  // 同一天只留一筆（新→舊）。不在這裡切片，改由「範圍選擇器」決定要看幾天。
  // 過濾未出席紀錄：請假日沒有 KPI/體重分數，留著會被當 0 分，使曲線假性暴跌、誤導 AI 分析。
  const allRecs = dedupeLatestByDate(records).filter(r => !isAbsenceRecord(r));
  if (allRecs.length < 2) {
    box.innerHTML = '<div class="hint-box">至少要 2 天的紀錄才看得出趨勢，繼續每天紀錄就會出現成長曲線！</div>';
    return;
  }

  const METRICS = [
    // 總分改為「完成度%」：KPI 量表歷經 /50（舊）與 /150（新）兩種滿分，
    // 直接畫原始總分會因基準不同而暴衝。改用平均分換算百分比（滿分 5 → 100%），
    // 新舊紀錄一致可比，不再有假跳動。
    { key: 'totalScore', label: '總分%', max: 100, min: 0, derive: scorePercent },
    { key: 'averageScore', label: '平均', max: 5, min: 0 },
    { key: 'physicalAvg', label: '體能', max: 5, min: 0 },
    { key: 'technicalAvg', label: '技術', max: 5, min: 0 },
    { key: 'focusAvg', label: '專注', max: 5, min: 0 },
    { key: 'disciplineAvg', label: '自律', max: 5, min: 0 },
    { key: 'emotionAvg', label: '情緒', max: 5, min: 0 },
    { key: 'tacticalAvg', label: '戰術', max: 5, min: 0 },
    { key: 'weightKg', label: '體重', max: null, min: null }
  ];
  let cur = METRICS[0];

  // 範圍選擇器：讓使用者把較舊的紀錄（如 5 月）也整合進來看
  // opts.picker === false（個人檔案的固定 7/30 兩張圖）則不顯示選擇器
  const showPicker = opts.picker !== false && allRecs.length > 7;
  const RANGES = [{ n: 7, label: '近 7 天' }];
  if (allRecs.length > 7) RANGES.push({ n: 30, label: '近 30 天' });
  if (allRecs.length > 30) RANGES.push({ n: 99999, label: '全部' });
  let range = Math.min(days || 7, allRecs.length);

  let html = '';
  if (showPicker) {
    html += `<div class="trend-range">`;
    RANGES.forEach(r => html += `<button type="button" class="trend-range-btn" data-range="${r.n}">${r.label}</button>`);
    html += `</div>`;
  }
  html += `<div class="trend-btns">`;
  METRICS.forEach(m => html += `<button type="button" class="trend-btn" data-key="${m.key}">${m.label}</button>`);
  html += `</div><div class="trend-chart-box"></div><div class="trend-summary"></div>`;
  html += `<button type="button" class="btn btn-secondary trend-ai-btn">🤖 AI 一鍵分析起伏</button><div class="trend-ai-box"></div>`;
  box.innerHTML = html;

  const chartBox = box.querySelector('.trend-chart-box');
  const summaryBox = box.querySelector('.trend-summary');
  const aiBox = box.querySelector('.trend-ai-box');

  function draw() {
    box.querySelectorAll('.trend-btn').forEach(b => b.classList.toggle('active', b.dataset.key === cur.key));
    box.querySelectorAll('.trend-range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.range, 10) === range));

    const recs = allRecs.slice(0, range).reverse(); // 取目前範圍，改為舊→新
    const valOf = r => {
      if (cur.derive) return cur.derive(r);
      const v = parseFloat(r[cur.key]);
      return isNaN(v) ? null : v;
    };
    // 沒填該指標的當天（值為 null）直接跳過，不畫成 0 造成假性暴跌
    const pts = recs.map(r => ({ r, v: valOf(r) })).filter(p => p.v !== null && p.v !== undefined);
    if (pts.length < 2) {
      chartBox.innerHTML = '<div class="hint-box">這個指標目前有效資料不足 2 天，無法畫出趨勢。</div>';
      summaryBox.innerHTML = '';
      return;
    }
    const vals = pts.map(p => p.v);
    let min = cur.min, max = cur.max;
    if (min === null || max === null) { // 體重：動態範圍
      const mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      min = Math.floor(mn - 1); max = Math.ceil(mx + 1);
      if (max - min < 2) max = min + 2;
    }
    const series = pts.map(p => ({ label: dateSlash(p.r.date).slice(5), value: p.v }));
    chartBox.innerHTML = trendChartSVG(series, { min, max });

    const first = vals[0], last = vals[vals.length - 1];
    const diff = round1(last - first);
    const dir = diff > 0 ? `📈 上升 ${diff}` : (diff < 0 ? `📉 下降 ${Math.abs(diff)}` : '➡️ 持平');
    summaryBox.innerHTML = `<b>${cur.label}</b>：${pts.length} 天從 <b>${round1(first)}</b> → <b>${round1(last)}</b>　<span class="${diff >= 0 ? 'up' : 'down'}">${dir}</span>`;
  }

  box.querySelectorAll('.trend-btn').forEach(b => b.addEventListener('click', () => {
    cur = METRICS.find(m => m.key === b.dataset.key) || METRICS[0];
    if (aiBox) aiBox.innerHTML = '';
    draw();
  }));
  box.querySelectorAll('.trend-range-btn').forEach(b => b.addEventListener('click', () => {
    range = Math.min(parseInt(b.dataset.range, 10), allRecs.length);
    if (aiBox) aiBox.innerHTML = '';
    draw();
  }));
  const aiBtn = box.querySelector('.trend-ai-btn');
  if (aiBtn) aiBtn.addEventListener('click', () => {
    const recs = allRecs.slice(0, range).reverse();
    aiBox.innerHTML = analyzeTrendSeries(recs, cur, METRICS);
  });
  draw();
}

/* ============================================================
   AI 趨勢分析（規則式）：解讀目前指標的起伏 + 跨面向掃描
   ------------------------------------------------------------
   recs：舊→新排序的紀錄；cur：目前選的指標；metrics：全部指標定義。
   純前端規則式（與 analyzeNutrition / buildCoachFeedback 同路線）。
   ============================================================ */
function analyzeTrendSeries(recs, cur, metrics) {
  if (!recs || recs.length < 2) return `<div class="hint-box">至少要 2 天紀錄才能分析起伏。</div>`;
  const valOf = (m, r) => {
    if (m.derive) return m.derive(r);
    const v = parseFloat(r[m.key]);
    return isNaN(v) ? null : v;
  };
  // 沒填該指標的當天排除，避免被當 0 分誤判成暴跌
  const pts = recs.map(r => ({ d: dateSlash(r.date).slice(5), v: valOf(cur, r) }))
    .filter(p => p.v !== null && p.v !== undefined)
    .map(p => ({ d: p.d, v: round1(p.v) }));
  if (pts.length < 2) return `<div class="hint-box">這個指標目前有效資料不足 2 天，無法分析起伏。</div>`;
  const vals = pts.map(p => p.v);
  const n = vals.length;
  const first = vals[0], last = vals[n - 1];
  const diff = round1(last - first);
  const higherBetter = cur.key !== 'weightKg';

  // 高峰 / 低谷
  let pk = 0, tr = 0;
  vals.forEach((v, i) => { if (v > vals[pk]) pk = i; if (v < vals[tr]) tr = i; });

  // 波動：相鄰變化的平均絕對值，相對於平均值歸一
  const swings = [];
  for (let i = 1; i < n; i++) swings.push(Math.abs(vals[i] - vals[i - 1]));
  const avgSwing = swings.length ? round1(swings.reduce((a, b) => a + b, 0) / swings.length) : 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const ratio = mean ? avgSwing / mean : 0;
  let volword, volcls;
  if (ratio < 0.05) { volword = '相當穩定'; volcls = 'good'; }
  else if (ratio < 0.12) { volword = '小幅起伏'; volcls = ''; }
  else { volword = '起伏明顯'; volcls = 'warn'; }

  // 結尾連續走向
  let streak = 1, sign = Math.sign(round1(vals[n - 1] - vals[n - 2]) || 0);
  for (let i = n - 2; i > 0; i--) {
    const s = Math.sign(round1(vals[i] - vals[i - 1]) || 0);
    if (s === sign && s !== 0) streak++; else break;
  }
  let momentum;
  if (sign > 0) momentum = `近 ${streak} 個紀錄${higherBetter ? '持續上升 📈' : '持續增加'}`;
  else if (sign < 0) momentum = `近 ${streak} 個紀錄${higherBetter ? '持續下滑 📉' : '持續下降'}`;
  else momentum = '最近持平';

  // 整體方向用語（體重中性，其他越高越好）
  let dirword, dircls;
  if (diff === 0) { dirword = '整體持平'; dircls = ''; }
  else if (!higherBetter) { dirword = `體重${diff > 0 ? '上升' : '下降'} ${Math.abs(diff)}`; dircls = ''; }
  else if (diff > 0) { dirword = `整體進步 +${diff}`; dircls = 'good'; }
  else { dirword = `整體下滑 ${diff}`; dircls = 'warn'; }

  // 跨面向掃描（六大面向，第一筆 vs 最後一筆）
  const aspectKeys = ['physicalAvg', 'technicalAvg', 'focusAvg', 'disciplineAvg', 'emotionAvg', 'tacticalAvg'];
  const ups = [], downs = [];
  aspectKeys.forEach(k => {
    const m = metrics.find(x => x.key === k); if (!m) return;
    const a = parseFloat(recs[0][k]), b = parseFloat(recs[recs.length - 1][k]);
    if (isNaN(a) || isNaN(b)) return;
    const d = round1(b - a);
    if (d >= 0.3) ups.push(`${m.label} +${d}`);
    else if (d <= -0.3) downs.push(`${m.label} ${d}`);
  });

  // 教練提醒
  let tip;
  if (!higherBetter) {
    tip = '體重變化請搭配訓練強度與目標體重一起看，短期波動多與水分有關，不需過度緊張。';
  } else if (diff > 0 && volcls !== 'warn') {
    tip = '走勢向上且穩定，保持目前的訓練與作息節奏，並把進步最多的面向變成習慣。';
  } else if (sign < 0 && streak >= 2) {
    tip = `留意近期連續下滑，先確認睡眠、疲勞與課業壓力${downs.length ? '，特別是「' + downs[0].split(' ')[0] + '」面向' : ''}，必要時和選手聊聊。`;
  } else if (volcls === 'warn') {
    tip = '分數起伏偏大，可能與睡眠、心情或訓練強度不穩有關，建議穩定作息、固定回報時間。';
  } else {
    tip = '整體大致持平，可挑一個面向設定明確小目標，創造下一段成長。';
  }

  let h = `<div class="trend-ai-card">`;
  h += `<div class="trend-ai-title">🤖 AI 起伏分析・<b>${escapeHtml(cur.label)}</b>（${n} 天）</div>`;
  h += `<ul class="trend-ai-list">`;
  h += `<li>走勢：<span class="tai ${dircls}">${dirword}</span>（${round1(first)} → ${round1(last)}）</li>`;
  h += `<li>波動：<span class="tai ${volcls}">${volword}</span>（平均每次變化 ${avgSwing}）</li>`;
  h += `<li>高峰：${pts[pk].d}（${pts[pk].v}）｜低谷：${pts[tr].d}（${pts[tr].v}）</li>`;
  h += `<li>近期動能：${momentum}</li>`;
  if (ups.length || downs.length) {
    h += `<li>面向掃描：`;
    if (ups.length) h += `<span class="tai good">📈 ${ups.join('、')}</span>　`;
    if (downs.length) h += `<span class="tai warn">📉 ${downs.join('、')}</span>`;
    h += `</li>`;
  }
  h += `</ul>`;
  h += `<div class="trend-ai-tip">💡 ${tip}</div>`;
  h += `</div>`;
  return h;
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
// 若欄位在收合的 <details> 內，先展開再聚焦，避免使用者看不到被提示的欄位
function focusField(id) {
  const el = $id(id);
  if (!el) return;
  let p = el.parentElement;
  while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
  el.focus();
}

function validateForm() {
  const group = $id('group').value;
  if (isAbsenceGroup(group)) {
    const required = [
      ['name', '選手姓名'], ['gradeClass', '年級／班級'], ['group', '組別'], ['absenceReason', '未出席訓練原因']
    ];
    for (const [id, label] of required) {
      const v = $id(id).value;
      if (!v || !String(v).trim()) { toast(`請填寫：${label}`); focusField(id); return false; }
    }
    return true;
  }
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

  // KPI 必填：每一項都要實際滑過（打破「全留 3 分」），只在每日 KPI 開放時檢查
  if (isDailyKpiAvailable()) {
    const untouched = Array.from(document.querySelectorAll('#kpiContainer .kpi-slider'))
      .filter(s => s.dataset.touched !== '1');
    if (untouched.length) {
      const first = untouched[0];
      const sec = first.closest('.kpi-section');
      if (sec) sec.classList.remove('collapsed');     // 展開該面向方便評分
      toast(`還有 ${untouched.length} 項 KPI 沒評分，每一項都拉一下再送出`);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.focus();
      return false;
    }
  }

  return true;
}

// 收集整筆紀錄物件（六面向共 30 項 KPI；總分/150、平均決定燈號）
function buildRecord() {
  const groupValue = $id('group').value;
  const absenceMode = isAbsenceGroup(groupValue);
  const kpiEnabled = !absenceMode && isDailyKpiAvailable();
  const scoreData = !kpiEnabled
    ? { scores: {}, aspectAvg: {}, total: '', average: '', count: 0 }
    : collectScores();
  const { scores, aspectAvg, total, average } = scoreData;
  const status = absenceMode ? '未出席訓練' : (kpiEnabled ? judgeStatus(average) : '已完成回報');
  const lowItems = kpiEnabled ? findLowItems(scores) : [];
  const lowItemsStr = lowItems.map(l => `${l.item}：${l.score} 分`).join('｜');

  const heightCm = $id('heightCm').value;
  const weightKg = $id('weightKg').value;
  const targetWeightKg = $id('targetWeightKg').value;
  const bmi = computeBmi(heightCm, weightKg);
  const weightGap = computeWeightGap(weightKg, targetWeightKg);
  const bodyStatus = $id('bodyStatus').value;

  // 新增：睡眠 / RPE / 痠痛 / 受傷部位 / 疼痛指數 / 尿液監控
  const bedTime = $id('bedTime') ? $id('bedTime').value : '';
  const wakeTime = $id('wakeTime') ? $id('wakeTime').value : '';
  const sleepHours = $id('sleepHours') ? $id('sleepHours').value : '';
  const sleepQuality = $id('sleepQuality') ? $id('sleepQuality').value : '';
  const soreness = $id('soreness') ? $id('soreness').value : '';
  const rpe = $id('rpe') ? $id('rpe').value : '';
  const injuryArea = $id('injuryArea') ? $id('injuryArea').value : '';
  const painScore = $id('painScore') ? $id('painScore').value : '';
  const painLevel = (painScore === '' ? '' : painGrade(parseInt(painScore, 10) || 0).label);
  const urineStatus = $id('urineStatus') ? $id('urineStatus').value : '';

  // 餐點：文字（學生打的字，給關鍵字分析用）＋快速勾選標籤（給標籤分析用）
  const mealTags = getAllMealTags();
  const mealText = {
    breakfast: $id('breakfast').value,
    lunch: $id('lunch').value,
    dinner: $id('dinner').value,
    snacksDrinks: $id('snacksDrinks').value
  };
  // 存檔字串：把標籤併進餐點欄（不需新增後端欄位）
  const mealStored = {
    breakfast: composeMeal(mealText.breakfast, mealTags.breakfast),
    lunch: composeMeal(mealText.lunch, mealTags.lunch),
    dinner: composeMeal(mealText.dinner, mealTags.dinner),
    snacksDrinks: composeMeal(mealText.snacksDrinks, mealTags.snacksDrinks)
  };
  const nutritionInput = {
    breakfast: mealText.breakfast,
    lunch: mealText.lunch,
    dinner: mealText.dinner,
    snacksDrinks: mealText.snacksDrinks,
    mealTags: mealTags,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    bmi: bmi, weightKg: weightKg, weightGap: weightGap, targetWeightKg: targetWeightKg
  };
  const nutrition = absenceMode
    ? { risks: [], student: '', parent: '', coach: { advice: '' }, nextGoal: '' }
    : analyzeNutrition(nutritionInput);

  // 恢復指數 + 紅燈原因分類（疼痛指數一併納入）
  const recovery = absenceMode
    ? { score: '', state: '' }
    : computeRecovery({ sleepHours, sleepQuality, rpe, soreness, bodyStatus, painScore });
  const nutritionRisks = nutrition.risks.join('、') || '無明顯風險';
  const redCats = absenceMode ? [] : redLightCategories(scores, nutritionRisks, recovery.state);

  const improveTargets = getCheckedImproveTargets().join('｜');
  const mainGoalToday = $id('mainGoalToday') ? $id('mainGoalToday').value : '';

  const rec = {
    recordId: 'r' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    timestamp: new Date().toISOString(),
    mode: 'standard',
    date: $id('date').value || todayStr(),
    name: $id('name').value,
    gradeClass: $id('gradeClass').value,
    group: groupValue,
    trainingTopic: $id('trainingTopic').value,
    absenceReason: $id('absenceReason') ? $id('absenceReason').value.trim() : '',
    absenceMiss: absenceMode && $id('absenceMiss') ? $id('absenceMiss').value.trim() : '',
    absenceCatchup: absenceMode && $id('absenceCatchup') ? $id('absenceCatchup').value.trim() : '',
    absenceHonesty: absenceMode && $id('absenceHonesty') ? $id('absenceHonesty').value : '',
    bodyStatus: bodyStatus,
    moodIndex: getMoodIndex(),
    moodReason: getMoodReason(),
    bedTime: bedTime,
    wakeTime: wakeTime,
    sleepHours: sleepHours,
    sleepQuality: sleepQuality,
    soreness: soreness,
    rpe: rpe,
    injuryArea: injuryArea,
    painScore: painScore,
    painLevel: painLevel,
    urineStatus: urineStatus,
    heightCm: heightCm,
    weightKg: weightKg,
    targetWeightKg: targetWeightKg,
    bmi: bmi,
    weightGap: weightGap,
    breakfast: mealStored.breakfast,
    lunch: mealStored.lunch,
    dinner: mealStored.dinner,
    snacksDrinks: mealStored.snacksDrinks,
    waterIntake: $id('waterIntake').value,
    lateNightSnack: $id('lateNightSnack').value,
    trainingIntensity: $id('trainingIntensity').value,
    physicalAvg: aspectAvg.physical != null ? aspectAvg.physical : '',
    technicalAvg: aspectAvg.technical != null ? aspectAvg.technical : '',
    focusAvg: aspectAvg.focus != null ? aspectAvg.focus : '',
    disciplineAvg: aspectAvg.discipline != null ? aspectAvg.discipline : '',
    emotionAvg: aspectAvg.emotion != null ? aspectAvg.emotion : '',
    tacticalAvg: aspectAvg.tactical != null ? aspectAvg.tactical : '',
    totalScore: total,
    averageScore: average,
    status: status,
    recoveryScore: recovery.score,
    recoveryState: recovery.state,
    redLightCategories: redCats.join('、'),
    lowItems: lowItemsStr,
    improveTargets: improveTargets,
    mainGoalToday: mainGoalToday,
    reflection: $id('reflection').value,
    tomorrowGoal: $id('tomorrowGoal').value,
    gratitude: $id('gratitude') ? $id('gratitude').value : '',
    encourageTeammateName: $id('encourageTeammate') ? $id('encourageTeammate').value : '',
    encouragementToTeammate: $id('encouragementToTeammate').value,
    nutritionRisks: nutritionRisks,
    nutritionAdviceStudent: nutrition.student,
    nutritionAdviceParent: nutrition.parent,
    nutritionAdviceCoach: JSON.stringify(nutrition.coach),
    rawScoresJson: JSON.stringify(scores),
    rawNutritionJson: JSON.stringify(nutrition)
  };
  // 反思彙整（可讀文字，存一欄，供教練／家長後台顯示）
  rec.absenceReflection = absenceMode
    ? `會少練到：${rec.absenceMiss || '（未填）'}\n打算怎麼補：${rec.absenceCatchup || '（未填）'}\n自我檢視：${rec.absenceHonesty || '（未填）'}`
    : '';
  rec._isAbsence = absenceMode;
  rec._kpiEnabled = kpiEnabled;
  rec._kpiSessionId = kpiEnabled && dailyKpiSession ? dailyKpiSession.sessionId : '';

  // 自由品勢額外欄位（其他項目維持空白）
  if (isFreestyle(rec.group)) {
    FREESTYLE_EXTRA_IDS.forEach(id => { const el = $id(id); rec[id] = el ? el.value : ''; });
  }

  // 暫存（送出時補 LINE / 比較卡用）
  rec._lowItemsArr = lowItems;
  rec._aspectAvg = aspectAvg;
  rec._nutrition = nutrition;
  rec._recovery = recovery;
  rec._redCats = redCats;
  return rec;
}

// 送出進行中旗標，避免連點造成重複送出
let _submitting = false;
// 最近一次送出產生的選手版 LINE 文字（供「送出並分享到 LINE」用）
let lastStudentLineText = '';

// 送出（正式）後直接分享選手版到 LINE
async function submitAndShareLine() {
  lastStudentLineText = '';
  const ok = await doSubmit('official');
  if (ok && lastStudentLineText) {
    // 確實存進 Google Sheet 才開 LINE，避免「LINE 有開、後台沒資料」
    shareToLine(lastStudentLineText);
  } else if (!ok && lastStudentLineText) {
    // 有跑送出流程但存後台失敗 → 不開 LINE，明確告知學生重送
    alert('⚠️ 這筆還沒成功存到後台，所以先不開 LINE。\n請確認網路後，再按一次「送出並分享到 LINE」。');
  }
  // lastStudentLineText 為空＝沒通過必填或取消，已有提示，不重複跳窗
}

// 本機今天是否已有同名紀錄
function localHasToday(name, date) {
  const d = normDate(date);
  return getLocalRecords().some(r => String(r.name) === String(name) && normDate(r.date) === d);
}

// 當日是否已送出過（先看本機，再看雲端最後一筆）
async function alreadySubmittedToday(name, date) {
  if (localHasToday(name, date)) return true;
  try {
    const last = await fetchLastRecord(name);
    if (last && normDate(last.date) === normDate(date)) return true;
  } catch (e) { /* 連線失敗就不擋，讓使用者照常送出 */ }
  return false;
}

// 主送出函式
async function doSubmit(mode) {
  if (_submitting) return false;      // 正在送出，忽略重複點擊
  if (!validateForm()) return false;

  if (mode === 'official' && !getWebAppUrl()) {
    toast('請先到「系統設定」貼上 Google Apps Script Web App URL。');
    switchTab('settings');
    return false;
  }

  // 鎖定送出按鈕，避免連點
  _submitting = true;
  const submitBtns = [$id('btnSubmit'), $id('btnLocalSubmit'), $id('btnSubmitShare')].filter(Boolean);
  submitBtns.forEach(b => b.disabled = true);

  try {
    // 當日重複送出防呆：今天已填過就先確認是否覆蓋
    const name = $id('name').value;
    const date = $id('date').value || todayStr();
    if (await alreadySubmittedToday(name, date)) {
      if (!confirm('⚠️ 你今天已經填過了，要用這次的內容覆蓋今天那筆嗎？')) {
        toast('已取消送出');
        return false;   // finally 會解鎖按鈕
      }
    }
    return await doSubmitInner(mode);
  } finally {
    _submitting = false;
    submitBtns.forEach(b => b.disabled = false);
  }
}

async function doSubmitInner(mode) {
  const rec = buildRecord();
  if (rec._isAbsence) return await doSubmitAbsence(mode, rec);

  // 取得上一筆與歷史（並行），做比較與進步肯定
  const [last, history] = await Promise.all([
    fetchLastRecord(rec.name),
    fetchRecentRecords(rec.name, 60)
  ]);

  // 進步肯定（跟昨天的自己比）
  const affirm = buildAffirmations(rec, last, history);

  // AI 教練回饋（選手／家長／教練三版本）
  const readiness = applyReadiness(rec, history);
  const feedback = buildCoachFeedback(rec, last, history, affirm);
  rec.feedbackStudentText = formatFeedbackText(feedback, 'student');
  rec.feedbackParentText = formatFeedbackText(feedback, 'parent');
  rec.feedbackCoachText = formatFeedbackText(feedback, 'coach');

  // 體重變化提醒
  let weightNote = '';
  if (last) weightNote = weightChangeNote(rec.weightKg, last.weightKg);

  // 產生 LINE 文字
  const lineTexts = buildLineTexts(rec, weightNote, affirm);
  lastStudentLineText = lineTexts.student;   // 供「送出並分享到 LINE」使用
  rec.studentLineText = lineTexts.student;
  rec.parentLineText = lineTexts.parent;
  rec.coachLineText = lineTexts.coach;
  rec.nutritionLineText = lineTexts.nutrition;

  // 移除暫存欄位再送出
  const payload = Object.assign({}, rec);
  delete payload._lowItemsArr; delete payload._aspectAvg; delete payload._nutrition;
  delete payload._recovery; delete payload._redCats; delete payload._isAbsence;
  delete payload._kpiEnabled; delete payload._kpiSessionId;

  let saved = false;   // 是否真的存進後台（official）／本機（local）

  if (mode === 'official') {
    toast('送出中...');
    try {
      const res = await postToWebApp({ action: 'addRecord', payload: payload });
      if (res && res.ok) {
        toast('✅ 已送出到 Google Sheet'); clearDraft(); saved = true;
        if (window.KpiSession && window.KpiSession.refreshStudent) window.KpiSession.refreshStudent();
      }
      else toast('⚠️ 送出失敗：' + (res && res.error ? res.error : '未知錯誤'));
    } catch (e) {
      toast('⚠️ 送出失敗，請檢查網路與 Web App 設定');
    }
    // 同時也存一份本機，方便離線查看
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
  } else {
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
    clearDraft();
    saved = true;
    toast('💾 已存入本機測試資料');
  }

  // 顯示回饋卡（AI 教練回饋卡為主，其餘維持原樣）
  renderCoachFeedbackCard(feedback);
  if (rec._kpiEnabled) renderCompareCard(rec, last, affirm);
  else { const compare = $id('compareCard'); if (compare) compare.style.display = 'none'; }
  renderNutritionCard(rec);
  renderLineCard(lineTexts);

  // 更新選手成長卡（連續天數／段位即時反映今天這筆）
  renderPlayerCard(rec.name);

  // 回報完成 → 抽運動心理小卡（純前端，集卡＋連續天數加成）
  if (window.PsychCards) try { window.PsychCards.onReportSubmitted(rec.name); } catch (e) {}

  // 捲動到 AI 教練回饋卡
  $id('coachFeedbackCard').scrollIntoView({ behavior: 'smooth' });

  return saved;
}

async function doSubmitAbsence(mode, rec) {
  const lineTexts = buildAbsenceLineTexts(rec);
  applyReadiness(rec, []);
  const feedback = buildCoachFeedback(rec, null, [], null);
  rec.feedbackStudentText = formatFeedbackText(feedback, 'student');
  rec.feedbackParentText = formatFeedbackText(feedback, 'parent');
  rec.feedbackCoachText = formatFeedbackText(feedback, 'coach');
  lastStudentLineText = lineTexts.student;
  rec.studentLineText = lineTexts.student;
  rec.parentLineText = lineTexts.parent;
  rec.coachLineText = lineTexts.coach;
  rec.nutritionLineText = '';

  const payload = Object.assign({}, rec);
  delete payload._lowItemsArr; delete payload._aspectAvg; delete payload._nutrition;
  delete payload._recovery; delete payload._redCats; delete payload._isAbsence;
  delete payload._kpiEnabled; delete payload._kpiSessionId;

  let saved = false;
  if (mode === 'official') {
    toast('送出未出席報告中...');
    try {
      const res = await postToWebApp({ action: 'addRecord', payload: payload });
      if (res && res.ok) { toast('✅ 已送出未出席訓練報告'); clearDraft(); saved = true; }
      else toast('⚠️ 送出失敗：' + (res && res.error ? res.error : '未知錯誤'));
    } catch (e) {
      toast('⚠️ 送出失敗，請檢查網路與 Web App 設定');
    }
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
  } else {
    saveLocalRecord(payload);
    upsertAttendanceReportFromKpi(payload);
    clearDraft();
    saved = true;
    toast('💾 已存入本機未出席報告');
  }

  renderCoachFeedbackCard(feedback);
  renderAbsenceReportCard(rec);
  $id('nutritionCard').style.display = 'none';
  renderLineCard(lineTexts);
  renderPlayerCard(rec.name);
  if (window.PsychCards) try { window.PsychCards.onReportSubmitted(rec.name); } catch (e) {}
  $id('coachFeedbackCard').scrollIntoView({ behavior: 'smooth' });
  return saved;
}

function buildAbsenceLineTexts(rec) {
  const dateText = dateSlash(rec.date);
  const reason = rec.absenceReason || '未填寫';
  const reflectionBlock = rec.absenceReflection ? `\n\n🤔 反思：\n${rec.absenceReflection}` : '';
  const student = `【未出席訓練報告】\n日期：${dateText}\n選手：${rec.name}\n原因：${reason}${reflectionBlock}`;
  const parent = `您好，${rec.name} 今日未出席訓練，系統已收到未出席訓練報告。\n原因：${reason}。\n孩子已寫下反思並規劃補回進度的方式，若需要歡迎與教練聯繫。`;
  const coach = `【未出席訓練回報】\n日期：${dateText}\n選手：${rec.name}\n班級：${rec.gradeClass || '-'}\n原因：${reason}${reflectionBlock}`;
  return { student, parent, coach, nutrition: '未出席訓練，不需填寫飲食建議。' };
}

function renderAbsenceReportCard(rec) {
  const card = $id('compareCard');
  const box = $id('compareContent');
  const reflectionHtml = rec.absenceReflection
    ? `<br><br><b>你的反思：</b><br>${escapeHtml(rec.absenceReflection).replace(/\n/g, '<br>')}` : '';
  box.innerHTML = `
    <div class="hint-box warn">
      <b>未出席訓練報告已建立</b><br>
      日期：${dateSlash(rec.date)}<br>
      選手：${escapeHtml(rec.name)}<br>
      原因：${escapeHtml(rec.absenceReason || '-')}${reflectionHtml}
    </div>
    <div class="hint-box good">把你寫下的補回方式做到，缺的這次就追得回來。明天見 💪</div>`;
  card.style.display = 'block';
}

/* ---- 進步肯定區塊 HTML（徽章＋具體肯定句）---- */
function affirmHtml(affirm) {
  if (!affirm || (!affirm.badges.length && !affirm.lines.length)) return '';
  let html = `<div class="affirm-box"><h4 class="affirm-title">🌟 今日進步肯定</h4>`;
  if (affirm.badges.length) {
    html += `<div class="badge-row">`;
    affirm.badges.forEach(b => html += `<span class="badge">${b.icon} ${b.label}</span>`);
    html += `</div>`;
  }
  affirm.lines.forEach(l => html += `<div class="hint-box good">🎉 ${l}</div>`);
  return html + `</div>`;
}

/* ---- 今日 vs 上次 ---- */
function renderCompareCard(rec, last, affirm) {
  const card = $id('compareCard');
  const box = $id('compareContent');
  if (!last) {
    box.innerHTML = affirmHtml(affirm) +
      `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。下一次就能看到進步比較了！</div>`;
    card.style.display = 'block';
    return;
  }

  const lastTotal = parseFloat(last.totalScore) || 0;
  const diff = round1(rec.totalScore - lastTotal);
  const lastAvg = aspectAvgFromRecord(last);

  let html = affirmHtml(affirm);   // 進步肯定放最上面

  // AI 分析：總分/平均/燈號
  html += `<div class="review-row"><span class="review-label">今日總分</span><span class="review-value">${rec.totalScore} / ${(rec._lowItemsArr ? '' : '')}50</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均分</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${rec.status}</span></div>`;
  const diffTag = diff >= 0 ? `<span class="tag tag-green">+${diff}</span>` : `<span class="tag tag-red">${diff}</span>`;
  html += `<div class="review-row"><span class="review-label">總分 vs 上次</span><span class="review-value">${lastTotal} → ${rec.totalScore}　${diffTag}</span></div>`;

  // 面向差異（只顯示本組有的面向）
  const presentKeys = ASPECT_ORDER.filter(k => rec._aspectAvg[k] != null);
  if (presentKeys.length) {
    html += `<h4 style="margin:12px 0 6px;color:var(--blue)">面向差異</h4><div class="aspect-grid">`;
    presentKeys.forEach(k => {
      const d = round1((rec._aspectAvg[k] || 0) - (lastAvg[k] || 0));
      const cls = d > 0 ? 'tag-green' : (d < 0 ? 'tag-red' : 'tag-yellow');
      html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="tag ${cls}">${d > 0 ? '+' : ''}${d}</span></div>`;
    });
    html += `</div>`;
  }

  // 紅燈原因分析
  if (rec._redCats && rec._redCats.length) {
    html += `<div class="hint-box warn">🚩 今日紅燈原因：${rec._redCats.join('、')}</div>`;
  }

  // 疲勞與恢復指數
  if (rec._recovery) {
    const rv = rec._recovery;
    const cls = (rv.state === '恢復良好' || rv.state === '可正常訓練') ? 'good' : 'warn';
    html += `<div class="hint-box ${cls}">🔋 恢復指數 ${rv.score}／100 → <b>${rv.state}</b></div>`;
  }

  // 今日訓練建議（最低 1–3 項，教練口吻）
  html += aiTrainingAdviceHtml(rec);

  // 體重變化
  const wDiff = round1(parseFloat(rec.weightKg) - parseFloat(last.weightKg));
  if (!isNaN(wDiff)) {
    const dir = wDiff < 0 ? `下降 ${Math.abs(wDiff)}` : (wDiff > 0 ? `上升 ${wDiff}` : '持平');
    html += `<div class="hint-box">⚖️ 體重變化：${last.weightKg} kg → ${rec.weightKg} kg，${dir} kg</div>`;
    const note = weightChangeNote(rec.weightKg, last.weightKg);
    if (note) html += `<div class="hint-box warn">${note}</div>`;
  }

  // 鼓勵語（成長型思維）：先看進步幅度，再依狀態補一句
  let encourage;
  if (diff > 0) encourage = '今天你有明顯進步，代表你不是只會填表，而是真的把昨天的問題帶進今天訓練裡修正了。能力正在因為你的努力而長大。';
  else if (diff === 0) encourage = '今天和上次差不多，穩定也是一種實力。別急著比輸贏，先讓自己每天強一點。';
  else encourage = '今天分數稍微低一點沒關係，你不是「不行」，只是「還沒」。重要的是你願意面對，明天帶著一個目標進場就會不一樣。';
  html += `<div class="hint-box good">💪 ${encourage}</div>`;
  html += `<div class="hint-box good">🌱 ${encouragementByStatus(rec.status)}</div>`;

  // 自由品勢額外紀錄
  html += freestyleExtraHtml(rec);

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

  // 今日飲食優點
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">✅ 今日飲食優點</h4><div>`;
  (n.pros || []).forEach(p => html += `<span class="tag tag-green">${p}</span>`);
  html += `</div>`;

  // 今日飲食問題
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">⚠️ 今日飲食問題</h4><div>`;
  if (n.problems && n.problems.length) n.problems.forEach(p => html += `<span class="tag tag-orange">${p}</span>`);
  else html += `<span class="tag tag-green">今天飲食大致均衡，繼續保持</span>`;
  html += `</div>`;

  // 明日建議
  html += `<div class="hint-box good">🎯 明日建議：${n.nextGoal}</div>`;

  // 補水提醒
  if (n.hydration) html += `<div class="hint-box">💧 ${n.hydration}</div>`;

  // 賽前控重提醒（距目標過遠才顯示）
  if (n.weightControl) html += `<div class="hint-box warn">⚖️ ${n.weightControl}</div>`;

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

/* ---- 今日訓練建議（最低 1–3 項，教練口吻）---- */
function aiTrainingAdviceHtml(rec) {
  const lowArr = rec._lowItemsArr || [];
  if (!lowArr.length) {
    return `<div class="hint-box good">🏋️ 今日訓練建議：今天沒有明顯弱項，明天可以挑戰更高品質與難度，把「穩定」練成你的強項。</div>`;
  }
  let html = `<h4 style="margin:12px 0 6px;color:var(--blue)">🏋️ 今日訓練建議</h4>`;
  lowArr.forEach(l => {
    const s = suggestionMap[l.item];
    const remind = s ? s.remind : '這一項還需要更穩定。';
    const advice = s ? s.advice : '明天放慢速度，把這個動作做確實再加速。';
    html += `<div class="hint-box warn"><b>${escapeHtml(l.item)}（${l.score} 分）</b>：${escapeHtml(remind)}<br>👉 ${escapeHtml(advice)}</div>`;
  });
  return html;
}

/* ============================================================
   AI 教練回饋卡（送出後即時產生｜選手／家長／教練三版本）
   ------------------------------------------------------------
   固定四段格式：【今天值得肯定】【今天要注意】【明日一件事】【教練一句話】
   依狀況自動切換語氣：綠燈／黃燈／紅燈／缺席／受傷／賽前。
   語氣設定：嚴格但不否定、鼓勵但不浮誇、看到問題但給方向，
   像一位真正的基層教練，常用關鍵字：堅持、自信、感恩、責任、比昨天更好。
   ============================================================ */

// 教練語錄庫：依學生狀態自動套用（含使用者指定的 6 句核心語錄）
const COACH_VOICE_QUOTES = {
  green: [
    '你不是突然變強，是前面那些沒人看到的努力開始出現了。',
    '狀態好的時候更要要求品質，這就是冠軍和一般選手的差別。',
    '今天做得好，記住這份手感；明天用更高的標準要求自己。'
  ],
  yellow: [
    '今天的問題不是用來責備你，是用來告訴你下一步要練什麼。',
    '穩住了，差的只是再多一點專注。把最弱那一項顧好，你就上去了。',
    '別急著證明自己有多強，先讓自己比昨天更好一點。'
  ],
  red: [
    '累的時候不是放棄，而是學會調整。',
    '真正強的選手，不是每天狀態都很好，而是狀態不好時還知道怎麼調整。',
    '分數低不可怕，怕的是不願意面對它。你今天願意面對，這就是責任。'
  ],
  injury: [
    '真正強的選手，不是每天狀態都很好，而是狀態不好時還知道怎麼調整。',
    '身體是你最重要的裝備，先保護好它，才有明天的舞台。',
    '今天忍住不硬練，是為了你能練得更久、走得更遠。'
  ],
  precomp: [
    '比賽不是證明你完美，而是檢查你平常有沒有準備好。',
    '賽前不是再加練，而是把身體和心理穩穩收好。',
    '相信你平常的累積，上場只要做你會的，就夠了。',
    '上場前不要想太多，記得你已經練過無數次。',
    '今天不是來害怕的，是來完成準備好的自己。',
    '把每一場都當成一次展現，不要當成壓力。',
    '專注第一個動作，後面的節奏就會跟上。',
    '你不用急著贏，只要先把該做的做好。',
    '場上最重要的，是相信自己的節奏。',
    '不要被對手牽著走，要打出自己的主動。',
    '開始之前深呼吸，開始之後全力執行。',
    '比賽不是考驗你完不完美，是考驗你能不能穩住。',
    '今天的你，只需要比昨天更勇敢。',
    '不管對手是誰，你都要先相信自己。',
    '上場就不要後悔，因為你已經努力走到這裡。',
    '把眼神拿出來，把氣勢拿出來，把訓練拿出來。',
    '比賽中不要急，穩住就是力量。',
    '一分一分拿，一秒一秒守，勝利會靠近。',
    '你不需要證明給所有人看，只要對得起自己的努力。',
    '不要怕輸，怕的是還沒開始就先放棄。',
    '場上要勇敢，場下才不會遺憾。',
    '今天不一定完美，但一定要全力。',
    '站上場，就是你勇敢的開始。',
    '別忘了，你是靠努力站到這裡的。',
    '比賽不是結束，是檢查自己成長到哪裡。',
    '動作要乾淨，心要安定，眼神要堅定。',
    '相信自己，然後把訓練交出來。',
    '這一場，不求無失誤，只求不退縮。'
  ],
  absence: [
    '請假不是問題，問題是你有沒有想好怎麼補回來。',
    '今天少的這一課，要靠你自己負責補回來，這就是選手的態度。',
    '沒來沒關係，但別讓今天變成習慣。想清楚，明天追回來。'
  ]
};

const SCENARIO_LABEL = {
  green: '🟢 綠燈・狀態好', yellow: '🟡 黃燈・穩定中', red: '🔴 紅燈・需要關心',
  injury: '🩹 受傷／不適・先保護身體', precomp: '🥇 賽前・穩定收尾', absence: '📋 未出席・反思與補訓'
};

function voiceQuote(scenario) {
  return randomPick(COACH_VOICE_QUOTES[scenario] || COACH_VOICE_QUOTES.yellow);
}

// 依當日紀錄判斷情境（優先序：缺席 > 受傷 > 賽前 > 紅/綠/黃燈）
function detectScenario(rec) {
  if (rec._isAbsence) return 'absence';
  const area = String(rec.injuryArea || '').trim();
  const hasInjury = rec.bodyStatus === '受傷中' || (area && area !== '無' && area !== '沒有');
  if (hasInjury) return 'injury';
  if (rec.trainingIntensity === '比賽日') return 'precomp';
  const s = String(rec.status || '');
  if (s.indexOf('紅') !== -1) return 'red';
  if (s.indexOf('綠') !== -1) return 'green';
  return 'yellow';
}

// 疲勞／恢復警訊：回傳 { hit, score, state, reasons[] }
function recoveryConcern(rec) {
  const rv = rec._recovery || {};
  const recScore = parseFloat(rv.score);
  const sleep = parseFloat(rec.sleepHours);
  const sore = parseFloat(rec.soreness);
  const rpe = parseFloat(rec.rpe);
  const reasons = [];
  if (!isNaN(sleep) && sleep < 6) reasons.push(`昨晚只睡 ${rec.sleepHours} 小時`);
  if (!isNaN(sore) && sore >= 4) reasons.push(`肌肉痠痛 ${rec.soreness}/5`);
  if (!isNaN(rpe) && rpe > 8) reasons.push(`RPE ${rec.rpe}/10 偏高`);
  if (rec.bodyStatus === '疲勞' || rec.bodyStatus === '不舒服') reasons.push(`身體狀態「${rec.bodyStatus}」`);
  const low = (!isNaN(recScore) && recScore < 60);
  return { hit: low || reasons.length > 0, score: rv.score, state: rv.state, reasons };
}

// 主要飲食問題 → 選手口吻一句話（沒問題回 ''）
function nutRiskMain(nut) {
  if (!nut || !nut.risks || !nut.risks.length) return '';
  if (nut.risks.indexOf('水量不足') !== -1) return '今天水喝得太少，水分不夠，恢復和專注都會打折，這點要先顧好。';
  if (nut.risks.indexOf('蛋白質不足') !== -1) return '今天蛋白質吃得不夠，肌肉修復會變慢，訓練的效果留不住。';
  if (nut.risks.indexOf('含糖飲料偏多') !== -1) return '今天含糖飲料偏多，糖分會影響恢復和體重控制，慢慢把它換成水。';
  return '今天飲食有幾個地方可以再調整：' + nut.risks.slice(0, 2).join('、') + '。';
}
function nutTask(nut) {
  if (!nut || !nut.risks || !nut.risks.length) return '';
  if (nut.risks.indexOf('水量不足') !== -1) return '明天一整天把水喝到 1500ml 以上，訓練前中後都補一點，你會發現體力比較撐得住。';
  if (nut.risks.indexOf('蛋白質不足') !== -1) return '明天三餐各加一份蛋白質（蛋、豆漿、雞肉、魚都行），訓練後一小時內補一份，恢復會更快。';
  if (nut.risks.indexOf('含糖飲料偏多') !== -1) return '明天把一杯含糖飲料換成水或無糖茶，先從「少一杯」開始。';
  return '';
}

// 受傷／賽前情境的注意與任務（依版本給不同口吻）
function injuryWatch(version, rec) {
  const area = String(rec.injuryArea || '').trim();
  const areaTxt = (area && area !== '無' && area !== '沒有') ? `（${area}）` : '';
  if (version === 'parent') return `孩子今天身體狀況需要留意${areaTxt}，已提醒他不要勉強訓練，以保護身體、避免運動傷害為優先。`;
  if (version === 'coach') return `⚠️ 傷況/不適${areaTxt}：今日應降載或改恢復性訓練，避免患部負荷；必要時請家長協助就醫並追蹤恢復。`;
  return `你的身體現在是受傷／不舒服的狀態${areaTxt}。保護身體永遠擺第一，今天不要為了面子或進度硬踢，傷拖久了反而更慢。`;
}
function injuryTask(version, rec) {
  if (version === 'parent') return '今天請讓孩子充分休息，注意患部冰敷／保暖與睡眠；若持續疼痛，建議就醫檢查。';
  if (version === 'coach') return '明天先確認傷況再決定訓練量，安排不負荷患部的核心與恢復訓練，並回報恢復狀況。';
  return '明天訓練前先跟教練回報傷勢，只做不會痛的範圍動作與核心、伸展，會痛就停，不硬撐。';
}
function precompWatch(version, rec) {
  if (version === 'parent') return '孩子接近比賽，這幾天最重要的是規律睡眠、正常飲食與穩定情緒，不需要再給額外壓力。';
  if (version === 'coach') return '🥇 賽前期：控管訓練量避免過度疲勞，盯睡眠、體重與情緒穩定，技術以收尾、建立信心為主。';
  return '比賽快到了，現在的重點不是再硬加練，而是把「狀態、睡眠、體重、心理」四件事穩住，讓身體在比賽當天是滿的。';
}
function precompTask(version, rec) {
  const w = parseFloat(rec.weightGap);
  let weightLine = '';
  if (!isNaN(w) && w >= 1) weightLine = `體重距目標還有 ${rec.weightGap} kg，飲食清淡、控制份量但不要激烈節食；`;
  if (version === 'parent') return '今晚協助孩子早點睡、吃得清淡正常，讓他帶著穩定的身心去比賽。';
  if (version === 'coach') return `${weightLine}明天以技術收尾＋心理建設為主，確認睡眠與體重，不再上大強度。`;
  return `${weightLine}今晚早點睡、吃得清淡正常，明天訓練重質不重量，把會的動作做穩，告訴自己「我準備好了」。`;
}

// 三版本內容組裝
function trainingStudentFB(rec, scenario, c) {
  const fb = { affirm: '', watch: '', oneThing: '', quote: c.quote };
  if (c.affirm && c.affirm.lines && c.affirm.lines.length) {
    fb.affirm = c.affirm.lines[0];
  } else if (c.topItem && c.topItem.score >= 4) {
    fb.affirm = `「${c.topItem.item}」${c.topItem.score} 分，是你今天最穩的一塊，這是你練出來的本事，記住這個感覺。`;
  } else if (scenario === 'green') {
    fb.affirm = `今天整體狀態${rec.status}、平均 ${rec.averageScore} 分，你把狀態維持住了，這份穩定不是運氣，是你撐出來的。`;
  } else if (scenario === 'precomp') {
    fb.affirm = `賽前你還願意把每一項認真記錄，代表你有在為比賽負責，這份態度教練看見了。`;
  } else {
    fb.affirm = `今天狀態不算最好，但你還是來了、還是誠實把自己記錄下來，這就是一個選手該有的責任感。`;
  }

  if (scenario === 'injury') fb.watch = injuryWatch('student', rec);
  else if (scenario === 'precomp') fb.watch = precompWatch('student', rec);
  else if (c.recv.hit) {
    const why = c.recv.reasons.length ? '（' + c.recv.reasons.join('、') + '）' : '';
    fb.watch = `你的身體在喊累${why}。狀態不好不是藉口，但硬撐只會讓品質和受傷風險一起變高，要先學會調整。`;
  } else if (c.lowArr.length) {
    const it = c.lowArr[0];
    const remind = (suggestionMap[it.item] && suggestionMap[it.item].remind) || '這一項還沒到位，會影響整體表現。';
    fb.watch = `今天最弱的是「${it.item}」（${it.score} 分）。${remind}`;
  } else if (nutRiskMain(c.nut)) {
    fb.watch = nutRiskMain(c.nut);
  } else {
    fb.watch = `今天沒有明顯的弱項，代表你可以開始要求「更高的品質」，而不是只把動作做完。`;
  }

  if (scenario === 'injury') fb.oneThing = injuryTask('student', rec);
  else if (scenario === 'precomp') fb.oneThing = precompTask('student', rec);
  else if (c.recv.hit) fb.oneThing = '今晚 11 點前睡、睡滿 8 小時；明天先做完整暖身和伸展，再慢慢把強度拉上來，不要一上來就硬操。';
  else if (c.lowArr.length) {
    const it = c.lowArr[0];
    const adv = (suggestionMap[it.item] && suggestionMap[it.item].advice);
    fb.oneThing = adv ? `針對「${it.item}」：${adv}` : `明天把「${it.item}」單獨抓出來練 10 次，做穩再加速。`;
  } else {
    const ntask = nutTask(c.nut);
    if (ntask) fb.oneThing = ntask;
    else if (rec.tomorrowGoal && rec.tomorrowGoal.trim()) fb.oneThing = `照你自己寫的目標走：${rec.tomorrowGoal.trim()}。只要做到這一件，明天就值得。`;
    else fb.oneThing = '明天把今天最穩的那一項當成基準，要求自己再穩一次——進步就是這樣一次一次疊出來的。';
  }
  return fb;
}

function trainingParentFB(rec, scenario, c) {
  const fb = { affirm: '', watch: '', oneThing: '', quote: c.quote };
  const name = rec.name || '孩子';
  if (c.affirm && c.affirm.lines && c.affirm.lines.length) fb.affirm = `${name}今天有具體進步：${c.affirm.lines[0]}`;
  else if (c.topItem && c.topItem.score >= 4) fb.affirm = `${name}今天在「${c.topItem.item}」表現不錯，這是他持續努力累積出來的成果。`;
  else if (scenario === 'green') fb.affirm = `${name}今天整體訓練狀態良好、很穩定，請肯定他的努力。`;
  else fb.affirm = `${name}今天狀態雖然不是最好，但仍準時參加並誠實完成記錄，這份責任感值得肯定。`;

  if (scenario === 'injury') fb.watch = injuryWatch('parent', rec);
  else if (scenario === 'precomp') fb.watch = precompWatch('parent', rec);
  else if (c.recv.hit) fb.watch = `${name}今天身體較疲累、需要休息，主要和睡眠或訓練後恢復有關，請多留意他的作息。`;
  else if (c.lowArr.length) fb.watch = softenForParent(`今天比較需要加強的是「${c.lowArr[0].item}」，教練明天會帶著他一起調整方向，不用擔心。`);
  else fb.watch = `${name}今天沒有明顯的弱項、狀態穩定，可以鼓勵他往更高的目標挑戰。`;

  if (scenario === 'injury') fb.oneThing = injuryTask('parent', rec);
  else if (scenario === 'precomp') fb.oneThing = precompTask('parent', rec);
  else if (c.recv.hit) fb.oneThing = '今晚請協助孩子早點休息、睡飽一點；一句「辛苦了，先把身體顧好」會讓他更安心。';
  else {
    let base;
    if (c.lowArr.length) base = `明天孩子會針對「${c.lowArr[0].item}」加強，您可以回家問問他今天練了什麼，給他一句肯定。`;
    else if (rec.tomorrowGoal && rec.tomorrowGoal.trim()) base = `孩子幫自己訂的目標是「${rec.tomorrowGoal.trim()}」，可以陪他一起記得這件事。`;
    else base = '可以問問孩子明天想做到的一件事，聽他說、給他鼓勵就好。';
    fb.oneThing = base + ' 鼓勵的重點放在「努力」而不是分數，他會更願意堅持。';
  }
  return fb;
}

function trainingCoachFB(rec, scenario, c) {
  const fb = { affirm: '', watch: '', oneThing: '', quote: c.quote };
  if (c.affirm && c.affirm.lines && c.affirm.lines.length) fb.affirm = c.affirm.lines[0];
  else if (c.topItem) fb.affirm = `亮點：「${c.topItem.item}」${c.topItem.score} 分；整體 ${rec.status}、平均 ${rec.averageScore}。`;
  else fb.affirm = `出席並完成記錄；整體 ${rec.status}、平均 ${rec.averageScore}。`;

  const risks = [];
  if (scenario === 'injury') risks.push(injuryWatch('coach', rec));
  if (scenario === 'precomp') risks.push(precompWatch('coach', rec));
  if (c.recv.hit) risks.push(`恢復偏低（恢復指數 ${c.recv.score}/100・${c.recv.state}）${c.recv.reasons.length ? '：' + c.recv.reasons.join('、') : ''}`);
  if (rec._redCats && rec._redCats.length) risks.push(`紅燈面向：${rec._redCats.join('、')}`);
  if (c.lowArr.length) risks.push(`最低項：${c.lowArr.map(l => l.item + ' ' + l.score + '分').join('、')}`);
  if (c.nut && c.nut.risks && c.nut.risks.length) risks.push(`飲食：${c.nut.risks.join('、')}`);
  fb.watch = risks.length ? risks.join('\n') : '無明顯風險，狀態穩定。';

  if (scenario === 'injury') fb.oneThing = injuryTask('coach', rec);
  else if (scenario === 'precomp') fb.oneThing = precompTask('coach', rec);
  else if (c.recv.hit) fb.oneThing = '明天先確認其恢復狀況、視情況降載，盯暖身與睡眠回報，避免硬上強度。';
  else if (c.lowArr.length) {
    const it = c.lowArr[0];
    const adv = (suggestionMap[it.item] && suggestionMap[it.item].advice) || `針對「${it.item}」安排個別修正。`;
    fb.oneThing = `盯「${it.item}」：${adv}`;
  } else fb.oneThing = '維持訓練節奏，給予更高品質要求與下一階段挑戰目標。';
  return fb;
}

// 缺席三版本
function absenceStudentFB(rec, quote) {
  const miss = (rec.absenceMiss || '').trim();
  const catchup = (rec.absenceCatchup || '').trim();
  return {
    affirm: '你願意誠實寫下今天沒辦法來的原因和反思，這點值得肯定——不逃避，就是負責任的開始。',
    watch: `今天少練到的是：${miss || '今天該練的內容'}。請假本身不是問題，問題是這些有沒有補回來；隊友今天都在練，落下的會一點一點累積。`,
    oneThing: catchup
      ? `把你自己寫的補回方式做到：${catchup}。做到了，今天這一課就追得回來。`
      : '今晚自己排一個 20–30 分鐘的補訓（核心、伸展或看教學影片），把今天少的補一點回來。',
    quote: quote
  };
}
function absenceParentFB(rec, quote) {
  const name = rec.name || '孩子';
  return {
    affirm: `${name}今天未能出席，但已主動填寫原因並寫下反思，這份誠實與負責的態度請給予肯定。`,
    watch: '今天的訓練內容會需要找時間補回來，避免進度落後；若是身體因素，請以健康為優先。',
    oneThing: '可以陪孩子確認他的補訓計畫，提醒他「請假沒關係，補回來才是重點」，給他一點支持。',
    quote: quote
  };
}
function absenceCoachFB(rec, quote) {
  const honesty = rec.absenceHonesty || '';
  const flag = honesty.indexOf('不太想') !== -1 ? '⚠️ 自述為「能來但不太想」，需個別關心動機與態度。' : '';
  return {
    affirm: `${rec.name} 已完成未出席報告與反思。`,
    watch: `原因：${rec.absenceReason || '未填'}。自我檢視：${honesty || '未填'}。${flag}`,
    oneThing: '指派一項補訓任務並追蹤完成；連續或頻繁請假者安排個別晤談。',
    quote: quote
  };
}

function statusTone(status) {
  const s = String(status || '');
  if (s.indexOf('綠') !== -1) return 'good';
  if (s.indexOf('紅') !== -1) return 'danger';
  return 'warn';
}

// 今日狀態小格
function buildStatusGrid(rec, scenario, recv) {
  const grid = [];
  if (scenario === 'absence') {
    grid.push({ label: '出席', value: '未出席訓練', tone: 'warn' });
    grid.push({ label: '日期', value: dateSlash(rec.date), tone: '' });
    if (rec.absenceReason) grid.push({ label: '原因', value: rec.absenceReason, tone: '' });
    return grid;
  }
  grid.push({ label: '狀態', value: rec.status, tone: statusTone(rec.status) });
  if (rec.totalScore !== '' && rec.totalScore != null) {
    grid.push({ label: '總分', value: scoreMaxText(rec), tone: '' });
    grid.push({ label: '平均', value: rec.averageScore + ' / 5', tone: '' });
  }
  if (rec._recovery && rec._recovery.score !== '' && rec._recovery.score != null) {
    grid.push({ label: '恢復指數', value: `${rec._recovery.score}/100 ${rec._recovery.state}`, tone: recv.hit ? 'warn' : 'good' });
  }
  if (rec.bodyStatus) {
    const t = (rec.bodyStatus === '受傷中' || rec.bodyStatus === '不舒服') ? 'danger' : (rec.bodyStatus === '疲勞' ? 'warn' : 'good');
    grid.push({ label: '身體', value: rec.bodyStatus, tone: t });
  }
  if (String(rec.moodIndex || '').trim() !== '') {
    const mi = parseFloat(rec.moodIndex);
    grid.push({ label: '心情', value: moodText(rec.moodIndex), tone: mi <= 2 ? 'warn' : (mi >= 4 ? 'good' : 'none') });
  }
  if (String(rec.sleepHours).trim() !== '') grid.push({ label: '睡眠', value: `${rec.sleepHours} 小時${rec.sleepQuality ? '・' + rec.sleepQuality : ''}`, tone: (parseFloat(rec.sleepHours) < 6 ? 'warn' : '') });
  if (String(rec.rpe).trim() !== '') grid.push({ label: 'RPE', value: `${rec.rpe}/10`, tone: (parseFloat(rec.rpe) > 8 ? 'warn' : '') });
  if (String(rec.soreness).trim() !== '') grid.push({ label: '痠痛', value: `${rec.soreness}/5`, tone: (parseFloat(rec.soreness) >= 4 ? 'warn' : '') });
  return grid;
}

// 主入口：產生整份 AI 教練回饋（三版本）
function buildCoachFeedback(rec, last, history, affirm) {
  const scenario = detectScenario(rec);
  const quote = voiceQuote(scenario);
  const readiness = rec.finalReadinessScore !== undefined && rec.finalReadinessScore !== ''
    ? buildReadinessAnalysis(rec, history || [])
    : applyReadiness(rec, history || []);

  let scores = {};
  try { scores = JSON.parse(rec.rawScoresJson || '{}'); } catch (e) { /* */ }
  const allItems = [];
  Object.keys(scores).forEach(a => Object.keys(scores[a] || {}).forEach(it => allItems.push({ item: it, score: scores[a][it] })));
  allItems.sort((a, b) => b.score - a.score);

  const c = {
    lowArr: rec._lowItemsArr || [],
    topItem: allItems.length ? allItems[0] : null,
    recv: recoveryConcern(rec),
    nut: rec._nutrition || { risks: [] },
    affirm: affirm, last: last, quote: quote
  };

  let versions;
  if (scenario === 'absence') {
    versions = { student: absenceStudentFB(rec, quote), parent: absenceParentFB(rec, quote), coach: absenceCoachFB(rec, quote) };
  } else {
    versions = {
      student: readinessStudentVersion(rec, readiness),
      parent: readinessParentVersion(rec, readiness),
      coach: readinessCoachVersion(rec, readiness)
    };
  }

  return {
    scenario: scenario,
    scenarioLabel: scenario === 'absence' ? SCENARIO_LABEL[scenario] : readiness.statusLight,
    header: { name: rec.name || '選手', date: dateSlash(rec.date), scenarioLabel: scenario === 'absence' ? SCENARIO_LABEL[scenario] : readiness.statusLight },
    statusGrid: buildStatusGrid(rec, scenario, c.recv).concat(scenario === 'absence' ? [] : [
      { label: '訓練準備度', value: readiness.finalReadinessScore + ' / 100', tone: readinessToneCls(readiness.statusLight) },
      { label: '訓練方向', value: readiness.statusLight, tone: readinessToneCls(readiness.statusLight) },
      { label: 'AI 標籤', value: readiness.aiTags.join('、') || '穩定', tone: readiness.aiTags.length ? 'warn' : 'good' }
    ]),
    moodLow: !isNaN(parseFloat(rec.moodIndex)) && parseFloat(rec.moodIndex) <= 2,
    readiness: readiness,
    versions: versions
  };
}

/* ---- 固定四段格式的 LINE 可複製文字 ---- */
const FB_VERSION_HEAD = {
  student: '🥋 給選手｜AI 教練回饋',
  parent: '👨‍👩‍👧 給家長｜AI 教練回饋',
  coach: '📊 教練紀錄｜AI 回饋'
};
function formatFeedbackText(fb, version) {
  const v = fb.versions[version];
  const h = fb.header;
  let out = `${FB_VERSION_HEAD[version]}\n育林國中技擊隊\n${h.name}｜${h.date}｜${h.scenarioLabel}\n\n`;
  out += `【今日狀態】\n${v.affirm}\n\n`;
  out += `【為什麼是這個狀態】\n${v.watch}\n\n`;
  out += `【明日一個具體任務】\n${v.oneThing}\n\n`;
  out += `【正向提醒】\n${v.quote}`;
  return out;
}

/* ---- 渲染 AI 教練回饋卡（含三版本切換 / 複製 / 分享 LINE）---- */
let _currentFeedback = null;
let _currentFbVersion = 'student';

function renderCoachFeedbackCard(fb) {
  _currentFeedback = fb;
  const card = $id('coachFeedbackCard');
  if (!card) return;

  const badge = $id('cfbStatusBadge');
  badge.textContent = fb.scenarioLabel;
  badge.className = 'cfb-badge cfb-badge-' + fb.scenario;

  $id('cfbStatusGrid').innerHTML = fb.statusGrid.map(g =>
    `<div class="cfb-stat"><span class="cfb-stat-label">${escapeHtml(g.label)}</span><span class="cfb-stat-value cfb-tone-${g.tone || 'none'}">${escapeHtml(g.value)}</span></div>`
  ).join('');

  card.querySelectorAll('.cfb-tab').forEach(tab => { tab.onclick = () => selectFbVersion(tab.dataset.fb); });
  card.querySelectorAll('.cfb-share-btn').forEach(btn => {
    btn.onclick = () => { selectFbVersion(btn.dataset.fb); shareToLine($id('cfbShareText').textContent); };
  });
  $id('cfbCopy').onclick = () => copyText($id('cfbShareText').textContent);
  $id('cfbShareLine').onclick = () => shareToLine($id('cfbShareText').textContent);

  // 心情偏低 → 解憂信箱關懷
  const sol = $id('cfbSolace');
  if (sol) {
    if (fb.moodLow) {
      sol.style.display = '';
      sol.innerHTML = `💛 今天心情好像有點低。要不要到 <a href="${SOLACE_URL}" target="_blank" rel="noopener">解憂信箱</a> 說說？運動心理教練會看到，也會在乎。`;
    } else { sol.style.display = 'none'; sol.innerHTML = ''; }
  }

  selectFbVersion('student');
  card.style.display = 'block';
}

function selectFbVersion(version) {
  if (!_currentFeedback || !_currentFeedback.versions[version]) return;
  _currentFbVersion = version;
  const fb = _currentFeedback;
  const v = fb.versions[version];
  document.querySelectorAll('#coachFeedbackCard .cfb-tab').forEach(t => t.classList.toggle('active', t.dataset.fb === version));
  document.querySelectorAll('#coachFeedbackCard .cfb-share-btn').forEach(t => t.classList.toggle('active', t.dataset.fb === version));

  $id('cfbBody').innerHTML =
    fbBlock('今日狀態', '🧭', v.affirm, 'good') +
    fbBlock('為什麼是這個狀態', '🔎', v.watch, 'warn');

  $id('cfbTomorrow').innerHTML =
    fbBlock('明日一個具體任務', '🎯', v.oneThing, 'good') +
    `<div class="cfb-quote">「${escapeHtml(v.quote)}」<span class="cfb-quote-by">— TeamPro AI</span></div>`;

  $id('cfbShareText').textContent = formatFeedbackText(fb, version);
}

function fbBlock(title, icon, text, tone) {
  return `<div class="cfb-block cfb-${tone}"><div class="cfb-block-title">${icon} 【${escapeHtml(title)}】</div>` +
    `<div class="cfb-block-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div></div>`;
}

/* ============================================================
   TeamPro AI 訓練準備度
   公式：selfScore*0.30 + coachScore*0.35 + recoveryScore*0.25
       + attendanceScore*0.10 - riskPenalty
   ============================================================ */
const READINESS_LIGHTS = [
  { min: 85, key: 'boost', label: '綠燈強化日', cls: 'green', group: '強化組', direction: '可以安排高品質技術、速度、對打、模擬賽、爆發力訓練。' },
  { min: 70, key: 'stable', label: '綠燈穩定日', cls: 'green', group: '穩定組', direction: '正常訓練，補一個明確弱點，維持品質。' },
  { min: 55, key: 'adjust', label: '黃燈調整日', cls: 'yellow', group: '調整組', direction: '降低總量，重點放技術修正、節奏、基本功、動作品質。' },
  { min: 40, key: 'protect', label: '橘燈保護日', cls: 'orange', group: '保護組', direction: '避免高強度，做恢復、伸展、低強度技術、心理調整。' },
  { min: 0, key: 'care', label: '紅燈關懷日', cls: 'red', group: '關懷組', direction: '不追分數，優先處理睡眠、疼痛、情緒、請假原因或生活壓力。' }
];
const COACH_SCORE_HELP = {
  coachAttitudeScore: ['明顯消極', '需要提醒', '正常完成', '主動投入', '高度專注且能帶動他人'],
  coachTechniqueScore: ['動作品質明顯不穩', '多次失誤', '基本穩定', '有明顯進步', '達到比賽品質'],
  coachExecutionScore: ['無法完成教練要求', '需多次提醒', '能完成基本要求', '能主動修正', '能理解並立即轉化成表現'],
  coachRiskScore: ['高風險，建議停止或大幅調整', '有明顯疲勞、疼痛或情緒風險', '普通，可正常觀察', '狀態穩定', '恢復良好，可承受較高品質訓練']
};
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function nval(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function pct5(v) { const n = nval(v); return n === null ? null : clamp(n, 1, 5) * 20; }
function avgPresent(vals, fallback) {
  const xs = vals.filter(v => v !== null && !isNaN(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
}
function hasUsefulText(v, minLen) { return String(v || '').trim().length >= (minLen || 8); }
function readinessLight(score) { return READINESS_LIGHTS.find(x => score >= x.min) || READINESS_LIGHTS[READINESS_LIGHTS.length - 1]; }
function readinessToneCls(label) {
  if (String(label).indexOf('紅') !== -1) return 'danger';
  if (String(label).indexOf('橘') !== -1) return 'warn';
  if (String(label).indexOf('黃') !== -1) return 'warn';
  return 'good';
}
function computeSelfReadinessScore(rec) {
  if (rec._isAbsence || isAbsenceRecord(rec)) return hasUsefulText(rec.absenceReflection || rec.absenceReason, 12) ? 70 : 45;
  let score = 78;
  const body = String(rec.bodyStatus || '');
  if (body === '很好') score += 8;
  else if (body === '疲勞') score -= 10;
  else if (body === '不舒服') score -= 15;
  else if (body === '受傷中') score -= 25;
  const mood = nval(rec.moodIndex);
  if (mood !== null) score += (mood - 3) * 5;
  const sore = nval(rec.soreness);
  if (sore !== null) score -= Math.max(0, sore - 2) * 5;
  const rpe = nval(rec.rpe);
  if (rpe !== null) score -= rpe >= 9 ? 12 : rpe >= 8 ? 7 : 0;
  const pain = nval(rec.painScore);
  if (pain !== null) score -= pain >= 7 ? 25 : pain >= 4 ? 12 : pain >= 1 ? 3 : 0;
  if (hasUsefulText(rec.reflection, 12)) score += 5;
  if (hasUsefulText(rec.tomorrowGoal, 8)) score += 5;
  if (/疲|痛|緊|怕|累|不穩|失誤|壓力|睡/.test(String(rec.reflection || '') + String(rec.moodReason || ''))) score += 4;
  return Math.round(clamp(score, 0, 100));
}
function computeCoachReadinessScore(rec) {
  const vals = ['coachAttitudeScore', 'coachTechniqueScore', 'coachExecutionScore', 'coachRiskScore'].map(k => pct5(rec[k]));
  return Math.round(avgPresent(vals, 75));
}
function mealLooksComplete(rec) {
  const text = [rec.breakfast, rec.lunch, rec.dinner].join(' ');
  return /蛋|肉|魚|雞|牛|豬|豆|奶|飯|麵|菜|便當|營養午餐/.test(text);
}
function computeRecoveryReadinessScore(rec) {
  let score = nval(rec.recoveryScore);
  score = score === null || score === '' ? 78 : score;
  const sleep = nval(rec.sleepHours);
  if (sleep !== null) score += sleep >= 8 ? 8 : sleep < 6 ? -16 : sleep < 7 ? -8 : 0;
  if (rec.sleepQuality === '好') score += 5;
  if (rec.sleepQuality === '差') score -= 10;
  if (rec.waterIntake === '少於 500ml') score -= 16;
  else if (rec.waterIntake === '500-1000ml') score -= 10;
  else if (rec.waterIntake === '2000ml 以上') score += 5;
  if (rec.urineStatus === '深黃') score -= 8;
  if (rec.urineStatus === '琥珀色') score -= 16;
  if (!mealLooksComplete(rec)) score -= 8;
  if (String(rec.lateNightSnack || '').indexOf('偏多') !== -1) score -= 6;
  const gap = Math.abs(nval(rec.weightGap) || 0);
  if (gap >= 3) score -= 6;
  if (String(rec.recoveryState || '').indexOf('降低') !== -1 || String(rec.recoveryState || '').indexOf('關懷') !== -1) score -= 8;
  return Math.round(clamp(score, 0, 100));
}
function taskCompletionScore(rec) {
  const c = String(rec.taskCompletion || rec.makeupStatus || '');
  if (c.indexOf('完成') !== -1) return 100;
  if (c.indexOf('進行') !== -1) return 75;
  return null;
}
function computeAttendanceReadinessScore(rec) {
  if (rec._isAbsence || isAbsenceRecord(rec)) return hasUsefulText(rec.absenceReflection || rec.absenceCatchup, 10) ? 65 : 35;
  const taskScore = taskCompletionScore(rec);
  return Math.round(avgPresent([100, hasUsefulText(rec.reflection, 8) ? 100 : 70, taskScore], 90));
}
function recentBadStreak(history, matcher) {
  const recs = dedupeLatestByDate(history || []).slice(0, 2);
  return recs.length >= 2 && recs.every(matcher);
}
function computeRiskPenalty(rec, recoveryScore, history) {
  const risks = [];
  let p = 0;
  const pain = nval(rec.painScore) || 0;
  const sleep = nval(rec.sleepHours);
  const rpe = nval(rec.rpe) || 0;
  const coachRisk = nval(rec.coachRiskScore);
  if (pain >= 4 && pain <= 6) { p += 8; risks.push('疼痛中度'); }
  if (pain >= 7) { p += 20; risks.push('受傷風險'); }
  if (sleep !== null && sleep < 6) { p += 8; risks.push('睡眠不足'); }
  if (rec.sleepQuality === '差') { p += 5; risks.push('睡眠品質差'); }
  if (rec.urineStatus === '深黃') { p += 5; risks.push('恢復不足'); }
  if (rec.urineStatus === '琥珀色') { p += 12; risks.push('脫水風險'); }
  if (rpe >= 8 && recoveryScore < 60) { p += 8; risks.push('高風險硬撐'); }
  if (coachRisk === 1) { p += 20; risks.push('教練高風險'); }
  if (coachRisk === 2) { p += 10; risks.push('教練提醒風險'); }
  if (pain >= 7 && (rec.trainingIntensity === '高' || rec.trainingIntensity === '比賽日')) { p += 10; risks.push('疼痛高仍高強度'); }
  if (recentBadStreak(history, r => String(r.status || '').indexOf('黃') !== -1)) risks.push('連續黃燈注意');
  if (recentBadStreak(history, r => String(r.status || '').indexOf('紅') !== -1)) risks.push('需要關心');
  if (recentBadStreak(history, r => nval(r.sleepHours) !== null && nval(r.sleepHours) < 6)) risks.push('連續睡眠不足');
  return { penalty: Math.min(45, p), risks: risks };
}
function buildReadinessTags(rec, selfScore, coachScore, recoveryScore, finalScore, risks, history) {
  const tags = risks.slice();
  if (selfScore >= 80 && coachScore < 65) tags.push('自我覺察落差');
  if (selfScore <= 60 && coachScore >= 80) tags.push('信心不足');
  if (recoveryScore < 60 && coachScore >= 80) tags.push('高風險硬撐');
  if ((nval(rec.painScore) || 0) >= 7 && (nval(rec.rpe) || 0) >= 8) tags.push('受傷風險');
  if (recentBadStreak(history, r => nval(r.finalReadinessScore) !== null && nval(r.finalReadinessScore) < 55)) tags.push('需要關心');
  return Array.from(new Set(tags));
}
function buildReadinessAnalysis(rec, history) {
  const selfScore = computeSelfReadinessScore(rec);
  const coachScore = computeCoachReadinessScore(rec);
  const recoveryScore = computeRecoveryReadinessScore(rec);
  const attendanceScore = computeAttendanceReadinessScore(rec);
  const risk = computeRiskPenalty(rec, recoveryScore, history || []);
  const finalReadinessScore = Math.round(clamp(selfScore * 0.30 + coachScore * 0.35 + recoveryScore * 0.25 + attendanceScore * 0.10 - risk.penalty, 0, 100));
  const light = readinessLight(finalReadinessScore);
  const tags = buildReadinessTags(rec, selfScore, coachScore, recoveryScore, finalReadinessScore, risk.risks, history || []);
  return {
    selfScore, coachScore, recoveryScore, attendanceScore,
    riskPenalty: risk.penalty,
    finalReadinessScore,
    statusLight: light.label,
    statusKey: light.key,
    statusClass: light.cls,
    trainingGroup: light.group,
    trainingDirection: light.direction,
    aiTags: tags,
    needInterview: tags.indexOf('需要關心') !== -1 || tags.indexOf('受傷風險') !== -1 || (nval(rec.coachRiskScore) || 5) <= 2 || finalReadinessScore < 40
  };
}
function applyReadiness(rec, history) {
  const r = buildReadinessAnalysis(rec, history || []);
  Object.assign(rec, {
    selfScore: r.selfScore,
    coachScore: r.coachScore,
    readinessRecoveryScore: r.recoveryScore,
    attendanceScore: r.attendanceScore,
    riskPenalty: r.riskPenalty,
    finalReadinessScore: r.finalReadinessScore,
    readinessStatusLight: r.statusLight,
    aiTags: r.aiTags.join('、'),
    trainingDirection: r.trainingDirection,
    readinessJson: JSON.stringify(r)
  });
  return r;
}
function readinessStudentVersion(rec, readiness) {
  const why = readiness.aiTags.length ? readiness.aiTags.slice(0, 2).join('、') : '整體資料穩定';
  return {
    affirm: `今天是${readiness.statusLight}。你願意把狀態記錄下來，這是成熟選手很重要的一步。`,
    watch: `目前判斷重點是「${why}」。這不是說你不好，而是提醒今天適合用更聰明的方式訓練。`,
    oneThing: readiness.statusKey === 'boost' ? '明天挑一個技術細節，用影片回看修正 1 次。' :
      readiness.statusKey === 'care' ? '明天先把睡眠、水分或疼痛狀態回報清楚，訓練不要硬撐。' :
      readiness.statusKey === 'protect' ? '明天先完成 10 分鐘伸展與低強度基本動作，身體穩了再加量。' :
      '明天把一個基本動作做穩，先求品質，再求速度。',
    quote: '今天適合怎麼調整，比今天拿幾分更重要。'
  };
}
function readinessParentVersion(rec, readiness) {
  const publicNote = rec.coachPublicNote || rec.coachReply || '';
  return {
    affirm: `孩子今日訓練狀態為${readiness.statusLight}。`,
    watch: `主要協助重點：${readiness.statusKey === 'boost' || readiness.statusKey === 'stable' ? '維持規律作息與正常補水。' : '協助早睡、補水，並觀察身體不適是否持續。'}`,
    oneThing: publicNote || '今晚請協助孩子提早休息，明天訓練會依狀態調整強度。',
    quote: '家長穩定支持，會讓孩子更願意持續訓練。'
  };
}
function readinessCoachVersion(rec, readiness) {
  const tags = readiness.aiTags.length ? readiness.aiTags.join('、') : '無明顯特殊標籤';
  const riskText = readiness.riskPenalty ? `風險扣分 ${readiness.riskPenalty} 分` : '無風險扣分';
  return {
    affirm: `準備度 ${readiness.finalReadinessScore} 分｜${readiness.statusLight}。`,
    watch: `自評 ${readiness.selfScore} 分、教練評估 ${readiness.coachScore} 分、恢復 ${readiness.recoveryScore} 分、出席 ${readiness.attendanceScore} 分，${riskText}。判斷標籤：${tags}。`,
    oneThing: `${readiness.trainingDirection}${readiness.needInterview ? ' 建議安排一對一關心，先了解原因再調整訓練量。' : ''}`,
    quote: '管理重點：用準備度安排訓練，不用分數處罰選手。'
  };
}

/* ============================================================
   選手成長卡（養成型｜段位 / 連續火焰 / 生涯數據 / 能力雷達 / 座右銘）
   ------------------------------------------------------------
   讓學生每天打開就先看到「自己這個角色」養成到哪：用連續火焰製造
   不想斷的動力、用段位與能力雷達製造「我在變強」的養成感。
   段位以「累積訓練天數」決定（重堅持、重努力，不以分數論英雄）。
   ============================================================ */
const PLAYER_BELTS = [
  { min: 0,   name: '見習生', belt: '白帶',   color: '#d8dde6', icon: '🥋' },
  { min: 5,   name: '練習生', belt: '黃帶',   color: '#f1c40f', icon: '🥋' },
  { min: 15,  name: '修行者', belt: '綠帶',   color: '#2ecc71', icon: '🥋' },
  { min: 30,  name: '好手',   belt: '藍帶',   color: '#2e7dd1', icon: '🥋' },
  { min: 50,  name: '強者',   belt: '紅帶',   color: '#e23b3b', icon: '🥋' },
  { min: 80,  name: '高手',   belt: '紅黑帶', color: '#e67e22', icon: '🥋' },
  { min: 120, name: '隊長級', belt: '黑帶',   color: '#f5c518', icon: '🏅' }
];
function computeBelt(days) {
  let cur = PLAYER_BELTS[0];
  for (let i = 0; i < PLAYER_BELTS.length; i++) { if (days >= PLAYER_BELTS[i].min) cur = PLAYER_BELTS[i]; }
  const idx = PLAYER_BELTS.indexOf(cur);
  return { cur: cur, next: PLAYER_BELTS[idx + 1] || null, idx: idx };
}

// 連續紀錄天數：從今天往回數（今天還沒填則從昨天起算，紀錄尚未斷）
function computeStreak(dateSet) {
  let streak = 0;
  const cur = new Date(todayStr() + 'T00:00:00');
  if (!dateSet[ymd(cur)]) cur.setDate(cur.getDate() - 1);
  while (dateSet[ymd(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}

function appKeyMotto(name) { return 'motto:' + name; }

function pcTile(icon, label, val) {
  return `<div class="pc-tile"><div class="pc-tile-icon">${icon}</div>` +
    `<div class="pc-tile-val">${escapeHtml(String(val))}</div><div class="pc-tile-label">${escapeHtml(label)}</div></div>`;
}

async function renderPlayerCard(name) {
  const card = $id('playerCard');
  if (!card) return;
  if (!name) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  $id('playerCardBody').innerHTML = '<div class="hint-box">讀取你的選手卡中…</div>';

  let recs = [];
  try { recs = dedupeLatestByDate((await fetchRecentRecords(name, 90)) || []); } catch (e) { recs = []; }
  const training = recs.filter(r => !isAbsenceRecord(r));

  const dateSet = {};
  recs.forEach(r => { dateSet[normDate(r.date)] = true; });
  const streak = computeStreak(dateSet);
  const trainingDays = new Set(training.map(r => normDate(r.date))).size;
  const ym = todayStr().slice(0, 7);
  const monthCount = training.filter(r => normDate(r.date).slice(0, 7) === ym).length;

  // 個人最佳（PB）
  let pb = 0, pbMax = 50;
  training.forEach(r => { const t = parseFloat(r.totalScore) || 0; if (t > pb) { pb = t; pbMax = recordScoreMax(r); } });

  // 近期戰力（近 30 筆平均）
  const avgs = training.slice(0, 30).map(r => parseFloat(r.averageScore)).filter(v => !isNaN(v));
  const recentAvg = avgs.length ? round1(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
  const power = Math.round(recentAvg * 20);

  // 生涯能力平均（給雷達）
  const avgRec = {};
  ASPECT_ORDER.forEach(k => {
    const field = ASPECT_AVG_FIELD[k];
    const vals = training.map(r => parseFloat(r[field])).filter(v => !isNaN(v) && v > 0);
    avgRec[field] = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  const belt = computeBelt(trainingDays);
  const todayDone = !!dateSet[todayStr()];

  let html = '';
  // Hero：頭像（段位色）＋姓名＋段位＋戰力＋連續火焰
  html += `<div class="pc-hero">
    <div class="pc-avatar" style="border-color:${belt.cur.color};box-shadow:0 0 14px ${belt.cur.color}55">${belt.cur.icon}</div>
    <div class="pc-hero-info">
      <div class="pc-name">${escapeHtml(name)}</div>
      <div class="pc-belt" style="color:${belt.cur.color}">${belt.cur.belt}・${belt.cur.name}</div>
      <div class="pc-power">⚡ 戰力 ${power}　<span class="pc-power-sub">近期平均 ${recentAvg}/5</span></div>
    </div>
    <div class="pc-streak ${streak > 0 ? 'on' : ''}">
      <div class="pc-streak-num">${streak}</div>
      <div class="pc-streak-label">🔥 連續天數</div>
    </div>
  </div>`;

  // 今日提醒（製造不想斷的動力）
  if (todayDone) html += `<div class="pc-today done">✅ 今天已完成紀錄，火焰 +1，明天見！</div>`;
  else if (streak > 0) html += `<div class="pc-today">🔥 今天還沒填！填完就能延續你的 <b>${streak}</b> 天連續紀錄，別讓它斷在今天。</div>`;
  else html += `<div class="pc-today">✍️ 今天填一筆，點燃你的第一道連續火焰，開始養成自己的選手卡。</div>`;

  // 生涯數據
  html += `<div class="pc-stats">
    ${pcTile('🗓️', '生涯訓練天數', trainingDays)}
    ${pcTile('📅', '本月已填', monthCount + ' 次')}
    ${pcTile('🏆', '個人最佳', pb ? (pb + ' / ' + pbMax) : '—')}
  </div>`;

  // 段位進度
  if (belt.next) {
    const span = belt.next.min - belt.cur.min;
    const done = trainingDays - belt.cur.min;
    const pct = Math.max(4, Math.min(100, Math.round(done / span * 100)));
    const remain = belt.next.min - trainingDays;
    html += `<div class="pc-prog">
      <div class="pc-prog-bar"><span style="width:${pct}%;background:${belt.next.color}"></span></div>
      <div class="pc-prog-label">再 <b>${remain}</b> 個訓練日 → 升上 <b style="color:${belt.next.color}">${belt.next.belt}・${belt.next.name}</b></div>
    </div>`;
  } else {
    html += `<div class="pc-prog-label" style="margin-top:10px">🏅 你已達最高段位，繼續守住這份堅持！</div>`;
  }

  // 能力養成雷達（生涯平均 vs 上次單筆 疊圖，一眼看出進退步）
  if (training.length) {
    const avgAspect = aspectAvgFromRecord(avgRec);
    const lastAspect = aspectAvgFromRecord(training[0]);  // training 已依日期由新到舊排序
    const hasLast = ASPECT_ORDER.some(k => lastAspect[k] > 0);
    html += `<h4 class="pc-sec">📊 我的能力養成</h4>`
      + radarChartSVG(avgAspect, hasLast ? lastAspect : null, { selfLabel: '平均', coachLabel: '上次' });
  }

  // 座右銘
  html += `<div id="pcMottoBox"></div>`;

  $id('playerCardBody').innerHTML = html;
  setupMotto(name);
}

// 座右銘：選手自己可編輯，教練／家長唯讀
function setupMotto(name) {
  const box = $id('pcMottoBox');
  if (!box) return;
  const editable = !isParentView() && !isCoachView();
  appGet(appKeyMotto(name), data => {
    if (!$id('pcMottoBox')) return;   // 期間可能已切換選手
    const motto = (data && data.text) ? data.text : '';
    if (editable) {
      box.innerHTML = `<label class="field-label">我的座右銘 ✍️</label>
        <div class="btn-group" style="margin-top:0">
          <input type="text" id="pcMottoInput" class="text-input" style="flex:1" maxlength="40" value="${escapeHtml(motto)}" placeholder="寫一句給自己的話，例如：比昨天更好一點" />
          <button type="button" id="pcMottoSave" class="btn btn-primary" style="flex:0 0 auto;min-width:60px">💾</button>
        </div>`;
      $id('pcMottoSave').addEventListener('click', async () => {
        const t = $id('pcMottoInput').value.trim();
        await appSet(appKeyMotto(name), { text: t });
        toast('✅ 已更新座右銘');
      });
    } else {
      box.innerHTML = motto ? `<div class="pc-motto">❝ ${escapeHtml(motto)} ❞</div>` : '';
    }
  });
}

/* ============================================================
   產生 LINE 四版本文字
   ============================================================ */
function buildLineTexts(rec, weightNote, affirm) {
  if (!rec._kpiEnabled) return buildBasicDailyLineTexts(rec, weightNote);
  const lowArr = rec._lowItemsArr || [];
  const lowLines = lowArr.map((l, i) => `${i + 1}. ${l.item}：${l.score} 分`).join('\n');
  const remind = buildRemindText(lowArr.map(l => `${l.item}：${l.score} 分`));
  const n = rec._nutrition;

  // 進步肯定（徽章 + 最強的一句具體肯定）
  let affirmBlock = '';
  if (affirm && (affirm.badges.length || affirm.lines.length)) {
    const parts = [];
    if (affirm.badges.length) parts.push('🌟 今日肯定：' + affirm.badges.map(b => b.icon + b.label).join('、'));
    if (affirm.lines.length) parts.push('🎉 ' + affirm.lines[0]);
    affirmBlock = '\n' + parts.join('\n') + '\n';
  }

  // 鼓勵隊友（學生有填才顯示）
  const encMsg = (rec.encouragementToTeammate || '').trim();
  const encName = (rec.encourageTeammateName || '').trim();
  const encourageTeammateBlock = encMsg
    ? `\n🤝 想對${encName ? ` ${encName} ` : '隊友'}說的話：\n${encMsg}\n`
    : '';

  // 選手版
  const studentLine =
`🥋 育林國中技擊隊｜每日 KPI 回饋

姓名：${rec.name}
日期：${dateSlash(rec.date)}
今日訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || rec.status}）
今日訓練方向：${rec.trainingDirection || '依教練安排調整'}
今日總分：${scoreMaxText(rec)}
平均分數：${rec.averageScore} / 5
${affirmBlock}
今天最低三項：

${lowLines || '今天沒有低於 3 分的項目，表現很穩！'}

今天提醒：

${remind}

🍱 今日飲食提醒：

${shortNutrition(n)}

明日目標：

${rec.tomorrowGoal || '把今天的重點再做穩一點。'}
${encourageTeammateBlock}
💪 ${encouragementByStatus(rec.status)}

📣 教練的話：${dailyPick(COACH_QUOTES)}

教練相信你，只要願意修正，就一定會進步。`;

  // 家長版
  const topTwo = lowArr.slice(0, 2).map(l => l.item).join('」與「');
  const parentLine =
`🥋 育林國中技擊隊｜今日訓練回饋

孩子今日訓練狀態為「${rec.readinessStatusLight || statusWord(rec.status)}」${topTwo ? `，主要訓練重點會放在「${topTwo}」` : '，整體表現穩定'}。

教練明天會依訓練準備度調整內容，請家長不用擔心。這不是排名，也不是處罰分數，而是協助孩子用更適合的方式訓練。

${n.parent}
${weightNote ? '\n⚖️ ' + weightNote + '\n' : ''}
只要願意每天修正一點，孩子的穩定度就會慢慢提升。`;

  // 教練版
  const aspectLines = presentAspectKeys(rec._aspectAvg).map(k => `${KPI_ASPECTS[k].label}：${rec._aspectAvg[k]}`).join('\n');
  const coachAdvice = lowArr.length
    ? `明日安排「${lowArr.map(l => l.item).join('、')}」個別修正。`
    : '明日維持訓練節奏，挑戰更高目標。';
  // 自由品勢額外紀錄（其他項目為空）
  let fsBlock = '';
  if (rec.group === FREESTYLE_GROUP) {
    const parts = [];
    if (String(rec.aerialKickCount || '').trim() !== '') parts.push(`空中踢擊完成 ${rec.aerialKickCount} 腳`);
    if (String(rec.landingErrors || '').trim() !== '') parts.push(`落地失誤 ${rec.landingErrors} 次`);
    if (String(rec.unlockedMoves || '').trim() !== '') parts.push(`解鎖：${rec.unlockedMoves}`);
    if (parts.length) fsBlock = '\n🤸 自由品勢：' + parts.join('　') + '\n';
  }
  const coachLine =
`📊 育林國中技擊隊｜KPI 教練紀錄

姓名：${rec.name}
日期：${dateSlash(rec.date)}
組別：${rec.group}${fsBlock}
狀態：${rec.status}
TeamPro AI 訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '--'}）
AI 標籤：${rec.aiTags || '無明顯特殊標籤'}
明日訓練方向：${rec.trainingDirection || '依教練安排調整'}
總分：${scoreMaxText(rec)}
平均：${rec.averageScore} / 5

面向平均：

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
`🍱 育林國中技擊隊｜今日飲食建議

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

function buildBasicDailyLineTexts(rec, weightNote) {
  const n = rec._nutrition;
  const student = `🥋 育林國中技擊隊｜每日訓練回報\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n` +
    `TeamPro AI 訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '資料累積中'}）\n` +
    `今日訓練方向：${rec.trainingDirection || '依教練安排調整'}\n身體狀況：${rec.bodyStatus || '未填'}\n今日心得：${rec.reflection || '已完成回報'}\n明日目標：${rec.tomorrowGoal || '未填'}\n\n` +
    `🍱 今日飲食提醒：\n${shortNutrition(n)}\n\n📣 教練的話：${dailyPick(COACH_QUOTES)}`;
  const parent = `🥋 育林國中技擊隊｜今日訓練回報\n\n${rec.name} 已完成今日訓練與身體狀態回報。\n訓練狀態：${rec.readinessStatusLight || '資料累積中'}。` +
    `${rec.bodyStatus ? '\n身體狀況：' + rec.bodyStatus : ''}${weightNote ? '\n⚖️ ' + weightNote : ''}\n\n${n.parent || ''}`;
  const coach = `📊 育林國中技擊隊｜每日訓練紀錄\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n組別：${rec.group}\n` +
    `訓練準備度：${rec.finalReadinessScore || '--'} / 100（${rec.readinessStatusLight || '--'}）\nAI 標籤：${rec.aiTags || '無'}\n訓練方向：${rec.trainingDirection || '依教練安排調整'}\n` +
    `身體狀況：${rec.bodyStatus || '未填'}\n今日心得：${rec.reflection || '未填'}\n明日目標：${rec.tomorrowGoal || '未填'}\n\n` +
    `飲食問題：${n.risks && n.risks.length ? n.risks.join('、') : '無明顯風險'}`;
  const nutrition = `🍱 育林國中技擊隊｜今日飲食建議\n\n姓名：${rec.name}\n日期：${dateSlash(rec.date)}\n\n${shortNutrition(n)}`;
  return { student: student, parent: parent, coach: coach, nutrition: nutrition };
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

function getLocalCoachScores() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.coachScores)) || []; }
  catch (e) { return []; }
}
function saveLocalCoachScores(arr) { localStorage.setItem(LS_KEYS.coachScores, JSON.stringify(arr || [])); }
async function fetchCoachScores(date) {
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getCoachScores', date: date || todayStr() });
      if (res && res.ok && Array.isArray(res.data)) return res.data;
    } catch (e) { toast('⚠️ 教練簡評讀取失敗，暫用本機資料'); }
  }
  return getLocalCoachScores().filter(r => normDate(r.date) === normDate(date || todayStr()));
}
async function saveCoachScoreRow(row) {
  const payload = Object.assign({ timestamp: new Date().toISOString() }, row);
  if (getWebAppUrl()) {
    const res = await postToWebApp({ action: 'saveCoachScore', payload: payload });
    if (!res || !res.ok) throw new Error((res && res.error) || '儲存教練簡評失敗');
  }
  const arr = getLocalCoachScores();
  const idx = arr.findIndex(r => normDate(r.date) === normDate(payload.date) && String(r.studentName) === String(payload.studentName));
  if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], payload);
  else arr.push(payload);
  saveLocalCoachScores(arr);
  return payload;
}
function mergeCoachScores(records, scores) {
  const map = {};
  (scores || []).forEach(s => { map[normDate(s.date) + '|' + String(s.studentName || '').trim()] = s; });
  (records || []).forEach(r => {
    const s = map[normDate(r.date) + '|' + String(r.name || '').trim()];
    if (s) Object.assign(r, {
      coachAttitudeScore: s.coachAttitudeScore,
      coachTechniqueScore: s.coachTechniqueScore,
      coachExecutionScore: s.coachExecutionScore,
      coachRiskScore: s.coachRiskScore,
      coachPublicNote: s.coachPublicNote,
      coachPrivateNote: s.coachPrivateNote
    });
  });
  return records;
}

function yesNo(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  const s = String(value || '').trim();
  if (!s) return '否';
  return ['是', 'yes', 'true', '1', '已', '有'].indexOf(s.toLowerCase()) !== -1 ? '是' : s;
}

function normalizeAttendanceStatus(status, row) {
  const s = String(status || '').trim();
  if (s.indexOf('補訓完成') !== -1) return '補訓完成';
  if (s.indexOf('早退') !== -1) return '早退';
  if (s.indexOf('遲到') !== -1) return '遲到';
  if (s.indexOf('休息') !== -1) return '休息日';
  if (s.indexOf('請假') !== -1) return '未出席已請假';
  if (s.indexOf('缺席') !== -1 || s.indexOf('未出席未請假') !== -1) return '未出席未請假';
  if (s.indexOf('未填') !== -1 || s.indexOf('尚未') !== -1) return '尚未填寫';
  if (s.indexOf('已訓練') !== -1 || s.indexOf('準時') !== -1 || s.indexOf('出席') !== -1) return '已訓練';
  if (yesNo(row && row.kpiSubmitted) === '是') return '已訓練';
  return '尚未填寫';
}

function attendanceColor(status, row) {
  const s = normalizeAttendanceStatus(status, row);
  if (s === '已訓練' || s === '補訓完成') return 'green';
  if (s === '未出席已請假') return 'blue';
  if (s === '尚未填寫') return 'yellow';
  if (s === '遲到' || s === '早退') return 'orange';
  if (s === '未出席未請假') return 'red';
  if (s === '休息日') return 'gray';
  return 'yellow';
}

function normalizeAttendanceReports(rows) {
  return (rows || []).map(row => {
    const date = normDate(row.date || row.timestamp);
    const status = normalizeAttendanceStatus(row.attendanceStatus || row.status, row);
    return {
      timestamp: row.timestamp || '',
      date: date,
      studentName: row.studentName || row.name || '',
      attendanceStatus: status,
      checkInTime: row.checkInTime || '',
      checkOutTime: row.checkOutTime || '',
      absenceReason: row.absenceReason || '',
      informedCoach: yesNo(row.informedCoach),
      parentConfirmed: yesNo(row.parentConfirmed),
      kpiSubmitted: yesNo(row.kpiSubmitted),
      makeupTask: row.makeupTask || '',
      makeupStatus: row.makeupStatus || '',
      coachPublicNote: row.coachPublicNote || row.coachReply || '',
      coachPrivateNote: row.coachPrivateNote || row.redLightNote || '',
      absenceReflection: row.absenceReflection || '',
      finalReadinessScore: row.finalReadinessScore || '',
      readinessStatusLight: row.readinessStatusLight || '',
      trainingDirection: row.trainingDirection || ''
    };
  }).filter(r => r.studentName && r.date).sort((a, b) => a.date < b.date ? 1 : -1);
}

function attendanceReportFromRecord(rec) {
  const absent = isAbsenceGroup(rec.group);
  const reason = String(rec.absenceReason || '').trim();
  return {
    timestamp: rec.timestamp || rec.date || '',
    date: normDate(rec.date),
    studentName: rec.name,
    attendanceStatus: absent ? (reason ? '未出席已請假' : '未出席未請假') : '已訓練',
    checkInTime: '',
    checkOutTime: '',
    absenceReason: reason,
    informedCoach: '是',
    parentConfirmed: yesNo(rec.parentNote ? '是' : ''),
    kpiSubmitted: '是',
    makeupTask: '',
    makeupStatus: '',
    coachPublicNote: rec.coachReply || '',
    coachPrivateNote: rec.redLightNote || '',
    absenceReflection: rec.absenceReflection || '',
    finalReadinessScore: rec.finalReadinessScore || '',
    readinessStatusLight: rec.readinessStatusLight || '',
    trainingDirection: rec.trainingDirection || ''
  };
}

function mergeAttendanceWithKpi(attendanceRows, kpiRows, studentName) {
  const map = {};
  normalizeAttendanceReports(attendanceRows)
    .filter(r => !studentName || String(r.studentName || '').trim() === String(studentName || '').trim())
    .forEach(r => { map[(r.studentName || '') + ':' + r.date] = r; });
  (kpiRows || []).filter(r => !studentName || String(r.name || '').trim() === String(studentName || '').trim()).forEach(rec => {
    const derived = attendanceReportFromRecord(rec);
    const key = (derived.studentName || '') + ':' + derived.date;
    if (!map[key]) map[key] = derived;
    else {
      map[key].kpiSubmitted = '是';
      if (!map[key].absenceReflection && derived.absenceReflection) map[key].absenceReflection = derived.absenceReflection;
      if (!map[key].absenceReason && derived.absenceReason) map[key].absenceReason = derived.absenceReason;
      if (!map[key].finalReadinessScore && derived.finalReadinessScore) map[key].finalReadinessScore = derived.finalReadinessScore;
      if (!map[key].readinessStatusLight && derived.readinessStatusLight) map[key].readinessStatusLight = derived.readinessStatusLight;
      if (!map[key].trainingDirection && derived.trainingDirection) map[key].trainingDirection = derived.trainingDirection;
    }
  });
  return Object.values(map).sort((a, b) => a.date < b.date ? 1 : -1);
}

function dateAdd(dateStr, delta) {
  const d = new Date(normDate(dateStr) + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return ymd(d);
}

function recentDates(days) {
  const out = [];
  for (let i = 0; i < days; i++) out.push(dateAdd(todayStr(), -i));
  return out;
}

function weekDates() {
  const start = weekStartMondayStr();
  return Array.from({ length: 7 }, (_, i) => dateAdd(start, i)).filter(d => d <= todayStr());
}

function monthDates() {
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const out = [];
  for (let d = first; d <= todayStr(); d = dateAdd(d, 1)) out.push(d);
  return out;
}

function reportByDate(rows) {
  const map = {};
  rows.forEach(r => { if (!map[r.date]) map[r.date] = r; });
  return map;
}

function attendanceStats(rows, dates) {
  const map = reportByDate(rows);
  const periodRows = dates.map(d => map[d] || { date: d, attendanceStatus: '尚未填寫', kpiSubmitted: '否' });
  const expectedRows = periodRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) !== '休息日');
  const present = expectedRows.filter(r => ['已訓練', '遲到', '早退', '補訓完成'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  const absent = expectedRows.filter(r => ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  const late = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '遲到').length;
  const leaveEarly = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '早退').length;
  const makeupDone = expectedRows.filter(r => normalizeAttendanceStatus(r.attendanceStatus, r) === '補訓完成' || String(r.makeupStatus || '').indexOf('完成') !== -1).length;
  const makeupTotal = expectedRows.filter(r => r.makeupTask || ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1).length;
  return {
    expected: expectedRows.length,
    present,
    absent,
    late,
    leaveEarly,
    makeupDone,
    attendanceRate: expectedRows.length ? Math.round(present / expectedRows.length * 100) + '%' : '--',
    makeupRate: makeupTotal ? Math.round(makeupDone / makeupTotal * 100) + '%' : '--'
  };
}

function renderStatsCells(box, cells) {
  box.innerHTML = cells.map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');
}

function parentNoticeText(studentName, status) {
  return `您好，今日系統尚未收到 ${studentName} 的訓練紀錄。目前狀態為：${status}。若今日請假，請協助確認原因；若已完成訓練，請提醒孩子補填紀錄。謝謝。`;
}
function parentReadinessHelp(row) {
  const light = String(row.readinessStatusLight || '');
  if (light.indexOf('強化') !== -1 || light.indexOf('穩定') !== -1) return '今天狀態穩定，請協助維持規律飲食、補水與睡眠。';
  if (light.indexOf('調整') !== -1) return '今天適合調整訓練量，請協助孩子今晚提早休息並補足水分。';
  if (light.indexOf('保護') !== -1) return '今天以保護身體為主，請留意睡眠、疼痛與疲勞是否持續。';
  if (light.indexOf('關懷') !== -1) return '今天先不追求強度，請用關心方式了解孩子身體或生活壓力。';
  return '請協助維持規律作息、補水與正常飲食。';
}

function coachAttendanceNoticeText(names) {
  return `今日未完成訓練紀錄名單：${names.length ? names.join('、') : '無'}。請確認是否為請假、缺席或尚未填寫。`;
}

async function renderParentDashboard() {
  const role = getRole();
  if (!role || role.role !== 'parent' || !role.name) return;
  const studentName = role.name;
  const [attendanceRows, kpiRows] = await Promise.all([
    fetchAttendanceReports(studentName, 90),
    fetchRecentRecords(studentName, 90)
  ]);
  const rows = mergeAttendanceWithKpi(attendanceRows, kpiRows, studentName);
  const byDate = reportByDate(rows);
  const todayRow = byDate[todayStr()] || { date: todayStr(), studentName, attendanceStatus: '尚未填寫', kpiSubmitted: '否' };
  const todayStatus = normalizeAttendanceStatus(todayRow.attendanceStatus, todayRow);
  const todayColor = attendanceColor(todayStatus, todayRow);

  const intro = $id('parentDashboardIntro');
  if (intro) intro.textContent = `${studentName}｜家長只能查看此孩子個人資料，不顯示全隊排名、其他學生或教練內部備註。`;

  $id('parentTodayStatus').innerHTML = `
    <div class="parent-status-card parent-status-${todayColor}">
      <strong>${todayStatus}</strong>
      <div class="review-label">日期：${dateSlash(todayRow.date)}｜KPI：${todayRow.kpiSubmitted || '否'}｜補訓：${todayRow.makeupStatus || '無'}</div>
      ${todayRow.finalReadinessScore ? `<div class="hint-box good">TeamPro AI 訓練準備度：${escapeHtml(todayRow.finalReadinessScore)}｜${escapeHtml(todayRow.readinessStatusLight || '')}<br>${escapeHtml(parentReadinessHelp(todayRow))}</div>` : ''}
      ${todayRow.absenceReason ? `<div class="review-label">未出席原因：${escapeHtml(todayRow.absenceReason)}</div>` : ''}
      ${todayRow.absenceReflection ? `<div class="reflection-cell">🤔 孩子的反思：<br>${escapeHtml(todayRow.absenceReflection).replace(/\n/g, '<br>')}</div>` : ''}
      ${todayRow.coachPublicNote ? `<div class="hint-box good">教練提醒：${escapeHtml(todayRow.coachPublicNote)}</div>` : ''}
    </div>`;

  const seven = recentDates(7).map(d => byDate[d] || { date: d, studentName, attendanceStatus: '尚未填寫', kpiSubmitted: '否' });
  $id('parentSevenDays').innerHTML = `
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>日期</th><th>出席狀態</th><th>是否填寫 KPI</th><th>未出席原因</th><th>補訓狀態</th><th>教練提醒</th></tr></thead>
      <tbody>${seven.map(r => {
        const st = normalizeAttendanceStatus(r.attendanceStatus, r);
        const color = attendanceColor(st, r);
        return `<tr><td>${dateSlash(r.date)}</td><td><span class="status-dot ${color}">${st}</span></td><td>${r.kpiSubmitted || '否'}</td><td>${escapeHtml(r.absenceReason || '-')}</td><td>${escapeHtml(r.makeupStatus || '-')}</td><td>${escapeHtml(r.coachPublicNote || '-')}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;

  const ws = attendanceStats(rows, weekDates());
  renderStatsCells($id('parentWeekStats'), [
    ['應到天數', ws.expected], ['實到天數', ws.present], ['未出席次數', ws.absent],
    ['遲到次數', ws.late], ['早退次數', ws.leaveEarly], ['補訓完成數', ws.makeupDone]
  ]);

  const ms = attendanceStats(rows, monthDates());
  renderStatsCells($id('parentMonthStats'), [
    ['應到天數', ms.expected], ['實到天數', ms.present], ['出席率', ms.attendanceRate],
    ['未出席次數', ms.absent], ['遲到次數', ms.late], ['早退次數', ms.leaveEarly], ['補訓完成率', ms.makeupRate]
  ]);

  const makeupRows = rows.filter(r => r.makeupTask || ['未出席已請假', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1);
  $id('parentMakeupTasks').innerHTML = makeupRows.length ? `
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>缺席日期</th><th>缺席原因</th><th>補訓任務</th><th>完成狀態</th><th>教練確認狀態</th></tr></thead>
      <tbody>${makeupRows.slice(0, 12).map(r => `<tr><td>${dateSlash(r.date)}</td><td>${escapeHtml(r.absenceReason || '-')}</td><td>${escapeHtml(r.makeupTask || '待教練指派')}</td><td>${escapeHtml(r.makeupStatus || '待補訓')}</td><td>${escapeHtml(r.informedCoach || '-')}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="hint-box good">目前沒有待補訓任務。</div>';

  const notes = rows.filter(r => r.coachPublicNote).slice(0, 8);
  $id('parentCoachNotes').innerHTML = notes.length
    ? notes.map(r => `<div class="hint-box good"><b>${dateSlash(r.date)}</b><br>${escapeHtml(r.coachPublicNote)}</div>`).join('')
    : '<div class="review-label">目前沒有公開給家長的提醒。</div>';

  const notice = parentNoticeText(studentName, todayStatus);
  $id('parentLineNotice').textContent = notice;
  const copyBtn = $id('btnParentCopyNotice');
  const shareBtn = $id('btnParentShareNotice');
  if (copyBtn) copyBtn.onclick = () => copyText(notice);
  if (shareBtn) shareBtn.onclick = () => shareToLine(notice);
}

function upsertAttendanceReportFromKpi(payload) {
  const arr = getAttendanceReportsLocal();
  const derived = attendanceReportFromRecord(payload);
  const idx = arr.findIndex(r => String(r.studentName || r.name || '').trim() === derived.studentName && normDate(r.date) === derived.date);
  if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], derived, { kpiSubmitted: '是', attendanceStatus: arr[idx].attendanceStatus || '已訓練' });
  else arr.push(derived);
  saveAttendanceReportsLocal(arr);
}

async function renderCoachAttendanceReports(todays) {
  const box = $id('coachAttendanceReports');
  if (!box) return;
  const filterDate = $id('coachDate').value || todayStr();
  const allReports = await fetchAllAttendanceReports();
  const allRecords = await fetchAllRecords();
  let rows = mergeAttendanceWithKpi(allReports, allRecords, '').filter(r => normDate(r.date) === filterDate);
  if (!rows.length && Array.isArray(todays)) rows = todays.map(attendanceReportFromRecord);
  const roster = getPlayers();
  const byName = {};
  rows.forEach(r => { byName[String(r.studentName || '').trim()] = r; });
  const missingNames = roster.filter(name => {
    const r = byName[name];
    return !r || ['尚未填寫', '未出席未請假'].indexOf(normalizeAttendanceStatus(r.attendanceStatus, r)) !== -1;
  });
  const notice = coachAttendanceNoticeText(missingNames);
  box.innerHTML = `
    <div class="hint-box warn">${escapeHtml(notice)}</div>
    <div class="btn-group">
      <button type="button" id="btnCoachCopyAttendanceNotice" class="btn btn-secondary">📋 複製教練通知</button>
      <button type="button" id="btnCoachShareAttendanceNotice" class="btn btn-line-share">💬 分享到 LINE</button>
    </div>
    <div class="table-scroll"><table class="record-table">
      <thead><tr><th>日期</th><th>選手</th><th>出席狀態</th><th>KPI</th><th>未出席原因</th><th>家長確認</th><th>補訓任務</th><th>補訓狀態</th><th>公開提醒</th><th>教練內部備註</th></tr></thead>
      <tbody>${roster.map(name => {
        const r = byName[name] || { date: filterDate, studentName: name, attendanceStatus: '尚未填寫', kpiSubmitted: '否' };
        const st = normalizeAttendanceStatus(r.attendanceStatus, r);
        const reasonCell = r.absenceReason
          ? `${escapeHtml(r.absenceReason)}${r.absenceReflection ? `<div class="reflection-cell">🤔 ${escapeHtml(r.absenceReflection)}</div>` : ''}`
          : '-';
        return `<tr><td>${dateSlash(r.date)}</td><td>${escapeHtml(name)}</td><td><span class="status-dot ${attendanceColor(st, r)}">${st}</span></td><td>${r.kpiSubmitted || '否'}</td><td>${reasonCell}</td><td>${escapeHtml(r.parentConfirmed || '否')}</td><td>${escapeHtml(r.makeupTask || '-')}</td><td>${escapeHtml(r.makeupStatus || '-')}</td><td>${escapeHtml(r.coachPublicNote || '-')}</td><td>${escapeHtml(r.coachPrivateNote || '-')}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
  const copyBtn = $id('btnCoachCopyAttendanceNotice');
  const shareBtn = $id('btnCoachShareAttendanceNotice');
  if (copyBtn) copyBtn.addEventListener('click', () => copyText(notice));
  if (shareBtn) shareBtn.addEventListener('click', () => shareToLine(notice));
}

/* ============================================================
   11.3 本週之星（努力型、正向、不露分數）
   ------------------------------------------------------------
   依據「努力/過程」而非能力：最堅持（填寫天數）、進步最多（本週首尾差）、
   最佳隊友（鼓勵次數）、最自律（自律面向）。每類只表揚 1 人、只露名字＋
   正向標籤，不秀全班分數。教練可在系統設定關閉（後端 STAR_ENABLED）。
   ============================================================ */

// 本週起始（週一 00:00）
function weekStartMondayStr() {
  const x = new Date();
  const day = (x.getDay() + 6) % 7; // 週一=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return ymd(x);
}

function computeWeeklyStars(all) {
  const startStr = weekStartMondayStr();
  const wk = (all || []).filter(r => r && r.name && normDate(r.date) >= startStr);
  if (!wk.length) return [];

  const byName = {};
  wk.forEach(r => {
    const n = r.name;
    if (!byName[n]) byName[n] = { dates: {}, recs: [] };
    byName[n].dates[normDate(r.date)] = true;
    byName[n].recs.push(r);
  });
  const names = Object.keys(byName);
  const stars = [];
  let best;

  // 🔥 最堅持：本週填最多天（≥2 才表揚）
  best = null;
  names.forEach(n => {
    const days = Object.keys(byName[n].dates).length;
    if (!best || days > best.v) best = { name: n, v: days };
  });
  if (best && best.v >= 2) stars.push({ icon: '🔥', label: '最堅持', name: best.name, note: `本週紀錄 ${best.v} 天，超有毅力！` });

  // 📈 進步最多：本週最早 vs 最晚 平均分差（>0、≥2 筆）
  best = null;
  names.forEach(n => {
    const recs = byName[n].recs.slice().sort((a, b) => normDate(a.date) < normDate(b.date) ? -1 : 1);
    if (recs.length < 2) return;
    const first = parseFloat(recs[0].averageScore), last = parseFloat(recs[recs.length - 1].averageScore);
    if (isNaN(first) || isNaN(last)) return;
    const delta = last - first;
    if (delta > 0 && (!best || delta > best.v)) best = { name: n, v: delta };
  });
  if (best) stars.push({ icon: '📈', label: '進步最多', name: best.name, note: `本週進步 +${round1(best.v)} 分，繼續衝！` });

  // 🤝 最佳隊友：本週最常鼓勵隊友（≥1）
  best = null;
  names.forEach(n => {
    const c = byName[n].recs.filter(r => (r.encouragementToTeammate || '').trim()).length;
    if (!best || c > best.v) best = { name: n, v: c };
  });
  if (best && best.v >= 1) stars.push({ icon: '🤝', label: '最佳隊友', name: best.name, note: `本週鼓勵隊友 ${best.v} 次，超暖！` });

  // 🎯 最自律：本週自律面向平均最高
  best = null;
  names.forEach(n => {
    const arr = byName[n].recs.map(r => parseFloat(r.disciplineAvg)).filter(v => !isNaN(v));
    if (!arr.length) return;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (!best || avg > best.v) best = { name: n, v: avg };
  });
  if (best) stars.push({ icon: '🎯', label: '最自律', name: best.name, note: `自律表現亮眼（${round1(best.v)} 分）` });

  return stars;
}

async function renderWeeklyStars() {
  const card = $id('weeklyStarCard');
  const box = $id('weeklyStarContent');
  if (!card || !box) return;

  // 開關（後端 STAR_ENABLED，預設開；讀不到也預設開）
  let enabled = true;
  if (getWebAppUrl()) {
    try {
      const res = await postToWebApp({ action: 'getStarConfig' });
      if (res && res.ok && res.data && typeof res.data.enabled !== 'undefined') enabled = !!res.data.enabled;
    } catch (e) { /* 預設開 */ }
  }
  if (!enabled) { card.style.display = 'none'; return; }

  const all = await fetchAllRecords();
  const stars = computeWeeklyStars(all);
  if (!stars.length) { card.style.display = 'none'; return; }

  box.innerHTML = stars.map(s =>
    `<div class="star-row">
       <span class="star-cat">${s.icon} ${s.label}</span>
       <span class="star-name">${escapeHtml(s.name)}</span>
       <span class="star-note">${escapeHtml(s.note)}</span>
     </div>`
  ).join('');
  card.style.display = 'block';
}

// 同一人同一天只保留最新一筆（依 timestamp，缺則用 date）
function dedupeLatestByName(records) {
  const map = {};
  records.forEach(r => {
    const k = String(r.name || '').trim();
    if (!k) return;
    if (!map[k]) { map[k] = r; return; }
    const tNew = new Date(r.timestamp || r.date || 0).getTime();
    const tOld = new Date(map[k].timestamp || map[k].date || 0).getTime();
    if (tNew >= tOld) map[k] = r;
  });
  return Object.keys(map).map(k => map[k]);
}

// 同一天只保留最新一筆（給單一選手的紀錄用），回傳新→舊排序
function dedupeLatestByDate(records) {
  const map = {};
  records.forEach(r => {
    const k = normDate(r.date);
    if (!k) return;
    if (!map[k]) { map[k] = r; return; }
    const tNew = new Date(r.timestamp || r.date || 0).getTime();
    const tOld = new Date(map[k].timestamp || map[k].date || 0).getTime();
    if (tNew >= tOld) map[k] = r;
  });
  return Object.keys(map).sort((a, b) => a < b ? 1 : -1).map(k => map[k]);
}

function renderCoachReadinessOverview(todays, all) {
  const box = $id('coachReadinessOverview');
  const groupsBox = $id('coachReadinessGroups');
  if (!box || !groupsBox) return;
  const roster = getPlayers();
  const reported = todays.length;
  const missing = Math.max(0, roster.length - reported);
  const avg = reported ? Math.round(todays.reduce((s, r) => s + (nval(r.finalReadinessScore) || 0), 0) / reported) : 0;
  const countBy = label => todays.filter(r => String(r.readinessStatusLight || '').indexOf(label) !== -1).length;
  const highRisk = todays.filter(r => String(r.aiTags || '').match(/受傷風險|高風險|需要關心|脫水風險|睡眠不足/) || (nval(r.finalReadinessScore) || 100) < 55);
  box.innerHTML = [
    ['全隊平均準備度', reported ? avg + ' 分' : '--'],
    ['綠燈人數', countBy('綠燈')],
    ['黃燈人數', countBy('黃燈')],
    ['橘燈人數', countBy('橘燈')],
    ['紅燈人數', countBy('紅燈')],
    ['今日未回報', missing],
    ['高風險名單', highRisk.length]
  ].map(c => `<div class="ov-cell"><span class="ov-num">${c[1]}</span><span class="ov-label">${c[0]}</span></div>`).join('');

  const buckets = { '強化組': [], '穩定組': [], '調整組': [], '保護組': [], '關懷組': [] };
  todays.forEach(r => {
    const light = readinessLight(nval(r.finalReadinessScore) || 0);
    buckets[light.group].push(r);
  });
  groupsBox.innerHTML = Object.keys(buckets).map(name => {
    const list = buckets[name];
    return `<div class="readiness-group"><h4>${name}（${list.length}）</h4>` +
      (list.length ? list.map(r => `<div class="readiness-person"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.finalReadinessScore || '--')}｜${escapeHtml(r.readinessStatusLight || '')}</span><small>${escapeHtml(r.trainingDirection || '')}</small></div>`).join('') : '<p class="review-label">無</p>') +
      `</div>`;
  }).join('');
}

function coachScoreButtons(field, value) {
  const cur = String(value || '');
  return `<div class="coach-score-row" data-field="${field}">` +
    [1, 2, 3, 4, 5].map(n => `<button type="button" class="coach-score-btn ${cur === String(n) ? 'sel' : ''}" data-score="${n}" title="${escapeHtml(COACH_SCORE_HELP[field][n - 1])}">${n}<small>${escapeHtml(COACH_SCORE_HELP[field][n - 1])}</small></button>`).join('') +
    `</div>`;
}
function renderCoachQuickScores(todays, coachScores) {
  const box = $id('coachQuickScoreList');
  if (!box) return;
  const date = $id('coachDate').value || todayStr();
  const byName = {};
  todays.forEach(r => { byName[String(r.name || '').trim()] = r; });
  const scoreMap = {};
  (coachScores || []).forEach(s => { scoreMap[String(s.studentName || '').trim()] = s; });
  const names = Array.from(new Set(
    getPlayers()
      .concat((todays || []).map(r => r.name).filter(Boolean))
      .concat((coachScores || []).map(r => r.studentName).filter(Boolean))
  ));
  box.innerHTML = names.map(name => {
    const r = byName[name] || {};
    const s = Object.assign({}, scoreMap[name] || {}, r);
    const readiness = r.name ? buildReadinessAnalysis(s, []) : null;
    const scored = !!(s.coachAttitudeScore && s.coachTechniqueScore && s.coachExecutionScore && s.coachRiskScore);
    return `<div class="coach-score-card collapsed${scored ? ' is-scored' : ''}" data-name="${escapeHtml(name)}">
      <div class="coach-score-head">
        <div class="coach-score-head-main"><b>${escapeHtml(name)}${scored ? ' <span class="coach-score-done">✓ 已評</span>' : ''}</b><span>${r.name ? `${readiness.finalReadinessScore}｜${readiness.statusLight}` : '今日尚未回報，可先建立教練簡評'}</span></div>
        <span class="coach-score-caret" aria-hidden="true">▾</span>
      </div>
      <div class="coach-score-body">
        <label>訓練態度 ${coachScoreButtons('coachAttitudeScore', s.coachAttitudeScore)}</label>
        <label>技術表現 ${coachScoreButtons('coachTechniqueScore', s.coachTechniqueScore)}</label>
        <label>執行力 ${coachScoreButtons('coachExecutionScore', s.coachExecutionScore)}</label>
        <label>風險判斷 ${coachScoreButtons('coachRiskScore', s.coachRiskScore)}</label>
        <textarea class="text-input coach-public-note" rows="2" placeholder="教練公開提醒，可給家長看">${escapeHtml(s.coachPublicNote || '')}</textarea>
        <textarea class="text-input coach-private-note" rows="2" placeholder="教練私密備註，只給教練後台看">${escapeHtml(s.coachPrivateNote || '')}</textarea>
        <button type="button" class="btn btn-primary btn-save-coach-score">儲存簡評</button>
      </div>
    </div>`;
  }).join('');
  // 點卡片標題收合／展開（點「儲存簡評」按鈕不觸發）
  box.querySelectorAll('.coach-score-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.btn-save-coach-score')) return;
      head.closest('.coach-score-card').classList.toggle('collapsed');
    });
  });
  box.querySelectorAll('.coach-score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.coach-score-row');
      row.querySelectorAll('.coach-score-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });
  box.querySelectorAll('.btn-save-coach-score').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.coach-score-card');
      const row = { date: date, studentName: card.dataset.name };
      card.querySelectorAll('.coach-score-row').forEach(r => {
        const sel = r.querySelector('.coach-score-btn.sel');
        row[r.dataset.field] = sel ? sel.dataset.score : '';
      });
      row.coachPublicNote = card.querySelector('.coach-public-note').value.trim();
      row.coachPrivateNote = card.querySelector('.coach-private-note').value.trim();
      if (!row.coachAttitudeScore || !row.coachTechniqueScore || !row.coachExecutionScore || !row.coachRiskScore) {
        toast('請先完成 4 個教練簡評分數');
        return;
      }
      btn.disabled = true; btn.textContent = '儲存中...';
      try {
        await saveCoachScoreRow(row);
        const existing = byName[row.studentName];
        if (existing && existing.recordId) {
          Object.assign(existing, row);
          const rd = applyReadiness(existing, []);
          await updateRecordRemote(existing.recordId, {
            coachAttitudeScore: row.coachAttitudeScore,
            coachTechniqueScore: row.coachTechniqueScore,
            coachExecutionScore: row.coachExecutionScore,
            coachRiskScore: row.coachRiskScore,
            coachPublicNote: row.coachPublicNote,
            coachPrivateNote: row.coachPrivateNote,
            selfScore: existing.selfScore,
            coachScore: existing.coachScore,
            readinessRecoveryScore: existing.readinessRecoveryScore,
            attendanceScore: existing.attendanceScore,
            riskPenalty: existing.riskPenalty,
            finalReadinessScore: existing.finalReadinessScore,
            readinessStatusLight: existing.readinessStatusLight,
            aiTags: existing.aiTags,
            trainingDirection: existing.trainingDirection,
            readinessJson: existing.readinessJson
          });
        }
        toast('✅ 已儲存教練今日簡評');
        await refreshCoach();
      } catch (e) {
        toast('⚠️ ' + e.message);
      } finally {
        btn.disabled = false; btn.textContent = '儲存簡評';
      }
    });
  });
}

async function refreshCoach() {
  toast('讀取資料中...');
  const all = await fetchAllRecords();
  const filterDate = $id('coachDate').value;
  const statusFilter = $id('coachStatusFilter').value;
  const coachScores = await fetchCoachScores(filterDate);

  // 今日（或選定日期）紀錄（日期先正規化，避免 Sheet 把日期轉成 Date 物件導致比對失敗）
  let todays = all.filter(r => normDate(r.date) === filterDate);
  // 同一人同一天只保留最新一筆，避免重複送出灌水（含舊資料已存在的重複）
  todays = dedupeLatestByName(todays);
  mergeCoachScores(todays, coachScores);
  todays.forEach(r => applyReadiness(r, all.filter(x => String(x.name) === String(r.name))));
  if (statusFilter !== 'all') todays = todays.filter(r => r.status === statusFilter);

  renderCoachWarRoom(todays, all);
  renderCoachReadinessOverview(todays, all);
  renderCoachQuickScores(todays, coachScores);
  renderOverview(todays);
  renderTeamMood(todays);
  renderSubmitStatus(todays);
  renderCoachAttendanceReports(todays);
  renderStatusLists(todays);
  renderRedLightCoaching(todays);
  renderAnalysis(todays);
  renderCoachNutrition(todays, all);
  renderCoachAlerts(all);
  renderInterviewList(todays, all);
  renderCoachTasks();
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

/* ---- 團隊今日心情：一眼看出全隊氣氛，並抓出需要關心的人 ---- */
function renderTeamMood(todays) {
  const box = $id('coachMood');
  if (!box) return;

  const withMood = todays.filter(r => String(r.moodIndex || '').trim() !== '' && !isNaN(parseFloat(r.moodIndex)));
  if (!withMood.length) {
    box.innerHTML = `<div class="hint-box">今天還沒有人填心情指數。學生在「填寫頁 → 今日心情指數」勾選後，這裡就會顯示全隊氣氛。</div>`;
    return;
  }

  const vals = withMood.map(r => parseFloat(r.moodIndex));
  const avg = round1(vals.reduce((a, b) => a + b, 0) / vals.length);
  const low = withMood.filter(r => parseFloat(r.moodIndex) <= 2);
  const mid = withMood.filter(r => parseFloat(r.moodIndex) === 3);
  const high = withMood.filter(r => parseFloat(r.moodIndex) >= 4);

  // 團隊氣氛燈號
  let teamLight, teamWord, cls;
  if (avg >= 4) { teamLight = '🟢'; teamWord = '全隊氣氛愉快'; cls = 'good'; }
  else if (avg >= 3) { teamLight = '🟡'; teamWord = '氣氛普通，留意個別狀況'; cls = ''; }
  else { teamLight = '🔴'; teamWord = '低氣壓，今天多給點關心'; cls = 'warn'; }

  const faceAvg = moodMeta(Math.round(avg)) ? moodMeta(Math.round(avg)).emoji : '🙂';

  let html = `<div class="mood-team-head ${cls}">
    <span class="mood-team-face">${faceAvg}</span>
    <div><div class="mood-team-light">${teamLight} ${teamWord}</div>
    <div class="mood-team-sub">平均心情 ${avg} / 5　（${withMood.length} 人已回報）</div></div>
  </div>`;

  // 分布
  html += `<div class="overview-grid" style="margin-top:12px">
    ${moodDistCell('😄🙂 開心', high.length, 'green')}
    ${moodDistCell('😐 普通', mid.length, 'yellow')}
    ${moodDistCell('😕😣 低落', low.length, 'red')}
  </div>`;

  // 需要關心名單（心情 ≤ 2）
  if (low.length) {
    html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💛 今天需要關心（${low.length}）</h4>`;
    low.sort((a, b) => parseFloat(a.moodIndex) - parseFloat(b.moodIndex)).forEach(r => {
      const reason = String(r.moodReason || '').trim();
      html += `<div class="redcare-card"><div class="redcare-head"><b>${escapeHtml(r.name)}</b><span class="tag tag-red">${moodText(r.moodIndex)}</span></div>`;
      if (reason) html += `<div class="redcare-low">原因：${escapeHtml(reason)}</div>`;
      html += `</div>`;
    });
    html += `<div class="hint-box">這幾位今天心情偏低，訓練前後找機會關心一下，別讓情緒累積。</div>`;
  } else {
    html += `<div class="hint-box good">今天沒有人心情偏低 👍</div>`;
  }

  box.innerHTML = html;
}
function moodDistCell(label, n, color) {
  return `<div class="ov-cell"><span class="ov-num" style="color:var(--${color})">${n}</span><span class="ov-label">${label}</span></div>`;
}

/* ---- 已填寫 / 未填寫名單（對照全隊名單）---- */
function renderSubmitStatus(todays) {
  const box = $id('coachSubmitStatus');
  if (!box) return;
  const roster = getPlayers();

  // 已填寫姓名（去重）
  const submittedSet = {};
  todays.forEach(r => { if (r.name) submittedSet[String(r.name).trim()] = true; });

  const submitted = roster.filter(n => submittedSet[n]);
  const notSubmitted = roster.filter(n => !submittedSet[n]);
  // 有填寫但不在名單上的（例如名單改過、或臨時填的）
  const extra = Object.keys(submittedSet).filter(n => roster.indexOf(n) === -1);

  // 卡片標題：未填 > 0 時顯示紅字提醒
  const title = $id('coachSubmitTitle');
  if (title) {
    if (notSubmitted.length) {
      title.innerHTML = `📝 填寫狀況 <span style="color:var(--red,#ff6b6b)">（未填 ${notSubmitted.length} 人）</span>`;
    } else {
      title.innerHTML = `📝 填寫狀況 <span style="color:var(--green,#39d98a)">（全員已填）</span>`;
    }
  }

  let html = '';
  html += `<div class="review-row"><span class="review-label">填寫進度</span>` +
          `<span class="review-value">${submitted.length} / ${roster.length} 人（未填 ${notSubmitted.length} 人）</span></div>`;

  html += `<div class="list-block"><h4>✅ 已填寫（${submitted.length}）</h4><div class="name-list">`;
  if (submitted.length) submitted.forEach(n => html += `<span class="tag tag-green">${n}</span>`);
  else html += '<span class="review-label">尚無人填寫</span>';
  html += `</div></div>`;

  html += `<div class="list-block"><h4>⭕ 未填寫（${notSubmitted.length}）</h4>`;
  if (notSubmitted.length) {
    html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-bottom:6px">👆 點選姓名挑選要催繳的對象（預設全選）</div>`;
    html += `<div style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" id="btnPickAll" class="btn btn-secondary" style="padding:4px 12px">全選</button>
      <button type="button" id="btnPickNone" class="btn btn-secondary" style="padding:4px 12px">全不選</button>
    </div>`;
    html += `<div class="name-list" id="notSubmittedList">`;
    notSubmitted.forEach(n => html += `<span class="tag tag-red tag-pick sel" data-name="${n}">${n}</span>`);
    html += `</div>`;
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button type="button" id="btnShareRemind" class="btn btn-line-share">💬 分享催繳到 LINE<span id="remindCount"></span></button>
      <button type="button" id="btnCopyNotSubmitted" class="btn btn-secondary">📋 複製名單</button>
    </div>`;
  } else {
    html += `<div class="name-list"><span class="review-label">全員都填了，太棒了！</span></div>`;
  }
  html += `</div>`;

  if (extra.length) {
    html += `<div class="list-block"><h4>❓ 名單外（${extra.length}）</h4><div class="name-list">`;
    extra.forEach(n => html += `<span class="tag tag-orange">${n}</span>`);
    html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:4px">這些人有填寫但不在目前名單，可能是改名或臨時填寫。</div></div></div>`;
  }

  box.innerHTML = html;

  // 取得目前勾選（點選）的未填姓名
  function getPicked() {
    return Array.from(box.querySelectorAll('.tag-pick.sel')).map(e => e.dataset.name);
  }

  // 更新催繳按鈕上的人數
  function updateRemindCount() {
    const cntEl = $id('remindCount');
    if (cntEl) cntEl.textContent = `（${getPicked().length}）`;
  }

  // 催繳訊息文字（只含勾選的人）。改名避免和全域 buildRemindText（教練提醒語）衝突。
  function buildAttendanceRemindText(names) {
    const dateStr = dateSlash($id('coachDate').value || todayStr());
    const fillUrl = location.origin + location.pathname;
    return `🥋 育林國中技擊隊｜今日 KPI 填寫提醒
日期：${dateStr}

以下同學今天還沒填寫，請記得完成自己的訓練紀錄 🙏

${names.map(n => '・' + n).join('\n')}

（填寫進度：${submitted.length} / ${roster.length} 人）

👉 點我填寫：
${fillUrl}`;
  }

  // 點選姓名切換選取
  const listEl = $id('notSubmittedList');
  if (listEl) {
    listEl.addEventListener('click', e => {
      const tag = e.target.closest('.tag-pick');
      if (!tag) return;
      tag.classList.toggle('sel');
      updateRemindCount();
    });
  }
  // 全選 / 全不選
  const pickAllBtn = $id('btnPickAll');
  if (pickAllBtn) pickAllBtn.addEventListener('click', () => {
    box.querySelectorAll('.tag-pick').forEach(t => t.classList.add('sel'));
    updateRemindCount();
  });
  const pickNoneBtn = $id('btnPickNone');
  if (pickNoneBtn) pickNoneBtn.addEventListener('click', () => {
    box.querySelectorAll('.tag-pick').forEach(t => t.classList.remove('sel'));
    updateRemindCount();
  });

  // 複製名單（只含勾選）
  const copyBtn = $id('btnCopyNotSubmitted');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const picked = getPicked();
    if (!picked.length) { toast('請至少點選一位'); return; }
    copyText(buildAttendanceRemindText(picked));
  });

  // 分享催繳到 LINE（免費分享，跳出 LINE 選群組送出，不吃推播額度）
  const shareBtn = $id('btnShareRemind');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    const picked = getPicked();
    if (!picked.length) { toast('請至少點選一位'); return; }
    shareToLine(buildAttendanceRemindText(picked));
  });

  updateRemindCount();
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

/* ---- 紅黃燈關懷：教練給方向與鼓勵（送出後選手在「上次表現」看得到）---- */
function renderRedLightCoaching(todays) {
  const box = $id('coachRedLight');
  if (!box) return;
  // 紅燈優先、其次黃燈
  const reds = todays.filter(r => r.status && r.status.indexOf('紅') !== -1);
  const yellows = todays.filter(r => r.status && r.status.indexOf('黃') !== -1);
  const list = reds.concat(yellows);
  if (!list.length) {
    box.innerHTML = '<div class="hint-box good">今天沒有紅燈或黃燈選手，狀況穩定 👍</div>';
    return;
  }

  let html = '';
  list.forEach(r => {
    const isRed = r.status && r.status.indexOf('紅') !== -1;
    const tagCls = isRed ? 'tag-red' : 'tag-yellow';
    const lampTxt = isRed ? '🔴 紅燈' : '🟡 黃燈';
    let low = [];
    try { low = findLowItems(JSON.parse(r.rawScoresJson || '{}')); } catch (e) { /* */ }
    const lowText = low.length ? low.map(l => `${l.item}(${l.score})`).join('、') : '—';
    const suggested = (low.length && suggestionMap[low[0].item]) ? suggestionMap[low[0].item].advice : '明天先把基本動作與節奏做穩。';
    const canTarget = !!r.recordId;

    html += `<div class="redcare-card ${isRed ? '' : 'is-yellow'}" data-rid="${r.recordId || ''}">`;
    html += `<div class="redcare-head"><b>${r.name}</b><span class="tag ${tagCls}">${lampTxt}・平均 ${r.averageScore}</span></div>`;
    html += `<div class="redcare-low">今日偏弱：${lowText}</div>`;
    html += `<div class="redcare-suggest">💡 建議方向：${suggested}</div>`;
    if (r.coachReply) html += `<div class="hint-box good">✅ 已送出給選手：${escapeHtml(r.coachReply)}</div>`;

    if (canTarget) {
      html += `<div class="redcare-divider"></div>`;
      html += `<textarea class="text-input" id="redmsg-${r.recordId}" rows="2" placeholder="給 ${r.name} 的方向與鼓勵…（可用下方快捷語帶入）">${escapeHtml(r.coachReply || '')}</textarea>`;
      html += `<div class="quick-chips redcare-chips" id="redchips-${r.recordId}" style="display:none;"></div>`;
      html += `<div class="redcare-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-redtoggle="${r.recordId}">💬 快捷語 ▾</button>
        <button type="button" class="btn btn-primary" data-redsend="${r.recordId}">📨 送出給選手</button>
        <button type="button" class="btn btn-line-share" data-redshare="${r.recordId}">💬 分享到 LINE</button>
      </div>`;

      // 紅燈處理紀錄（原因 / 處理方式 / 備註）
      const curReasons = String(r.redLightReason || '').split('、').filter(Boolean);
      const curHandling = String(r.redLightHandling || '').split('、').filter(Boolean);
      html += `<div class="redcare-divider"></div>`;
      html += `<div class="redcare-low">📋 紅燈處理紀錄</div>`;
      html += `<div style="color:var(--text-soft);font-size:0.8rem;margin:2px 0">原因分類</div><div class="name-list">`;
      RED_LIGHT_REASONS.forEach(x => html += `<span class="tag tag-pick reason-pick ${curReasons.indexOf(x) !== -1 ? 'sel' : ''}" data-rid="${r.recordId}" data-val="${x}">${x}</span>`);
      html += `</div>`;
      html += `<div style="color:var(--text-soft);font-size:0.8rem;margin:6px 0 2px">處理方式</div><div class="name-list">`;
      RED_LIGHT_HANDLINGS.forEach(x => html += `<span class="tag tag-pick handle-pick ${curHandling.indexOf(x) !== -1 ? 'sel' : ''}" data-rid="${r.recordId}" data-val="${x}">${x}</span>`);
      html += `</div>`;
      html += `<textarea class="text-input" id="rednote-${r.recordId}" rows="2" placeholder="處理備註（選填）" style="margin-top:8px">${escapeHtml(r.redLightNote || '')}</textarea>`;
      html += `<button type="button" class="btn btn-secondary" data-redsave="${r.recordId}" style="margin-top:6px">💾 儲存處理紀錄</button>`;
    } else {
      html += `<div class="hint-box">這是較舊的紀錄，無法直接送出（新版紀錄才支援）。可用個人查詢或當面給予。</div>`;
    }
    html += `</div>`;
  });
  box.innerHTML = html;

  // 組成要分享／送出的訊息
  function careMessage(r, text) {
    return `🥋 育林國中技擊隊｜教練的話
給：${r.name}
日期：${dateSlash(r.date)}

${text}

教練相信你，明天一起調整 💪`;
  }

  // 快捷語 + 送出 + 分享按鈕
  list.forEach(r => {
    if (!r.recordId) return;
    const chipBox = $id(`redchips-${r.recordId}`);
    if (chipBox) {
      COACH_DIRECTION_PRESETS.forEach(text => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = text.length > 18 ? text.slice(0, 18) + '…' : text;
        chip.title = text;
        chip.addEventListener('click', () => {
          const ta = $id(`redmsg-${r.recordId}`);
          ta.value = ta.value.trim() ? (ta.value.trim() + '\n' + text) : text;
        });
        chipBox.appendChild(chip);
      });
    }
    const toggleBtn = box.querySelector(`[data-redtoggle="${r.recordId}"]`);
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const cb = $id(`redchips-${r.recordId}`);
      if (!cb) return;
      const show = cb.style.display === 'none';
      cb.style.display = show ? 'flex' : 'none';
      toggleBtn.textContent = show ? '💬 快捷語 ▴' : '💬 快捷語 ▾';
    });
    const btn = box.querySelector(`[data-redsend="${r.recordId}"]`);
    if (btn) btn.addEventListener('click', async () => {
      const text = $id(`redmsg-${r.recordId}`).value.trim();
      if (!text) { toast('請先輸入要給選手的話'); return; }
      btn.disabled = true; btn.textContent = '送出中...';
      const ok = await updateRecordRemote(r.recordId, { coachReply: text });
      btn.disabled = false; btn.textContent = '📨 送出給選手';
      toast(ok ? '✅ 已送出，選手在「上次表現」看得到' : '⚠️ 送出失敗，請檢查連線');
      if (ok) { r.coachReply = text; renderRedLightCoaching(todays); }
    });
    const shareBtn = box.querySelector(`[data-redshare="${r.recordId}"]`);
    if (shareBtn) shareBtn.addEventListener('click', () => {
      const text = $id(`redmsg-${r.recordId}`).value.trim();
      if (!text) { toast('請先輸入要給選手的話'); return; }
      shareToLine(careMessage(r, text));
    });
    // 紅燈處理紀錄：勾選切換 + 儲存
    box.querySelectorAll(`.tag-pick[data-rid="${r.recordId}"]`).forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('sel'));
    });
    const saveRed = box.querySelector(`[data-redsave="${r.recordId}"]`);
    if (saveRed) saveRed.addEventListener('click', async () => {
      const reasons = Array.from(box.querySelectorAll(`.reason-pick.sel[data-rid="${r.recordId}"]`)).map(e => e.dataset.val).join('、');
      const handling = Array.from(box.querySelectorAll(`.handle-pick.sel[data-rid="${r.recordId}"]`)).map(e => e.dataset.val).join('、');
      const note = $id(`rednote-${r.recordId}`).value.trim();
      saveRed.disabled = true; saveRed.textContent = '儲存中...';
      const ok = await updateRecordRemote(r.recordId, { redLightReason: reasons, redLightHandling: handling, redLightNote: note });
      saveRed.disabled = false; saveRed.textContent = '💾 儲存處理紀錄';
      toast(ok ? '✅ 已儲存紅燈處理紀錄' : '⚠️ 儲存失敗，請檢查連線');
      if (ok) { r.redLightReason = reasons; r.redLightHandling = handling; r.redLightNote = note; }
    });
  });
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
    if (r.readinessStatusLight && r.readinessStatusLight.indexOf('紅燈') !== -1) add(r.name, '準備度紅燈關懷日');
    if (r.readinessStatusLight && r.readinessStatusLight.indexOf('橘燈') !== -1) add(r.name, '準備度橘燈保護日');
    if ((parseFloat(r.painScore) || 0) >= 7) add(r.name, '疼痛 7 分以上');
    if ((parseFloat(r.coachRiskScore) || 5) <= 2) add(r.name, '教練風險判斷偏高');
    if (String(r.aiTags || '').indexOf('高風險硬撐') !== -1) add(r.name, '高風險硬撐');
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
      if (String(a.readinessStatusLight || '').indexOf('紅燈') !== -1 && String(b.readinessStatusLight || '').indexOf('紅燈') !== -1) add(name, '連續兩天紅燈');
      if ((parseFloat(a.sleepHours) || 99) < 6 && (parseFloat(b.sleepHours) || 99) < 6) add(name, '連續睡眠不足');
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

/* ============================================================
   11.5 教練指定任務（功能一）
   ============================================================ */

const TASK_DONE_OPTIONS = ['未完成', '部分完成', '完成', '超越目標'];

// 學生填寫頁：載入並顯示今日任務
function loadStudentTask(name) {
  const card = $id('taskCard');
  const box = $id('taskContent');
  if (!card || !box || !name) { if (card) card.style.display = 'none'; return; }
  const date = $id('date') ? ($id('date').value || todayStr()) : todayStr();
  appGet(appKeyTask(name, date), data => renderStudentTask(name, date, data));
}

function renderStudentTask(name, date, data) {
  const card = $id('taskCard');
  const box = $id('taskContent');
  if (!card || !box) return;
  if (!data || !data.task) { card.style.display = 'none'; return; }

  let html = `<div class="hint-box">🎯 ${escapeHtml(data.task)}</div>`;
  if (data.coachObservation) html += `<div class="hint-box good">👀 教練觀察：${escapeHtml(data.coachObservation)}</div>`;
  if (data.coachNextStep) html += `<div class="hint-box good">➡️ 下一步：${escapeHtml(data.coachNextStep)}</div>`;

  html += `<label class="field-label">任務完成度</label>`;
  html += `<select id="taskCompletion" class="text-input">` +
    TASK_DONE_OPTIONS.map(o => `<option value="${o}"${data.completion === o ? ' selected' : ''}>${o}</option>`).join('') + `</select>`;
  html += `<label class="field-label">想跟教練說的（選填）</label>`;
  html += `<textarea id="taskStudentNote" class="text-input" rows="2" placeholder="例如：旋踢距離我覺得比昨天穩了">${escapeHtml(data.studentNote || '')}</textarea>`;
  html += `<button type="button" id="btnReportTask" class="btn btn-primary" style="margin-top:8px">📨 回報完成度</button>`;
  box.innerHTML = html;
  card.style.display = 'block';

  $id('btnReportTask').addEventListener('click', async () => {
    const merged = Object.assign({}, data, {
      completion: $id('taskCompletion').value,
      studentNote: $id('taskStudentNote').value.trim()
    });
    const btn = $id('btnReportTask');
    btn.disabled = true; btn.textContent = '回報中...';
    await appSet(appKeyTask(name, date), merged);
    btn.disabled = false; btn.textContent = '📨 回報完成度';
    toast('✅ 已回報任務完成度');
    renderStudentTask(name, date, merged);
  });
}

// 教練後台：任務指派 + 完成狀況
function setupTaskHandlers() {
  const dateEl = $id('taskDate');
  if (dateEl && !dateEl.value) dateEl.value = todayStr();
  const assignBtn = $id('btnAssignTask');
  if (assignBtn) assignBtn.addEventListener('click', async () => {
    const name = $id('taskAssignName').value;
    const date = $id('taskDate').value || todayStr();
    const task = $id('taskAssignText').value.trim();
    if (!name) { toast('請選擇選手'); return; }
    if (!task) { toast('請輸入任務內容'); return; }
    const prev = appGet(appKeyTask(name, date)) || {};
    assignBtn.disabled = true; assignBtn.textContent = '指派中...';
    await appSet(appKeyTask(name, date), Object.assign({}, prev, { task: task }));
    assignBtn.disabled = false; assignBtn.textContent = '🎯 指派任務';
    $id('taskAssignText').value = '';
    toast('✅ 已指派任務');
    renderCoachTasks();
  });
  const refreshBtn = $id('btnRefreshTasks');
  if (refreshBtn) refreshBtn.addEventListener('click', renderCoachTasks);
}

async function renderCoachTasks() {
  const box = $id('coachTaskList');
  if (!box) return;
  const date = $id('taskDate') ? ($id('taskDate').value || todayStr()) : todayStr();
  box.innerHTML = '<div class="hint-box">讀取中...</div>';
  const all = await appGetAll('task:');
  // 篩出當天的任務
  const rows = Object.keys(all)
    .filter(k => k.endsWith(':' + normDate(date)))
    .map(k => ({ name: k.split(':')[1], data: all[k] }))
    .filter(r => r.data && r.data.task);

  if (!rows.length) { box.innerHTML = '<div class="hint-box">這天還沒指派任何任務。</div>'; return; }

  let html = '';
  rows.forEach(r => {
    const d = r.data;
    const doneTag = d.completion
      ? `<span class="tag ${d.completion === '未完成' ? 'tag-red' : (d.completion === '部分完成' ? 'tag-yellow' : 'tag-green')}">${d.completion}</span>`
      : `<span class="tag tag-orange">未回報</span>`;
    html += `<div class="redcare-card" data-tname="${escapeHtml(r.name)}">`;
    html += `<div class="redcare-head"><b>${escapeHtml(r.name)}</b>${doneTag}</div>`;
    html += `<div class="redcare-low">🎯 ${escapeHtml(d.task)}</div>`;
    if (d.studentNote) html += `<div class="hint-box">💬 選手回報：${escapeHtml(d.studentNote)}</div>`;
    html += `<label class="field-label">教練觀察</label><textarea class="text-input" id="tobs-${escapeHtml(r.name)}" rows="2" placeholder="這次任務的觀察…">${escapeHtml(d.coachObservation || '')}</textarea>`;
    html += `<label class="field-label">下一步建議</label><textarea class="text-input" id="tnext-${escapeHtml(r.name)}" rows="2" placeholder="下一步要練什麼…">${escapeHtml(d.coachNextStep || '')}</textarea>`;
    html += `<button type="button" class="btn btn-primary" data-tsave="${escapeHtml(r.name)}" style="margin-top:8px">💾 儲存觀察</button>`;
    html += `</div>`;
  });
  box.innerHTML = html;

  rows.forEach(r => {
    const btn = box.querySelector(`[data-tsave="${CSS.escape(r.name)}"]`);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const merged = Object.assign({}, r.data, {
        coachObservation: $id(`tobs-${r.name}`).value.trim(),
        coachNextStep: $id(`tnext-${r.name}`).value.trim()
      });
      btn.disabled = true; btn.textContent = '儲存中...';
      await appSet(appKeyTask(r.name, date), merged);
      btn.disabled = false; btn.textContent = '💾 儲存觀察';
      toast('✅ 已儲存，選手填寫時看得到');
    });
  });
}

/* ============================================================
   11.6 連續警示系統（功能五）
   ============================================================ */
function computeAlerts(recs) {
  // recs：同一選手、已依日期去重、新→舊
  const alerts = [];
  const has = n => recs.length >= n;
  const recent = n => recs.slice(0, n);
  const every = (n, pred) => has(n) && recent(n).every(pred);
  const num = (r, f) => parseFloat(r[f]);
  const lowWater = r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml';
  // 該指標在窗內是否逐步上升（最新 > 窗內最舊）
  const improving = (n, f) => has(n) && (num(recent(n)[0], f) > num(recent(n)[n - 1], f));

  if (every(2, r => r.bodyStatus === '受傷中'))
    alerts.push({ level: 'warn', text: '🤕 連續 2 天回報受傷中，建議調整訓練量並關心' });
  else if (every(2, r => r.bodyStatus === '疲勞' || r.bodyStatus === '受傷中'))
    alerts.push({ level: 'warn', text: '😪 連續 2 天疲勞，注意休息與恢復' });

  if (every(3, lowWater)) alerts.push({ level: 'warn', text: '💧 連續 3 天水量不足，提醒補水' });
  if (every(2, r => r.lateNightSnack && r.lateNightSnack !== '無'))
    alerts.push({ level: 'warn', text: '🌙 連續 2 次宵夜，注意飲食與睡眠' });

  if (every(3, r => num(r, 'emotionAvg') < 3)) {
    if (improving(3, 'emotionAvg')) alerts.push({ level: 'watch', text: '📈 情緒分數偏低但逐日進步中（進步觀察中）' });
    else alerts.push({ level: 'warn', text: '😔 連續 3 天情緒偏低，建議個別關心' });
  }
  if (every(3, r => num(r, 'technicalAvg') < 3)) {
    if (improving(3, 'technicalAvg')) alerts.push({ level: 'watch', text: '📈 技術分數偏低但逐日進步中（進步觀察中）' });
    else alerts.push({ level: 'warn', text: '🥋 連續 3 天技術偏低，安排技術修正' });
  }
  return alerts;
}

function renderCoachAlerts(all) {
  const box = $id('coachAlerts');
  if (!box) return;
  const byName = {};
  (all || []).forEach(r => { if (r && r.name) (byName[r.name] = byName[r.name] || []).push(r); });

  let html = '';
  Object.keys(byName).forEach(name => {
    const recs = dedupeLatestByDate(byName[name]); // 新→舊
    const alerts = computeAlerts(recs);
    if (!alerts.length) return;
    html += `<div class="redcare-card"><div class="redcare-head"><b>${escapeHtml(name)}</b></div>`;
    alerts.forEach(a => {
      const cls = a.level === 'watch' ? 'good' : 'warn';
      html += `<div class="hint-box ${cls}">${a.text}</div>`;
    });
    html += `</div>`;
  });
  box.innerHTML = html || '<div class="hint-box good">目前沒有連續警示，全隊狀況穩定 👍</div>';
}

/* ============================================================
   11.7 賽前狀態雷達（功能六）
   ============================================================ */
async function loadPreComp() {
  const name = $id('preCompName').value;
  const box = $id('preCompResult');
  if (!box) return;
  if (!name) { toast('請選擇選手'); return; }
  box.innerHTML = '<div class="hint-box">分析中...</div>';
  const history = await fetchRecentRecords(name, 30);
  const recs = dedupeLatestByDate(history || []).slice(0, 5); // 最近 5 筆
  if (!recs.length) { box.innerHTML = '<div class="hint-box">查無紀錄。</div>'; return; }

  // 六面向平均
  const avg = {};
  ASPECT_ORDER.forEach(k => {
    const vals = recs.map(r => parseFloat(r[ASPECT_AVG_FIELD[k]])).filter(v => !isNaN(v));
    avg[k] = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });
  const overall = round2(ASPECT_ORDER.reduce((s, k) => s + avg[k], 0) / 6);

  // 體重趨勢、恢復（疲勞/受傷天數）
  const weights = recs.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wTxt = weights.length >= 2 ? `${weights[weights.length - 1]} → ${weights[0]} kg` : (weights.length ? weights[0] + ' kg' : '--');
  const fatigueDays = recs.filter(r => r.bodyStatus === '疲勞' || r.bodyStatus === '受傷中').length;
  const injured = recs.some(r => r.bodyStatus === '受傷中');

  // 結論
  let verdict, vClass;
  if (injured) { verdict = '🚑 受傷風險：先確認傷勢，未恢復前不建議全力出賽'; vClass = 'warn'; }
  else if (overall >= 4) { verdict = '✅ 可出賽：狀態穩定，維持節奏即可'; vClass = 'good'; }
  else if (overall >= 3.5) { verdict = '🟢 可出賽但需觀察：再把最弱面向顧好'; vClass = 'good'; }
  else if (overall >= 3) { verdict = '🟡 建議調整訓練量：先把基礎與恢復補起來'; vClass = 'warn'; }
  else { verdict = '🔴 建議家長溝通：近期狀態偏低，需要一起關心調整'; vClass = 'warn'; }
  if (!injured && fatigueDays >= 3) verdict += '（近期疲勞偏多，留意恢復）';

  let html = `<div class="review-row"><span class="review-label">分析依據</span><span class="review-value">最近 ${recs.length} 筆</span></div>`;
  html += `<div class="review-row"><span class="review-label">綜合平均</span><span class="review-value">${overall} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">體重趨勢</span><span class="review-value">${wTxt}</span></div>`;
  html += `<div class="review-row"><span class="review-label">疲勞/受傷天數</span><span class="review-value">${fatigueDays} / ${recs.length}</span></div>`;
  html += radarChartSVG(avg);
  html += `<div class="hint-box ${vClass}">${verdict}</div>`;
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
      // 多抓一些，去重後再取 7 筆（避免舊重複資料把名額占滿）
      const res = await postToWebApp({ action: 'getRecentRecordsByName', name: name, limit: 40 });
      recs = (res && res.ok && Array.isArray(res.data)) ? res.data : localRecentRecords(name, 40);
    } catch (e) { recs = localRecentRecords(name, 40); }
  } else {
    recs = localRecentRecords(name, 40);
  }

  // 同一天只保留最新一筆，並取最近 7 天
  recs = dedupeLatestByDate(recs).slice(0, 7);

  const box = $id('coachPersonResult');
  if (!recs.length) { box.innerHTML = '<div class="hint-box">查無紀錄。</div>'; return; }

  let html = '<h4 style="margin-bottom:8px">📈 七天成長趨勢</h4><div id="personTrendBox"></div>';
  html += '<div class="table-scroll"><table class="record-table"><thead><tr>' +
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

  // 七天成長趨勢圖
  const ptb = $id('personTrendBox');
  if (ptb) renderTrendSection(ptb, recs);

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
  const reviewKeys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;

  let html = `<div class="review-card" data-rid="${rec.recordId}">`;
  html += `<div class="review-row"><span class="review-label">${dateSlash(rec.date)}</span><span class="review-value">${rec.status}　${scoreMaxText(rec)}</span></div>`;

  // 六大面向雷達圖（自評＋教練評疊圖）
  html += radarFromRecord(rec);

  // 計算透明化
  html += explainStatusFromRecord(rec);
  // 自評 vs 教練評（已評過才顯示）
  html += renderSelfVsCoach(rec);

  // 選手的看法
  if (rec.studentResponse) html += `<div class="hint-box">💬 選手的看法：${escapeHtml(rec.studentResponse)}</div>`;
  // 家長留言
  if (rec.parentNote) html += `<div class="hint-box">👨‍👩‍👧 家長留言：${escapeHtml(rec.parentNote)}</div>`;

  // 教練評分表單
  html += `<details class="explain"${coach ? '' : ' open'}><summary>✍️ ${coach ? '修改' : '填寫'}教練評分</summary><div class="explain-body">`;
  reviewKeys.forEach(k => {
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
  const reviewKeys = presentAspectKeysFromRecord(rec).length ? presentAspectKeysFromRecord(rec) : ASPECT_ORDER;
  // 拉桿即時更新數字
  reviewKeys.forEach(k => {
    const s = $id(`crv-${rec.recordId}-${k}`);
    if (s) s.addEventListener('input', () => { $id(`crvlbl-${rec.recordId}-${k}`).textContent = s.value; });
  });
  // 儲存評分
  const saveBtn = document.querySelector(`[data-save-review="${rec.recordId}"]`);
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const fields = {};
    let total = 0;
    reviewKeys.forEach(k => {
      const v = parseFloat($id(`crv-${rec.recordId}-${k}`).value) || 0;
      fields[COACH_ASPECT_FIELD[k]] = v; total += v;
    });
    fields.coachTotalScore = round2(total);
    fields.coachAverageScore = round2(total / reviewKeys.length);
    fields.coachStatus = judgeStatus(total / reviewKeys.length);
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
  toast('讀取中...');
  // 同時抓最近一筆與歷史（畫趨勢圖）
  const [rec, history] = await Promise.all([
    fetchLastRecord(name),
    fetchRecentRecords(name, 180)
  ]);
  const card = $id('lastPerfResultCard');
  const box = $id('lastPerfResult');
  const trendCard = $id('trendCard');
  const trendBox = $id('trendBox');

  // 七天成長趨勢圖
  if (trendCard && trendBox) {
    renderTrendSection(trendBox, history || []);
    trendCard.style.display = 'block';
  }

  if (!rec) {
    box.innerHTML = `<div class="hint-box good">這是你的第一筆紀錄，今天開始建立自己的成長軌跡。</div>`;
    card.style.display = 'block';
    return;
  }
  // 重用回顧渲染（但不影響填寫頁的改善區）
  renderLastReviewInto(rec, box);
  card.style.display = 'block';
}

/* ============================================================
   12.5 個人週報（純前端現算，不寫入 Sheet、不動後端）
   ------------------------------------------------------------
   撈最近紀錄 → 篩出近 7 天 → 算出席/KPI/身體恢復/心情/飲食五段，
   並產生可一鍵複製的「家長版 LINE 週報」。
   ============================================================ */

// 今天往前 n 天的 yyyy-mm-dd
function daysAgoYmd(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
  return ymd(d);
}

async function loadWeeklyReport() {
  const name = $id('lastPerfName').value;
  if (!name) { toast('請先選擇選手'); return; }
  toast('產生本週報告中...');
  const [history, leaves] = await Promise.all([
    fetchRecentRecords(name, 60),
    fetchAttendanceReports(name, 60).catch(() => [])
  ]);
  const rpt = buildWeeklyReport(name, history || [], leaves || []);
  const card = $id('weeklyReportCard');
  const box = $id('weeklyReportBox');
  box.innerHTML = rpt.html;
  card.style.display = 'block';
  const copyBtn = $id('btnCopyWeeklyLine');
  if (copyBtn) { copyBtn.style.display = rpt.lineText ? '' : 'none'; copyBtn.onclick = () => copyText(rpt.lineText); }
  const printBtn = $id('btnPrintWeekly');
  if (printBtn) { printBtn.style.display = rpt.lineText ? '' : 'none'; printBtn.onclick = () => window.print(); }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 取一組紀錄某欄位的數字（過濾掉空值）
function weeklyNums(arr, key) {
  return arr.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
}
function weeklyMean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

function buildWeeklyReport(name, history, leaves) {
  const today = ymd(new Date());
  const wkStart = daysAgoYmd(6);            // 近 7 天（含今天）
  const pvStart = daysAgoYmd(13), pvEnd = daysAgoYmd(7); // 對比的上一週

  const all = dedupeLatestByDate(history);  // 新→舊，每天一筆
  const inWk = d => d >= wkStart && d <= today;
  const week = all.filter(r => inWk(normDate(r.date)));
  const prev = all.filter(r => { const d = normDate(r.date); return d >= pvStart && d <= pvEnd; });
  const leaveWeek = (leaves || []).filter(r => inWk(normDate(r.date)));

  const range = `${dateSlash(wkStart)} ~ ${dateSlash(today)}`;

  // 完全沒資料
  if (!week.length && !leaveWeek.length) {
    return {
      html: `<h3 class="card-title">📊 ${escapeHtml(name)}｜本週報告</h3>
        <div class="wk-range">${range}</div>
        <div class="hint-box">本週還沒有任何紀錄。每天送出一筆，週報就會自動長出 5 條成長曲線 🌱</div>`,
      lineText: ''
    };
  }

  const oldToNew = week.slice().reverse(); // 舊→新，方便看趨勢
  const latest = week[0];                  // 本週最新一筆

  // ── ① 出席 ──
  const trainDays = week.length, leaveDays = leaveWeek.length;

  // ── ② KPI ──
  const wkAvg = weeklyMean(weeklyNums(week, 'averageScore'));
  const pvAvg = weeklyMean(weeklyNums(prev, 'averageScore'));
  let avgTrend = '';
  if (wkAvg != null && pvAvg != null) {
    const d = round1(wkAvg - pvAvg);
    avgTrend = d > 0 ? `較上週上升 ${d}` : (d < 0 ? `較上週下降 ${Math.abs(d)}` : '與上週持平');
  }
  // 各面向本週平均、與上週差
  const aspectStat = ASPECT_ORDER.map(k => {
    const cur = weeklyMean(weeklyNums(week, ASPECT_AVG_FIELD[k]));
    const old = weeklyMean(weeklyNums(prev, ASPECT_AVG_FIELD[k]));
    return { k, label: KPI_ASPECTS[k].label, cur, diff: (cur != null && old != null) ? round1(cur - old) : null };
  }).filter(a => a.cur != null);
  let weakest = null, mostImproved = null;
  aspectStat.forEach(a => {
    if (!weakest || a.cur < weakest.cur) weakest = a;
    if (a.diff != null && a.diff > 0 && (!mostImproved || a.diff > mostImproved.diff)) mostImproved = a;
  });
  const wkStatus = wkAvg != null ? judgeStatus(wkAvg) : '—';

  // ── ③ 身體與恢復 ──
  const wSeries = oldToNew.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wFirst = wSeries.length ? wSeries[0] : null;
  const wLast = wSeries.length ? wSeries[wSeries.length - 1] : null;
  const wDiff = (wFirst != null && wLast != null) ? round1(wLast - wFirst) : null;
  const gap = parseFloat(latest && latest.weightGap);
  const recMean = weeklyMean(weeklyNums(week, 'recoveryScore'));
  const highLoadDays = week.filter(r => parseFloat(r.rpe) >= 8 || parseFloat(r.soreness) >= 4).length;
  const lowSleepDays = week.filter(r => { const s = parseFloat(r.sleepHours); return !isNaN(s) && s < 7; }).length;
  let recTone = 'good', recWord = '恢復良好';
  if (recMean != null) {
    if (recMean < 60) { recTone = 'bad'; recWord = '恢復偏差，注意過度訓練'; }
    else if (recMean < 75) { recTone = 'warn'; recWord = '恢復普通，留意睡眠與負荷'; }
  }

  // ── ④ 心情 ──
  const moodVals = week.map(r => parseFloat(r.moodIndex)).filter(v => !isNaN(v));
  const moodMean = weeklyMean(moodVals);
  const lowMoodDays = moodVals.filter(v => v <= 2).length;
  const suggestSolace = lowMoodDays >= 2 || (latest && parseFloat(latest.moodIndex) <= 2);

  // ── ⑤ 飲食 ──
  const riskDays = week.filter(r => String(r.nutritionRisks || '').trim()).length;
  const snackDays = week.filter(r => /有/.test(String(r.lateNightSnack || ''))).length;
  const lowWaterDays = week.filter(r => /少於 500|500-1000/.test(String(r.waterIntake || ''))).length;
  let foodTip = '飲食習慣穩定，繼續保持均衡。';
  if (snackDays >= 2) foodTip = `本週宵夜 ${snackDays} 天，睡前盡量改成水或無糖豆漿。`;
  else if (lowWaterDays >= 2) foodTip = `本週有 ${lowWaterDays} 天水量偏少，訓練日記得多補水。`;
  else if (riskDays >= 2) foodTip = '有幾天飲食有小提醒，多補蛋白質與蔬菜會更好。';

  // ── 🎯 下週小目標 ──
  const nextGoal = weakest
    ? `下週把「${weakest.label}」再往上推 0.5 分（本週 ${round1(weakest.cur)}）。`
    : '維持每天紀錄，讓成長被看見。';

  /* ---------- HTML ---------- */
  const tone = t => t === 'good' ? 'wk-good' : (t === 'warn' ? 'wk-warn' : 'wk-bad');
  const fmt = (v, suffix) => v == null ? '—' : (round1(v) + (suffix || ''));
  let h = `<h3 class="card-title">📊 ${escapeHtml(name)}｜本週報告</h3><div class="wk-range">${range}</div>`;

  // ① 出席
  h += `<div class="wk-sec"><div class="wk-sec-h">✅ 本週出席</div>
    <div class="wk-stat-row">
      <div class="wk-stat"><span class="wk-num">${trainDays}</span><span class="wk-cap">訓練天數</span></div>
      <div class="wk-stat"><span class="wk-num">${leaveDays}</span><span class="wk-cap">請假天數</span></div>
    </div></div>`;

  // ② KPI
  h += `<div class="wk-sec"><div class="wk-sec-h">📈 KPI 表現</div>
    <div class="review-row"><span class="review-label">本週均分</span><span class="review-value">${fmt(wkAvg, ' / 5')}　${wkStatus}</span></div>`;
  if (avgTrend) h += `<div class="review-row"><span class="review-label">與上週比</span><span class="review-value ${wkAvg >= (pvAvg || 0) ? 'up' : 'down'}">${avgTrend}</span></div>`;
  if (mostImproved) h += `<div class="review-row"><span class="review-label">最進步面向</span><span class="review-value up">💪 ${mostImproved.label}（+${mostImproved.diff}）</span></div>`;
  if (weakest) h += `<div class="review-row"><span class="review-label">最該加強</span><span class="review-value">🎯 ${weakest.label}（${round1(weakest.cur)}）</span></div>`;
  h += `</div>`;

  // ③ 身體與恢復
  h += `<div class="wk-sec"><div class="wk-sec-h">💪 身體與恢復</div>`;
  if (wFirst != null) {
    const dTxt = wDiff > 0 ? `+${wDiff}` : (wDiff < 0 ? `${wDiff}` : '持平');
    h += `<div class="review-row"><span class="review-label">體重變化</span><span class="review-value">${round1(wFirst)} → ${round1(wLast)} kg（${dTxt}）</span></div>`;
  }
  if (!isNaN(gap)) {
    const gTxt = gap > 0 ? `距目標還差 ${round1(gap)} kg` : (gap < 0 ? `已低於目標 ${round1(Math.abs(gap))} kg` : '剛好達標');
    h += `<div class="review-row"><span class="review-label">目標體重</span><span class="review-value">${gTxt}</span></div>`;
  }
  if (recMean != null) h += `<div class="review-row"><span class="review-label">恢復指數</span><span class="review-value ${tone(recTone)}">${Math.round(recMean)} / 100　${recWord}</span></div>`;
  if (highLoadDays || lowSleepDays) h += `<div class="review-row"><span class="review-label">負荷提醒</span><span class="review-value">高負荷 ${highLoadDays} 天 · 睡眠不足 ${lowSleepDays} 天</span></div>`;
  if (recTone === 'bad') h += `<div class="hint-box wk-bad-box">⚠️ 本週恢復偏低，建議安排恢復日、顧好睡眠，必要時與教練討論調整訓練量。</div>`;
  h += `</div>`;

  // ④ 心情
  if (moodVals.length) {
    h += `<div class="wk-sec"><div class="wk-sec-h">🙂 心情曲線</div>
      <div class="review-row"><span class="review-label">本週平均</span><span class="review-value">${fmt(moodMean, ' / 5')}　${moodMean != null ? moodMeta(Math.round(moodMean)).emoji : ''}</span></div>`;
    if (lowMoodDays) h += `<div class="review-row"><span class="review-label">低落天數</span><span class="review-value ${lowMoodDays >= 2 ? 'wk-warn' : ''}">${lowMoodDays} 天</span></div>`;
    if (suggestSolace) h += `<div class="hint-box wk-warn-box">本週心情有點起伏，建議主動和教練、家長或可信任的師長談談。</div>`;
    h += `</div>`;
  }

  // ⑤ 飲食
  h += `<div class="wk-sec"><div class="wk-sec-h">🍱 飲食提醒</div>
    <div class="wk-stat-row">
      <div class="wk-stat"><span class="wk-num">${riskDays}</span><span class="wk-cap">有提醒天數</span></div>
      <div class="wk-stat"><span class="wk-num">${snackDays}</span><span class="wk-cap">宵夜天數</span></div>
      <div class="wk-stat"><span class="wk-num">${lowWaterDays}</span><span class="wk-cap">水量不足</span></div>
    </div>
    <div class="hint-box">${foodTip}</div></div>`;

  // 🎯 下週小目標
  h += `<div class="hint-box good wk-goal">🎯 下週小目標：${nextGoal}</div>`;

  /* ---------- 家長版 LINE 文字 ---------- */
  const L = [];
  L.push(`🥋 ${name}｜本週訓練週報`);
  L.push(`📅 ${range}`);
  L.push('');
  L.push(`✅ 出席：訓練 ${trainDays} 天、請假 ${leaveDays} 天`);
  if (wkAvg != null) L.push(`📊 本週狀態：均分 ${round1(wkAvg)} / 5　${wkStatus.replace(/^[^ ]+ /, '')}${avgTrend ? `（${avgTrend}）` : ''}`);
  if (mostImproved) L.push(`💪 最進步：${mostImproved.label}（+${mostImproved.diff}）`);
  if (weakest) L.push(`🎯 可再加強：${weakest.label}`);
  if (wFirst != null) L.push(`⚖️ 體重：${round1(wFirst)} → ${round1(wLast)} kg（${wDiff > 0 ? '+' : ''}${wDiff}）`);
  if (recMean != null) L.push(`😴 恢復指數：${Math.round(recMean)} / 100（${recWord}）`);
  if (moodMean != null) L.push(`🙂 心情：平均 ${round1(moodMean)} / 5${lowMoodDays >= 2 ? '，本週較有起伏，再多陪伴一下' : ''}`);
  L.push(`🍱 飲食：${foodTip}`);
  L.push(`🎯 下週小目標：${nextGoal}`);
  L.push('');
  L.push('—— 育林國中跆拳道隊');

  return { html: h, lineText: L.join('\n') };
}

function renderLastReviewInto(rec, box) {
  const avg = aspectAvgFromRecord(rec);
  const lowItems = parseLowItems(rec);
  let html = `<h3 class="card-title">📌 上次表現回顧</h3>`;
  html += `<div class="review-row"><span class="review-label">上次日期</span><span class="review-value">${dateSlash(rec.date)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">總分</span><span class="review-value">${scoreMaxText(rec)}</span></div>`;
  html += `<div class="review-row"><span class="review-label">平均</span><span class="review-value">${rec.averageScore} / 5</span></div>`;
  html += `<div class="review-row"><span class="review-label">狀態</span><span class="review-value">${rec.status}</span></div>`;
  html += `<div class="aspect-grid" style="margin-top:10px">`;
  presentAspectKeysFromRecord(rec).forEach(k => html += `<div class="aspect-cell">${KPI_ASPECTS[k].label}<br><span class="num">${avg[k]}</span></div>`);
  html += `</div>`;
  // 雷達圖移至「選手成長卡」做平均 vs 上次疊圖，此處保留六格數字即可，避免重複
  html += `<div class="review-row"><span class="review-label">體重</span><span class="review-value">${rec.weightKg || '--'} kg</span></div>`;
  html += `<div class="review-row"><span class="review-label">BMI</span><span class="review-value">${rec.bmi || '--'}</span></div>`;

  // 當日飲食狀況（給家長看孩子每天吃什麼＋家長版建議）
  html += `<h4 style="margin:12px 0 6px;color:var(--blue)">🍱 當日飲食狀況</h4>`;
  const mealRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${escapeHtml(val || '—').replace(/\n/g, '<br>')}</span></div>`;
  const foodRow = (label, val) => `<div class="review-row"><span class="review-label">${label}</span><span class="review-value">${mealValueHtml(val)}</span></div>`;
  html += foodRow('早餐', rec.breakfast);
  html += foodRow('午餐', rec.lunch);
  html += foodRow('晚餐', rec.dinner);
  if (rec.snacksDrinks) html += foodRow('點心／飲料', rec.snacksDrinks);
  html += mealRow('今日水量', rec.waterIntake);
  html += mealRow('宵夜', rec.lateNightSnack);
  html += mealRow('訓練強度', rec.trainingIntensity);
  html += `<div class="review-row"><span class="review-label">飲食風險</span><span class="review-value">${rec.nutritionRisks || '無明顯風險'}</span></div>`;
  if (rec.nutritionAdviceParent) {
    html += `<div class="hint-box">${escapeHtml(rec.nutritionAdviceParent).replace(/\n/g, '<br>')}</div>`;
  }

  // 自由品勢額外紀錄
  html += freestyleExtraHtml(rec);

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

  // 教練回覆（學生／家長都看得到）
  if (rec.coachReply) html += `<div class="hint-box good">💬 教練回覆：${escapeHtml(rec.coachReply)}</div>`;

  // 回應區依身分分流：家長用獨立「家長留言」欄，不覆蓋學生的自我回應
  const viewRole = (getRole() || {}).role;
  if (rec.recordId) {
    if (viewRole === 'parent') {
      if (rec.studentResponse) html += `<div class="hint-box">💬 孩子的看法：${escapeHtml(rec.studentResponse)}</div>`;
      html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💬 家長留言給教練</h4>`;
      html += `<textarea id="parentNoteBox" class="text-input" rows="2" placeholder="想讓教練知道的狀況，例如：最近睡得比較少、這週鼻子過敏…">${escapeHtml(rec.parentNote || '')}</textarea>`;
      html += `<button type="button" id="btnSendParentNote" class="btn btn-secondary" style="margin-top:8px">📨 送出給教練</button>`;
      html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:6px">這是家長與教練的溝通，不會蓋掉孩子的自我紀錄。</div>`;
    } else {
      html += `<h4 style="margin:14px 0 6px;color:var(--blue)">💬 我對這筆的看法</h4>`;
      html += `<textarea id="studentResponseBox" class="text-input" rows="2" placeholder="例如：核心穩定我覺得不只 2 分，因為今天…">${escapeHtml(rec.studentResponse || '')}</textarea>`;
      html += `<button type="button" id="btnSendStudentResponse" class="btn btn-secondary" style="margin-top:8px">📨 送出我的看法</button>`;
      html += `<div style="color:var(--text-soft);font-size:0.82rem;margin-top:6px">這裡是讓你說明想法，幫助教練了解你，不是用來改分數。</div>`;
      if (rec.parentNote) html += `<div class="hint-box" style="margin-top:10px">👨‍👩‍👧 家長留言：${escapeHtml(rec.parentNote)}</div>`;
    }
  } else {
    html += `<div class="hint-box" style="color:var(--text-soft)">這是較早的紀錄，無法回應（新版紀錄才支援交叉辯論）。</div>`;
  }

  box.innerHTML = html;

  // 綁定：選手送出看法
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
  // 綁定：家長留言給教練
  const pbtn = $id('btnSendParentNote');
  if (pbtn) {
    pbtn.addEventListener('click', async () => {
      const text = $id('parentNoteBox').value.trim();
      pbtn.disabled = true; pbtn.textContent = '送出中...';
      const ok = await updateRecordRemote(rec.recordId, { parentNote: text });
      pbtn.disabled = false; pbtn.textContent = '📨 送出給教練';
      toast(ok ? '✅ 已送出給教練' : '⚠️ 送出失敗，請稍後再試');
    });
  }
}

/* ============================================================
   12.8 選手個人檔案（功能四）＋ 家長週報（功能三）
   ============================================================ */
async function loadProfile() {
  const name = $id('profileName').value;
  const card = $id('profileResultCard');
  const box = $id('profileResult');
  if (!box) return;
  if (!name) { toast('請選擇選手'); return; }
  toast('讀取個人檔案中...');
  const history = await fetchRecentRecords(name, 180);
  const recs = dedupeLatestByDate(history || []); // 新→舊
  renderProfile(name, recs);
  if (card) card.style.display = 'block';
  const journalCard = $id('journalQueryCard');
  if (journalCard) setTimeout(() => journalCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function renderProfile(name, recs) {
  const box = $id('profileResult');
  const parentView = isParentView();
  const coachView = isCoachView();

  let html = `<h3 class="card-title">👤 ${escapeHtml(name)}</h3>`;

  if (!recs.length) {
    html += `<div class="hint-box">尚無紀錄，開始每天填寫就會累積個人檔案。</div>`;
    box.innerHTML = html;
    setupProfileGoals(name, null, coachView, parentView);
    return;
  }

  const latest = recs[0];

  // 身高體重變化
  const weights = recs.map(r => parseFloat(r.weightKg)).filter(v => !isNaN(v));
  const wChange = weights.length >= 2 ? `${weights[weights.length - 1]} → ${weights[0]} kg` : (weights.length ? weights[0] + ' kg' : '--');
  html += `<div class="review-row"><span class="review-label">身高</span><span class="review-value">${latest.heightCm || '--'} cm</span></div>`;
  html += `<div class="review-row"><span class="review-label">體重變化</span><span class="review-value">${wChange}</span></div>`;
  html += `<div class="review-row"><span class="review-label">最近狀態</span><span class="review-value">${parentView ? softenForParent(latest.status || '') : (latest.status || '--')}</span></div>`;

  // 7 天 / 30 天趨勢
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">📈 最近 7 天趨勢</h4><div id="profileTrend7"></div>`;
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">📈 最近 30 天趨勢</h4><div id="profileTrend30"></div>`;

  // 飲食狀況
  const riskDays = recs.filter(r => r.nutritionRisks && r.nutritionRisks !== '無明顯風險').length;
  const lowWaterDays = recs.filter(r => r.waterIntake === '少於 500ml' || r.waterIntake === '500-1000ml').length;
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🍱 飲食狀況（近 ${recs.length} 筆）</h4>`;
  html += `<div class="review-row"><span class="review-label">有飲食風險的天數</span><span class="review-value">${riskDays}</span></div>`;
  html += `<div class="review-row"><span class="review-label">水量不足的天數</span><span class="review-value">${lowWaterDays}</span></div>`;

  // 紅燈紀錄（家長看溫和版、隱藏教練內部備註）
  const reds = recs.filter(r => r.status && r.status.indexOf('紅') !== -1);
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🔴 ${parentView ? '需要關心的日子' : '紅燈紀錄'}（${reds.length}）</h4>`;
  if (reds.length) {
    reds.slice(0, 10).forEach(r => {
      html += `<div class="redcare-card"><div class="redcare-head"><b>${dateSlash(r.date)}</b><span class="tag tag-red">平均 ${r.averageScore}</span></div>`;
      if (r.redLightReason) html += `<div class="redcare-low">原因：${parentView ? softenForParent(r.redLightReason) : escapeHtml(r.redLightReason)}</div>`;
      if (!parentView && r.redLightHandling) html += `<div class="redcare-suggest">處理：${escapeHtml(r.redLightHandling)}</div>`;
      if (!parentView && r.redLightNote) html += `<div class="hint-box">📝 ${escapeHtml(r.redLightNote)}</div>`;
      html += `</div>`;
    });
  } else {
    html += `<div class="hint-box good">近期沒有紅燈，狀況穩定 👍</div>`;
  }

  // 目標 / 教練備註
  html += `<h4 style="margin:14px 0 6px;color:var(--blue)">🎯 目標與備註</h4><div id="profileGoals"></div>`;

  // 家長週報
  html += `<div class="btn-group"><button type="button" id="btnParentWeekly" class="btn btn-line-share">📤 產生家長週報</button></div>`;
  html += `<div id="parentWeeklyBox"></div>`;

  box.innerHTML = html;

  // 趨勢圖
  const t7 = $id('profileTrend7'); if (t7) renderTrendSection(t7, recs, 7, { picker: false });
  const t30 = $id('profileTrend30'); if (t30) renderTrendSection(t30, recs, 30, { picker: false });

  // 目標區（教練可編輯）
  appGet(appKeyProfile(name), data => setupProfileGoals(name, data, coachView, parentView));

  // 家長週報
  const wbtn = $id('btnParentWeekly');
  if (wbtn) wbtn.addEventListener('click', () => {
    const text = generateParentWeekly(name, recs);
    const wbox = $id('parentWeeklyBox');
    wbox.innerHTML = `<pre class="line-text">${escapeHtml(text)}</pre>
      <div class="btn-group">
        <button type="button" class="btn btn-line-share" id="btnWeeklyShare">💬 分享到 LINE</button>
        <button type="button" class="btn btn-secondary" id="btnWeeklyCopy">📋 複製</button>
      </div>`;
    $id('btnWeeklyShare').addEventListener('click', () => shareToLine(text));
    $id('btnWeeklyCopy').addEventListener('click', () => copyText(text));
  });
}

// 目標 / 教練備註：教練可編輯並儲存；學生唯讀；家長唯讀且不顯示教練備註
function setupProfileGoals(name, data, coachView, parentView) {
  const box = $id('profileGoals');
  if (!box) return;
  data = data || {};
  if (coachView) {
    box.innerHTML =
      `<label class="field-label">比賽目標</label><input type="text" id="profCompGoal" class="text-input" value="${escapeHtml(data.competitionGoal || '')}" placeholder="例如：全國賽前 8 強" />
       <label class="field-label">階段訓練目標</label><input type="text" id="profStageGoal" class="text-input" value="${escapeHtml(data.stageGoal || '')}" placeholder="例如：這個月把旋踢距離練穩" />
       <label class="field-label">教練備註（內部，家長看不到）</label><textarea id="profCoachNote" class="text-input" rows="2" placeholder="只有教練看得到">${escapeHtml(data.coachNote || '')}</textarea>
       <button type="button" id="btnSaveProfile" class="btn btn-primary" style="margin-top:8px">💾 儲存目標與備註</button>`;
    $id('btnSaveProfile').addEventListener('click', async () => {
      const merged = {
        competitionGoal: $id('profCompGoal').value.trim(),
        stageGoal: $id('profStageGoal').value.trim(),
        coachNote: $id('profCoachNote').value.trim()
      };
      const b = $id('btnSaveProfile');
      b.disabled = true; b.textContent = '儲存中...';
      await appSet(appKeyProfile(name), merged);
      b.disabled = false; b.textContent = '💾 儲存目標與備註';
      toast('✅ 已儲存');
    });
  } else {
    let html = '';
    html += `<div class="review-row"><span class="review-label">比賽目標</span><span class="review-value">${escapeHtml(data.competitionGoal || '—')}</span></div>`;
    html += `<div class="review-row"><span class="review-label">階段訓練目標</span><span class="review-value">${escapeHtml(data.stageGoal || '—')}</span></div>`;
    // 家長看不到教練內部備註；學生可看
    if (!parentView && data.coachNote) html += `<div class="hint-box">📝 教練備註：${escapeHtml(data.coachNote)}</div>`;
    box.innerHTML = html;
  }
}

// 產生家長週報（正向、具體、不只報分數）
function generateParentWeekly(name, recsNewToOld) {
  const recs = recsNewToOld.slice(0, 7).reverse(); // 舊→新
  const n = recs.length;
  const avgOf = arr => arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const totals = recs.map(r => parseFloat(r.totalScore)).filter(v => !isNaN(v));
  const firstT = totals[0], lastT = totals[totals.length - 1];
  const trend = (totals.length >= 2) ? (lastT > firstT ? '進步' : (lastT < firstT ? '持平調整中' : '穩定')) : '剛開始累積';

  // 本週狀態
  const greens = recs.filter(r => r.status && r.status.indexOf('綠') !== -1).length;
  const statusLine = greens >= n - greens ? '整體狀態穩定、投入度高' : '狀態起伏中，仍持續努力';

  // 亮點：六面向最高的一項
  const aspAvg = {};
  ASPECT_ORDER.forEach(k => aspAvg[k] = avgOf(recs.map(r => parseFloat(r[ASPECT_AVG_FIELD[k]])).filter(v => !isNaN(v))));
  const best = ASPECT_ORDER.slice().sort((a, b) => aspAvg[b] - aspAvg[a])[0];
  const worst = ASPECT_ORDER.slice().sort((a, b) => aspAvg[a] - aspAvg[b])[0];

  // 出勤/堅持
  const days = n;

  return `🥋 育林國中技擊隊｜${name} 本週回饋

親愛的家長您好，這是孩子本週（共 ${days} 天紀錄）的訓練摘要：

【本週狀態】
${statusLine}，整體表現${trend}。

【本週亮點】
孩子在「${KPI_ASPECTS[best].label}」表現最亮眼，這份努力值得肯定 👍

【可以再加強】
「${KPI_ASPECTS[worst].label}」還有成長空間，教練會在訓練中陪孩子一起調整，不需要擔心。

【教練的話】
我們看重的不是單次分數，而是孩子每天願不願意面對問題、持續進步。孩子這週有持續記錄、面對自己的狀態，這就是最重要的態度。

【給家長的小提醒】
回家可以多給孩子鼓勵，幫忙留意睡眠、三餐與水分，這些都會直接影響訓練恢復。謝謝您的支持，我們一起陪孩子變得更強 💪`;
}

function monthStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function journalSafePart(s) {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
}

function journalInRange(dateStr, fromMonth, toMonth) {
  const m = normDate(dateStr).slice(0, 7);
  if (!m) return false;
  if (fromMonth && m < fromMonth) return false;
  if (toMonth && m > toMonth) return false;
  return true;
}

function journalRangeLabel(fromMonth, toMonth) {
  if (!fromMonth && !toMonth) return '全部資料';
  if (fromMonth && toMonth) return `${fromMonth.replace('-', ' 年 ')} 月 ～ ${toMonth.replace('-', ' 年 ')} 月`;
  if (fromMonth) return `${fromMonth.replace('-', ' 年 ')} 月起`;
  return `～ ${toMonth.replace('-', ' 年 ')} 月`;
}

function journalFileNo(scope, fromMonth, toMonth) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `JR-${journalSafePart(scope || 'single')}-${journalSafePart(fromMonth || 'ALL')}-${journalSafePart(toMonth || 'ALL')}-${stamp}`;
}

function journalCoachLabel() {
  const el = $id('journalCoachName');
  const raw = el ? String(el.value || '').trim() : '';
  return raw || '教練簽核';
}

function refreshJournalFileNo() {
  const fileNoEl = $id('journalFileNo');
  if (!fileNoEl) return '';
  const scope = ($id('profileName') && $id('profileName').value) || 'journal';
  const fromMonth = ($id('journalMonthFrom') && $id('journalMonthFrom').value.trim()) || '';
  const toMonth = ($id('journalMonthTo') && $id('journalMonthTo').value.trim()) || '';
  const fileNo = journalFileNo(scope, fromMonth, toMonth);
  fileNoEl.value = fileNo;
  return fileNo;
}

function journalStatusTone(rec) {
  const s = String(rec.readinessStatusLight || rec.status || '');
  if (s.indexOf('紅') !== -1) return 'red';
  if (s.indexOf('橘') !== -1) return 'orange';
  if (s.indexOf('黃') !== -1) return 'yellow';
  return 'green';
}

function journalText(v, fallback) {
  const text = String(v == null ? '' : v).trim();
  return text ? escapeHtml(text).replace(/\n/g, '<br>') : (fallback || '—');
}

/* 日誌趨勢圖：純 SVG（屬性內聯，html2canvas 友善，不會空白）。
   series：[{ name, color, vals:[數值|null] }]；vals 與 xLabels 對齊。 */
function jrShortDate(d) {
  const s = normDate(d);
  const m = s.slice(5, 7).replace(/^0/, ''), day = s.slice(8, 10).replace(/^0/, '');
  return (m && day) ? `${m}/${day}` : '';
}
function jrTrendChart(title, subtitle, series, yMin, yMax, xLabels) {
  const W = 700, H = 200, PL = 36, PR = 12, PT = 14, PB = 28;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const n = series[0] ? series[0].vals.length : 0;
  const span = (yMax - yMin) || 1;
  const xAt = i => PL + (n <= 1 ? innerW / 2 : innerW * i / (n - 1));
  const yAt = v => PT + innerH * (1 - (v - yMin) / span);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">`;
  [yMin, (yMin + yMax) / 2, yMax].forEach(v => {
    const y = yAt(v).toFixed(1);
    svg += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#e1e7f0" stroke-width="1"/>`;
    svg += `<text x="${PL - 6}" y="${(parseFloat(y) + 3).toFixed(1)}" font-size="10" fill="#8893a3" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
  });
  series.forEach(s => {
    let d = '', pen = false;
    s.vals.forEach((v, i) => {
      if (v == null || isNaN(v)) { pen = false; return; }
      d += (pen ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1) + ' ';
      pen = true;
    });
    if (d) svg += `<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (n <= 24) s.vals.forEach((v, i) => { if (v != null && !isNaN(v)) svg += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="2.6" fill="${s.color}"/>`; });
  });
  const idxs = Array.from(new Set(n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]));
  idxs.forEach(i => {
    svg += `<text x="${xAt(i).toFixed(1)}" y="${H - 9}" font-size="10" fill="#8893a3" text-anchor="middle">${escapeHtml(xLabels[i] || '')}</text>`;
  });
  svg += `</svg>`;
  const legend = series.map(s => `<span class="jr-chart-key"><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('');
  return `<div class="jr-chart"><div class="jr-chart-h">${escapeHtml(title)}${subtitle ? ` <small>${escapeHtml(subtitle)}</small>` : ''}</div><div class="jr-chart-legend">${legend}</div>${svg}</div>`;
}
// 本期趨勢總覽頁（封面後一頁）；資料 < 2 筆時回空字串（不插頁）
function jrBuildTrendPage(name, ordered, fileNo, rangeLabel) {
  if (!ordered || ordered.length < 2) return '';
  const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  const xLabels = ordered.map(r => jrShortDate(r.date));
  const readiness = ordered.map(r => num(r.finalReadinessScore));
  const rpe = ordered.map(r => num(r.rpe));
  const pain = ordered.map(r => num(r.painScore));
  const weight = ordered.map(r => num(r.weightKg));
  const target = ordered.map(r => num(r.targetWeightKg));
  const has = arr => arr.filter(v => v != null).length >= 2;

  let charts = '';
  if (has(readiness)) {
    charts += jrTrendChart('訓練準備度走勢', '0–100，越高代表今天越適合高品質訓練', [{ name: '準備度', color: '#2e6da4', vals: readiness }], 0, 100, xLabels);
  }
  if (has(rpe) || has(pain)) {
    const s = [];
    if (has(rpe)) s.push({ name: 'RPE 主觀強度', color: '#d97316', vals: rpe });
    if (has(pain)) s.push({ name: '疼痛分數', color: '#c0392b', vals: pain });
    charts += jrTrendChart('疲勞與疼痛走勢', '0–10，持續偏高代表需要降量或關心', s, 0, 10, xLabels);
  }
  if (has(weight)) {
    const all = weight.concat(target).filter(v => v != null);
    let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (lo === hi) { lo -= 1; hi += 1; } else { const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad; }
    const s = [{ name: '今日體重', color: '#1f9d55', vals: weight }];
    if (has(target)) s.push({ name: '目標體重', color: '#8893a3', vals: target });
    charts += jrTrendChart('體重 vs 目標走勢', 'kg，控重選手追蹤用', s, Math.floor(lo), Math.ceil(hi), xLabels);
  }
  if (!charts) return '';

  // 文字摘要
  const firstR = readiness.filter(v => v != null)[0];
  const lastR = readiness.filter(v => v != null).slice(-1)[0];
  const rpeVals = rpe.filter(v => v != null);
  const painVals = pain.filter(v => v != null);
  const bits = [`本期訓練紀錄 ${ordered.length} 天`];
  if (firstR != null && lastR != null) {
    const d = Math.round(lastR - firstR);
    const dir = d >= 5 ? `↑ 進步 ${d} 分` : d <= -5 ? `↓ 下滑 ${Math.abs(d)} 分` : '→ 大致持平';
    bits.push(`準備度 ${Math.round(firstR)} → ${Math.round(lastR)}（${dir}）`);
  }
  if (rpeVals.length) bits.push(`RPE 平均 ${round1(rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length)}`);
  if (painVals.length) bits.push(`疼痛最高 ${Math.max.apply(null, painVals)} 分`);

  let html = `<section class="mr-page">`;
  html += `<div class="mr-page-head"><div class="mr-page-title">本期趨勢總覽</div><div class="mr-page-meta">${escapeHtml(name)}｜${escapeHtml(rangeLabel)}</div></div>`;
  html += charts;
  html += `<div class="mr-panel blue jr-trend-sum"><div class="mr-panel-h">趨勢摘要</div><div class="jr-longtext">${bits.map(escapeHtml).join('　|　')}</div></div>`;
  html += `<div class="mr-page-foot">本期趨勢總覽｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;
  return html;
}

function buildPersonalJournalReport(name, recs, fromMonth, toMonth) {
  const ordered = dedupeLatestByDate(recs || []).slice().reverse(); // 舊→新
  const total = ordered.length;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const totalScoreVals = ordered.map(r => parseFloat(r.totalScore)).filter(v => !isNaN(v));
  const avgScore = totalScoreVals.length ? round1(totalScoreVals.reduce((a, b) => a + b, 0) / totalScoreVals.length) : null;
  const readinessVals = ordered.map(r => parseFloat(r.finalReadinessScore)).filter(v => !isNaN(v));
  const avgReadiness = readinessVals.length ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length) : null;
  const greenCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('綠') !== -1).length;
  const yellowCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('黃') !== -1).length;
  const orangeCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('橘') !== -1).length;
  const redCount = ordered.filter(r => String(r.readinessStatusLight || r.status || '').indexOf('紅') !== -1).length;
  const bodyRiskDays = ordered.filter(r => String(r.bodyStatus || '') === '疲勞' || String(r.bodyStatus || '') === '不舒服' || String(r.bodyStatus || '') === '受傷中').length;
  const lowSleepDays = ordered.filter(r => {
    const s = parseFloat(r.sleepHours);
    return !isNaN(s) && s < 7;
  }).length;
  const rangeLabel = journalRangeLabel(fromMonth, toMonth);
  const fileNo = journalFileNo(name, fromMonth, toMonth);
  const coachName = journalCoachLabel();

  function statCard(value, label, sub, tone) {
    return `<div class="mr-stat ${tone || ''}"><div class="mr-stat-val">${escapeHtml(String(value))}</div><div class="mr-stat-label">${escapeHtml(label)}</div>${sub ? `<div class="mr-stat-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
  }

  const summaryLines = [];
  summaryLines.push(`訓練紀錄 ${total} 天`);
  if (first && last) summaryLines.push(`區間 ${dateSlash(first.date)} ～ ${dateSlash(last.date)}`);
  if (avgScore != null) summaryLines.push(`平均總分 ${avgScore}`);
  if (avgReadiness != null) summaryLines.push(`平均準備度 ${avgReadiness}`);
  if (bodyRiskDays) summaryLines.push(`身體提醒 ${bodyRiskDays} 天`);
  if (lowSleepDays) summaryLines.push(`睡眠不足 ${lowSleepDays} 天`);

  const summaryCoach = ordered.length ? buildCoachFeedback(
    ordered[ordered.length - 1],
    ordered.length > 1 ? ordered[ordered.length - 2] : null,
    ordered.slice(0, Math.max(ordered.length - 1, 0)),
    buildAffirmations(ordered[ordered.length - 1], ordered.length > 1 ? ordered[ordered.length - 2] : null, ordered.slice(0, Math.max(ordered.length - 1, 0)))
  ).versions.coach : null;

  let html = `<div class="mr-report jr-report">`;
  html += `<section class="mr-page">`;
  html += `<div class="mr-cover">`;
  html += `<div class="mr-cover-title">個人訓練日誌</div>`;
  html += `<div class="mr-cover-sub">${escapeHtml(name)}</div>`;
  html += `<div class="mr-cover-month">${escapeHtml(rangeLabel)}</div>`;
  html += `<div class="mr-cover-use">供訓練管理與正式備查使用</div>`;
  html += `<div class="jr-file-no">文件編號：${escapeHtml(fileNo)}</div>`;
  html += `</div>`;
  html += `<div class="mr-grid mr-grid-4">`;
  html += statCard(total, '紀錄天數', rangeLabel);
  html += statCard(avgScore != null ? avgScore : '—', '平均總分', avgScore != null ? '/ 150' : '');
  html += statCard(avgReadiness != null ? avgReadiness : '—', '平均準備度', avgReadiness != null ? '/ 100' : '');
  html += statCard(`${greenCount}/${yellowCount}/${orangeCount}/${redCount}`, '綠黃橘紅', '綠 / 黃 / 橘 / 紅');
  html += `</div>`;
  html += `<div class="mr-two-col">`;
  html += `<div class="mr-panel blue"><div class="mr-panel-h">文件摘要</div><ul class="jr-mini-list">` +
    summaryLines.map(t => `<li>${escapeHtml(t)}</li>`).join('') +
    `</ul></div>`;
  html += `<div class="mr-panel green"><div class="mr-panel-h">AI 教練摘要</div>` +
    (summaryCoach ? `<div class="jr-longtext">${escapeHtml(summaryCoach.affirm).replace(/\n/g, '<br>')}</div>
      <div class="jr-summary-note">觀察：${escapeHtml(summaryCoach.watch).replace(/\n/g, '<br>')}</div>
      <div class="jr-summary-note">任務：${escapeHtml(summaryCoach.oneThing).replace(/\n/g, '<br>')}</div>` : '<div class="mr-empty sm">尚無可用資料。</div>') +
    `</div>`;
  html += `</div>`;
  html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
  html += `<div class="mr-privacy">日誌內容依訓練日期彙整，預設以最新資料為準。若同一天有多筆紀錄，會保留最新一筆。</div>`;
  html += `<div class="mr-page-foot">育林國中技擊隊個人訓練日誌｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;

  // 封面後插入：本期趨勢總覽頁（準備度 / RPE+疼痛 / 體重）
  html += jrBuildTrendPage(name, ordered, fileNo, rangeLabel);

  ordered.forEach((rec, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const before = ordered.slice(0, idx);
    const current = Object.assign({}, rec);
    applyReadiness(current, before);
    const affirm = buildAffirmations(current, prev, before);
    const fb = buildCoachFeedback(current, prev, before, affirm);
    const coach = fb.versions.coach;
    const scores = [];
    if (String(current.trainingTopic || '').trim()) scores.push(current.trainingTopic);
    if (String(current.lowItems || '').trim()) scores.push(`弱項：${current.lowItems}`);
    if (String(current.improveTargets || '').trim()) scores.push(`改善：${current.improveTargets}`);
    const bodyBits = [];
    if (String(current.bodyStatus || '').trim()) bodyBits.push(current.bodyStatus);
    if (String(current.sleepHours || '').trim()) bodyBits.push(`睡眠 ${current.sleepHours} 小時`);
    if (String(current.sleepQuality || '').trim()) bodyBits.push(`睡眠品質 ${current.sleepQuality}`);
    if (String(current.soreness || '').trim()) bodyBits.push(`痠痛 ${current.soreness}/5`);
    if (String(current.rpe || '').trim()) bodyBits.push(`RPE ${current.rpe}/10`);
    if (String(current.injuryArea || '').trim()) bodyBits.push(`不適部位 ${current.injuryArea}`);
    if (String(current.painScore || '').trim()) bodyBits.push(`疼痛 ${current.painScore}/10`);
    if (String(current.urineStatus || '').trim()) bodyBits.push(`尿液 ${current.urineStatus}`);

    html += `<section class="mr-page">`;
    html += `<div class="mr-page-head"><div class="mr-page-title">${escapeHtml(dateSlash(current.date))}｜${escapeHtml(name)}</div><div class="mr-page-meta">${escapeHtml(current.group || '訓練紀錄')}｜第 ${idx + 1} / ${total} 筆</div></div>`;
    html += `<div class="mr-grid mr-grid-4">`;
    html += statCard(current.group || '—', '項目', current.trainingTopic || '訓練主題');
    html += statCard(current.averageScore != null && current.averageScore !== '' ? current.averageScore : '—', '平均 / 總分', current.totalScore != null && current.totalScore !== '' ? `總分 ${current.totalScore}` : '');
    html += statCard(current.readinessStatusLight || current.status || '—', '狀態', current.finalReadinessScore != null && current.finalReadinessScore !== '' ? `準備度 ${current.finalReadinessScore}` : '');
    html += statCard(current.bodyStatus || '—', '身體狀態', bodyBits.slice(1, 3).join(' · '));
    html += `</div>`;

    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel blue"><div class="mr-panel-h">訓練課表</div>` +
      `<div class="jr-longtext">${journalText(current.trainingTopic, '未填')}</div>` +
      `<ul class="jr-mini-list">` +
      `<li>訓練強度：${escapeHtml(current.trainingIntensity || '—')}</li>` +
      `<li>訓練組別：${escapeHtml(current.group || '—')}</li>` +
      `<li>課表重點：${scores.length ? scores.map(s => escapeHtml(s)).join('；') : '—'}</li>` +
      `</ul></div>`;
    html += `<div class="mr-panel yellow"><div class="mr-panel-h">訓練心得</div>` +
      `<div class="jr-longtext">${journalText(current.reflection, '未填')}</div>` +
      `<div class="jr-summary-note">明日目標：${journalText(current.tomorrowGoal, '—')}</div>` +
      `${String(current.gratitude || '').trim() ? `<div class="jr-summary-note">感謝：${journalText(current.gratitude)}</div>` : ''}` +
      `</div>`;
    html += `</div>`;

    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel red"><div class="mr-panel-h">身體狀態</div>` +
      `<ul class="jr-mini-list">` +
      `<li>${escapeHtml(bodyBits.length ? bodyBits.join('；') : '—')}</li>` +
      `<li>飲食風險：${escapeHtml(current.nutritionRisks || '無')}</li>` +
      `<li>恢復提醒：${escapeHtml(current.recoveryState || '—')}</li>` +
      `</ul></div>`;
    html += `<div class="mr-panel green"><div class="mr-panel-h">教練回饋（AI 草稿）</div>` +
      `<div class="jr-longtext">【今日狀態】${escapeHtml(coach.affirm).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【觀察】${escapeHtml(coach.watch).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【任務】${escapeHtml(coach.oneThing).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【提醒】${escapeHtml(coach.quote).replace(/\n/g, '<br>')}</div>` +
      `</div>`;
    html += `</div>`;
    html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
    html += `<div class="mr-privacy">本頁由系統自動整理，教練可在送出紀錄後直接核對與調整後再正式輸出。</div>`;
    html += `<div class="mr-page-foot">第 ${idx + 1} / ${total} 頁｜${escapeHtml(fileNo)}</div>`;
    html += `</section>`;
  });

  html += `</div>`;

  const fileBase = `育林國中技擊隊_個人訓練日誌_${journalSafePart(name)}_${journalSafePart(fromMonth || 'all')}_${journalSafePart(toMonth || 'all')}_${journalSafePart(fileNo)}`;
  return { html, fileBase, fileNo, coachName };
}

let _currentJournalReport = null;

function clearPersonalJournalPreview(showHint) {
  _currentJournalReport = null;
  const previewCard = $id('journalPreviewCard');
  const preview = $id('journalPreview');
  const downloadBtn = $id('btnDownloadJournalPdf');
  const printBtn = $id('btnPrintJournal');
  if (downloadBtn) downloadBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;
  if (preview) preview.innerHTML = showHint ? '<div class="hint-box">請先選擇選手與月份區間，然後產生日誌預覽。</div>' : '';
  if (previewCard) previewCard.style.display = showHint ? 'block' : 'none';
}

function renderPersonalJournalPreview(report) {
  const previewCard = $id('journalPreviewCard');
  const preview = $id('journalPreview');
  const downloadBtn = $id('btnDownloadJournalPdf');
  const printBtn = $id('btnPrintJournal');
  if (!previewCard || !preview) return;
  if (!report) {
    preview.innerHTML = '<div class="hint-box">請先選擇選手與月份區間，然後產生日誌預覽。</div>';
    previewCard.style.display = 'block';
    if (downloadBtn) downloadBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;
    return;
  }
  preview.innerHTML = report.html;
  previewCard.style.display = 'block';
  if (downloadBtn) downloadBtn.disabled = false;
  if (printBtn) printBtn.disabled = false;
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildBatchJournalReport(names, grouped, fromMonth, toMonth) {
  const scope = `batch-${names.length}`;
  const fileNo = journalFileNo(scope, fromMonth, toMonth);
  const coachName = journalCoachLabel();
  const rangeLabel = journalRangeLabel(fromMonth, toMonth);
  let html = `<div class="mr-report jr-report">`;
  html += `<section class="mr-page">`;
  html += `<div class="mr-cover">`;
  html += `<div class="mr-cover-title">全隊個人訓練日誌</div>`;
  html += `<div class="mr-cover-sub">${escapeHtml(names.join('、'))}</div>`;
  html += `<div class="mr-cover-month">${escapeHtml(rangeLabel)}</div>`;
  html += `<div class="mr-cover-use">批次匯出・供正式備查使用</div>`;
  html += `<div class="jr-file-no">文件編號：${escapeHtml(fileNo)}</div>`;
  html += `</div>`;
  html += `<div class="mr-grid mr-grid-3">`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${names.length}</div><div class="mr-stat-label">匯出人數</div><div class="mr-stat-sub">${escapeHtml(rangeLabel)}</div></div>`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${Object.keys(grouped).length}</div><div class="mr-stat-label">有資料人數</div><div class="mr-stat-sub">至少 1 筆紀錄</div></div>`;
  html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(coachName)}</div><div class="mr-stat-label">教練簽名</div><div class="mr-stat-sub">文件編號：${escapeHtml(fileNo)}</div></div>`;
  html += `</div>`;
  html += `<div class="mr-panel blue"><div class="mr-panel-h">批次摘要</div><ul class="jr-mini-list">` +
    `<li>已依月份區間彙整每位選手資料。</li>` +
    `<li>每位選手保留同一天最新一筆紀錄。</li>` +
    `<li>下方逐位輸出，便於上傳與歸檔。</li>` +
    `</ul></div>`;
  html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNo)}</div></div></div>`;
  html += `<div class="mr-page-foot">全隊批次個人訓練日誌｜${escapeHtml(fileNo)}</div>`;
  html += `</section>`;

  names.forEach((name, idx) => {
    const recs = grouped[name] || [];
    const ordered = dedupeLatestByDate(recs || []).slice().reverse();
    if (!ordered.length) return;
    const last = ordered[ordered.length - 1];
    const before = ordered.slice(0, Math.max(ordered.length - 1, 0));
    const prev = ordered.length > 1 ? ordered[ordered.length - 2] : null;
    const current = Object.assign({}, last);
    applyReadiness(current, before);
    const aff = buildAffirmations(current, prev, before);
    const fb = buildCoachFeedback(current, prev, before, aff);
    const coach = fb.versions.coach;
    const fileNoLine = `${fileNo}-${String(idx + 1).padStart(2, '0')}`;
    html += `<section class="mr-page">`;
    html += `<div class="mr-page-head"><div class="mr-page-title">${escapeHtml(name)}｜個人訓練日誌</div><div class="mr-page-meta">文件編號 ${escapeHtml(fileNoLine)}｜${ordered.length} 筆</div></div>`;
    html += `<div class="mr-grid mr-grid-4">`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${ordered.length}</div><div class="mr-stat-label">紀錄天數</div><div class="mr-stat-sub">${escapeHtml(rangeLabel)}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.finalReadinessScore != null ? String(current.finalReadinessScore) : '—')}</div><div class="mr-stat-label">最新準備度</div><div class="mr-stat-sub">${escapeHtml(current.readinessStatusLight || current.status || '—')}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.bodyStatus || '—')}</div><div class="mr-stat-label">最新身體狀態</div><div class="mr-stat-sub">${escapeHtml(current.trainingTopic || '—')}</div></div>`;
    html += `<div class="mr-stat"><div class="mr-stat-val">${escapeHtml(current.averageScore != null && current.averageScore !== '' ? String(current.averageScore) : '—')}</div><div class="mr-stat-label">最新平均</div><div class="mr-stat-sub">${escapeHtml(current.totalScore != null && current.totalScore !== '' ? String(current.totalScore) : '—')}</div></div>`;
    html += `</div>`;
    html += `<div class="mr-two-col">`;
    html += `<div class="mr-panel blue"><div class="mr-panel-h">訓練紀錄</div><ul class="jr-mini-list">` +
      ordered.slice(0, 8).map(r => `<li>${escapeHtml(dateSlash(r.date))}｜${escapeHtml(r.trainingTopic || '未填')}｜${escapeHtml(r.status || r.readinessStatusLight || '—')}${r.finalReadinessScore != null && r.finalReadinessScore !== '' ? `｜${escapeHtml(String(r.finalReadinessScore))}` : ''}</li>`).join('') +
      `</ul></div>`;
    html += `<div class="mr-panel green"><div class="mr-panel-h">AI 教練摘要</div>` +
      `<div class="jr-longtext">【今日狀態】${escapeHtml(coach.affirm).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【觀察】${escapeHtml(coach.watch).replace(/\n/g, '<br>')}</div>` +
      `<div class="jr-summary-note">【任務】${escapeHtml(coach.oneThing).replace(/\n/g, '<br>')}</div>` +
      `</div>`;
    html += `</div>`;
    html += `<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">簽名：${escapeHtml(coachName)}</div></div><div class="mr-sign-box"><div class="mr-sign-label">文件編號</div><div class="mr-sign-line"></div><div class="mr-sign-date">${escapeHtml(fileNoLine)}</div></div></div>`;
    html += `<div class="mr-privacy">批次匯出頁面只顯示該選手資料。</div>`;
    html += `<div class="mr-page-foot">第 ${idx + 1} / ${names.length} 位｜${escapeHtml(fileNoLine)}</div>`;
    html += `</section>`;
  });

  html += `</div>`;
  const fileBase = `育林國中技擊隊_全隊個人訓練日誌_${journalSafePart(fromMonth || 'all')}_${journalSafePart(toMonth || 'all')}_${journalSafePart(fileNo)}`;
  return { html, fileBase, fileNo, coachName };
}

async function loadPersonalJournal() {
  const name = $id('profileName').value;
  const fromMonth = $id('journalMonthFrom').value.trim();
  const toMonth = $id('journalMonthTo').value.trim();
  const card = $id('journalPreviewCard');
  if (!name) { toast('請選擇選手'); return; }
  if (fromMonth && toMonth && fromMonth > toMonth) { toast('開始月份不能晚於結束月份'); return; }
  toast('讀取個人訓練日誌中...');
  const all = await fetchRecentRecords(name, 9999);
  const filtered = (all || []).filter(r => journalInRange(r.date, fromMonth, toMonth));
  const recs = dedupeLatestByDate(filtered || []).slice().reverse(); // 舊→新
  if (!recs.length) {
    clearPersonalJournalPreview(true);
    if (card) card.style.display = 'block';
    toast('這個區間沒有資料');
    return;
  }
  _currentJournalReport = buildPersonalJournalReport(name, recs, fromMonth, toMonth);
  const fileNoEl = $id('journalFileNo');
  if (fileNoEl) fileNoEl.value = _currentJournalReport.fileNo || journalFileNo(name, fromMonth, toMonth);
  renderPersonalJournalPreview(_currentJournalReport);
  if (card) card.style.display = 'block';
  toast('✅ 日誌已產生');
}

async function loadPersonalJournalBatch() {
  if (!isCoachView()) { toast('全隊批次匯出僅供教練使用'); return; }
  const fromMonth = $id('journalMonthFrom').value.trim();
  const toMonth = $id('journalMonthTo').value.trim();
  if (fromMonth && toMonth && fromMonth > toMonth) { toast('開始月份不能晚於結束月份'); return; }
  const btn = $id('btnLoadJournalBatch');
  if (btn) { btn.dataset.txt = btn.dataset.txt || btn.textContent; btn.disabled = true; btn.textContent = '讀取中...'; }
  toast('讀取全隊個人訓練日誌中...');
  try {
    // 一次撈全部紀錄再本機分組，避免每位選手各打一次後端造成卡住
    const all = await fetchAllRecords();
    const grouped = {};
    (all || []).forEach(r => {
      const nm = String(r && r.name || '').trim();
      if (!nm || !journalInRange(r.date, fromMonth, toMonth)) return;
      (grouped[nm] = grouped[nm] || []).push(r);
    });
    const roster = getPlayers();
    const names = roster.filter(n => grouped[n] && grouped[n].length);
    Object.keys(grouped).forEach(n => { if (names.indexOf(n) === -1) names.push(n); });
    if (!names.length) { clearPersonalJournalPreview(true); toast('這個區間沒有可匯出的全隊資料'); return; }
    names.forEach(n => { grouped[n] = dedupeLatestByDate(grouped[n]); });
    _currentJournalReport = buildBatchJournalReport(names, grouped, fromMonth, toMonth);
    const fileNoEl = $id('journalFileNo');
    if (fileNoEl) fileNoEl.value = _currentJournalReport.fileNo || journalFileNo('batch', fromMonth, toMonth);
    renderPersonalJournalPreview(_currentJournalReport);
    toast(`✅ 全隊批次日誌已產生（${names.length} 人）`);
  } catch (e) {
    console.error(e);
    toast('全隊批次匯出失敗，請重試或縮小月份範圍');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.txt || '🗂️ 全隊批次匯出'; }
  }
}

function journalPdfOptions(fileBase, scale) {
  return {
    margin: 0,
    filename: fileBase + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: scale || 2, useCORS: true, scrollY: 0, windowWidth: 1200, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };
}
// 整份一次渲染時，依頁數壓低 scale，避免超大 canvas 超過瀏覽器上限而全白
function safeOneShotScale(pageCount) {
  const n = pageCount || 1;
  if (n <= 8) return 2;
  if (n <= 16) return 1.4;
  if (n <= 28) return 1;
  return 0.7;
}

/* 逐頁產生 PDF：每個 .mr-page 各自 render 成獨立小 canvas，再貼進 jsPDF。
   避免「整份報表一次畫成一張超大 canvas」超過瀏覽器 canvas 上限而全白
   （多頁日誌最常見的空白主因）。成功回 true，無法執行（缺元件/無分頁）回 false。 */
async function renderReportPdfByPage(node, fileBase) {
  const h2c = window.html2canvas;
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (typeof h2c !== 'function' || typeof jsPDFCtor !== 'function') return false;
  const pages = Array.from(node.querySelectorAll('.mr-page'));
  if (!pages.length) return false;
  const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await h2c(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 });
    const img = canvas.toDataURL('image/jpeg', 0.95);
    // 保持比例置中，內容高於 A4 才縮到剛好一頁，絕不溢出造成多餘空白頁
    let imgW = pw, imgH = pw * canvas.height / canvas.width;
    if (imgH > ph) { imgH = ph; imgW = ph * canvas.width / canvas.height; }
    const x = (pw - imgW) / 2;
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', x, 0, imgW, imgH);
  }
  pdf.save(fileBase + '.pdf');
  return true;
}

async function downloadPersonalJournalPdf() {
  if (!_currentJournalReport) { toast('請先產生日誌預覽'); return; }
  const preview = $id('journalPreview');
  const node = preview ? (preview.querySelector('.mr-report') || preview) : null;
  if (!node) { toast('找不到日誌內容'); return; }
  if (typeof window.html2pdf === 'undefined') {
    toast('PDF 元件載入中，請改用「列印 / 存 PDF」');
    return;
  }
  toast('產生 PDF 中，請稍候...');
  try {
    // 先試逐頁渲染（多頁不會空白）；不支援時回退原本整份渲染
    const done = await renderReportPdfByPage(node, _currentJournalReport.fileBase);
    if (!done) {
      const pageCount = node.querySelectorAll('.mr-page').length;
      await window.html2pdf().set(journalPdfOptions(_currentJournalReport.fileBase, safeOneShotScale(pageCount))).from(node).save();
    }
    toast('✅ PDF 已下載');
  } catch (e) {
    console.error(e);
    toast('PDF 產生失敗，請改用列印');
  }
}

function printPersonalJournal() {
  if (!_currentJournalReport) { toast('請先產生日誌預覽'); return; }
  const preview = $id('journalPreview');
  const node = preview ? (preview.querySelector('.mr-report') || preview) : null;
  if (!node) { toast('找不到日誌內容'); return; }
  const win = window.open('', '_blank');
  if (!win) { toast('請允許彈出視窗以列印'); return; }
  win.document.open();
  win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />
    <title>${journalSafePart(_currentJournalReport.fileBase)}</title>
    <link rel="stylesheet" href="style.css?v=20260624a" />
    <link rel="stylesheet" href="monthly-report.css?v=20260624a" />
    <style>body{margin:0;background:#fff;} .mr-report{box-shadow:none;} .mr-page{margin:0 auto 0;} </style>
  </head><body class="mr-print-window">${node.outerHTML}
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
  </body></html>`);
  win.document.close();
  win.focus();
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
  try { return JSON.parse(text); }
  catch (e) { throw new Error('回傳非 JSON：' + text.slice(0, 120)); }
}

/* ============================================================
   15. 分頁切換
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
  if (tabName === 'parent') renderParentDashboard();
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
  student: { allowed: ['student', 'lastperf', 'profile'], default: 'student' },
  parent: { allowed: ['parent'], default: 'parent' },
  coach: { allowed: ['student', 'lastperf', 'coach', 'profile', 'settings'], default: 'coach' }
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
    <div class="consent-notice">本系統蒐集學生出席、訓練狀態、身體狀態、KPI成長與教練提醒，僅作為訓練管理、身體狀態追蹤、家長溝通與訓練報表使用。家長端僅能查看自己孩子的訓練摘要與教練公開提醒，不會顯示其他學生資料。如需查詢、更正、停止使用或刪除資料，請聯繫教練或系統管理者。</div>
    <label class="consent-row"><input type="checkbox" id="consentTrainingData"> 同意訓練與出席資料用於訓練管理</label>
    <label class="consent-row"><input type="checkbox" id="consentHealthData"> 同意身體狀態資料用於安全追蹤</label>
    <label class="consent-row"><input type="checkbox" id="consentParentNotice"> 同意接收教練公開提醒與家長摘要</label>
    <label class="consent-row"><input type="checkbox" id="consentReport"> 同意資料用於個人訓練報表</label>
    <label class="consent-row"><input type="checkbox" id="consentLineNotice"> 同意接收 LINE 通知（選填）</label>
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
      consentParentNotice: $id('consentParentNotice').checked,
      consentReport: $id('consentReport').checked,
      consentLineNotice: $id('consentLineNotice').checked
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
    $id('loginOverlay').classList.add('hidden');
    applyRole();
  } else {
    loginError(result.error || '登入資訊不正確。');
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
  }
  if (window.KpiSession && window.KpiSession.refresh) {
    setTimeout(() => window.KpiSession.refresh(), 0);
  }

  // 今日我該做什麼（選手／家長導引卡）
  renderTodayGuide();
}

function setSelectOnlyName(id, name) {
  const el = $id(id);
  if (!el || el.tagName !== 'SELECT') return;
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
    const res = await postToWebApp({ action: 'getAccountAdminData' });
    if (!res || !res.ok) throw new Error((res && res.error) || '讀取失敗');
    const data = res.data || { students: [], parents: [] };
    ACCOUNT_ADMIN_DATA = data;
    $id('legacyLoginEnabled').checked = !!data.legacyLoginEnabled;

    studentBox.innerHTML = `<table><thead><tr><th>選手</th><th>狀態</th><th>最近登入</th><th>PIN</th><th>操作</th></tr></thead><tbody>${
      data.students.map(s => `<tr><td>${escapeHtml(s.studentName)}</td><td>${escapeHtml(s.accountStatus || 'pending')}${s.lockedUntil ? '<br><span class="tag tag-red">鎖定</span>' : ''}</td><td>${accountDate(s.lastLoginAt)}</td><td>${s.pinSet ? '已設定' : '待啟用'}</td><td class="account-actions">
        <button type="button" data-student-action="generateActivation" data-student-id="${escapeHtml(s.studentId)}">產生啟用碼</button>
        <button type="button" data-student-action="resetPin" data-student-id="${escapeHtml(s.studentId)}">重設 PIN</button>
        <button type="button" data-student-action="unlock" data-student-id="${escapeHtml(s.studentId)}">解除鎖定</button>
        <button type="button" data-student-action="${s.accountStatus === 'disabled' ? 'enable' : 'disable'}" data-student-id="${escapeHtml(s.studentId)}">${s.accountStatus === 'disabled' ? '啟用' : '停用'}</button>
      </td></tr>`).join('') || '<tr><td colspan="5">尚無選手帳號，請先同步名單並執行 setupSheet。</td></tr>'
    }</tbody></table>`;

    const studentSelect = $id('accountParentStudent');
    studentSelect.innerHTML = '<option value="">選擇孩子</option>' + data.students.map(s => `<option value="${escapeHtml(s.studentId)}">${escapeHtml(s.studentName)}</option>`).join('');

    parentBox.innerHTML = `<table><thead><tr><th>孩子</th><th>家長</th><th>手機</th><th>綁定／同意</th><th>最近登入</th><th>操作</th></tr></thead><tbody>${
      data.parents.map(p => `<tr><td>${escapeHtml(p.studentName)}</td><td>${escapeHtml(p.parentName || '-')}</td><td>${escapeHtml(p.parentPhone || '-')}</td><td>${escapeHtml(p.bindStatus || 'pending')} / ${escapeHtml(p.consentStatus || 'pending')}</td><td>${accountDate(p.lastLoginAt)}</td><td class="account-actions">
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
    const kpiOpen = (typeof isDailyKpiAvailable === 'function') && isDailyKpiAvailable();
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
    { key: 'pain', label: '疼痛 4 分以上', num: painList.length, tone: painList.length ? 'danger' : 'good', names: painList.map(r => `${nameOf(r)}（${nval(r.painScore)} 分）`) },
    { key: 'rpe', label: 'RPE 8 以上', num: rpeList.length, tone: rpeList.length ? 'warn' : 'good', names: rpeList.map(r => `${nameOf(r)}（RPE ${nval(r.rpe)}）`) },
    { key: 'sleep', label: '睡眠差', num: sleepList.length, tone: sleepList.length ? 'warn' : 'good', names: sleepList.map(nameOf) },
    { key: 'mood', label: '心情低落', num: moodList.length, tone: moodList.length ? 'warn' : 'good', names: moodList.map(nameOf) },
    { key: 'notify', label: '需家長通知', num: notifyList.length, tone: notifyList.length ? 'danger' : 'good', names: notifyList.map(nameOf) }
  ];
  _warRoomLists = {};
  cards.forEach(c => { _warRoomLists[c.key] = { label: c.label, names: c.names }; });

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
        (data.names.length
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
  document.querySelectorAll('.app-title').forEach(el => { el.textContent = '🥋 ' + b.teamName; });
  document.querySelectorAll('.app-subtitle').forEach(el => { el.textContent = subtitle; });
  const lt = document.querySelector('.login-title'); if (lt) lt.textContent = '🥋 ' + b.teamName;
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

/* ============================================================
   16. 初始化
   ============================================================ */
function init() {
  // 分頁
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 解憂信箱分頁鈕：開新分頁到外站，不切換內部分頁
  const tabSolace = $id('tabSolace');
  if (tabSolace) tabSolace.addEventListener('click', () => {
    window.open(SOLACE_URL, '_blank', 'noopener');
    toast('💌 已開啟解憂信箱');
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
  // 尿液顏色監控
  { const u = $id('urineStatus'); if (u) u.addEventListener('change', updateUrineNote); }
  // 初次顯示
  updateSleepCalc(); updatePainReadout(); updateUrineNote();

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
    // 角色套用後再還原草稿（選手姓名鎖定才正確）；有還原才提示
    if (restoreDraft()) toast('📝 已還原上次未送出的草稿');
  });

  // 隊伍／運動項目通用設定（品牌與模組）
  applyBrand();
  renderBrandSettings();
  setupBrandHandlers();

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
  ['bedTime', 'wakeTime', 'sleepHours', 'soreness', 'rpe', 'injuryArea'].forEach(id => { const el = $id(id); if (el) el.value = ''; });
  if ($id('sleepQuality')) $id('sleepQuality').value = '普通';
  if ($id('urineStatus')) $id('urineStatus').value = '';
  if ($id('painScore')) $id('painScore').value = 0;
  updateSleepCalc(); updatePainReadout(); updateUrineNote();
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
  'bedTime', 'wakeTime', 'sleepQuality', 'soreness', 'rpe', 'injuryArea', 'painScore',
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
  updateBmiDisplay();
  updateSleepCalc(); updatePainReadout(); updateUrineNote();
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
document.addEventListener('DOMContentLoaded', init);
