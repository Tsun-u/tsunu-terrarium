/* render.js — 渲染模組（場景、日夜、小動物、星空、事件動畫）。介面見 contract.js。
   漸進模式：Genetics.rasterize 尚未就緒時，小動物以基因色圓點佔位。 */

const Render = {};

(() => {
  let ctx = null;
  let sceneCanvas = null;          // 地景（畫一次快取）
  let bgStars = [];                // 背景裝飾星（非紀念星）
  const spriteCache = new Map();   // key: `${id}:${stage}` -> canvas
  const smooth = new Map();        // id -> {rx, ry}（渲染用平滑座標）
  const anims = [];                // {type, x, y, start, dur, data}
  const fruits = [];               // {x, y, eaten:bool}（純演出）

  /* ---------- 初始化 ---------- */

  function ensureInit() {
    if (ctx) return;
    ctx = document.getElementById('world').getContext('2d');
    ctx.imageSmoothingEnabled = false;
    buildScene();
    const rng = rngFactory(20260708);
    const starCount = Math.round(C.WORLD_W * C.SKY_H / 165);   // 隨天空面積配星量
    for (let i = 0; i < starCount; i++) {
      bgStars.push({ x: 4 + rng() * (C.WORLD_W - 8), y: 2 + rng() * (C.SKY_H - 6), p: rng() * 6.28 });
    }
  }

  // 地景：草地色塊噪聲、小花、石頭、池塘（座標一律比例式，地圖改尺寸不用重寫）
  function buildScene() {
    sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = C.WORLD_W; sceneCanvas.height = C.WORLD_H;
    const s = sceneCanvas.getContext('2d');
    const rng = rngFactory(9527);
    const W = C.WORLD_W, H = C.WORLD_H;
    const grass = ['#7cb860', '#88c46c', '#74ae5a'];
    for (let y = C.SKY_H; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        s.fillStyle = grass[Math.floor(rng() * 3)];
        s.fillRect(x, y, 4, 4);
      }
    }
    // 池塘（右下；擴建後半徑放大）
    const px = W * 0.79, py = H * 0.8;
    const prx = (scenePondBig ? 40 : 26), pry = (scenePondBig ? 22 : 14);
    s.fillStyle = '#5a9bc4';
    s.beginPath(); s.ellipse(px, py, prx, pry, 0, 0, 6.29); s.fill();
    s.fillStyle = '#74b4d8';
    s.beginPath(); s.ellipse(px - 3, py - 2, prx * 0.72, pry * 0.64, 0, 0, 6.29); s.fill();
    if (scenePondBig) {   // 擴建版加一圈淺灘與蓮葉
      s.fillStyle = '#8cc8e0';
      s.beginPath(); s.ellipse(px - 6, py - 4, prx * 0.4, pry * 0.35, 0, 0, 6.29); s.fill();
      s.fillStyle = '#6fae62';
      [[px - 14, py + 6], [px + 12, py - 8]].forEach(([lx, ly]) => s.fillRect(lx, ly, 4, 3));
    }
    // 石頭（比例撒點）
    [[0.15, 0.44], [0.62, 0.36], [0.34, 0.88], [0.88, 0.35], [0.08, 0.78]].forEach(([fx, fy]) => {
      const x = Math.round(W * fx), y = Math.round(H * fy);
      s.fillStyle = '#9aa0a8'; s.fillRect(x, y, 7, 5);
      s.fillStyle = '#b8bec6'; s.fillRect(x + 1, y - 1, 5, 3);
    });
    // 小花（十字 3px；數量隨面積）
    const petals = ['#ffd3e0', '#fff3b8', '#e0d3ff', '#ffe0c4'];
    const flowerCount = Math.round(W * (H - C.SKY_H) / 4800);
    for (let i = 0; i < flowerCount; i++) {
      const x = 8 + Math.floor(rng() * (W - 16));
      const y = C.SKY_H + 8 + Math.floor(rng() * (H - C.SKY_H - 20));
      if (Math.hypot(x - px, y - py) < prx + 14) continue;   // 避開池塘
      const c = petals[i % 4];
      s.fillStyle = c;
      s.fillRect(x - 1, y, 3, 1); s.fillRect(x, y - 1, 1, 3);
      s.fillStyle = '#ffca28'; s.fillRect(x, y, 1, 1);
    }
    // 生態瓶暗角
    const g = s.createRadialGradient(W / 2, H / 2, W * 0.375, W / 2, H / 2, W * 0.67);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,30,20,0.35)');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
  }

  /* ---------- 日夜 ---------- */

  // 0 = 午夜、0.5 = 正午；回傳亮度 0~1
  function brightness(world) {
    const phase = (world.tick % C.DAYNIGHT_SEC) / C.DAYNIGHT_SEC;
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  }
  const lerpC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  // 夜空底色偏亮：夜幕是全畫面壓暗，天空會再被壓一次，這裡先補回來
  const NIGHT_SKY = [38, 48, 92], DAY_SKY = [140, 200, 235];

  /* ---------- sprite ---------- */

  function getSprite(cr) {
    const key = cr.id + ':' + cr.stage;
    if (spriteCache.has(key)) return spriteCache.get(key);
    let cv;
    if (typeof Genetics.rasterize === 'function') {
      const r = Genetics.rasterize(cr.genes, cr.stage);
      cv = document.createElement('canvas');
      cv.width = r.w; cv.height = r.h;
      cv.getContext('2d').putImageData(new ImageData(r.pixels, r.w, r.h), 0, 0);
    } else {
      cv = placeholderSprite(cr);   // Genetics 未就緒：色圓佔位
    }
    cv = withOutline(cv, cr);       // 外框線：避免小動物跟背景溶在一起
    spriteCache.set(key, cv);
    return cv;
  }

  // 明暗自適應外框：主色亮 → 近黑框、主色暗 → 近白框。
  // 掃 alpha：透明像素若貼著不透明像素就是框。
  function withOutline(src, cr) {
    const w = src.width + 2, h = src.height + 2;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const c2 = out.getContext('2d');
    c2.drawImage(src, 1, 1);
    const img = c2.getImageData(0, 0, w, h);
    const px = img.data;
    const solid = i => px[i * 4 + 3] > 60;
    // 主色感知亮度（用基因色估算）
    const { h: gh, s: gs, l: gl } = cr.genes.color;
    const a = gs * Math.min(gl, 1 - gl);
    const f = n => { const k = (n + gh / 30) % 12;
      return gl - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
    const lum = 0.299 * f(0) + 0.587 * f(8) + 0.114 * f(4);   // 0~1
    const [or_, og, ob] = lum > 0.62 ? [42, 44, 56] : [248, 248, 242];
    const marks = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid(i)) continue;
      const near = (x > 0 && solid(i - 1)) || (x < w - 1 && solid(i + 1)) ||
                   (y > 0 && solid(i - w)) || (y < h - 1 && solid(i + w));
      if (near) marks.push(i);
    }
    for (const i of marks) {
      px[i * 4] = or_; px[i * 4 + 1] = og; px[i * 4 + 2] = ob; px[i * 4 + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    return out;
  }

  function placeholderSprite(cr) {
    const d = cr.stage === 'child' ? 5 : cr.stage === 'egg' ? 8 : 12;
    const cv = document.createElement('canvas');
    cv.width = d; cv.height = d;
    const s = cv.getContext('2d');
    s.fillStyle = `hsl(${cr.genes.color.h}, ${cr.genes.color.s * 100}%, ${cr.genes.color.l * 100}%)`;
    s.beginPath(); s.arc(d / 2, d / 2, d / 2, 0, 6.29); s.fill();
    if (cr.stage !== 'egg') {
      s.fillStyle = '#222';
      s.fillRect(Math.floor(d * 0.3), Math.floor(d * 0.35), 1, 1);
      s.fillRect(Math.floor(d * 0.6), Math.floor(d * 0.35), 1, 1);
    }
    return cv;
  }

  /* ---------- 事件 → 動畫佇列 ---------- */

  Render.onEvents = function (world, events) {
    const now = performance.now();
    const find = id => world.creatures.find(c => c.id === id) ||
                       world.archive.find(c => c.id === id);
    for (const ev of events) {
      const cr = find(ev.ids[0]);
      if (!cr) continue;
      const base = { x: cr.x ?? C.WORLD_W / 2, y: cr.y ?? C.WORLD_H / 2, start: now };
      if (ev.type === 'matured') {
        anims.push({ ...base, type: 'bloom', dur: 800, data: { id: cr.id } });
        spriteCache.delete(cr.id + ':child');
      } else if (ev.type === 'born') {
        anims.push({ ...base, type: 'shell', dur: 600 });
        spriteCache.delete(cr.id + ':egg');
      } else if (ev.type === 'family') {
        anims.push({ ...base, type: 'hearts', dur: 1300 });
      } else if (ev.type === 'starred') {
        // archive 紀錄沒有座標——用渲染端最後的平滑座標當升空起點
        const last = smooth.get(cr.id);
        const sx = last ? last.rx : base.x, sy = last ? last.ry : base.y;
        anims.push({ x: sx, y: sy, start: now, type: 'ascend', dur: 3000, data: { cr, world } });
        smooth.delete(cr.id);
      }
    }
  };

  const FRUIT_TTL_MS = 90000;   // 沒人吃的果實 90 秒後凋謝
  Render.addFruit = (x, y) => { fruits.push({ x, y, eaten: false, born: performance.now() }); };
  Render.fruits = fruits;   // ui.js 引導小動物時讀取
  Render.heartsAt = (x, y) => { anims.push({ type: 'hearts', x, y, start: performance.now(), dur: 1300 }); };

  /* ---------- 裝飾（第二階段） ---------- */

  const decorCache = new Map();
  let scenePondBig = false;

  function decorSprite(kind, tMs) {
    if (kind === 'swing') return swingSprite(tMs);   // 鞦韆會微擺，不快取
    if (decorCache.has(kind)) return decorCache.get(kind);
    const cv = document.createElement('canvas');
    const s = cv.getContext('2d');
    if (kind === 'flower') {
      cv.width = 16; cv.height = 9;
      const petals = ['#ffd3e0', '#fff3b8', '#e0d3ff', '#ffc4d0', '#d3f0ff'];
      s.fillStyle = '#5f9e4c'; s.fillRect(1, 6, 14, 3);
      [[2, 3], [5, 1], [8, 4], [11, 1], [13, 3]].forEach(([x, y], i) => {
        s.fillStyle = petals[i];
        s.fillRect(x - 1, y + 1, 3, 1); s.fillRect(x, y, 1, 3);
        s.fillStyle = '#ffca28'; s.fillRect(x, y + 1, 1, 1);
      });
    } else if (kind === 'lantern') {
      cv.width = 10; cv.height = 15;
      s.fillStyle = '#8d99a6'; s.fillRect(3, 10, 4, 5);        // 柱
      s.fillStyle = '#aab6c2'; s.fillRect(1, 8, 8, 2);         // 台
      s.fillStyle = '#77828e'; s.fillRect(2, 3, 6, 5);         // 燈室
      s.fillStyle = '#ffe9a8'; s.fillRect(3, 4, 4, 3);         // 燈芯
      s.fillStyle = '#aab6c2'; s.fillRect(1, 1, 8, 2); s.fillRect(3, 0, 4, 1);  // 頂
    } else if (kind === 'bridge') {
      cv.width = 26; cv.height = 11;
      s.fillStyle = '#a8794f';
      for (let x = 0; x < 26; x += 2) {
        const arch = Math.round(3 * Math.sin(Math.PI * (x + 1) / 26));
        s.fillRect(x, 6 - arch, 2, 3);
      }
      s.fillStyle = '#8a5f3a';
      for (let x = 0; x < 26; x += 6) {
        const arch = Math.round(3 * Math.sin(Math.PI * (x + 1) / 26));
        s.fillRect(x, 3 - arch, 1, 3 + arch);                  // 欄杆
      }
      s.fillStyle = '#c79868'; s.fillRect(0, 2, 26, 1);        // 扶手
    }
    decorCache.set(kind, cv);
    return cv;
  }

  function swingSprite(tMs) {
    const cv = document.createElement('canvas');
    cv.width = 20; cv.height = 17;
    const s = cv.getContext('2d');
    s.fillStyle = '#8a5f3a';
    s.fillRect(1, 2, 2, 15); s.fillRect(17, 2, 2, 15);         // 柱
    s.fillRect(0, 0, 20, 2);                                    // 橫梁
    const sway = Math.round(Math.sin(tMs / 800) * 1.6);
    s.fillStyle = '#c9c2b8';
    s.fillRect(7 + sway, 2, 1, 9); s.fillRect(12 + sway, 2, 1, 9);  // 繩
    s.fillStyle = '#c79868'; s.fillRect(6 + sway, 11, 8, 2);   // 座板
    return cv;
  }

  function drawDecor(world, tMs, b) {
    const list = world.decor || [];
    // 池塘擴建：以 scene 重繪呈現
    const wantBig = list.some(d => d.kind === 'pond');
    if (wantBig !== scenePondBig) { scenePondBig = wantBig; buildScene(); }
    for (const d of list) {
      if (d.kind === 'pond') continue;
      const sp = decorSprite(d.kind, tMs);
      ctx.drawImage(sp, Math.round(d.x - sp.width / 2), Math.round(d.y - sp.height));
    }
  }

  // 石燈夜光：畫在夜幕之上才不會被壓暗（同星星層）
  function drawLanternGlows(world, b) {
    if (b >= 0.45) return;
    const a = (0.45 - b) * 0.9;
    for (const d of (world.decor || [])) {
      if (d.kind !== 'lantern') continue;
      const g = ctx.createRadialGradient(d.x, d.y - 10, 1, d.x, d.y - 10, 14);
      g.addColorStop(0, `rgba(255,226,150,${a * 0.55})`);
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 14, d.y - 24, 28, 28);
    }
  }

  // 商店縮圖用
  Render.decorThumb = kind => decorSprite(kind, 0);

  /* ---------- 選取光圈（月老／延壽選人模式） ---------- */

  let highlight = { ids: [], color: '#ffd54f', dimOthers: false };
  Render.setHighlight = (ids, color, dimOthers) => {
    highlight = { ids: ids || [], color: color || '#ffd54f', dimOthers: !!dimOthers };
  };
  Render.isDimmed = cr =>
    highlight.ids.length > 0 && highlight.dimOthers && !highlight.ids.includes(cr.id);

  function drawHighlights(world, tMs) {
    if (!highlight.ids.length) return;
    const pulse = 0.65 + 0.35 * Math.sin(tMs / 260);   // 下限提高，靜態截圖也看得見
    for (const id of highlight.ids) {
      const s = smooth.get(id);
      const cr = world.creatures.find(c => c.id === id);
      if (!s || !cr) continue;
      ctx.lineWidth = 2;
      ctx.strokeStyle = highlight.color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.ellipse(s.rx, s.ry - 0.5, 9, 3.8, 0, 0, 6.29);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
  }

  /* ---------- 放置模式的幽靈預覽 ---------- */

  let ghost = null;   // { kind, x, y } | null
  Render.setGhost = g => { ghost = g; };

  function drawGhost(tMs) {
    if (!ghost) return;
    ctx.globalAlpha = 0.55;
    if (ghost.kind === 'pond') {
      // 池塘擴建位置固定：在池塘處畫虛線圈示意
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#bfe6ff';
      ctx.beginPath();
      ctx.ellipse(C.WORLD_W * 0.79, C.WORLD_H * 0.8, 40, 22, 0, 0, 6.29);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const sp = decorSprite(ghost.kind, tMs);
      ctx.drawImage(sp, Math.round(ghost.x - sp.width / 2), Math.round(ghost.y - sp.height));
      ctx.fillStyle = 'rgba(24,36,24,0.25)';
      ctx.beginPath();
      ctx.ellipse(ghost.x, ghost.y - 0.5, sp.width * 0.3, 2, 0, 0, 6.29);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 療癒事件動畫（第二階段） ---------- */

  const ambients = [];   // {kind, start, dur, data}
  Render.isNight = world => brightness(world) < 0.35;
  Render.isDay = world => brightness(world) > 0.6;

  Render.playAmbient = function (kind, world) {
    const now = performance.now();
    const rnd = Math.random;
    if (kind === 'butterfly') {
      const n = 3 + Math.floor(rnd() * 3);
      const fromLeft = rnd() < 0.5;
      const flock = [];
      for (let i = 0; i < n; i++) flock.push({
        y0: C.SKY_H + 15 + rnd() * (C.WORLD_H - C.SKY_H - 60),
        amp: 4 + rnd() * 6, ph: rnd() * 6.28,
        spd: 22 + rnd() * 10, delay: i * 700,
        hue: [340, 45, 200, 280][Math.floor(rnd() * 4)],
      });
      ambients.push({ kind, start: now, dur: 18000, data: { flock, fromLeft } });
    } else if (kind === 'meteor') {
      ambients.push({ kind, start: now, dur: 1600,
        data: { x0: 30 + rnd() * (C.WORLD_W - 90), y0: 2 + rnd() * 8 } });
    } else if (kind === 'rainbow') {
      ambients.push({ kind, start: now, dur: 12000, data: {} });
    } else if (kind === 'firefly') {
      const dots = [];
      for (let i = 0; i < 12; i++) dots.push({
        x: 20 + rnd() * (C.WORLD_W - 40), y: C.SKY_H + 15 + rnd() * (C.WORLD_H - C.SKY_H - 40),
        vx: (rnd() - 0.5) * 0.3, vy: (rnd() - 0.5) * 0.2, ph: rnd() * 6.28 });
      ambients.push({ kind, start: now, dur: 20000, data: { dots } });
    } else if (kind === 'gift') {
      const alive = world.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star');
      if (alive.length < 2) return;
      const a = alive[Math.floor(rnd() * alive.length)];
      let bTar = alive[Math.floor(rnd() * alive.length)];
      if (bTar === a) bTar = alive[(alive.indexOf(a) + 1) % alive.length];
      ambients.push({ kind, start: now, dur: 4200, data: { fromId: a.id, toId: bTar.id } });
    } else if (kind === 'petals') {
      const petals = [];
      const count = Math.round(C.WORLD_W / 13);
      for (let i = 0; i < count; i++) petals.push({
        x: rnd() * C.WORLD_W, y: -rnd() * C.WORLD_H * 0.75,
        spd: 6 + rnd() * 5, drift: (rnd() - 0.5) * 4, ph: rnd() * 6.28 });
      ambients.push({ kind, start: now, dur: 15000, data: { petals } });
    }
    // 'nap' 由 ui 直接改 action，不需要動畫項
  };

  function drawAmbients(world, tMs) {
    for (let i = ambients.length - 1; i >= 0; i--) {
      const a = ambients[i];
      const t = (tMs - a.start) / a.dur;
      if (t >= 1) { ambients.splice(i, 1); continue; }
      const fade = Math.min(1, t * 6, (1 - t) * 6);   // 頭尾淡入出
      if (a.kind === 'butterfly') {
        for (const bf of a.data.flock) {
          const bt = (tMs - a.start - bf.delay) / 1000;
          if (bt < 0) continue;
          const x = a.data.fromLeft ? bt * bf.spd - 6 : C.WORLD_W + 6 - bt * bf.spd;
          if (x < -8 || x > C.WORLD_W + 8) continue;
          const y = bf.y0 + Math.sin(bt * 2.2 + bf.ph) * bf.amp;
          const wing = Math.floor(tMs / 90) % 2 === 0;
          ctx.fillStyle = `hsla(${bf.hue}, 80%, 75%, ${fade})`;
          if (wing) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); }
          else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
          ctx.fillStyle = `rgba(60,50,40,${fade})`; ctx.fillRect(x, y - 1, 1, 2);
        }
      } else if (a.kind === 'meteor') {
        const mx = a.data.x0 + t * C.WORLD_W * 0.25, my = a.data.y0 + t * C.SKY_H * 0.65;
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = `rgba(255,255,235,${(1 - t) * (1 - k / 7)})`;
          ctx.fillRect(Math.round(mx - k * 2.2), Math.round(my - k * 0.95), 2, 1);
        }
      } else if (a.kind === 'rainbow') {
        const bands = ['255,120,120', '255,190,110', '255,240,140', '150,220,150', '130,180,240', '190,150,230'];
        ctx.lineWidth = 2.4;
        bands.forEach((c, k) => {
          ctx.strokeStyle = `rgba(${c},${fade * 0.6})`;
          ctx.beginPath();
          ctx.arc(C.WORLD_W / 2, C.WORLD_H * 0.575, C.WORLD_W * 0.275 - k * 2.4, Math.PI, Math.PI * 2);
          ctx.stroke();
        });
        ctx.lineWidth = 1;
      } else if (a.kind === 'firefly') {
        for (const d of a.data.dots) {
          d.x += d.vx; d.y += d.vy;
          const glow = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(tMs / 480 + d.ph));
          ctx.fillStyle = `rgba(215,255,140,${glow * fade})`;
          ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
        }
      } else if (a.kind === 'gift') {
        const from = smooth.get(a.data.fromId), to = smooth.get(a.data.toId);
        if (!from || !to) { ambients.splice(i, 1); continue; }
        const p = Math.min(1, t / 0.75);
        const gx = from.rx + (to.rx - from.rx) * p;
        const gy = from.ry - 10 + (to.ry - from.ry) * p - Math.sin(p * Math.PI) * 8;
        ctx.fillStyle = `rgba(255,180,205,${fade})`;
        ctx.fillRect(Math.round(gx) - 1, Math.round(gy), 3, 1); ctx.fillRect(Math.round(gx), Math.round(gy) - 1, 1, 3);
        ctx.fillStyle = `rgba(255,202,40,${fade})`; ctx.fillRect(Math.round(gx), Math.round(gy), 1, 1);
        if (t > 0.78 && t < 0.82) {
          Render.heartsAt(to.rx, to.ry - 10);
          Render.heartsAt(from.rx, from.ry - 10);
        }
      } else if (a.kind === 'petals') {
        for (const pt of a.data.petals) {
          const py = pt.y + (tMs - a.start) / 1000 * pt.spd;
          if (py < 0 || py > C.WORLD_H - 2) continue;
          const px = pt.x + Math.sin((tMs / 1000) * 1.3 + pt.ph) * pt.drift;
          ctx.fillStyle = `rgba(255,196,214,${fade * 0.9})`;
          ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
      }
    }
  }

  /* ---------- 每幀繪製 ---------- */

  Render.draw = function (world, tMs) {
    ensureInit();
    const b = brightness(world);

    // 天空
    const sky = lerpC(NIGHT_SKY, DAY_SKY, b);
    ctx.fillStyle = `rgb(${sky})`;
    ctx.fillRect(0, 0, C.WORLD_W, C.SKY_H);

    // 地景
    ctx.drawImage(sceneCanvas, 0, 0);

    // 裝飾（在小動物身後）
    drawDecor(world, tMs, b);

    // 果實（凋謝前 20 秒淡出）
    for (const f of fruits) {
      if (f.eaten) continue;
      const age = tMs - f.born;
      if (age > FRUIT_TTL_MS) { f.eaten = true; continue; }
      const fade = Math.min(1, (FRUIT_TTL_MS - age) / 20000);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#e5533d'; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
      ctx.fillStyle = '#7cb860'; ctx.fillRect(Math.round(f.x), Math.round(f.y) - 2, 1, 1);
      ctx.globalAlpha = 1;
    }

    // 小動物（依 y 排序製造前後層次）
    const alive = world.creatures.filter(c => c.stage !== 'star')
      .sort((a2, b2) => a2.y - b2.y);
    for (const cr of alive) drawCreature(cr, tMs, b);

    // 夜幕：整個畫面一起壓暗（畫在小動物之後），
    // 避免只壓地面時地平線把跨界的小動物切成兩截
    if (b < 0.5) {
      ctx.fillStyle = `rgba(18,24,58,${(0.5 - b) * 0.7})`;
      ctx.fillRect(0, 0, C.WORLD_W, C.WORLD_H);
    }
    // 晨昏：接近日夜交界時鋪一層橘粉暖光
    const duskA = Math.max(0, 1 - Math.abs(b - 0.42) / 0.13) * 0.16;
    if (duskA > 0.01) {
      const dg = ctx.createLinearGradient(0, 0, 0, C.WORLD_H);
      dg.addColorStop(0, `rgba(255,150,90,${duskA})`);
      dg.addColorStop(1, `rgba(255,110,140,${duskA * 0.5})`);
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, C.WORLD_W, C.WORLD_H);
    }

    // 天體與星星畫在夜幕之上，保持明亮
    const phase = (world.tick % C.DAYNIGHT_SEC) / C.DAYNIGHT_SEC;
    const orbX = Math.round(phase * (C.WORLD_W + 20)) - 10;
    if (b > 0.15) { ctx.fillStyle = '#ffd54f'; ctx.fillRect(orbX, 8, 6, 6); ctx.fillRect(orbX + 1, 7, 4, 8); }
    else {
      // 弦月：亮圓疊上偏移的夜空色圓
      ctx.fillStyle = '#f4f1de';
      ctx.beginPath(); ctx.arc(orbX + 3, 11, 3.4, 0, 6.29); ctx.fill();
      ctx.fillStyle = `rgb(${lerpC(NIGHT_SKY, DAY_SKY, b)})`;
      ctx.beginPath(); ctx.arc(orbX + 5, 10, 3, 0, 6.29); ctx.fill();
    }
    if (b < 0.4) {
      const a = (0.4 - b) / 0.4;
      for (const st of bgStars) {
        ctx.fillStyle = `rgba(255,255,240,${(0.3 + 0.3 * Math.sin(tMs / 900 + st.p)) * a})`;
        ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1);
      }
    }
    drawMemorialStars(world, tMs, b);
    drawLanternGlows(world, b);

    // 療癒事件與選取光圈（夜幕之上，夜間事件才明亮）
    drawAmbients(world, tMs);
    drawHighlights(world, tMs);

    // 事件動畫與放置預覽（最上層）
    drawAnims(tMs);
    drawGhost(tMs);
  };

  function drawCreature(cr, tMs, b) {
    // 選人模式中，非合格對象壓暗，讓視線集中在可選的孩子身上
    const dimmed = Render.isDimmed(cr);
    if (dimmed) ctx.globalAlpha = 0.35;
    // 線性插值到 sim 座標：一個 tick 間隔內等速滑過去，速度快也不會脈衝
    let s = smooth.get(cr.id);
    if (!s) { s = { rx: cr.x, ry: cr.y, fx: cr.x, fy: cr.y, tx: cr.x, ty: cr.y, t0: tMs }; smooth.set(cr.id, s); }
    if (cr.x !== s.tx || cr.y !== s.ty) {
      s.fx = s.rx; s.fy = s.ry;
      s.tx = cr.x; s.ty = cr.y; s.t0 = tMs;
    }
    const dur = 1000 / Math.max(1, C.TIME_SCALE);
    const p = Math.min(1, (tMs - s.t0) / dur);
    s.rx = s.fx + (s.tx - s.fx) * p;
    s.ry = s.fy + (s.ty - s.fy) * p;

    const sp = getSprite(cr);
    const x = Math.round(s.rx - sp.width / 2);
    let y = Math.round(s.ry - sp.height);
    if (cr.action === 'walk' && Math.abs(cr.x - s.rx) + Math.abs(cr.y - s.ry) > 0.3) {
      y += Math.sin(tMs / 110) > 0 ? -1 : 0;   // 走路小彈跳
    }
    // 地板影子：跟體型成比例的橢圓（彈跳時影子留在地上）
    ctx.fillStyle = 'rgba(24,36,24,0.28)';
    ctx.beginPath();
    ctx.ellipse(s.rx, s.ry - 0.5, sp.width * 0.34, Math.max(1.4, sp.width * 0.12), 0, 0, 6.29);
    ctx.fill();
    // 發光體質：夜間光暈
    if (cr.genes.glow && b < 0.4) {
      const a = (0.4 - b) * 1.2;
      const g = ctx.createRadialGradient(s.rx, s.ry - sp.height / 2, 1, s.rx, s.ry - sp.height / 2, 10);
      g.addColorStop(0, `hsla(${cr.genes.color.h},90%,75%,${a * 0.5})`);
      g.addColorStop(1, 'hsla(0,0%,100%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.rx - 10, s.ry - sp.height / 2 - 10, 20, 20);
    }
    ctx.drawImage(sp, x, y);
    // 睡覺 zzz
    if (cr.action === 'sleep' && cr.stage !== 'egg') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const zp = Math.floor(tMs / 600) % 3;
      for (let i = 0; i <= zp; i++) ctx.fillRect(x + sp.width + 1 + i * 2, y - 2 - i * 3, 1 + (i === 2 ? 1 : 0), 1);
    }
    if (dimmed) ctx.globalAlpha = 1;
  }

  // 紀念星網格：依天空尺寸動態排版（大星裝不下時全體縮小加密）
  function starPos(idx, total) {
    const bigCols = Math.floor((C.WORLD_W - 12) / 12);
    const bigRows = Math.floor((C.SKY_H - 10) / 9);
    const small = total > bigCols * bigRows;
    const cols = small ? Math.floor((C.WORLD_W - 12) / 6) : bigCols;
    return {
      x: 6 + (idx % cols) * (small ? 6 : 12),
      y: 5 + Math.floor(idx / cols) * (small ? 5 : 9),
      small,
    };
  }

  function drawMemorialStars(world, tMs, b) {
    const arch = world.archive;
    if (!arch.length) return;
    const alpha = 0.55 + 0.45 * Math.max(0, 0.6 - b); // 夜間更亮，白天仍隱約可見
    arch.forEach((cr, i) => {
      const idx = cr.starIdx ?? i;
      const p = starPos(idx, arch.length);
      if (p.y > C.SKY_H - 4) return;                 // 超出天空的極端情況不畫
      const tw = 0.7 + 0.3 * Math.sin(tMs / 700 + idx * 1.7);
      ctx.fillStyle = `hsla(${cr.genes.color.h}, 70%, 82%, ${alpha * tw})`;
      ctx.fillRect(p.x, p.y, 1, 1);
      if (!p.small) {  // 大星畫十字
        ctx.fillStyle = `hsla(${cr.genes.color.h}, 70%, 82%, ${alpha * tw * 0.5})`;
        ctx.fillRect(p.x - 1, p.y, 1, 1); ctx.fillRect(p.x + 1, p.y, 1, 1);
        ctx.fillRect(p.x, p.y - 1, 1, 1); ctx.fillRect(p.x, p.y + 1, 1, 1);
      }
    });
  }

  // 紀念星的目標座標（ascend 動畫用）
  function starSlot(world, cr) {
    const idx = cr.starIdx ?? world.archive.indexOf(cr);
    return starPos(idx, world.archive.length);
  }

  const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
  function drawHeart(x, y, scale, color) {
    ctx.fillStyle = color;
    HEART.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) {
      if (row[rx] === 'X') ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    } });
  }

  function drawAnims(tMs) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const t = (tMs - a.start) / a.dur;
      if (t >= 1) { anims.splice(i, 1); continue; }
      if (a.type === 'hearts') {
        for (let k = 0; k < 3; k++) {
          const tt = Math.max(0, t - k * 0.15);
          drawHeart(a.x - 8 + k * 6, a.y - 14 - tt * 12, 1, `rgba(255,120,150,${1 - tt})`);
        }
      } else if (a.type === 'bloom') {
        // 揭曉閃光：擴散白圈
        ctx.strokeStyle = `rgba(255,255,255,${1 - t})`;
        ctx.beginPath(); ctx.arc(a.x, a.y - 6, 2 + t * 12, 0, 6.29); ctx.stroke();
      } else if (a.type === 'shell') {
        ctx.fillStyle = `rgba(250,244,222,${1 - t})`;
        const d = t * 8;
        ctx.fillRect(a.x - 3 - d, a.y - 4 - d, 2, 2); ctx.fillRect(a.x + 2 + d, a.y - 4 - d, 2, 2);
        ctx.fillRect(a.x - 3 - d, a.y + 1 + d * 0.4, 2, 2); ctx.fillRect(a.x + 2 + d, a.y + 1 + d * 0.4, 2, 2);
      } else if (a.type === 'ascend') {
        const cr = a.data.cr;
        const slot = starSlot(a.data.world, cr);
        const ease = 1 - Math.pow(1 - t, 3);
        const x = a.x + (slot.x - a.x) * ease;
        const y = a.y + (slot.y - a.y) * ease;
        ctx.globalAlpha = 1 - t * 0.5;
        const sp = getSprite(cr);
        ctx.drawImage(sp, Math.round(x - sp.width / 2), Math.round(y - sp.height / 2));
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(255,255,240,${t})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  /* ---------- 提供給 ui.js 的座標工具 ---------- */

  // 螢幕(客戶端)座標 → 世界座標
  Render.toWorld = function (clientX, clientY) {
    const cv = document.getElementById('world');
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * C.WORLD_W,
             y: (clientY - r.top) / r.height * C.WORLD_H };
  };
  Render.spriteOf = getSprite;   // ui 的資訊卡/族譜要畫肖像
  Render.invalidateSprite = id => {
    for (const k of spriteCache.keys()) if (k.startsWith(id + ':')) spriteCache.delete(k);
  };
})();

if (typeof window !== 'undefined') window.Render = Render;
