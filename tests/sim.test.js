// tests/sim.test.js（node --test；Sim 以 dual export 提供，rng 一律注入 rngFactory(seed) 保證可重現）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { C, rngFactory } = require('../contract.js');
const Genetics = require('../genetics.js');
const Sim = require('../sim.js');

test('newWorld：8 隻 founder、全 adult、名字不重複、hearts=0', () => {
  const rng = rngFactory(1);
  const world = Sim.newWorld(rng);
  assert.strictEqual(world.creatures.length, C.FOUNDER_COUNT);
  assert.strictEqual(world.hearts, 0);
  const names = new Set(world.creatures.map((c) => c.name));
  assert.strictEqual(names.size, C.FOUNDER_COUNT);
  for (const c of world.creatures) {
    assert.strictEqual(c.stage, 'adult');
    assert.strictEqual(c.gen, 0);
    assert.strictEqual(c.parents, null);
  }
});

test('生命時間表：bornTick<=matureTick<elderTick<starTick，壽命落在 4~7 天秒數內', () => {
  const rng = rngFactory(2);
  const world = Sim.newWorld(rng);
  for (const c of world.creatures) {
    assert.ok(c.bornTick <= c.matureTick, `bornTick<=matureTick: ${c.bornTick},${c.matureTick}`);
    assert.ok(c.matureTick < c.elderTick, `matureTick<elderTick: ${c.matureTick},${c.elderTick}`);
    assert.ok(c.elderTick < c.starTick, `elderTick<starTick: ${c.elderTick},${c.starTick}`);
    const lifespan = c.starTick - c.bornTick;
    assert.ok(
      lifespan >= C.LIFESPAN_MIN_SEC && lifespan <= C.LIFESPAN_MAX_SEC,
      `lifespan=${lifespan} 應落在 [${C.LIFESPAN_MIN_SEC},${C.LIFESPAN_MAX_SEC}]`
    );
  }
});

test('tick 推進 stage：elder→star 逐階到期，兩次 tick 後轉 star、進 archive、events 含 starred、hearts 加成', () => {
  // 狀態機嚴格逐階推進（adult→elder→star），不會因 starTick 到期就跳過 elder。
  // elderTick 也要一併設到期，才是真實遊戲中會出現的狀態（elderTick 恆早於 starTick）。
  const rng = rngFactory(3);
  const world = Sim.newWorld(rng);
  const c = world.creatures[0];
  c.elderTick = world.tick;    // 已到期 → 第一次 tick 轉 elder
  c.starTick = world.tick + 1; // 第二次 tick 轉 star
  const heartsBefore = world.hearts;
  const archiveBefore = world.archive.length;

  let events = Sim.tick(world, rng);
  assert.strictEqual(c.stage, 'elder', '第一次 tick 應先轉 elder');
  assert.ok(!events.some((e) => e.type === 'starred' && e.ids.includes(c.id)));

  events = Sim.tick(world, rng);
  assert.strictEqual(c.stage, 'star');
  assert.strictEqual(world.archive.length, archiveBefore + 1);
  assert.ok(!world.creatures.includes(c), '化星後應移出在世名單');
  assert.ok(events.some((e) => e.type === 'starred' && e.ids.includes(c.id)));
  assert.strictEqual(world.hearts, heartsBefore + C.HEART_STAR);
});

test('相遇成家：兩隻單身 adult 相遇、rng 必成 → partnerId 互指、events 含 family', () => {
  const rng0 = () => 0; // 永遠回傳 0，必定小於任何機率門檻
  const world = Sim.newWorld(rng0);
  const [a, b] = world.creatures;
  world.creatures.forEach((c) => {
    if (c !== a && c !== b) { c.x = -1000; c.y = -1000; } // 避免其他 founder 干擾
  });
  a.x = b.x = 100; a.y = b.y = 80;
  a.partnerId = null; b.partnerId = null;

  const events = Sim.tick(world, rng0);
  assert.strictEqual(a.partnerId, b.id);
  assert.strictEqual(b.partnerId, a.id);
  assert.ok(events.some((e) => e.type === 'family' && e.ids.includes(a.id) && e.ids.includes(b.id)));
});

test('生蛋守 POP_CAP：族群滿 24 隻時到期不產蛋', () => {
  const rng0 = () => 0;
  const world = Sim.newWorld(rng0);
  const [a, b] = world.creatures;
  a.x = b.x = 30; a.y = b.y = 60;
  a.partnerId = b.id; b.partnerId = a.id;
  a.nextEggTick = world.tick; // 到期

  while (world.creatures.length < C.POP_CAP) {
    world.creatures.push({
      id: world.nextId++, name: `filler${world.nextId}`, gen: 1, parents: null, partnerId: null,
      genes: Genetics.founderGenes(0),
      bornTick: world.tick, matureTick: world.tick + 999999, elderTick: world.tick + 9999998, starTick: world.tick + 9999999,
      stage: 'child', x: -999, y: -999, vx: 0, vy: 0, action: 'idle', actionUntil: world.tick + 999999,
      nextEggTick: null, lastPetTick: 0, starIdx: null,
    });
  }
  assert.strictEqual(world.creatures.length, C.POP_CAP);

  Sim.tick(world, rng0);
  assert.strictEqual(world.creatures.length, C.POP_CAP, '族群已滿，到期也不該生出新蛋');
});

test('fastForward 事件彙總與逐 tick 累加一致；fastForward(0) 無變化', () => {
  const world1 = Sim.newWorld(rngFactory(6));
  const world2 = Sim.newWorld(rngFactory(6)); // 同 seed，起點應相同

  const rngA = rngFactory(999);
  let bornA = 0, maturedA = 0, starredA = 0;
  const heartsBefore1 = world1.hearts;
  for (let i = 0; i < 3600; i++) {
    const events = Sim.tick(world1, rngA);
    for (const e of events) {
      if (e.type === 'born') bornA += e.ids.length;
      if (e.type === 'matured') maturedA += e.ids.length;
      if (e.type === 'starred') starredA += e.ids.length;
    }
  }
  const heartsDelta1 = world1.hearts - heartsBefore1;

  const rngB = rngFactory(999);
  const heartsBefore2 = world2.hearts;
  const summary = Sim.fastForward(world2, 3600, rngB);
  const heartsDelta2 = world2.hearts - heartsBefore2;

  assert.strictEqual(world1.tick, world2.tick);
  assert.strictEqual(summary.born.length, bornA);
  assert.strictEqual(summary.matured.length, maturedA);
  assert.strictEqual(summary.starred.length, starredA);
  assert.strictEqual(summary.hearts, heartsDelta1);
  assert.strictEqual(summary.hearts, heartsDelta2);

  const before = JSON.stringify(world2);
  const summary0 = Sim.fastForward(world2, 0, rngB);
  assert.strictEqual(JSON.stringify(world2), before, 'fastForward(0) 不應改變 world');
  assert.strictEqual(summary0.born.length, 0);
  assert.strictEqual(summary0.matured.length, 0);
  assert.strictEqual(summary0.starred.length, 0);
  assert.strictEqual(summary0.hearts, 0);
});

test('save/load roundtrip：JSON 化後 load 回來與存檔一致', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const rng = rngFactory(7);
    const world = Sim.newWorld(rng);
    world.hearts = 42;
    Sim.save(world);
    const loaded = Sim.load();
    assert.ok(loaded, 'load 應回傳非 null');
    assert.strictEqual(loaded.world.tick, world.tick);
    assert.strictEqual(loaded.world.hearts, 42);
    assert.strictEqual(loaded.world.nextId, world.nextId);
    assert.strictEqual(loaded.world.creatures.length, world.creatures.length);
    assert.deepStrictEqual(loaded.world.creatures[0], world.creatures[0]);
    assert.ok(typeof loaded.offlineSec === 'number' && loaded.offlineSec >= 0);
  } finally {
    delete global.localStorage;
  }
});

// ---- 第二階段：商店（延壽／月老／裝飾）＋存檔 v1→v2 遷移 ----

test('extendLife：扣款、starTick/elderTick 同步延後、lifeBuys 累加，價格逐次翻倍', () => {
  const world = Sim.newWorld(rngFactory(10));
  const c = world.creatures[0];
  world.hearts = 100;
  const starBefore = c.starTick, elderBefore = c.elderTick;

  let res = Sim.extendLife(world, c.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.price, C.SHOP.extend.base);
  assert.strictEqual(world.hearts, 70);
  assert.strictEqual(c.starTick, starBefore + C.EXTEND_SEC);
  assert.strictEqual(c.elderTick, elderBefore + C.EXTEND_SEC);
  assert.strictEqual(c.lifeBuys, 1);

  res = Sim.extendLife(world, c.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.price, C.SHOP.extend.base * C.SHOP.extend.factor); // 第二次翻倍
  assert.strictEqual(world.hearts, 10);
  assert.strictEqual(c.lifeBuys, 2);
});

test('extendLife 愛心不足：{ok:false}，hearts/starTick/lifeBuys 全不變', () => {
  const world = Sim.newWorld(rngFactory(11));
  const c = world.creatures[0];
  world.hearts = 10; // 不夠付第一次的 30
  const starBefore = c.starTick, elderBefore = c.elderTick, buysBefore = c.lifeBuys;

  const res = Sim.extendLife(world, c.id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(world.hearts, 10);
  assert.strictEqual(c.starTick, starBefore);
  assert.strictEqual(c.elderTick, elderBefore);
  assert.strictEqual(c.lifeBuys, buysBefore);
});

test('extendLife 回春：elder 延壽後距化星超過 ELDER_BEFORE_SEC 就退回 adult', () => {
  const world = Sim.newWorld(rngFactory(12));
  const c = world.creatures[0];
  world.hearts = 1000;
  c.stage = 'elder';
  c.starTick = world.tick + 3600; // 再 1 小時就化星，遠小於 ELDER_BEFORE_SEC(12hr)
  c.elderTick = world.tick;

  const res = Sim.extendLife(world, c.id);
  assert.strictEqual(res.ok, true);
  // 延壽後 starTick 距 tick = 3600+EXTEND_SEC，遠大於 ELDER_BEFORE_SEC → 回春
  assert.strictEqual(c.stage, 'adult');
});

test('matchmake：兩隻單身 adult、扣 50 愛心、partnerId 互指、nextEggTick 已排', () => {
  const world = Sim.newWorld(rngFactory(13));
  const [a, b] = world.creatures;
  world.hearts = C.SHOP.match;
  a.partnerId = null; b.partnerId = null;

  const res = Sim.matchmake(world, a.id, b.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(world.hearts, 0);
  assert.strictEqual(a.partnerId, b.id);
  assert.strictEqual(b.partnerId, a.id);
  assert.ok(a.nextEggTick != null && a.nextEggTick === b.nextEggTick);
});

test('matchmake 資格不符（已婚或非成年）：{ok:false} 不扣款', () => {
  const world = Sim.newWorld(rngFactory(14));
  world.hearts = C.SHOP.match;
  const [a, b, other] = world.creatures;

  a.partnerId = 999; // a 已婚
  let res = Sim.matchmake(world, a.id, b.id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(world.hearts, C.SHOP.match);

  other.stage = 'child'; other.partnerId = null; // other 未成年
  res = Sim.matchmake(world, other.id, world.creatures[3].id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(world.hearts, C.SHOP.match);
});

test('buyDecor：愛心足夠才放裝飾扣款，不足回 {ok:false}', () => {
  const world = Sim.newWorld(rngFactory(15));
  world.hearts = C.SHOP.decor.flower + 5; // 25，剛好夠花叢、不夠石燈

  let res = Sim.buyDecor(world, 'flower', 100, 90);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(world.hearts, 5);
  assert.strictEqual(world.decor.length, 1);
  assert.deepStrictEqual(world.decor[0], { kind: 'flower', x: 100, y: 90 });

  res = Sim.buyDecor(world, 'lantern', 50, 60);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(world.hearts, 5);
  assert.strictEqual(world.decor.length, 1);
});

test('moveDecor：更新座標、不動愛心', () => {
  const world = Sim.newWorld(rngFactory(16));
  world.hearts = C.SHOP.decor.flower;
  Sim.buyDecor(world, 'flower', 10, 10);
  const heartsBefore = world.hearts;

  Sim.moveDecor(world, 0, 200, 140);
  assert.deepStrictEqual(world.decor[0], { kind: 'flower', x: 200, y: 140 });
  assert.strictEqual(world.hearts, heartsBefore);
});

// ---- 追加任務：裝飾移除＋0 愛心購回（商店＝倉庫，不做庫存介面）----

test('removeDecor：從 decor 移除；pond 維持一次性不可移除；壞 index 安全失敗', () => {
  const world = Sim.newWorld(rngFactory(50));
  world.hearts = 1000;
  Sim.buyDecor(world, 'flower', 10, 10);
  Sim.buyDecor(world, 'pond', 50, 50);
  assert.strictEqual(world.decor.length, 2);

  let res = Sim.removeDecor(world, 0); // flower
  assert.strictEqual(res.ok, true);
  assert.strictEqual(world.decor.length, 1);
  assert.strictEqual(world.decor[0].kind, 'pond');

  res = Sim.removeDecor(world, 0); // 現在 index 0 是 pond
  assert.strictEqual(res.ok, false, 'pond 應維持一次性不可移除');
  assert.strictEqual(world.decor.length, 1);

  res = Sim.removeDecor(world, 99); // 不存在的 index
  assert.strictEqual(res.ok, false);
  assert.strictEqual(world.decor.length, 1);
});

test('buyDecor 已擁有的 kind：移除後再買免費（price:0），未買過的種類照原價', () => {
  const world = Sim.newWorld(rngFactory(51));
  world.hearts = 1000;

  let res = Sim.buyDecor(world, 'flower', 10, 10);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.price, C.SHOP.decor.flower, '第一次購買照原價');
  assert.strictEqual(world.hearts, 1000 - C.SHOP.decor.flower);
  assert.deepStrictEqual(world.ownedDecor, ['flower']);

  const heartsBeforeRemove = world.hearts;
  Sim.removeDecor(world, 0);

  res = Sim.buyDecor(world, 'flower', 20, 20);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.price, 0, '已擁有過的種類，移除後再買應免費');
  assert.strictEqual(world.hearts, heartsBeforeRemove, '0 元購買不應扣款');
  assert.deepStrictEqual(world.ownedDecor, ['flower'], '不該重複記錄已擁有的種類');

  res = Sim.buyDecor(world, 'lantern', 30, 30);
  assert.strictEqual(res.price, C.SHOP.decor.lantern, '未買過的種類應照原價');
});

test('ownedDecor 存檔相容：舊檔缺少此欄位時 load() 補空陣列', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const oldData = {
      ver: 2, tick: 100, lastRealMs: Date.now(), hearts: 50, nextId: 8,
      creatures: [], archive: [], decor: [], // 無 ownedDecor（舊存檔）
    };
    store[C.SAVE_KEY] = JSON.stringify(oldData);
    const loaded = Sim.load();
    assert.deepStrictEqual(loaded.world.ownedDecor, []);
  } finally {
    delete global.localStorage;
  }
});

test('v1 存檔遷移：補 decor=[]、每隻 lifeBuys=0，其餘欄位保留，重存後 ver 升 2', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const v1Creature = {
      id: 0, name: '波嚕', gen: 0, parents: null, partnerId: null,
      genes: Genetics.founderGenes(0),
      bornTick: 0, matureTick: 0, elderTick: 999999, starTick: 1000000,
      stage: 'adult', x: 100, y: 80, vx: 0, vy: 0, action: 'idle', actionUntil: 20,
      nextEggTick: null, lastPetTick: -1, starIdx: null, // 無 lifeBuys（v1 舊格式）
    };
    const v1Data = {
      ver: 1, tick: 12345, lastRealMs: Date.now(), hearts: 77, nextId: 9,
      creatures: [v1Creature], archive: [], // 無 decor（v1 舊格式）
    };
    store[C.SAVE_KEY] = JSON.stringify(v1Data);

    const loaded = Sim.load();
    assert.ok(loaded);
    assert.strictEqual(loaded.world.tick, 12345);
    assert.strictEqual(loaded.world.hearts, 77);
    assert.strictEqual(loaded.world.nextId, 9);
    assert.deepStrictEqual(loaded.world.decor, []);
    assert.strictEqual(loaded.world.creatures[0].lifeBuys, 0);
    assert.strictEqual(loaded.world.creatures[0].name, '波嚕'); // 其餘欄位保留

    Sim.save(loaded.world);
    const resaved = JSON.parse(store[C.SAVE_KEY]);
    assert.strictEqual(resaved.ver, 2);
    assert.deepStrictEqual(resaved.decor, []);
    assert.strictEqual(resaved.creatures[0].lifeBuys, 0);
  } finally {
    delete global.localStorage;
  }
});

// ---- 2.5 開瓶儀式：newWorld 自訂祖代基因 ----

test('newWorld 自訂 founderGenes：傳入的與 world 一致，省略/null 元素落回預設值', () => {
  const customGenes = [
    { shape: { m: 7, n1: 2, n2: 3, n3: 4 }, color: { h: 10, s: 0.5, l: 0.5 }, size: 1, speed: 1, glow: false },
    null, // 這隻沒指定，應落回預設
    { shape: { m: 8, n1: 1, n2: 1, n3: 1 }, color: { h: 200, s: 0.6, l: 0.6 }, size: 1.1, speed: 0.9, glow: true },
    { shape: { m: 0, n1: 1, n2: 1, n3: 1 }, color: { h: 300, s: 0.7, l: 0.55 }, size: 1, speed: 1, glow: false },
    { shape: { m: 3, n1: 4.5, n2: 10, n3: 10 }, color: { h: 50, s: 0.7, l: 0.6 }, size: 1, speed: 1, glow: false },
    { shape: { m: 4, n1: 12, n2: 15, n3: 15 }, color: { h: 130, s: 0.7, l: 0.6 }, size: 1, speed: 1, glow: false },
    { shape: { m: 4, n1: 1, n2: 1, n3: 1 }, color: { h: 220, s: 0.7, l: 0.6 }, size: 1, speed: 1, glow: false },
    { shape: { m: 3, n1: 4.5, n2: 10, n3: 10 }, color: { h: 280, s: 0.7, l: 0.6 }, size: 1, speed: 1, glow: false },
  ];
  const world = Sim.newWorld(rngFactory(20), customGenes);
  assert.strictEqual(world.creatures.length, C.FOUNDER_COUNT);
  for (let i = 0; i < C.FOUNDER_COUNT; i++) {
    if (customGenes[i]) {
      assert.deepStrictEqual(world.creatures[i].genes, customGenes[i], `founder ${i} 應套用傳入的自訂基因`);
    } else {
      assert.deepStrictEqual(world.creatures[i].genes, Genetics.founderGenes(i), `founder ${i} 省略時應落回預設值`);
    }
  }
});

test('newWorld 未傳 founderGenes 時行為不變（省略參數、明確傳 undefined 皆同預設）', () => {
  const withoutArg = Sim.newWorld(rngFactory(21));
  const withUndefined = Sim.newWorld(rngFactory(21), undefined);
  for (let i = 0; i < C.FOUNDER_COUNT; i++) {
    assert.deepStrictEqual(withoutArg.creatures[i].genes, Genetics.founderGenes(i));
    assert.deepStrictEqual(withoutArg.creatures[i].genes, withUndefined.creatures[i].genes);
  }
});

// ---- 伴侶相聚傾向：pickAction 是私有函式，只能透過 Sim.tick() 間接驗證 ----
// 統計檢定：多次決策後「實際走路方向 vs 朝伴侶方向」的角度差平均值。
// 純隨機基準（方向均勻分布於 [0,2π)）下，與任一固定方向的最小夾角期望值 = π/2 ≈ 1.5708。
// 每次 tick 後把 a 的座標重置回起點，隔離「移動本身改變距離」這個混淆變因，
// 只單純檢驗 pickAction 在給定距離下的方向決策。
function sampleWalkAngleDiff(world, rng, a, targetAngle, resetPos, maxTicks, minSamples) {
  let walkSamples = 0, angleDiffSum = 0;
  let lastActionUntil = a.actionUntil;
  for (let i = 0; i < maxTicks && walkSamples < minSamples; i++) {
    Sim.tick(world, rng);
    resetPos();
    if (a.actionUntil !== lastActionUntil) {
      lastActionUntil = a.actionUntil;
      if (a.action === 'walk') {
        const actualAngle = Math.atan2(a.vy, a.vx);
        let diff = Math.abs(actualAngle - targetAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        angleDiffSum += diff;
        walkSamples++;
      }
    }
  }
  assert.ok(walkSamples >= minSamples, `應收集到足夠 walk 樣本，實際 ${walkSamples}`);
  return angleDiffSum / walkSamples;
}

test('伴侶相聚傾向：距離>60 時走路方向顯著偏向伴侶', () => {
  const rng = rngFactory(30);
  const world = Sim.newWorld(rng);
  const [a, b] = world.creatures;
  a.partnerId = b.id; b.partnerId = a.id;
  a.x = 50; a.y = 120;
  b.x = 250; b.y = 120; // 距離 200，遠大於 60 門檻（正東方向，targetAngle=0）
  b.genes = { ...b.genes, speed: 0 }; // b 固定不動，避免距離隨模擬漂移
  // 拉長生命週期，避免測試期間化星把 a/b 移出 world.creatures
  a.starTick = world.tick + 999999; a.elderTick = a.starTick - 1;
  b.starTick = world.tick + 999999; b.elderTick = b.starTick - 1;

  const targetAngle = Math.atan2(b.y - a.y, b.x - a.x);
  const avgDiff = sampleWalkAngleDiff(world, rng, a, targetAngle, () => { a.x = 50; a.y = 120; }, 30000, 150);
  // 理論值：50% 純隨機(期望π/2≈1.571) + 50% 朝伴侶±0.5rad噪聲(期望0.25) ≈ 0.91；門檻抓寬鬆但足以區分有無偏向
  assert.ok(avgDiff < 1.2, `平均角度差 ${avgDiff.toFixed(3)} rad 應顯著小於純隨機基準 π/2≈1.571，代表走路方向偏向伴侶`);
});

test('伴侶相聚傾向：距離<=60 時維持純隨機，不強制朝伴侶', () => {
  const rng = rngFactory(31);
  const world = Sim.newWorld(rng);
  const [a, b] = world.creatures;
  a.partnerId = b.id; b.partnerId = a.id;
  a.x = 100; a.y = 120;
  b.x = 130; b.y = 120; // 距離 30，小於 60 門檻
  b.genes = { ...b.genes, speed: 0 };
  a.starTick = world.tick + 999999; a.elderTick = a.starTick - 1;
  b.starTick = world.tick + 999999; b.elderTick = b.starTick - 1;

  const targetAngle = Math.atan2(b.y - a.y, b.x - a.x);
  const avgDiff = sampleWalkAngleDiff(world, rng, a, targetAngle, () => { a.x = 100; a.y = 120; }, 30000, 150);
  // 近距離不該被拉向伴侶，平均值應接近純隨機基準 π/2≈1.571（留統計容差）
  assert.ok(avgDiff > 1.3, `平均角度差 ${avgDiff.toFixed(3)} rad 應接近純隨機基準，太小代表距離門檻判斷失效`);
});

// ---- 設計文件對帳缺口：好感度累積 / 幼年跟親代 / 老年看天空 ----

test('好感度累積：相遇次數增加會提高配對機率，直到成家並清除紀錄', () => {
  const fixedR = 0.06; // 固定回傳，介於 baseline FAMILY_CHANCE(0.03) 和封頂(0.03+0.05=0.08) 之間
  const rng = () => fixedR;
  const world = Sim.newWorld(rng);
  const [a, b] = world.creatures;
  a.x = b.x = 100; a.y = b.y = 100; // 同位置，必定在 MEET_RADIUS 內
  a.actionUntil = 999999; b.actionUntil = 999999; // 避免測試期間觸發 pickAction 移動位置
  a.partnerId = null; b.partnerId = null;

  Sim.tick(world, rng);
  assert.strictEqual(a.partnerId, null, '第一次相遇機率(0.03)低於固定 rng(0.06)，不該成家');
  assert.strictEqual(a.meetCounts[b.id], 1, '未成家應記一次相遇次數');
  assert.strictEqual(b.meetCounts[a.id], 1);

  let paired = false;
  for (let i = 0; i < 10; i++) {
    Sim.tick(world, rng);
    if (a.partnerId != null) { paired = true; break; }
  }
  assert.ok(paired, '相遇次數累積夠多次後，機率應超過固定 rng 值而成家');
  assert.strictEqual(a.partnerId, b.id);
  assert.strictEqual(b.partnerId, a.id);
  assert.deepStrictEqual(a.meetCounts, {}, '成家後應清除好感度紀錄');
  assert.deepStrictEqual(b.meetCounts, {});
});

test('好感度累積 存檔相容：舊存檔缺少 meetCounts 欄位時 load() 補空物件', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const oldCreature = {
      id: 0, name: '波嚕', gen: 0, parents: null, partnerId: null,
      genes: Genetics.founderGenes(0),
      bornTick: 0, matureTick: 0, elderTick: 999999, starTick: 1000000,
      stage: 'adult', x: 100, y: 80, vx: 0, vy: 0, action: 'idle', actionUntil: 20,
      nextEggTick: null, lastPetTick: -1, starIdx: null, lifeBuys: 0, // 無 meetCounts（舊存檔）
    };
    const oldData = {
      ver: 2, tick: 100, lastRealMs: Date.now(), hearts: 50, nextId: 8,
      creatures: [oldCreature], archive: [], decor: [],
    };
    store[C.SAVE_KEY] = JSON.stringify(oldData);

    const loaded = Sim.load();
    assert.ok(loaded);
    assert.deepStrictEqual(loaded.world.creatures[0].meetCounts, {});
    assert.strictEqual(loaded.world.creatures[0].name, '波嚕'); // 其餘欄位保留
  } finally {
    delete global.localStorage;
  }
});

test('幼年跟親代：child 走路方向偏向距離較近的在世親代', () => {
  const rng = rngFactory(40);
  const world = Sim.newWorld(rng);
  const [p1, p2] = world.creatures;
  const child = {
    id: world.nextId++, name: 'testchild', gen: 1, parents: [p1.id, p2.id], partnerId: null,
    genes: Genetics.founderGenes(0),
    bornTick: 0, matureTick: 999999, elderTick: 9999998, starTick: 9999999,
    stage: 'child', x: 100, y: 120, vx: 0, vy: 0, action: 'idle', actionUntil: 0,
    nextEggTick: null, lastPetTick: -1, starIdx: null, lifeBuys: 0, meetCounts: {},
  };
  world.creatures.push(child);

  p1.x = 300; p1.y = 120; // 距離 200，較遠
  p2.x = 200; p2.y = 120; // 距離 100，較近（兩者都 > CHILD_FOLLOW_DIST(40) 門檻）
  p1.genes = { ...p1.genes, speed: 0 }; p2.genes = { ...p2.genes, speed: 0 }; // 固定不動避免距離漂移
  p1.starTick = world.tick + 999999; p1.elderTick = p1.starTick - 1;
  p2.starTick = world.tick + 999999; p2.elderTick = p2.starTick - 1;

  const targetAngle = Math.atan2(p2.y - child.y, p2.x - child.x); // 應偏向較近的 p2
  const avgDiff = sampleWalkAngleDiff(world, rng, child, targetAngle, () => { child.x = 100; child.y = 120; }, 30000, 150);
  assert.ok(avgDiff < 1.2, `平均角度差 ${avgDiff.toFixed(3)} rad 應顯著小於純隨機基準，代表幼年走路方向偏向較近的親代`);
});

test('幼年跟親代：兩位親代皆已化星（不在世）時不 crash，照舊純隨機', () => {
  const rng = rngFactory(41);
  const world = Sim.newWorld(rng);
  const child = {
    id: world.nextId++, name: 'orphanchild', gen: 1, parents: [99998, 99999], partnerId: null, // 不存在的親代 id
    genes: Genetics.founderGenes(0),
    bornTick: 0, matureTick: 999999, elderTick: 9999998, starTick: 9999999,
    stage: 'child', x: 100, y: 120, vx: 0, vy: 0, action: 'idle', actionUntil: 0,
    nextEggTick: null, lastPetTick: -1, starIdx: null, lifeBuys: 0, meetCounts: {},
  };
  world.creatures.push(child);

  assert.doesNotThrow(() => {
    for (let i = 0; i < 50; i++) Sim.tick(world, rng);
  });
  assert.ok(isFinite(child.x) && isFinite(child.y), '座標應維持有限數值，不因親代不存在而出錯');
});

test('老年看天空：elder 有機會進入 gaze 狀態，靜止且持續 20-40 tick', () => {
  const rng = rngFactory(42);
  const world = Sim.newWorld(rng);
  const c = world.creatures[0];
  c.stage = 'elder';
  c.starTick = world.tick + 999999; // 避免測試期間化星

  let sawGaze = false;
  let lastActionUntil = c.actionUntil;
  for (let i = 0; i < 5000 && !sawGaze; i++) {
    const tBefore = world.tick;
    Sim.tick(world, rng);
    if (c.actionUntil !== lastActionUntil) {
      lastActionUntil = c.actionUntil;
      if (c.action === 'gaze') {
        sawGaze = true;
        assert.strictEqual(c.vx, 0, 'gaze 應靜止');
        assert.strictEqual(c.vy, 0, 'gaze 應靜止');
        const duration = c.actionUntil - tBefore;
        assert.ok(duration >= 20 && duration <= 40, `gaze 持續時間 ${duration} 應在 20~40 tick`);
      }
    }
  }
  assert.ok(sawGaze, '多次決策後 elder 應至少進入一次 gaze 狀態');
});

test('老年看天空：非 elder 不會出現 gaze 狀態', () => {
  const rng = rngFactory(43);
  const world = Sim.newWorld(rng);
  const c = world.creatures[0];
  c.stage = 'adult';
  c.starTick = world.tick + 999999; c.elderTick = world.tick + 999998; // 避免變成 elder

  for (let i = 0; i < 2000; i++) {
    Sim.tick(world, rng);
    assert.notStrictEqual(c.action, 'gaze', 'adult 不該出現 gaze 狀態');
  }
});

test('genName：C.LANG=en 時產生英文名字（首字大寫、其餘小寫、同輩不重複）', () => {
  const originalLang = C.LANG;
  C.LANG = 'en';
  try {
    const rng = rngFactory(50);
    const world = Sim.newWorld(rng);
    for (const c of world.creatures) {
      assert.match(c.name, /^[A-Z][a-z]+$/, `name=${c.name} 應符合英文命名格式`);
    }
    const names = new Set(world.creatures.map((c) => c.name));
    assert.strictEqual(names.size, C.FOUNDER_COUNT, '同輩英文名字不應重複');
  } finally {
    if (originalLang === undefined) delete C.LANG; else C.LANG = originalLang;
  }
});

test('genName：C.LANG 缺值（或非 en）維持中文疊字命名，不受英文模式影響', () => {
  const originalLang = C.LANG;
  delete C.LANG;
  try {
    const rng = rngFactory(51);
    const world = Sim.newWorld(rng);
    for (const c of world.creatures) {
      assert.ok(!/^[A-Z][a-z]+$/.test(c.name), `name=${c.name} 不應是英文命名格式`);
      assert.strictEqual(c.name.length, 2, '中文名字應是兩個疊字組成');
    }
  } finally {
    if (originalLang === undefined) delete C.LANG; else C.LANG = originalLang;
  }
});

// ---- 喪偶續弦：伴侶化星時，未到老年期的一方應解除婚姻關係、可重新配對 ----

test('喪偶續弦：伴侶還是 adult 時，一方化星後清除其 partnerId/nextEggTick/meetCounts，可重新配對', () => {
  const rng = rngFactory(60);
  const world = Sim.newWorld(rng);
  const [a, b] = world.creatures;
  world.creatures.forEach((c) => {
    if (c !== a && c !== b) { c.x = -1000; c.y = -1000; } // 避免其他 founder 這輪剛好跟 b 相遇配對，干擾斷言
  });
  a.partnerId = b.id; b.partnerId = a.id;
  a.stage = 'elder'; a.elderTick = world.tick - 1; a.starTick = world.tick; // 這次 tick 直接化星
  b.stage = 'adult'; b.elderTick = world.tick + 999999; b.starTick = world.tick + 9999999; // b 遠離老年期
  b.nextEggTick = world.tick + 500; // 婚後殘留的生蛋排程，驗證會被清除
  b.meetCounts = { 999: 3 }; // 婚後殘留的好感度紀錄，驗證會被清空

  const heartsBefore = world.hearts;
  const events = Sim.tick(world, rng);

  assert.strictEqual(a.stage, 'star');
  assert.ok(!world.creatures.includes(a), '化星的一方應移出在世名單');
  assert.ok(events.some((e) => e.type === 'starred' && e.ids.includes(a.id)));
  assert.strictEqual(world.hearts, heartsBefore + C.HEART_STAR);

  assert.strictEqual(b.partnerId, null, '伴侶還是 adult，喪偶後應解除婚姻關係、可重新配對');
  assert.strictEqual(b.nextEggTick, null, '不再有伴侶，應清除生蛋排程');
  assert.deepStrictEqual(b.meetCounts, {}, '應重新開始累積好感度紀錄');
});

test('喪偶不續弦：伴侶已進入老年期時，一方化星後 partnerId 維持原狀，不會被視為可配對', () => {
  const rng = rngFactory(61);
  const world = Sim.newWorld(rng);
  const [a, b] = world.creatures;
  world.creatures.forEach((c) => {
    if (c !== a && c !== b) { c.x = -1000; c.y = -1000; }
  });
  a.partnerId = b.id; b.partnerId = a.id;
  a.stage = 'elder'; a.elderTick = world.tick - 1; a.starTick = world.tick; // 這次 tick 直接化星
  b.stage = 'elder'; b.elderTick = world.tick - 1; b.starTick = world.tick + 999999; // b 已是老年期，但還不到化星

  Sim.tick(world, rng);

  assert.strictEqual(a.stage, 'star');
  assert.strictEqual(b.partnerId, a.id, '伴侶已是 elder，喪偶後應維持已婚狀態，不再配對');
});

test('喪偶續弦：清除 partnerId 後，該個體可與新對象相遇成家', () => {
  const rng0 = () => 0; // 永遠回傳 0，必定小於任何機率門檻
  const world = Sim.newWorld(rng0);
  const [a, b, newMate] = world.creatures;
  world.creatures.forEach((c) => {
    if (c !== a && c !== b && c !== newMate) { c.x = -1000; c.y = -1000; }
  });
  a.partnerId = b.id; b.partnerId = a.id;
  a.stage = 'elder'; a.elderTick = world.tick - 1; a.starTick = world.tick; // 這次 tick 化星，b 喪偶
  b.stage = 'adult'; b.elderTick = world.tick + 999999; b.starTick = world.tick + 9999999;
  b.x = 100; b.y = 80;
  newMate.partnerId = null; newMate.x = 100; newMate.y = 80; // 與 b 同位置，喪偶後同一 tick 內即可相遇

  const events = Sim.tick(world, rng0);

  assert.strictEqual(b.partnerId, newMate.id, '喪偶解除婚姻關係後，同一輪 meetAndPair 應能與新對象成家');
  assert.strictEqual(newMate.partnerId, b.id);
  assert.ok(events.some((e) => e.type === 'family' && e.ids.includes(b.id) && e.ids.includes(newMate.id)));
});

// ---- genName 音節池擴充：實玩回饋名字重複率偏高（2026-07-10）----

test('genName 音節池：中英文都擴充到至少 32 個、且無重複，降低長期重複觀感', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sim.js'), 'utf8');
  const zhList = src.match(/const SYLLABLES = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  const enList = src.match(/const SYLLABLES_EN = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  assert.ok(zhList.length >= 32, `中文音節池應至少 32 個，目前 ${zhList.length} 個`);
  assert.ok(enList.length >= 32, `英文音節池應至少 32 個，目前 ${enList.length} 個`);
  assert.strictEqual(new Set(zhList).size, zhList.length, '中文音節池不應有重複字');
  assert.strictEqual(new Set(enList).size, enList.length, '英文音節池不應有重複音節');
});

test('genName 中文：大樣本取樣下，不同名字種類數應超過舊版 16 字音節池的組合上限（16×16=256 種）', () => {
  const names = new Set();
  for (let seed = 100; seed < 600; seed++) {
    const world = Sim.newWorld(rngFactory(seed));
    for (const c of world.creatures) names.add(c.name);
  }
  assert.ok(names.size > 256, `500 world × 8 founder 取樣觀察到 ${names.size} 種不同名字，應高於舊版音節池 256 種組合上限，代表音節池已擴充`);
});

// ---- load() 存量修復：喪偶續弦上線前就已存在的 dangling partnerId ----

test('load 存量修復：舊存檔 adult 的 partnerId 指向已消失的 id（伴侶已化星）時，載入後應解除婚姻關係可再配', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const widow = {
      id: 0, name: '波嚕', gen: 0, parents: null, partnerId: 999, // 999 不存在於 creatures，代表伴侶已化星
      genes: Genetics.founderGenes(0),
      bornTick: 0, matureTick: 0, elderTick: 999999, starTick: 1000000,
      stage: 'adult', x: 100, y: 80, vx: 0, vy: 0, action: 'idle', actionUntil: 20,
      nextEggTick: 500, lastPetTick: -1, starIdx: null, lifeBuys: 0, meetCounts: { 888: 2 },
    };
    const oldData = {
      ver: 2, tick: 100, lastRealMs: Date.now(), hearts: 50, nextId: 1,
      creatures: [widow], archive: [], decor: [], ownedDecor: [],
    };
    store[C.SAVE_KEY] = JSON.stringify(oldData);

    const loaded = Sim.load();
    assert.ok(loaded);
    const c = loaded.world.creatures[0];
    assert.strictEqual(c.partnerId, null, 'adult 喪偶（伴侶已化星消失）載入後應解除婚姻關係、可重新配對');
    assert.strictEqual(c.nextEggTick, null, '應清除生蛋排程');
    assert.deepStrictEqual(c.meetCounts, {}, '應重新開始累積好感度紀錄');
  } finally {
    delete global.localStorage;
  }
});

test('load 存量修復：舊存檔 elder 的 partnerId 指向已消失的 id 時，載入後維持已婚狀態不變（守寡語意）', () => {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const widow = {
      id: 0, name: '波嚕', gen: 0, parents: null, partnerId: 999,
      genes: Genetics.founderGenes(0),
      bornTick: 0, matureTick: 0, elderTick: 0, starTick: 1000000,
      stage: 'elder', x: 100, y: 80, vx: 0, vy: 0, action: 'idle', actionUntil: 20,
      nextEggTick: null, lastPetTick: -1, starIdx: null, lifeBuys: 0, meetCounts: {},
    };
    const oldData = {
      ver: 2, tick: 100, lastRealMs: Date.now(), hearts: 50, nextId: 1,
      creatures: [widow], archive: [], decor: [], ownedDecor: [],
    };
    store[C.SAVE_KEY] = JSON.stringify(oldData);

    const loaded = Sim.load();
    assert.ok(loaded);
    const c = loaded.world.creatures[0];
    assert.strictEqual(c.partnerId, 999, 'elder 喪偶載入後應維持原本已婚狀態不變，跟化星當下的續弦規則一致');
  } finally {
    delete global.localStorage;
  }
});

test('load 存量修復：partnerId 指向存在的 id（正常已婚）時，載入不應誤清除', () => {
  const world = Sim.newWorld(rngFactory(70));
  const [a, b] = world.creatures;
  a.partnerId = b.id; b.partnerId = a.id;
  a.nextEggTick = 500; a.meetCounts = { 777: 1 };

  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    Sim.save(world);
    const loaded = Sim.load();
    const loadedA = loaded.world.creatures.find((c) => c.id === a.id);
    assert.strictEqual(loadedA.partnerId, b.id, '伴侶仍存在於 creatures，不該被存量修復誤清除');
    assert.strictEqual(loadedA.nextEggTick, 500, '正常配對的排程不該被誤清');
  } finally {
    delete global.localStorage;
  }
});
