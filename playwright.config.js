/* Playwright 設定 —— 用本機已安裝的 Chrome（channel: 'chrome'），
   不下載 Playwright 自帶瀏覽器，避免在教練的電腦上塞幾百 MB。
   測試對象是「本機工作目錄的程式碼」而非線上版，這樣才測得到還沒部署的修正。 */
'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `node tests/e2e/static-server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 20_000
  },
  /*
     瀏覽器涵蓋範圍的誠實說明：
     這裡只跑本機已安裝的 Chrome。Playwright 自帶的 WebKit／Firefox 沒有安裝
     （避免在教練的電腦上多塞幾百 MB），而 devices['iPhone 13'] 的
     defaultBrowserType 是 webkit，配 channel:'chrome' 會直接啟動失敗。

     因此行動版用 Chromium 系的裝置描述（Pixel 7）做視窗尺寸與觸控模擬。
     ⚠️ 這代表 **真實 iOS Safari 的行為並未被自動測試涵蓋** ——
     iOS 的 PWA standalone 模式、localStorage 配額、日期輸入元件行為都與
     Chromium 不同，這些仍須人工在 iPhone 上驗證。
     若日後要補上，執行：npx playwright install webkit
  */
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], channel: 'chrome' }
    }
  ]
});
