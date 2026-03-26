(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreValue = document.getElementById("scoreValue");
  const bestValue = document.getElementById("bestValue");
  const finalScore = document.getElementById("finalScore");
  const finalBest = document.getElementById("finalBest");
  const controlHint = document.getElementById("controlHint");
  const deviceHint = document.getElementById("deviceHint");
  const touchControls = document.getElementById("touchControls");
  const pauseTouchBtn = document.getElementById("pauseTouchBtn");
  const controlButtons = Array.from(document.querySelectorAll(".control-btn[data-control]"));
  const startScreen = document.getElementById("startScreen");
  const gameOverScreen = document.getElementById("gameOverScreen");
  const pauseScreen = document.getElementById("pauseScreen");

  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");

  const STORAGE_KEY = "adaptive_ai_dodge_best_score_v2";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => Math.random() * (max - min) + min;

  function weightedPick(items, weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  class Particle {
    constructor(x, y, vx, vy, life, size, hue, alpha = 1) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.size = size;
      this.hue = hue;
      this.alpha = alpha;
      this.rotation = rand(0, Math.PI * 2);
      this.spin = rand(-2.2, 2.2);
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) return false;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.spin * dt;

      const drag = Math.exp(-2.6 * dt);
      this.vx *= drag;
      this.vy *= drag;

      return true;
    }

    render(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      const glowSize = this.size * (0.9 + (1 - t) * 1.9);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = t * this.alpha;

      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize * 2.2);
      grad.addColorStop(0, `hsla(${this.hue}, 100%, 72%, ${0.9 * t})`);
      grad.addColorStop(0.5, `hsla(${this.hue}, 100%, 60%, ${0.35 * t})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, glowSize * 2.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  class Player {
    constructor(game) {
      this.game = game;
      this.radius = 18;
      this.reset();
    }

    reset() {
      this.x = this.game.width * 0.5;
      this.y = this.game.height * 0.5;
      this.vx = 0;
      this.vy = 0;
      this.trailTimer = 0;
      this.invincibleTime = 0;
      this.seekBoost = 0;
    }

    update(dt, inputX, inputY, touchTarget = null) {
      const accel = this.game.isTouchDevice ? 1240 : 1450;
      const maxSpeed = this.game.isTouchDevice ? 560 : 420;

      if (touchTarget) {
        const dx = touchTarget.x - this.x;
        const dy = touchTarget.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = clamp(dist / 220, 0, 1);
        const desiredVx = dx * 5.8;
        const desiredVy = dy * 5.8;
        const follow = 1 - Math.exp(-10 * dt);
        this.vx = lerp(this.vx, desiredVx, follow * pull);
        this.vy = lerp(this.vy, desiredVy, follow * pull);
        this.seekBoost = lerp(this.seekBoost, pull, 1 - Math.exp(-6 * dt));
      } else {
        this.seekBoost = lerp(this.seekBoost, 0, 1 - Math.exp(-4 * dt));
        this.vx += inputX * accel * dt;
        this.vy += inputY * accel * dt;
      }

      const drag = Math.exp(-(this.game.isTouchDevice ? 4.15 : 4.8) * dt);
      this.vx *= drag;
      this.vy *= drag;

      const speed = Math.hypot(this.vx, this.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        this.vx *= scale;
        this.vy *= scale;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const pad = 28;
      this.x = clamp(this.x, pad, this.game.width - pad);
      this.y = clamp(this.y, pad, this.game.height - pad);

      if (this.invincibleTime > 0) this.invincibleTime -= dt;

      this.trailTimer += dt;
      const trailEmitRate = speed > 35 ? (this.game.isTouchDevice ? 0.012 : 0.014) : 0.04;
      if (this.trailTimer >= trailEmitRate) {
        this.trailTimer = 0;
        this.spawnTrail();
      }
    }

    spawnTrail() {
      const speed = Math.hypot(this.vx, this.vy);
      const backX = this.x - this.vx * 0.02;
      const backY = this.y - this.vy * 0.02;

      const spread = 18 + speed * 0.08;
      const hue = 185 + Math.random() * 100;

      this.game.particles.push(
        new Particle(
          backX + rand(-3, 3),
          backY + rand(-3, 3),
          rand(-spread, spread),
          rand(-spread, spread),
          rand(0.22, 0.55),
          rand(4, 9),
          hue,
          0.86
        )
      );
    }

    render(ctx, time) {
      const speed = Math.hypot(this.vx, this.vy);
      const auraPulse = 1 + Math.sin(time * 6.5) * 0.06 + clamp(speed / 460, 0, 0.16);
      const outerRadius = this.radius * 3.4 * auraPulse;
      const midRadius = this.radius * 1.35;
      const coreRadius = this.radius * 0.55;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, outerRadius);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.16, "rgba(121, 255, 248, 0.95)");
      glow.addColorStop(0.45, "rgba(92, 107, 255, 0.38)");
      glow.addColorStop(0.72, "rgba(255, 79, 216, 0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, outerRadius, 0, Math.PI * 2);
      ctx.fill();

      const body = ctx.createRadialGradient(
        this.x - this.radius * 0.25,
        this.y - this.radius * 0.35,
        0,
        this.x,
        this.y,
        midRadius
      );
      body.addColorStop(0, "rgba(255,255,255,1)");
      body.addColorStop(0.25, "rgba(164, 255, 252, 0.96)");
      body.addColorStop(0.64, "rgba(94, 128, 255, 0.92)");
      body.addColorStop(1, "rgba(24, 18, 60, 0.68)");

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(this.x, this.y, midRadius, 0, Math.PI * 2);
      ctx.fill();

      const core = ctx.createRadialGradient(
        this.x - 3,
        this.y - 4,
        0,
        this.x,
        this.y,
        coreRadius * 2.2
      );
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(0.35, "rgba(255,255,255,0.95)");
      core.addColorStop(0.7, "rgba(135, 255, 251, 0.9)");
      core.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.x, this.y, coreRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.arc(this.x - 6, this.y - 8, 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  class Obstacle {
    constructor(game, x, y, vx, vy, size, shape, hue) {
      this.game = game;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.shape = shape;
      this.hue = hue;
      this.rotation = rand(0, Math.PI * 2);
      this.spin = rand(-2.2, 2.2);
      this.pulse = rand(0, Math.PI * 2);
      this.radius = size * 0.55 + 8;
    }

    update(dt, player, difficulty) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;

      const speed = Math.hypot(this.vx, this.vy);
      const baseSpeed = Math.max(speed, 140 + difficulty * 24);
      const desiredVx = (dx / dist) * baseSpeed;
      const desiredVy = (dy / dist) * baseSpeed;

      const steering = clamp(dt * (1.35 + difficulty * 0.055), 0, 0.17);
      this.vx = lerp(this.vx, desiredVx, steering);
      this.vy = lerp(this.vy, desiredVy, steering);

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.spin * dt * (1 + difficulty * 0.05);
      this.pulse += dt * (2.5 + difficulty * 0.3);
    }

    offscreen(width, height) {
      const margin = 120;
      return (
        this.x < -margin ||
        this.x > width + margin ||
        this.y < -margin ||
        this.y > height + margin
      );
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);

      const glowStrength = 18 + this.size * 0.25;
      ctx.shadowBlur = glowStrength;
      ctx.shadowColor = `hsla(${this.hue}, 100%, 68%, 0.72)`;
      ctx.globalCompositeOperation = "lighter";

      const pulse = 1 + Math.sin(this.pulse) * 0.05;
      const s = this.size * pulse;

      const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.9);
      fill.addColorStop(0, `hsla(${this.hue}, 100%, 68%, 0.96)`);
      fill.addColorStop(0.55, `hsla(${this.hue + 10}, 100%, 55%, 0.86)`);
      fill.addColorStop(1, `hsla(${this.hue + 20}, 100%, 42%, 0.46)`);

      ctx.fillStyle = fill;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;

      if (this.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (this.shape === "square") {
        ctx.beginPath();
        ctx.roundRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84, 8);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.56);
        ctx.lineTo(s * 0.5, s * 0.42);
        ctx.lineTo(-s * 0.5, s * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `hsla(${this.hue + 18}, 100%, 86%, 0.56)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (this.shape === "circle") {
        ctx.arc(0, 0, s * 0.46, 0, Math.PI * 2);
      } else if (this.shape === "square") {
        ctx.roundRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68, 6);
      } else {
        ctx.moveTo(0, -s * 0.47);
        ctx.lineTo(s * 0.41, s * 0.32);
        ctx.lineTo(-s * 0.41, s * 0.32);
        ctx.closePath();
      }
      ctx.stroke();

      ctx.restore();
    }
  }

  class GameController {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.dpr = 1;

      this.state = "intro";
      this.score = 0;
      this.best = this.loadBestScore();

      this.time = 0;
      this.spawnTimer = 0;
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.flash = 0;

      this.keys = {
        ArrowLeft: false,
        ArrowRight: false,
        ArrowUp: false,
        ArrowDown: false,
        KeyA: false,
        KeyD: false,
        KeyW: false,
        KeyS: false
      };

      this.stats = {
        left: 0,
        right: 0,
        up: 0,
        down: 0
      };

      this.player = null;
      this.obstacles = [];
      this.particles = [];
      this.stars = [];

      this.audioCtx = null;
      this.isTouchDevice = this.detectTouchDevice();
      this.isMobile = this.detectMobileDevice();

      this.pointer = {
        active: false,
        id: null,
        x: 0,
        y: 0
      };

      this.virtualInput = {
        left: false,
        right: false,
        up: false,
        down: false
      };

      this.virtualPressCount = {
        left: 0,
        right: 0,
        up: 0,
        down: 0
      };

      this.buttonPointers = new Map();

      this.swipeInput = {
        x: 0,
        y: 0,
        timeLeft: 0,
        duration: 0.18
      };

      this.swipeGesture = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        startTime: 0
      };

      this.resizeQueued = false;
      this.lastTouchEnd = 0;
      this.createStars(this.computeStarCount());
      this.resize();
      this.bindEvents();
      this.applyDeviceUI();
      this.resetScene();

      this.lastFrame = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    detectTouchDevice() {
      return (
        window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0 ||
        "ontouchstart" in window
      );
    }

    detectMobileDevice() {
      const shortEdge = Math.min(window.innerWidth, window.innerHeight);
      return this.detectTouchDevice() || shortEdge <= 900;
    }

    queueResize() {
      if (this.resizeQueued) return;
      this.resizeQueued = true;
      requestAnimationFrame(() => {
        this.resizeQueued = false;
        this.resize();
      });
    }

    computeStarCount() {
      const area = window.innerWidth * window.innerHeight;
      return clamp(Math.round(area / 13000), 70, this.isMobile ? 112 : 160);
    }
    loadBestScore() {
      try {
        return Number(localStorage.getItem(STORAGE_KEY)) || 0;
      } catch {
        return 0;
      }
    }

    saveBestScore() {
      try {
        localStorage.setItem(STORAGE_KEY, String(this.best));
      } catch {
        // ignore storage errors
      }
    }

    createStars(count) {
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: rand(0.6, 1.8),
        speed: rand(3, 18),
        phase: rand(0, Math.PI * 2),
        hue: rand(180, 245)
      }));
    }

    applyDeviceUI() {
      document.body.classList.toggle("touch-device", this.isMobile);
      if (touchControls) {
        touchControls.setAttribute("aria-hidden", this.isMobile ? "false" : "true");
      }

      if (this.isMobile) {
        controlHint.textContent = "Touch drag, swipe, or hold buttons to move | Tap Pause to pause";
        deviceHint.textContent = "Touch drag, swipe, or hold buttons to move";
      } else {
        controlHint.textContent = "Arrow keys or WASD to move | P or Space to pause";
        deviceHint.textContent = "Arrow keys / WASD to move";
      }
    }

    resize() {
      this.isTouchDevice = this.detectTouchDevice();
      this.isMobile = this.detectMobileDevice();

      const maxDpr = this.isMobile ? 2 : 2.5;
      this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      canvas.width = Math.floor(this.width * this.dpr);
      canvas.height = Math.floor(this.height * this.dpr);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.player) {
        this.player.x = clamp(this.player.x, 28, this.width - 28);
        this.player.y = clamp(this.player.y, 28, this.height - 28);
      }

      this.createStars(this.computeStarCount());
      this.applyDeviceUI();
    }

    resetScene() {
      this.player = new Player(this);
      this.obstacles = [];
      this.particles = [];
      this.score = 0;
      this.time = 0;
      this.spawnTimer = 0;
      this.shake = 0;
      this.flash = 0;

      this.stats.left = 0;
      this.stats.right = 0;
      this.stats.up = 0;
      this.stats.down = 0;

      this.pointer.active = false;
      this.pointer.id = null;
      this.swipeInput.timeLeft = 0;
      this.swipeGesture.active = false;
      this.swipeGesture.pointerId = null;
      this.releaseAllVirtualDirections();

      this.updateHUD();
    }

    bindEvents() {
      window.addEventListener("resize", () => this.queueResize(), { passive: true });
      window.addEventListener("orientationchange", () => this.queueResize(), { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => this.queueResize(), { passive: true });
      }

      window.addEventListener("keydown", (e) => {
        const keysOfInterest = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "A", "d", "D", "w", "W", "s", "S", " ", "p", "P", "Enter", "Escape"];
        if (keysOfInterest.includes(e.key)) e.preventDefault();

        if (e.code in this.keys) this.keys[e.code] = true;

        if (e.key === "Enter") {
          if (this.state === "intro" || this.state === "gameover") this.startGame();
        }

        if (e.key === " " || e.key === "p" || e.key === "P") {
          if (this.state === "running") this.pauseGame();
          else if (this.state === "paused") this.resumeGame();
          else if (this.state === "intro") this.startGame();
        }

        if (e.key === "Escape" && this.state === "paused") {
          this.resumeGame();
        }
      });

      window.addEventListener("keyup", (e) => {
        if (e.code in this.keys) this.keys[e.code] = false;
      });

      startBtn.addEventListener("click", () => this.startGame());
      restartBtn.addEventListener("click", () => this.startGame());

      canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e), { passive: false });
      canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e), { passive: false });
      canvas.addEventListener("pointerup", (e) => this.handlePointerEnd(e), { passive: false });
      canvas.addEventListener("pointercancel", (e) => this.handlePointerEnd(e), { passive: false });
      canvas.addEventListener("lostpointercapture", (e) => this.handlePointerEnd(e), { passive: false });

      if (touchControls) {
        this.bindVirtualControls();
      }

      document.addEventListener("touchmove", (e) => {
        if (this.isMobile) e.preventDefault();
      }, { passive: false });

      document.addEventListener("touchend", (e) => {
        const now = performance.now();
        if (now - this.lastTouchEnd < 320) {
          e.preventDefault();
        }
        this.lastTouchEnd = now;
      }, { passive: false });

      document.addEventListener("gesturestart", (e) => {
        e.preventDefault();
      }, { passive: false });

      window.addEventListener("blur", () => {
        this.pointer.active = false;
        this.pointer.id = null;
        this.releaseAllVirtualDirections();
        if (this.state === "running") this.pauseGame();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "running") this.pauseGame();
      });
    }

    handlePointerDown(e) {
      e.preventDefault();

      if (this.state === "intro" || this.state === "gameover") {
        this.startGame();
      } else if (this.state === "paused") {
        this.resumeGame();
      }

      this.pointer.active = true;
      this.pointer.id = e.pointerId;
      this.updatePointerFromEvent(e);
      this.startSwipeTracking(e);

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore capture errors
      }
    }

    handlePointerMove(e) {
      if (!this.pointer.active || this.pointer.id !== e.pointerId) return;
      e.preventDefault();
      this.updatePointerFromEvent(e);
      this.trackSwipeGesture(e);
    }

    handlePointerEnd(e) {
      if (this.pointer.id !== e.pointerId) return;
      e.preventDefault();
      this.finishSwipeTracking(e);
      this.pointer.active = false;
      this.pointer.id = null;
    }

    getCanvasPointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp(e.clientX - rect.left, 0, this.width),
        y: clamp(e.clientY - rect.top, 0, this.height)
      };
    }

    updatePointerFromEvent(e) {
      const point = this.getCanvasPointFromEvent(e);
      this.pointer.x = point.x;
      this.pointer.y = point.y;
    }

    startSwipeTracking(e) {
      if (e.pointerType !== "touch") return;
      const point = this.getCanvasPointFromEvent(e);

      this.swipeGesture.active = true;
      this.swipeGesture.pointerId = e.pointerId;
      this.swipeGesture.startX = point.x;
      this.swipeGesture.startY = point.y;
      this.swipeGesture.lastX = point.x;
      this.swipeGesture.lastY = point.y;
      this.swipeGesture.startTime = performance.now();
    }

    trackSwipeGesture(e) {
      if (!this.swipeGesture.active || this.swipeGesture.pointerId !== e.pointerId) return;
      const point = this.getCanvasPointFromEvent(e);
      this.swipeGesture.lastX = point.x;
      this.swipeGesture.lastY = point.y;
    }

    finishSwipeTracking(e) {
      if (!this.swipeGesture.active || this.swipeGesture.pointerId !== e.pointerId) return;

      const elapsed = performance.now() - this.swipeGesture.startTime;
      const dx = this.swipeGesture.lastX - this.swipeGesture.startX;
      const dy = this.swipeGesture.lastY - this.swipeGesture.startY;
      const dist = Math.hypot(dx, dy);

      // Short, quick gestures add a brief directional impulse for swipe movement.
      if (dist >= 34 && elapsed <= 320) {
        const nx = dx / dist;
        const ny = dy / dist;
        const speed = dist / Math.max(elapsed, 1);
        const strength = clamp(speed / 1.4, 0.45, 1);

        this.swipeInput.x = nx * strength;
        this.swipeInput.y = ny * strength;
        this.swipeInput.timeLeft = this.swipeInput.duration;
      }

      this.swipeGesture.active = false;
      this.swipeGesture.pointerId = null;
    }

    setVirtualDirection(control, pressed) {
      if (!(control in this.virtualInput)) return;

      if (pressed) {
        this.virtualPressCount[control] += 1;
      } else {
        this.virtualPressCount[control] = Math.max(0, this.virtualPressCount[control] - 1);
      }

      this.virtualInput[control] = this.virtualPressCount[control] > 0;
    }

    releaseVirtualPointer(pointerId) {
      const control = this.buttonPointers.get(pointerId);
      if (!control) return;

      this.buttonPointers.delete(pointerId);
      this.setVirtualDirection(control, false);

      if (this.virtualPressCount[control] === 0) {
        const button = touchControls ? touchControls.querySelector(`[data-control="${control}"]`) : null;
        if (button) button.classList.remove("active");
      }
    }

    releaseAllVirtualDirections() {
      this.virtualInput.left = false;
      this.virtualInput.right = false;
      this.virtualInput.up = false;
      this.virtualInput.down = false;

      this.virtualPressCount.left = 0;
      this.virtualPressCount.right = 0;
      this.virtualPressCount.up = 0;
      this.virtualPressCount.down = 0;

      this.buttonPointers.clear();
      for (const button of controlButtons) {
        button.classList.remove("active");
      }
    }

    bindVirtualControls() {
      // Keep button logic isolated so mobile touch input remains modular.
      const releaseFromEvent = (event) => {
        event.preventDefault();
        this.releaseVirtualPointer(event.pointerId);
      };

      for (const button of controlButtons) {
        const control = button.dataset.control;
        if (!control || !(control in this.virtualInput)) continue;

        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();

          this.buttonPointers.set(event.pointerId, control);
          this.setVirtualDirection(control, true);
          button.classList.add("active");

          if (this.state === "intro" || this.state === "gameover") {
            this.startGame();
          } else if (this.state === "paused") {
            this.resumeGame();
          }

          try {
            button.setPointerCapture(event.pointerId);
          } catch {
            // ignore capture errors
          }
        }, { passive: false });

        button.addEventListener("pointerup", releaseFromEvent, { passive: false });
        button.addEventListener("pointercancel", releaseFromEvent, { passive: false });
        button.addEventListener("lostpointercapture", releaseFromEvent, { passive: false });
      }

      if (pauseTouchBtn) {
        pauseTouchBtn.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          if (this.state === "running") this.pauseGame();
          else if (this.state === "paused") this.resumeGame();
          else if (this.state === "intro" || this.state === "gameover") this.startGame();
        }, { passive: false });
      }
    }

    getMovementInput(dt) {
      const left = this.keys.ArrowLeft || this.keys.KeyA || this.virtualInput.left;
      const right = this.keys.ArrowRight || this.keys.KeyD || this.virtualInput.right;
      const up = this.keys.ArrowUp || this.keys.KeyW || this.virtualInput.up;
      const down = this.keys.ArrowDown || this.keys.KeyS || this.virtualInput.down;

      let x = (right ? 1 : 0) - (left ? 1 : 0);
      let y = (down ? 1 : 0) - (up ? 1 : 0);

      if (this.swipeInput.timeLeft > 0) {
        this.swipeInput.timeLeft = Math.max(0, this.swipeInput.timeLeft - dt);
        const blend = this.swipeInput.timeLeft / this.swipeInput.duration;
        x = clamp(x + this.swipeInput.x * blend, -1, 1);
        y = clamp(y + this.swipeInput.y * blend, -1, 1);
      }

      return { x, y };
    }

    initAudio() {
      if (this.audioCtx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
    }

    playTone(freq, duration = 0.12, type = "sine", volume = 0.04) {
      if (!this.audioCtx) return;

      const ctxAudio = this.audioCtx;
      const now = ctxAudio.currentTime;

      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctxAudio.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    vibrate(pattern) {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    }

    startGame() {
      this.initAudio();
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }

      this.resetScene();
      this.state = "running";

      startScreen.classList.remove("visible");
      gameOverScreen.classList.remove("visible");
      pauseScreen.classList.remove("visible");

      this.playTone(220, 0.1, "sine", 0.04);
      this.vibrate(15);
    }

    pauseGame() {
      if (this.state !== "running") return;
      this.state = "paused";
      pauseScreen.classList.add("visible");
      this.playTone(160, 0.08, "triangle", 0.02);
    }

    resumeGame() {
      if (this.state !== "paused") return;
      this.state = "running";
      pauseScreen.classList.remove("visible");
      this.lastFrame = performance.now();
      this.playTone(195, 0.08, "triangle", 0.025);
    }

    endGame() {
      this.state = "gameover";
      pauseScreen.classList.remove("visible");
      gameOverScreen.classList.add("visible");

      if (this.score > this.best) {
        this.best = this.score;
        this.saveBestScore();
      }

      finalScore.textContent = this.score.toFixed(1);
      finalBest.textContent = this.best.toFixed(1);
      this.updateHUD();

      this.shake = 24;
      this.flash = 1;
      this.playTone(92, 0.26, "sawtooth", 0.05);
      this.vibrate([120, 45, 120]);
    }

    updateHUD() {
      scoreValue.textContent = this.score.toFixed(1);
      bestValue.textContent = this.best.toFixed(1);
    }

    addBurst(x, y, count, baseHue = 195, power = 240) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.18, 0.18);
        const speed = rand(power * 0.35, power);
        this.particles.push(
          new Particle(
            x,
            y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            rand(0.35, 0.9),
            rand(4, 11),
            baseHue + rand(-22, 24),
            0.95
          )
        );
      }
    }

    getMovementBias() {
      const totalX = Math.max(0.001, this.stats.left + this.stats.right);
      const totalY = Math.max(0.001, this.stats.up + this.stats.down);

      return {
        left: this.stats.left / totalX,
        right: this.stats.right / totalX,
        up: this.stats.up / totalY,
        down: this.stats.down / totalY
      };
    }

    getSpawnEdge() {
      const bias = this.getMovementBias();

      const centerDx = Math.abs(this.player.x - this.width * 0.5) / (this.width * 0.5);
      const centerDy = Math.abs(this.player.y - this.height * 0.5) / (this.height * 0.5);
      const centerFactor = 1 - clamp((centerDx + centerDy) * 0.5, 0, 1);

      if (centerFactor > 0.72) {
        const edges = ["left", "right", "top", "bottom"];
        return edges[(Math.random() * edges.length) | 0];
      }

      const directional = 1 - centerFactor;
      const weights = [
        1 + directional * (1.2 + bias.left * 4.4),
        1 + directional * (1.2 + bias.right * 4.4),
        1 + directional * (1.2 + bias.up * 4.0),
        1 + directional * (1.2 + bias.down * 4.0)
      ];

      return weightedPick(["left", "right", "top", "bottom"], weights);
    }

    spawnObstacle() {
      const edge = this.getSpawnEdge();
      const size = rand(this.isTouchDevice ? 20 : 20, this.isTouchDevice ? 42 : 44);
      const shape = weightedPick(["circle", "triangle", "square"], [0.42, 0.34, 0.24]);
      const hue = rand(185, 320);

      let x = 0;
      let y = 0;

      if (edge === "left") {
        x = -size - 20;
        y = rand(0, this.height);
      } else if (edge === "right") {
        x = this.width + size + 20;
        y = rand(0, this.height);
      } else if (edge === "top") {
        x = rand(0, this.width);
        y = -size - 20;
      } else {
        x = rand(0, this.width);
        y = this.height + size + 20;
      }

      const dx = this.player.x - x;
      const dy = this.player.y - y;
      const dist = Math.hypot(dx, dy) || 1;

      const difficulty = 1 + this.score * 0.08;
      const speed = rand(150, 215) + difficulty * 10;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;

      this.obstacles.push(new Obstacle(this, x, y, vx, vy, size, shape, hue));
    }

    detectCollision(obstacle) {
      const dx = obstacle.x - this.player.x;
      const dy = obstacle.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const safeRadius = this.player.radius * 1.15 + obstacle.radius * 0.92;
      return dist < safeRadius;
    }

    update(dt) {
      this.time += dt;

      if (this.state === "running") {
        this.score += dt;
        this.updateHUD();

        const movementInput = this.getMovementInput(dt);
        const inputX = movementInput.x;
        const inputY = movementInput.y;
        const decay = Math.exp(-0.32 * dt);
        this.stats.left *= decay;
        this.stats.right *= decay;
        this.stats.up *= decay;
        this.stats.down *= decay;

        if (inputX < 0) this.stats.left += dt * 1.7;
        if (inputX > 0) this.stats.right += dt * 1.7;
        if (inputY < 0) this.stats.up += dt * 1.7;
        if (inputY > 0) this.stats.down += dt * 1.7;

        const hasVirtualHold = this.virtualInput.left || this.virtualInput.right || this.virtualInput.up || this.virtualInput.down;
        const hasAxisInput = Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001;
        const touchTarget = this.pointer.active && !hasVirtualHold && !hasAxisInput ? { x: this.pointer.x, y: this.pointer.y } : null;
        this.player.update(dt, inputX, inputY, touchTarget);
        const difficulty = 1 + this.score * 0.16;
        const targetInterval = clamp(0.95 - this.score * 0.012, 0.24, 0.95);

        this.spawnTimer += dt;
        while (this.spawnTimer >= targetInterval) {
          this.spawnTimer -= targetInterval;
          this.spawnObstacle();
        }

        const aliveObstacles = [];
        for (const obstacle of this.obstacles) {
          obstacle.update(dt, this.player, difficulty);

          if (this.detectCollision(obstacle)) {
            this.addBurst(this.player.x, this.player.y, 30, 200, 280);
            this.addBurst(obstacle.x, obstacle.y, 18, obstacle.hue, 220);
            this.endGame();
            break;
          }

          if (!obstacle.offscreen(this.width, this.height)) {
            aliveObstacles.push(obstacle);
          }
        }

        this.obstacles = aliveObstacles;
      }

      const aliveParticles = [];
      for (const p of this.particles) {
        if (p.update(dt)) aliveParticles.push(p);
      }
      this.particles = aliveParticles;

      this.shake = Math.max(0, this.shake - dt * 30);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
      this.flash = Math.max(0, this.flash - dt * 2.0);
    }

    drawBackground() {
      const bg = ctx.createLinearGradient(0, 0, this.width, this.height);
      bg.addColorStop(0, "#05060b");
      bg.addColorStop(0.45, "#0b0a1b");
      bg.addColorStop(1, "#090f1f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.width, this.height);

      const t = this.time;
      const blobs = [
        { x: this.width * (0.2 + Math.sin(t * 0.15) * 0.03), y: this.height * (0.23 + Math.cos(t * 0.13) * 0.02), r: Math.min(this.width, this.height) * 0.42, color: "rgba(255,79,216,0.10)" },
        { x: this.width * (0.78 + Math.cos(t * 0.11) * 0.03), y: this.height * (0.25 + Math.sin(t * 0.17) * 0.02), r: Math.min(this.width, this.height) * 0.36, color: "rgba(85,246,255,0.09)" },
        { x: this.width * 0.52, y: this.height * (0.82 + Math.sin(t * 0.09) * 0.02), r: Math.min(this.width, this.height) * 0.47, color: "rgba(109,125,255,0.08)" }
      ];

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const blob of blobs) {
        const grad = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
        grad.addColorStop(0, blob.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const star of this.stars) {
        const driftX = Math.sin(t * 0.08 + star.phase) * 10;
        const driftY = Math.cos(t * 0.06 + star.phase) * 12;
        const x = mod(star.x * this.width + driftX, this.width);
        const y = mod(star.y * this.height + driftY, this.height);
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + star.phase));
        ctx.fillStyle = `hsla(${star.hue}, 100%, 80%, ${0.65 * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, star.r * twinkle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      const step = 80;
      for (let x = (this.time * 18) % step; x < this.width + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = (this.time * 12) % step; y < this.height + step; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawTouchReticle() {
      if (!this.pointer.active || this.state !== "running") return;

      const x = this.pointer.x;
      const y = this.pointer.y;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const outer = ctx.createRadialGradient(x, y, 0, x, y, 82);
      outer.addColorStop(0, "rgba(85,246,255,0.10)");
      outer.addColorStop(0.45, "rgba(255,79,216,0.12)");
      outer.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(x, y, 82, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(85,246,255,0.65)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    render() {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);

      ctx.save();
      ctx.translate(this.shakeX, this.shakeY);

      this.drawBackground();

      ctx.save();
      const vignette = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.5,
        Math.min(this.width, this.height) * 0.22,
        this.width * 0.5,
        this.height * 0.5,
        Math.max(this.width, this.height) * 0.78
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.54)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();

      for (const p of this.particles) p.render(ctx);
      for (const obstacle of this.obstacles) obstacle.render(ctx);
      this.drawTouchReticle();

      if (this.player) this.player.render(ctx, this.time);

      if (this.flash > 0) {
        ctx.save();
        ctx.globalAlpha = this.flash * 0.28;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
      }

      ctx.restore();
    }

    loop(now) {
      const rawDt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      const dt = clamp(rawDt, 0, 0.033);

      this.update(dt);
      this.render();

      requestAnimationFrame((t) => this.loop(t));
    }
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const radius = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
      this.beginPath();
      this.moveTo(x + radius.tl, y);
      this.lineTo(x + w - radius.tr, y);
      this.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
      this.lineTo(x + w, y + h - radius.br);
      this.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
      this.lineTo(x + radius.bl, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
      this.lineTo(x, y + radius.tl);
      this.quadraticCurveTo(x, y, x + radius.tl, y);
      this.closePath();
    };
  }

  new GameController();
})();
