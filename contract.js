/* =====================================================================
   contract.js — 全模組共用的常數、資料形狀文件、RNG
   這是邏輯層（genetics/sim）與表現層（render/ui）之間唯一的介面契約。
   改任何欄位或介面前，先確認雙方負責人都知情。
   ===================================================================== */

const C = {
  // ---- 畫布（邏輯像素；2026-07-08 由 240×160 放大 1.5 倍：
  //      個體像素尺寸不變、世界變寬，讓小動物顯得嬌小） ----
  WORLD_W: 360,
  WORLD_H: 240,
  SKY_H: 60,                       // 天空區，地面活動區在其下

  // ---- 時間（皆為「模擬秒」；1 tick = 1 模擬秒） ----
  // TIME_SCALE 由 index.html 讀 URL ?fast=N 後寫入，正式環境 = 1。
  // 真實流逝秒數 × TIME_SCALE = 模擬秒數。
  TIME_SCALE: 1,
  TICK_SEC: 1,
  EGG_SEC: 30 * 60,                // 蛋 → 孵化
  CHILD_SEC: 6 * 3600,             // 孵化 → 成年（形狀揭曉）
  ELDER_BEFORE_SEC: 12 * 3600,     // 化星前多久進入老年
  LIFESPAN_MIN_SEC: 4 * 86400,
  LIFESPAN_MAX_SEC: 7 * 86400,
  OFFLINE_CAP_SEC: 72 * 3600,      // 離線最多折算 72 小時
  DAYNIGHT_SEC: 40 * 60,           // 一輪日夜

  // ---- 移動速度（px/模擬秒；隨地圖 1.5 倍等比補償，維持螢幕上的體感速度） ----
  WALK_SPEED_MIN: 4,
  WALK_SPEED_MAX: 10,
  RUSH_SPEED: 18,                  // 皮克敏式果實衝刺

  // ---- 族群 ----
  FOUNDER_COUNT: 8,
  POP_CAP: 24,                     // 含蛋與幼年
  MEET_RADIUS: 20,                 // 隨地圖放大＋速度加快補償相遇機會
  FAMILY_CHANCE: 0.03,             // 兩隻成年單身相遇時、每 tick 擲骰
  EGG_INTERVAL_MIN_SEC: 8 * 3600,
  EGG_INTERVAL_MAX_SEC: 16 * 3600,
  EGG_CHANCE: 0.5,                 // nextEggTick 到期時擲骰

  // ---- 突變機率 ----
  MUT_SHAPE: 0.015,
  MUT_COLOR: 0.01,
  MUT_GLOW: 0.005,

  // ---- 愛心 ----
  HEART_PET: 1,
  HEART_BORN: 3,
  HEART_MATURE: 10,
  HEART_STAR: 5,
  PET_COOLDOWN_SEC: 30 * 60,

  // ---- 商店（愛心價格；第二階段） ----
  SHOP: {
    extend: { base: 30, factor: 2 },   // 延壽 +24hr；同隻第 n 次 = base × factor^n
    match: 50,                          // 月老紅線
    decor: { flower: 20, lantern: 40, seesaw: 50, swing: 60, slide: 70, bridge: 80, pond: 100 },
  },
  EXTEND_SEC: 24 * 3600,

  // ---- 存檔 ----
  // SAVE_KEY 由 bottles.js 在開機時路由到當前瓶（terrarium_bottle_<id>）；
  // 無 bottles 模組時维持舊值（單瓶模式）。runtime 可變，同 TIME_SCALE 前例。
  SAVE_KEY: 'terrarium_v1',
  SAVE_VER: 2,

  // ---- 雲端存檔（第三階段）----
  // GCP OAuth Client ID（Web 應用程式、授權來源 https://tsun-u.github.io）。
  // 空字串 = 雲端功能隱藏，其餘功能不受影響。Client ID 屬公開資訊可入庫。
  DRIVE_CLIENT_ID: '674654433726-tq25dneafbu0pm39pq6kl2kpdmgmnh3f.apps.googleusercontent.com',
};

/* ---------------------------------------------------------------------
   資料形狀（文件；欄位以此為準）

   Creature = {
     id: int, name: str, gen: int,
     parents: [idA, idB] | null,          // founder 為 null
     partnerId: int | null,
     genes: {
       shape: { m, n1, n2, n3 },          // superformula 參數
       color: { h, s, l },                // h: 0~360, s: 0.4~0.9, l: 0.45~0.75
       size: float,                       // 0.85~1.15
       speed: float,                      // 0.8~1.2
       glow: bool,
     },
     bornTick: int,                       // 蛋產出（egg）或 founder 誕生的 tick
     matureTick: int,                     // 孵化 tick + CHILD_SEC（孵化時回填）
     elderTick: int, starTick: int,       // 出生時一次算好
     stage: 'egg' | 'child' | 'adult' | 'elder' | 'star',
     x: float, y: float,                  // y ∈ [SKY_H+8, WORLD_H-8]
     vx: float, vy: float,
     action: 'walk' | 'idle' | 'sleep',
     actionUntil: int,                    // tick
     nextEggTick: int | null,             // 只有已成家者有值
     lastPetTick: int,
     starIdx: int | null,                 // 化星後在星空的序號
   }

   Save = {
     ver: 1, tick: int, lastRealMs: int, hearts: int, nextId: int,
     creatures: [Creature],               // 在世（含蛋）
     archive: [{ id, name, gen, parents, genes, bornTick, starTick }],
   }

   介面約定：
     Genetics.founderGenes(i)                 -> genes（i = 0..7）
     Genetics.breed(genesA, genesB, rng)      -> genes
     Genetics.rasterize(genes, stage)         -> { w, h, pixels: Uint8ClampedArray }  // RGBA
     Sim.newWorld(rng, founderGenes?)         -> world
       // founderGenes：開瓶儀式的自訂祖代基因（長度 FOUNDER_COUNT 的 genes 陣列）；
       // 省略或元素為 null 時用 Genetics.founderGenes(i) 預設值
     Sim.tick(world, rng)                     -> events[]
     Sim.fastForward(world, seconds, rng)     -> { born: [Creature], matured: [Creature],
                                                   starred: [Creature], hearts: int }
     Sim.save(world)                          -> void（localStorage）
     Sim.load()                               -> { world, offlineSec } | null
     events 元素 = { type: 'born'|'matured'|'family'|'starred'|'egg', ids: [int] }

   第二階段（商店；金流一律 sim 檢查，hearts 不足 → {ok:false} 且不動任何狀態）：
     Creature 新欄位 lifeBuys:int（延壽次數；v1 遷移補 0）
     Save v2 新欄位 decor: [{ kind:'flower'|'lantern'|'seesaw'|'swing'|'slide'|'bridge'|'pond', x, y }]
     Sim.extendLife(world, id)          -> { ok, price }   // 扣款+延壽+lifeBuys++；
                                            // 回春：elder 且延壽後距化星 > ELDER_BEFORE_SEC → stage 'adult'
     Sim.matchmake(world, idA, idB)     -> { ok }          // 兩隻 adult/elder 且單身才成立
     Sim.buyDecor(world, kind, x, y)    -> { ok, price }   // 已擁有的 kind 收 0（商店即倉庫）
     Sim.moveDecor(world, index, x, y)  -> void            // 免費搬家
     Sim.removeDecor(world, index)      -> { ok }          // pond 不可移除
     World.ownedDecor: string[]、Creature.meetCounts: {id:次數}（好感度）
       // 兩者走欄位存在性檢查補預設，SAVE_VER 不變
     action 新增 'gaze'（老年看天空；render 畫視線星光）
   --------------------------------------------------------------------- */

// 可重現的 LCG 隨機數（測試注入 seed；正式用 Date.now() 當 seed）
const rngFactory = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

if (typeof module !== 'undefined') module.exports = { C, rngFactory, clamp };
if (typeof window !== 'undefined') { window.C = C; window.rngFactory = rngFactory; window.clamp = clamp; }
