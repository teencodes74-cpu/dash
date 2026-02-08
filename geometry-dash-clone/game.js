/*
  Geometry Dash–style browser game.
  ------------------------------------------------------
  Quick edit guide:
  - Add or tweak levels in LEVELS array.
  - Modify gravity / jumpForce in CONFIG for game feel.
  - Keep obstacles simple: spikes and blocks.
  - All rendering is done with canvas (no external libraries).
*/

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelNameEl = document.getElementById("levelName");
const progressBarEl = document.getElementById("progressBar");
const progressTextEl = document.getElementById("progressText");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const CONFIG = {
  width: 960,
  height: 540,
  floorY: 450,
  gravity: 2300,
  jumpForce: 860,
  baseSpeed: 360,
  playerSize: 44,
};

const LEVELS = [
  {
    name: "Level 1: Warm Up",
    length: 4500,
    speedMul: 1,
    obstacles: [
      { type: "spike", x: 600, w: 42, h: 42 },
      { type: "spike", x: 900, w: 42, h: 42 },
      { type: "block", x: 1250, w: 52, h: 70 },
      { type: "spike", x: 1450, w: 42, h: 42 },
      { type: "spike", x: 1520, w: 42, h: 42 },
      { type: "block", x: 1800, w: 70, h: 95 },
      { type: "spike", x: 2200, w: 42, h: 42 },
      { type: "block", x: 2600, w: 56, h: 80 },
      { type: "spike", x: 3000, w: 42, h: 42 },
      { type: "spike", x: 3060, w: 42, h: 42 },
      { type: "block", x: 3600, w: 64, h: 110 },
      { type: "spike", x: 4100, w: 42, h: 42 },
    ],
  },
  {
    name: "Level 2: Tempo Rush",
    length: 6000,
    speedMul: 1.16,
    obstacles: [
      { type: "spike", x: 550, w: 42, h: 42 },
      { type: "spike", x: 620, w: 42, h: 42 },
      { type: "block", x: 900, w: 66, h: 105 },
      { type: "spike", x: 1160, w: 42, h: 42 },
      { type: "block", x: 1450, w: 52, h: 80 },
      { type: "spike", x: 1700, w: 42, h: 42 },
      { type: "spike", x: 1770, w: 42, h: 42 },
      { type: "block", x: 2000, w: 52, h: 80 },
      { type: "block", x: 2300, w: 52, h: 120 },
      { type: "spike", x: 2600, w: 42, h: 42 },
      { type: "spike", x: 2660, w: 42, h: 42 },
      { type: "spike", x: 2720, w: 42, h: 42 },
      { type: "block", x: 3100, w: 72, h: 130 },
      { type: "spike", x: 3450, w: 42, h: 42 },
      { type: "block", x: 3800, w: 70, h: 90 },
      { type: "spike", x: 4220, w: 42, h: 42 },
      { type: "spike", x: 4500, w: 42, h: 42 },
      { type: "block", x: 4900, w: 64, h: 120 },
      { type: "spike", x: 5360, w: 42, h: 42 },
      { type: "spike", x: 5550, w: 42, h: 42 },
    ],
  },
];

const gameState = {
  running: false,
  gameOver: false,
  win: false,
  score: 0,
  levelIndex: 0,
  levelDistance: 0,
  totalDistance: 0,
  touchHeld: false,
  player: {
    x: 130,
    y: CONFIG.floorY - CONFIG.playerSize,
    vy: 0,
    size: CONFIG.playerSize,
    onGround: true,
    rotation: 0,
  },
};

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(canvas.width / CONFIG.width, 0, 0, canvas.height / CONFIG.height, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicStarted = false;
    this.jumpBuffer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  async init() {
    this.ensureContext();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // Attempt to decode jump.wav. Fallback is oscillator-based sound.
    try {
      const jumpRes = await fetch("assets/jump.wav");
      const jumpData = await jumpRes.arrayBuffer();
      this.jumpBuffer = await this.ctx.decodeAudioData(jumpData.slice(0));
    } catch (_) {
      this.jumpBuffer = null;
    }
  }

  playJump() {
    if (!this.ctx) return;
    if (this.jumpBuffer) {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = 0.18;
      src.buffer = this.jumpBuffer;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
      return;
    }

    // Fallback jump effect.
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(620, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  startMusic() {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;

    // Use simple procedural loop so game works even if music file is absent.
    const schedule = () => {
      if (!gameState.running || gameState.gameOver || !this.ctx) {
        this.musicStarted = false;
        return;
      }
      const now = this.ctx.currentTime;
      const notes = [220, 277, 330, 277, 196, 247, 294, 247];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const start = now + i * 0.2;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.06, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });

      setTimeout(schedule, 1600);
    };

    // Also attempt native file playback quietly as enhancement.
    const musicAudio = new Audio("assets/music.mp3");
    musicAudio.volume = 0.08;
    musicAudio.loop = true;
    musicAudio.play().catch(() => {});

    schedule();
  }
}

const audio = new AudioManager();

function currentLevel() {
  return LEVELS[gameState.levelIndex];
}

function resetRun() {
  gameState.running = true;
  gameState.gameOver = false;
  gameState.win = false;
  gameState.score = 0;
  gameState.levelIndex = 0;
  gameState.levelDistance = 0;
  gameState.totalDistance = 0;
  gameState.player.y = CONFIG.floorY - gameState.player.size;
  gameState.player.vy = 0;
  gameState.player.onGround = true;
  gameState.player.rotation = 0;
  overlay.classList.add("hidden");
  startBtn.classList.add("hidden");
  restartBtn.classList.add("hidden");
}

function jump() {
  if (!gameState.running || gameState.gameOver) return;
  if (gameState.player.onGround) {
    gameState.player.vy = -CONFIG.jumpForce;
    gameState.player.onGround = false;
    audio.playJump();
  }
}

function setGameOver(win) {
  gameState.running = false;
  gameState.gameOver = true;
  gameState.win = win;
  overlay.classList.remove("hidden");
  restartBtn.classList.remove("hidden");
  startBtn.classList.add("hidden");
  overlayTitle.textContent = win ? "You Win!" : "Game Over";
  overlayMessage.textContent = win
    ? `Final score: ${Math.floor(gameState.score)} — great timing!`
    : `Final score: ${Math.floor(gameState.score)}. Try again!`;
}

function update(dt) {
  if (!gameState.running || gameState.gameOver) return;

  const level = currentLevel();
  const speed = CONFIG.baseSpeed * level.speedMul;
  const p = gameState.player;

  p.vy += CONFIG.gravity * dt;
  p.y += p.vy * dt;

  if (p.y >= CONFIG.floorY - p.size) {
    p.y = CONFIG.floorY - p.size;
    p.vy = 0;
    p.onGround = true;
  }

  p.rotation += (speed * dt) / 60;
  if (p.onGround) p.rotation = 0;

  gameState.levelDistance += speed * dt;
  gameState.totalDistance += speed * dt;
  gameState.score += dt * 60;

  // Collision checks using axis-aligned bounds.
  const playerBox = { x: p.x + 6, y: p.y + 6, w: p.size - 12, h: p.size - 12 };

  for (const obs of level.obstacles) {
    const worldX = obs.x - gameState.levelDistance;
    if (worldX + obs.w < 0 || worldX > CONFIG.width) continue;

    let hit = false;
    if (obs.type === "block") {
      const block = { x: worldX, y: CONFIG.floorY - obs.h, w: obs.w, h: obs.h };
      hit = intersects(playerBox, block);
    } else {
      const tri = spikeAabb(worldX, CONFIG.floorY, obs.w, obs.h);
      hit = intersects(playerBox, tri);
    }

    if (hit) {
      setGameOver(false);
      return;
    }
  }

  if (gameState.levelDistance >= level.length) {
    gameState.levelIndex += 1;
    if (gameState.levelIndex >= LEVELS.length) {
      setGameOver(true);
      return;
    }
    gameState.levelDistance = 0;
  }

  const progress = Math.min(100, (gameState.levelDistance / level.length) * 100);
  scoreEl.textContent = Math.floor(gameState.score).toString();
  levelNameEl.textContent = level.name;
  progressBarEl.style.width = `${progress}%`;
  progressTextEl.textContent = `${Math.floor(progress)}%`;
}

function draw() {
  const p = gameState.player;
  const level = currentLevel();

  // Background.
  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
  const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
  sky.addColorStop(0, "#16254b");
  sky.addColorStop(1, "#0f1732");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  // Decorative scrolling bars.
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 6; i++) {
    const x = (CONFIG.width - ((gameState.totalDistance * 0.2 + i * 200) % (CONFIG.width + 120))) - 120;
    ctx.fillStyle = "#2f4b88";
    ctx.fillRect(x, 90 + i * 35, 120, 6);
  }
  ctx.globalAlpha = 1;

  // Floor.
  ctx.fillStyle = "#2e4073";
  ctx.fillRect(0, CONFIG.floorY, CONFIG.width, CONFIG.height - CONFIG.floorY);
  ctx.strokeStyle = "#5e7dca";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.floorY);
  ctx.lineTo(CONFIG.width, CONFIG.floorY);
  ctx.stroke();

  // Obstacles.
  for (const obs of level.obstacles) {
    const x = obs.x - gameState.levelDistance;
    if (x + obs.w < -10 || x > CONFIG.width + 10) continue;

    if (obs.type === "block") {
      const y = CONFIG.floorY - obs.h;
      ctx.fillStyle = "#ff5f86";
      ctx.fillRect(x, y, obs.w, obs.h);
      ctx.strokeStyle = "#ffd1dc";
      ctx.strokeRect(x + 2, y + 2, obs.w - 4, obs.h - 4);
    } else {
      drawSpike(x, CONFIG.floorY, obs.w, obs.h);
    }
  }

  // Player cube.
  ctx.save();
  const cx = p.x + p.size / 2;
  const cy = p.y + p.size / 2;
  ctx.translate(cx, cy);
  ctx.rotate(p.rotation);
  ctx.fillStyle = "#24d9ff";
  ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
  ctx.strokeStyle = "#b4f5ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(-p.size / 2 + 2, -p.size / 2 + 2, p.size - 4, p.size - 4);
  ctx.restore();

  if (!gameState.running && !gameState.gameOver) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Ready?", CONFIG.width / 2, CONFIG.height / 2 - 20);
  }
}

function drawSpike(x, floorY, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, floorY);
  ctx.lineTo(x + w / 2, floorY - h);
  ctx.lineTo(x + w, floorY);
  ctx.closePath();
  ctx.fillStyle = "#ff3d71";
  ctx.fill();
  ctx.strokeStyle = "#ffc8d8";
  ctx.stroke();
}

function spikeAabb(x, floorY, w, h) {
  return { x: x + 6, y: floorY - h + 6, w: w - 12, h: h - 6 };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

async function startGame() {
  await audio.init();
  audio.startMusic();
  resetRun();
}

function handleAction() {
  if (!gameState.running) return;
  jump();
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!gameState.running && gameState.gameOver) {
      startGame();
      return;
    }
    handleAction();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  handleAction();
});

// Prevent accidental page scrolling on touch while playing.
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    handleAction();
  },
  { passive: false }
);

resizeCanvas();
draw();
requestAnimationFrame(loop);
