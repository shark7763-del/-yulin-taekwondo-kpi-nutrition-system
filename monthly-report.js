/* ============================================================
   每月訪視專用報表模組（Monthly Visit Report）
   ------------------------------------------------------------
   獨立模組：只「新增」功能，不更動 app.js 既有邏輯。
   讀取 app.js 已宣告的全域：fetchAllRecords / fetchAllAttendanceReports
   / mergeAttendanceWithKpi / normDate / getPlayers / KPI_ASPECTS
   / ASPECT_ORDER / round1 / toast / escapeHtml / normalizeAttendanceStatus
   / computeRecovery 等（classic script 共用頂層作用域）。

   用途：給學校主任、校長、長官訪視使用，一目了然、正式、可列印成 A4 PDF。
   隱私：不放入解憂信箱原文與心理文字，心理只顯示統計摘要。
   ============================================================ */
(function () {
  'use strict';

  // 模組狀態
  var MR = {
    lastReportData: null,
    reportType: 'official' // official | coach | parent
  };

  /* ---------- 小工具（不依賴 app.js，避免相依風險） ---------- */
  function el(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function avg(arr) {
    var xs = arr.filter(function (n) { return n !== null && n !== undefined && !isNaN(n); });
    if (!xs.length) return null;
    return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  }
  function r1(n) { return n === null || n === undefined || isNaN(n) ? null : Math.round(n * 10) / 10; }
  function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }
  function NA(v, unit) {
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return '—';
    return unit ? (v + unit) : String(v);
  }
  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function ymd(d) {
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function thisMonthStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function nd(v) { return (typeof normDate === 'function') ? normDate(v) : String(v || '').slice(0, 10); }
  function roster() {
    try { if (typeof getPlayers === 'function') return getPlayers(); } catch (e) {}
    return [];
  }
  function stripMealTags(s) { return String(s || '').replace(/〔[^〕]*〕/g, '').replace(/\[[^\]]*\]/g, '').trim(); }

  // 取得 KPI 面向標籤（沿用 app.js 的 KPI_ASPECTS；缺則退預設）
  function aspectLabel(key) {
    try { if (typeof KPI_ASPECTS !== 'undefined' && KPI_ASPECTS[key]) return KPI_ASPECTS[key].label; } catch (e) {}
    return ({ technical: '技術', tactical: '戰術', physical: '體能', focus: '心理', discipline: '態度', emotion: '生理' })[key] || key;
  }

  /* ============================================================
     一、資料抓取與整理
     ============================================================ */

  // 月份字串 'YYYY-MM' → 該月所有日期前綴比對
  function inMonth(dateStr, month) {
    var d = nd(dateStr);
    return d && d.slice(0, 7) === month;
  }

  // 把同一人同一天的 KPI 紀錄只留最新一筆
  function dedupeByNameDate(records) {
    var map = {};
    records.forEach(function (r) {
      var key = String(r.name || '').trim() + '|' + nd(r.date);
      if (!key) return;
      var t = new Date(r.timestamp || r.date || 0).getTime();
      if (!map[key] || t >= map[key]._t) { r._t = t; map[key] = r; }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function isAbsence(rec) {
    try { if (typeof isAbsenceRecord === 'function') return isAbsenceRecord(rec); } catch (e) {}
    var g = String(rec.group || ''), s = String(rec.status || '');
    return g.indexOf('未出席') !== -1 || s.indexOf('未出席') !== -1;
  }

  /*
     generateMonthlyReportData(month)
     month: 'YYYY-MM'
     回傳整理後的月報資料；若無當月資料 → { empty:true }
  */
  async function generateMonthlyReportData(month) {
    month = month || thisMonthStr();
    var allRecords = [];
    var allReports = [];
    try { allRecords = (typeof fetchAllRecords === 'function') ? (await fetchAllRecords()) : []; } catch (e) { allRecords = []; }
    try { allReports = (typeof fetchAllAttendanceReports === 'function') ? (await fetchAllAttendanceReports()) : []; } catch (e) { allReports = []; }
    allRecords = Array.isArray(allRecords) ? allRecords : [];
    allReports = Array.isArray(allReports) ? allReports : [];

    // 當月 KPI 紀錄（含未出席報告書）
    var monthKpi = dedupeByNameDate(allRecords.filter(function (r) { return inMonth(r.date, month); }));

    // 當月出席報表（合併 KPI 推導的出席）
    var mergedRows = [];
    try {
      if (typeof mergeAttendanceWithKpi === 'function') {
        mergedRows = mergeAttendanceWithKpi(allReports, allRecords, '').filter(function (r) { return inMonth(r.date, month); });
      }
    } catch (e) { mergedRows = []; }
    if (!mergedRows.length) {
      // 退而求其次：用 KPI 紀錄推導出席
      mergedRows = monthKpi.map(function (rec) {
        return {
          date: nd(rec.date), studentName: rec.name,
          attendanceStatus: isAbsence(rec) ? (String(rec.absenceReason || '').trim() ? '未出席已請假' : '未出席未請假') : '已訓練',
          absenceReason: rec.absenceReason || '', parentConfirmed: '否',
          makeupTask: '', makeupStatus: '', coachPublicNote: rec.coachReply || '', coachPrivateNote: ''
        };
      });
    }

    // 資料不足判斷：當月既無 KPI 也無出席紀錄
    if (!monthKpi.length && !mergedRows.length) {
      return { empty: true, month: month };
    }

    var names = roster();
    if (!names.length) {
      // 從資料反推名單
      var nameSet = {};
      monthKpi.forEach(function (r) { if (r.name) nameSet[r.name] = 1; });
      mergedRows.forEach(function (r) { if (r.studentName) nameSet[r.studentName] = 1; });
      names = Object.keys(nameSet);
    }

    // 當月訓練天數：有人實際出席訓練的不重複日期數
    var trainingDateSet = {};
    monthKpi.forEach(function (r) { if (!isAbsence(r)) trainingDateSet[nd(r.date)] = 1; });
    mergedRows.forEach(function (r) {
      var st = normStatus(r.attendanceStatus, r);
      if (st === '已訓練' || st === '補訓完成' || st === '遲到' || st === '早退') trainingDateSet[nd(r.date)] = 1;
    });
    var totalTrainingDays = Object.keys(trainingDateSet).length;

    // 各面向統計
    var attendance = calculateAttendanceSummary(mergedRows, names, totalTrainingDays);
    var kpi = calculateKpiSummary(monthKpi);
    var recovery = calculateRecoverySummary(monthKpi);
    var nutrition = calculateNutritionSummary(monthKpi);
    var trees = calculateAllAthleteGrowthTrees(monthKpi, names);
    var ryg = calculateRedYellowGreenStatus({ names: names, monthKpi: monthKpi, attendance: attendance, recovery: recovery, nutrition: nutrition, trees: trees });

    // 每週 KPI session（Phase 2/3）：當月列入月報者。後端未部署或無資料則為空陣列，不影響其他頁。
    var weeklyKpiSessions = [];
    try {
      if (typeof postToWebApp === 'function') {
        var wk = await postToWebApp({ action: 'getMonthlyKpiSessions', month: month });
        if (wk && wk.ok && Array.isArray(wk.data)) weeklyKpiSessions = wk.data;
      }
    } catch (e) { weeklyKpiSessions = []; }

    var data = {
      empty: false,
      month: month,
      monthLabel: month.replace('-', ' 年 ') + ' 月',
      generatedAt: ymd(new Date()),
      names: names,
      monthKpi: monthKpi,
      mergedRows: mergedRows,
      totalTrainingDays: totalTrainingDays,
      totalAthletes: names.length,
      attendance: attendance,
      kpi: kpi,
      recovery: recovery,
      nutrition: nutrition,
      trees: trees,
      ryg: ryg,
      weeklyKpiSessions: weeklyKpiSessions
    };
    data.coachSummary = generateCoachMonthlySummary(data);
    return data;
  }

  function normStatus(status, row) {
    try { if (typeof normalizeAttendanceStatus === 'function') return normalizeAttendanceStatus(status, row); } catch (e) {}
    var s = String(status || '');
    if (s.indexOf('已訓練') !== -1 || s.indexOf('出席') !== -1) return '已訓練';
    if (s.indexOf('請假') !== -1) return '未出席已請假';
    if (s.indexOf('缺席') !== -1) return '未出席未請假';
    if (s.indexOf('遲到') !== -1) return '遲到';
    if (s.indexOf('早退') !== -1) return '早退';
    if (s.indexOf('補訓') !== -1) return '補訓完成';
    return '尚未填寫';
  }

  /* ============================================================
     二、各面向統計函式
     ============================================================ */

  // 出席與回報
  function calculateAttendanceSummary(rows, names, totalTrainingDays) {
    names = names || [];
    var perAthlete = {};
    names.forEach(function (n) {
      perAthlete[n] = { trained: 0, leave: 0, absent: 0, late: 0, notReported: 0, makeupDone: 0, makeupTotal: 0, parentConfirmed: 0, days: 0 };
    });
    var trainedTotal = 0, leaveTotal = 0, absentTotal = 0, notReportedTotal = 0, submitted = 0, parentConfirmedTotal = 0, makeupDone = 0, makeupTotal = 0;

    rows.forEach(function (r) {
      var name = String(r.studentName || '').trim();
      var a = perAthlete[name];
      var st = normStatus(r.attendanceStatus, r);
      var counted = a || { trained: 0, leave: 0, absent: 0, late: 0, notReported: 0, makeupDone: 0, makeupTotal: 0, parentConfirmed: 0, days: 0 };
      counted.days++;
      if (st === '已訓練' || st === '補訓完成') { counted.trained++; trainedTotal++; submitted++; }
      else if (st === '未出席已請假') { counted.leave++; leaveTotal++; submitted++; }
      else if (st === '未出席未請假') { counted.absent++; absentTotal++; }
      else if (st === '遲到' || st === '早退') { counted.late++; trainedTotal++; submitted++; }
      else { counted.notReported++; notReportedTotal++; }
      if (st === '補訓完成') { counted.makeupDone++; }
      if (String(r.makeupTask || '').trim()) { counted.makeupTotal++; makeupTotal++; if (String(r.makeupStatus || '').indexOf('完成') !== -1) { counted.makeupDone++; makeupDone++; } }
      if (String(r.parentConfirmed || '') === '是') { counted.parentConfirmed++; parentConfirmedTotal++; }
      if (a) perAthlete[name] = counted;
    });

    // 每位選手出席率（出席 / 應出席訓練天）
    var list = names.map(function (n) {
      var a = perAthlete[n];
      var denom = a.trained + a.leave + a.absent + a.late + a.notReported;
      var rate = denom > 0 ? pct(a.trained + a.late, denom) : 0;
      var confirmRate = a.days > 0 ? pct(a.parentConfirmed, a.days) : 0;
      return {
        name: n, attendanceRate: rate, trained: a.trained + a.late, leave: a.leave,
        absent: a.absent, notReported: a.notReported, makeupDone: a.makeupDone,
        makeupTotal: a.makeupTotal, parentConfirmRate: confirmRate, days: a.days
      };
    });

    var totalSlots = trainedTotal + leaveTotal + absentTotal + notReportedTotal;
    return {
      perAthlete: list,
      teamAttendanceRate: totalSlots > 0 ? pct(trainedTotal, totalSlots) : 0,
      submissionRate: totalSlots > 0 ? pct(submitted, totalSlots) : 0,
      parentConfirmRate: rows.length > 0 ? pct(parentConfirmedTotal, rows.length) : 0,
      makeupDone: makeupDone, makeupTotal: makeupTotal,
      trainedTotal: trainedTotal, leaveTotal: leaveTotal, absentTotal: absentTotal, notReportedTotal: notReportedTotal,
      absenceList: list.filter(function (x) { return x.absent + x.notReported >= 2; })
        .sort(function (a, b) { return (b.absent + b.notReported) - (a.absent + a.notReported); })
    };
  }

  // KPI 六面向
  function calculateKpiSummary(records) {
    var trained = records.filter(function (r) { return !isAbsence(r); });
    var order = (typeof ASPECT_ORDER !== 'undefined' && ASPECT_ORDER.length) ? ASPECT_ORDER : ['technical', 'tactical', 'physical', 'focus', 'discipline', 'emotion'];
    var fieldMap = { technical: 'technicalAvg', tactical: 'tacticalAvg', physical: 'physicalAvg', focus: 'focusAvg', discipline: 'disciplineAvg', emotion: 'emotionAvg' };
    var aspectAvg = {};
    order.forEach(function (k) {
      aspectAvg[k] = r1(avg(trained.map(function (r) { return num(r[fieldMap[k]]); })));
    });
    var overall = r1(avg(trained.map(function (r) { return num(r.averageScore); })));

    // 訓練主題分類統計
    var topicCats = classifyTopics(trained);

    // 進步最多選手：本月後半 KPI 平均 - 前半
    var improved = topImprovedAthletes(trained);

    return { aspectAvg: aspectAvg, order: order, overallAvg: overall, count: trained.length, topicCats: topicCats, topImproved: improved };
  }

  var TOPIC_RULES = [
    { cat: '基本動作', kw: ['基本', '步法', '前踢', '橫踢', '旋踢', '下壓', '基礎'] },
    { cat: '踢靶', kw: ['踢靶', '打靶', '靶'] },
    { cat: '對練', kw: ['對練', '對打', '實戰', '攻防', '自由對練'] },
    { cat: '品勢', kw: ['品勢', '套路', '太極', '高麗', '自由品勢'] },
    { cat: '體能', kw: ['體能', '肌力', '核心', '心肺', '速度', '敏捷', '重訓'] },
    { cat: '戰術', kw: ['戰術', '距離', '時機', '判讀', '節奏'] },
    { cat: '恢復', kw: ['恢復', '伸展', '放鬆', '滾筒', '收操'] },
    { cat: '測驗', kw: ['測驗', '檢測', '考核', '測試', '段位'] },
    { cat: '比賽調整', kw: ['比賽', '賽前', '調整', '降重', '模擬賽'] }
  ];
  function classifyTopics(records) {
    var counts = {};
    TOPIC_RULES.forEach(function (r) { counts[r.cat] = 0; });
    counts['其他'] = 0;
    records.forEach(function (rec) {
      var t = String(rec.trainingTopic || '');
      if (!t.trim()) return;
      var matched = false;
      for (var i = 0; i < TOPIC_RULES.length; i++) {
        if (TOPIC_RULES[i].kw.some(function (k) { return t.indexOf(k) !== -1; })) { counts[TOPIC_RULES[i].cat]++; matched = true; break; }
      }
      if (!matched) counts['其他']++;
    });
    return Object.keys(counts).filter(function (k) { return counts[k] > 0; })
      .map(function (k) { return { cat: k, count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function topImprovedAthletes(records) {
    var byName = {};
    records.forEach(function (r) { (byName[r.name] = byName[r.name] || []).push(r); });
    var out = [];
    Object.keys(byName).forEach(function (name) {
      var recs = byName[name].slice().sort(function (a, b) { return nd(a.date) < nd(b.date) ? -1 : 1; });
      if (recs.length < 2) return;
      var mid = Math.floor(recs.length / 2);
      var early = avg(recs.slice(0, mid).map(function (r) { return num(r.averageScore); }));
      var late = avg(recs.slice(mid).map(function (r) { return num(r.averageScore); }));
      if (early === null || late === null) return;
      out.push({ name: name, delta: r1(late - early), from: r1(early), to: r1(late) });
    });
    return out.filter(function (x) { return x.delta > 0; }).sort(function (a, b) { return b.delta - a.delta; });
  }

  // 恢復 / 疲勞 / 受傷
  function calculateRecoverySummary(records) {
    var trained = records.filter(function (r) { return !isAbsence(r); });
    var sleeps = trained.map(function (r) { return num(r.sleepHours); }).filter(function (n) { return n !== null; });
    var rpes = trained.map(function (r) { return num(r.rpe); }).filter(function (n) { return n !== null; });
    var poorSleep = trained.filter(function (r) { return String(r.sleepQuality || '') === '差'; }).length;
    var highRpe = rpes.filter(function (n) { return n >= 8; }).length;
    var fatigue = trained.filter(function (r) {
      return ['疲勞', '不舒服', '受傷中'].indexOf(String(r.bodyStatus || '')) !== -1 || num(r.soreness) >= 4;
    }).length;

    // 受傷／不適部位統計
    var injuryParts = {};
    var injuredPeople = {};
    trained.forEach(function (r) {
      var area = stripMealTags(r.injuryArea || '');
      if (area && area !== '無' && area !== '沒有' && area !== '無受傷') {
        area.split(/[、,，\/\s]+/).forEach(function (p) {
          p = p.trim(); if (!p) return;
          injuryParts[p] = (injuryParts[p] || 0) + 1;
          (injuredPeople[r.name] = injuredPeople[r.name] || {})[p] = 1;
        });
      }
      if (String(r.bodyStatus || '') === '受傷中') injuredPeople[r.name] = injuredPeople[r.name] || { '受傷中': 1 };
    });
    var injuryList = Object.keys(injuryParts).map(function (p) { return { part: p, count: injuryParts[p] }; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      avgSleep: r1(avg(sleeps)),
      avgRpe: r1(avg(rpes)),
      poorSleepCount: poorSleep,
      highRpeCount: highRpe,
      fatigueCount: fatigue,
      injuryCount: injuryList.reduce(function (s, x) { return s + x.count; }, 0),
      injuryList: injuryList,
      injuredPeople: Object.keys(injuredPeople)
    };
  }

  // 飲食與體重
  function calculateNutritionSummary(records) {
    var trained = records.filter(function (r) { return !isAbsence(r); });
    var n = trained.length || 1;
    var breakfast = 0, mealFull = 0, waterTarget = 0, lateSnack = 0, snackHeavy = 0;
    trained.forEach(function (r) {
      var b = stripMealTags(r.breakfast), l = stripMealTags(r.lunch), d = stripMealTags(r.dinner);
      if (b) breakfast++;
      if (b && l && d) mealFull++;
      var w = String(r.waterIntake || '');
      if (w.indexOf('1000') !== -1 || w.indexOf('1500') !== -1 || w.indexOf('2000') !== -1) waterTarget++;
      if (String(r.lateNightSnack || '').indexOf('有') !== -1) lateSnack++;
      var sd = String(r.snacksDrinks || '');
      if (/含糖|油炸|奶茶|手搖|可樂|汽水|珍奶|餅乾|薯條|雞排|炸/.test(sd)) snackHeavy++;
    });

    // 體重變化（每人本月首末筆比較）+ 距目標
    var byName = {};
    trained.forEach(function (r) { (byName[r.name] = byName[r.name] || []).push(r); });
    var weightChangeList = [], nutritionRiskList = [];
    Object.keys(byName).forEach(function (name) {
      var recs = byName[name].slice().sort(function (a, b) { return nd(a.date) < nd(b.date) ? -1 : 1; });
      var ws = recs.map(function (r) { return { w: num(r.weightKg), t: num(r.targetWeightKg) }; }).filter(function (x) { return x.w !== null; });
      if (!ws.length) return;
      var first = ws[0].w, last = ws[ws.length - 1].w;
      var target = ws[ws.length - 1].t;
      var change = r1(last - first);
      var gap = (target !== null) ? r1(last - target) : null;
      weightChangeList.push({ name: name, from: first, to: last, change: change, target: target, gap: gap });
      if (Math.abs(change || 0) >= 1.5) nutritionRiskList.push({ name: name, reason: '體重變化 ' + (change > 0 ? '+' : '') + change + ' kg' });
    });

    return {
      breakfastRate: pct(breakfast, n),
      mealCompletionRate: pct(mealFull, n),
      waterTargetRate: pct(waterTarget, n),
      lateSnackCount: lateSnack,
      snackHeavyCount: snackHeavy,
      weightChangeList: weightChangeList,
      nutritionRiskList: nutritionRiskList
    };
  }

  /* ============================================================
     三、選手成長樹（六大面向 0–100 分 + 趨勢）
     ============================================================ */

  function branchColor(score) {
    if (score === null || score === undefined) return 'na';
    if (score >= 75) return 'green';
    if (score >= 55) return 'yellow';
    return 'red';
  }
  function trendSym(t) { return t === 'up' ? '↑' : t === 'down' ? '↓' : '→'; }

  // 從一組紀錄算六面向分數（0–100）
  function branchScores(recs, ctx) {
    var trained = recs.filter(function (r) { return !isAbsence(r); });
    function kpi(field) { return avg(trained.map(function (r) { return num(r[field]); })); }
    function pctOf(v) { return v === null ? null : Math.max(0, Math.min(100, v * 20)); }

    // 技術：技術 + 戰術 KPI
    var tech = pctOf(avg([kpi('technicalAvg'), kpi('tacticalAvg')].filter(function (n) { return n !== null; }).length ? [kpi('technicalAvg'), kpi('tacticalAvg')] : [null]));

    // 體能：體能 KPI + 高負荷控制
    var rpes = trained.map(function (r) { return num(r.rpe); }).filter(function (n) { return n !== null; });
    var highRpeRatio = rpes.length ? rpes.filter(function (n) { return n >= 8; }).length / rpes.length : 0;
    var phyKpi = pctOf(kpi('physicalAvg'));
    var physical = phyKpi !== null ? Math.round(phyKpi * 0.7 + (100 - highRpeRatio * 100) * 0.3)
      : (rpes.length ? Math.round(100 - highRpeRatio * 100) : null);

    // 心理：心理 KPI + 心情指數
    var moods = trained.map(function (r) { return num(r.moodIndex); }).filter(function (n) { return n !== null; });
    var focusKpi = pctOf(kpi('focusAvg'));
    var moodPct = moods.length ? avg(moods) * 20 : null;
    var mental = (focusKpi !== null || moodPct !== null)
      ? Math.round(avg([focusKpi, moodPct].filter(function (n) { return n !== null; }))) : null;

    // 態度：態度 KPI + 出席率 + 回報率（由 ctx 帶入該生）
    var discKpi = pctOf(kpi('disciplineAvg'));
    var att = ctx && ctx.attendanceRate != null ? ctx.attendanceRate : null;
    var attitudeParts = [discKpi, att].filter(function (n) { return n !== null; });
    var attitude = attitudeParts.length ? Math.round(avg(attitudeParts)) : null;

    // 飲食：早餐/三餐/水量/宵夜/體重接近目標
    var nut = ctx && ctx.nutrition ? ctx.nutrition : null;
    var nutrition = nut ? Math.round(avg([nut.breakfastRate, nut.mealRate, nut.waterRate, 100 - nut.lateSnackRatio * 100, nut.weightProximity].filter(function (n) { return n !== null; }))) : null;

    // 恢復：恢復指數 + 睡眠 + 痠痛
    var recScores = trained.map(function (r) { return num(r.recoveryScore); }).filter(function (n) { return n !== null; });
    var recovery = null;
    if (recScores.length) recovery = Math.round(avg(recScores));
    else {
      var sleeps = trained.map(function (r) { return num(r.sleepHours); }).filter(function (n) { return n !== null; });
      if (sleeps.length) recovery = Math.round(Math.max(0, Math.min(100, (avg(sleeps) / 8) * 100)));
    }

    return {
      technical: tech === null ? null : Math.round(tech),
      physical: physical,
      mental: mental,
      attitude: attitude,
      nutrition: nutrition,
      recovery: recovery
    };
  }

  // 個別選手飲食 / 出席小結（給成長樹用）
  function athleteNutritionCtx(recs) {
    var trained = recs.filter(function (r) { return !isAbsence(r); });
    if (!trained.length) return null;
    var n = trained.length, bf = 0, full = 0, water = 0, late = 0;
    var wList = [];
    trained.forEach(function (r) {
      var b = stripMealTags(r.breakfast), l = stripMealTags(r.lunch), d = stripMealTags(r.dinner);
      if (b) bf++; if (b && l && d) full++;
      var w = String(r.waterIntake || '');
      if (w.indexOf('1000') !== -1 || w.indexOf('1500') !== -1 || w.indexOf('2000') !== -1) water++;
      if (String(r.lateNightSnack || '').indexOf('有') !== -1) late++;
      var wk = num(r.weightKg), tg = num(r.targetWeightKg);
      if (wk !== null && tg !== null) wList.push(Math.abs(wk - tg));
    });
    var proximity = wList.length ? Math.max(0, 100 - avg(wList) * 15) : null;
    return { breakfastRate: pct(bf, n), mealRate: pct(full, n), waterRate: pct(water, n), lateSnackRatio: late / n, weightProximity: proximity === null ? null : Math.round(proximity) };
  }

  // 趨勢：前半 vs 後半
  function branchTrends(recs, attRate, nutCtx) {
    var trained = recs.filter(function (r) { return !isAbsence(r); }).slice().sort(function (a, b) { return nd(a.date) < nd(b.date) ? -1 : 1; });
    var keys = ['technical', 'physical', 'mental', 'attitude', 'nutrition', 'recovery'];
    var t = {}; keys.forEach(function (k) { t[k] = 'stable'; });
    if (trained.length < 4) return t;
    var mid = Math.floor(trained.length / 2);
    var early = branchScores(trained.slice(0, mid), { attendanceRate: attRate, nutrition: nutCtx });
    var late = branchScores(trained.slice(mid), { attendanceRate: attRate, nutrition: nutCtx });
    keys.forEach(function (k) {
      if (early[k] === null || late[k] === null) { t[k] = 'stable'; return; }
      var d = late[k] - early[k];
      t[k] = d >= 5 ? 'up' : d <= -5 ? 'down' : 'stable';
    });
    return t;
  }

  function calculateAthleteGrowthTree(records, athleteName) {
    var recs = records.filter(function (r) { return String(r.name || '').trim() === String(athleteName).trim(); });
    var trained = recs.filter(function (r) { return !isAbsence(r); });

    // 出席率（該生）
    var present = recs.filter(function (r) { return !isAbsence(r); }).length;
    var attRate = recs.length ? pct(present, recs.length) : null;
    var nutCtx = athleteNutritionCtx(recs);

    var branches = branchScores(recs, { attendanceRate: attRate, nutrition: nutCtx });
    var trend = branchTrends(recs, attRate, nutCtx);
    var vals = Object.keys(branches).map(function (k) { return branches[k]; }).filter(function (n) { return n !== null; });
    var overall = vals.length ? Math.round(avg(vals)) : null;

    // 本月亮點：最高面向；下月焦點：最低面向
    var labelMap = { technical: '技術能力', physical: '體能狀態', mental: '心理穩定', attitude: '訓練態度', nutrition: '飲食管理', recovery: '恢復狀態' };
    var present2 = Object.keys(branches).filter(function (k) { return branches[k] !== null; });
    var best = present2.slice().sort(function (a, b) { return branches[b] - branches[a]; })[0];
    var worst = present2.slice().sort(function (a, b) { return branches[a] - branches[b]; })[0];

    var topic = (trained[trained.length - 1] || {}).trainingTopic || '';
    var highlight = best ? (labelMap[best] + '表現亮眼（' + branches[best] + '%）') : '本月資料較少';
    var nextFocus = worst ? (labelMap[worst] + '仍有成長空間，下月加強') : '維持穩定';
    var observation = trained.length
      ? ('本月共 ' + trained.length + ' 次訓練紀錄' + (topic ? '，近期主題：' + topic : '') + '。')
      : '本月訓練回報較少，建議提醒按時填寫。';

    return {
      athleteName: athleteName,
      overallGrowthScore: overall,
      dataCount: trained.length,
      branches: branches,
      trend: trend,
      monthlyHighlight: highlight,
      coachObservation: observation,
      nextMonthFocus: nextFocus
    };
  }

  function calculateAllAthleteGrowthTrees(records, names) {
    names = names || [];
    var map = {};
    names.forEach(function (n) { map[n] = calculateAthleteGrowthTree(records, n); });
    return map;
  }

  /* ============================================================
     四、紅黃綠燈（選手月狀態）
     ============================================================ */
  function calculateRedYellowGreenStatus(ctx) {
    var names = ctx.names || [];
    var attMap = {}; (ctx.attendance.perAthlete || []).forEach(function (a) { attMap[a.name] = a; });
    var kpiByName = {}; (ctx.monthKpi || []).forEach(function (r) { (kpiByName[r.name] = kpiByName[r.name] || []).push(r); });

    var summary = { green: 0, yellow: 0, red: 0, list: [] };
    names.forEach(function (name) {
      var att = attMap[name] || { attendanceRate: 0, absent: 0, notReported: 0 };
      var recs = (kpiByName[name] || []).filter(function (r) { return !isAbsence(r); });
      var rpes = recs.map(function (r) { return num(r.rpe); }).filter(function (n) { return n !== null; });
      var highRpe = rpes.filter(function (n) { return n >= 8; }).length;
      var injured = recs.some(function (r) { return String(r.bodyStatus || '') === '受傷中'; });
      var poorSleep = recs.filter(function (r) { return String(r.sleepQuality || '') === '差'; }).length;
      var sleeps = recs.map(function (r) { return num(r.sleepHours); }).filter(function (n) { return n !== null; });
      var lowSleep = sleeps.length && avg(sleeps) < 6;
      var tree = (ctx.trees && ctx.trees[name]) || null;
      var weightAbnormal = false, nutWeak = false;
      if (tree && tree.branches.nutrition !== null && tree.branches.nutrition < 55) nutWeak = true;
      (ctx.nutrition.weightChangeList || []).forEach(function (w) { if (w.name === name && Math.abs(w.change || 0) >= 2) weightAbnormal = true; });

      var redFlags = 0, yellowFlags = 0;
      // 紅燈條件
      if (injured) redFlags++;
      if (highRpe >= 3) redFlags++;
      if ((att.absent + att.notReported) >= 3) redFlags++;
      if (weightAbnormal) redFlags++;
      if (att.attendanceRate < 60 && att.days >= 3) redFlags++;
      // 黃燈條件
      if (lowSleep) yellowFlags++;
      if (highRpe >= 1) yellowFlags++;
      if (poorSleep >= 2) yellowFlags++;
      if ((att.absent + att.notReported) >= 1) yellowFlags++;
      if (nutWeak) yellowFlags++;
      if (att.attendanceRate < 80) yellowFlags++;

      var light;
      if (redFlags >= 1) { light = 'red'; summary.red++; }
      else if (yellowFlags >= 1) { light = 'yellow'; summary.yellow++; }
      else { light = 'green'; summary.green++; }

      var reasons = [];
      if (injured) reasons.push('受傷中');
      if (highRpe >= 3) reasons.push('高負荷 ' + highRpe + ' 天');
      else if (highRpe >= 1) reasons.push('RPE 偏高');
      if ((att.absent + att.notReported) >= 1) reasons.push('缺席/未回報 ' + (att.absent + att.notReported) + ' 次');
      if (lowSleep) reasons.push('睡眠不足');
      if (weightAbnormal) reasons.push('體重變化大');
      if (nutWeak) reasons.push('飲食待加強');

      summary.list.push({ name: name, light: light, reasons: reasons, attendanceRate: att.attendanceRate });
    });
    return summary;
  }

  /* ============================================================
     五、教練月度文字摘要
     ============================================================ */
  function generateCoachMonthlySummary(data) {
    var ryg = data.ryg, att = data.attendance, kpi = data.kpi, rec = data.recovery, nut = data.nutrition;
    var highlights = [];
    if (kpi.topImproved && kpi.topImproved.length) highlights.push(kpi.topImproved[0].name + ' KPI 進步 +' + kpi.topImproved[0].delta);
    if (att.teamAttendanceRate >= 85) highlights.push('全隊出席率 ' + att.teamAttendanceRate + '%，出席穩定');
    if (kpi.overallAvg !== null && kpi.overallAvg >= 4) highlights.push('全隊 KPI 平均 ' + kpi.overallAvg + '，整體狀態良好');
    if (!highlights.length) highlights.push('全隊持續累積每日訓練與生活回報資料');

    var cares = [];
    if (ryg.red > 0) cares.push('紅燈 ' + ryg.red + ' 人，需優先關懷');
    if (rec.injuryCount > 0) cares.push('受傷／不適回報 ' + rec.injuryCount + ' 人次');
    if (rec.highRpeCount > 0) cares.push('高負荷（RPE≥8）' + rec.highRpeCount + ' 人次，留意疲勞');
    if (att.absenceList && att.absenceList.length) cares.push('缺席偏多 ' + att.absenceList.length + ' 人需追蹤');
    if (!cares.length) cares.push('本月無明顯高風險，維持現況觀察');

    var actions = [];
    actions.push('依紅黃綠燈分級，紅燈個別晤談、黃燈持續追蹤');
    if (rec.injuryCount > 0) actions.push('受傷選手調整訓練強度並安排恢復');
    if (nut.nutritionRiskList && nut.nutritionRiskList.length) actions.push('體重／飲食異常者個別提醒並通知家長');

    // 心理摘要（僅統計，不揭露原文）
    var careCount = ryg.red + ryg.yellow;
    var psychSummary = '本月已關懷 ' + careCount + ' 人次（紅燈 ' + ryg.red + ' 人、黃燈 ' + ryg.yellow + ' 人），建議持續追蹤 ' + ryg.red + ' 人。';

    return { highlights: highlights, cares: cares, actions: actions, psychSummary: psychSummary };
  }

  /* ============================================================
     六、報表渲染（A4 直式，七頁）
     ============================================================ */
  var TYPE_LABEL = { official: '長官訪視版', coach: '教練內部版', parent: '家長摘要版' };

  function statCard(label, value, sub, tone) {
    return '<div class="mr-stat ' + (tone || '') + '">' +
      '<div class="mr-stat-val">' + value + '</div>' +
      '<div class="mr-stat-label">' + esc(label) + '</div>' +
      (sub ? '<div class="mr-stat-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function pageHead(title, data) {
    return '<div class="mr-page-head"><span class="mr-page-title">' + esc(title) + '</span>' +
      '<span class="mr-page-meta">育林國中技擊隊 ｜ ' + esc(data.monthLabel) + '</span></div>';
  }
  function pageFoot(no) {
    return '<div class="mr-page-foot">本報表僅供校內訓練管理與訪視使用，請勿公開散布。　第 ' + no + ' 頁</div>';
  }

  // 第 1 頁：長官一頁總覽
  function pageOverview(data) {
    var a = data.attendance, k = data.kpi, r = data.recovery, n = data.nutrition, ryg = data.ryg, cs = data.coachSummary;
    var h = '<section class="mr-page">';
    h += '<div class="mr-cover">' +
      '<div class="mr-cover-title">育林國中技擊隊</div>' +
      '<div class="mr-cover-sub">跆拳道・武術 ｜ 每月訓練與生活管理報告</div>' +
      '<div class="mr-cover-month">月份：' + esc(data.monthLabel) + '</div>' +
      '<div class="mr-cover-use">用途：訪視專用（' + esc(TYPE_LABEL[MR.reportType]) + '）</div>' +
      '</div>';
    h += pageHead('一頁總覽', data);
    h += '<div class="mr-grid mr-grid-4">';
    h += statCard('本月訓練天數', NA(data.totalTrainingDays), '天');
    h += statCard('本月選手人數', NA(data.totalAthletes), '人');
    h += statCard('全隊平均出席率', NA(a.teamAttendanceRate), '%', a.teamAttendanceRate >= 85 ? 'green' : a.teamAttendanceRate >= 70 ? 'yellow' : 'red');
    h += statCard('每日回報完成率', NA(a.submissionRate, '%'));
    h += statCard('KPI 平均分數', NA(k.overallAvg) + (k.overallAvg !== null ? ' / 5' : ''), '');
    h += statCard('飲食紀錄完成率', NA(n.mealCompletionRate, '%'));
    h += statCard('水量達標率', NA(n.waterTargetRate, '%'));
    h += statCard('平均睡眠時數', NA(r.avgSleep), '小時');
    h += statCard('平均 RPE', NA(r.avgRpe) + (r.avgRpe !== null ? ' / 10' : ''), '');
    h += statCard('🟢 綠燈', ryg.green, '人', 'green');
    h += statCard('🟡 黃燈', ryg.yellow, '人', 'yellow');
    h += statCard('🔴 紅燈', ryg.red, '人', 'red');
    h += '</div>';

    h += '<div class="mr-two-col">';
    h += '<div class="mr-panel green"><div class="mr-panel-h">🌟 本月亮點</div><ul>' +
      cs.highlights.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="mr-panel red"><div class="mr-panel-h">💛 本月需關懷重點</div><ul>' +
      cs.cares.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '</div>';
    h += '<div class="mr-panel blue"><div class="mr-panel-h">🧑‍🏫 教練處置摘要</div><ul>' +
      cs.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += pageFoot(1) + '</section>';
    return h;
  }

  // 第 2 頁：出席與回報管理
  function pageAttendance(data) {
    var a = data.attendance;
    var h = '<section class="mr-page">' + pageHead('出席與回報管理', data);
    h += '<div class="mr-grid mr-grid-3">';
    h += statCard('已出席（人次）', a.trainedTotal, '', 'green');
    h += statCard('請假（人次）', a.leaveTotal, '', 'yellow');
    h += statCard('缺席（人次）', a.absentTotal, '', 'red');
    h += statCard('未回報（人次）', a.notReportedTotal, '', 'yellow');
    h += statCard('家長確認率', NA(a.parentConfirmRate, '%'));
    h += statCard('補訓完成', a.makeupDone + ' / ' + a.makeupTotal, '');
    h += '</div>';

    // 比例條
    var tot = a.trainedTotal + a.leaveTotal + a.absentTotal + a.notReportedTotal || 1;
    h += '<div class="mr-bar-wrap"><div class="mr-bar">' +
      '<span class="seg green" style="width:' + pct(a.trainedTotal, tot) + '%"></span>' +
      '<span class="seg yellow" style="width:' + pct(a.leaveTotal, tot) + '%"></span>' +
      '<span class="seg orange" style="width:' + pct(a.notReportedTotal, tot) + '%"></span>' +
      '<span class="seg red" style="width:' + pct(a.absentTotal, tot) + '%"></span></div>' +
      '<div class="mr-bar-legend"><span><i class="green"></i>出席 ' + pct(a.trainedTotal, tot) + '%</span>' +
      '<span><i class="yellow"></i>請假 ' + pct(a.leaveTotal, tot) + '%</span>' +
      '<span><i class="orange"></i>未回報 ' + pct(a.notReportedTotal, tot) + '%</span>' +
      '<span><i class="red"></i>缺席 ' + pct(a.absentTotal, tot) + '%</span></div></div>';

    h += '<table class="mr-table"><thead><tr><th>選手</th><th>出席率</th><th>出席</th><th>請假</th><th>缺席</th><th>未回報</th><th>補訓</th><th>家長確認</th></tr></thead><tbody>';
    a.perAthlete.forEach(function (x) {
      var tone = x.attendanceRate >= 85 ? 'cell-green' : x.attendanceRate >= 70 ? 'cell-yellow' : 'cell-red';
      h += '<tr><td>' + esc(x.name) + '</td><td class="' + tone + '">' + x.attendanceRate + '%</td><td>' + x.trained + '</td><td>' + x.leave + '</td><td>' + x.absent + '</td><td>' + x.notReported + '</td><td>' + x.makeupDone + '/' + x.makeupTotal + '</td><td>' + x.parentConfirmRate + '%</td></tr>';
    });
    h += '</tbody></table>';

    if (a.absenceList.length) {
      h += '<div class="mr-panel red"><div class="mr-panel-h">⚠️ 缺席偏多名單（缺席＋未回報 ≥ 2 次）</div><ul>' +
        a.absenceList.map(function (x) { return '<li>' + esc(x.name) + '：缺席 ' + x.absent + ' 次、未回報 ' + x.notReported + ' 次（出席率 ' + x.attendanceRate + '%）</li>'; }).join('') + '</ul></div>';
    }
    h += pageFoot(2) + '</section>';
    return h;
  }

  // 第 3 頁：訓練課表與 KPI 成長
  function pageKpi(data) {
    var k = data.kpi;
    var h = '<section class="mr-page">' + pageHead('訓練課表與 KPI 成長', data);

    h += '<div class="mr-sec-h">📚 本月訓練主題分類</div>';
    if (k.topicCats.length) {
      var maxC = Math.max.apply(null, k.topicCats.map(function (t) { return t.count; }));
      h += '<div class="mr-topic-list">';
      k.topicCats.forEach(function (t) {
        h += '<div class="mr-topic"><span class="mr-topic-name">' + esc(t.cat) + '</span>' +
          '<span class="mr-topic-bar"><i style="width:' + pct(t.count, maxC) + '%"></i></span>' +
          '<span class="mr-topic-num">' + t.count + ' 次</span></div>';
      });
      h += '</div>';
    } else { h += '<div class="mr-empty">本月尚無訓練主題紀錄</div>'; }

    h += '<div class="mr-sec-h">📈 KPI 六面向平均</div>';
    h += '<div class="mr-grid mr-grid-3">';
    k.order.forEach(function (key) {
      var v = k.aspectAvg[key];
      var tone = v === null ? '' : v >= 4 ? 'green' : v >= 3 ? 'yellow' : 'red';
      h += statCard(aspectLabel(key), NA(v) + (v !== null ? ' / 5' : ''), '', tone);
    });
    h += '</div>';

    h += '<div class="mr-sec-h">🚀 本月進步最多選手</div>';
    if (k.topImproved.length) {
      h += '<table class="mr-table"><thead><tr><th>名次</th><th>選手</th><th>月初平均</th><th>月末平均</th><th>進步</th></tr></thead><tbody>';
      k.topImproved.slice(0, 6).forEach(function (x, i) {
        h += '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + NA(x.from) + '</td><td>' + NA(x.to) + '</td><td class="cell-green">+' + x.delta + '</td></tr>';
      });
      h += '</tbody></table>';
    } else { h += '<div class="mr-empty">本月資料不足，無法計算進步幅度（需至少 2 筆紀錄）</div>'; }

    // 每週 KPI 回報（教練手動開啟的 session，列入月報者）
    var wks = data.weeklyKpiSessions || [];
    if (wks.length) {
      var ASP = [
        { k: 'technicalScore', l: '技術' }, { k: 'tacticalScore', l: '戰術' }, { k: 'physicalScore', l: '體能' },
        { k: 'mentalScore', l: '心理' }, { k: 'attitudeScore', l: '態度' }, { k: 'recoveryScore', l: '恢復' }
      ];
      h += '<div class="mr-sec-h">🗓️ 本月每週 KPI 回報</div>';
      h += '<table class="mr-table"><thead><tr><th>回報</th><th>完成率</th><th>平均</th>';
      ASP.forEach(function (a) { h += '<th>' + a.l + '</th>'; });
      h += '<th>🟢🟡🔴</th></tr></thead><tbody>';
      wks.forEach(function (s) {
        h += '<tr><td>' + esc(s.sessionName || '') + '</td>' +
          '<td>' + NA(s.completionRate, '%') + '（' + s.doneCount + '/' + s.total + '）</td>' +
          '<td>' + NA(s.avgScore) + '</td>';
        ASP.forEach(function (a) { h += '<td>' + NA(s.aspects ? s.aspects[a.k] : null) + '</td>'; });
        h += '<td>' + (s.green || 0) + '/' + (s.yellow || 0) + '/' + (s.red || 0) + '</td></tr>';
      });
      h += '</tbody></table>';
    }

    h += pageFoot(3) + '</section>';
    return h;
  }

  // 第 4 頁：身體狀態、疲勞與受傷
  function pageRecovery(data) {
    var r = data.recovery, ryg = data.ryg;
    var h = '<section class="mr-page">' + pageHead('身體狀態、疲勞與受傷管理', data);
    h += '<div class="mr-grid mr-grid-3">';
    h += statCard('平均睡眠時數', NA(r.avgSleep), '小時', r.avgSleep !== null && r.avgSleep < 6 ? 'red' : '');
    h += statCard('睡眠品質差', r.poorSleepCount, '人次', r.poorSleepCount > 0 ? 'yellow' : '');
    h += statCard('平均 RPE', NA(r.avgRpe) + (r.avgRpe !== null ? ' / 10' : ''), '');
    h += statCard('高負荷（RPE≥8）', r.highRpeCount, '天', r.highRpeCount > 0 ? 'red' : '');
    h += statCard('疲勞回報', r.fatigueCount, '人次', r.fatigueCount > 0 ? 'yellow' : '');
    h += statCard('受傷／不適', r.injuryCount, '人次', r.injuryCount > 0 ? 'red' : '');
    h += '</div>';

    h += '<div class="mr-sec-h">🩹 受傷／不適部位統計</div>';
    if (r.injuryList.length) {
      h += '<div class="mr-chip-row">' + r.injuryList.map(function (x) { return '<span class="mr-chip red">' + esc(x.part) + ' × ' + x.count + '</span>'; }).join('') + '</div>';
    } else { h += '<div class="mr-empty">本月無受傷／不適回報 👍</div>'; }

    // 連續警示 / 建議晤談（紅燈名單）
    var redList = ryg.list.filter(function (x) { return x.light === 'red'; });
    var yellowList = ryg.list.filter(function (x) { return x.light === 'yellow'; });
    h += '<div class="mr-two-col">';
    h += '<div class="mr-panel red"><div class="mr-panel-h">🚨 連續警示／建議晤談名單</div>' +
      (redList.length ? '<ul>' + redList.map(function (x) { return '<li>' + esc(x.name) + '：' + esc(x.reasons.join('、') || '需關懷') + '</li>'; }).join('') + '</ul>' : '<div class="mr-empty sm">本月無紅燈選手</div>') + '</div>';
    h += '<div class="mr-panel yellow"><div class="mr-panel-h">👀 持續追蹤名單</div>' +
      (yellowList.length ? '<ul>' + yellowList.slice(0, 12).map(function (x) { return '<li>' + esc(x.name) + '：' + esc(x.reasons.join('、') || '留意') + '</li>'; }).join('') + '</ul>' : '<div class="mr-empty sm">本月無黃燈選手</div>') + '</div>';
    h += '</div>';

    h += '<div class="mr-panel blue"><div class="mr-panel-h">🧑‍🏫 教練處置紀錄</div><ul>' +
      data.coachSummary.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += pageFoot(4) + '</section>';
    return h;
  }

  // 第 5 頁：飲食與體重管理
  function pageNutrition(data) {
    var n = data.nutrition;
    var h = '<section class="mr-page">' + pageHead('飲食與體重管理', data);
    h += '<div class="mr-grid mr-grid-3">';
    h += statCard('早餐完成率', NA(n.breakfastRate, '%'), '', n.breakfastRate >= 80 ? 'green' : n.breakfastRate >= 60 ? 'yellow' : 'red');
    h += statCard('三餐紀錄完整率', NA(n.mealCompletionRate, '%'));
    h += statCard('水量達標率', NA(n.waterTargetRate, '%'), '', n.waterTargetRate >= 70 ? 'green' : 'yellow');
    h += statCard('宵夜次數', n.lateSnackCount, '人次', n.lateSnackCount > 0 ? 'yellow' : '');
    h += statCard('點心／飲料偏多', n.snackHeavyCount, '人次', n.snackHeavyCount > 0 ? 'yellow' : '');
    h += statCard('體重風險提醒', n.nutritionRiskList.length, '人', n.nutritionRiskList.length > 0 ? 'red' : 'green');
    h += '</div>';

    h += '<div class="mr-sec-h">⚖️ 體重變化與距目標</div>';
    if (n.weightChangeList.length) {
      h += '<table class="mr-table"><thead><tr><th>選手</th><th>月初</th><th>月末</th><th>變化</th><th>目標</th><th>距目標</th></tr></thead><tbody>';
      n.weightChangeList.forEach(function (x) {
        var ctone = Math.abs(x.change || 0) >= 1.5 ? 'cell-red' : '';
        h += '<tr><td>' + esc(x.name) + '</td><td>' + NA(x.from) + '</td><td>' + NA(x.to) + '</td>' +
          '<td class="' + ctone + '">' + (x.change > 0 ? '+' : '') + NA(x.change) + ' kg</td>' +
          '<td>' + NA(x.target) + '</td><td>' + (x.gap === null ? '—' : (x.gap > 0 ? '還有 ' + x.gap + ' kg' : x.gap < 0 ? '低於 ' + Math.abs(x.gap) + ' kg' : '已達標')) + '</td></tr>';
      });
      h += '</tbody></table>';
    } else { h += '<div class="mr-empty">本月無足夠體重紀錄</div>'; }

    h += '<div class="mr-two-col">';
    h += '<div class="mr-panel red"><div class="mr-panel-h">⚠️ 飲食風險提醒</div>' +
      (n.nutritionRiskList.length ? '<ul>' + n.nutritionRiskList.map(function (x) { return '<li>' + esc(x.name) + '：' + esc(x.reason) + '</li>'; }).join('') + '</ul>' : '<div class="mr-empty sm">本月無明顯飲食風險</div>') + '</div>';
    var nutAdvice = [];
    if (n.breakfastRate < 80) nutAdvice.push('提升早餐落實率，確保訓練日有早餐');
    if (n.waterTargetRate < 70) nutAdvice.push('加強每日 1500ml 以上水分補充');
    if (n.lateSnackCount > 0) nutAdvice.push('減少宵夜，注意睡前飲食');
    if (!nutAdvice.length) nutAdvice.push('全隊飲食習慣穩定，維持現況');
    h += '<div class="mr-panel blue"><div class="mr-panel-h">🍱 教練飲食建議摘要</div><ul>' +
      nutAdvice.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '</div>';
    h += pageFoot(5) + '</section>';
    return h;
  }

  /* ----- 成長樹元件（卡片式分支圖） ----- */
  function renderGrowthTreeChart(tree) {
    if (!tree) return '';
    var labelMap = { technical: '技術能力', physical: '體能狀態', mental: '心理穩定', attitude: '訓練態度', nutrition: '飲食管理', recovery: '恢復狀態' };
    var order = ['technical', 'physical', 'mental', 'attitude', 'nutrition', 'recovery'];
    var overallTone = branchColor(tree.overallGrowthScore);
    var h = '<div class="mr-tree">';
    h += '<div class="mr-tree-head"><span class="mr-tree-name">🌳 ' + esc(tree.athleteName) + '</span>' +
      '<span class="mr-tree-overall tone-' + overallTone + '">綜合成長 ' + NA(tree.overallGrowthScore, tree.overallGrowthScore !== null ? '%' : '') + '</span></div>';
    h += '<div class="mr-tree-branches">';
    order.forEach(function (k) {
      var v = tree.branches[k];
      var tone = branchColor(v);
      var tr = tree.trend[k];
      h += '<div class="mr-branch">' +
        '<span class="mr-branch-label">' + esc(labelMap[k]) + '</span>' +
        '<span class="mr-branch-track"><i class="tone-' + tone + '" style="width:' + (v === null ? 0 : v) + '%"></i></span>' +
        '<span class="mr-branch-val tone-' + tone + '">' + (v === null ? '—' : v + '%') + ' <em class="tr-' + tr + '">' + trendSym(tr) + '</em></span>' +
        '</div>';
    });
    h += '</div>';
    h += '<div class="mr-tree-foot"><span>🌟 ' + esc(tree.monthlyHighlight) + '</span><span>🎯 ' + esc(tree.nextMonthFocus) + '</span></div>';
    return h + '</div>';
  }

  // 第 6 頁：個別選手重點摘要 + 成長樹
  function pageGrowth(data) {
    var ryg = data.ryg, trees = data.trees, k = data.kpi;
    var h = '<section class="mr-page">' + pageHead('個別選手重點摘要', data);

    // 心理隱私摘要
    h += '<div class="mr-privacy">🔒 心理狀態（僅統計摘要，不揭露任何學生心理文字或解憂信箱內容）：' + esc(data.coachSummary.psychSummary) + '</div>';

    // 重點名單表
    var improvedNames = (k.topImproved || []).slice(0, 5).map(function (x) { return x.name; });
    function classify(name) {
      var item = ryg.list.find(function (x) { return x.name === name; });
      var cats = [];
      if (improvedNames.indexOf(name) !== -1) cats.push('進步明顯');
      if (item && item.light === 'red') cats.push('需關懷');
      if (item && item.reasons.some(function (r) { return r.indexOf('飲食') !== -1 || r.indexOf('體重') !== -1; })) cats.push('飲食需提醒');
      if (item && item.reasons.some(function (r) { return r.indexOf('缺席') !== -1 || r.indexOf('回報') !== -1; })) cats.push('缺席需追蹤');
      if (item && item.reasons.some(function (r) { return r.indexOf('受傷') !== -1 || r.indexOf('負荷') !== -1 || r.indexOf('疲勞') !== -1 || r.indexOf('睡眠') !== -1; })) cats.push('疲勞/受傷注意');
      return cats;
    }
    var focusRows = [];
    data.names.forEach(function (name) {
      var cats = classify(name);
      if (!cats.length) return;
      var item = ryg.list.find(function (x) { return x.name === name; }) || { reasons: [] };
      var tree = trees[name] || {};
      focusRows.push({
        name: name, cat: cats.join('、'),
        status: item.reasons.join('、') || (tree.monthlyHighlight || '—'),
        action: item.light === 'red' ? '已關懷／建議晤談' : item.light === 'yellow' ? '持續追蹤' : '維持鼓勵',
        next: tree.nextMonthFocus || '—'
      });
    });
    h += '<div class="mr-sec-h">📌 重點名單</div>';
    if (focusRows.length) {
      h += '<table class="mr-table"><thead><tr><th>選手</th><th>類別</th><th>本月狀況</th><th>教練處置</th><th>下月追蹤</th></tr></thead><tbody>';
      focusRows.forEach(function (x) {
        h += '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.cat) + '</td><td>' + esc(x.status) + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.next) + '</td></tr>';
      });
      h += '</tbody></table>';
    } else { h += '<div class="mr-empty">本月全隊狀態穩定，無特別需追蹤名單 👍</div>'; }

    // 成長樹區塊
    h += renderGrowthTreeSection(data);
    h += pageFoot(6) + '</section>';
    return h;
  }

  // 成長樹區塊（依報表類型決定顯示哪些選手）
  function renderGrowthTreeSection(data) {
    var trees = data.trees, ryg = data.ryg, k = data.kpi;
    var selected = [];
    if (MR.reportType === 'coach') {
      selected = data.names.slice();
    } else if (MR.reportType === 'parent') {
      selected = MR.parentChild ? [MR.parentChild] : data.names.slice(0, 1);
    } else {
      // 長官版：3–6 位代表選手
      var picks = {};
      if (k.topImproved && k.topImproved[0]) picks[k.topImproved[0].name] = '本月進步最多';
      var stable = ryg.list.filter(function (x) { return x.light === 'green'; })
        .map(function (x) { return trees[x.name]; }).filter(Boolean)
        .sort(function (a, b) { return (b.overallGrowthScore || 0) - (a.overallGrowthScore || 0); })[0];
      if (stable) picks[stable.athleteName] = '本月最穩定';
      var care = ryg.list.filter(function (x) { return x.light === 'red'; })[0];
      if (care) picks[care.name] = '本月需關懷';
      var rep = data.names.map(function (n) { return trees[n]; }).filter(Boolean)
        .sort(function (a, b) { return (b.overallGrowthScore || 0) - (a.overallGrowthScore || 0); })[0];
      if (rep) picks[rep.athleteName] = '代表性選手';
      selected = Object.keys(picks);
    }
    selected = selected.filter(function (n, i, arr) { return arr.indexOf(n) === i; });

    var h = '<div class="mr-sec-h">🌳 選手成長樹狀圖' +
      (MR.reportType === 'coach' ? '（全隊）' : MR.reportType === 'parent' ? '（限本人）' : '（重點選手）') + '</div>';
    if (!selected.length) return h + '<div class="mr-empty">本月資料不足，無法產生成長樹</div>';
    h += '<div class="mr-tree-grid">';
    selected.forEach(function (name) {
      var tree = trees[name] || calculateAthleteGrowthTree(data.monthKpi, name);
      h += renderGrowthTreeChart(tree);
    });
    return h + '</div>';
  }

  // 第 7 頁：本月總結與下月計畫
  function pageSummary(data) {
    var cs = data.coachSummary, k = data.kpi, a = data.attendance;
    var h = '<section class="mr-page">' + pageHead('本月總結與下月計畫', data);

    h += '<div class="mr-panel green"><div class="mr-panel-h">✅ 本月訓練成果</div><ul>' +
      cs.highlights.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
      '<li>本月訓練 ' + data.totalTrainingDays + ' 天，全隊出席率 ' + a.teamAttendanceRate + '%，KPI 平均 ' + NA(k.overallAvg) + ' / 5</li></ul></div>';

    h += '<div class="mr-panel red"><div class="mr-panel-h">🔍 發現問題</div><ul>' +
      cs.cares.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    h += '<div class="mr-panel blue"><div class="mr-panel-h">🛠️ 已採取措施</div><ul>' +
      cs.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    var nextFocus = [];
    if (data.ryg.red > 0) nextFocus.push('紅燈選手個別計畫與家長協力');
    var lowAspect = k.order.filter(function (key) { return k.aspectAvg[key] !== null; })
      .sort(function (x, y) { return k.aspectAvg[x] - k.aspectAvg[y]; })[0];
    if (lowAspect) nextFocus.push('加強「' + aspectLabel(lowAspect) + '」面向（本月平均 ' + k.aspectAvg[lowAspect] + '）');
    nextFocus.push('維持每日回報習慣，提升回報完成率至 90% 以上');
    h += '<div class="mr-panel"><div class="mr-panel-h">🎯 下月訓練重點</div><ul>' +
      nextFocus.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    h += '<div class="mr-panel"><div class="mr-panel-h">🏫 需行政協助事項</div><ul>' +
      '<li>訓練場地與器材維護支援</li><li>受傷選手就醫與保險協助</li><li>比賽報名與交通經費協調</li></ul></div>';

    h += '<div class="mr-sign"><div class="mr-sign-box"><div class="mr-sign-label">教練簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">日期：____ 年 ____ 月 ____ 日</div></div>' +
      '<div class="mr-sign-box"><div class="mr-sign-label">訪視人員簽核</div><div class="mr-sign-line"></div><div class="mr-sign-date">日期：____ 年 ____ 月 ____ 日</div></div></div>';
    h += pageFoot(7) + '</section>';
    return h;
  }

  function buildEmptyHtml(month) {
    return '<div class="mr-report"><section class="mr-page"><div class="mr-empty big">📭 本月資料不足，請確認 Google Sheet 是否有當月（' +
      esc((month || thisMonthStr()).replace('-', ' 年 ') + ' 月') + '）回報資料。</div></section></div>';
  }

  // 整份報表 HTML
  function buildReportHtml(data) {
    if (!data || data.empty) return buildEmptyHtml(data && data.month);
    var pages = [pageOverview(data), pageAttendance(data), pageKpi(data), pageRecovery(data), pageNutrition(data), pageGrowth(data), pageSummary(data)];
    if (MR.reportType === 'parent') {
      // 家長版：僅本人，隱藏全隊出席表 / 名單表（成長樹頁已限本人）
      pages = [pageOverviewParent(data), pageGrowth(data), pageSummary(data)];
    }
    return '<div class="mr-report mr-type-' + MR.reportType + '">' + pages.join('') + '</div>';
  }

  // 家長版第 1 頁（不揭露其他選手資料）
  function pageOverviewParent(data) {
    var child = MR.parentChild || data.names[0];
    var tree = data.trees[child] || calculateAthleteGrowthTree(data.monthKpi, child);
    var att = data.attendance.perAthlete.find(function (x) { return x.name === child; }) || { attendanceRate: 0, trained: 0, leave: 0, absent: 0 };
    var h = '<section class="mr-page">';
    h += '<div class="mr-cover"><div class="mr-cover-title">育林國中技擊隊</div>' +
      '<div class="mr-cover-sub">跆拳道・武術 ｜ 每月訓練與生活管理報告（家長版）</div>' +
      '<div class="mr-cover-month">月份：' + esc(data.monthLabel) + '　選手：' + esc(child) + '</div></div>';
    h += pageHead('孩子本月摘要', data);
    h += '<div class="mr-grid mr-grid-3">';
    h += statCard('本月出席率', NA(att.attendanceRate, '%'), '', att.attendanceRate >= 85 ? 'green' : 'yellow');
    h += statCard('出席次數', att.trained, '次');
    h += statCard('請假', att.leave, '次');
    h += statCard('綜合成長', NA(tree.overallGrowthScore, tree.overallGrowthScore !== null ? '%' : ''), '');
    h += '</div>';
    h += '<div class="mr-privacy">本報表僅顯示您孩子的資料，不含其他選手資訊。心理狀態僅作關懷，不揭露文字內容。</div>';
    h += pageFoot(1) + '</section>';
    return h;
  }

  /* ============================================================
     七、UI 控制：預覽 / 下載 PDF / 列印
     ============================================================ */
  function renderMonthlyReportPreview(reportData) {
    var box = el('monthlyReportPreview');
    if (!box) return;
    box.innerHTML = buildReportHtml(reportData);
    box.style.display = 'block';
    var hasData = reportData && !reportData.empty;
    el('downloadMonthlyPdfBtn').disabled = !hasData;
    el('printMonthlyReportBtn').disabled = !hasData;
  }

  function selectedMonth() {
    var inp = el('monthlyReportMonth');
    return (inp && inp.value) ? inp.value : thisMonthStr();
  }

  async function onGenerate() {
    var btn = el('generateMonthlyReportBtn');
    MR.reportType = (el('monthlyReportType') || {}).value || 'official';
    MR.parentChild = (el('monthlyReportChild') || {}).value || '';
    if (typeof toast === 'function') toast('產生報表中...');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 產生中...'; }
    try {
      var data = await generateMonthlyReportData(selectedMonth());
      MR.lastReportData = data;
      renderMonthlyReportPreview(data);
      if (typeof toast === 'function') toast(data && data.empty ? '本月查無資料' : '✅ 報表已產生');
    } catch (e) {
      console.error(e);
      var box = el('monthlyReportPreview');
      if (box) { box.style.display = 'block'; box.innerHTML = buildEmptyHtml(selectedMonth()); }
      if (typeof toast === 'function') toast('產生失敗，請檢查連線');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📄 產生本月訪視報表'; }
    }
  }

  function fileBase() {
    var m = (MR.lastReportData && MR.lastReportData.month) || selectedMonth();
    return '育林國中技擊隊_每月訪視報表_' + m + '_' + (TYPE_LABEL[MR.reportType] || '');
  }

  async function downloadMonthlyReportPdf() {
    var data = MR.lastReportData;
    if (!data || data.empty) { if (typeof toast === 'function') toast('請先產生報表'); return; }
    var box = el('monthlyReportPreview');
    if (!box) return;
    if (typeof window.html2pdf === 'undefined') {
      if (typeof toast === 'function') toast('PDF 元件載入中，請改用「列印報表」存成 PDF');
      printMonthlyReport();
      return;
    }
    if (typeof toast === 'function') toast('產生 PDF 中，請稍候...');
    var opt = {
      margin: [6, 6, 6, 6],
      filename: fileBase() + '.pdf',
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], before: '.mr-page' }
    };
    try {
      await window.html2pdf().set(opt).from(box.querySelector('.mr-report') || box).save();
      if (typeof toast === 'function') toast('✅ PDF 已下載');
    } catch (e) {
      console.error(e);
      if (typeof toast === 'function') toast('PDF 產生失敗，改用列印');
      printMonthlyReport();
    }
  }

  // 列印 / 匯出列印版：開新視窗，僅含報表 + 報表樣式（不干擾主頁列印）
  function printMonthlyReport() {
    var data = MR.lastReportData;
    if (!data || data.empty) { if (typeof toast === 'function') toast('請先產生報表'); return; }
    var box = el('monthlyReportPreview');
    if (!box) return;
    var win = window.open('', '_blank');
    if (!win) { if (typeof toast === 'function') toast('請允許彈出視窗以列印'); return; }
    win.document.write(
      '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8" />' +
      '<title>' + esc(fileBase()) + '</title>' +
      '<link rel="stylesheet" href="monthly-report.css?v=20260620a" />' +
      '<style>body{margin:0;background:#fff;} .mr-report{box-shadow:none;}</style>' +
      '</head><body class="mr-print-window">' + (box.innerHTML) +
      '<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>' +
      '</body></html>'
    );
    win.document.close();
  }

  /* ---------- 報表類型切換：家長版顯示孩子選擇 ---------- */
  function refreshChildSelect() {
    var sel = el('monthlyReportChild');
    if (!sel) return;
    var names = roster();
    sel.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
  }
  function onTypeChange() {
    var type = (el('monthlyReportType') || {}).value;
    var wrap = el('monthlyReportChildWrap');
    if (type === 'parent') refreshChildSelect(); // 取最新名單
    if (wrap) wrap.style.display = (type === 'parent') ? 'block' : 'none';
  }

  /* ============================================================
     初始化
     ============================================================ */
  function initMonthlyReportModule() {
    if (!el('generateMonthlyReportBtn')) return; // HTML 區塊不存在則略過
    // 預設月份 = 本月
    var monthInput = el('monthlyReportMonth');
    if (monthInput && !monthInput.value) monthInput.value = thisMonthStr();
    refreshChildSelect();
    onTypeChange();

    el('generateMonthlyReportBtn').addEventListener('click', onGenerate);
    el('downloadMonthlyPdfBtn').addEventListener('click', downloadMonthlyReportPdf);
    el('printMonthlyReportBtn').addEventListener('click', printMonthlyReport);
    var typeSel = el('monthlyReportType');
    if (typeSel) typeSel.addEventListener('change', onTypeChange);
    var exportBtn = el('exportMonthlyPrintBtn');
    if (exportBtn) exportBtn.addEventListener('click', printMonthlyReport);
  }

  // 對外暴露（符合需求函式名，可供測試／除錯）
  window.MonthlyReport = {
    init: initMonthlyReportModule,
    generateMonthlyReportData: generateMonthlyReportData,
    renderMonthlyReportPreview: renderMonthlyReportPreview,
    calculateAttendanceSummary: calculateAttendanceSummary,
    calculateKpiSummary: calculateKpiSummary,
    calculateRecoverySummary: calculateRecoverySummary,
    calculateNutritionSummary: calculateNutritionSummary,
    calculateRedYellowGreenStatus: calculateRedYellowGreenStatus,
    generateCoachMonthlySummary: generateCoachMonthlySummary,
    calculateAthleteGrowthTree: calculateAthleteGrowthTree,
    calculateAllAthleteGrowthTrees: calculateAllAthleteGrowthTrees,
    renderGrowthTreeChart: renderGrowthTreeChart,
    renderGrowthTreeSection: renderGrowthTreeSection,
    downloadMonthlyReportPdf: downloadMonthlyReportPdf,
    printMonthlyReport: printMonthlyReport
  };

  // 模組在 DOM 完成後初始化（與 app.js 的 init 互不干擾）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMonthlyReportModule);
  } else {
    initMonthlyReportModule();
  }
})();
