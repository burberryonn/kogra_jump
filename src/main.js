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
const musicButton = document.querySelector('[data-music]');
const touchControls = document.querySelector('[data-touch-controls]');
const touchLeftButton = document.querySelector('[data-move-left]');
const touchRightButton = document.querySelector('[data-move-right]');

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
const PLATFORM_TARGET_COUNT = 12;
const CAMERA_THRESHOLD = HEIGHT * 0.35;

const MONSTER_WIDTH = 40;
const MONSTER_HEIGHT = 36;
const MONSTER_TYPES = [
  { id: 'walker', speedRange: [0.45, 0.9] },
  { id: 'sprinter', speedRange: [0.8, 1.25] },
];
const MONSTER_SCORE_BONUS = 250;
const MONSTER_TOP_TOLERANCE = 12;
const MONSTER_VERTICAL_BUFFER = 160;
const MONSTER_DIFFICULTY = {
  baseSpawnProbability: 0.18,
  maxSpawnProbability: 0.42,
  scoreForMaxSpawn: 3600,
};

const monsters = [];
let platformIdCounter = 0;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getMonsterSpawnProbability() {
  const progress = clamp(
    state.score / MONSTER_DIFFICULTY.scoreForMaxSpawn,
    0,
    1
  );
  return (
    MONSTER_DIFFICULTY.baseSpawnProbability +
    (MONSTER_DIFFICULTY.maxSpawnProbability - MONSTER_DIFFICULTY.baseSpawnProbability) *
      progress
  );
}

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

const FX_POOL_SIZE = 4;
const fxPools = [];

function createFxPool(src, size = FX_POOL_SIZE, volume = 0.55) {
  const pool = {
    index: 0,
    elements: Array.from({ length: size }, () => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      return audio;
    }),
  };
  fxPools.push(pool);
  return pool;
}

const landingFxPools = fxFiles.map((src) => createFxPool(src));
const stompFxPool = createFxPool('/fx/audio_2025-09-24_18-17-45.ogg', 3, 0.6);
const monsterHitFxPool = createFxPool('/fx/audio_2025-09-24_18-17-52.ogg', 3, 0.6);

const keys = new Set();
const touchState = { left: false, right: false };
const activeTouchPointers = new Map();

const state = {
  running: false,
  paused: false,
  fxMuted: false,
  musicMuted: false,
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
player.sprite.src = '/assets/kogr.svg';
player.sprite.onload = () => {
  player.spriteReady = true;
};

const backgroundMusic = new Audio('/music/untitled.wav');
backgroundMusic.preload = 'auto';
backgroundMusic.loop = true;
backgroundMusic.volume = 0.25;
let musicStarted = false;

function startMusic() {
  if (state.musicMuted || (musicStarted && !backgroundMusic.paused)) return;
  musicStarted = true;
  backgroundMusic.currentTime = backgroundMusic.currentTime || 0;
  backgroundMusic.play().catch(() => {
    musicStarted = false;
  });
}

function setFxMute(isMuted) {
  state.fxMuted = isMuted;
  muteButton.textContent = isMuted ? 'Sound On' : 'Sound Off';
  for (const pool of fxPools) {
    for (const audio of pool.elements) {
      audio.muted = isMuted;
    }
  }
}

function setMusicMute(isMuted) {
  state.musicMuted = isMuted;
  backgroundMusic.muted = isMuted;
  if (isMuted) {
    backgroundMusic.pause();
    musicButton.textContent = 'Music On';
  } else {
    musicButton.textContent = 'Music Off';
    startMusic();
  }
}

function playFromPool(pool) {
  if (state.fxMuted) return;
  const audio = pool.elements[pool.index];
  pool.index = (pool.index + 1) % pool.elements.length;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function playRandomFx() {
  if (state.fxMuted || !landingFxPools.length) return;
  const variant = landingFxPools[Math.floor(Math.random() * landingFxPools.length)];
  const audio = variant.elements[variant.index];
  variant.index = (variant.index + 1) % variant.elements.length;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function playMonsterDefeatFx() {
  if (!stompFxPool) return;
  playFromPool(stompFxPool);
}

function playMonsterHitFx() {
  if (!monsterHitFxPool) return;
  playFromPool(monsterHitFxPool);
}

let platforms = [];
let highestPlatformY = HEIGHT;
let lastTimestamp = 0;

const hudState = {
  score: -1,
  best: -1,
};

function createPlatform(y) {
  const moving = Math.random() < MOVING_PLATFORM_PROB;
  let type = moving ? 'moving' : 'static';
  if (!moving && Math.random() < DEAD_PLATFORM_PROB) type = 'dead';
  return {
    id: platformIdCounter += 1,
    x: Math.random() * (WIDTH - PLATFORM_WIDTH),
    y,
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    type,
    dx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.6) : 0,
  };
}

function createMonsterForPlatform(platform) {
  const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];
  const speed = randomBetween(type.speedRange[0], type.speedRange[1]);
  const direction = Math.random() < 0.5 ? -1 : 1;
  const x =
    platform.x + Math.random() * Math.max(1, platform.width - MONSTER_WIDTH);
  return {
    type: type.id,
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
    x,
    y: platform.y - MONSTER_HEIGHT,
    vx: speed * direction,
    platform,
  };
}

function maybeSpawnMonsterOnPlatform(platform, { isInitialSpawn = false } = {}) {
  if (platform.type !== 'static') return;
  if (platform.width <= MONSTER_WIDTH) return;
  if (platform.y > HEIGHT - MONSTER_VERTICAL_BUFFER) return;
  if (isInitialSpawn && platform.y > HEIGHT * 0.55) return;
  const probability = getMonsterSpawnProbability();
  if (Math.random() > probability) return;
  monsters.push(createMonsterForPlatform(platform));
}

function populatePlatforms() {
  platforms = [];
  monsters.length = 0;
  platformIdCounter = 0;
  let currentY = HEIGHT - 20;
  let minY = HEIGHT;
  while (currentY > -HEIGHT * 0.5) {
    const platform = createPlatform(currentY);
    minY = Math.min(minY, platform.y);
    const isGroundCandidate = platforms.length === 0;
    platforms.push(platform);
    if (!isGroundCandidate) {
      maybeSpawnMonsterOnPlatform(platform, { isInitialSpawn: true });
    }
    currentY -= PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
  }
  const ground = platforms[0];
  ground.x = WIDTH / 2 - PLATFORM_WIDTH / 2;
  ground.y = HEIGHT - 20;
  ground.type = 'static';
  ground.dx = 0;
  minY = Math.min(minY, ground.y);
  highestPlatformY = minY;
}

function updateHud(force = false) {
  const scoreValue = Math.floor(state.score);
  if (force || hudState.score !== scoreValue) {
    hudState.score = scoreValue;
    hudScore.textContent = scoreValue.toString();
  }
  if (force || hudState.best !== state.best) {
    hudState.best = state.best;
    hudBest.textContent = state.best.toString();
  }
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
  clearTouchState();
  updateHud(true);
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
  const movingLeft = keys.has('ArrowLeft') || keys.has('KeyA') || touchState.left;
  const movingRight = keys.has('ArrowRight') || keys.has('KeyD') || touchState.right;
  if (movingLeft && !movingRight) player.vx -= accel;
  if (movingRight && !movingLeft) player.vx += accel;

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
  let cameraShift = 0;
  for (const platform of platforms) {
    if (platform.type === 'moving') {
      platform.x += platform.dx * delta * 1.2;
      if (platform.x < 0 || platform.x + platform.width > WIDTH) {
        platform.dx *= -1;
        platform.x = clamp(platform.x, 0, WIDTH - platform.width);
      }
    }
  }

  if (player.y < CAMERA_THRESHOLD) {
    cameraShift = CAMERA_THRESHOLD - player.y;
    player.y += cameraShift;
    state.score += cameraShift;
    for (const platform of platforms) {
      platform.y += cameraShift;
    }
    for (const monster of monsters) {
      monster.y += cameraShift;
    }
    highestPlatformY += cameraShift;
  }

  let writeIndex = 0;
  for (let i = 0; i < platforms.length; i += 1) {
    const platform = platforms[i];
    if (platform.y < HEIGHT + PLATFORM_HEIGHT * 2) {
      platforms[writeIndex] = platform;
      writeIndex += 1;
    }
  }
  platforms.length = writeIndex;
  highestPlatformY = platforms.length ? platforms[platforms.length - 1].y : HEIGHT;

  while (platforms.length < PLATFORM_TARGET_COUNT) {
    const gap = PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
    const platform = createPlatform(highestPlatformY - gap);
    highestPlatformY = platform.y;
    platforms.push(platform);
    maybeSpawnMonsterOnPlatform(platform);
  }

  for (let i = monsters.length - 1; i >= 0; i -= 1) {
    const monster = monsters[i];
    const platformStillExists = platforms.includes(monster.platform);
    if (
      monster.y > HEIGHT + MONSTER_HEIGHT * 2 ||
      !platformStillExists ||
      monster.platform.type !== 'static'
    ) {
      monsters.splice(i, 1);
    }
  }

  if (cameraShift > 0) {
    state.score = Math.max(0, state.score);
  }
}

function updateMonsters(delta, previousPlayerY) {
  let stomped = false;
  const previousBottom = previousPlayerY + player.height;

  for (let i = monsters.length - 1; i >= 0; i -= 1) {
    const monster = monsters[i];
    if (!platforms.includes(monster.platform)) {
      monsters.splice(i, 1);
      continue;
    }

    const platform = monster.platform;
    monster.y = platform.y - monster.height;
    const leftBound = platform.x;
    const rightBound = platform.x + platform.width - monster.width;

    monster.x += monster.vx * delta * 1.4;
    if (monster.x <= leftBound) {
      monster.x = leftBound;
      monster.vx = Math.abs(monster.vx);
    } else if (monster.x >= rightBound) {
      monster.x = rightBound;
      monster.vx = -Math.abs(monster.vx);
    }

    const horizontalOverlap =
      player.x + player.width > monster.x && player.x < monster.x + monster.width;
    const verticalOverlap =
      player.y + player.height > monster.y && player.y < monster.y + monster.height;

    if (!horizontalOverlap || !verticalOverlap) continue;

    const wasAbove = previousBottom <= monster.y + MONSTER_TOP_TOLERANCE;
    if (player.vy > 0 && wasAbove) {
      monsters.splice(i, 1);
      player.y = monster.y - player.height;
      player.vy = JUMP_VELOCITY * 0.92;
      state.score += MONSTER_SCORE_BONUS;
      stomped = true;
      playMonsterDefeatFx();
      continue;
    }

    playMonsterHitFx();
    endGame();
    return stomped;
  }

  return stomped;
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

function drawMonsters() {
  for (const monster of monsters) {
    const bodyColor = monster.type === 'sprinter' ? '#ff5d73' : '#2fd073';
    ctx.fillStyle = bodyColor;
    ctx.fillRect(monster.x, monster.y, monster.width, monster.height);

    const eyeSize = 6;
    const eyeOffsetX = monster.width * 0.25;
    const eyeY = monster.y + monster.height * 0.35;
    ctx.fillStyle = '#111111';
    ctx.fillRect(monster.x + eyeOffsetX, eyeY, eyeSize, eyeSize);
    ctx.fillRect(monster.x + monster.width - eyeOffsetX - eyeSize, eyeY, eyeSize, eyeSize);

    ctx.fillStyle = '#fff7d6';
    ctx.fillRect(monster.x, monster.y + monster.height - 6, monster.width, 6);
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
  const stomped = updateMonsters(delta, previousY);
  if (!state.running) return;
  const landed = !stomped && handlePlatformCollisions(previousY);
  if (landed) playRandomFx();
  updatePlatforms(delta);

  if (player.y > HEIGHT + player.height) {
    endGame();
  }
}

function render() {
  drawBackground();
  drawPlatforms();
  drawMonsters();
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
  updateHud(true);
  pauseOverlay.hidden = true;
  pauseButton.textContent = 'Pause';
  overlay.hidden = false;
  clearTouchState();
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
    clearTouchState();
  } else {
    pauseButton.textContent = 'Pause';
    startMusic();
    lastTimestamp = 0;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') {
    setFxMute(!state.fxMuted);
    return;
  }
  if (event.code === 'KeyN') {
    setMusicMute(!state.musicMuted);
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
  setFxMute(!state.fxMuted);
});

musicButton.addEventListener('click', () => {
  setMusicMute(!state.musicMuted);
});

startButton.addEventListener('click', () => {
  startMusic();
  resetGame();
});

resumeButton.addEventListener('click', () => {
  togglePause(false);
});

function updateTouchControlsVisibility() {
  if (!touchControls) return;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  touchControls.hidden = !isCoarsePointer;
  if (!isCoarsePointer) {
    clearTouchState();
  }
}

function clearTouchState() {
  touchState.left = false;
  touchState.right = false;
  activeTouchPointers.clear();
}

function handlePointerEnd(event) {
  const direction = activeTouchPointers.get(event.pointerId);
  if (!direction) return;
  activeTouchPointers.delete(event.pointerId);
  if (![...activeTouchPointers.values()].includes(direction)) {
    touchState[direction] = false;
  }
}

function attachTouchControl(button, direction) {
  if (!button) return;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startMusic();
    activeTouchPointers.set(event.pointerId, direction);
    touchState[direction] = true;
    if (button.setPointerCapture) {
      button.setPointerCapture(event.pointerId);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    button.addEventListener(eventName, (event) => {
      if (button.releasePointerCapture) {
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore attempts to release uncaptured pointers.
        }
      }
      handlePointerEnd(event);
    });
  });
}

const coarsePointerMedia = window.matchMedia('(pointer: coarse)');
if (coarsePointerMedia.addEventListener) {
  coarsePointerMedia.addEventListener('change', updateTouchControlsVisibility);
} else if (coarsePointerMedia.addListener) {
  coarsePointerMedia.addListener(updateTouchControlsVisibility);
}

attachTouchControl(touchLeftButton, 'left');
attachTouchControl(touchRightButton, 'right');
updateTouchControlsVisibility();

window.addEventListener('blur', () => {
  keys.clear();
  clearTouchState();
});

setFxMute(false);
setMusicMute(false);
populatePlatforms();
render();
updateHud(true);
overlay.hidden = true;
pauseOverlay.hidden = true;
startOverlay.hidden = false;
requestAnimationFrame(loop);
