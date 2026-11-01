#!/usr/bin/env node
// Dörtlü (Connect Four): profil README'sinde oynanan oyun
// ---------------------------------------------------------------
// Ziyaretçi README'deki bir sütuna tıklar; "dortlu|sutun|N" başlıklı bir issue açılır.
// .github/workflows/dortlu.yml bu betiği çalıştırır: hamle oynanır, bot cevap verir,
// tahta (game/sutun-1..7.svg) ve README bölümü yeniden çizilir, issue'ya cevap yazılıp kapatılır.
//
//   ISSUE_TITLE="dortlu|sutun|4" ISSUE_USER=login ISSUE_NUMBER=12 node game/dortlu.mjs move
//   node game/dortlu.mjs render   → README bölümünü ve tahtayı durumdan yeniden üretir
//   node game/dortlu.mjs reset    → boş yeni oyun (skorlar ve son hamleler korunur)

import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(here, "dortlu.json");
const README_FILE = resolve(here, "..", "README.md");
const REPO = /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY || "") ? process.env.GITHUB_REPOSITORY : "eyupcalskanozturk-tr/eyupcalskanozturk-tr";
const PROFILE_URL = `https://github.com/${REPO.split("/")[0]}`;
const ROWS = 6, COLS = 7, HUMAN = 1, BOT = 2;
const START = "<!-- DORTLU:START -->", END = "<!-- DORTLU:END -->";

// ───────── Oyun kuralları ─────────
const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const dropRow = (board, col) => { for (let r = ROWS - 1; r >= 0; r--) if (!board[r][col]) return r; return -1; };
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // ortadan kenara: hem bot için iyi, hem alfa-beta budamasını hızlandırır
const validMoves = (board) => ORDER.filter((c) => board[0][c] === 0);
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function winLine(board, player) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of DIRS) {
    const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
    if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === player)) return cells;
  }
  return null;
}
const isFull = (board) => board[0].every((cell) => cell !== 0);

// ───────── Bot: alfa-beta budamalı minimax (6 hamle derinlik) ─────────
function windowScore(cells, player) {
  const opponent = player === BOT ? HUMAN : BOT;
  const mine = cells.filter((v) => v === player).length;
  const theirs = cells.filter((v) => v === opponent).length;
  const empty = cells.length - mine - theirs;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -5;
  return 0;
}
function evaluate(board) {
  let score = board.reduce((sum, row) => sum + (row[3] === BOT ? 3 : 0), 0);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of DIRS) {
    const cells = [];
    for (let k = 0; k < 4; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
      cells.push(board[rr][cc]);
    }
    if (cells.length === 4) score += windowScore(cells, BOT);
  }
  return score;
}
function minimax(board, depth, alpha, beta, maximizing) {
  if (winLine(board, BOT)) return 1e6 + depth;
  if (winLine(board, HUMAN)) return -1e6 - depth;
  const moves = validMoves(board);
  if (!moves.length) return 0;
  if (depth === 0) return evaluate(board);
  let best = maximizing ? -Infinity : Infinity;
  for (const col of moves) {
    const row = dropRow(board, col);
    board[row][col] = maximizing ? BOT : HUMAN;
    const value = minimax(board, depth - 1, alpha, beta, !maximizing);
    board[row][col] = 0;
    if (maximizing) { best = Math.max(best, value); alpha = Math.max(alpha, value); }
    else { best = Math.min(best, value); beta = Math.min(beta, value); }
    if (alpha >= beta) break;
  }
  return best;
}
function botMove(board) {
  const scored = validMoves(board).map((col) => {
    const row = dropRow(board, col);
    board[row][col] = BOT;
    const value = minimax(board, 5, -Infinity, Infinity, false);
    board[row][col] = 0;
    return { col, value };
  });
  const best = Math.max(...scored.map((s) => s.value));
  const top = scored.filter((s) => s.value === best);
  return top[Math.floor(Math.random() * top.length)].col; // eşit iyi hamleler arasından rastgele: her oyun aynı gitmesin
}

// ───────── Durum ─────────
function newGame(previous = {}) {
  return {
    game: (previous.game || 0) + 1,
    version: (previous.version || 0) + 1,
    board: emptyBoard(),
    moves: 0,
    over: false,
    result: null,
    winLine: null,
    last: [],
    stats: previous.stats || { ziyaretci: 0, bot: 0, berabere: 0 },
    recent: previous.recent || []
  };
}
const load = () => JSON.parse(readFileSync(STATE_FILE, "utf8"));
const save = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

// ───────── Çizim: tıklanabilir sütunlar ─────────
// Tahta 7 ayrı sütun görselinden oluşur (game/sutun-1..7.svg). README'de her görsel kendi
// hamle linkine sarılıp boşluksuz yan yana dizilir: tahtada bir sütuna tıklamak o sütuna
// taş atar. (Linksiz bir görsele tıklamak GitHub'da SVG'yi yeni sekmede açar.)
const COLW = 76, HEAD = 56, CELL = 76, PANEL_H = ROWS * CELL, COLH = HEAD + PANEL_H + 12;
const discX = COLW / 2, discY = (r) => HEAD + r * CELL + CELL / 2;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function statusText(state) {
  if (!state.over) return state.moves ? "Sıra sende: tahtada bir sütuna tıkla" : "Yeni oyun: ilk hamle senin, bir sütuna tıkla";
  if (state.result.winner === "ziyaretci") return `@${state.result.login} botu yendi! Yeni oyun için bir sütuna tıkla`;
  if (state.result.winner === "bot") return "Bot kazandı. Rövanş için bir sütuna tıkla";
  return "Berabere! Yeni oyun için bir sütuna tıkla";
}
function renderColumn(state, c) {
  const full = state.board[0][c] !== 0 && !state.over;
  const winSet = new Set((state.winLine || []).map(([r, cc]) => `${r},${cc}`));
  const lastIndex = new Map(state.last.map((m, i) => [`${m.r},${m.c}`, i]));
  const parts = [];
  for (let r = 0; r < ROWS; r++) {
    parts.push(`<circle cx="${discX}" cy="${discY(r)}" r="27" fill="#090b16"/>`);
    const cell = state.board[r][c];
    if (!cell) continue;
    const key = `${r},${c}`, order = lastIndex.get(key), lift = -(discY(r) - HEAD + CELL);
    // Son iki taş yukarıdan düşer (önce ziyaretçininki, sonra botunki)
    const fall = order === undefined ? "" :
      `<animateTransform attributeName="transform" type="translate" from="0 ${lift}" to="0 0" begin="${(.3 + order * .75).toFixed(2)}s" dur="${(.35 + r * .05).toFixed(2)}s" calcMode="spline" keyTimes="0;1" keySplines=".55 0 1 .45" fill="freeze"/>`;
    const startAt = order === undefined ? "" : ` transform="translate(0 ${lift})"`;
    const ring = order === state.last.length - 1 && !state.winLine
      ? `<circle cx="${discX}" cy="${discY(r)}" r="30" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>` : "";
    parts.push(`<g${startAt}${winSet.has(key) ? ' class="win"' : ""}>${fall}<circle cx="${discX}" cy="${discY(r)}" r="27" fill="url(#${cell === HUMAN ? "blue" : "gold"})"/><circle cx="${discX - 8}" cy="${discY(r) - 9}" r="8" fill="#fff" fill-opacity=".22"/>${ring}</g>`);
  }
  // Kazanan çizgi tahtanın genel koordinatlarında çizilir; her sütun kendi payını gösterir.
  const line = state.winLine ? (() => {
    const [a, b] = [state.winLine[0], state.winLine[3]];
    const x = (col) => col * COLW + COLW / 2 - c * COLW;
    return `<line class="glow" x1="${x(a[1])}" y1="${discY(a[0])}" x2="${x(b[1])}" y2="${discY(b[0])}" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-opacity=".85"/>`;
  })() : "";
  const arrow = state.over ? "#e6b443" : "#3ea7ff";
  const header = full
    ? `<text x="${discX}" y="24" text-anchor="middle" font-family="${MONO}" font-size="17" fill="#4a4652">${c + 1}</text><path d="M${discX - 6} 33l12 11M${discX + 6} 33l-12 11" stroke="#4a4652" stroke-width="2.5" stroke-linecap="round"/>`
    : `<text x="${discX}" y="24" text-anchor="middle" font-family="${MONO}" font-size="17" fill="#8b949e">${c + 1}</text><path class="bob" style="animation-delay:${(c * .12).toFixed(2)}s" d="M${discX - 9} 34l9 9 9-9" fill="none" stroke="${arrow}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COLW}" height="${COLH}" viewBox="0 0 ${COLW} ${COLH}" role="img" aria-labelledby="t">
<title id="t">${full ? `${c + 1}. sütun dolu` : `${c + 1}. sütuna taş at`}</title>
<style>
  .win { animation: pulse 1.4s ease-in-out infinite; }
  .glow { animation: glow 1.4s ease-in-out infinite; }
  .bob { animation: bob 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .78; } }
  @keyframes glow { 50% { stroke-opacity: .35; } }
  @keyframes bob { 50% { transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .win, .glow, .bob { animation: none; } }
</style>
<defs>
  <radialGradient id="blue" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#9fe0ff"/><stop offset=".55" stop-color="#3ea7ff"/><stop offset="1" stop-color="#1d5fd0"/></radialGradient>
  <radialGradient id="gold" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#f2b53a"/><stop offset="1" stop-color="#b9780f"/></radialGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2580"/><stop offset="1" stop-color="#191457"/></linearGradient>
  <clipPath id="tube"><rect x="3" y="${HEAD}" width="${COLW - 6}" height="${PANEL_H}" rx="16"/></clipPath>
</defs>
${header}
<rect x="3" y="${HEAD}" width="${COLW - 6}" height="${PANEL_H}" rx="16" fill="url(#panel)"/>
<g clip-path="url(#tube)">${parts.join("")}</g>
${line}
</svg>
`;
}

// ───────── Çizim: README bölümü ─────────
function moveLink(col) {
  const title = encodeURIComponent(`dortlu|sutun|${col}`);
  const body = encodeURIComponent("Bu sayfada hiçbir şeyi değiştirmeden **Create** (ya da **Submit new issue**) butonuna bas.\n\nHamleni oynayacağım, bot hemen cevap verecek; tahta profilde güncellenir ve bu issue kendiliğinden kapanır.");
  return `https://github.com/${REPO}/issues/new?title=${title}&body=${body}`;
}
function renderSection(state) {
  // Görseller arasında boşluk olmamalı: aksi halde sütunlar birbirinden kopar.
  const columns = Array.from({ length: COLS }, (_, c) => {
    const full = state.board[0][c] !== 0 && !state.over;
    return `<a href="${moveLink(c + 1)}"><img src="https://raw.githubusercontent.com/${REPO}/main/game/sutun-${c + 1}.svg?v=${state.version}" width="10%" alt="${full ? `${c + 1}. sütun dolu` : `${c + 1}. sütuna taş at`}"></a>`;
  }).join("");
  const { ziyaretci, bot, berabere } = state.stats;
  const recent = state.recent.length
    ? state.recent.map((m) => `<a href="https://github.com/${m.login}">@${m.login}</a> ${m.col}. sütun${m.result ? ` (${m.result})` : ""}`).join(" · ")
    : "henüz yok, ilk hamle senin olsun!";
  // Saf HTML: GitHub'da da, başka markdown işleyicilerinde de aynı görünür.
  return `${START}
<h3 align="center">Dörtlü: Eyüp'ün botunu yenebilir misin?</h3>
<p align="center">Aynı renkten <b>4 taşı</b> yan yana, alt alta ya da çapraz diz. <b>Tahtada bir sütuna tıkla</b>, açılan sayfada <b>Create</b>'e bas.<br>Hamleni oynarım, bot hemen cevap verir; tahta birkaç saniye içinde burada güncellenir.</p>
<p align="center"><b>${esc(statusText(state))}</b></p>
<p align="center">${columns}</p>
<p align="center"><sub>🔵 sen · 🟡 Eyüp'ün botu · oyun #${state.game} · hamle ${state.moves}</sub></p>
<p align="center">Ziyaretçiler <b>${ziyaretci}</b> · Bot <b>${bot}</b> · Berabere <b>${berabere}</b><br><sub>Son hamleler: ${recent}</sub></p>
${END}`;
}
function writeOutputs(state) {
  for (let c = 0; c < COLS; c++) writeFileSync(resolve(here, `sutun-${c + 1}.svg`), renderColumn(state, c));
  rmSync(resolve(here, "dortlu.svg"), { force: true }); // eski tek parça tahta
  const readme = readFileSync(README_FILE, "utf8");
  const a = readme.indexOf(START), b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error("README'de DORTLU işaretleri bulunamadı");
  writeFileSync(README_FILE, readme.slice(0, a) + renderSection(state) + readme.slice(b + END.length));
}

// ───────── Hamle ─────────
function play(state, col, login, issue) {
  if (state.over) state = newGame(state);
  const human = dropRow(state.board, col);
  if (human < 0) return { state, changed: false, reply: `${col + 1}. sütun dolu. Başka bir sütun seçip tekrar dene: ${PROFILE_URL}` };
  state.board[human][col] = HUMAN;
  state.moves += 1;
  state.last = [{ r: human, c: col, p: HUMAN }];
  state.version += 1;
  const remember = (result) => { state.recent = [{ login, col: col + 1, issue, result }, ...state.recent].slice(0, 6); };

  let line = winLine(state.board, HUMAN);
  if (line) {
    Object.assign(state, { over: true, winLine: line, result: { winner: "ziyaretci", login } });
    state.stats.ziyaretci += 1;
    remember("kazandı");
    return { state, changed: true, reply: `Tebrikler @${login}, botu yendin! Dörtlüyü ${col + 1}. sütunla tamamladın. Skor tablosunda adın var: ${PROFILE_URL}` };
  }
  if (isFull(state.board)) {
    Object.assign(state, { over: true, result: { winner: "berabere" } });
    state.stats.berabere += 1;
    remember("berabere");
    return { state, changed: true, reply: `Tahta doldu, oyun berabere bitti. Yeni oyun için profilde bir sütun seç: ${PROFILE_URL}` };
  }

  const reply = botMove(state.board);
  const bot = dropRow(state.board, reply);
  state.board[bot][reply] = BOT;
  state.moves += 1;
  state.last.push({ r: bot, c: reply, p: BOT });
  line = winLine(state.board, BOT);
  if (line) {
    Object.assign(state, { over: true, winLine: line, result: { winner: "bot" } });
    state.stats.bot += 1;
    remember("bot kazandı");
    return { state, changed: true, reply: `Taşın ${col + 1}. sütuna düştü; bot ${reply + 1}. sütunla dörtlüyü tamamladı ve kazandı. Rövanş için profilde bir sütun seç: ${PROFILE_URL}` };
  }
  if (isFull(state.board)) {
    Object.assign(state, { over: true, result: { winner: "berabere" } });
    state.stats.berabere += 1;
    remember("berabere");
    return { state, changed: true, reply: `Bot ${reply + 1}. sütuna oynadı ve tahta doldu: berabere! Yeni oyun için: ${PROFILE_URL}` };
  }
  remember(null);
  return { state, changed: true, reply: `Taşın ${col + 1}. sütuna düştü, bot ${reply + 1}. sütunla cevap verdi. Sıra yine sende: ${PROFILE_URL}` };
}

// ───────── Komut satırı ─────────
const command = process.argv[2];
const output = (key, value) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); };
const replyTo = (text) => { if (process.env.REPLY_FILE) writeFileSync(process.env.REPLY_FILE, text + "\n"); console.log(text); };

if (command === "reset") {
  let previous = {};
  try { previous = load(); } catch { /* ilk kurulum */ }
  const state = newGame(previous);
  save(state); writeOutputs(state);
  console.log(`Yeni oyun #${state.game} hazır.`);
} else if (command === "render") {
  writeOutputs(load());
  console.log("README ve tahta yeniden çizildi.");
} else if (command === "move") {
  // Girdiler issue'dan gelir: hiçbirine güvenme, sıkı kalıplarla doğrula.
  const title = String(process.env.ISSUE_TITLE || "").trim();
  const loginRaw = String(process.env.ISSUE_USER || "");
  const login = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(loginRaw) ? loginRaw : "ziyaretci";
  const issue = /^\d{1,9}$/.test(String(process.env.ISSUE_NUMBER || "")) ? Number(process.env.ISSUE_NUMBER) : null;
  const match = /^dortlu\|sutun\|([1-7])$/.exec(title);
  if (!match) {
    output("changed", "false");
    replyTo(`Bu bir Dörtlü hamlesine benzemiyor. Oynamak için profildeki sütun numaralarından birine tıkla: ${PROFILE_URL}`);
  } else {
    const result = play(load(), Number(match[1]) - 1, login, issue);
    if (result.changed) { save(result.state); writeOutputs(result.state); }
    output("changed", String(result.changed));
    replyTo(result.reply);
  }
} else {
  console.error("Kullanım: node game/dortlu.mjs move|render|reset");
  process.exit(1);
}
