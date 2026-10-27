"use strict";

/*
 * Arrow Escape
 * An arrow leaves only when every cell in front of it, in the direction it
 * points, is empty. Other arrows block. Empty cells do not.
 * Removing an arrow never creates a new block, so any legal move stays safe.
 */

(function (root) {
  const DIR_VECTORS = {
    U: [-1, 0],
    D: [1, 0],
    L: [0, -1],
    R: [0, 1],
  };

  const DIR_NAMES = { U: "up", D: "down", L: "left", R: "right" };

  const ARROW_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 3.5 41 20.5h-8.2V44H15.2V20.5H7L24 3.5z"/></svg>';

  const STORAGE_KEY = "arrow-escape-v1";

  // "." is an empty square. U D L R are arrows.
  const RAW_LEVELS = [
    { id: 1, name: "First Flight", grid: ["RR.", "L.U", ".D."] },
    { id: 2, name: "The Gate", grid: ["RRR", "D.U", "LLL"] },
    { id: 3, name: "Open Meadow", grid: ["RR.U", ".D.U", "LL.D", ".LL."] },
    { id: 4, name: "Corner Pocket", grid: ["RRRR", "R..D", "R..D", "LLLD"] },
    { id: 5, name: "Two Step", grid: ["RRRD", "RRRD", "LLLL"] },
    { id: 6, name: "Side Streets", grid: ["RRRR", "U..D", "U..D", "LLLL"] },
    { id: 7, name: "Zigzag", grid: ["RRRR", "LLLD", "RRRD", "LLLL"] },
    { id: 8, name: "Hallway", grid: ["ULLLL", "D...U", "D...U", "D...U", "RRRRD"] },
    { id: 9, name: "Orbit", grid: ["RRRRR", "U...D", "U.R.D", "U.D.D", "ULLLL"] },
    { id: 10, name: "Inner Court", grid: ["RRRRRR", "U.LL.D", "U.RR.D", "U.LL.D", "ULLLLL"] },
    { id: 11, name: "Spiral", grid: ["RRRRRR", "U....D", "URRR.D", "U..L.D", "U.LL.D", "ULLLLL"] },
    { id: 12, name: "Master Key", grid: ["RRRRRRR", "U.....D", "U.RRR.D", "U.U.D.D", "U.LLL.D", "U.....D", "ULLLLLL"] },
  ];

  function parseLevels(rawLevels) {
    return rawLevels.map((level) => {
      const rows = level.grid.length;
      const cols = level.grid[0].length;
      const arrows = [];
      level.grid.forEach((line, r) => {
        if (line.length !== cols) {
          throw new Error("Level " + level.id + " has uneven rows");
        }
        [...line].forEach((symbol, c) => {
          if (symbol === ".") return;
          if (!DIR_VECTORS[symbol]) {
            throw new Error("Level " + level.id + " has an unknown symbol");
          }
          arrows.push({ r, c, d: symbol });
        });
      });
      if (!arrows.length) throw new Error("Level " + level.id + " is empty");
      return { id: level.id, name: level.name, rows, cols, arrows };
    });
  }

  const LEVELS = parseLevels(RAW_LEVELS);
  const LEVEL_COUNT = LEVELS.length;
  const SCORE = { arrow: 10, clear: 100, hint: 20 };

  function adjustScore(raw, kind) {
    const current = Number.isFinite(Number(raw)) ? Math.trunc(Number(raw)) : 0;
    if (kind === "arrow") return current + SCORE.arrow;
    if (kind === "hint") return current - SCORE.hint;
    if (kind === "clear") return current + SCORE.clear;
    if (kind === "reset") return 0;
    return current;
  }

  function displayedScore(raw) {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, Number.MAX_SAFE_INTEGER);
  }

  function canEscape(arrows, arrow, rows, cols) {
    const vector = DIR_VECTORS[arrow.d];
    const occupied = new Set(arrows.map((item) => item.r + "," + item.c));
    let r = arrow.r + vector[0];
    let c = arrow.c + vector[1];
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      if (occupied.has(r + "," + c)) return false;
      r += vector[0];
      c += vector[1];
    }
    return true;
  }

  function isSolvable(level) {
    const arrows = level.arrows.map((arrow) => ({ ...arrow }));
    let guard = arrows.length;
    while (arrows.length) {
      const index = arrows.findIndex((arrow) => canEscape(arrows, arrow, level.rows, level.cols));
      if (index < 0 || guard < 0) return false;
      arrows.splice(index, 1);
      guard -= 1;
    }
    return true;
  }

  const api = {
    LEVELS,
    canEscape,
    isSolvable,
    DIR_VECTORS,
    SCORE,
    adjustScore,
    displayedScore,
    youtubeSignals: [],
    scoreReports: [],
  };
  root.ArrowEscape = api;

  if (typeof document === "undefined") return;

  const ui = {
    live: document.getElementById("live"),
    toast: document.getElementById("toast"),
    mute: document.getElementById("mute-btn"),
    play: document.getElementById("play-btn"),
    playLabel: document.getElementById("play-label"),
    playSub: document.getElementById("play-sub"),
    homeProgress: document.getElementById("home-progress"),
    levelsProgress: document.getElementById("levels-progress"),
    levelGrid: document.getElementById("level-grid"),
    levelNum: document.getElementById("level-num"),
    levelName: document.getElementById("level-name"),
    counter: document.getElementById("counter"),
    score: document.getElementById("score-line"),
    winScore: document.getElementById("win-score"),
    winBest: document.getElementById("win-best"),
    boardWrap: document.getElementById("board-wrap"),
    board: document.getElementById("board"),
    win: document.getElementById("win-modal"),
    winCard: document.querySelector("#win-modal .modal-card"),
    winKicker: document.getElementById("win-kicker"),
    winTitle: document.getElementById("win-title"),
    winCopy: document.getElementById("win-copy"),
    winNext: document.getElementById("win-next"),
    pauseOverlay: document.getElementById("pause-overlay"),
    screens: {
      home: document.getElementById("home-screen"),
      levels: document.getElementById("levels-screen"),
      help: document.getElementById("help-screen"),
      game: document.getElementById("game-screen"),
    },
  };

  const audio = {
    ctx: null,
    muted: false,
    ensure() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        if (!this.ctx) this.ctx = new AudioCtx();
        if (this.ctx.state === "suspended") this.ctx.resume();
        return this.ctx;
      } catch (err) {
        return null;
      }
    },
    nodes: [],
    tone({ freq = 440, dur = 0.08, type = "sine", gain = 0.04, delay = 0, slide = 0 }) {
      if (this.muted) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), start + dur);
      }
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      this.nodes.push(osc);
      osc.addEventListener("ended", () => {
        this.nodes = this.nodes.filter((node) => node !== osc);
      });
    },
    silence() {
      this.nodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped */ }
      });
      this.nodes = [];
      if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
    },
    leave() {
      this.tone({ freq: 523, dur: 0.09, gain: 0.04 });
      this.tone({ freq: 784, dur: 0.11, gain: 0.028, delay: 0.06 });
    },
    blocked() {
      this.tone({ freq: 196, dur: 0.13, type: "triangle", gain: 0.035, slide: -80 });
    },
    hint() {
      this.tone({ freq: 659, dur: 0.08, gain: 0.03 });
      this.tone({ freq: 880, dur: 0.1, gain: 0.022, delay: 0.07 });
    },
    win() {
      [523, 659, 784, 1046].forEach((freq, index) => {
        this.tone({ freq, dur: 0.18, gain: 0.038, delay: index * 0.11 });
      });
    },
    tap() {
      this.tone({ freq: 494, dur: 0.05, gain: 0.02 });
    },
  };

  function defaultSave() {
    return { unlocked: 1, completed: [], muted: false, current: 1, bestScore: 0 };
  }

  function readBestScore(value) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) return 0;
    return n;
  }

  function parseSaveData(data) {
    if (!data || typeof data !== "object") return defaultSave();
    const completed = Array.isArray(data.completed)
      ? [...new Set(data.completed.filter((n) => Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT))].sort((a, b) => a - b)
      : [];
    const highest = completed.reduce((max, id) => Math.max(max, id), 0);
    let unlocked = Number.isInteger(data.unlocked) ? data.unlocked : 1;
    unlocked = highest >= LEVEL_COUNT ? LEVEL_COUNT : Math.max(unlocked, highest + 1, 1);
    unlocked = Math.min(LEVEL_COUNT, Math.max(1, unlocked));
    let current = Number.isInteger(data.current) ? data.current : unlocked;
    current = Math.min(unlocked, Math.max(1, current));
    return { unlocked, completed, muted: Boolean(data.muted), current, bestScore: readBestScore(data.bestScore) };
  }

  function loadLocalSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultSave();
      return parseSaveData(JSON.parse(raw));
    } catch (err) {
      return defaultSave();
    }
  }

  function inPlayables() {
    return typeof ytgame !== "undefined" && Boolean(ytgame.IN_PLAYABLES_ENV);
  }

  function youtubeAudioEnabled() {
    if (!inPlayables() || !ytgame.system || typeof ytgame.system.isAudioEnabled !== "function") return true;
    try {
      return ytgame.system.isAudioEnabled() !== false;
    } catch (err) {
      return true;
    }
  }

  function applyAudioGate() {
    const youtubeMuted = inPlayables() && !youtubeAudioEnabled();
    audio.muted = state.paused || youtubeMuted || (!inPlayables() && save.muted);
    if (audio.muted) audio.silence();
    else if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
    if (ui.mute) ui.mute.hidden = inPlayables();
  }

  function notifyYoutube(method) {
    api.youtubeSignals.push(method);
    try {
      if (typeof ytgame !== "undefined" && ytgame.game && typeof ytgame.game[method] === "function") {
        ytgame.game[method]();
      }
    } catch (err) {
      /* The local SDK is a no-op and may be missing when offline. */
    }
  }

  function reportScore(value) {
    const score = Math.trunc(Number(value));
    if (!Number.isSafeInteger(score) || score < 0) return;
    const payload = { value: score };
    api.scoreReports.push(payload);
    if (!inPlayables() || !ytgame.engagement || typeof ytgame.engagement.sendScore !== "function") return;
    try {
      const pending = ytgame.engagement.sendScore(payload);
      if (pending && typeof pending.then === "function") pending.catch(() => {});
    } catch (err) {
      /* A missing or rejected score call must not stop the game. */
    }
  }

  let cloudLoaded = false;
  let saveChain = Promise.resolve();

  function persist() {
    const payload = JSON.stringify(save);
    if (inPlayables()) {
      if (!cloudLoaded || !ytgame.game || typeof ytgame.game.saveData !== "function") return;
      saveChain = saveChain.then(() => ytgame.game.saveData(payload)).catch(() => {});
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      /* Private browsing can block storage. The game still plays. */
    }
  }

  async function prepareSave() {
    if (!inPlayables()) {
      save = loadLocalSave();
      cloudLoaded = true;
      applyAudioGate();
      return;
    }
    try {
      const raw = await ytgame.game.loadData();
      if (typeof raw !== "string" || raw.trim() === "") {
        save = defaultSave();
        cloudLoaded = true;
      } else {
        save = parseSaveData(JSON.parse(raw));
        cloudLoaded = true;
      }
    } catch (err) {
      save = defaultSave();
      cloudLoaded = false;
      try {
        if (ytgame.health && typeof ytgame.health.logWarning === "function") ytgame.health.logWarning();
      } catch (logErr) { /* health logging is best effort */ }
    }
    applyAudioGate();
  }

  let save = defaultSave();

  const state = {
    screen: "home",
    level: LEVELS[0],
    arrows: [],
    busy: false,
    modal: false,
    toldBlock: false,
    hintCursor: 0,
    paused: false,
    scoreRaw: 0,
    score: 0,
    scoredKeys: new Set(),
    scoreReported: false,
  };

  let generation = 0;
  let departing = 0;
  let toastTimer = 0;
  let hintTimer = 0;

  function levelById(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[0];
  }

  function remainingPhrase(count) {
    if (count === 0) return "All clear";
    if (count === 1) return "1 arrow left";
    return count + " arrows left";
  }

  function announce(message, options) {
    const showToast = options && options.toast;
    ui.live.textContent = "";
    window.setTimeout(() => {
      ui.live.textContent = message;
    }, 20);
    if (!showToast) return;
    window.clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.add("is-on");
    toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-on"), 2200);
  }

  function showScreen(name) {
    state.screen = name;
    Object.entries(ui.screens).forEach(([key, node]) => {
      node.hidden = key !== name;
    });
    document.title = name === "game"
      ? "Level " + state.level.id + " · Arrow Escape"
      : name === "home"
        ? "Arrow Escape"
        : name.charAt(0).toUpperCase() + name.slice(1) + " · Arrow Escape";
  }

  function renderChrome() {
    const cleared = save.completed.length;
    const summary = cleared + " of " + LEVEL_COUNT + " levels cleared";
    ui.homeProgress.textContent = summary;
    const progress = (cleared / LEVEL_COUNT) * 100 + "%";
    document.querySelectorAll("[data-progress]").forEach((node) => {
      node.style.setProperty("--progress", progress);
    });
    ui.levelsProgress.textContent = cleared === 0
      ? "Clear a level to unlock the next one."
      : summary + ". You can replay any unlocked level.";

    const allDone = cleared === LEVEL_COUNT;
    const nextId = allDone
      ? 1
      : (LEVELS.find((level) => level.id <= save.unlocked && !save.completed.includes(level.id)) || levelById(save.current)).id;
    const next = levelById(nextId);
    ui.playLabel.textContent = allDone ? "Play again" : cleared === 0 ? "Play" : "Continue";
    ui.playSub.textContent = "Level " + next.id + " · " + next.name;
    ui.play.dataset.level = String(next.id);

    ui.mute.classList.toggle("is-muted", save.muted);
    ui.mute.setAttribute("aria-pressed", save.muted ? "true" : "false");
    ui.mute.setAttribute("aria-label", save.muted ? "Turn sound on" : "Mute sound effects");
    applyAudioGate();
  }

  function renderLevelSelect() {
    ui.levelGrid.replaceChildren();
    LEVELS.forEach((level) => {
      const locked = level.id > save.unlocked;
      const done = save.completed.includes(level.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "level-card"
        + (locked ? " is-locked" : "")
        + (done ? " is-done" : "")
        + (!locked && level.id === save.current && !done ? " is-current" : "");
      card.setAttribute("role", "listitem");
      card.dataset.level = String(level.id);
      card.setAttribute("aria-disabled", locked ? "true" : "false");

      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(level.id).padStart(2, "0");

      const title = document.createElement("strong");
      title.textContent = level.name;

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = level.rows + "×" + level.cols + " · " + level.arrows.length + " arrows";

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = locked ? "Locked" : done ? "Cleared" : level.id === save.current ? "Continue" : "Ready";

      card.append(num, title, meta, badge);
      const label = "Level " + level.id + ", " + level.name + ", " + badge.textContent;
      card.setAttribute("aria-label", label);
      card.addEventListener("click", () => onLevelCard(level.id, card));
      ui.levelGrid.append(card);
    });
  }

  function onLevelCard(id, card) {
    if (id > save.unlocked) {
      card.classList.remove("is-shaking");
      window.requestAnimationFrame(() => card.classList.add("is-shaking"));
      announce("Clear level " + (id - 1) + " to unlock this one.", { toast: true });
      return;
    }
    audio.tap();
    startLevel(id);
  }

  function emptyCell(r, c) {
    const cell = document.createElement("div");
    cell.className = "cell empty";
    cell.style.gridRow = String(r + 1);
    cell.style.gridColumn = String(c + 1);
    cell.setAttribute("aria-hidden", "true");
    return cell;
  }

  function arrowButton(arrow) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell arrow";
    button.dataset.r = String(arrow.r);
    button.dataset.c = String(arrow.c);
    button.dataset.dir = arrow.d;
    button.style.gridRow = String(arrow.r + 1);
    button.style.gridColumn = String(arrow.c + 1);
    button.innerHTML = ARROW_SVG;
    button.setAttribute(
      "aria-label",
      DIR_NAMES[arrow.d] + " arrow, row " + (arrow.r + 1) + ", column " + (arrow.c + 1)
    );
    return button;
  }

  function renderBoard() {
    window.clearTimeout(hintTimer);
    ui.boardWrap.style.setProperty("--cols", String(state.level.cols));
    ui.boardWrap.style.setProperty("--rows", String(state.level.rows));
    ui.board.style.setProperty("--cols", String(state.level.cols));
    ui.board.style.setProperty("--rows", String(state.level.rows));
    const cells = [];
    const occupied = new Set(state.arrows.map((arrow) => arrow.r + "," + arrow.c));
    for (let r = 0; r < state.level.rows; r += 1) {
      for (let c = 0; c < state.level.cols; c += 1) {
        if (!occupied.has(r + "," + c)) cells.push(emptyCell(r, c));
      }
    }
    state.arrows.forEach((arrow) => cells.push(arrowButton(arrow)));
    ui.board.replaceChildren(...cells);
    ui.boardWrap.classList.remove("is-fresh");
    void ui.boardWrap.offsetWidth;
    ui.boardWrap.classList.add("is-fresh");
    ui.levelNum.textContent = String(state.level.id);
    ui.levelName.textContent = state.level.name;
    ui.counter.textContent = remainingPhrase(state.arrows.length);
    renderScore();
  }

  function renderScore() {
    if (ui.score) ui.score.textContent = "Score " + state.score;
  }

  function resetAttemptScore() {
    state.scoreRaw = adjustScore(0, "reset");
    state.score = displayedScore(state.scoreRaw);
    state.scoredKeys = new Set();
    state.scoreReported = false;
    renderScore();
  }

  function startLevel(id) {
    generation += 1;
    departing = 0;
    state.busy = false;
    state.modal = false;
    state.toldBlock = false;
    state.hintCursor = 0;
    resetAttemptScore();
    state.level = levelById(id);
    state.arrows = state.level.arrows.map((arrow) => ({ ...arrow }));
    save.current = state.level.id;
    persist();
    hideWin();
    renderChrome();
    renderBoard();
    showScreen("game");
    ui.board.focus();
  }

  function findButton(arrow) {
    return ui.board.querySelector('.arrow[data-r="' + arrow.r + '"][data-c="' + arrow.c + '"]');
  }

  function attempt(arrow, button) {
    if (state.busy || state.modal) return;
    const stillThere = state.arrows.some((item) => item.r === arrow.r && item.c === arrow.c);
    if (!stillThere) return;
    if (!canEscape(state.arrows, arrow, state.level.rows, state.level.cols)) {
      rejectArrow(button);
      return;
    }
    releaseArrow(arrow, button);
  }

  function rejectArrow(button) {
    button.classList.remove("is-shaking");
    void button.offsetWidth;
    button.classList.add("is-shaking", "is-blocked");
    window.setTimeout(() => button.classList.remove("is-blocked"), 420);
    audio.blocked();
    if (!state.toldBlock) {
      state.toldBlock = true;
      announce("That path is blocked. Clear the arrow in front first.", { toast: true });
    } else {
      announce("Path is blocked.");
    }
  }

  function travelDistance(arrow, button) {
    const rect = button.getBoundingClientRect();
    const boardRect = ui.boardWrap.getBoundingClientRect();
    const extra = 28;
    if (arrow.d === "R") return boardRect.right - rect.left + extra;
    if (arrow.d === "L") return rect.right - boardRect.left + extra;
    if (arrow.d === "D") return boardRect.bottom - rect.top + extra;
    return rect.bottom - boardRect.top + extra;
  }

  function releaseArrow(arrow, button) {
    const gen = generation;
    departing += 1;
    state.arrows = state.arrows.filter((item) => item !== arrow);
    const scoredKey = arrow.r + "," + arrow.c;
    if (!state.scoredKeys.has(scoredKey)) {
      state.scoredKeys.add(scoredKey);
      state.scoreRaw = adjustScore(state.scoreRaw, "arrow");
      state.score = displayedScore(state.scoreRaw);
    }
    ui.counter.textContent = remainingPhrase(state.arrows.length);
    renderScore();
    button.classList.remove("is-hint", "is-shaking", "is-blocked");
    button.disabled = true;
    button.style.setProperty("--travel", travelDistance(arrow, button) + "px");
    button.classList.add("is-leaving", "is-leaving-" + arrow.d);
    audio.leave();
    announce(remainingPhrase(state.arrows.length) + ". Score " + state.score + ".");

    const wasFocused = document.activeElement === button;
    if (wasFocused) focusNearest(arrow.r, arrow.c);

    let finished = false;
    const finish = () => {
      if (finished || gen !== generation) return;
      finished = true;
      departing = Math.max(0, departing - 1);
      if (button.isConnected) button.replaceWith(emptyCell(arrow.r, arrow.c));
      state.busy = false;
      if (state.arrows.length === 0 && departing === 0) completeLevel();
    };

    button.addEventListener("transitionend", (event) => {
      if (event.propertyName === "transform" || event.propertyName === "opacity") finish();
    });
    window.setTimeout(finish, 420);
  }

  function focusNearest(r, c) {
    const arrows = [...ui.board.querySelectorAll(".arrow:not(:disabled)")];
    if (!arrows.length) return;
    let best = arrows[0];
    let bestScore = Infinity;
    arrows.forEach((node) => {
      const score = Math.abs(Number(node.dataset.r) - r) + Math.abs(Number(node.dataset.c) - c);
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    });
    best.focus();
  }

  function completeLevel() {
    const id = state.level.id;
    const firstClear = !state.scoreReported;
    if (firstClear) {
      state.scoreRaw = adjustScore(state.scoreRaw, "clear");
      state.score = displayedScore(state.scoreRaw);
      state.scoreReported = true;
      renderScore();
      if (state.score > save.bestScore) save.bestScore = state.score;
      reportScore(save.bestScore);
    }
    if (!save.completed.includes(id)) save.completed.push(id);
    save.completed.sort((a, b) => a - b);
    if (id < LEVEL_COUNT) save.unlocked = Math.max(save.unlocked, id + 1);
    save.current = id < LEVEL_COUNT ? id + 1 : id;
    persist();
    renderChrome();
    state.modal = true;
    const last = id === LEVEL_COUNT;
    ui.winKicker.textContent = last ? "All levels cleared" : "Level cleared";
    ui.winTitle.textContent = state.level.name;
    ui.winCopy.textContent = last
      ? "You found the order hidden in every grid."
      : "Every arrow found a way out.";
    if (ui.winScore) ui.winScore.textContent = "Score " + state.score;
    if (ui.winBest) {
      const showBest = save.bestScore > state.score;
      ui.winBest.hidden = !showBest;
      ui.winBest.textContent = "Best " + save.bestScore;
    }
    ui.winNext.hidden = false;
    ui.winNext.textContent = last ? "Play level 1" : "Next · " + levelById(id + 1).name;
    ui.win.hidden = false;
    ui.winNext.focus();
    audio.win();
    announce((last ? "All levels cleared." : "Level " + id + " cleared.") + " Score " + state.score + ".");
  }

  function hideWin() {
    state.modal = false;
    ui.win.hidden = true;
  }

  function clearHintMarks() {
    window.clearTimeout(hintTimer);
    ui.board.querySelectorAll(".is-hint").forEach((node) => node.classList.remove("is-hint"));
  }

  function showHint() {
    if (state.busy || state.modal || state.screen !== "game") return;
    const free = state.arrows.filter((arrow) => canEscape(state.arrows, arrow, state.level.rows, state.level.cols));
    if (!free.length) {
      announce("No arrow can leave right now.", { toast: true });
      return;
    }
    const arrow = free[state.hintCursor % free.length];
    state.hintCursor += 1;
    clearHintMarks();
    const button = findButton(arrow);
    if (!button) return;
    button.classList.add("is-hint");
    button.focus();
    state.scoreRaw = adjustScore(state.scoreRaw, "hint");
    state.score = displayedScore(state.scoreRaw);
    renderScore();
    audio.hint();
    announce(
      "Hint: the " + DIR_NAMES[arrow.d] + " arrow in row " + (arrow.r + 1) + ", column " + (arrow.c + 1) + " can leave. Score " + state.score + ".",
      { toast: true }
    );
    hintTimer = window.setTimeout(() => button.classList.remove("is-hint"), 2800);
  }

  function restartLevel() {
    if (state.screen !== "game") return;
    const id = state.level.id;
    startLevel(id);
    announce("Level restarted.", { toast: true });
  }

  function goHome() {
    generation += 1;
    state.busy = false;
    hideWin();
    renderChrome();
    showScreen("home");
    ui.play.focus();
  }

  function goLevels() {
    generation += 1;
    state.busy = false;
    hideWin();
    renderChrome();
    renderLevelSelect();
    showScreen("levels");
    const current = ui.levelGrid.querySelector('[data-level="' + save.current + '"]');
    if (current) current.focus();
  }

  function goHelp() {
    hideWin();
    showScreen("help");
  }

  function setPaused(paused) {
    state.paused = paused;
    document.body.classList.toggle("is-paused", paused);
    if (ui.pauseOverlay) ui.pauseOverlay.hidden = !paused;
    applyAudioGate();
    if (paused) persist();
  }

  function installPlayablesHooks() {
    if (typeof ytgame === "undefined" || !ytgame.system) return;
    if (typeof ytgame.system.onPause === "function") ytgame.system.onPause(() => setPaused(true));
    if (typeof ytgame.system.onResume === "function") ytgame.system.onResume(() => setPaused(false));
    if (typeof ytgame.system.onAudioEnabledChange === "function") {
      ytgame.system.onAudioEnabledChange(() => applyAudioGate());
    }
  }

  function adaptPlayablesCopy() {
    if (!inPlayables()) return;
    const soundNote = document.getElementById("help-sound-note");
    const helpKey = document.getElementById("help-mute-key");
    const gameKeys = document.getElementById("game-keys");
    if (soundNote) soundNote.textContent = "Sound follows YouTube's volume control. Your unlocked levels are saved with your YouTube game.";
    if (helpKey) helpKey.textContent = "H hint · R restart";
    if (gameKeys) gameKeys.textContent = "Arrow keys select · Enter releases · H hint · R restart";
  }

  function toggleMute() {
    if (inPlayables() || state.paused) return;
    save.muted = !save.muted;
    persist();
    renderChrome();
    if (!save.muted && youtubeAudioEnabled()) audio.tap();
    announce(save.muted ? "Sound off." : "Sound on.", { toast: true });
  }

  function resetProgress() {
    const ok = window.confirm("Erase your saved levels and best score on this browser? Only level 1 will stay unlocked.");
    if (!ok) return;
    const muted = save.muted;
    save = defaultSave();
    save.muted = muted;
    persist();
    generation += 1;
    state.busy = false;
    hideWin();
    renderChrome();
    renderLevelSelect();
    showScreen("home");
    announce("Saved progress erased.", { toast: true });
  }

  function moveArrowFocus(dr, dc) {
    const current = document.activeElement;
    const arrows = [...ui.board.querySelectorAll(".arrow:not(:disabled)")];
    if (!arrows.length) return;
    if (!current || !current.classList.contains("arrow")) {
      arrows[0].focus();
      return;
    }
    const r = Number(current.dataset.r);
    const c = Number(current.dataset.c);
    let best = null;
    let bestScore = Infinity;
    arrows.forEach((node) => {
      const rowDelta = Number(node.dataset.r) - r;
      const colDelta = Number(node.dataset.c) - c;
      if (dr === -1 && rowDelta >= 0) return;
      if (dr === 1 && rowDelta <= 0) return;
      if (dc === -1 && colDelta >= 0) return;
      if (dc === 1 && colDelta <= 0) return;
      const primary = dr !== 0 ? Math.abs(rowDelta) : Math.abs(colDelta);
      const secondary = dr !== 0 ? Math.abs(colDelta) : Math.abs(rowDelta);
      const score = primary * 100 + secondary;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    });
    if (best) best.focus();
  }

  function moveCardFocus(delta) {
    const cards = [...ui.levelGrid.querySelectorAll(".level-card")];
    const index = cards.indexOf(document.activeElement);
    const next = cards[index + delta];
    if (next) next.focus();
    else if (index === -1 && cards[0]) cards[0].focus();
  }

  function onKeyDown(event) {
    if (state.paused) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;

    if (state.modal) {
      if (key === "Escape") goLevels();
      if (key === "Tab") trapModalTab(event);
      return;
    }

    if (key === "Escape") {
      if (state.screen === "game") goLevels();
      else if (state.screen !== "home") goHome();
      return;
    }

    if (key.toLowerCase() === "m" && !inPlayables()) {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (state.screen === "game") {
      const focusedArrow = document.activeElement && document.activeElement.classList.contains("arrow");
      if ((key === "Enter" || key === " ") && focusedArrow) {
        event.preventDefault();
        document.activeElement.click();
        return;
      }
      if (key.toLowerCase() === "h") {
        event.preventDefault();
        showHint();
        return;
      }
      if (key.toLowerCase() === "r") {
        event.preventDefault();
        restartLevel();
        return;
      }
      const boardFocused = ui.board.contains(document.activeElement) || document.activeElement === ui.board;
      if (!boardFocused) return;
      if (key === "ArrowUp") { event.preventDefault(); moveArrowFocus(-1, 0); }
      if (key === "ArrowDown") { event.preventDefault(); moveArrowFocus(1, 0); }
      if (key === "ArrowLeft") { event.preventDefault(); moveArrowFocus(0, -1); }
      if (key === "ArrowRight") { event.preventDefault(); moveArrowFocus(0, 1); }
      return;
    }

    if (state.screen === "levels" && ui.levelGrid.contains(document.activeElement)) {
      if (key === "ArrowRight") { event.preventDefault(); moveCardFocus(1); }
      if (key === "ArrowLeft") { event.preventDefault(); moveCardFocus(-1); }
      if (key === "ArrowDown") { event.preventDefault(); moveCardFocus(2); }
      if (key === "ArrowUp") { event.preventDefault(); moveCardFocus(-2); }
    }
  }

  function trapModalTab(event) {
    const buttons = [...ui.winCard.querySelectorAll("button")].filter((button) => !button.hidden);
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function validateOrWarn() {
    const broken = LEVELS.filter((level) => !isSolvable(level));
    if (!broken.length) return;
    const message = "These levels have no solution: " + broken.map((level) => level.id).join(", ");
    console.error(message);
    announce(message, { toast: true });
  }

  function blockWhilePaused(event) {
    if (!state.paused) return;
    event.preventDefault();
    event.stopPropagation();
  }

  document.addEventListener("pointerdown", blockWhilePaused, true);
  document.addEventListener("click", blockWhilePaused, true);

  ui.board.addEventListener("click", (event) => {
    if (state.paused) return;
    const button = event.target.closest(".arrow");
    if (!button || button.disabled) return;
    const arrow = state.arrows.find((item) => item.r === Number(button.dataset.r) && item.c === Number(button.dataset.c));
    if (!arrow) return;
    attempt(arrow, button);
  });

  ui.play.addEventListener("click", () => {
    audio.tap();
    startLevel(Number(ui.play.dataset.level) || 1);
  });
  document.getElementById("levels-btn").addEventListener("click", () => {
    audio.tap();
    goLevels();
  });
  document.getElementById("help-btn").addEventListener("click", () => {
    audio.tap();
    goHelp();
  });
  document.getElementById("levels-back").addEventListener("click", goHome);
  document.getElementById("help-back").addEventListener("click", goHome);
  document.getElementById("back-btn").addEventListener("click", goLevels);
  document.getElementById("hint-btn").addEventListener("click", showHint);
  document.getElementById("restart-btn").addEventListener("click", restartLevel);
  document.getElementById("reset-btn").addEventListener("click", resetProgress);
  ui.mute.addEventListener("click", toggleMute);
  ui.winNext.addEventListener("click", () => {
    const id = state.level.id;
    if (id >= LEVEL_COUNT) startLevel(1);
    else startLevel(id + 1);
  });
  document.getElementById("win-replay").addEventListener("click", restartLevel);
  document.getElementById("win-levels").addEventListener("click", goLevels);
  document.addEventListener("keydown", onKeyDown);

  validateOrWarn();
  installPlayablesHooks();
  showScreen("home");
  prepareSave().then(() => {
    adaptPlayablesCopy();
    renderChrome();
    renderLevelSelect();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        notifyYoutube("firstFrameReady");
        notifyYoutube("gameReady");
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
