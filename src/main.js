import './style.css';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

const hudScore = document.querySelector('[data-score]');
const hudBest = document.querySelector('[data-best]');
const overlay = document.querySelector('[data-overlay]');
const finalScoreEl = document.querySelector('[data-final-score]');
const restartButton = document.querySelector('[data-restart]');
const startOverlay = document.querySelector('[data-start-overlay]');
const pauseOverlay = document.querySelector('[data-pause-overlay]');
const startButton = document.querySelector('[data-start]');
const resumeButton = document.querySelector('[data-resume]');
const pauseButton = document.querySelector('[data-pause]');
const muteButton = document.querySelector('[data-mute]');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const GRAVITY = 0.35;
const JUMP_VELOCITY = -11.2;
const MOVE_ACCEL = 0.55;
const MOVE_FRICTION = 0.92;
const MAX_HORIZONTAL_SPEED = 6;
const PLATFORM_WIDTH = 68;
const PLATFORM_HEIGHT = 14;
const PLATFORM_MIN_GAP = 55;
const PLATFORM_MAX_GAP = 95;
const MOVING_PLATFORM_PROB = 0.18;
const DEAD_PLATFORM_PROB = 0.22;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const platformColors = {
  static: '#111111',
  moving: '#2c6df2',
  dead: '#ff1b4b',
};

const fxFiles = [
  '/fx/audio_2025-09-24_18-15-46.ogg',
  '/fx/audio_2025-09-24_18-17-15.ogg',
  '/fx/audio_2025-09-24_18-17-37.ogg',
  '/fx/audio_2025-09-24_18-17-45.ogg',
  '/fx/audio_2025-09-24_18-17-52.ogg',
  '/fx/audio_2025-09-24_18-17-56.ogg',
];

const keys = new Set();

const state = {
  running: false,
  paused: false,
  muted: false,
  score: 0,
  best: Number(localStorage.getItem('doodle-hop-best') ?? '0'),
};

const player = {
  width: 42,
  height: 54,
  x: WIDTH / 2 - 21,
  y: HEIGHT - 140,
  vx: 0,
  vy: 0,
  facing: 1,
  sprite: new Image(),
  spriteReady: false,
};
player.sprite.src = '/avatar.png';
player.sprite.onload = () => {
  player.spriteReady = true;
};

const backgroundMusic = new Audio('/music/untitled.wav');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.25;
let musicStarted = false;

function startMusic() {
  if (state.muted || musicStarted && !backgroundMusic.paused) return;
  musicStarted = true;
  backgroundMusic.currentTime = backgroundMusic.currentTime || 0;
  backgroundMusic.play().catch(() => {
    musicStarted = false;
  });
}

function setMute(isMuted) {
  state.muted = isMuted;
  backgroundMusic.muted = isMuted;
  if (isMuted) {
    backgroundMusic.pause();
    muteButton.textContent = 'Sound On';
  } else {
    muteButton.textContent = 'Mute';
    startMusic();
  }
}

function playRandomFx() {
  if (state.muted || !fxFiles.length) return;
  const src = fxFiles[Math.floor(Math.random() * fxFiles.length)];
  const audio = new Audio(src);
  audio.volume = 0.55;
  audio.play().catch(() => {});
}

let platforms = [];
let lastTimestamp = 0;

function createPlatform(y) {
  const moving = Math.random() < MOVING_PLATFORM_PROB;
  let type = moving ? 'moving' : 'static';
  if (!moving && Math.random() < DEAD_PLATFORM_PROB) type = 'dead';
  return {
    x: Math.random() * (WIDTH - PLATFORM_WIDTH),
    y,
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    type,
    dx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.6) : 0,
  };
}

function populatePlatforms() {
  platforms = [];
  let currentY = HEIGHT - 20;
  while (currentY > -HEIGHT * 0.5) {
    platforms.push(createPlatform(currentY));
    currentY -= PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
  }
  const ground = platforms[0];
  ground.x = WIDTH / 2 - PLATFORM_WIDTH / 2;
  ground.y = HEIGHT - 20;
  ground.type = 'static';
  ground.dx = 0;
}

function updateHud() {
  hudScore.textContent = Math.floor(state.score).toString();
  hudBest.textContent = state.best.toString();
}

function resetGame() {
  populatePlatforms();
  player.x = WIDTH / 2 - player.width / 2;
  player.y = HEIGHT - 140;
  player.vx = 0;
  player.vy = -8;
  player.facing = 1;
  state.score = 0;
  state.running = true;
  state.paused = false;
  overlay.hidden = true;
  pauseOverlay.hidden = true;
  startOverlay.hidden = true;
  pauseButton.textContent = 'Pause';
  keys.clear();
  updateHud();
  startMusic();
  lastTimestamp = 0;
}

function wrapHorizontally() {
  if (player.x + player.width < 0) player.x = WIDTH;
  else if (player.x > WIDTH) player.x = -player.width;
}

function updatePlayer(delta) {
  const previousY = player.y;
  const accel = MOVE_ACCEL * delta;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) player.vx -= accel;
  if (keys.has('ArrowRight') || keys.has('KeyD')) player.vx += accel;

  player.vx *= MOVE_FRICTION;
  player.vx = clamp(player.vx, -MAX_HORIZONTAL_SPEED, MAX_HORIZONTAL_SPEED);
  player.x += player.vx * delta * 1.6;
  wrapHorizontally();

  player.vy += GRAVITY * delta;
  player.y += player.vy * delta * 1.6;

  if (Math.abs(player.vx) > 0.15) {
    player.facing = player.vx > 0 ? 1 : -1;
  }

  return previousY;
}

function handlePlatformCollisions(previousY) {
  if (player.vy <= 0) return false;
  const prevBottom = previousY + player.height;
  const currBottom = player.y + player.height;
  for (const platform of platforms) {
    if (platform.type === 'dead') continue;
    const platformTop = platform.y;
    const horizontalOverlap =
      player.x + player.width > platform.x && player.x < platform.x + platform.width;

    if (horizontalOverlap && prevBottom <= platformTop && currBottom >= platformTop) {
      player.y = platformTop - player.height;
      player.vy = JUMP_VELOCITY;
      return true;
    }
  }
  return false;
}

function updatePlatforms(delta) {
  for (const platform of platforms) {
    if (platform.type === 'moving') {
      platform.x += platform.dx * delta * 1.2;
      if (platform.x < 0 || platform.x + platform.width > WIDTH) {
        platform.dx *= -1;
        platform.x = clamp(platform.x, 0, WIDTH - platform.width);
      }
    }
  }

  const threshold = HEIGHT * 0.35;
  if (player.y < threshold) {
    const shift = threshold - player.y;
    player.y += shift;
    state.score += shift;
    for (const platform of platforms) {
      platform.y += shift;
    }
  }

  platforms = platforms.filter((platform) => platform.y < HEIGHT + PLATFORM_HEIGHT * 2);

  while (platforms.length < 12) {
    const highest = platforms.reduce((min, platform) => Math.min(min, platform.y), HEIGHT);
    const gap = PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
    platforms.push(createPlatform(highest - gap));
  }
}

function drawBackground() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fff7d6';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawPlatforms() {
  for (const platform of platforms) {
    ctx.fillStyle = platformColors[platform.type];
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = '#fff7d6';
    ctx.fillRect(platform.x, platform.y, 6, platform.height);
  }
}

function drawPlayer() {
  if (!player.spriteReady) {
    ctx.fillStyle = '#ffcb05';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    return;
  }

  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  ctx.scale(player.facing < 0 ? -1 : 1, 1);
  ctx.drawImage(
    player.sprite,
    -player.width / 2,
    -player.height / 2,
    player.width,
    player.height
  );
  ctx.restore();
}

function update(delta) {
  if (!state.running || state.paused) return;
  const previousY = updatePlayer(delta);
  const landed = handlePlatformCollisions(previousY);
  if (landed) playRandomFx();
  updatePlatforms(delta);

  if (player.y > HEIGHT + player.height) {
    endGame();
  }
}

function render() {
  drawBackground();
  drawPlatforms();
  drawPlayer();
}

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = Math.min((timestamp - lastTimestamp) / 16.67, 1.6);
  lastTimestamp = timestamp;

  update(delta);
  render();
  updateHud();

  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  state.paused = false;
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem('doodle-hop-best', String(state.best));
  finalScoreEl.textContent = Math.floor(state.score).toString();
  updateHud();
  pauseOverlay.hidden = true;
  pauseButton.textContent = 'Pause';
  overlay.hidden = false;
}

function togglePause(force) {
  if (!state.running) return;
  const nextState = force === undefined ? !state.paused : force;
  if (nextState === state.paused) return;
  state.paused = nextState;
  pauseOverlay.hidden = !state.paused;
  if (state.paused) {
    pauseButton.textContent = 'Resume';
    backgroundMusic.pause();
    keys.clear();
  } else {
    pauseButton.textContent = 'Pause';
    startMusic();
    lastTimestamp = 0;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') {
    setMute(!state.muted);
    return;
  }
  if (event.code === 'KeyP') {
    togglePause();
    return;
  }
  if (event.code === 'Space' && !state.running) {
    startMusic();
    resetGame();
    return;
  }
  startMusic();
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

restartButton.addEventListener('click', () => {
  if (!state.running) {
    startMusic();
    resetGame();
  }
});

pauseButton.addEventListener('click', () => {
  togglePause();
});

muteButton.addEventListener('click', () => {
  setMute(!state.muted);
});

startButton.addEventListener('click', () => {
  startMusic();
  resetGame();
});

resumeButton.addEventListener('click', () => {
  togglePause(false);
});

setMute(false);
populatePlatforms();
render();
updateHud();
overlay.hidden = true;
pauseOverlay.hidden = true;
startOverlay.hidden = false;
requestAnimationFrame(loop);
