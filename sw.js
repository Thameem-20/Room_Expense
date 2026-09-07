const CACHE = "roomtab-v26";
const SHELL = [
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") {
        return;
    }
    if (url.pathname.endsWith("/api.php")) {
        event.respondWith(fetch(event.request));
        return;
    }

    const live = /\.(?:php|css|js|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith("/");
    if (live) {
        event.respondWith(
            fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return response;
        }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./")))
    );
});
