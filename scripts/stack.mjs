#!/usr/bin/env node
// Profil README'sindeki kayan teknoloji şeridi: assets/stack.svg
// ---------------------------------------------------------------
// Logolar simple-icons'tan (CC0) alınıp scripts/stack-icons.json'a kaydedildi.
// Şerit sonsuz döngüde sola kayar; kenarlar yumuşakça solar.
//
//   node scripts/stack.mjs [assets/stack.svg]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { icons } = JSON.parse(readFileSync(resolve(here, "stack-icons.json"), "utf8"));
const outFile = process.argv[2] || "assets/stack.svg";

// C# logosu simple-icons'tan kaldırıldığı için yazıyla gösterilir.
const items = icons.flatMap((icon) => icon.slug === "dotnet"
  ? [icon, { slug: "csharp", title: "C#", hex: "B06EE8", text: "C#" }]
  : [icon]);

const W = 1200, H = 164, TILE = 132, GAP = 14, LOGO = 46, TOP = 38;
const ROW = items.length * (TILE + GAP);
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4));
  return .2126 * r + .7152 * g + .0722 * b;
};
// Koyu zeminde kaybolan siyah logolar (Next.js, Three.js, GitHub) açık renge çevrilir;
// koyu marka renkleri (PHP, MySQL, .NET) okunur olsun diye beyaza doğru açılır.
const color = (hex) => {
  const lum = luminance(hex);
  if (lum < .05) return "#f1ece2";
  if (lum >= .16) return `#${hex}`;
  const mix = .45 * (1 - lum / .16) + .15;
  return "#" + [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - mix) + 255 * mix).toString(16).padStart(2, "0")).join("");
};
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const tile = (item, x) => {
  const fill = color(item.hex);
  const mark = item.text
    ? `<text x="${TILE / 2}" y="${TOP + 37}" text-anchor="middle" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="34" font-weight="800" fill="${fill}">${esc(item.text)}</text>`
    : `<path transform="translate(${(TILE - LOGO) / 2} ${TOP}) scale(${LOGO / 24})" fill="${fill}" d="${item.path}"/>`;
  return `<g transform="translate(${x} 0)">
  <rect x="0" y="10" width="${TILE}" height="${H - 20}" rx="18" fill="#fff" fill-opacity=".035" stroke="#fff" stroke-opacity=".07"/>
  <g filter="url(#glow)">${mark}</g>
  <text x="${TILE / 2}" y="${H - 40}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" fill="#a9a39a">${esc(item.title)}</text>
</g>`;
};
const row = (offset) => items.map((item, i) => tile(item, offset + i * (TILE + GAP))).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Kullandığım teknolojiler</title>
<desc id="desc">${esc(items.map((item) => item.title).join(", "))}</desc>
<style>
  .track { animation: slide ${(items.length * 1.9).toFixed(1)}s linear infinite; }
  @keyframes slide { to { transform: translateX(-${ROW}px); } }
  @media (prefers-reduced-motion: reduce) { .track { animation: none; } }
</style>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121626"/><stop offset="1" stop-color="#0b0d14"/></linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".08" stop-color="#fff"/>
    <stop offset=".92" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="fade"><rect width="${W}" height="${H}" fill="url(#edge)"/></mask>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#fff" flood-opacity=".18"/></filter>
</defs>
<rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
<g mask="url(#fade)">
  <g class="track">
${row(GAP)}
${row(GAP + ROW)}
  </g>
</g>
</svg>
`;
writeFileSync(outFile, svg);
console.log(`${outFile} yazıldı · ${items.length} teknoloji · ${(svg.length / 1024).toFixed(1)} KB`);
