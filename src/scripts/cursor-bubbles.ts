/**
 * 鼠标跟随特效：气泡上浮。
 *
 * 主题契合：站点是"深潜蓝 + 飞鱼青"，标语是"潜得够深，才能跃出水面"，
 * 所以光标拖出的不是通用光点，而是**从水下往上浮的气泡**。
 *
 * 三条设计底线：
 *   1. **绝不干扰操作**。canvas 层用 pointer-events: none，
 *      不拦截任何点击/悬停。站上有 4 个全局 click 监听
 *      （复制代码、返回顶部、Giscus、主题切换），一个都不能挡。
 *   2. **性能可控**。粒子上限硬编码，距上次生成不足阈值就不生成，
 *      没有粒子时完全停掉 rAF 循环。
 *   3. **尊重无障碍设置**。prefers-reduced-motion 或触屏设备直接不启动。
 *
 * 用 canvas 而不是往 DOM 里塞元素：每个粒子一个 DOM 节点的话，
 * 快速移动鼠标时会瞬间产生上百个节点，触发大量样式重算。
 */
export const CURSOR_BUBBLES_SCRIPT = `
(function () {
  /* ── 前置检查：任何一条不满足就完全不启动 ── */

  /* 尊重"减少动态效果" */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* 触屏/无精确指针的设备不启动。手机上没有"悬停"，
     跟随手指的粒子既挡内容又耗电，得不偿失。 */
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  /* ── 配置 ── */
  var MAX_PARTICLES = 160;      /* 粒子上限，超过就丢弃最老的 */
  var SPAWN_DISTANCE = 9;       /* 鼠标移动多少像素生成一个，越大越稀疏 */
  var MAX_RIPPLES = 10;         /* 涟漪数量上限 */
  var MAX_WAVES = 4;            /* 冲击波数量上限 */
  var CLICK_COOLDOWN = 90;      /* 连点保护：毫秒，避免狂点堆爆粒子 */

  var canvas = document.createElement('canvas');
  canvas.className = 'cursor-fx';
  canvas.setAttribute('aria-hidden', 'true');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = 1;
  var width = 0;
  var height = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); /* 上限 2，4K 屏上也别烧 GPU */
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ── 粒子 ── */
  var bubbles = [];
  var ripples = [];
  var waves = [];
  var lastClickAt = 0;
  var running = false;
  var rafId = 0;

  /** 从主题取色，这样深浅色切换时气泡颜色自动跟着变 */
  function accentRgb() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    /* --accent 可能是 #0a7d8c 或 #2dd4bf */
    if (v.charAt(0) === '#') {
      var h = v.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [45, 212, 191];
  }

  function spawn(x, y, opts) {
    opts = opts || {};
    var r = opts.big ? 10 + Math.random() * 14 : 1.6 + Math.random() * 3.4;

    /*
     * 初速度方向。
     * 鼠标划过的气泡只往上浮；点击爆发的气泡先向四周散开再转上浮，
     * 这样"点下去"的手感是向外炸开，而不是原地冒泡。
     */
    var vx = 0;
    var vy = -(0.25 + Math.random() * 0.55) * (opts.big ? 0.5 : 1);
    if (opts.burst) {
      var ang = opts.angle !== undefined ? opts.angle : Math.random() * Math.PI * 2;
      var spd = (opts.speed || 2.4) * (0.55 + Math.random() * 0.8);
      vx = Math.cos(ang) * spd;
      vy = Math.sin(ang) * spd;
    }

    var b = {
      x: x + (opts.burst ? 0 : (Math.random() - 0.5) * 10),
      y: y + (opts.burst ? 0 : (Math.random() - 0.5) * 10),
      r: r,
      vx: vx,
      vy: vy,
      /* 爆发出来的气泡受阻尼，很快停下来转为上浮 */
      damp: opts.burst ? 0.9 : 1,
      /* 左右轻微摆动，避免像直线上升的雨点 */
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.012 + Math.random() * 0.025,
      swayAmp: opts.burst ? 0.12 : 0.25 + Math.random() * 0.5,
      life: 0,
      maxLife: opts.big ? 90 + Math.random() * 60 : 45 + Math.random() * 45,
      alpha: opts.big ? 0.26 : 0.1 + Math.random() * 0.14,
      hollow: !!opts.burst /* 指带空心的气泡更像真气泡 */
    };
    if (bubbles.length >= MAX_PARTICLES) bubbles.shift();
    bubbles.push(b);
    start();
  }

  /* ── 主循环 ── */
  function frame() {
    ctx.clearRect(0, 0, width, height);
    var rgb = accentRgb();
    var base = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',';

    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.life++;
      b.sway += b.swaySpeed;

      /* 爆发气泡：初速向四周，受阻尼后逐渐只剩上浮 */
      if (b.damp !== 1) {
        b.vx *= b.damp;
        b.vy *= b.damp;
        /* 阻尼到很慢之后，叠加一点浮力，过渡成正常上浮 */
        b.vy -= 0.012;
        b.x += b.vx;
        b.y += b.vy;
        /* 半径略微收缩，像气泡上浮时被水压挤小 */
        b.r *= 0.994;
      } else {
        b.y += b.vy;
      }
      b.x += Math.sin(b.sway) * b.swayAmp;

      var t = b.life / b.maxLife;
      if (t >= 1 || b.r < 0.4) { bubbles.splice(i, 1); continue; }

      /* 淡入很快、淡出很慢，看起来更像气泡而不是闪光 */
      var fade = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
      var a = b.alpha * fade;

      if (b.hollow) {
        /* 空心气泡：描边 + 左上角高光，比实心圆更像水里的气泡 */
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = base + a * 1.5 + ')';
        ctx.lineWidth = Math.max(0.7, b.r * 0.16);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.26, 0, Math.PI * 2);
        ctx.fillStyle = base + a * 1.7 + ')';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = base + a + ')';
        ctx.fill();
        /* 大气泡加一点高光，模拟水下气泡的反光 */
        if (b.r > 3) {
          ctx.beginPath();
          ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.32, 0, Math.PI * 2);
          ctx.fillStyle = base + a * 0.85 + ')';
          ctx.fill();
        }
      }
    }

    /* 涟漪：细环，扩散较慢 */
    for (var j = ripples.length - 1; j >= 0; j--) {
      var rp = ripples[j];
      rp.life++;
      var rt = rp.life / rp.maxLife;
      if (rt >= 1) { ripples.splice(j, 1); continue; }
      var rrad = 6 + rt * 34;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rrad, 0, Math.PI * 2);
      ctx.strokeStyle = base + (1 - rt) * 0.3 + ')';
      ctx.lineWidth = 1.4 * (1 - rt) + 0.4;
      ctx.stroke();
    }

    /* 冲击波：点击瞬间扩散一圈，比涟漪更快更淡，制造"破开水面"的力度 */
    for (var k = waves.length - 1; k >= 0; k--) {
      var wv = waves[k];
      wv.life++;
      var wt = wv.life / wv.maxLife;
      if (wt >= 1) { waves.splice(k, 1); continue; }
      /* 缓出：一开始扩得快，后面慢下来 */
      var ease = 1 - Math.pow(1 - wt, 3);
      var wrad = 4 + ease * 64;
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wrad, 0, Math.PI * 2);
      ctx.strokeStyle = base + (1 - wt) * (1 - wt) * 0.34 + ')';
      ctx.lineWidth = 2.6 * (1 - wt) + 0.3;
      ctx.stroke();
    }

    if (bubbles.length || ripples.length || waves.length) {
      rafId = window.requestAnimationFrame(frame);
    } else {
      running = false;
      ctx.clearRect(0, 0, width, height);
    }
  }

  function start() {
    if (running) return;
    running = true;
    rafId = window.requestAnimationFrame(frame);
  }

  /* ── 输入 ── */
  var lastX = null;
  var lastY = null;

  function onMove(x, y) {
    if (lastX === null) { lastX = x; lastY = y; return; }
    var dx = x - lastX;
    var dy = y - lastY;
    if (dx * dx + dy * dy < SPAWN_DISTANCE * SPAWN_DISTANCE) return;
    lastX = x;
    lastY = y;
    spawn(x, y);
  }

  window.addEventListener('mousemove', function (e) {
    onMove(e.clientX, e.clientY);
  }, { passive: true });

  /* 鼠标离开窗口时保留已有气泡自然消散，不额外处理 */
  document.addEventListener('mouseleave', function () { lastX = null; lastY = null; });

  /*
   * 点击特效：破泡爆发。
   *
   * 与鼠标特效的关系：鼠标划过是"一串气泡安静上浮"，
   * 点击则是"气泡被戳破，向外炸开再上浮"，同一个意象的两种力度。
   * 三层叠加：
   *   冲击波 —— 一圈快速扩散的淡环，给出瞬间的力度
   *   涟漪   —— 一圈慢一点的细环，留一点余韵
   *   爆散气泡 —— 12 个沿圆周均匀分布向外飞，受阻尼后转上浮
   *
   * 两条底线：
   *   1. 不调用 preventDefault / stopPropagation，
   *      站上的复制按钮、主题切换、Giscus 等监听照常工作。
   *   2. 连点保护：90ms 内重复触发直接忽略，避免狂点把粒子堆爆。
   */
  window.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;

    var now = Date.now();
    if (now - lastClickAt < CLICK_COOLDOWN) return;
    lastClickAt = now;

    var cx = e.clientX;
    var cy = e.clientY;

    /* 冲击波 */
    if (waves.length >= MAX_WAVES) waves.shift();
    waves.push({ x: cx, y: cy, life: 0, maxLife: 26 });

    /* 涟漪（比特效稍慢，形成两层节奏） */
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: cx, y: cy, life: 0, maxLife: 52 });

    /* 爆散气泡：角度均匀分布，再用随机扰动打散，避免看出"齿轮"感 */
    var COUNT = 12;
    for (var i = 0; i < COUNT; i++) {
      var base = (Math.PI * 2 * i) / COUNT;
      spawn(cx, cy, {
        burst: true,
        angle: base + (Math.random() - 0.5) * 0.5,
        speed: 2.2 + Math.random() * 1.8,
        big: false
      });
    }

    /* 中心再补两个大的，视觉重心留在点击点 */
    for (var j = 0; j < 2; j++) {
      spawn(cx, cy, {
        burst: true,
        angle: Math.random() * Math.PI * 2,
        speed: 1.1,
        big: true
      });
    }

    start();
  }, { passive: true });

  /* 切到后台就停下，不在看不见的时候烧 CPU */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      running = false;
      bubbles.length = 0;
      ripples.length = 0;
      waves.length = 0;
      ctx.clearRect(0, 0, width, height);
    }
  });

  window.addEventListener('resize', function () {
    resize();
  }, { passive: true });

  /* ── 启动 ── */
  function init() {
    resize();
    document.body.appendChild(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
