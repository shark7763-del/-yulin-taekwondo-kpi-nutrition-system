#!/usr/bin/env node
/* 部署前語法檢查 —— 這個專案沒有 build step，語法錯誤會直接上線變成白畫面。
   對每支前端 JS 跑一次 node 的語法解析（不執行），任何一支壞掉就非零離開。
   用法：npm run check:syntax */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  'js/00-error-guard.js',
  'js/01-config-data.js',
  'js/02-core-utils.js',
  'js/03-forms-scoring.js',
  'js/04-daily-submit.js',
  'js/05-feedback-readiness.js',
  'js/06-player-line.js',
  'js/07-coach-dashboard.js',
  'js/08-profile-journal.js',
  'js/09-settings-auth.js',
  'js/10-init.js',
  'js/11-trait-radar.js',
  'js/12-research-data.js',
  'js/13-mental-preparation.js',
  'kpi-session.js',
  'monthly-report.js',
  'psych-cards.js',
  'service-worker.js'
];

let failed = 0;
for (const rel of TARGETS) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`✖ ${rel} — 檔案不存在（index.html 可能仍在載入它）`);
    failed++;
    continue;
  }
  try {
    // 只編譯不執行：抓得到語法錯誤，不會有副作用
    new vm.Script(fs.readFileSync(abs, 'utf8'), { filename: rel });
    console.log(`✓ ${rel}`);
  } catch (err) {
    console.error(`✖ ${rel} — ${err.message}`);
    failed++;
  }
}

/* 順帶檢查 index.html 引用的每支腳本都真的存在，避免 404 造成整頁功能消失 */
const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const srcRe = /<script[^>]+src="([^"]+)"/g;
let m;
while ((m = srcRe.exec(html)) !== null) {
  const src = m[1];
  if (/^https?:\/\//.test(src)) continue;           // CDN 不檢查
  const bare = src.split('?')[0];
  if (!fs.existsSync(path.join(REPO_ROOT, bare))) {
    console.error(`✖ index.html 引用了不存在的腳本：${src}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} 個問題 —— 請勿部署。`);
  process.exit(1);
}
console.log('\n全部通過，可以部署。');
