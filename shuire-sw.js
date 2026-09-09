/* 朱入れ の控え係（service worker）。
   ホーム画面から開いたとき、通信がなくても一枚が開くように、同じ置き場のものだけを手元に写しておく。
   まず通信、届かなければ写し（更新はすぐ効き、圏外でも開く）。原稿は触らない（原稿はブラウザの中にある）。 */
const C = "shuire-v1";
const FILES = ["./shuire.html", "./shuire.webmanifest", "./shuire-icon.png", "./shuire-icon-512.png"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).catch(() => {})); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
