// tests/genetics.test.js（node --test）
const test = require('node:test'); const assert = require('node:assert');
const { C, rngFactory } = require('../contract.js');
const G = require('../genetics.js');
test('founder 0-7 基因合法且形狀覆蓋四種', () => {
  // 用完整形狀簽章（m,n1,n2,n3）而非只比 m：方與菱同為 4 折對稱（superformula
  // 幾何本質——4 角形狀必為 m=4），只能靠 n1/n2/n3 區分圓潤/尖銳，光比 m 會誤判成 3 種。
  const shapes = new Set();
  for (let i = 0; i < 8; i++) {
    const g = G.founderGenes(i);
    shapes.add(`${g.shape.m},${g.shape.n1},${g.shape.n2},${g.shape.n3}`);
    assert.ok(g.color.s >= 0.4 && g.color.s <= 0.9);   // 柔和範圍
    assert.ok(g.color.l >= 0.45 && g.color.l <= 0.75);
  }
  assert.ok(shapes.size >= 4);
});
test('breed 參數落在父母範圍附近', () => {
  const rng = rngFactory(42);
  const a = G.founderGenes(0), b = G.founderGenes(2);
  for (let i = 0; i < 200; i++) {
    const kid = G.breed(a, b, rng);
    assert.ok(kid.shape.m >= -1 && kid.shape.m <= 13);  // 含突變上限
    assert.ok(kid.color.h >= 0 && kid.color.h < 360);
  }
});
test('hue 混合走短弧：350 與 10 的子代在 [340,20] 區間', () => {
  // MUT_COLOR 有 1% 機率整個 h 隨機跳（設計刻意的突變），100 抽期望值~1 次落在區間外，
  // 屬正常現象非邏輯錯誤 → 用統計容忍（>=90/100）而非要求每一抽都中，
  // 這樣仍能抓到「混色方向錯誤（走長弧）」這類真正的 bug。
  const rng = rngFactory(7);
  const a = { ...G.founderGenes(0), color: { h: 350, s: .6, l: .6 } };
  const b = { ...G.founderGenes(1), color: { h: 10, s: .6, l: .6 } };
  let inRange = 0;
  for (let i = 0; i < 100; i++) {
    const h = G.breed(a, b, rng).color.h;
    if (h >= 340 || h <= 20) inRange++;
  }
  assert.ok(inRange >= 90, `inRange=${inRange}/100`);
});
test('rasterize 產出非空 sprite 且 child 階段為小圓點', () => {
  const g = G.founderGenes(3);
  const adult = G.rasterize(g, 'adult'), child = G.rasterize(g, 'child');
  const count = p => { let n = 0; for (let i = 3; i < p.pixels.length; i += 4) if (p.pixels[i] > 0) n++; return n; };
  assert.ok(count(adult) > 40);
  assert.ok(count(child) > 4 && count(child) < count(adult));
});
