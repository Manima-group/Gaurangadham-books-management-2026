/* Gaurangadham Grantha Seva — service worker
 * - App files (JS, CSS, fonts, images) are cached so the app opens without network.
 * - Pages: network first (4s), falling back to the last saved copy, then /offline.
 * - Never caches: server actions (POST), API calls, Next.js data requests.
 * Sales and money entered offline are queued by the page itself and sent when back online.
 */
const VERSION = "v2";
const STATIC = `gb-static-${VERSION}`;
const PAGES = `gb-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/brand/prabhupada.webp"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gb-") && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/brand/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(?:woff2?|ttf|png|jpg|jpeg|webp|svg|ico|css|js)$/.test(url.pathname);

/** Save every /_next/static file a page refers to (JS chunks, CSS, fonts). */
async function saveAssets(html) {
  const urls = [...new Set((html.match(/\/_next\/static\/[^"'\\\s]+/g) || []))];
  if (!urls.length) return;
  const cache = await caches.open(STATIC);
  await Promise.all(
    urls.map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {}
    }),
  );
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // server actions & form posts go straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return; // Next.js data requests

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await Promise.race([fetch(req), timeout(4000)]);
          if (res.ok && !res.redirected && url.pathname !== "/login") {
            cache.put(url.pathname, res.clone());
            res.clone().text().then(saveAssets).catch(() => {});
          }
          if (url.pathname === "/login") caches.delete(PAGES); // logged out: forget saved pages
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
  }
});

/* The page asks us to save its most-used pages for offline use, or to forget them. */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "warm" && Array.isArray(msg.urls)) {
    event.waitUntil(
      caches.open(PAGES).then((cache) =>
        Promise.all(
          msg.urls.map((u) =>
            fetch(u, { credentials: "same-origin" })
              .then(async (res) => {
                if (!res.ok || res.redirected) return;
                await cache.put(u, res.clone());
                await saveAssets(await res.text()); // the page's own scripts & styles, so it can start offline
              })
              .catch(() => null),
          ),
        ),
      ),
    );
  }
  if (msg.type === "forget") event.waitUntil(caches.delete(PAGES));
});
