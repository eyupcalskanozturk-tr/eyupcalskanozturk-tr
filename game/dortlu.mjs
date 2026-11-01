#!/usr/bin/env node
// Dörtlü (Connect Four): profil README'sinde oynanan oyun
// ---------------------------------------------------------------
// Ziyaretçi README'deki bir sütuna tıklar; "dortlu|sutun|N" başlıklı bir issue açılır.
// .github/workflows/dortlu.yml bu betiği çalıştırır: hamle oynanır, bot cevap verir,
// tahta (game/dortlu.svg) ve README bölümü yeniden çizilir, issue'ya cevap yazılıp kapatılır.
//
//   ISSUE_TITLE="dortlu|sutun|4" ISSUE_USER=login ISSUE_NUMBER=12 node game/dortlu.mjs move
//   node game/dortlu.mjs render   → README bölümünü ve tahtayı durumdan yeniden üretir
//   node game/dortlu.mjs reset    → boş yeni oyun (skorlar ve son hamleler korunur)

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(here, "dortlu.json");
const BOARD_FILE = resolve(here, "dortlu.svg");
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

// ───────── Çizim: tahta SVG'si ─────────
const CELL = 72, BX = 28, BY = 106, BW = COLS * CELL, BH = ROWS * CELL, SW = BW + BX * 2, SH = BY + BH + 74;
const cx = (c) => BX + c * CELL + CELL / 2, cy = (r) => BY + r * CELL + CELL / 2;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function statusText(state) {
  if (!state.over) return state.moves ? "Sıra sende: bir sütun seç" : "Yeni oyun: ilk hamle senin";
  if (state.result.winner === "ziyaretci") return `@${state.result.login} botu yendi!`;
  if (state.result.winner === "bot") return "Bot kazandı. Rövanş için bir sütun seç";
  return "Berabere! Yeni oyun için bir sütun seç";
}
function renderBoard(state) {
  const winSet = new Set((state.winLine || []).map(([r, c]) => `${r},${c}`));
  const lastIndex = new Map(state.last.map((m, i) => [`${m.r},${m.c}`, i]));
  const holes = [], discs = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    holes.push(`<circle cx="${cx(c)}" cy="${cy(r)}" r="27" fill="#090b16"/>`);
    const cell = state.board[r][c];
    if (!cell) continue;
    const fill = cell === HUMAN ? "url(#blue)" : "url(#gold)";
    const key = `${r},${c}`;
    const win = winSet.has(key) ? ` class="win"` : "";
    const order = lastIndex.get(key);
    // Son iki taş yukarıdan düşer (önce ziyaretçininki, sonra botunki)
    const fall = order === undefined ? "" :
      `<animateTransform attributeName="transform" type="translate" from="0 ${-(cy(r) - BY + CELL)}" to="0 0" begin="${(.3 + order * .75).toFixed(2)}s" dur="${(.35 + r * .05).toFixed(2)}s" calcMode="spline" keyTimes="0;1" keySplines=".55 0 1 .45" fill="freeze"/>`;
    const start = order === undefined ? "" : ` transform="translate(0 ${-(cy(r) - BY + CELL)})"`;
    const ring = order === state.last.length - 1 && !state.winLine ? `<circle cx="${cx(c)}" cy="${cy(r)}" r="30" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>` : "";
    discs.push(`<g${start}${win}>${fall}<circle cx="${cx(c)}" cy="${cy(r)}" r="27" fill="${fill}"/><circle cx="${cx(c) - 8}" cy="${cy(r) - 9}" r="8" fill="#fff" fill-opacity=".22"/>${ring}</g>`);
  }
  const line = state.winLine ? (() => {
    const [a, b] = [state.winLine[0], state.winLine[3]];
    return `<line class="glow" x1="${cx(a[1])}" y1="${cy(a[0])}" x2="${cx(b[1])}" y2="${cy(b[0])}" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-opacity=".85"/>`;
  })() : "";
  const accent = !state.over ? "#a9a39a" : state.result.winner === "ziyaretci" ? "#4dff7c" : state.result.winner === "bot" ? "#e6b443" : "#a9a39a";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" role="img" aria-labelledby="title">
<title id="title">Dörtlü tahtası · oyun #${state.game} · ${esc(statusText(state))}</title>
<style>
  .win { animation: pulse 1.4s ease-in-out infinite; }
  .glow { animation: glow 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .78; } }
  @keyframes glow { 50% { stroke-opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .win, .glow { animation: none; } }
</style>
<defs>
  <radialGradient id="blue" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#9fe0ff"/><stop offset=".55" stop-color="#3ea7ff"/><stop offset="1" stop-color="#1d5fd0"/></radialGradient>
  <radialGradient id="gold" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#f2b53a"/><stop offset="1" stop-color="#b9780f"/></radialGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2580"/><stop offset="1" stop-color="#191457"/></linearGradient>
  <clipPath id="inside"><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="18"/></clipPath>
</defs>
<rect width="${SW}" height="${SH}" rx="22" fill="#0d1018"/>
<rect x=".5" y=".5" width="${SW - 1}" height="${SH - 1}" rx="21.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
<text x="${SW / 2}" y="44" text-anchor="middle" font-family="${SANS}" font-size="21" font-weight="700" fill="${accent}">${esc(statusText(state))}</text>
${Array.from({ length: COLS }, (_, c) => `<text x="${cx(c)}" y="${BY - 16}" text-anchor="middle" font-family="${MONO}" font-size="16" fill="${state.board[0][c] ? "#4a4652" : "#a9a39a"}">${c + 1}</text>`).join("")}
<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="18" fill="url(#panel)"/>
<g clip-path="url(#inside)">
${holes.join("")}
${discs.join("\n")}
${line}
</g>
<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="18" fill="none" stroke="#fff" stroke-opacity=".12"/>
<circle cx="${BX + 10}" cy="${SH - 30}" r="9" fill="url(#blue)"/><text x="${BX + 26}" y="${SH - 24}" font-family="${SANS}" font-size="16" fill="#c9c2b6">sen</text>
<circle cx="${BX + 84}" cy="${SH - 30}" r="9" fill="url(#gold)"/><text x="${BX + 100}" y="${SH - 24}" font-family="${SANS}" font-size="16" fill="#c9c2b6">Eyüp'ün botu</text>
<text x="${SW - BX}" y="${SH - 24}" text-anchor="end" font-family="${MONO}" font-size="14" fill="#7d766e">oyun #${state.game} · hamle ${state.moves}</text>
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
  const keys = Array.from({ length: COLS }, (_, c) => state.board[0][c] && !state.over
    ? `<kbd>&nbsp;&nbsp;·&nbsp;&nbsp;</kbd>`
    : `<a href="${moveLink(c + 1)}"><kbd>&nbsp;&nbsp;${c + 1}&nbsp;&nbsp;</kbd></a>`).join(" ");
  const { ziyaretci, bot, berabere } = state.stats;
  const recent = state.recent.length
    ? state.recent.map((m) => `<a href="https://github.com/${m.login}">@${m.login}</a> ${m.col}. sütun${m.result ? ` (${m.result})` : ""}`).join(" · ")
    : "henüz yok, ilk hamle senin olsun!";
  // Saf HTML: GitHub'da da, başka markdown işleyicilerinde de aynı görünür.
  return `${START}
<h3 align="center">Dörtlü: Eyüp'ün botunu yenebilir misin?</h3>
<p align="center">Aynı renkten <b>4 taşı</b> yan yana, alt alta ya da çapraz diz. Bir sütun seç, açılan sayfada <b>Create</b>'e bas.<br>Hamleni oynarım, bot hemen cevap verir; tahta birkaç saniye içinde burada güncellenir.</p>
<p align="center">${keys}</p>
<p align="center"><img src="https://raw.githubusercontent.com/${REPO}/main/game/dortlu.svg?v=${state.version}" width="560" alt="Dörtlü tahtası, oyun ${state.game}: ${esc(statusText(state))}"></p>
<p align="center">Ziyaretçiler <b>${ziyaretci}</b> · Bot <b>${bot}</b> · Berabere <b>${berabere}</b><br><sub>Son hamleler: ${recent}</sub></p>
${END}`;
}
function writeOutputs(state) {
  writeFileSync(BOARD_FILE, renderBoard(state));
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
