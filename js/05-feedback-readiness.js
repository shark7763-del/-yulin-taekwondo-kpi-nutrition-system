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
  const intro = document.querySelector('#coachFeedbackCard .cfb-intro');
  if (intro) {
    const nameHtml = (window.traitNameHtml ? window.traitNameHtml(fb.header.name || '選手') : escapeHtml(fb.header.name || '選手'));
    intro.innerHTML = `送出完成，這是教練看完 <b>${nameHtml}</b> 今天紀錄後想對你說的話。`;
  }

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

async function augmentTraitContextForAi(record) {
  const ctx = Object.assign({}, record || {});
  const name = String(ctx.name || ctx.studentName || '').trim();
  if (!name) return ctx;
  try {
    const trait = (window.TraitRadar && typeof window.TraitRadar.recordFor === 'function' && window.TraitRadar.recordFor(name)) ||
      (window.loadStudentTrait ? await window.loadStudentTrait(name) : null);
    if (trait) {
      ctx.traitType = trait.traitType || trait.typeKey || '';
      ctx.traitLabel = trait.traitLabel || trait.label || '';
      ctx.traitScore = trait.traitScore || trait.rawScore || {};
      ctx.traitSummary = trait.traitSummary || trait.description || '';
      ctx.communicationTips = trait.communicationTips || trait.communication || '';
      ctx.trainingTips = trait.trainingTips || trait.correction || '';
    }
  } catch (e) {}
  return ctx;
}

/* ===================== AI 教練回饋（OpenAI / GPT）===================== */
// 送出後背景呼叫；成功就把三版回饋換成 AI 生成，失敗靜默沿用內建模板
async function maybeEnhanceWithAiFeedback(rec, feedback) {
  if (!getWebAppUrl() || !rec) return;
  try {
    const record = await augmentTraitContextForAi(Object.assign({}, rec, { _statusLabel: (feedback && feedback.scenarioLabel) || '' }));
    const res = await postToWebApp({ action: 'aiCoachFeedback', record: record });
    if (!res || !res.ok || !res.versions || !_currentFeedback) return;
    _currentFeedback.versions = res.versions;
    _currentFeedback.aiGenerated = true;
    const intro = document.querySelector('#coachFeedbackCard .cfb-intro');
    if (intro) intro.innerHTML = '✨ 這是 AI 教練（依教練語氣）看完你今天紀錄後想對你說的話。';
    selectFbVersion(_currentFbVersion || 'student');
    toast('✨ AI 教練回饋已生成');
  } catch (e) { /* 靜默退回模板 */ }
}

async function loadAiConfig() {
  if (!getWebAppUrl()) return;
  try {
    const res = await postToWebApp({ action: 'getAiConfig' });
    if (!res || !res.ok || !res.data) return;
    const d = res.data;
    if ($id('aiModel')) $id('aiModel').value = d.model || 'gpt-4o-mini';
    if ($id('aiEnabled')) $id('aiEnabled').checked = !!d.enabled;
    if ($id('aiStyle')) $id('aiStyle').value = d.style || '';
    if ($id('aiApiKey')) $id('aiApiKey').placeholder = d.hasKey ? '已設定 ●●●●（要更換才需重貼）' : '貼上 Key（sk-...）後按儲存';
    if ($id('aiDailyCap')) $id('aiDailyCap').value = d.dailyCap || 300;
    if ($id('aiUserCap')) $id('aiUserCap').value = d.userCap || 40;
    if ($id('aiUsageNote')) $id('aiUsageNote').textContent = '　今日已用 ' + (d.usedToday || 0) + ' / ' + (d.dailyCap || 300) + ' 次';
    try { localStorage.setItem('teampro_ai_config_cache', JSON.stringify({ enabled: !!d.enabled, model: d.model || 'gpt-4o-mini', style: d.style || '', hasKey: !!d.hasKey })); } catch (e) { /* */ }
  } catch (e) { /* */ }
}

function setupAiHandlers() {
  const saveBtn = $id('btnSaveAi');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const st = $id('aiStatus');
    const payload = {
      action: 'setAiConfig',
      model: $id('aiModel') ? $id('aiModel').value : 'gpt-4o-mini',
      enabled: $id('aiEnabled') ? $id('aiEnabled').checked : false,
      style: $id('aiStyle') ? $id('aiStyle').value : ''
    };
    if ($id('aiDailyCap') && $id('aiDailyCap').value) payload.dailyCap = parseInt($id('aiDailyCap').value, 10);
    if ($id('aiUserCap') && $id('aiUserCap').value) payload.userCap = parseInt($id('aiUserCap').value, 10);
    const k = $id('aiApiKey') ? $id('aiApiKey').value.trim() : '';
    if (k) payload.apiKey = k;
    if (st) { st.textContent = '儲存中…'; st.className = 'conn-status info'; }
    try {
      const res = await postToWebApp(payload);
      if (res && res.ok) {
        if (st) { st.textContent = '✅ 已儲存'; st.className = 'conn-status ok'; }
        try { localStorage.setItem('teampro_ai_config_cache', JSON.stringify({ enabled: !!payload.enabled, model: payload.model || 'gpt-4o-mini', style: payload.style || '', hasKey: !!(k || ($id('aiApiKey') && $id('aiApiKey').placeholder.indexOf('已設定') !== -1)) })); } catch (e) { /* */ }
        if ($id('aiApiKey')) $id('aiApiKey').value = '';
        loadAiConfig();
      } else if (st) { st.textContent = '❌ ' + ((res && res.error) || '儲存失敗'); st.className = 'conn-status fail'; }
    } catch (e) { if (st) { st.textContent = '❌ 儲存失敗，請確認連線'; st.className = 'conn-status fail'; } }
  });

  const testBtn = $id('btnTestAi');
  if (testBtn) testBtn.addEventListener('click', async () => {
    const st = $id('aiStatus'), box = $id('aiTestResult');
    if (st) { st.textContent = '生成中…（請先按「儲存設定」並勾選啟用）'; st.className = 'conn-status info'; }
    const sample = {
      name: '測試選手', date: todayStr(), group: '跆拳道對練', trainingTopic: '旋踢距離控制',
      status: '🟡 黃燈', bodyStatus: '疲勞', rpe: '8', soreness: '4', sleepHours: '5.5', sleepQuality: '差',
      moodIndex: '2', reflection: '今天有點累，旋踢一直抓不到距離', tomorrowGoal: '把旋踢做穩'
    };
    try {
      const res = await postToWebApp({ action: 'aiCoachFeedback', record: await augmentTraitContextForAi(sample) });
      if (res && res.ok && res.versions) {
        const v = res.versions.student || {};
        if (box) {
          box.style.display = '';
          box.innerHTML = '<b>✨ 選手版範例（' + escapeHtml(res.model || '') + '）</b><br>' +
            '【今日狀態】' + escapeHtml(v.affirm || '') + '<br>【提醒】' + escapeHtml(v.watch || '') +
            '<br>【明日任務】' + escapeHtml(v.oneThing || '') + '<br>「' + escapeHtml(v.quote || '') + '」';
        }
        if (st) { st.textContent = '✅ 測試成功，AI 已可使用'; st.className = 'conn-status ok'; }
      } else if (st) { st.textContent = '❌ ' + ((res && res.error) || '測試失敗'); st.className = 'conn-status fail'; }
    } catch (e) { if (st) { st.textContent = '❌ 測試失敗，請確認連線'; st.className = 'conn-status fail'; } }
  });
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
  const painArea = String(rec.injuryArea || '').trim() || '未填部位';
  const sleep = nval(rec.sleepHours);
  const rpe = nval(rec.rpe) || 0;
  const coachRisk = nval(rec.coachRiskScore);
  if (pain >= 4 && pain <= 6) { p += 8; risks.push(`疼痛中度（${painArea}｜疼痛 ${pain} 分）`); }
  if (pain >= 7) { p += 20; risks.push(`受傷風險（${painArea}｜疼痛 ${pain} 分）`); }
  if (sleep !== null && sleep < 6) { p += 8; risks.push('睡眠不足'); }
  if (rec.sleepQuality === '差') { p += 5; risks.push('睡眠品質差'); }
  if (rec.urineStatus === '深黃') { p += 5; risks.push('恢復不足'); }
  if (rec.urineStatus === '琥珀色') { p += 12; risks.push('脫水風險'); }
  if (rpe >= 8 && recoveryScore < 60) { p += 8; risks.push('高風險硬撐'); }
  if (coachRisk === 1) { p += 20; risks.push('教練高風險'); }
  if (coachRisk === 2) { p += 10; risks.push('教練提醒風險'); }
  if (pain >= 7 && (rec.trainingIntensity === '高' || rec.trainingIntensity === '比賽日')) { p += 10; risks.push(`疼痛高仍高強度（${painArea}）`); }
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

