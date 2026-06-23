/* YouthFit AI hackathon demo layer. TeamPro data and role logic remain in app.js. */
(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const value = id => byId(id) ? byId(id).value : '';
  const safe = text => String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  const sportRules = {
    '喜歡團隊': { default: '籃球或排球', home: '節奏體能與線上團體挑戰' },
    '喜歡節奏': { default: '街舞或跳繩', home: '街舞或節奏跳繩' },
    '喜歡挑戰': { default: '跆拳道或田徑', home: '徒手體能挑戰' },
    '容易緊張': { default: '游泳、慢跑或伸展瑜珈', home: '呼吸伸展與基礎瑜珈' },
    '需要陪伴': { default: '羽球或小組體適能', home: '親子體適能或線上陪練' }
  };

  function buildMatch(event) {
    event.preventDefault();
    const personality = value('yfPersonality');
    const venue = value('yfVenue');
    const goal = value('yfGoal');
    const experience = value('yfExperience');
    const minutes = Number(value('yfTime'));
    const sport = venue === '家裡' ? sportRules[personality].home : sportRules[personality].default;
    const sessions = minutes >= 180 ? 3 : 2;
    const sessionMinutes = Math.max(15, Math.round(minutes / sessions));
    const intro = experience === '無經驗' ? '低強度基本動作' : experience === '校隊' ? '技術品質與恢復' : '基礎技巧與體能';
    const encouragement = personality === '容易緊張' || personality === '需要陪伴'
      ? '不用跟別人比較，願意開始並完成一次，就是值得記住的進步。'
      : '把挑戰切成小步驟，你會看見自己每週都比上週更穩。';

    byId('yfMatchResult').innerHTML = `
      <h3>${safe(sport)}</h3><p>依照「${safe(goal)}」目標與目前可用場地推薦</p>
      <div class="yf-result-list">
        <div><small>推薦運動類型</small><p>${safe(sport)}，先體驗兩週，再依喜歡程度調整。</p></div>
        <div><small>本週入門訓練</small><p>每週 ${sessions} 次、每次約 ${sessionMinutes} 分鐘：5 分鐘暖身＋${safe(intro)}＋5 分鐘放鬆。</p></div>
        <div><small>注意事項</small><p>以能正常說話的強度開始；若有明顯疼痛或不舒服，先停止並請師長協助。</p></div>
        <div><small>給你的鼓勵</small><p>${safe(encouragement)}</p></div>
      </div>`;
    try { localStorage.setItem('youthfit_last_match', String(Date.now())); } catch (e) { /* optional */ }
    renderGrowth(goal, experience);
    byId('yfMatchResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function coachState() {
    return {
      sleep: Number(value('yfSleep')),
      pain: Number(value('yfPain')),
      mood: Number(value('yfMood')),
      water: value('yfWater'),
      activity: value('yfActivity'),
      stress: Number(value('yfStress'))
    };
  }

  function renderCoachAdvice() {
    const s = coachState();
    const reduce = s.sleep < 6 || s.pain >= 6 || s.mood <= 2 || s.stress >= 5;
    const training = reduce ? '今天以散步、呼吸與輕柔伸展為主，先把身體照顧好。' : '完成 8 分鐘暖身，再做 20 分鐘基礎技巧與低至中強度體能。';
    const recovery = s.pain >= 6 ? '暫停刺激疼痛部位，請師長或教練協助觀察。' : s.sleep < 7 ? '增加 10 分鐘放鬆，今天提早結束訓練。' : '訓練後慢走與伸展 8 分鐘。';
    const water = s.water === 'low' ? '先補充一杯水，運動中每 15 至 20 分鐘小口飲水。' : '維持分次飲水，運動前後都記得補充。';
    const sleep = s.sleep < 7 ? '今晚提早 30 分鐘放下手機，爭取 8 小時睡眠。' : '睡眠狀態不錯，維持固定的入睡時間。';
    const mind = s.mood <= 2 ? '今天不需要勉強表現，找一位信任的師長聊聊也很好。' : '專注完成一個小目標，記得肯定自己的投入。';
    const intensity = reduce ? '是，建議降低強度 30% 至 50%，並由師長或教練主動關心。' : '目前可維持正常強度，過程中仍以感受舒適為原則。';
    const cards = [['今日建議訓練', training], ['今日恢復建議', recovery], ['飲水提醒', water], ['睡眠提醒', sleep], ['心理鼓勵', mind], ['是否需要降低強度', intensity]];
    byId('yfCoachAdvice').innerHTML = cards.map(([title, body]) => `<div class="yf-advice-card"><b>${title}</b><p>${body}</p></div>`).join('');
    renderRisks(s);
    renderGrowth(value('yfGoal') || '健康', value('yfExperience') || '初學');
  }

  function analyzeMotion() {
    const motion = value('yfMotion');
    const file = byId('yfVideo').files[0];
    const motionData = {
      '爆發力檢測': {
        scores: [['82', '爆發力指數'], ['79', '起跳協調'], ['86', '落地穩定']],
        correction: '起跳時手臂擺動稍慢，可讓手臂與髖膝伸展同步，落地時保持膝蓋朝腳尖方向。',
        next: '完成 3 組、每組 5 次原地垂直跳；每次落地後穩定停留 2 秒。'
      },
      '單腳平衡穩定檢測': {
        scores: [['84', '平衡穩定'], ['77', '軀幹控制'], ['12%', '左右差異']],
        correction: '左腳支撐時軀幹晃動稍多，先縮短單腳站立時間，視線固定前方並保持自然呼吸。',
        next: '左右腳各完成 3 組 20 秒單腳站立，動作品質穩定後再增加難度。'
      }
    };
    const data = motionData[motion];
    byId('yfMotionResult').innerHTML = `
      <h3>${safe(motion)}分析完成</h3><p>${file ? '已在裝置端模擬分析：' + safe(file.name) : '使用黑客松預設影片進行模擬分析'}</p>
      <div class="yf-motion-scores">${data.scores.map(score => `<div><b>${score[0]}${score[0].includes('%') ? '' : '%'}</b><small>${score[1]}</small></div>`).join('')}</div>
      <div class="yf-result-list"><div><small>動作觀察</small><p>${data.correction}</p></div><div><small>下一步訓練</small><p>${data.next}</p></div></div>`;
  }

  function renderGrowth(goal, experience) {
    const s = coachState();
    const base = experience === '校隊' ? 82 : experience === '有基礎' ? 74 : 66;
    const metrics = [
      ['健康分數', Math.min(95, base + (s.sleep >= 7 ? 8 : -4)), '近 7 天綜合'],
      ['自律分數', base + 5, '回報與完成率'],
      ['自信分數', base + (goal === '自信' ? 9 : 3), '自評趨勢'],
      ['社交參與', goal === '交朋友' ? 86 : base, '團體活動'],
      ['心理壓力', Math.max(18, s.stress * 16), '越低越穩定', true],
      ['睡眠品質', Math.min(100, s.sleep * 11), '每日回報'],
      ['運動習慣', s.activity === 'down' ? 48 : base + 6, '每週持續度'],
      ['疼痛風險', s.pain * 10, '越低越安全', true]
    ];
    byId('yfGrowthGrid').innerHTML = metrics.map(([label, raw, note, inverse]) => {
      const score = Math.max(0, Math.min(100, Math.round(raw)));
      const color = inverse ? (score >= 60 ? '#ff6b6b' : score >= 35 ? '#ffd166' : '#42e8d1') : '#42e8d1';
      return `<div class="yf-metric" style="--score:${score}%;--metric-color:${color}"><span>${label}</span><strong>${score}</strong><small>${note}</small></div>`;
    }).join('');
  }

  function renderRisks(s) {
    let daysSinceReport = 0;
    try {
      const last = Number(localStorage.getItem('youthfit_last_match'));
      if (last) daysSinceReport = Math.floor((Date.now() - last) / 86400000);
    } catch (e) { /* optional */ }
    const risks = [
      ['睡眠不足', s.sleep < 6 ? 'red' : s.sleep < 7 ? 'yellow' : 'green', s.sleep < 7 ? '最近睡眠稍少，今天可以降低一點強度並提早休息。' : '近期睡眠時間穩定，請繼續維持。'],
      ['疼痛分數過高', s.pain >= 7 ? 'red' : s.pain >= 4 ? 'yellow' : 'green', s.pain >= 4 ? '疼痛回報需要多一點關心，建議先避開不舒服的動作。' : '目前未出現明顯疼痛訊號。'],
      ['心情低落', s.mood <= 1 ? 'red' : s.mood <= 2 ? 'yellow' : 'green', s.mood <= 2 ? '最近心情比較低落，建議由信任的師長或教練主動陪伴。' : '目前心情回報大致穩定。'],
      ['運動量下降', s.activity === 'down' ? 'yellow' : 'green', s.activity === 'down' ? '最近運動量下降，可以從一次 10 分鐘的輕鬆活動重新開始。' : '近期運動量維持穩定。'],
      ['壓力過高', s.stress >= 5 ? 'red' : s.stress >= 3 ? 'yellow' : 'green', s.stress >= 5 ? '最近壓力偏高，不必勉強完成原定訓練，先讓師長知道你的感受。' : '壓力回報在可關心的範圍。'],
      ['飲水不足', s.water === 'low' ? 'yellow' : 'green', s.water === 'low' ? '今天飲水較少，請先分次補充，不需要一次喝太快。' : '飲水狀態尚可，運動前後記得持續補充。'],
      ['連續未回報', daysSinceReport >= 7 ? 'red' : daysSinceReport >= 3 ? 'yellow' : 'green', daysSinceReport >= 3 ? `已 ${daysSinceReport} 天未回報，建議以關心近況的方式主動聯繫。` : '近期回報正常，持續看見自己的變化。']
    ];
    const colors = { red: '#ff6262', yellow: '#ffd166', green: '#42e8a1' };
    byId('yfRiskList').innerHTML = risks.map(([label, level, text]) => `<div class="yf-risk"><span class="yf-risk-dot" style="--risk-color:${colors[level]}"></span><b>${label}</b><p>${text}</p></div>`).join('');
  }

  function initYouthFit() {
    if (!byId('yfMatchForm')) return;
    byId('yfMatchForm').addEventListener('submit', buildMatch);
    byId('yfCoachBtn').addEventListener('click', renderCoachAdvice);
    byId('yfAnalyzeBtn').addEventListener('click', analyzeMotion);
    byId('yfVideo').addEventListener('change', event => {
      const file = event.target.files[0];
      byId('yfFileName').textContent = file ? file.name : '選擇手機中的影片';
    });
    renderCoachAdvice();
  }

  document.addEventListener('DOMContentLoaded', initYouthFit);
}());
