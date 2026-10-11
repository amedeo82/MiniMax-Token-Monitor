// Test: il blocco tinte I84 sopravvive a LightningCSS?
const lightningcss = require("lightningcss");
const fs = require("fs");

const src = fs.readFileSync("src/app/globals.css", "utf8");
const out = lightningcss.transform({
  filename: "globals.css",
  code: Buffer.from(src),
  minify: true,
  targets: { chrome: 100 << 16 },
});
const css = out.code.toString();
fs.writeFileSync("scripts/compiled-i84-test.css", css);
const probes = ["ecfdf5", "fffbeb", "fff1f2", "fff7ed", "f0f9ff", "f5f3ff", "mm-muted"];
for (const p of probes) console.log(p.padEnd(10), css.includes(p) ? "PRESENTE" : "ASSENTE");
