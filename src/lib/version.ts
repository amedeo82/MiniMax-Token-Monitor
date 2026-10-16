/**
 * Marcatore di versione (I46) — fonte unica, resa nel footer della pagina e del kiosk.
 *
 * CONVENZIONE (passo 7 del protocollo di aggiornamento in docs/04, RINFORZATA
 * I111 su richiesta dell'utente): aggiornare APP_VERSION a OGNI incremento —
 * data dell'aggiornamento + ultimo item implementato/documentato — INSIEME ai
 * docs (docs/03, docs/04, README) e mai da solo: deve sempre riflettere lo
 * stato della documentazione. L'obbligo NON è solo documentale: l'audit
 * contiene il check «versione allineata al changelog canonico» (I111) che
 * FALLISCE se questa costante slitta rispetto alla riga più recente di
 * docs/04 §8 — dimenticare l'aggiornamento rompe la qualità, non la memoria.
 *
 * Formato: «AAAA-MM-GG · I<n>» dove I<n> è l'ultimo item implementato/documentato.
 */
export const APP_VERSION = "2026-10-17 · I116";
