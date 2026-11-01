#!/usr/bin/env node
// Profil README'sindeki yazı yazan terminal: assets/terminal.svg
// ---------------------------------------------------------------
// Komutlar daktilo gibi yazılır, çıktılar belirir, sonda imleç yanıp söner.
// Animasyon SMIL ile; GitHub'daki <img> içinde de (Safari dahil) çalışır.
// Harf genişlikleri tutsun diye JetBrains Mono'nun yalnızca kullanılan karakterleri gömülür.
//
//   1) node scripts/terminal.mjs --chars          → gereken karakterleri yazar
//   2) Google Fonts'tan bu karakterleri içeren değişken JetBrains Mono woff2 dosyasını indir:
//      https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&text=<karakterler>
//   3) node scripts/terminal.mjs jetbrains-mono.woff2 [assets/terminal.svg]

import { readFileSync, writeFileSync } from "node:fs";

// Satırlar: komut ya da renkli parçalardan oluşan çıktı. [metin, renk, kalın?]
const GOLD = "#e6b443", SKY = "#63b3ff", INK = "#f1ece2", MUTED = "#a9a39a", GREEN = "#4dff7c", PINK = "#ff8fc0";
const LINES = [
  { cmd: "whoami" },
  { out: [["Eyüp Çalışkanöztürk", GOLD, true], [" · full-stack developer · Çanakkale", MUTED]] },
  { cmd: "cat motto.txt" },
  { out: [["\"Proje canlıya çıkana kadar bitmiş sayılmaz.\"", PINK]] },
  { cmd: "ls canli/" },
  { out: ["efomat.com", "matbaakent.com", "bedirhanikincielspot.com", "canakkalesehitlik.com", "on7reklam.com"]
      .flatMap((site, i) => [[i ? "  ● " : "● ", GREEN], [site, SKY]]) },
  { cmd: "./tekyaz --version" },
  { out: [["TEKYAZ IT v1.7", GOLD, true], [" · WPF / .NET 8 · USB'den kurulumsuz çalışır", MUTED]] },
  { cmd: "stack --short" },
  { out: [["PHP · Laravel · MySQL · C# · .NET 8 · Next.js · React · Node.js · Three.js", INK]] }
];
const USER = "eyup@canakkale", PROMPT_TEXT = `${USER}:~$ `;

const allText = PROMPT_TEXT + LINES.map((line) => line.cmd || line.out.map(([text]) => text).join("")).join("") + "terminal: ~";
if (process.argv[2] === "--chars") {
  process.stdout.write([...new Set(allText)].sort().join(""));
  process.exit(0);
}

const [fontPath, outFile = "assets/terminal.svg"] = process.argv.slice(2);
if (!fontPath) throw new Error("Kullanım: node scripts/terminal.mjs jetbrains-mono.woff2 [çıktı.svg]");
const fontData = readFileSync(fontPath).toString("base64");

// Ölçüler: JetBrains Mono'da her karakter 0.6em genişliğinde
const W = 1200, PAD = 40, SIZE = 17, CW = SIZE * .6, LH = 30, TOP = 46;
const firstBaseline = TOP + 38;
const H = firstBaseline + LINES.length * LH + 30;
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Zaman çizelgesi (saniye)
const TYPE = .055, AFTER_TYPE = .25, NEXT = .45;
let t = .8;
const parts = [];
const prompt = () => `<tspan fill="${GOLD}" font-weight="700">${USER}</tspan><tspan fill="${INK}">:</tspan><tspan fill="${SKY}">~</tspan><tspan fill="${MUTED}">$ </tspan>`;
const promptWidth = PROMPT_TEXT.length * CW;

LINES.forEach((line, index) => {
  const y = firstBaseline + index * LH;
  if (line.cmd) {
    const n = line.cmd.length;
    const startType = t + .3;
    const widths = Array.from({ length: n + 1 }, (_, k) => (k * CW).toFixed(1)).join(";");
    const cursorX = Array.from({ length: n + 1 }, (_, k) => (PAD + promptWidth + k * CW).toFixed(1)).join(";");
    const typeDur = (n * TYPE).toFixed(3);
    parts.push(`<g opacity="0"><set attributeName="opacity" to="1" begin="${t.toFixed(2)}s" fill="freeze"/>
  <text x="${PAD}" y="${y}">${prompt()}</text>
  <clipPath id="c${index}"><rect x="${(PAD + promptWidth).toFixed(1)}" y="${y - SIZE - 2}" height="${LH}" width="0"><animate attributeName="width" values="${widths}" begin="${startType.toFixed(2)}s" dur="${typeDur}s" calcMode="discrete" fill="freeze"/></rect></clipPath>
  <text x="${(PAD + promptWidth).toFixed(1)}" y="${y}" fill="${INK}" clip-path="url(#c${index})">${esc(line.cmd)}</text>
  <rect y="${y - SIZE + 2}" width="${(CW * .9).toFixed(1)}" height="${SIZE + 2}" fill="${GOLD}" x="${(PAD + promptWidth).toFixed(1)}"><animate attributeName="x" values="${cursorX}" begin="${startType.toFixed(2)}s" dur="${typeDur}s" calcMode="discrete" fill="freeze"/><set attributeName="opacity" to="0" begin="${(startType + n * TYPE + AFTER_TYPE).toFixed(2)}s" fill="freeze"/></rect>
</g>`);
    t = startType + n * TYPE + AFTER_TYPE;
  } else {
    const spans = line.out.map(([text, color, bold]) => `<tspan fill="${color}"${bold ? ' font-weight="700"' : ""}>${esc(text)}</tspan>`).join("");
    parts.push(`<text x="${PAD}" y="${y}" opacity="0">${spans}<animate attributeName="opacity" from="0" to="1" begin="${t.toFixed(2)}s" dur=".18s" fill="freeze"/></text>`);
    t += NEXT;
  }
});

// Son istem ve sonsuza dek yanıp sönen imleç
const lastY = firstBaseline + LINES.length * LH;
parts.push(`<g opacity="0"><set attributeName="opacity" to="1" begin="${t.toFixed(2)}s" fill="freeze"/>
  <text x="${PAD}" y="${lastY}">${prompt()}</text>
  <rect x="${(PAD + promptWidth).toFixed(1)}" y="${lastY - SIZE + 2}" width="${(CW * .9).toFixed(1)}" height="${SIZE + 2}" fill="${GOLD}"><animate attributeName="opacity" values="1;0" dur="1.1s" begin="${t.toFixed(2)}s" repeatCount="indefinite" calcMode="discrete"/></rect>
</g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Terminal: Eyüp Çalışkanöztürk hakkında</title>
<desc id="desc">${esc(LINES.map((line) => line.cmd ? `$ ${line.cmd}` : line.out.map(([text]) => text).join("")).join(" / "))}</desc>
<style>
  @font-face { font-family: "JBM"; font-weight: 100 800; src: url(data:font/woff2;base64,${fontData}) format("woff2"); }
  text { font-family: "JBM", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: ${SIZE}px; white-space: pre; }
</style>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121626"/><stop offset="1" stop-color="#0b0d14"/></linearGradient>
  <radialGradient id="glow" cx=".12" cy="0" r=".7"><stop offset="0" stop-color="${GOLD}" stop-opacity=".12"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="18" fill="url(#glow)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
<path d="M0 ${TOP}H${W}" stroke="#fff" stroke-opacity=".07"/>
<circle cx="28" cy="23" r="6.5" fill="#ff5f57"/><circle cx="50" cy="23" r="6.5" fill="#febc2e"/><circle cx="72" cy="23" r="6.5" fill="#28c840"/>
<text x="${W / 2}" y="28" text-anchor="middle" fill="#8b8fa3" style="font-size:14px">${USER}: ~</text>
${parts.join("\n")}
</svg>
`;
writeFileSync(outFile, svg);
console.log(`${outFile} yazıldı · ${(svg.length / 1024).toFixed(1)} KB · animasyon ${t.toFixed(1)} sn`);
