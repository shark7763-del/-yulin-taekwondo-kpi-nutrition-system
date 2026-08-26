/* KPI 評分、紅黃綠燈、疲勞恢復指數、疼痛分級 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadPureFunctions, loadScripts } = require('../harness');

const scoring = loadPureFunctions('js/03-forms-scoring.js', [
  'judgeStatus', 'computeRecovery', 'escapeHtml'
]);
const core = loadScripts(['js/01-config-data.js', 'js/02-core-utils.js']);

describe('judgeStatus — KPI 平均分燈號（1–5 分制）', () => {
  test('≥4.0 綠燈', () => {
    assert.match(scoring.judgeStatus(4.0), /綠燈/);
    assert.match(scoring.judgeStatus(5), /綠燈/);
  });

  test('3.0–3.99 黃燈', () => {
    assert.match(scoring.judgeStatus(3.0), /黃燈/);
    assert.match(scoring.judgeStatus(3.99), /黃燈/);
  });

  test('<3.0 紅燈', () => {
    assert.match(scoring.judgeStatus(2.99), /紅燈/);
    assert.match(scoring.judgeStatus(1), /紅燈/);
  });

  test('邊界值不會落在兩個燈號之間', () => {
    for (const v of [2.999, 3.0, 3.999, 4.0]) {
      assert.match(scoring.judgeStatus(v), /(綠|黃|紅)燈/, `${v} 應有明確燈號`);
    }
  });
});

describe('computeRecovery — 100 分起扣的疲勞恢復指數', () => {
  test('完全健康的一天維持 100 分', () => {
    const r = scoring.computeRecovery({
      sleepHours: 8, sleepQuality: '好', rpe: 5, soreness: 1, bodyStatus: '正常', painScore: 0
    });
    assert.strictEqual(r.score, 100);
    assert.strictEqual(r.state, '恢復良好');
  });

  test('睡眠不足扣 25', () => {
    const r = scoring.computeRecovery({ sleepHours: 5, rpe: 5, soreness: 1, painScore: 0, bodyStatus: '正常' });
    assert.strictEqual(r.score, 75);
  });

  test('高疼痛扣 30，中疼痛扣 15', () => {
    const high = scoring.computeRecovery({ sleepHours: 8, rpe: 5, soreness: 1, painScore: 7, bodyStatus: '正常' });
    const mid = scoring.computeRecovery({ sleepHours: 8, rpe: 5, soreness: 1, painScore: 4, bodyStatus: '正常' });
    assert.strictEqual(high.score, 70);
    assert.strictEqual(mid.score, 85);
  });

  test('受傷中扣 40', () => {
    const r = scoring.computeRecovery({ sleepHours: 8, rpe: 5, soreness: 1, painScore: 0, bodyStatus: '受傷中' });
    assert.strictEqual(r.score, 60);
  });

  test('多重負面因子疊加不會低於 0', () => {
    const r = scoring.computeRecovery({
      sleepHours: 3, sleepQuality: '差', rpe: 10, soreness: 8, painScore: 10, bodyStatus: '受傷中'
    });
    assert.ok(r.score >= 0, '分數不得為負');
    assert.strictEqual(r.score, 0);
    assert.strictEqual(r.state, '建議教練關懷');
  });

  test('缺欄位（舊資料）不會產生 NaN', () => {
    const r = scoring.computeRecovery({});
    assert.ok(Number.isFinite(r.score), `score 應為數字，實得 ${r.score}`);
    assert.strictEqual(r.score, 100);
  });

  test('字串型數值（表單 value 都是字串）也要正確處理', () => {
    const r = scoring.computeRecovery({ sleepHours: '5', rpe: '9', soreness: '4', painScore: '0', bodyStatus: '正常' });
    assert.strictEqual(r.score, 100 - 25 - 20 - 20);
  });

  test('五級恢復狀態的邊界', () => {
    const at = (score) => {
      // 用 painScore 反推不方便，直接驗分級函式的邊界語意
      return score >= 80 ? '恢復良好' : score >= 60 ? '可正常訓練' : score >= 40 ? '注意疲勞' : score >= 20 ? '建議降低強度' : '建議教練關懷';
    };
    assert.strictEqual(scoring.computeRecovery({ sleepHours: 8, painScore: 0, bodyStatus: '正常' }).state, at(100));
    assert.strictEqual(scoring.computeRecovery({ sleepHours: 8, painScore: 0, bodyStatus: '受傷中' }).state, at(60));
  });
});

describe('painGrade — 疼痛 0–10 分級', () => {
  test('五段分級邊界', () => {
    assert.strictEqual(core.painGrade(0).label, '完全不痛');
    assert.strictEqual(core.painGrade(1).label, '輕度疼痛');
    assert.strictEqual(core.painGrade(3).label, '輕度疼痛');
    assert.strictEqual(core.painGrade(4).label, '中度疼痛');
    assert.strictEqual(core.painGrade(6).label, '中度疼痛');
    assert.strictEqual(core.painGrade(7).label, '重度疼痛');
    assert.strictEqual(core.painGrade(9).label, '重度疼痛');
    assert.strictEqual(core.painGrade(10).label, '痛到極限');
  });
});
