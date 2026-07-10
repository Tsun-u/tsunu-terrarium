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
    cv = withOutline(cv, geneLum(cr));   // 外框線：避免小動物跟背景溶在一起
    spriteCache.set(key, cv);
    return cv;
  }

  // 主色感知亮度（用基因色估算，0~1）
  function geneLum(cr) {
    const { h: gh, s: gs, l: gl } = cr.genes.color;
    const a = gs * Math.min(gl, 1 - gl);
    const f = n => { const k = (n + gh / 30) % 12;
      return gl - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
    return 0.299 * f(0) + 0.587 * f(8) + 0.114 * f(4);
  }

  // canvas 不透明像素的平均亮度（0~1，裝飾 sprite 用）
  function avgLum(cv) {
    const c2 = cv.getContext('2d');
    const px = c2.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 60) { sum += (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; n++; }
    }
    return n ? sum / n : 0.5;
  }

  // 明暗自適應外框：主體亮 → 近黑框、主體暗 → 近白框。
  // 掃 alpha：透明像素若貼著不透明像素就是框。
  function withOutline(src, lum) {
    const w = src.width + 2, h = src.height + 2;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const c2 = out.getContext('2d');
    c2.drawImage(src, 1, 1);
    const img = c2.getImageData(0, 0, w, h);
    const px = img.data;
    const solid = i => px[i * 4 + 3] > 60;
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
        // 喜結連理：紅線亮起＋愛心噴泉，持續 3.2 秒（值得被看見的時刻）
        anims.push({ ...base, type: 'wedding', dur: 3200, data: { a: ev.ids[0], b: ev.ids[1] } });
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

  // 橋的畫法獨立成參數化函式：世界裡要跨得過池塘（含擴建版），商店縮圖用固定小版
  function bridgeSprite(span) {
    const A = Math.max(3, Math.round(span * 0.11));   // 拱高隨跨距等比
    const cv = document.createElement('canvas');
    cv.width = span; cv.height = A + 8;
    const s = cv.getContext('2d');
    // 橋面頂端 y：沿正弦拱線
    const deck = x => (A + 5) - Math.round(A * Math.sin(Math.PI * Math.min(1, (x + 1) / span)));
    s.fillStyle = '#a8794f';
    for (let x = 0; x < span; x += 2) s.fillRect(x, deck(x), 2, 3);          // 橋面板
    s.fillStyle = '#8a5f3a';
    for (let x = 1; x < span; x += 8) s.fillRect(x, deck(x) - 4, 1, 4);      // 欄杆柱（固定高度站橋面上）
    s.fillStyle = '#c79868';
    for (let x = 0; x < span; x += 2) s.fillRect(x, deck(x) - 5, 2, 1);      // 扶手（與橋面平行的拱線）
    return cv;
  }

  function decorSprite(kind, tMs) {
    if (kind === 'swing') return swingSprite(tMs);   // 鞦韆會微擺，不快取
    if (kind === 'seesaw') return seesawSprite(tMs); // 翹翹板持續蹺動，不快取
    if (kind === 'bridge') {
      // 橋寬＝池塘直徑＋兩端搭岸 12px；池塘擴建時用另一個快取鍵，自動換加寬版
      const key = scenePondBig ? 'bridgeBig' : 'bridge';
      if (!decorCache.has(key)) {
        const cv = bridgeSprite((scenePondBig ? 40 : 26) * 2 + 12);
        decorCache.set(key, withOutline(cv, avgLum(cv)));
      }
      return decorCache.get(key);
    }
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
    } else if (kind === 'slide') {
      // 溜滑梯：右邊爬梯上平台，滑道往左下俯衝（滑道座標與 ui.js 的滑落路徑對齊）
      cv.width = 26; cv.height = 20;
      s.fillStyle = '#8a5f3a';
      s.fillRect(20, 5, 2, 15); s.fillRect(24, 5, 2, 15);      // 梯柱
      for (let y = 7; y <= 16; y += 3) s.fillRect(21, y, 4, 1); // 梯橫檔
      s.fillStyle = '#c79868'; s.fillRect(15, 3, 11, 2);        // 平台
      s.fillStyle = '#c9c2b8';
      for (let i = 0; i <= 15; i++) {
        const y = Math.round(4 + i * 14 / 15);                  // 滑道面：平台左緣滑到左下
        s.fillRect(15 - i, y, 2, 2);
      }
      s.fillStyle = '#aab6c2';
      for (let i = 0; i <= 15; i++) {
        const y = Math.round(4 + i * 14 / 15);
        s.fillRect(15 - i, y + 2, 2, 1);                        // 滑道底沿（增厚立體感）
      }
    }
    const outlined = withOutline(cv, avgLum(cv));   // 裝飾同享自適應外框，不溶進草地
    decorCache.set(kind, outlined);
    return outlined;
  }

  // 翹翹板：板子沿支點持續蹺動；相位源 tMs/700 與 ui.js 乘客座位同步
  function seesawSprite(tMs) {
    const cv = document.createElement('canvas');
    cv.width = 26; cv.height = 12;
    const s = cv.getContext('2d');
    const tilt = Math.sin(tMs / 700) * 3;
    s.fillStyle = '#8a5f3a';
    s.fillRect(11, 7, 4, 5); s.fillRect(12, 5, 2, 2);           // 支點座
    s.fillStyle = '#c79868';
    for (let x = 0; x < 26; x += 2) {
      const y = Math.round(6 + tilt - (x / 24) * tilt * 2);     // 板：左端 6+tilt → 右端 6-tilt
      s.fillRect(x, y, 2, 2);
    }
    s.fillStyle = '#8a5f3a';
    s.fillRect(2, Math.round(6 + tilt) - 2, 1, 2);              // 左把手
    s.fillRect(23, Math.round(6 - tilt) - 2, 1, 2);             // 右把手
    return withOutline(cv, avgLum(cv));
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
    return withOutline(cv, avgLum(cv));   // 動態 sprite 每幀補框（尺寸小，成本可忽略）
  }

  function drawDecor(world, tMs, b) {
    const list = world.decor || [];
    // 池塘擴建：以 scene 重繪呈現
    const wantBig = list.some(d => d.kind === 'pond');
    if (wantBig !== scenePondBig) { scenePondBig = wantBig; buildScene(); }
    for (const d of list) {
      if (d.kind === 'pond') continue;
      const sp = decorSprite(d.kind, tMs);
      // 落地影子：跟小動物同款的比例橢圓，視覺語言一致
      ctx.fillStyle = 'rgba(24,36,24,0.28)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - 0.5, sp.width * 0.34, Math.max(1.4, sp.width * 0.12), 0, 0, 6.29);
      ctx.fill();
      ctx.drawImage(sp, Math.round(d.x - sp.width / 2), Math.round(d.y - sp.height));
    }
  }

  // 皮小孩開關燈惡作劇：ui 設定後，該座石燈的夜光會啪嗒啪嗒閃
  let lanternPrank = null;   // { x, y, until }
  Render.setLanternPrank = p => { lanternPrank = p; };

  // 池塘潑水仗：ui 設定後，兩點之間交替飛水珠
  let splash = null;   // { ax, ay, bx, by, until }
  Render.setSplash = s => { splash = s; };

  function drawSplash(tMs) {
    if (!splash) return;
    if (tMs > splash.until) { splash = null; return; }
    const period = 640;
    const dirAB = Math.floor(tMs / period) % 2 === 0;   // 你來我往
    const p = (tMs % period) / period;
    const [x1, y1, x2, y2] = dirAB
      ? [splash.ax, splash.ay, splash.bx, splash.by]
      : [splash.bx, splash.by, splash.ax, splash.ay];
    for (let k = 0; k < 4; k++) {
      const pp = p - k * 0.1;
      if (pp < 0 || pp > 1) continue;
      const wx = x1 + (x2 - x1) * pp + (k - 1.5) * 1.2;
      const wy = y1 - 4 - Math.sin(Math.PI * pp) * (5 + k);
      ctx.fillStyle = k % 2 ? 'rgba(190,230,255,0.9)' : 'rgba(240,252,255,0.9)';
      ctx.fillRect(Math.round(wx), Math.round(wy), 1, 1);
    }
    if (p > 0.85) {   // 潑到了！頭上濺小水花
      ctx.fillStyle = 'rgba(240,252,255,0.85)';
      ctx.fillRect(Math.round(x2), Math.round(y2 - 9), 1, 1);
      ctx.fillRect(Math.round(x2 - 2), Math.round(y2 - 7), 1, 1);
      ctx.fillRect(Math.round(x2 + 2), Math.round(y2 - 7), 1, 1);
    }
  }

  // 石燈夜光：畫在夜幕之上才不會被壓暗（同星星層）
  function drawLanternGlows(world, b) {
    if (b >= 0.45) return;
    const a = (0.45 - b) * 0.9;
    const tMs = performance.now();
    if (lanternPrank && tMs > lanternPrank.until) lanternPrank = null;
    for (const d of (world.decor || [])) {
      if (d.kind !== 'lantern') continue;
      let mul = 1;
      if (lanternPrank && Math.abs(d.x - lanternPrank.x) < 2 && Math.abs(d.y - lanternPrank.y) < 2) {
        mul = Math.floor(tMs / 280) % 2;   // 啪嗒啪嗒
        if (!mul) continue;
      }
      const g = ctx.createRadialGradient(d.x, d.y - 10, 1, d.x, d.y - 10, 14);
      g.addColorStop(0, `rgba(255,226,150,${a * 0.55 * mul})`);
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 14, d.y - 24, 28, 28);
    }
  }

  // 商店縮圖用（橋例外：世界版會跟池塘一樣寬，縮圖固定用小版才不會撐爆商店列）
  Render.decorThumb = kind => {
    if (kind !== 'bridge') return decorSprite(kind, 0);
    if (!decorCache.has('bridgeThumb')) {
      const cv = bridgeSprite(26);
      decorCache.set('bridgeThumb', withOutline(cv, avgLum(cv)));
    }
    return decorCache.get('bridgeThumb');
  };

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
    } else if (kind === 'chase') {
      // 單隻蝴蝶低飛掠過草地，回傳位置控制柄讓 ui 引導一隻孩子追著跑
      const a = { kind, start: now, dur: 13000, data: {
        y0: C.SKY_H + 30 + rnd() * (C.WORLD_H - C.SKY_H - 60),
        amp: 8 + rnd() * 6, ph: rnd() * 6.28, spd: 13 + rnd() * 5,
        fromLeft: rnd() < 0.5, hue: [340, 45, 200, 280][Math.floor(rnd() * 4)] } };
      ambients.push(a);
      return {
        getPos: () => {
          const bt = (performance.now() - a.start) / 1000;
          const x = a.data.fromLeft ? bt * a.data.spd - 6 : C.WORLD_W + 6 - bt * a.data.spd;
          return { x, y: a.data.y0 + Math.sin(bt * 2 + a.data.ph) * a.data.amp,
            done: performance.now() - a.start >= a.dur };
        },
      };
    } else if (kind === 'reflect') {
      ambients.push({ kind, start: now, dur: 11000, data: { seed: Math.floor(rnd() * 100) } });
    } else if (kind === 'shower') {
      // 流星雨：預先排好二三十顆的出場時刻，偶有亮大顆
      const meteors = [];
      let acc = 600;
      const count = 24 + Math.floor(rnd() * 12);
      for (let i = 0; i < count; i++) {
        meteors.push({ delay: acc, x0: rnd() * C.WORLD_W * 1.05 - C.WORLD_W * 0.02,
          y0: 2 + rnd() * C.SKY_H * 0.45, spd: 0.8 + rnd() * 0.7, big: rnd() < 0.15 });
        acc += 250 + rnd() * 600;
      }
      ambients.push({ kind, start: now, dur: acc + 1600, data: { meteors } });
    } else if (kind === 'fish') {
      // 池塘跳魚：從水面躍出的小拋物線＋入水水花
      ambients.push({ kind, start: now, dur: 1500, data: {
        x0: -0.4 + rnd() * 0.5,          // 起點（池塘半徑比例）
        dir: rnd() < 0.5 ? 1 : -1,
        h: 9 + rnd() * 5,                // 跳躍高度
      } });
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
      } else if (a.kind === 'shower') {
        for (const m of a.data.meteors) {
          const mt = (tMs - a.start - m.delay) / 1000;
          if (mt < 0 || mt > 1.3) continue;
          const mx = m.x0 + mt * C.WORLD_W * 0.22 * m.spd;
          const my = m.y0 + mt * C.SKY_H * 0.6 * m.spd;
          if (my > C.SKY_H + 4) continue;
          const trail = m.big ? 10 : 6, w = m.big ? 2 : 1;
          for (let k = 0; k < trail; k++) {
            ctx.fillStyle = `rgba(255,255,235,${(1 - mt / 1.3) * (1 - k / trail)})`;
            ctx.fillRect(Math.round(mx - k * 2.2), Math.round(my - k * 0.95), w, 1);
          }
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
        // 星塵尾跡：提高這場浪漫的目擊率
        for (let k = 1; k <= 4; k++) {
          const tp = Math.max(0, p - k * 0.06);
          const txp = from.rx + (to.rx - from.rx) * tp;
          const typ = from.ry - 10 + (to.ry - from.ry) * tp - Math.sin(tp * Math.PI) * 8;
          ctx.fillStyle = `rgba(255,220,235,${fade * (1 - k * 0.22)})`;
          ctx.fillRect(Math.round(txp), Math.round(typ), 1, 1);
        }
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
      } else if (a.kind === 'chase') {
        const bt = (tMs - a.start) / 1000;
        const x = a.data.fromLeft ? bt * a.data.spd - 6 : C.WORLD_W + 6 - bt * a.data.spd;
        if (x >= -8 && x <= C.WORLD_W + 8) {
          const y = a.data.y0 + Math.sin(bt * 2 + a.data.ph) * a.data.amp;
          const wing = Math.floor(tMs / 90) % 2 === 0;
          ctx.fillStyle = `hsla(${a.data.hue}, 80%, 75%, ${fade})`;
          if (wing) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); }
          else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
          ctx.fillStyle = `rgba(60,50,40,${fade})`; ctx.fillRect(x, y - 1, 1, 2);
        }
      } else if (a.kind === 'fish') {
        const px = C.WORLD_W * 0.79, py = C.WORLD_H * 0.8;
        const prx = scenePondBig ? 40 : 26;
        const p = (tMs - a.start) / a.dur;               // 0→1
        const fx = px + (a.data.x0 + p * 0.5 * a.data.dir) * prx;
        const fy = py - Math.sin(Math.PI * p) * a.data.h - 1;
        if (p < 0.92) {
          // 魚身 2×1＋尾巴，沿拋物線翻躍（下落段尾巴朝上）
          const rising = p < 0.5;
          ctx.fillStyle = `rgba(196,214,228,${fade})`;
          ctx.fillRect(Math.round(fx), Math.round(fy), 2, 1);
          ctx.fillStyle = `rgba(150,170,190,${fade})`;
          ctx.fillRect(Math.round(fx - a.data.dir), Math.round(fy + (rising ? 1 : -1)), 1, 1);
        } else {
          // 入水水花：三點白花濺開
          ctx.fillStyle = `rgba(235,250,255,${fade * 0.9})`;
          const sx = Math.round(fx), sy = Math.round(py - 1);
          ctx.fillRect(sx, sy - 1, 1, 1); ctx.fillRect(sx - 2, sy, 1, 1); ctx.fillRect(sx + 2, sy, 1, 1);
        }
      } else if (a.kind === 'reflect') {
        // 池塘倒影：水面碎光閃爍＋一圈圈慢速漣漪
        const px = C.WORLD_W * 0.79, py = C.WORLD_H * 0.8;
        const prx = scenePondBig ? 40 : 26, pry = scenePondBig ? 22 : 14;
        for (let k = 0; k < 8; k++) {
          const ang = (a.data.seed + k * 47) % 360 / 57.3;
          const rr = 0.25 + ((a.data.seed * 7 + k * 31) % 60) / 100;
          const sx = px + Math.cos(ang) * prx * rr;
          const sy = py + Math.sin(ang) * pry * rr;
          const tw = 0.5 + 0.5 * Math.sin(tMs / 260 + k * 2.1);
          ctx.fillStyle = `rgba(230,250,255,${fade * tw * 0.8})`;
          ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
        const rp = (tMs - a.start) % 3000 / 3000;
        ctx.strokeStyle = `rgba(220,245,255,${fade * (1 - rp) * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(px, py, prx * 0.3 + prx * 0.6 * rp, pry * 0.3 + pry * 0.6 * rp, 0, 0, 6.29);
        ctx.stroke();
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
    drawSplash(tMs);
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
    let x = Math.round(s.rx - sp.width / 2);
    let y = Math.round(s.ry - sp.height);
    if (cr.action === 'walk' && Math.abs(cr.x - s.rx) + Math.abs(cr.y - s.ry) > 0.3) {
      y += Math.sin(tMs / 110) > 0 ? -1 : 0;   // 走路小彈跳
    }
    if (cr.stage === 'egg') {
      x += Math.round(Math.sin(tMs / 320 + cr.id * 1.7));   // 蛋微微搖晃
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
      // 打盹 Zzz：3×3 迷你像素 Z 一顆顆往右上冒（白點太抽象，實玩看不懂）
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const zp = Math.floor(tMs / 600) % 3;
      const Z = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]];
      for (let i = 0; i <= zp; i++) {
        const zx = x + sp.width + 1 + i * 3, zy = y - 5 - i * 4;
        for (const [dx, dy] of Z) ctx.fillRect(zx + dx, zy + dy, 1, 1);
      }
    }
    if (cr.action === 'gaze') {
      // 老年看天空：視線方向的小星光緩緩閃爍
      const tw = 0.5 + 0.5 * Math.sin(tMs / 520 + cr.id);
      ctx.fillStyle = `rgba(255,255,240,${0.35 + tw * 0.55})`;
      ctx.fillRect(x + sp.width + 1, y - 4, 1, 1);
      ctx.fillRect(x + sp.width + 3, y - 8, 1, 1);
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

  // 夜空點擊：找出座標附近的紀念星（給 ui 開星星小卡）
  Render.starAt = function (world, x, y) {
    let best = null, bd = 6;
    world.archive.forEach((cr, i) => {
      const p = starPos(cr.starIdx ?? i, world.archive.length);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = cr; }
    });
    return best;
  };

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
      } else if (a.type === 'wedding') {
        // 喜結連理：紅線在兩人之間脈動＋愛心噴泉八連發
        const sa = smooth.get(a.data.a), sb = smooth.get(a.data.b);
        if (sa && sb) {
          const pulse = 0.5 + 0.5 * Math.sin(tMs / 180);
          ctx.strokeStyle = `rgba(255,93,126,${(1 - t) * (0.5 + pulse * 0.5)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(sa.rx, sa.ry - 8);
          ctx.quadraticCurveTo((sa.rx + sb.rx) / 2, Math.min(sa.ry, sb.ry) - 20, sb.rx, sb.ry - 8);
          ctx.stroke();
          ctx.lineWidth = 1;
          const mx = (sa.rx + sb.rx) / 2, my = (sa.ry + sb.ry) / 2;
          for (let k = 0; k < 8; k++) {
            const tt = t * 3.2 - k * 0.28;              // 依序噴出
            if (tt < 0 || tt > 1.4) continue;
            const spread = (k % 2 ? 1 : -1) * (4 + k * 2.4);
            drawHeart(mx + spread - 2, my - 14 - tt * 20, 1,
              `rgba(255,${110 + (k % 3) * 30},${150 + (k % 2) * 40},${Math.max(0, 1 - tt / 1.4)})`);
          }
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
