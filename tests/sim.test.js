// tests/sim.test.js（node --test；Sim 以 dual export 提供，rng 一律注入 rngFactory(seed) 保證可重現）
const test = require('node:test');
const assert = require('node:assert');
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
