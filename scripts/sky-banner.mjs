#!/usr/bin/env node
// Çanakkale gökyüzü başlığı
// ---------------------------------------------------------------
// Profil README'sindeki başlığı çizer: "ÇALIŞKANÖZTÜRK" harflerinin içinde
// Çanakkale'nin o anki gökyüzü (güneş/ay, yıldızlar, Boğaz'ın suyu ve yansıma).
// Güneşin konumu Çanakkale koordinatlarından hesaplanır; palet portfolyo
// sitesindekiyle aynıdır (eyupcalskanozturk-tr.github.io).
//
// GitHub Actions bu betiği yarım saatte bir çalıştırır ve sonucu "sky" dalına yazar.
// Bağımlılık yok, Node 18+ yeterli.
//
//   node scripts/sky-banner.mjs [çıktı.svg] [--at 2026-11-01T18:05]
//   --at: Çanakkale yerel saatiyle test için sabit bir an.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NAME = JSON.parse(readFileSync(resolve(here, "name-paths.json"), "utf8"));
const CONFIG = { lat: 40.1553, lon: 26.4142, timeZone: "Europe/Istanbul", utcOffset: 3 }; // Türkiye yıl boyu UTC+3

// ───────── Komut satırı ─────────
const args = process.argv.slice(2);
const atIndex = args.indexOf("--at");
const at = atIndex >= 0 ? args.splice(atIndex, 2)[1] : null;
const outFile = resolve(args[0] || "dist/sky-banner.svg");

// ───────── Zaman: Çanakkale yerel saati ─────────
function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { y: +p.year, m: +p.month, d: +p.day, minutes: (+p.hour % 24) * 60 + +p.minute };
}
const dateAt = (day, minutes) => new Date(Date.UTC(day.y, day.m - 1, day.d) - CONFIG.utcOffset * 3600000 + minutes * 60000);
function parseAt(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) throw new Error(`--at biçimi YYYY-MM-DDTHH:MM olmalı, gelen: ${value}`);
  const [, y, m, d, h, mi] = match.map(Number);
  return dateAt({ y, m, d }, h * 60 + mi);
}
const now = at ? parseAt(at) : new Date();
const today = localParts(now);
const clock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// ───────── Renk yardımcıları ─────────
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

// ───────── Güneşin konumu (USNO yaklaşık formülü, yaklaşık 1° hassasiyet) ─────────
function sunPosition(date) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;            // J2000.0'dan beri geçen gün
  const g = (357.529 + 0.98560028 * d) * rad;               // ortalama anomali
  const q = 280.459 + 0.98564736 * d;                       // ortalama boylam
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;                // eksen eğikliği
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = 18.697374558 + 24.06570982441908 * d;
  const hourAngle = (((gmst * 15 + CONFIG.lon - ra) % 360) + 540) % 360 - 180;
  const lat = CONFIG.lat * rad;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle * rad)) / rad;
  return { alt, hourAngle };
}

// Güneşin yüksekliğine göre palet: [yükseklik°, gök üstü, gök ortası, ufuk, güneş, hale, vurgu]
const NIGHT = [
  [-90, "#10154a", "#2a2f86", "#5b4fb8", "#f4f1e8", "#5560d6", "#8f9bff"],
  [-18, "#121852", "#31358f", "#6a52b8", "#f4f1e8", "#6a5ad6", "#9a8cff"],
  [-12, "#151c5c", "#3c3a9a", "#8a5ab8", "#ffd9e6", "#9a62d6", "#b292ff"]
];
const DAY = [
  [20, "#1d5cbf", "#4b92de", "#a9d4f5", "#ffffff", "#ffe9a8", "#63b3ff"],
  [90, "#154fb5", "#3b88e6", "#9ccdf7", "#ffffff", "#fff4c7", "#5cc8ff"]
];
const parseRow = ([alt, ...colors]) => ({ alt, colors: colors.map(hex) });
const DUSK = [...NIGHT,
  [-6, "#18206a", "#4a3a9a", "#d0607e", "#ffc9b5", "#ff6f91", "#ff7aa8"],
  [-2, "#22307a", "#7a4296", "#ff7a59", "#ffb48a", "#ff6a3d", "#ff8a5c"],
  [2, "#2a4290", "#b8567e", "#ffa34d", "#fff1c1", "#ff8c3a", "#ffa64d"],
  [8, "#2c5fb0", "#d98a72", "#ffd08a", "#fff6dc", "#ffb347", "#ffc35a"],
  ...DAY].map(parseRow);
const DAWN = [...NIGHT,
  [-6, "#1a2268", "#4f3f9c", "#e07aa0", "#ffd6e0", "#ff8fb8", "#ff8fc0"],
  [-2, "#24307a", "#8a5aa8", "#ff9d8a", "#ffc9b0", "#ff8f8f", "#ff9db0"],
  [2, "#2c4796", "#c0789a", "#ffc28a", "#fff4d6", "#ffb070", "#ffb88a"],
  [8, "#2b66be", "#8fb3e0", "#ffe0b0", "#fffaf0", "#ffd59a", "#8fcfff"],
  ...DAY].map(parseRow);
const KEYS = ["top", "mid", "hor", "sun", "glow", "accent"];
function palette(alt, morning) {
  const rows = morning ? DAWN : DUSK;
  let i = rows.findIndex((row) => row.alt >= alt);
  if (i === -1) i = rows.length - 1;
  if (i === 0) i = 1;
  const a = rows[i - 1], b = rows[i];
  const t = clamp((alt - a.alt) / (b.alt - a.alt), 0, 1);
  return Object.fromEntries(KEYS.map((key, k) => [key, mix(a.colors[k], b.colors[k], t)]));
}
function phaseName(alt, morning, hourAngle) {
  if (alt > 8 && Math.abs(hourAngle) < 15) return "öğle";
  if (alt > 8) return morning ? "sabah" : "öğleden sonra";
  if (alt > 0) return morning ? "gün doğumu" : "altın saat";
  if (alt > -6) return morning ? "şafak" : "gün batımı";
  if (alt > -12) return "mavi saat";
  if (alt > -18) return "alacakaranlık";
  return "gece";
}

// ───────── O anın gökyüzü ─────────
const { alt, hourAngle } = sunPosition(now);
const morning = hourAngle < 0;
const c = palette(alt, morning);
const phase = phaseName(alt, morning, hourAngle);
const sunVisible = clamp((alt + 14) / 12, 0, 1);
const stars = clamp((-alt - 5) / 9, 0, 1);
const moonAlpha = clamp((-alt - 4) / 8, 0, 1);
const bg = mix(c.mid, [6, 6, 8], .88);
const sea = mix(c.mid, [4, 16, 31], .6);
const seaDeep = mix(c.top, [2, 6, 17], .75);
const reflection = alt > 0 ? clamp(.85 - alt / 60, .18, .85) : clamp((alt + 3) / 3, 0, 1) * .35;

// ───────── Yerleşim ─────────
const W = 1200, H = 508, PAD = 56, SPAN = W - 2 * PAD;
const [x0, , x1] = NAME.second.bbox;
const s = SPAN / (x1 - x0);                            // font birimi → piksel
const tx = PAD - x0 * s;
const base1 = 100 + NAME.first.bbox[3] * s;            // EYÜP'ün noktaları y=100'de başlar
const base2 = base1 + NAME.unitsPerEm * .88 * s;       // satır aralığı 0.88em
const capTop = base2 - NAME.capHeight * s;
const skyTop = base2 - NAME.second.bbox[3] * s;        // Ö/Ü noktalarının tepesi
const seaBottom = base2 - NAME.second.bbox[1] * s;     // Ç/Ş çengellerinin dibi
const horizon = base2 - NAME.capHeight * s * .32;      // harflerin alt üçte biri deniz
const sunR = SPAN * .07;
const sunX = PAD + SPAN * clamp(50 + hourAngle / 2.2, -12, 112) / 100;
const sunY = horizon - clamp(alt / 70, -1.5, 1) * (horizon - (capTop - 10));
const moonHourAngle = ((hourAngle + 360) % 360) - 180;
const moonX = PAD + SPAN * clamp(50 + moonHourAngle / 2.2, -12, 112) / 100;
const moonY = horizon - clamp(-alt / 60, 0, .9) * (horizon - (capTop + 6));
const nameTransform = (baseline) => `translate(${tx.toFixed(2)} ${baseline.toFixed(2)}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})`;

// Her çalıştırmada aynı yerde duran yıldızlar (sabit tohumlu rastgele)
let seed = 1915;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const starField = (count, x, y, w, h, alpha) => Array.from({ length: count }, (_, i) =>
  `<circle class="tw${i % 3}" cx="${(x + random() * w).toFixed(1)}" cy="${(y + random() * h).toFixed(1)}" r="${(.8 + random() * 1.1).toFixed(2)}" fill="#fff" fill-opacity="${alpha.toFixed(3)}"/>`).join("");

// Günün renk şeridi: 20 dakikada bir örnek
const stripX = 640, stripW = W - PAD - stripX, stripY = 452;
const stripStops = [];
for (let m = 0; m <= 1440; m += 20) {
  const p = sunPosition(dateAt(today, m));
  const col = palette(p.alt, p.hourAngle < 0);
  stripStops.push(`<stop offset="${(m / 1440).toFixed(4)}" stop-color="${toHex(mix(col.mid, col.hor, .5))}"/>`);
}
const markerX = stripX + stripW * today.minutes / 1440;

// Denizde güneşin (gece ayın) yansıdığı yerde kayan parıltılar
const glintColor = sunVisible > .3 ? c.sun : [246, 243, 234];
const glintAlpha = .55 * Math.max(sunVisible, moonAlpha * .6);
const glintCenter = sunVisible > .3 ? sunX : moonX;
const glints = glintAlpha < .05 ? "" : Array.from({ length: 6 }, (_, i) => {
  const width = 18 + random() * 46;
  const x = glintCenter + (random() - .5) * sunR * 4 - width / 2;
  const y = horizon + (seaBottom - horizon) * (.18 + random() * .6);
  return `<rect class="glint" style="animation-delay:${(i * .85).toFixed(2)}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="2" rx="1" fill="${toHex(glintColor)}" fill-opacity="${glintAlpha.toFixed(3)}"/>`;
}).join("");

// Gece arada bir kayan yıldız
const shootingStar = stars < .6 ? "" : `<g class="shoot"><line x1="1010" y1="112" x2="1074" y2="88" stroke="url(#shoot)" stroke-width="2.2" stroke-linecap="round"/></g>`;

const degrees = Math.round(Math.abs(alt));
const status = `${clock(today.minutes)} itibarıyla ${phase} · güneş ufkun ${degrees}° ${alt >= 0 ? "üstünde" : "altında"}`;
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Eyüp Çalışkanöztürk — full-stack developer, Çanakkale</title>
<desc id="desc">Soyadının harflerinin içinde Çanakkale'nin gökyüzü: ${esc(status)}.</desc>
<style>
  .tw0 { animation: tw 3.8s ease-in-out infinite; }
  .tw1 { animation: tw 5.2s ease-in-out infinite .9s; }
  .tw2 { animation: tw 4.4s ease-in-out infinite 2.1s; }
  .led { animation: led 2.4s ease-in-out infinite; }
  .rise1 { animation: rise 1.1s cubic-bezier(.16, 1, .3, 1) both; }
  .rise2 { animation: rise 1.1s cubic-bezier(.16, 1, .3, 1) .16s both; }
  .fade { animation: fade 1.2s ease .6s both; }
  .halo { animation: breathe 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .glint { animation: glint 5s ease-in-out infinite both; }
  .shoot { opacity: 0; animation: shoot 9s linear 2.5s infinite; }
  .pulse { animation: pulse 2.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes tw { 50% { opacity: .35; } }
  @keyframes led { 50% { opacity: .45; } }
  @keyframes rise { from { transform: translateY(34px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes breathe { 50% { transform: scale(1.08); opacity: .8; } }
  @keyframes glint { 0%, 100% { opacity: 0; transform: translateX(-16px); } 50% { opacity: 1; transform: translateX(16px); } }
  @keyframes shoot { 0% { opacity: 0; transform: translate(0, 0); } 2% { opacity: 1; } 11% { opacity: 0; transform: translate(-460px, 170px); } 100% { opacity: 0; transform: translate(-460px, 170px); } }
  @keyframes pulse { from { transform: scale(.7); opacity: .9; } to { transform: scale(2); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .tw0, .tw1, .tw2, .led, .rise1, .rise2, .fade, .halo, .glint, .pulse { animation: none; }
    .shoot { display: none; }
  }
</style>
<defs>
  <radialGradient id="haze" cx="${(sunX / W).toFixed(3)}" cy=".62" r=".55">
    <stop offset="0" stop-color="${toHex(c.accent)}" stop-opacity=".16"/><stop offset=".72" stop-color="${toHex(c.accent)}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="${skyTop.toFixed(1)}" x2="0" y2="${horizon.toFixed(1)}">
    <stop offset="0" stop-color="${toHex(c.top)}"/><stop offset=".55" stop-color="${toHex(c.mid)}"/><stop offset="1" stop-color="${toHex(c.hor)}"/>
  </linearGradient>
  <linearGradient id="sea" gradientUnits="userSpaceOnUse" x1="0" y1="${horizon.toFixed(1)}" x2="0" y2="${seaBottom.toFixed(1)}">
    <stop offset="0" stop-color="${toHex(sea)}"/><stop offset="1" stop-color="${toHex(seaDeep)}"/>
  </linearGradient>
  <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${sunR.toFixed(1)}">
    <stop offset="0" stop-color="${toHex(c.sun)}" stop-opacity="${sunVisible.toFixed(3)}"/><stop offset=".2" stop-color="${toHex(c.sun)}" stop-opacity="${sunVisible.toFixed(3)}"/>
    <stop offset=".3" stop-color="${toHex(c.glow)}" stop-opacity="${sunVisible.toFixed(3)}"/><stop offset="1" stop-color="${toHex(c.glow)}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${(sunR * 4.5).toFixed(1)}">
    <stop offset="0" stop-color="${toHex(c.glow)}" stop-opacity="${(.45 * sunVisible).toFixed(3)}"/><stop offset=".7" stop-color="${toHex(c.glow)}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="moon">
    <stop offset="0" stop-color="#f6f3ea" stop-opacity="${moonAlpha.toFixed(3)}"/><stop offset=".34" stop-color="#f6f3ea" stop-opacity="${moonAlpha.toFixed(3)}"/>
    <stop offset=".44" stop-color="#aab4ff" stop-opacity="${(moonAlpha * .3).toFixed(3)}"/><stop offset="1" stop-color="#aab4ff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="reflection">
    <stop offset="0" stop-color="${toHex(c.sun)}" stop-opacity="${reflection.toFixed(3)}"/><stop offset=".72" stop-color="${toHex(c.sun)}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="day" gradientUnits="userSpaceOnUse" x1="${stripX}" y1="0" x2="${stripX + stripW}" y2="0">${stripStops.join("")}</linearGradient>
  <linearGradient id="shoot" gradientUnits="userSpaceOnUse" x1="1010" y1="112" x2="1074" y2="88">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="surname"><path transform="${nameTransform(base2)}" d="${NAME.second.path}"/></clipPath>
</defs>

<rect width="${W}" height="${H}" rx="24" fill="${toHex(bg)}"/>
<rect width="${W}" height="${H}" rx="24" fill="url(#haze)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" fill="none" stroke="#fff" stroke-opacity=".07"/>
${starField(46, 20, 90, W - 40, 380, stars * .5)}
${shootingStar}

<g class="fade">
  <circle class="led" cx="${PAD + 5}" cy="58" r="5" fill="#4dff7c"/>
  <text x="${PAD + 20}" y="64" font-family="${SANS}" font-size="19" fill="#c9c2b6">Full-stack developer · Çanakkale, Türkiye</text>
  <text x="${W - PAD}" y="64" text-anchor="end" font-family="${MONO}" font-size="15" fill="#a29d91">${esc(status)}</text>
</g>

<g class="rise1"><path transform="${nameTransform(base1)}" fill="#e6b443" d="${NAME.first.path}"/></g>
<g class="rise2">
  <g clip-path="url(#surname)">
    <rect x="0" y="${(skyTop - 4).toFixed(1)}" width="${W}" height="${(seaBottom - skyTop + 8).toFixed(1)}" fill="url(#sky)"/>
    ${starField(28, PAD, skyTop + 6, SPAN, horizon - skyTop - 14, stars)}
    <circle class="halo" cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${(sunR * 4.5).toFixed(1)}" fill="url(#halo)"/>
    <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${sunR.toFixed(1)}" fill="url(#sun)"/>
    <circle cx="${moonX.toFixed(1)}" cy="${moonY.toFixed(1)}" r="${(sunR * .55).toFixed(1)}" fill="url(#moon)"/>
    <rect x="0" y="${horizon.toFixed(1)}" width="${W}" height="${(seaBottom - horizon + 6).toFixed(1)}" fill="url(#sea)"/>
    <ellipse cx="${sunX.toFixed(1)}" cy="${seaBottom.toFixed(1)}" rx="${(sunR * .45).toFixed(1)}" ry="${((seaBottom - horizon) * .95).toFixed(1)}" fill="url(#reflection)"/>
    ${glints}
  </g>
  <path transform="${nameTransform(base2)}" d="${NAME.second.path}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
</g>

<g class="fade">
  <text x="${PAD}" y="${stripY + 10}" font-family="${MONO}" font-size="14" fill="#8f887e">Harflerin içinde Çanakkale'nin gökyüzü · yarım saatte bir yenilenir</text>
  <rect x="${stripX}" y="${stripY}" width="${stripW}" height="10" rx="5" fill="url(#day)"/>
  <rect x="${stripX}" y="${stripY}" width="${stripW}" height="10" rx="5" fill="none" stroke="#fff" stroke-opacity=".12"/>
  ${["00", "06", "12", "18", "24"].map((label, i) => `<text x="${(stripX + stripW * i / 4).toFixed(1)}" y="${stripY + 34}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#7d766e">${label}</text>`).join("")}
  <circle cx="${markerX.toFixed(1)}" cy="${stripY + 5}" r="16" fill="${toHex(c.glow)}" fill-opacity="${(.35 * Math.max(sunVisible, .4)).toFixed(3)}"/>
  <circle class="pulse" cx="${markerX.toFixed(1)}" cy="${stripY + 5}" r="9" fill="none" stroke="${toHex(alt > -6 ? c.sun : [244, 241, 232])}" stroke-width="2"/>
  <circle cx="${markerX.toFixed(1)}" cy="${stripY + 5}" r="9" fill="${toHex(alt > -6 ? c.sun : [244, 241, 232])}" stroke="${toHex(bg)}" stroke-width="2.5"/>
</g>
</svg>
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, svg);
console.log(`${outFile} yazıldı · ${status} · ${(svg.length / 1024).toFixed(1)} KB`);
