const cacheName = "agenda-v1.1"; // Incrementato a 1.1 per forzare l'aggiornamento

const assets = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./icon-192.png",
    "./icon-512.png"
];

// Installazione: salviamo i file necessari
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(cacheName)
            .then(cache => cache.addAll(assets))
    );
});

// Gestione Fetch: Prima prova la rete, se fallisce usa la cache
self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Se la rete risponde, aggiorniamo la cache con la nuova versione
                const resClone = response.clone();
                caches.open(cacheName).then(cache => cache.put(event.request, resClone));
                return response;
            })
            .catch(() => caches.match(event.request)) // Se offline, usa la cache
    );
});
