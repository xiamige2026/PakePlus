'use strict';

/* ================= 常量 ================= */
const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

const NEXT_CELL = 18;
const NEXT_SLOTS = 5;
const NEXT_SLOT_H = 60;
const HOLD_CELL = 18;
const PREVIEW_W = 100;

const SOFT_DROP_MS = 22;
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const DAS_MS = 150;
const ARR_MS = 35;
const CLEAR_DUR = 200;
const SHAKE_DUR = 320;

const GRAVITY = [1000, 850, 700, 570, 450, 350, 270, 200, 150, 110, 90, 70, 55, 45, 35, 28, 22, 18, 14, 11, 9];

/* ================= 方块定义 ================= */
const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
};

const COLORS = {
  I: '#2ee6f6',
  J: '#4a7cff',
  L: '#ff9f2e',
  O: '#ffd93d',
  S: '#3ddc84',
  T: '#b06bff',
  Z: '#ff5470'
};

/* SRS 旋转墙踢表（y 向上为正，实际使用时取反） */
const KICK_JLZST = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};

const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};

/* 预生成 4 个旋转状态 */
function rotateCW(m) {
  const n = m.length;
  const out = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) row.push(m[n - 1 - x][y]);
    out.push(row);
  }
  return out;
}

const STATES = {};
TYPES.forEach(function (t) {
  const list = [SHAPES[t]];
  for (let i = 1; i < 4; i++) list.push(rotateCW(list[i - 1]));
  STATES[t] = list;
});

/* ================= 音效 ================= */
const Sound = (function () {
  let ac = null;
  let muted = false;

  function ready() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) ac = new AC();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type, vol, to) {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function later(fn, ms) { window.setTimeout(fn, ms); }

  return {
    move: function () { tone(200, 0.045, 'square', 0.03); },
    rotate: function () { tone(420, 0.055, 'triangle', 0.045); },
    lock: function () { tone(150, 0.07, 'sine', 0.05, 90); },
    hold: function () { tone(320, 0.06, 'sine', 0.045); },
    drop: function () { tone(120, 0.09, 'sawtooth', 0.045, 60); },
    clear: function (n) {
      for (let i = 0; i < n; i++) {
        (function (k) {
          later(function () { tone(560 * Math.pow(1.26, k), 0.11, 'triangle', 0.06); }, k * 45);
        })(i);
      }
    },
    tetris: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        later(function () { tone(f, 0.17, 'triangle', 0.07); }, i * 62);
      });
    },
    level: function () {
      [660, 990].forEach(function (f, i) {
        later(function () { tone(f, 0.15, 'triangle', 0.06); }, i * 95);
      });
    },
    over: function () {
      [440, 330, 247, 165].forEach(function (f, i) {
        later(function () { tone(f, 0.3, 'sawtooth', 0.05); }, i * 135);
      });
    },
    toggle: function () {
      muted = !muted;
      if (!muted) tone(700, 0.08, 'triangle', 0.05);
      return muted;
    },
    isMuted: function () { return muted; }
  };
})();

/* ================= DOM ================= */
const dom = {
  board: document.getElementById('board'),
  hold: document.getElementById('hold'),
  next: document.getElementById('next'),
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  level: document.getElementById('level'),
  lines: document.getElementById('lines'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ovTitle'),
  ovText: document.getElementById('ovText'),
  ovBtn: document.getElementById('ovBtn'),
  toast: document.getElementById('toast'),
  btnSound: document.getElementById('btnSound'),
  btnPause: document.getElementById('btnPause'),
  btnRestart: document.getElementById('btnRestart'),
  touch: document.getElementById('touch')
};

/* ================= 画布视图 ================= */
function createView(canvas, lw, lh) {
  const ctx = canvas.getContext('2d');
  const view = { canvas: canvas, ctx: ctx, lw: lw, lh: lh, scale: 1 };
  view.resize = function () {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const s = Math.min(cssW / lw, cssH / lh);
    view.scale = s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, (cssW - lw * s) * dpr / 2, (cssH - lh * s) * dpr / 2);
  };
  view.resize();
  return view;
}

const boardView = createView(dom.board, BOARD_W, BOARD_H);
const holdView = createView(dom.hold, PREVIEW_W, 80);
const nextView = createView(dom.next, PREVIEW_W, NEXT_SLOT_H * NEXT_SLOTS);

/* ================= 绘制小工具 ================= */
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function mix(a, b, t) {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
    Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
    Math.round(A[2] + (B[2] - A[2]) * t) + ')';
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (typeof g.roundRect === 'function') {
    g.roundRect(x, y, w, h, r);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* 方块贴图缓存（每种颜色 + 尺寸只生成一次，保证 60fps） */
const spriteCache = {};

function sprite(color, size) {
  const key = color + '_' + size;
  if (spriteCache[key]) return spriteCache[key];
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = Math.max(1, size * 0.045);
  const x = pad;
  const y = pad;
  const s = size - pad * 2;
  const r = Math.max(2, size * 0.17);

  const grad = g.createLinearGradient(x, y, x + s, y + s);
  grad.addColorStop(0, mix(color, '#ffffff', 0.45));
  grad.addColorStop(0.48, color);
  grad.addColorStop(1, mix(color, '#000000', 0.34));
  g.fillStyle = grad;
  roundRect(g, x, y, s, s, r);
  g.fill();

  g.lineWidth = Math.max(1, size * 0.05);
  g.strokeStyle = 'rgba(0,0,0,.32)';
  roundRect(g, x, y, s, s, r);
  g.stroke();

  g.globalAlpha = 0.5;
  g.fillStyle = '#ffffff';
  roundRect(g, x + s * 0.17, y + s * 0.13, s * 0.66, s * 0.11, s * 0.05);
  g.fill();

  g.globalAlpha = 0.2;
  g.fillStyle = '#000000';
  roundRect(g, x + s * 0.17, y + s * 0.73, s * 0.66, s * 0.13, s * 0.05);
  g.fill();
  g.globalAlpha = 1;

  spriteCache[key] = c;
  return c;
}

function drawBlock(ctx, px, py, size, color) {
  ctx.drawImage(sprite(color, size), px, py, size, size);
}

function drawGhostBlock(ctx, px, py, size, color) {
  const pad = Math.max(1, size * 0.045);
  const x = px + pad;
  const y = py + pad;
  const s = size - pad * 2;
  const r = Math.max(2, size * 0.17);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, s, s, r);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1.5, size * 0.075);
  ctx.strokeStyle = color;
  roundRect(ctx, x, y, s, s, r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ================= 游戏状态 ================= */
let grid = [];
let piece = null;
let queue = [];
let holdType = null;
let holdUsed = false;
let score = 0;
let best = 0;
let level = 1;
let linesCleared = 0;
let combo = -1;
let b2b = false;

let state = 'ready';
let dropAcc = 0;
let lockAcc = 0;
let lockResets = 0;
let softDrop = false;
let moveDir = 0;
let dasTimer = 0;
let arrTimer = 0;
let clearRows = [];
let clearTimer = 0;
let lastAction = 'spawn';

let shakeTime = 0;
let shakePower = 0;
let particles = [];
let trail = null;
let lastFrame = 0;

/* ================= 存档 ================= */
function loadBest() {
  try {
    const v = window.localStorage.getItem('tetris.best');
    return v ? parseInt(v, 10) || 0 : 0;
  } catch (e) { return 0; }
}

function saveBest(v) {
  try { window.localStorage.setItem('tetris.best', String(v)); } catch (e) { /* 忽略 */ }
}

/* 最高分写入去抖，避免连降时频繁写 localStorage */
let bestSaveTimer = null;

function saveBestSoon() {
  if (bestSaveTimer) return;
  bestSaveTimer = window.setTimeout(function () {
    bestSaveTimer = null;
    saveBest(best);
  }, 400);
}

/* ================= 基础逻辑 ================= */
function emptyGrid() {
  const g = [];
  for (let y = 0; y < ROWS; y++) g.push(new Array(COLS).fill(null));
  return g;
}

function refillQueue() {
  while (queue.length < NEXT_SLOTS + 1) {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
    for (let i = 0; i < bag.length; i++) queue.push(bag[i]);
  }
}

function spawnX(type) { return type === 'O' ? 4 : 3; }
function spawnY(type) { return type === 'O' ? 0 : -1; }

function canPlace(type, rot, x, y) {
  const m = STATES[type][rot];
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      const cx = x + j;
      const cy = y + i;
      if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
      if (cy >= 0 && grid[cy][cx]) return false;
    }
  }
  return true;
}

function grounded() {
  return !canPlace(piece.type, piece.rot, piece.x, piece.y + 1);
}

function gravityMs() {
  return GRAVITY[Math.min(level, GRAVITY.length - 1)];
}

function canPlay() {
  return state === 'playing' && !!piece;
}

function onPieceChanged() {
  if (!piece) return;
  if (grounded() && lockResets < MAX_LOCK_RESETS) {
    lockAcc = 0;
    lockResets++;
  }
}

function tryMove(dx, dy) {
  if (!piece) return false;
  if (!canPlace(piece.type, piece.rot, piece.x + dx, piece.y + dy)) return false;
  piece.x += dx;
  piece.y += dy;
  if (dx !== 0) lastAction = 'move';
  if (dy > 0) lockResets = 0;
  onPieceChanged();
  return true;
}

/* ================= 开局 / 结束 ================= */
function newGame() {
  grid = emptyGrid();
  queue = [];
  refillQueue();
  holdType = null;
  holdUsed = false;
  score = 0;
  level = 1;
  linesCleared = 0;
  combo = -1;
  b2b = false;
  particles = [];
  trail = null;
  shakeTime = 0;
  softDrop = false;
  moveDir = 0;
  clearRows = [];
  state = 'playing';
  setOverlay(null);
  spawnNext();
  updateHUD();
}

function spawnNext() {
  const type = queue.shift();
  refillQueue();
  piece = { type: type, rot: 0, x: spawnX(type), y: spawnY(type) };
  holdUsed = false;
  dropAcc = 0;
  lockAcc = 0;
  lockResets = 0;
  lastAction = 'spawn';
  if (!canPlace(type, 0, piece.x, piece.y)) gameOver();
}

function gameOver() {
  state = 'over';
  piece = null;
  updateHUD();
  setOverlay('over');
  Sound.over();
  shake(12, 380);
}

/* ================= 操作 ================= */
function pressDir(d) {
  moveDir = d;
  dasTimer = DAS_MS;
  arrTimer = 0;
  if (!canPlay()) return;
  if (tryMove(d, 0)) Sound.move();
}

function rotatePiece(dir) {
  if (!canPlay()) return;
  if (piece.type === 'O') return;
  const from = piece.rot;
  const to = (from + dir + 4) % 4;
  const table = piece.type === 'I' ? KICK_I : KICK_JLZST;
  const kicks = table[from + '>' + to] || [[0, 0]];
  for (let i = 0; i < kicks.length; i++) {
    const dx = kicks[i][0];
    const dy = kicks[i][1];
    if (canPlace(piece.type, to, piece.x + dx, piece.y - dy)) {
      piece.rot = to;
      piece.x += dx;
      piece.y -= dy;
      lastAction = 'rotate';
      onPieceChanged();
      Sound.rotate();
      return;
    }
  }
}

function holdPiece() {
  if (!canPlay() || holdUsed) return;
  const cur = piece.type;
  if (holdType === null) {
    holdType = cur;
    spawnNext();
  } else {
    const swap = holdType;
    holdType = cur;
    piece = { type: swap, rot: 0, x: spawnX(swap), y: spawnY(swap) };
    dropAcc = 0;
    lockAcc = 0;
    lockResets = 0;
    if (!canPlace(swap, 0, piece.x, piece.y)) { gameOver(); return; }
  }
  holdUsed = true;
  Sound.hold();
}

function hardDrop() {
  if (!canPlay()) return;
  const m = STATES[piece.type][piece.rot];
  let minJ = 9;
  let maxJ = -1;
  let minI = 9;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
      if (i < minI) minI = i;
    }
  }
  let dist = 0;
  while (canPlace(piece.type, piece.rot, piece.x, piece.y + 1)) {
    piece.y++;
    dist++;
  }
  score += dist * 2;
  if (dist > 0) {
    trail = {
      x0: (piece.x + minJ) * CELL,
      x1: (piece.x + maxJ + 1) * CELL,
      y1: (piece.y + minI) * CELL,
      h: dist * CELL,
      color: COLORS[piece.type],
      t: 1
    };
    const cells = [];
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (m[i][j]) cells.push([piece.x + j, piece.y + i]);
      }
    }
    for (let k = 0; k < cells.length; k++) {
      burst(cells[k][0] * CELL + CELL / 2, cells[k][1] * CELL + CELL / 2, COLORS[piece.type], 4, 170);
    }
    shake(Math.min(9, 2.5 + dist * 0.5), 220);
    Sound.drop();
  }
  dropAcc = 0;
  lockResets = 0;
  lock();
}

/* ================= 锁定与计分 ================= */
function detectTSpin() {
  if (!piece || piece.type !== 'T' || lastAction !== 'rotate') return false;
  const corners = [
    [piece.x, piece.y],
    [piece.x + 2, piece.y],
    [piece.x, piece.y + 2],
    [piece.x + 2, piece.y + 2]
  ];
  let filled = 0;
  for (let k = 0; k < corners.length; k++) {
    const cx = corners[k][0];
    const cy = corners[k][1];
    if (cx < 0 || cx >= COLS || cy >= ROWS) { filled++; continue; }
    if (cy < 0) continue;
    if (grid[cy][cx]) filled++;
  }
  return filled >= 3;
}

function lock() {
  const type = piece.type;
  const m = STATES[type][piece.rot];
  let placedAny = false;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      const gx = piece.x + j;
      const gy = piece.y + i;
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
        grid[gy][gx] = type;
        placedAny = true;
      }
    }
  }

  const tspin = detectTSpin();
  const full = [];
  for (let y = 0; y < ROWS; y++) {
    let complete = true;
    for (let x = 0; x < COLS; x++) {
      if (!grid[y][x]) { complete = false; break; }
    }
    if (complete) full.push(y);
  }

  piece = null;
  Sound.lock();
  applyScore(full.length, tspin);

  if (!placedAny) { gameOver(); return; }

  if (full.length) {
    for (let k = 0; k < full.length; k++) burstLine(full[k]);
    clearRows = full;
    clearTimer = 0;
    state = 'clearing';
    if (full.length === 4) { shake(11, 300); Sound.tetris(); } else { shake(5, 180); Sound.clear(full.length); }
  } else {
    spawnNext();
  }
}

function applyScore(n, tspin) {
  let pts = 0;
  let title = '';

  if (tspin) {
    if (n === 0) { pts = 400; title = 'T-SPIN'; }
    else if (n === 1) { pts = 800; title = 'T-SPIN 单'; }
    else if (n === 2) { pts = 1200; title = 'T-SPIN 双'; }
    else { pts = 1600; title = 'T-SPIN 三'; }
  } else {
    pts = [0, 100, 300, 500, 800][n] || 0;
    title = ['', '单行消除', '双行消除', '三行消除', 'TETRIS'][n] || '';
  }

  let sub = '';
  if (n > 0) {
    const difficult = (n === 4) || tspin;
    combo++;
    if (difficult && b2b) { pts = Math.floor(pts * 1.5); sub = 'B2B'; }
    if (combo > 0) {
      pts += 50 * combo;
      sub = (sub ? sub + ' · ' : '') + 'COMBO x' + combo;
    }
    b2b = difficult;
  } else {
    combo = -1;
  }

  const prevLevel = level;
  score += pts;
  linesCleared += n;
  level = Math.floor(linesCleared / 10) + 1;

  if (title && (n >= 2 || tspin)) toast(title, sub);
  if (level > prevLevel) Sound.level();
  updateHUD();
  if (n > 0) {
    bump(dom.score);
    bump(dom.lines);
  }
}

function finishClear() {
  clearRows.sort(function (a, b) { return a - b; });
  for (let k = 0; k < clearRows.length; k++) {
    grid.splice(clearRows[k], 1);
    grid.unshift(new Array(COLS).fill(null));
  }
  clearRows = [];
  state = 'playing';
  dropAcc = 0;
  spawnNext();
}

/* ================= 粒子 / 抖动 ================= */
function burst(cx, cy, color, count, spread) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * spread;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 1,
      color: color,
      size: 1.6 + Math.random() * 2.8
    });
  }
  if (particles.length > 520) particles.splice(0, particles.length - 520);
}

function burstLine(y) {
  for (let x = 0; x < COLS; x++) {
    burst(x * CELL + CELL / 2, y * CELL + CELL / 2, grid[y][x] ? COLORS[grid[y][x]] : '#ffffff', 3, 160);
  }
}

function shake(power, dur) {
  shakePower = power;
  shakeTime = dur;
}

/* ================= HUD ================= */
function updateHUD() {
  if (score > best) {
    best = score;
    saveBestSoon();
  }
  if (dom.score.textContent !== String(score)) dom.score.textContent = score;
  if (dom.best.textContent !== String(best)) dom.best.textContent = best;
  if (dom.level.textContent !== String(level)) dom.level.textContent = level;
  if (dom.lines.textContent !== String(linesCleared)) dom.lines.textContent = linesCleared;
}

function bump(el) {
  const box = el.parentNode;
  box.classList.remove('bump');
  void box.offsetWidth;
  box.classList.add('bump');
}

function toast(title, sub) {
  dom.toast.textContent = title;
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    dom.toast.appendChild(s);
  }
  dom.toast.classList.remove('show');
  void dom.toast.offsetWidth;
  dom.toast.classList.add('show');
}

function setOverlay(mode) {
  if (!mode) {
    dom.overlay.classList.add('hidden');
    return;
  }
  dom.overlay.classList.remove('hidden');
  if (mode === 'ready') {
    dom.ovTitle.textContent = '俄罗斯方块';
    dom.ovText.textContent = '堆叠、消行，挑战你的极限';
    dom.ovBtn.textContent = '开始游戏';
  } else if (mode === 'paused') {
    dom.ovTitle.textContent = '已暂停';
    dom.ovText.textContent = '按 P 或点击下方按钮继续';
    dom.ovBtn.textContent = '继续游戏';
  } else {
    dom.ovTitle.textContent = '游戏结束';
    dom.ovText.textContent = '本局得分 ' + score + '\n最高分 ' + best + ' · 等级 ' + level;
    dom.ovBtn.textContent = '再来一局';
  }
}

/* ================= 主循环 ================= */
function update(dt) {
  if (!piece) return;

  /* DAS：按住方向键连续横移 */
  if (moveDir !== 0) {
    if (dasTimer > 0) {
      dasTimer -= dt;
    } else {
      arrTimer -= dt;
      let guard = 0;
      while (arrTimer <= 0 && guard++ < 12) {
        if (!tryMove(moveDir, 0)) { arrTimer = ARR_MS; break; }
        arrTimer += ARR_MS;
      }
    }
  }

  /* 重力 */
  const g = softDrop ? Math.min(gravityMs(), SOFT_DROP_MS) : gravityMs();
  dropAcc += dt;
  let guard = 0;
  while (dropAcc >= g && guard++ < 24) {
    dropAcc -= g;
    if (canPlace(piece.type, piece.rot, piece.x, piece.y + 1)) {
      piece.y++;
      lockResets = 0;
      if (softDrop) score++;
    } else {
      dropAcc = 0;
      break;
    }
  }

  /* 锁定延迟 */
  if (grounded()) {
    lockAcc += dt;
    if (lockAcc >= LOCK_DELAY) lock();
  } else {
    lockAcc = 0;
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt / 650;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += 1100 * dt / 1000;
    p.x += p.vx * dt / 1000;
    p.y += p.vy * dt / 1000;
  }
  if (trail) {
    trail.t -= dt / 240;
    if (trail.t <= 0) trail = null;
  }
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  let dt = now - lastFrame;
  lastFrame = now;
  if (dt > 100) dt = 100;

  if (state === 'playing') {
    update(dt);
  } else if (state === 'clearing') {
    clearTimer += dt;
    if (clearTimer >= CLEAR_DUR) finishClear();
  }

  updateParticles(dt);
  if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
  if (softDrop || moveDir !== 0) updateHUD();

  draw();
  window.requestAnimationFrame(frame);
}

/* ================= 渲染 ================= */
function draw() {
  const ctx = boardView.ctx;
  ctx.save();
  if (shakeTime > 0) {
    const k = shakeTime / SHAKE_DUR;
    const p = shakePower * k;
    ctx.translate((Math.random() - 0.5) * p, (Math.random() - 0.5) * p);
  }

  ctx.clearRect(-30, -30, BOARD_W + 60, BOARD_H + 60);
  drawBackground(ctx);
  drawStack(ctx);
  drawGhost(ctx);
  drawCurrent(ctx);
  drawClearFlash(ctx);
  drawTrail(ctx);
  drawParticles(ctx);
  ctx.restore();

  drawPreviews();
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  g.addColorStop(0, '#0b1226');
  g.addColorStop(1, '#06090f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  ctx.strokeStyle = 'rgba(110,155,255,.075)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, BOARD_H);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(BOARD_W, y * CELL + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(90,180,255,.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2);
}

function drawStack(ctx) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = grid[y][x];
      if (t) drawBlock(ctx, x * CELL, y * CELL, CELL, COLORS[t]);
    }
  }
}

function drawGhost(ctx) {
  if (!canPlay()) return;
  let gy = piece.y;
  while (canPlace(piece.type, piece.rot, piece.x, gy + 1)) gy++;
  if (gy === piece.y) return;
  const m = STATES[piece.type][piece.rot];
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      const cy = gy + i;
      if (cy < 0) continue;
      drawGhostBlock(ctx, (piece.x + j) * CELL, cy * CELL, CELL, COLORS[piece.type]);
    }
  }
}

function drawCurrent(ctx) {
  if (!canPlay()) return;
  const m = STATES[piece.type][piece.rot];
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      const cy = piece.y + i;
      if (cy < 0) continue;
      drawBlock(ctx, (piece.x + j) * CELL, cy * CELL, CELL, COLORS[piece.type]);
    }
  }
}

function drawClearFlash(ctx) {
  if (!clearRows.length) return;
  const t = Math.min(1, clearTimer / CLEAR_DUR);
  const a = (1 - t) * 0.85;
  for (let k = 0; k < clearRows.length; k++) {
    const y = clearRows[k] * CELL;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, y, BOARD_W, CELL);
    ctx.globalAlpha = a * 0.6;
    ctx.fillStyle = '#7cf0ff';
    const h = CELL * (1 - t) * 0.55;
    ctx.fillRect(0, y + (CELL - h) / 2, BOARD_W, h);
  }
  ctx.globalAlpha = 1;
}

function drawTrail(ctx) {
  if (!trail) return;
  const a = trail.t * 0.5;
  const g = ctx.createLinearGradient(0, trail.y1 - trail.h, 0, trail.y1);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, trail.color);
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(trail.x0, trail.y1 - trail.h, trail.x1 - trail.x0, trail.h);
  ctx.globalAlpha = 1;
}

function drawParticles(ctx) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPreviews() {
  const hctx = holdView.ctx;
  hctx.clearRect(0, 0, holdView.lw, holdView.lh);
  if (holdType) {
    hctx.globalAlpha = holdUsed ? 0.35 : 1;
    drawPreview(hctx, holdType, holdView.lw / 2, holdView.lh / 2, HOLD_CELL);
    hctx.globalAlpha = 1;
  }

  const nctx = nextView.ctx;
  nctx.clearRect(0, 0, nextView.lw, nextView.lh);
  const count = Math.min(NEXT_SLOTS, queue.length);
  for (let i = 0; i < count; i++) {
    nctx.globalAlpha = i === 0 ? 1 : 0.82 - i * 0.11;
    drawPreview(nctx, queue[i], nextView.lw / 2, NEXT_SLOT_H * i + NEXT_SLOT_H / 2, NEXT_CELL);
  }
  nctx.globalAlpha = 1;
}

function drawPreview(ctx, type, cx, cy, cell) {
  const m = STATES[type][0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (!m[i][j]) continue;
      if (j < minX) minX = j;
      if (j > maxX) maxX = j;
      if (i < minY) minY = i;
      if (i > maxY) maxY = i;
    }
  }
  const w = (maxX - minX + 1) * cell;
  const h = (maxY - minY + 1) * cell;
  const ox = cx - w / 2 - minX * cell;
  const oy = cy - h / 2 - minY * cell;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (m[i][j]) drawBlock(ctx, ox + j * cell, oy + i * cell, cell, COLORS[type]);
    }
  }
}

/* ================= 输入 ================= */
let heldLeft = false;
let heldRight = false;

function releaseDir(d) {
  if (d < 0) heldLeft = false;
  else heldRight = false;
  if (d < 0 && heldRight) {
    moveDir = 1;
    dasTimer = DAS_MS;
    arrTimer = 0;
  } else if (d > 0 && heldLeft) {
    moveDir = -1;
    dasTimer = DAS_MS;
    arrTimer = 0;
  } else {
    moveDir = 0;
  }
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    softDrop = false;
    moveDir = 0;
    heldLeft = false;
    heldRight = false;
    setOverlay('paused');
  } else if (state === 'paused') {
    state = 'playing';
    setOverlay(null);
  }
}

function primaryAction() {
  if (state === 'ready' || state === 'over') newGame();
  else if (state === 'paused') togglePause();
}

window.addEventListener('keydown', function (e) {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') {
    e.preventDefault();
  }

  if (state === 'ready') {
    if (k === ' ' || k === 'Enter') newGame();
    return;
  }
  if (state === 'over') {
    if (k === ' ' || k === 'Enter' || k === 'r' || k === 'R') newGame();
    return;
  }
  if (e.repeat) return;
  if (state === 'clearing' && k !== 'p' && k !== 'P' && k !== 'Escape') return;

  switch (k) {
    case 'ArrowLeft':
      heldLeft = true;
      pressDir(-1);
      break;
    case 'ArrowRight':
      heldRight = true;
      pressDir(1);
      break;
    case 'ArrowDown':
      softDrop = true;
      break;
    case 'ArrowUp':
    case 'x':
    case 'X':
      rotatePiece(1);
      break;
    case 'z':
    case 'Z':
    case 'a':
    case 'A':
      rotatePiece(-1);
      break;
    case ' ':
      hardDrop();
      break;
    case 'c':
    case 'C':
    case 'Shift':
      holdPiece();
      break;
    case 'p':
    case 'P':
    case 'Escape':
      togglePause();
      break;
    case 'r':
    case 'R':
      newGame();
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', function (e) {
  if (e.key === 'ArrowLeft') releaseDir(-1);
  else if (e.key === 'ArrowRight') releaseDir(1);
  else if (e.key === 'ArrowDown') softDrop = false;
});

window.addEventListener('blur', function () {
  heldLeft = false;
  heldRight = false;
  moveDir = 0;
  softDrop = false;
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden && state === 'playing') togglePause();
});

/* 触屏按键 */
function touchAction(act, down) {
  if (!down) {
    if (act === 'left') releaseDir(-1);
    else if (act === 'right') releaseDir(1);
    else if (act === 'soft') softDrop = false;
    return;
  }
  if (state === 'ready' || state === 'over') { newGame(); return; }
  if (state === 'paused') { togglePause(); return; }
  if (state !== 'playing') return;

  if (act === 'left') { heldLeft = true; pressDir(-1); }
  else if (act === 'right') { heldRight = true; pressDir(1); }
  else if (act === 'soft') softDrop = true;
  else if (act === 'cw') rotatePiece(1);
  else if (act === 'ccw') rotatePiece(-1);
  else if (act === 'hold') holdPiece();
  else if (act === 'hard') hardDrop();
}

if (dom.touch) {
  const buttons = dom.touch.querySelectorAll('button');
  for (let i = 0; i < buttons.length; i++) {
    (function (btn) {
      const act = btn.getAttribute('data-act');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.classList.add('on');
        touchAction(act, true);
      });
      btn.addEventListener('pointerup', function () {
        btn.classList.remove('on');
        touchAction(act, false);
      });
      btn.addEventListener('pointercancel', function () {
        btn.classList.remove('on');
        touchAction(act, false);
      });
      btn.addEventListener('pointerleave', function () {
        btn.classList.remove('on');
        touchAction(act, false);
      });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    })(buttons[i]);
  }
}

if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('has-touch');
}
if ('ontouchstart' in window) document.body.classList.add('has-touch');

/* 按钮 */
dom.ovBtn.addEventListener('click', function () {
  if (state === 'paused') togglePause();
  else newGame();
});

dom.btnPause.addEventListener('click', function () {
  if (state === 'ready' || state === 'over') newGame();
  else togglePause();
});

dom.btnRestart.addEventListener('click', newGame);

dom.btnSound.addEventListener('click', function () {
  const muted = Sound.toggle();
  dom.btnSound.classList.toggle('off', muted);
  dom.btnSound.textContent = muted ? '🔇 静音' : '🔊 音效';
});

/* 尺寸变化 */
function resizeAll() {
  boardView.resize();
  holdView.resize();
  nextView.resize();
}

window.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', function () { window.setTimeout(resizeAll, 120); });
if (window.ResizeObserver) {
  const ro = new ResizeObserver(resizeAll);
  ro.observe(dom.board);
  ro.observe(dom.hold);
  ro.observe(dom.next);
}

/* ================= 启动 ================= */
best = loadBest();
grid = emptyGrid();
refillQueue();
updateHUD();
setOverlay('ready');
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(resizeAll);
}
window.requestAnimationFrame(function (t) {
  lastFrame = t;
  window.requestAnimationFrame(frame);
});
