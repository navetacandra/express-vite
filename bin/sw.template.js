const cacheData = ["/sw.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open("siteCacheV3").then((cache) => {
      return cache.addAll(cacheData);
    }),
  );
});

self.addEventListener("active", (e) => {
  e.waitUntil(
    caches.keys().then((cacheName) => {
      return Promise.all(
        cacheName
          .filter((cacheName) => cacheName !== "site-cache")
          .map((cacheName) => {
            return caches.delete(cacheName);
          }),
      );
    }),
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      if (res) {
        return res;
      }
      return fetch(e.request);
    }),
  );
});
