/* sim.js — 模擬模組（個體狀態機、家庭、生命週期、愛心、離線快轉、存讀檔）。介面見 contract.js。 */

const Sim = {};

(function () {
  const ctx = (typeof module !== 'undefined' && module.exports) ? require('./contract.js') : window;
  const { C } = ctx;
  const Genetics = (typeof module !== 'undefined' && module.exports) ? require('./genetics.js') : window.Genetics;

  const SYLLABLES = ['波', '嚕', '糰', '咪', '豆', '蹦', '噗', '拉', '奇', '可', '妞', '皮', '塔', '米', '歐', '嘟'];

  function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }

  function genName(world, rng) {
    const existing = new Set(world.creatures.map((c) => c.name));
    let name, guard = 0;
    do {
      name = SYLLABLES[Math.floor(rng() * SYLLABLES.length)] + SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
      guard++;
    } while (existing.has(name) && guard < 200);
    return name;
  }

  function findCreature(world, id) {
    return world.creatures.find((c) => c.id === id);
  }

  // ---- 個體建立 ----
  function makeFounder(i, world, rng, customGenes) {
    const lifespanSec = randRange(rng, C.LIFESPAN_MIN_SEC, C.LIFESPAN_MAX_SEC);
    const starTick = 0 + lifespanSec;
    return {
      id: world.nextId++, name: genName(world, rng), gen: 0, parents: null, partnerId: null,
      genes: customGenes || Genetics.founderGenes(i),
      bornTick: 0, matureTick: 0, elderTick: starTick - C.ELDER_BEFORE_SEC, starTick,
      stage: 'adult',
      x: C.WORLD_W * (i + 1) / (C.FOUNDER_COUNT + 1),
      y: C.SKY_H + 8 + rng() * (C.WORLD_H - C.SKY_H - 16),
      vx: 0, vy: 0, action: 'idle', actionUntil: 10 + Math.floor(rng() * 31),
      nextEggTick: null, lastPetTick: -C.PET_COOLDOWN_SEC - 1, starIdx: null, lifeBuys: 0,
    };
  }

  function layEgg(world, a, b, t, rng) {
    const genes = Genetics.breed(a.genes, b.genes, rng);
    const lifespanSec = randRange(rng, C.LIFESPAN_MIN_SEC, C.LIFESPAN_MAX_SEC);
    const starTick = t + lifespanSec; // 壽命從蛋產出當下起算，涵蓋蛋＋幼年＋成年＋老年全程
    const egg = {
      id: world.nextId++, name: genName(world, rng), gen: Math.max(a.gen, b.gen) + 1,
      parents: [a.id, b.id], partnerId: null, genes,
      bornTick: t,
      matureTick: t + C.EGG_SEC + C.CHILD_SEC, // 孵化＋成長固定時長，出生時即可算好
      elderTick: starTick - C.ELDER_BEFORE_SEC, starTick,
      stage: 'egg', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: 0,
      action: 'idle', actionUntil: t + C.EGG_SEC,
      nextEggTick: null, lastPetTick: -C.PET_COOLDOWN_SEC - 1, starIdx: null, lifeBuys: 0,
    };
    world.creatures.push(egg);
    return egg;
  }

  function newWorld(rng, founderGenes) {
    const world = { tick: 0, hearts: 0, nextId: 0, creatures: [], archive: [], decor: [] };
    for (let i = 0; i < C.FOUNDER_COUNT; i++) {
      const customGenes = founderGenes ? founderGenes[i] : null;
      world.creatures.push(makeFounder(i, world, rng, customGenes));
    }
    return world;
  }

  // ---- 行為機 ----
  const PARTNER_ATTRACT_DIST = 60;
  const PARTNER_ATTRACT_CHANCE = 0.5;
  const PARTNER_ATTRACT_NOISE = 0.5; // ±0.5 rad

  function pickAction(c, t, rng, world) {
    const r = rng();
    if (r < 0.55) {
      c.action = 'walk';
      let ang = rng() * Math.PI * 2;
      // 組家庭後常一起行動：partnerId 有值且距離伴侶 > 60 時，五成機率改朝伴侶方向
      // （帶 ±0.5 rad 噪聲）；距離近時維持純隨機，避免黏太緊不自然。
      if (c.partnerId != null) {
        const partner = findCreature(world, c.partnerId);
        if (partner) {
          const dx = partner.x - c.x, dy = partner.y - c.y;
          if (dx * dx + dy * dy > PARTNER_ATTRACT_DIST * PARTNER_ATTRACT_DIST && rng() < PARTNER_ATTRACT_CHANCE) {
            ang = Math.atan2(dy, dx) + (rng() * 2 - 1) * PARTNER_ATTRACT_NOISE;
          }
        }
      }
      const speedMul = c.stage === 'elder' ? 0.5 : 1;
      const spd = randRange(rng, C.WALK_SPEED_MIN, C.WALK_SPEED_MAX) * c.genes.speed * speedMul;
      c.vx = Math.cos(ang) * spd; c.vy = Math.sin(ang) * spd;
    } else if (r < 0.85) {
      c.action = 'idle'; c.vx = 0; c.vy = 0;
    } else {
      c.action = 'sleep'; c.vx = 0; c.vy = 0;
    }
    c.actionUntil = t + 10 + Math.floor(rng() * 31); // 10~40 tick
  }

  function stepMovement(c) {
    if (c.action !== 'walk') return;
    const margin = 6;
    let nx = c.x + c.vx, ny = c.y + c.vy;
    if (nx < margin || nx > C.WORLD_W - margin) { c.vx *= -1; nx = c.x + c.vx; }
    if (ny < C.SKY_H + margin || ny > C.WORLD_H - margin) { c.vy *= -1; ny = c.y + c.vy; }
    c.x = nx; c.y = ny;
  }

  // ---- 相遇成家 ----
  function meetAndPair(world, t, rng, events) {
    const creatures = world.creatures;
    for (let i = 0; i < creatures.length; i++) {
      const a = creatures[i];
      if ((a.stage !== 'adult' && a.stage !== 'elder') || a.partnerId != null) continue;
      for (let j = i + 1; j < creatures.length; j++) {
        const b = creatures[j];
        if ((b.stage !== 'adult' && b.stage !== 'elder') || b.partnerId != null) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy > C.MEET_RADIUS * C.MEET_RADIUS) continue;
        // 找到最近的候選就擲一次骰，不論成敗都不再幫 a 找下一位（下個 tick 再重試）
        if (rng() < C.FAMILY_CHANCE) {
          a.partnerId = b.id; b.partnerId = a.id;
          const interval = randRange(rng, C.EGG_INTERVAL_MIN_SEC, C.EGG_INTERVAL_MAX_SEC);
          a.nextEggTick = t + interval; b.nextEggTick = t + interval;
          events.push({ type: 'family', ids: [a.id, b.id] });
        }
        break;
      }
    }
  }

  // ---- 生蛋（只由配對中 id 較小的一方檢查，避免同一對重複處理）----
  function layEggs(world, t, rng, events) {
    for (const c of world.creatures) {
      if (c.partnerId == null || c.id > c.partnerId) continue;
      if (c.nextEggTick == null || t < c.nextEggTick) continue;
      if (c.stage !== 'adult' && c.stage !== 'elder') continue;
      const partner = findCreature(world, c.partnerId);
      if (!partner) continue;

      if (rng() < C.EGG_CHANCE) {
        if (world.creatures.length < C.POP_CAP) {
          const egg = layEgg(world, c, partner, t, rng);
          c.nextEggTick = t + randRange(rng, C.EGG_INTERVAL_MIN_SEC, C.EGG_INTERVAL_MAX_SEC);
          events.push({ type: 'egg', ids: [egg.id] });
        }
        // 族群已滿：本次不產也不重排 nextEggTick，留到下個 tick 繼續檢查
      } else {
        c.nextEggTick = t + randRange(rng, C.EGG_INTERVAL_MIN_SEC, C.EGG_INTERVAL_MAX_SEC);
      }
    }
  }

  // ---- 單一 tick ----
  function tick(world, rng) {
    const t = world.tick;
    const events = [];
    const toRemove = [];

    for (const c of world.creatures) {
      if (t >= c.actionUntil && c.stage !== 'egg') pickAction(c, t, rng, world);
      stepMovement(c);

      if (c.stage === 'egg' && t >= c.bornTick + C.EGG_SEC) {
        c.stage = 'child';
        events.push({ type: 'born', ids: [c.id] });
        world.hearts += C.HEART_BORN;
      } else if (c.stage === 'child' && t >= c.matureTick) {
        c.stage = 'adult';
        events.push({ type: 'matured', ids: [c.id] });
        world.hearts += C.HEART_MATURE;
      } else if (c.stage === 'adult' && t >= c.elderTick) {
        c.stage = 'elder';
      } else if (c.stage === 'elder' && t >= c.starTick) {
        c.stage = 'star';
        world.archive.push({
          id: c.id, name: c.name, gen: c.gen, parents: c.parents, genes: c.genes,
          bornTick: c.bornTick, starTick: c.starTick, starIdx: world.archive.length,
        });
        events.push({ type: 'starred', ids: [c.id] });
        world.hearts += C.HEART_STAR;
        toRemove.push(c.id);
      }
    }

    if (toRemove.length) {
      world.creatures = world.creatures.filter((c) => !toRemove.includes(c.id));
    }

    meetAndPair(world, t, rng, events);
    layEggs(world, t, rng, events);

    world.tick = t + 1;
    return events;
  }

  // ---- 離線快轉 ----
  function fastForward(world, seconds, rng) {
    seconds = Math.max(0, Math.min(seconds, C.OFFLINE_CAP_SEC));
    const born = [], matured = [], starred = [];
    const heartsBefore = world.hearts;
    for (let i = 0; i < seconds; i++) {
      const events = tick(world, rng);
      for (const e of events) {
        if (e.type === 'born') {
          for (const id of e.ids) { const c = findCreature(world, id); if (c) born.push(c); }
        } else if (e.type === 'matured') {
          for (const id of e.ids) { const c = findCreature(world, id); if (c) matured.push(c); }
        } else if (e.type === 'starred') {
          for (const id of e.ids) {
            const rec = world.archive.find((a) => a.id === id);
            if (rec) starred.push(rec);
          }
        }
      }
    }
    return { born, matured, starred, hearts: world.hearts - heartsBefore };
  }

  // ---- 商店（金流一律在此檢查，hearts 不足就 {ok:false} 且不動任何狀態）----
  function extendLife(world, id) {
    const c = findCreature(world, id);
    if (!c) return { ok: false, price: 0 };
    const price = C.SHOP.extend.base * Math.pow(C.SHOP.extend.factor, c.lifeBuys);
    if (world.hearts < price) return { ok: false, price };
    world.hearts -= price;
    c.starTick += C.EXTEND_SEC;
    c.elderTick += C.EXTEND_SEC; // 同步位移，維持老年期本身的長度不變，只是延後發生
    c.lifeBuys += 1;
    // 回春：延壽後距化星時間已超過 ELDER_BEFORE_SEC，代表還沒到新的 elderTick，退回 adult
    if (c.stage === 'elder' && c.starTick - world.tick > C.ELDER_BEFORE_SEC) {
      c.stage = 'adult';
    }
    return { ok: true, price };
  }

  function matchmake(world, idA, idB) {
    const a = findCreature(world, idA), b = findCreature(world, idB);
    const eligible = (x) => x && (x.stage === 'adult' || x.stage === 'elder') && x.partnerId == null;
    if (!eligible(a) || !eligible(b) || a.id === b.id) return { ok: false };
    if (world.hearts < C.SHOP.match) return { ok: false };
    world.hearts -= C.SHOP.match;
    a.partnerId = b.id; b.partnerId = a.id;
    // 復用 meetAndPair 成功路徑的賦值：雙方同值 nextEggTick。介面無 rng（玩家單次觸發的
    // UI 動作，非模擬迴圈的一部分，不需要可重現性），直接用 Math.random()
    const interval = randRange(Math.random, C.EGG_INTERVAL_MIN_SEC, C.EGG_INTERVAL_MAX_SEC);
    a.nextEggTick = world.tick + interval; b.nextEggTick = world.tick + interval;
    return { ok: true };
  }

  function buyDecor(world, kind, x, y) {
    const price = C.SHOP.decor[kind];
    if (price == null) return { ok: false };
    if (world.hearts < price) return { ok: false };
    world.hearts -= price;
    world.decor.push({ kind, x, y });
    return { ok: true };
  }

  function moveDecor(world, index, x, y) {
    const d = world.decor[index];
    if (!d) return;
    d.x = x; d.y = y;
  }

  // ---- 存讀檔 ----
  function save(world) {
    const data = {
      ver: C.SAVE_VER, tick: world.tick, lastRealMs: Date.now(),
      hearts: world.hearts, nextId: world.nextId,
      creatures: world.creatures, archive: world.archive, decor: world.decor,
    };
    localStorage.setItem(C.SAVE_KEY, JSON.stringify(data));
  }

  function load() {
    let raw;
    try { raw = localStorage.getItem(C.SAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }

    // v1 → v2 遷移：補 decor、每隻 creature 補 lifeBuys，其餘欄位原樣保留
    if (!data.ver || data.ver < 2) {
      if (!Array.isArray(data.decor)) data.decor = [];
      for (const c of data.creatures) {
        if (c.lifeBuys === undefined) c.lifeBuys = 0;
      }
      data.ver = C.SAVE_VER;
    }

    const world = {
      tick: data.tick, hearts: data.hearts, nextId: data.nextId,
      creatures: data.creatures, archive: data.archive, decor: data.decor,
    };
    const offlineSec = Math.max(0, (Date.now() - data.lastRealMs) / 1000) * C.TIME_SCALE;
    return { world, offlineSec };
  }

  Sim.newWorld = newWorld;
  Sim.tick = tick;
  Sim.fastForward = fastForward;
  Sim.extendLife = extendLife;
  Sim.matchmake = matchmake;
  Sim.buyDecor = buyDecor;
  Sim.moveDecor = moveDecor;
  Sim.save = save;
  Sim.load = load;
})();

if (typeof module !== 'undefined') module.exports = Sim;
if (typeof window !== 'undefined') window.Sim = Sim;
