/* 冒煙測試 —— 這個專案沒有 build step，任何未捕捉的例外都會直接變成
   「按鈕沒反應 / 半殘畫面」。這支測試的價值在於把它們變成可見的紅燈。 */
'use strict';

const { test, expect } = require('@playwright/test');

/** 收集頁面上所有的錯誤訊號 */
function attachErrorCollectors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push({ kind: 'pageerror', text: String(err && err.message || err) }));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push({ kind: 'console.error', text: msg.text() });
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    // 後端 Apps Script 與 CDN 在離線/未登入時失敗屬預期，不計入
    if (/script\.google\.com|cdnjs\.cloudflare\.com/.test(url)) return;
    errors.push({ kind: 'requestfailed', text: `${url} — ${req.failure()?.errorText}` });
  });
  return errors;
}

test.describe('首次載入', () => {
  test('載入 index.html 不得出現未捕捉的 JS 例外', async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500); // 讓 DOMContentLoaded 後的 init() 跑完

    const fatal = errors.filter((e) => e.kind === 'pageerror');
    expect(fatal, `未捕捉例外：\n${fatal.map((e) => '  - ' + e.text).join('\n')}`).toHaveLength(0);
  });

  test('index.html 引用的本機腳本全部載入成功（無 404）', async ({ page }) => {
    const failed = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && new URL(res.url()).hostname === '127.0.0.1') {
        failed.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto('/index.html', { waitUntil: 'load' });
    expect(failed, `載入失敗的資源：\n${failed.join('\n')}`).toHaveLength(0);
  });

  test('登入畫面出現，且三種身分入口都在', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    const overlay = page.locator('#loginOverlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('body')).toContainText('育林國中技擊隊');
  });

  test('init() 有跑完 —— 送出鈕已綁定事件而非死鈕', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    // init() 若中途丟例外，後面的事件綁定不會發生。
    // 用「日期欄位是否被 init() 預設成今天」當作 init 走到第 27 行的證據。
    const dateValue = await page.locator('#date').inputValue();
    expect(dateValue, 'init() 未成功設定預設日期，表示它在更早的地方就丟出例外').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

test.describe('版面 — 不得橫向溢出', () => {
  for (const width of [375, 390, 430]) {
    test(`${width}px 寬度下沒有水平捲動`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/index.html', { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        // 找出真正超出的元素，方便定位
        culprits: Array.from(document.querySelectorAll('*'))
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 10)
          .map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).join('.') : ''))
      }));
      expect(
        overflow.scrollWidth,
        `頁面寬 ${overflow.scrollWidth} > 視窗 ${overflow.clientWidth}，超出的元素：\n${overflow.culprits.join('\n')}`
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});
