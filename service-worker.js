/* ============================================================
   TeamPro 育林訓練系統 — Service Worker (PWA)
   - 導覽(HTML)：network-first（線上一定拿最新 index.html，離線才用快取）
   - 同源靜態資源(CSS/JS/圖示/manifest)：stale-while-revalidate
   - 跨網域(Google Apps Script /exec、html2pdf CDN)與非 GET：完全不攔截，
     直接走網路 → 不影響 Google Sheet 串接、PDF 下載、LINE 分享
   ============================================================ */
const CACHE = 'teampro-pwa-v31';
const SHELL = [
  './',
  './index.html',
  './js/13-mental-preparation.js',
  './manifest.webmanifest',
  './yulinlogo.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST 等不攔（GAS 寫入照常）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 跨網域不攔（GAS/CDN/LINE 照常）

  // 導覽請求：network-first，離線退回快取的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // JavaScript：network-first，避免部署新版後手機先吃到舊腳本
  if (url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 同源靜態資源：stale-while-revalidate（先給快取、背景更新）
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
