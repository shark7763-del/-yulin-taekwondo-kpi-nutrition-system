/* 日期與睡眠時數 — 使用者全在台灣，所有日期語意都必須是 Asia/Taipei */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadScripts } = require('../harness');

const ctx = loadScripts(['js/01-config-data.js', 'js/02-core-utils.js']);
const { todayStr, normDate, dateSlash, computeSleepHours, sleepVerdict } = ctx;

describe('normDate — 把各種來源的日期正規化成 yyyy-mm-dd', () => {
  test('已是 yyyy-mm-dd 原樣回傳', () => {
    assert.strictEqual(normDate('2026-06-03'), '2026-06-03');
  });

  test('yyyy/mm/dd 轉成連字號', () => {
    assert.strictEqual(normDate('2026/06/03'), '2026-06-03');
    assert.strictEqual(normDate('2026/06/03 08:30:00'), '2026-06-03');
  });

  test('空值回傳空字串，不回傳 undefined/NaN', () => {
    assert.strictEqual(normDate(''), '');
    assert.strictEqual(normDate(null), '');
    assert.strictEqual(normDate(undefined), '');
  });

  test('Google Sheet 回傳的 ISO 字串，在台灣時區還原成正確日期', () => {
    // Sheet 的純日期儲存格 2026-06-03 序列化後是 2026-06-02T16:00:00Z（UTC+8）
    process.env.TZ = 'Asia/Taipei';
    assert.strictEqual(normDate('2026-06-02T16:00:00.000Z'), '2026-06-03');
  });

  // 迴歸防護（稽核 LEAD-01）：normDate 曾經用 Date 的本地方法取年月日，
  // 也就是跟著「執行裝置的時區」跑。教練出國、家長手機時區設錯、或任何非
  // +08:00 的環境，整份報表會整批差一天。現在固定用 +08:00 還原。
  for (const tz of ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']) {
    test(`裝置時區為 ${tz} 時仍還原成台灣日期`, () => {
      const original = process.env.TZ;
      try {
        process.env.TZ = tz;
        const fresh = loadScripts(['js/01-config-data.js', 'js/02-core-utils.js']);
        assert.strictEqual(
          fresh.normDate('2026-06-02T16:00:00.000Z'),
          '2026-06-03',
          `${tz} 下日期跑掉了 —— Sheet 的純日期儲存格會被讀成前一天或後一天`
        );
      } finally {
        process.env.TZ = original;
      }
    });
  }

  test('台灣時間 23:30 送出的紀錄算「當天」，不會被推到隔天', () => {
    // 2026-06-03 23:30 (+08:00) === 2026-06-03T15:30Z
    assert.strictEqual(normDate('2026-06-03T15:30:00.000Z'), '2026-06-03');
  });

  test('台灣時間 00:30 送出的紀錄算「當天」，不會被拉回前一天', () => {
    // 2026-06-03 00:30 (+08:00) === 2026-06-02T16:30Z
    assert.strictEqual(normDate('2026-06-03T00:30:00+08:00'), '2026-06-03');
  });
});

describe('todayStr', () => {
  test('格式為 yyyy-mm-dd 且月日補零', () => {
    assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('與本地時區的今天一致', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.strictEqual(todayStr(), expected);
  });
});

describe('dateSlash', () => {
  test('顯示用斜線格式', () => {
    assert.strictEqual(dateSlash('2026-06-03'), '2026/06/03');
  });
});

describe('computeSleepHours — 就寢/起床換算時數，需處理跨午夜', () => {
  test('跨午夜：23:00 睡到 07:00 是 8 小時', () => {
    assert.strictEqual(computeSleepHours('23:00', '07:00'), 8);
  });

  test('同日不跨午夜：01:00 睡到 09:30 是 8.5 小時', () => {
    assert.strictEqual(computeSleepHours('01:00', '09:30'), 8.5);
  });

  test('剛好 00:00 到 00:00 視為 24 小時（而非 0）', () => {
    assert.strictEqual(computeSleepHours('00:00', '00:00'), 24);
  });

  test('缺一邊或格式錯誤回傳 null，不回傳 NaN', () => {
    assert.strictEqual(computeSleepHours('', '07:00'), null);
    assert.strictEqual(computeSleepHours('23:00', ''), null);
    assert.strictEqual(computeSleepHours('abc', '07:00'), null);
    assert.strictEqual(computeSleepHours(null, null), null);
  });

  test('四捨五入到小數一位', () => {
    assert.strictEqual(computeSleepHours('23:00', '06:20'), 7.3);
  });
});

describe('sleepVerdict — 國中生建議 8–10 小時', () => {
  test('分級邊界', () => {
    assert.strictEqual(sleepVerdict(5.9).label, '明顯不足');
    assert.strictEqual(sleepVerdict(6).label, '偏少');
    assert.strictEqual(sleepVerdict(6.9).label, '偏少');
    assert.strictEqual(sleepVerdict(7).label, '充足');
    assert.strictEqual(sleepVerdict(10).label, '充足');
    assert.strictEqual(sleepVerdict(10.1).label, '偏多');
  });

  test('null 輸入回傳 null，呼叫端才能安全略過', () => {
    assert.strictEqual(sleepVerdict(null), null);
  });
});
