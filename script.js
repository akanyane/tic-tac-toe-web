'use strict';

/* ==========================================================
   Constants & DOM
   ========================================================== */
const HUMAN = 'X';
const AI = 'O';
const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],            // diagonals
];
const LEVELS = ['easy', 'medium', 'hard'];
const STORAGE_KEY = 'ttt-state-v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel) => document.querySelector(sel);

const boardWrap = $('#boardWrap');
const boardEl = $('#board');
const cells = [...document.querySelectorAll('.cell')];
const winSvg = $('#winSvg');
const winLine = $('#winLine');
const statusEl = $('#status');
const playAgainBtn = $('#playAgain');
const resetScoreBtn = $('#resetScore');
const difficultyEl = $('#difficulty');
const levelButtons = [...difficultyEl.querySelectorAll('button')];
const pill = difficultyEl.querySelector('.pill');
const cardYou = $('#cardYou');
const cardAi = $('#cardAi');
const scoreEls = {
    you: $('#yourScore'),
    ai: $('#computerScore'),
    tie: $('#tie'),
};

const SVG_X = '<svg class="mark mark-x" viewBox="0 0 100 100" aria-hidden="true">'
    + '<path pathLength="1" d="M24 24 L76 76"/><path pathLength="1" d="M76 24 L24 76"/></svg>';
const SVG_O = '<svg class="mark mark-o" viewBox="0 0 100 100" aria-hidden="true">'
    + '<circle pathLength="1" cx="50" cy="50" r="28" transform="rotate(-90 50 50)"/></svg>';

/* ==========================================================
   State
   ========================================================== */
const state = {
    board: Array(9).fill(null),
    turn: HUMAN,
    starter: HUMAN,      // alternates every round
    over: false,
    locked: false,       // true while the board is being cleared
    difficulty: 'hard',
    scores: { you: 0, ai: 0, tie: 0 },
    winLine: null,
    aiTimer: null,
    round: 0,            // bumps on every new round; stale timers check it
};

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved) return;
        for (const key of Object.keys(state.scores)) {
            const n = Number(saved.scores?.[key]);
            if (Number.isFinite(n) && n >= 0) state.scores[key] = Math.floor(n);
        }
        if (LEVELS.includes(saved.difficulty)) state.difficulty = saved.difficulty;
    } catch { /* storage unavailable — defaults are fine */ }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            scores: state.scores,
            difficulty: state.difficulty,
        }));
    } catch { /* ignore */ }
}

/* ==========================================================
   Rules & AI
   ========================================================== */
function getWinner(board) {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { player: board[a], line };
        }
    }
    return null;
}

function emptyCells(board) {
    const out = [];
    board.forEach((v, i) => { if (!v) out.push(i); });
    return out;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Classic minimax. Faster wins / slower losses score better (depth term).
function minimax(board, player, depth) {
    const winner = getWinner(board);
    if (winner) return winner.player === AI ? 10 - depth : depth - 10;

    const moves = emptyCells(board);
    if (moves.length === 0) return 0;

    let best = player === AI ? -Infinity : Infinity;
    for (const i of moves) {
        board[i] = player;
        const score = minimax(board, player === AI ? HUMAN : AI, depth + 1);
        board[i] = null;
        best = player === AI ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
}

// Best move, choosing randomly among equally good ones so games vary.
function bestMove(board) {
    const moves = emptyCells(board);
    if (moves.length === 9) return pick([0, 2, 4, 6, 8]);

    let bestScore = -Infinity;
    let choices = [];
    for (const i of moves) {
        board[i] = AI;
        const score = minimax(board, HUMAN, 1);
        board[i] = null;
        if (score > bestScore) {
            bestScore = score;
            choices = [i];
        } else if (score === bestScore) {
            choices.push(i);
        }
    }
    return pick(choices);
}

function chooseMove() {
    const board = [...state.board];
    const moves = emptyCells(board);
    switch (state.difficulty) {
        case 'easy':   return pick(moves);
        case 'medium': return Math.random() < 0.6 ? bestMove(board) : pick(moves);
        default:       return bestMove(board);
    }
}

/* ==========================================================
   Game flow
   ========================================================== */
function place(index, player) {
    state.board[index] = player;
    const cell = cells[index];
    cell.innerHTML = player === HUMAN ? SVG_X : SVG_O;
    cell.classList.add('filled');
    cell.setAttribute('aria-disabled', 'true');
    cell.setAttribute('aria-label', `Cell ${index + 1}, ${player === HUMAN ? 'X (you)' : 'O (computer)'}`);
}

function humanMove(index) {
    if (state.over || state.locked || state.turn !== HUMAN || state.board[index]) return;
    place(index, HUMAN);
    if (!checkEnd()) scheduleAi();
}

function scheduleAi() {
    state.turn = AI;
    updateUI();
    const round = state.round;
    state.aiTimer = setTimeout(() => {
        state.aiTimer = null;
        if (round !== state.round || state.over) return;
        const index = chooseMove();
        place(index, AI);
        sparkAtCell(cells[index], ['#f472b6', '#fb923c']);
        if (!checkEnd()) {
            state.turn = HUMAN;
            updateUI();
        }
    }, 450 + Math.random() * 350);
}

function checkEnd() {
    const winner = getWinner(state.board);
    const full = state.board.every(Boolean);
    if (!winner && !full) return false;

    state.over = true;
    let key;

    if (winner) {
        key = winner.player === HUMAN ? 'you' : 'ai';
        boardEl.dataset.winner = winner.player;
        boardEl.classList.add('has-winner');
        winner.line.forEach((i) => cells[i].classList.add('win'));
        state.winLine = winner.line;
        drawWinLine(true);

        if (winner.player === HUMAN) {
            setStatus('win');
            setTimeout(confetti, 350);
        } else {
            setStatus('lose');
            restartAnimation(boardWrap, 'shake');
        }
    } else {
        key = 'tie';
        boardEl.classList.add('is-draw');
        setStatus('draw');
    }

    state.scores[key] += 1;
    renderScores(key);
    saveState();

    state.starter = state.starter === HUMAN ? AI : HUMAN;
    playAgainBtn.classList.add('attention');
    updateUI();
    return true;
}

function startRound() {
    clearTimeout(state.aiTimer);
    state.aiTimer = null;
    state.round += 1;
    const round = state.round;

    const hasMarks = state.board.some(Boolean);
    state.locked = true;
    boardEl.classList.add('is-clearing');
    winSvg.classList.remove('show');
    playAgainBtn.classList.remove('attention');
    updateUI();

    setTimeout(() => {
        if (round !== state.round) return;

        state.board.fill(null);
        state.over = false;
        state.locked = false;
        state.winLine = null;
        state.turn = state.starter;

        cells.forEach((cell, i) => {
            cell.innerHTML = '';
            cell.classList.remove('filled', 'win');
            cell.removeAttribute('aria-disabled');
            cell.setAttribute('aria-label', `Cell ${i + 1}, empty`);
        });
        boardEl.classList.remove('is-clearing', 'has-winner', 'is-draw');
        delete boardEl.dataset.winner;

        if (state.turn === AI) scheduleAi();
        else updateUI();
    }, hasMarks && !reduceMotion ? 260 : 0);
}

/* ==========================================================
   Rendering
   ========================================================== */
function updateUI() {
    const playing = !state.over && !state.locked;
    boardEl.classList.toggle('can-play', playing && state.turn === HUMAN);
    cardYou.classList.toggle('active', playing && state.turn === HUMAN);
    cardAi.classList.toggle('active', playing && state.turn === AI);

    if (playing) setStatus(state.turn === HUMAN ? 'yourTurn' : 'thinking');
}

const STATUS = {
    yourTurn: '<span class="status-chip"><span class="dot dot-x"></span>Your turn</span>',
    thinking: '<span class="status-chip"><span class="dot dot-o"></span>Computer is thinking'
        + '<span class="dots"><i></i><i></i><i></i></span></span>',
    win:  '<span class="result result-win">You won!</span>',
    lose: '<span class="result result-lose">You lost</span>',
    draw: '<span class="result result-draw">It’s a draw</span>',
};

let currentStatus = null;
function setStatus(kind) {
    if (kind === currentStatus) return;
    currentStatus = kind;
    statusEl.innerHTML = STATUS[kind];
}

function renderScores(bumpKey) {
    for (const [key, el] of Object.entries(scoreEls)) {
        el.textContent = state.scores[key];
    }
    if (bumpKey) restartAnimation(scoreEls[bumpKey], 'bump');
}

function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add(className);
}

function drawWinLine(animate) {
    if (!state.winLine) return;
    const first = cells[state.winLine[0]];
    const last = cells[state.winLine[2]];
    const center = (el) => [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2];

    let [x1, y1] = center(first);
    let [x2, y2] = center(last);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ext = first.offsetWidth * 0.3; // stretch the line past the outer marks
    x1 -= (dx / len) * ext; y1 -= (dy / len) * ext;
    x2 += (dx / len) * ext; y2 += (dy / len) * ext;

    winSvg.setAttribute('viewBox', `0 0 ${boardEl.clientWidth} ${boardEl.clientHeight}`);
    winLine.setAttribute('x1', x1);
    winLine.setAttribute('y1', y1);
    winLine.setAttribute('x2', x2);
    winLine.setAttribute('y2', y2);
    if (animate) restartAnimation(winSvg, 'show');
}

/* ==========================================================
   Difficulty (segmented control with sliding pill)
   ========================================================== */
function setDifficulty(level, focus = false) {
    state.difficulty = level;
    levelButtons.forEach((btn) => {
        const active = btn.dataset.level === level;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
        if (active && focus) btn.focus();
    });
    movePill();
    saveState();
}

function movePill() {
    const active = levelButtons.find((b) => b.dataset.level === state.difficulty);
    if (!active) return;
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
}

levelButtons.forEach((btn) => {
    btn.addEventListener('click', () => setDifficulty(btn.dataset.level));
});

difficultyEl.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = LEVELS.indexOf(state.difficulty);
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + LEVELS.length) % LEVELS.length;
    setDifficulty(LEVELS[next], true);
});

/* ==========================================================
   Visual effects
   ========================================================== */

// Split text: each letter blurs/slides in with a stagger.
function splitText(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    [...text].forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.setAttribute('aria-hidden', 'true');
        span.style.setProperty('--i', i);
        span.textContent = ch === ' ' ? ' ' : ch;
        el.appendChild(span);
    });
}

// Spotlight: radial highlight that follows the cursor.
function initSpotlights() {
    document.querySelectorAll('.spotlight').forEach((el) => {
        el.addEventListener('pointermove', (e) => {
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${e.clientX - r.left}px`);
            el.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
    });
}

// Tilt: board leans toward the cursor.
function initTilt() {
    if (reduceMotion) return;
    const MAX = 7;
    boardWrap.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = boardWrap.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        boardEl.style.setProperty('--ry', `${px * MAX}deg`);
        boardEl.style.setProperty('--rx', `${-py * MAX}deg`);
    });
    boardWrap.addEventListener('pointerleave', () => {
        boardEl.style.setProperty('--ry', '0deg');
        boardEl.style.setProperty('--rx', '0deg');
    });
}

// Magnet: buttons drift toward a nearby cursor.
function initMagnets() {
    if (reduceMotion) return;
    const magnets = [...document.querySelectorAll('.magnet')];
    const RANGE = 90;
    const STRENGTH = 0.3;
    window.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        for (const el of magnets) {
            const r = el.getBoundingClientRect();
            const dx = e.clientX - (r.left + r.width / 2);
            const dy = e.clientY - (r.top + r.height / 2);
            const near = Math.abs(dx) < r.width / 2 + RANGE && Math.abs(dy) < r.height / 2 + RANGE;
            el.style.transform = near ? `translate(${dx * STRENGTH}px, ${dy * STRENGTH}px)` : '';
        }
    });
}

// Canvas helper sized to the viewport with DPR scaling.
function fitCanvas(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Twinkling starfield behind everything.
function initStars() {
    const canvas = $('#stars');
    const ctx = canvas.getContext('2d');
    let stars = [];

    function resize() {
        fitCanvas(canvas, ctx);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const count = Math.round(Math.min(90, (w * h) / 14000));
        stars = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.1 + 0.3,
            speed: Math.random() * 0.2 + 0.04,
            phase: Math.random() * Math.PI * 2,
        }));
        if (reduceMotion) draw(0);
    }

    function draw(t) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        for (const s of stars) {
            ctx.globalAlpha = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.0015 + s.phase));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            if (!reduceMotion) {
                s.y -= s.speed;
                if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; }
            }
        }
        ctx.globalAlpha = 1;
    }

    function loop(t) {
        draw(t);
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();
    if (!reduceMotion) requestAnimationFrame(loop);
}

// Foreground particle engine: click sparks + confetti.
const fx = (() => {
    const canvas = $('#fx');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let raf = null;

    function step() {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        particles = particles.filter((p) => {
            p.life += 1;
            if (p.life > p.max) return false;
            (p.kind === 'spark' ? drawSpark : drawConfetti)(p);
            return true;
        });
        raf = particles.length ? requestAnimationFrame(step) : null;
    }

    function drawSpark(p) {
        const t = p.life / p.max;
        const eased = 1 - Math.pow(1 - t, 3);
        const dist = eased * p.radius;
        const len = p.len * (1 - eased);
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 1 - t * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x + cos * dist, p.y + sin * dist);
        ctx.lineTo(p.x + cos * (dist + len), p.y + sin * (dist + len));
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawConfetti(p) {
        p.vy += 0.22;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const fade = Math.min(1, (p.max - p.life) / 30);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.life * p.flip)); // paper-flip wobble
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    }

    function add(list) {
        particles.push(...list);
        if (!raf) raf = requestAnimationFrame(step);
    }

    function resize() { fitCanvas(canvas, ctx); }
    window.addEventListener('resize', resize);
    resize();

    return { add };
})();

function sparks(x, y, colors, count = 9) {
    if (reduceMotion) return;
    const offset = Math.random() * Math.PI;
    fx.add(Array.from({ length: count }, (_, i) => ({
        kind: 'spark',
        x, y,
        angle: offset + (i / count) * Math.PI * 2,
        radius: 26 + Math.random() * 10,
        len: 12,
        color: colors[i % colors.length],
        life: 0,
        max: 24,
    })));
}

function sparkAtCell(cell, colors) {
    const r = cell.getBoundingClientRect();
    sparks(r.left + r.width / 2, r.top + r.height / 2, colors, 12);
}

function confetti() {
    if (reduceMotion) return;
    const r = boardEl.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * 0.35;
    const colors = ['#22d3ee', '#818cf8', '#f472b6', '#fb923c', '#a78bfa', '#ffffff'];
    fx.add(Array.from({ length: 140 }, () => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = 7 + Math.random() * 9;
        return {
            kind: 'confetti',
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            flip: 0.1 + Math.random() * 0.15,
            w: 6 + Math.random() * 5,
            h: 9 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 0,
            max: 130 + Math.random() * 50,
        };
    }));
}

/* ==========================================================
   Events
   ========================================================== */
cells.forEach((cell, i) => cell.addEventListener('click', () => humanMove(i)));

playAgainBtn.addEventListener('click', startRound);

resetScoreBtn.addEventListener('click', () => {
    state.scores = { you: 0, ai: 0, tie: 0 };
    renderScores();
    saveState();
});

// Click spark everywhere; cyan when it's a valid move.
document.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    const validMove = cell && boardEl.classList.contains('can-play') && !cell.classList.contains('filled');
    sparks(e.clientX, e.clientY, validMove ? ['#22d3ee', '#818cf8'] : ['rgba(255,255,255,0.85)']);
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        cells[i].focus();
        humanMove(i);
    } else if (e.key === 'r' || e.key === 'R') {
        startRound();
    }
});

window.addEventListener('resize', () => {
    movePill();
    drawWinLine(false);
});

/* ==========================================================
   Init
   ========================================================== */
loadState();
splitText($('#title'));
renderScores();
setDifficulty(state.difficulty);
initSpotlights();
initTilt();
initMagnets();
initStars();
startRound();

// Fonts change button widths; re-measure, then enable the pill transition.
(document.fonts?.ready ?? Promise.resolve()).then(() => {
    movePill();
    requestAnimationFrame(() => difficultyEl.classList.add('ready'));
});
