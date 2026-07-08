/* genetics.js — 基因模組（superformula 形狀、HSL 顏色、繁衍、sprite 點陣化）。介面見 contract.js。 */

const Genetics = {};

(function () {
  const ctx = (typeof module !== 'undefined' && module.exports) ? require('./contract.js') : window;
  const { C, clamp } = ctx;

  // ---- 四形狀錨點（設計文件定案） ----
  // 圓 m=0（恆為圓，n 值不影響）、三角 m=3、方 m=4（高 n 值→圓潤方形）、菱 m=4（低 n 值→尖角菱形）
  // 注意：方與菱同為 4 折對稱（superformula 幾何本質——4 角形狀必為 m=4），
  // 靠 n1/n2/n3 差異區分圓潤/尖銳，而非 m。
  const ANCHORS = [
    { m: 0, n1: 1,   n2: 1,  n3: 1  }, // 圓
    { m: 3, n1: 4.5, n2: 10, n3: 10 }, // 三角
    { m: 4, n1: 12,  n2: 15, n3: 15 }, // 方
    { m: 4, n1: 1,   n2: 1,  n3: 1  }, // 菱
  ];

  function superR(sh, theta) {
    if (sh.m === 0) return 1;
    const t = (sh.m * theta) / 4;
    const p = Math.pow(Math.abs(Math.cos(t)), sh.n2) + Math.pow(Math.abs(Math.sin(t)), sh.n3);
    return Math.pow(p, -1 / sh.n1);
  }

  function maxRadius(sh, samples) {
    samples = samples || 720;
    let max = 0;
    for (let i = 0; i < samples; i++) {
      const th = (i / samples) * Math.PI * 2;
      const r = superR(sh, th);
      if (isFinite(r) && r > max) max = r;
    }
    return max || 1;
  }

  function founderGenes(i) {
    const shape = Object.assign({}, ANCHORS[i % 4]);
    return {
      shape,
      color: { h: (i * 45) % 360, s: 0.7, l: 0.6 },
      size: 1, speed: 1, glow: false,
    };
  }

  // 繁衍：每參數獨立「偏親插值」＋噪聲；突變＝跳躍
  function lerpGene(a, b, rng, noise) {
    const w = rng() < 0.5 ? 0.25 + rng() * 0.2 : 0.55 + rng() * 0.2; // 偏向其一
    return a + (b - a) * w + (rng() * 2 - 1) * noise;
  }

  function breed(gA, gB, rng) {
    const s = {
      m: Math.round(lerpGene(gA.shape.m, gB.shape.m, rng, 0.3)),
      n1: clamp(lerpGene(gA.shape.n1, gB.shape.n1, rng, 0.5), 0.3, 20),
      n2: clamp(lerpGene(gA.shape.n2, gB.shape.n2, rng, 0.8), 0.3, 20),
      n3: clamp(lerpGene(gA.shape.n3, gB.shape.n3, rng, 0.8), 0.3, 20),
    };
    if (rng() < C.MUT_SHAPE) s.m = [5, 6, 7, 8, 12][Math.floor(rng() * 5)]; // 星/花/齒輪形
    s.m = clamp(s.m, 0, 12);

    const hA = gA.color.h, hB = gB.color.h;
    const d = ((hB - hA + 540) % 360) - 180; // 短弧差
    let h = (hA + d * (rng() < 0.5 ? 0.3 : 0.7) + (rng() * 16 - 8) + 360) % 360;
    if (rng() < C.MUT_COLOR) h = rng() * 360;
    const color = {
      h,
      s: clamp((gA.color.s + gB.color.s) / 2 + (rng() * 0.12 - 0.06), 0.4, 0.9),
      l: clamp((gA.color.l + gB.color.l) / 2 + (rng() * 0.1 - 0.05), 0.45, 0.75),
    };
    return {
      shape: s, color,
      size: clamp((gA.size + gB.size) / 2 + (rng() * 0.08 - 0.04), 0.85, 1.15),
      speed: clamp((gA.speed + gB.speed) / 2 + (rng() * 0.1 - 0.05), 0.8, 1.2),
      glow: (gA.glow || gB.glow) ? rng() < 0.5 : rng() < C.MUT_GLOW,
    };
  }

  // ---- HSL → RGB ----
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  // ---- 點陣 sprite ----
  function makeBuffer(w, h) {
    return { w, h, pixels: new Uint8ClampedArray(w * h * 4) };
  }
  function setPx(buf, x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
    const i = (y * buf.w + x) * 4;
    buf.pixels[i] = r; buf.pixels[i + 1] = g; buf.pixels[i + 2] = b; buf.pixels[i + 3] = a;
  }
  function isFilled(buf, x, y) {
    if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return false;
    return buf.pixels[(y * buf.w + x) * 4 + 3] > 0;
  }
  function drawEyes(buf, cx, eyeY) {
    // 細長體型（如窄橢圓）固定偏移量會落到身體外，落點沒填色就往中心縮，縮到底就放棄外推
    const baseDx = Math.max(2, Math.round(buf.w * 0.18));
    [-1, 1].forEach((sign) => {
      let dx = baseDx;
      while (dx > 0 && !isFilled(buf, Math.round(cx + sign * dx), eyeY)) dx--;
      const ex = Math.round(cx + sign * dx);
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) setPx(buf, ex + ox - 1, eyeY + oy, 0, 0, 0, 255);
      }
    });
  }

  function rasterizeEgg(genes) {
    const w = 8, h = 10;
    const buf = makeBuffer(w, h);
    const [er, eg, eb] = hslToRgb(genes.color.h, genes.color.s, Math.min(0.9, genes.color.l + 0.15));
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / (w * 0.42), ny = (y - cy) / (h * 0.46);
        if (nx * nx + ny * ny * 0.9 <= 1) setPx(buf, x, y, er, eg, eb, 255);
      }
    }
    return buf;
  }

  function rasterizeChild(genes) {
    const dim = 9;
    const buf = makeBuffer(dim, dim);
    const [r, g, b] = hslToRgb(genes.color.h, genes.color.s, genes.color.l);
    const cx = (dim - 1) / 2, cy = (dim - 1) / 2, rad = 2.5;
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) setPx(buf, x, y, r, g, b, 255);
      }
    }
    // 圓點太小，套用 adult 的 2x2 雙眼比例會互相重疊還畫出圓外；改用單像素小眼睛，
    // 位置偏中上、左右對稱，落在圓點內部
    const eyeY = Math.round(cy - 1);
    setPx(buf, Math.round(cx - 1), eyeY, 0, 0, 0, 255);
    setPx(buf, Math.round(cx + 1), eyeY, 0, 0, 0, 255);
    return buf;
  }

  function rasterizeBody(genes, stage) {
    const dim = Math.max(8, Math.round(16 * genes.size));
    const buf = makeBuffer(dim, dim);
    const maxR = maxRadius(genes.shape);
    const cx = (dim - 1) / 2, cy = (dim - 1) / 2;
    const pixelR = dim / 2 - 0.5;
    const sat = stage === 'elder' ? genes.color.s * 0.8 : genes.color.s;
    const [r, g, b] = hslToRgb(genes.color.h, sat, genes.color.l);
    const [rs, gs, bs] = hslToRgb(genes.color.h, sat, Math.max(0, genes.color.l * 0.8)); // 陰影面暗 20%
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const theta = Math.atan2(dy, dx);
        const rBoundary = (superR(genes.shape, theta) / maxR) * pixelR;
        if (dist <= rBoundary) {
          const shaded = y > dim - 3; // 底部 2px 陰影
          if (shaded) setPx(buf, x, y, rs, gs, bs, 255);
          else setPx(buf, x, y, r, g, b, 255);
        }
      }
    }
    drawEyes(buf, cx, Math.round(dim * 0.4));
    return buf;
  }

  function rasterize(genes, stage) {
    if (stage === 'egg') return rasterizeEgg(genes);
    if (stage === 'child') return rasterizeChild(genes);
    return rasterizeBody(genes, stage); // adult / elder / star fallback
  }

  Genetics.founderGenes = founderGenes;
  Genetics.breed = breed;
  Genetics.rasterize = rasterize;
})();

if (typeof module !== 'undefined') module.exports = Genetics;
if (typeof window !== 'undefined') window.Genetics = Genetics;
