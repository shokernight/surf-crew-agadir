/* ==========================================================================
   SURF WETSUIT — self-destructing service worker
   ==========================================================================
   WHY THIS FILE STILL EXISTS

   The site used to be a Progressive Web App. Earlier versions of this file
   registered a service worker that cached the site "app shell" — including
   js/app.js — with a cache-first strategy.

   That causes a nasty problem: an installed service worker keeps running until
   it is replaced or unregistered, and a cache-first worker will keep serving
   the OLD js/app.js forever, even after the file is fixed on the server. That
   is why a corrected WhatsApp number can still show the old placeholder.

   Deleting this file is NOT enough: browsers keep a registered worker at the
   same URL alive indefinitely. So this file stays, but it does the opposite of
   before — on activation it unregisters itself and deletes every cache.

   The page also runs the same cleanup inline (see index.html). Both together
   mean existing visitors are freed from the old worker on their next visit.
   ========================================================================== */

self.addEventListener("install", () => {
  /* Take over immediately so the cleanup below runs on the current visit. */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /* 1. Delete every cache the old worker created. */
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (err) {
        /* non-fatal */
      }

      /* 2. Stop controlling open pages. */
      try {
        await self.clients.claim();
      } catch (err) {
        /* non-fatal */
      }

      /* 3. Unregister this worker for good. */
      try {
        await self.registration.unregister();
      } catch (err) {
        /* non-fatal */
      }
    })()
  );
});

/* Do not intercept any request. Fetch normally. */
self.addEventListener("fetch", () => {
  /* no respondWith(): requests go straight to the network */
});
