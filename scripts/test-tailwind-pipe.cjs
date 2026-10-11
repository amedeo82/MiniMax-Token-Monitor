// Riproduce la pipeline reale: @tailwindcss/postcss su globals.css
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const fs = require("fs");

const src = fs.readFileSync("src/app/globals.css", "utf8");
postcss([tailwind()])
  .process(src, { from: "src/app/globals.css" })
  .then((res) => {
    const css = res.css;
    fs.writeFileSync("scripts/compiled-i84-tw.css", css);
    const probes = ["ecfdf5", "fffbeb", "fff1f2", "fff7ed", "f0f9ff", "f5f3ff", "mm-muted", "text-emerald-400"];
    for (const p of probes) console.log(p.padEnd(18), css.includes(p) ? "PRESENTE" : "ASSENTE");
  })
  .catch((e) => console.error("ERRORE:", e.message));
