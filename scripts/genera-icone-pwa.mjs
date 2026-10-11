#!/usr/bin/env node
/**
 * I52 — Genera le icone PNG della PWA (192/512 + apple-touch 180) a partire
 * da un SVG coerente con l'identità della dashboard (gradiente rosa→arancio
 * con fulmine, come l'header). Usa sharp (già dipendenza del progetto).
 *
 * Uso: node scripts/genera-icone-pwa.mjs
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
mkdirSync(PUBLIC, { recursive: true });

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f43f5e"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="#09090b"/>
  <rect x="40" y="40" width="432" height="432" rx="72" fill="url(#bg)"/>
  <path d="M290 96 L180 280 L250 280 L222 416 L344 224 L268 224 Z" fill="#ffffff" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"/>
</svg>`;

const buffer = Buffer.from(SVG);

for (const size of [192, 512, 180]) {
  const name = size === 180 ? "icon-180.png" : `icon-${size}.png`;
  await sharp(buffer).resize(size, size).png().toFile(join(PUBLIC, name));
  console.log(`creata public/${name}`);
}
console.log("icone PWA generate.");
