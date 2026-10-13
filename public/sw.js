/**
 * I52 — Service Worker della PWA (ADR-14).
 *
 * Responsabilità:
 * 1. Cache offline: shell dell'app, manifest, icone e risposte GET di
 *    /api/history (solo 2xx) per la navigazione senza rete; i dati visibili
 *    offline arrivano dal localStorage della pagina (offline-first I16/I27).
 *    I92: rimossa la cache «ultimo snapshot» (SNAPSHOT_KEY) — era scritta ma
 *    il suo payload (JSON del proxy usage) non ha alcun consumatore GET e il
 *    fallback offline del GET la serviva agli endpoint /api/events e
 *    /api/history che la interpretavano come risposta di ALTRA forma
 *    ({ok:true, total:undefined} → crash delle sezioni offline).
 *    BUG CORRETTO (I52) «1004 cachato»: un errore di autenticazione non
 *    deve mai diventare "ultimo dato noto" — resta valido per le notifiche.
 * 2. Notifiche a tab CHIUSO: quando la pagina comunica la Subscription Key
 *    via postMessage, il SW la conserva SOLO in IndexedDB (mai in Cache
 *    Storage, mai nel codice, mai nei log) e la usa per interrogare il proxy
 *    su comando (CHECK_NOW) o su periodicsync (se il browser lo supporta).
 * 3. Valutazione soglie/reset con la logica condivisa di /sw-shared.js e
 *    notifica (warn/crit/reset) senza aprire la pagina.
 *
 * Messaggi accettati dalla pagina:
 * - { type: "SECRETS", apiKey: string|null, region?, thresholds?, alertsEnabled?, notifyReset? }
 * - { type: "CHECK_NOW" }
 * - { type: "SKIP_WAITING" }
 */
importScripts("/sw-shared.js");

const CACHE = "mm-dash-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-180.png"];
const DB_NAME = "mm-dash-sw";
const DB_VERSION = 1;
const STORE_SECRETS = "secrets";
const STORE_STATE = "state";

/* ----------------------------- IndexedDB ----------------------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SECRETS)) db.createObjectStore(STORE_SECRETS);
      if (!db.objectStoreNames.contains(STORE_STATE)) db.createObjectStore(STORE_STATE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store, key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* IndexedDB non disponibile: il SW resta senza segreti (niente notifiche) */
  }
}

async function idbGet(store, key) {
  try {
    const db = await openDb();
    const v = await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return v;
  } catch {
    return null;
  }
}

async function idbDel(store, key) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* noop */
  }
}

/* --------------------------- ciclo di vita --------------------------- */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* --------------------------- fetch handler --------------------------- */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* POST e altri metodi: pass-through trasparente (nessuna cache — I92:
     l'ultimo snapshot non è più conservato in Cache Storage, i segreti e
     lo stato delle notifiche vivono SOLO in IndexedDB). */
  if (req.method !== "GET") return;

  /* GET: rete-prima con fallback cache (shell + storico per l'offline). */
  event.respondWith(
    fetch(req)
      .then(async (res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname.startsWith("/api/history") || url.pathname.startsWith("/_next/static") || url.pathname === "/manifest.webmanifest")) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      })
      .catch(async () => {
        const c = await caches.open(CACHE);
        // I92 — niente fallback su SNAPSHOT_KEY: serviva un payload di forma
        // sbagliata agli endpoint API (crash offline delle sezioni). Le richieste
        // non in cache ottengono il 503 JSON sotto, che i client (fetchServerHistory,
        // fetchServerEvents, …) traducono in null: la UI resta sui dati locali.
        const hit =
          (req.mode === "navigate" && (await c.match("/"))) ||
          (await c.match(req));
        if (hit) return hit;
        return new Response(JSON.stringify({ offline: true, error: "Risorsa non disponibile offline." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }),
  );
});

/* ------------------------------ checkNow ------------------------------ */

async function checkNow(reason) {
  const secrets = await idbGet(STORE_SECRETS, "current");
  if (!secrets || !secrets.apiKey) return false;

  let res;
  try {
    res = await fetch("/api/minimax/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: secrets.apiKey, region: secrets.region === "cn" ? "cn" : "eu" }),
    });
  } catch {
    return false; // offline: la pagina al ritorno sincronizza
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    return false;
  }
  if (!json || json.ok !== true) return false;

  const parsed = MMSwShared.parseUsagePayload(json.data);
  if (!parsed.ok) return false;

  const prevState = await idbGet(STORE_STATE, "last");
  const prevSnap = prevState && prevState.snapshot ? prevState.snapshot : null;
  const result = MMSwShared.evaluate(prevSnap, parsed.snapshot, {
    alertsEnabled: secrets.alertsEnabled !== false,
    notifyReset: secrets.notifyReset !== false,
    thresholds:
      secrets.thresholds && secrets.thresholds.h5 && secrets.thresholds.h24 && secrets.thresholds.weekly
        ? secrets.thresholds
        : { h5: { warn: 25, crit: 10 }, h24: { warn: 25, crit: 10 }, weekly: { warn: 25, crit: 10 } },
  });

  await idbSet(STORE_STATE, "last", { snapshot: parsed.snapshot, t: Date.now() });

  for (const r of result.resets) {
    await mostraNotifica(
      `MiniMax · Finestra resettata`,
      `${r.modelLabel} — ${r.winLabel} tornata al ${r.to.toFixed(1)}%`,
      `reset-${r.model}-${r.win}`,
    );
  }
  for (const a of result.alerts) {
    await mostraNotifica(
      a.level === "crit" ? "MiniMax · Quota quasi esaurita" : "MiniMax · Soglia di attenzione superata",
      `${a.modelLabel} — ${a.winLabel} al ${a.to.toFixed(1)}% (soglia ${a.threshold}%)`,
      `quota-${a.model}-${a.win}-${a.level}`,
    );
  }
  return true;
}

async function mostraNotifica(title, body, tag) {
  try {
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    });
  } catch {
    /* permesso non concesso o browser restrittivo: silenzioso */
  }
}

/* ------------------------ messaggi dalla pagina ------------------------ */

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SECRETS") {
    if (msg.apiKey) {
      idbSet(STORE_SECRETS, "current", {
        apiKey: String(msg.apiKey),
        region: msg.region === "cn" ? "cn" : "eu",
        thresholds: msg.thresholds ?? null,
        alertsEnabled: msg.alertsEnabled !== false,
        notifyReset: msg.notifyReset !== false,
        t: Date.now(),
      }).then(() => checkNow("secrets-aggiornati"));
    } else {
      // chiave rimossa o passaggio alla demo: nessun segreto residuo
      idbDel(STORE_SECRETS, "current");
      idbDel(STORE_STATE, "last");
    }
    return;
  }
  if (msg.type === "CHECK_NOW") {
    checkNow("manual").then((ok) => {
      if (event.source) event.source.postMessage({ type: "CHECK_DONE", ok });
    });
    return;
  }
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ------------------- sincronizzazione periodica ------------------- */

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "mm-check") {
    event.waitUntil(checkNow("periodicsync"));
  }
});
