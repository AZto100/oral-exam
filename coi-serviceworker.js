/*
 * Local cross-origin-isolation helper for static hosting.
 * Required because whisper.cpp stream.wasm uses WebAssembly pthreads / SharedArrayBuffer.
 * This file serves both as the page bootstrap and the service worker.
 */
(() => {
  const COEP = "require-corp";
  const COOP = "same-origin";

  if (typeof window === "undefined") {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (event) => {
      const request = event.request;
      if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
      event.respondWith((async () => {
        const response = await fetch(request);
        if (response.type === "opaque") return response;
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Embedder-Policy", COEP);
        headers.set("Cross-Origin-Opener-Policy", COOP);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      })());
    });
    return;
  }

  if (window.crossOriginIsolated || !navigator.serviceWorker) return;

  const reloadKey = "human-ai-coi-reload-v1";
  navigator.serviceWorker.register(document.currentScript.src).then((registration) => {
    if (navigator.serviceWorker.controller) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, "1");
      location.reload();
    }, { once: true });
    if (registration.active && !navigator.serviceWorker.controller && !sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, "1");
      location.reload();
    }
  }).catch((err) => {
    console.error("Could not enable cross-origin isolation for local Whisper:", err);
  });
})();
