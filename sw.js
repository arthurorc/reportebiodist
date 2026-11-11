/* Reporte de servicio - modo sin conexión.
   Guarda la página en el teléfono, la abre aunque no haya red y,
   cuando hay red, revisa en segundo plano si hay versión nueva. */
const C = "reportebiodist";
const IDX = new URL("./", self.location).href;
const NUEVA = new URL("__nueva", self.location).href;
const EXTRA = ["manifest.json", "icono.png"].map(u => new URL(u, self.location).href);

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(C);
    await c.add(IDX);
    await Promise.all(EXTRA.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    const p = pagina();
    e.respondWith(p.then(x => x.res));
    e.waitUntil(p.then(x => x.revisar && revisar(x.c, x.guardada)));
    return;
  }
  if (EXTRA.includes(u.origin + u.pathname)) {
    e.respondWith(caches.match(u.origin + u.pathname).then(x => x || fetch(r)));
  }
});

async function pagina() {
  const c = await caches.open(C);
  const guardada = await c.match(IDX);
  if (guardada) return { res: guardada.clone(), revisar: true, c, guardada };
  try {
    const res = await fetch(IDX, { cache: "no-store" });
    if (res.ok) await c.put(IDX, res.clone());
    return { res };
  } catch (_) {
    return { res: new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:-apple-system,sans-serif;padding:24px;color:#0b4f8f">' +
      "<h2>Sin conexión</h2><p>La página todavía no está guardada en este teléfono. " +
      "Ábrela una vez con señal y después funcionará sin red.</p></body>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }) };
  }
}

async function huella(res) {
  const b = await res.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).join(",");
}

async function revisar(c, guardada) {
  try {
    const h = {};
    const et = guardada.headers.get("ETag"), lm = guardada.headers.get("Last-Modified");
    if (et) h["If-None-Match"] = et;
    if (lm) h["If-Modified-Since"] = lm;
    const res = await fetch(IDX, { cache: "no-store", headers: h });
    if (res.status === 304 || !res.ok || res.type !== "basic") return;
    if ((await huella(res.clone())) === (await huella(guardada.clone()))) return;
    await c.put(IDX, res);
    await c.put(NUEVA, new Response("1"));
    for (const cl of await self.clients.matchAll({ type: "window" })) cl.postMessage({ t: "nueva" });
  } catch (_) { /* sin red: se queda la guardada */ }
}
