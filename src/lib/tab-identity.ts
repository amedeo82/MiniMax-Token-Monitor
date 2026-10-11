/**
 * I67 — Identità del tab: titolo e favicon dinamici.
 *
 * La dashboard diventa «a colpo d'occhio»: nel titolo del tab compare il
 * residuo della finestra 5h (es. «84% · MiniMax Token Monitor») e la favicon
 * è un mini-ring colorato disegnato su canvas con la percentuale corrente
 * (colore = coloreContinuo di I65, quindi stessa semantica visiva dei ring).
 *
 * `<TabIdentity>` (componente nello stesso modulo, via React.createElement per
 * restare in un .ts): si aggiorna quando cambia il residuo; include il GUARD
 * anti re-asserzione — Next/React 19 può ri-scrivere `document.title` dai
 * metadata dopo una navigazione client, quindi un MutationObserver sul
 * `<title>` ripristina il titolo voluto; senza snapshot o su SSR non fa nulla.
 */

import * as React from "react";
import { coloreContinuo } from "./ring-color";

/** Colore del ring della favicon alla percentuale data (esposto per i test). */
export function faviconColor(remainingPercent: number | null): string {
  return coloreContinuo(remainingPercent);
}

/**
 * Titolo del tab: residuo della finestra 5h (o stato) + nome dell'app.
 * «84% · MiniMax Token Monitor», «demo · …», «MiniMax Token Monitor» senza dati.
 */
export function formatTabTitle(
  remainingPercent: number | null | undefined,
  opts: { demo?: boolean } = {},
): string {
  const base = "MiniMax Token Monitor";
  if (opts.demo) return `demo · ${base}`;
  if (remainingPercent === null || remainingPercent === undefined || !isFinite(remainingPercent)) {
    return base;
  }
  return `${Math.round(remainingPercent)}% · ${base}`;
}

/**
 * Disegna la favicon su canvas 64×64: sfondo scuro arrotondato, ring con la
 * percentuale (tratto colorato con coloreContinuo), numero al centro.
 * Ritorna un data URL PNG; null se canvas non è disponibile (SSR/test).
 */
export function drawFaviconDataUrl(remainingPercent: number | null): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const color = faviconColor(remainingPercent);
  const v = remainingPercent === null ? 0 : Math.max(0, Math.min(100, remainingPercent));

  // Sfondo arrotondato scuro (coerente col tema della dashboard)
  ctx.fillStyle = "#09090b";
  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, 14);
  ctx.fill();

  // Ring di fondo
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(32, 32, 23, 0, 2 * Math.PI);
  ctx.stroke();

  // Ring con la percentuale (partendo dall'alto, senso orario)
  if (v > 0) {
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(32, 32, 23, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * v) / 100);
    ctx.stroke();
  }

  // Percentuale al centro (4 caratteri max)
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "bold 17px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(v >= 100 ? "100" : v.toFixed(0), 32, 33);

  return canvas.toDataURL("image/png");
}

interface TabIdentityProps {
  /** Residuo della finestra 5h (o null/senza dati). */
  remainingPercent: number | null | undefined;
  /** Modalità demo: titolo prefissato, nessun ring. */
  demo?: boolean;
}

/**
 * Aggiorna `document.title` e la favicon dinamica; con il guard anti
 * re-asserzione (MutationObserver sul <title>) ripristina il titolo voluto se
 * Next/React lo riscrive. Non renderizza nulla (return null).
 */
export function TabIdentity({ remainingPercent, demo = false }: TabIdentityProps): null {
  const title = formatTabTitle(remainingPercent, { demo });

  React.useEffect(() => {
    document.title = title;

    // Guard: se qualcuno (Next/React metadata) riscrive il titolo, ripristina.
    const titleEl = document.querySelector("title");
    let observer: MutationObserver | null = null;
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (document.title !== title) document.title = title;
      });
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    if (demo) {
      // demo: favicon di default, nessun ring dinamico
      return () => observer?.disconnect();
    }

    const dataUrl = drawFaviconDataUrl(remainingPercent ?? null);
    if (dataUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.type = "image/png";
      link.href = dataUrl;
    }

    return () => observer?.disconnect();
  }, [title, remainingPercent, demo]);

  return null;
}
