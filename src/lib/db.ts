/**
 * Punto di import CANONICO del client Prisma (`db`).
 *
 * Da I106 il modulo vivente è `./db-factory` (persistenza portabile: motore
 * selezionato dall'ambiente — Turso/libsql via driver adapter, oppure SQLite
 * nativo in locale/CI). Questo shim mantiene stabile il percorso di import
 * `@/lib/db` per tutte le route e i consumatori (e per i mock dei test I99/I95,
 * che sostituiscono QUESTO modulo, non la factory).
 */
export { db, creaPrismaClient, modalitaPersistenza, type ModalitaPersistenza } from "./db-factory";
