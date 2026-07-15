/* ui.js — 介面模組（資訊卡、改名、族譜、離線摘要卡、愛心顯示、互動、輕音效）。介面見 contract.js。
   原則：除了改名輸入框，全部無文字——用圖形與 icon 溝通。 */

const UI = {};

(() => {
  let W = null;              // world 參照
  let soundOn = true;
  let audioCtx = null;
  let openCardFor = null;    // 目前資訊卡對象 id

  /* ---------- 樣式（集中注入，index.html 保持乾淨） ---------- */

  const style = document.createElement('style');
  style.textContent = `
  /* 面板＝深遮罩（點空白處關閉）＋置中亮卡片（sheet），視線有邊界有起點 */
  .panel {
    position: fixed; inset: 0; z-index: 70;
    background: rgba(8,10,20,.72); backdrop-filter: blur(3px);
    display: flex; flex-direction: column; align-items: center;
    overflow-y: auto; padding: 6vh 16px 24px;
    cursor: pointer;
  }
  .sheet {
    background: rgba(34,42,64,.96); border: 1px solid rgba(255,255,255,.14);
    border-radius: 20px; padding: 14px 18px 18px;
    max-width: 620px; width: min(620px, 94vw);
    box-shadow: 0 14px 44px rgba(0,0,0,.5);
    cursor: default; position: relative;
    animation: sheetIn .22s cubic-bezier(.34,1.3,.64,1);
  }
  @keyframes sheetIn { from { transform: translateY(22px) scale(.96); opacity: 0; } }
  .sheet-head {
    display: flex; align-items: center; gap: 10px;
    padding-bottom: 10px; margin-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,.14);
  }
  .sheet-head .big { font-size: 28px; }
  .sheet-head .stat { color: #ffd3dd; font-size: 18px; font-weight: bold; }
  .sheet-head .stat.dim { color: #aab6c8; }
  .sheet-head .close {
    margin-left: auto; width: 40px; height: 40px; flex: none;
    border: none; border-radius: 12px; background: rgba(255,255,255,.16);
    color: #fff; font-size: 18px; cursor: pointer;
  }
  .gen-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
             margin-bottom: 6px; position: relative; }
  .gen-row .gen-chip {
    flex: none; align-self: center; min-width: 22px; height: 22px; line-height: 22px;
    text-align: center; border-radius: 7px; background: rgba(255,255,255,.12);
    color: #9fb0c8; font-size: 12px; font-weight: bold; padding: 0 5px;
  }
  .gen-sep { width: 100%; height: 1px; background: rgba(255,255,255,.12); margin: 8px 0; }

  /* 模式提示膠囊（選人／放置模式時滑入頂部） */
  #modeBanner {
    position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
    z-index: 75; display: flex; align-items: center; gap: 10px;
    background: rgba(34,42,64,.96); border: 1px solid rgba(255,255,255,.18);
    border-radius: 999px; padding: 8px 10px 8px 18px;
    font-size: 22px; color: #eef;
    box-shadow: 0 8px 24px rgba(0,0,0,.45);
    animation: bannerIn .25s cubic-bezier(.34,1.3,.64,1);
  }
  @keyframes bannerIn { from { transform: translateX(-50%) translateY(-30px); opacity: 0; } }
  #modeBanner .cancel {
    width: 34px; height: 34px; border: none; border-radius: 999px;
    background: rgba(255,255,255,.16); color: #fff; font-size: 15px; cursor: pointer;
  }

  /* 速度選單（⏩ 展開直選，免循環） */
  #speedMenu {
    position: fixed; left: 174px; bottom: 64px; z-index: 60;
    display: flex; gap: 6px; padding: 8px;
    background: rgba(34,42,64,.96); border: 1px solid rgba(255,255,255,.18);
    border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.45);
    animation: chipIn2 .16s cubic-bezier(.34,1.4,.64,1);
  }
  #speedMenu .speed-chip {
    min-width: 46px; height: 40px; border: 2px solid transparent; border-radius: 11px;
    background: rgba(255,255,255,.12); color: #dde; font-family: inherit;
    font-size: 15px; font-weight: bold; cursor: pointer;
  }
  #speedMenu .speed-chip.cur { border-color: #ffd54f; color: #ffd54f; }

  /* 兩段式確認氣泡（延壽選人） */
  #confirmBub {
    position: fixed; z-index: 78; transform: translate(-50%, -100%);
    background: #3f9e4d; color: #fff; border: none; border-radius: 12px;
    padding: 7px 14px; font-family: inherit; font-size: 16px; font-weight: bold;
    cursor: pointer; box-shadow: 0 4px 0 #2c7337;
    animation: chipIn2 .18s cubic-bezier(.34,1.4,.64,1);
  }
  @keyframes chipIn2 { from { transform: translate(-50%,-100%) scale(.5); } }
  .node {
    width: 64px; padding: 6px 2px 4px; border-radius: 10px; text-align: center;
    background: rgba(255,255,255,.07); cursor: pointer; position: relative;
    border: 2px solid transparent; transition: border-color .15s, background .15s;
  }
  .node canvas { image-rendering: pixelated; display: block; margin: 0 auto; }
  .node .nm { color: #dde; font-size: 12px; margin-top: 2px; }
  .node .nm .pen { font-size: 11px; opacity: .75; margin-left: 3px; }
  .node .nm input { font-size: 12px; width: 56px; background: #101624; color: #eef;
                    border: 1px solid #557; border-radius: 5px; padding: 1px 3px;
                    font-family: inherit; }
  .node .editBtns button {
    border: none; border-radius: 6px; width: 22px; height: 20px; margin-left: 3px; padding: 0;
    font-size: 11px; cursor: pointer; color: #fff;
  }
  .node .badge { position: absolute; right: 2px; top: 0; font-size: 11px; }
  .node .crown { position: absolute; left: 2px; top: 0; font-size: 11px; }
  .node.hl-self   { border-color: #ffd54f; background: rgba(255,213,79,.15); }
  .node.hl-parent { border-color: #7ec8e3; }
  .node.hl-child  { border-color: #a5d6a7; }
  .node.hl-mate   { border-color: #ff8fab; }

  /* 商店格：亮底；買不起用價格變灰表達，不壓暗整格 */
  .node.shop-item { background: rgba(255,255,255,.16); width: 76px; padding-top: 10px; }
  .node.shop-item .nm { font-size: 14px; font-weight: bold; color: #ffd3dd; }
  .node.shop-item.cant { cursor: default; }
  .node.shop-item.cant .nm { color: #7a8290; }
  .node.shop-item.cant > *:first-child { filter: grayscale(.55) opacity(.75); }
  #treeLines { position: absolute; inset: 0; pointer-events: none; }

  #infoCard {
    position: fixed; z-index: 65; left: 50%; bottom: 70px; transform: translateX(-50%);
    display: flex; gap: 12px; align-items: center;
    background: rgba(34,42,64,.96); border: 1px solid rgba(255,255,255,.18);
    border-radius: 16px; padding: 10px 38px 10px 16px; color: #eef;
    animation: cardUp .22s cubic-bezier(.34,1.3,.64,1);
  }
  @keyframes cardUp { from { transform: translateX(-50%) translateY(24px); opacity: 0; } }
  #infoCard canvas { image-rendering: pixelated; cursor: pointer; }
  #infoCard .cardClose {
    position: absolute; right: 6px; top: 6px; width: 26px; height: 26px;
    border: none; border-radius: 9px; background: rgba(255,255,255,.14);
    color: #cdd6e6; font-size: 12px; cursor: pointer;
  }
  #infoCard .meta { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  #infoCard .nm { font-size: 17px; font-weight: bold; cursor: pointer; }
  #infoCard .nm .pen { font-size: 13px; opacity: .75; margin-left: 4px; }
  #infoCard .nm input { font-size: 16px; width: 90px; background: #101624; color: #eef;
                        border: 1px solid #557; border-radius: 6px; padding: 2px 6px;
                        font-family: inherit; }
  #infoCard .editBtns button {
    border: none; border-radius: 8px; width: 30px; height: 26px; margin-left: 4px;
    font-size: 14px; cursor: pointer; color: #fff;
  }
  #infoCard .stage { font-size: 15px; }
  #infoCard .parents { display: flex; gap: 6px; align-items: center; }
  #infoCard .parents canvas { cursor: pointer; }

  .float-heart {
    position: fixed; z-index: 80; color: #ff9db4; font-weight: bold; font-size: 18px;
    pointer-events: none; animation: floatUp 1.1s ease-out forwards;
  }
  @keyframes floatUp { to { transform: translateY(-34px); opacity: 0; } }

  #summaryCard {
    position: fixed; inset: 0; z-index: 90;
    background: rgba(12,16,30,.9); display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px; cursor: pointer;
  }
  #summaryCard .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
                      justify-content: center; }
  #summaryCard .row .tag { font-size: 26px; }
  #summaryCard canvas { image-rendering: pixelated; }
  #summaryCard .hearts { color: #ff9db4; font-size: 24px; font-weight: bold; }
  /* 化星者在摘要卡上緩緩飄向星空 */
  #summaryCard .ascend { display: inline-block; animation: sumAscend 2.6s ease-in-out infinite alternate; }
  @keyframes sumAscend {
    from { transform: translateY(5px); opacity: 1; }
    to   { transform: translateY(-9px); opacity: .45; }
  }
  `;
  document.head.appendChild(style);

  /* ---------- 輕音效（WebAudio 合成，soundOn 可關） ---------- */

  function beep(freq, dur = .1, type = 'sine', vol = .06, when = 0) {
    if (!soundOn) return;
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime + when;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + .02);
  }
  const sfx = {
    pet:    () => beep(880, .08, 'sine', .05),
    born:   () => { beep(659, .12); beep(880, .14, 'sine', .05, .1); },
    mature: () => { [523, 659, 784].forEach((f, i) => beep(f, .14, 'triangle', .05, i * .09)); },
    star:   () => { [784, 659, 523, 392].forEach((f, i) => beep(f, .3, 'sine', .04, i * .22)); },
  };

  /* ---------- 小工具 ---------- */

  const $ = id => document.getElementById(id);
  const everyone = () => [...W.creatures, ...W.archive];
  const findAny = id => everyone().find(c => c.id === id);

  function portrait(cr, scale) {
    const sp = Render.spriteOf(cr);
    const cv = document.createElement('canvas');
    cv.width = sp.width * scale; cv.height = sp.height * scale;
    const c2 = cv.getContext('2d');
    c2.imageSmoothingEnabled = false;
    c2.drawImage(sp, 0, 0, cv.width, cv.height);
    return cv;
  }

  function floatHeart(clientX, clientY, text) {
    const el = document.createElement('div');
    el.className = 'float-heart';
    el.textContent = text;
    el.style.left = clientX + 'px'; el.style.top = clientY + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function updateHearts() { $('heartNum').textContent = W.hearts; }

  const STAGE_ICON = { egg: '🥚', child: '🐣', adult: '🌼', elder: '🍂', star: '⭐' };
  const STAGE_ORDER = ['egg', 'child', 'adult', 'elder'];

  // 生命階段條：🥚🐣🌼🍂 排一排、目前階段亮起——單一 icon 沒脈絡，一條進度才可讀
  function stageStrip(cr) {
    const wrap = document.createElement('div');
    wrap.className = 'stage';
    STAGE_ORDER.forEach(st => {
      const s = document.createElement('span');
      s.textContent = STAGE_ICON[st];
      const isNow = cr.stage === st;
      s.style.cssText = `margin-right:3px; font-size:${isNow ? 17 : 13}px; opacity:${isNow ? 1 : 0.3};`;
      wrap.appendChild(s);
    });
    return wrap;
  }

  /* ---------- 資訊卡 ---------- */

  function closeCard() { const c = $('infoCard'); if (c) c.remove(); openCardFor = null; }

  function openCard(cr) {
    closeCard();
    openCardFor = cr.id;
    const card = document.createElement('div');
    card.id = 'infoCard';
    // 關閉鈕（跟面板一致的明確出口；點世界其他處也會關）
    const cardClose = document.createElement('button');
    cardClose.className = 'cardClose'; cardClose.textContent = '✕';
    cardClose.onclick = ev => { ev.stopPropagation(); closeCard(); };
    card.appendChild(cardClose);
    // 肖像（點擊 = 摸摸）
    const pv = portrait(cr, 4);
    pv.title = '';
    pv.onclick = () => pet(cr);
    card.appendChild(pv);
    // 名字 + 階段 + 父母
    const meta = document.createElement('div');
    meta.className = 'meta';
    const nm = document.createElement('div');
    nm.className = 'nm';
    setNameLabel(nm, cr);
    nm.onclick = () => startRename(cr, nm);
    meta.appendChild(nm);
    meta.appendChild(stageStrip(cr));
    // 延壽鈕（蛋還不用）：🍎＋這隻的現價
    if (cr.stage !== 'egg' && typeof Sim.extendLife === 'function') {
      const price = extendPriceOf(cr);
      const ext = document.createElement('button');
      ext.style.cssText = 'border:none;border-radius:9px;padding:3px 10px;font-family:inherit;' +
        'font-size:14px;cursor:pointer;background:' +
        (W.hearts >= price ? '#3f9e4d' : '#3a4252') + ';color:#fff;';
      ext.textContent = `🍎 ❤${price}`;
      // 兩段式確認：第一按進入確認態（✓、變橘），1.6 秒內再按才成立
      let armTimer = null;
      const disarm = () => {
        ext.dataset.armed = '';
        ext.textContent = `🍎 ❤${price}`;
        ext.style.background = W.hearts >= price ? '#3f9e4d' : '#3a4252';
      };
      ext.onclick = ev => {
        ev.stopPropagation();
        if (!ext.dataset.armed) {
          ext.dataset.armed = '1';
          ext.textContent = `✓ ❤${price}`;
          ext.style.background = '#e58e00';
          clearTimeout(armTimer);
          armTimer = setTimeout(disarm, 1600);
          return;
        }
        clearTimeout(armTimer);
        const res = Sim.extendLife(W, cr.id);
        if (res.ok) {
          Render.heartsAt(cr.x, cr.y - 8); sfx.mature(); spend(res.price);
          Render.invalidateSprite(cr.id);
          closeCard(); openCard(cr);   // 重繪卡片讓新價格顯示
        } else { confusedMark(cr.x, cr.y); disarm(); }
      };
      meta.appendChild(ext);
    }
    // 伴侶列：❤＋縮圖＋名字，點縮圖跳去看伴侶
    if (cr.partnerId != null) {
      const mate = W.creatures.find(c => c.id === cr.partnerId);
      if (mate) {
        const mr = document.createElement('div');
        mr.className = 'parents';
        const tag = document.createElement('span');
        tag.textContent = '❤'; tag.style.cssText = 'color:#ff8fab;font-size:13px;';
        mr.appendChild(tag);
        const mini = portrait(mate, 2);
        mini.onclick = ev => { ev.stopPropagation(); closeCard(); openCard(mate); };
        mr.appendChild(mini);
        const mn = document.createElement('span');
        mn.textContent = mate.name;
        mn.style.cssText = 'font-size:13px;color:#cdd6e6;';
        mr.appendChild(mn);
        meta.appendChild(mr);
      }
    }
    // 父母列：🌳 前綴（點縮圖開族譜）
    if (cr.parents) {
      const ps = document.createElement('div');
      ps.className = 'parents';
      const tag = document.createElement('span');
      tag.textContent = '🌳'; tag.style.cssText = 'font-size:12px;opacity:.8;';
      ps.appendChild(tag);
      cr.parents.forEach(pid => {
        const p = findAny(pid);
        if (!p) return;
        const mini = portrait(p, 2);
        mini.onclick = () => { closeCard(); openTree(cr.id); };
        ps.appendChild(mini);
      });
      meta.appendChild(ps);
    }
    card.appendChild(meta);
    $('uiLayer').appendChild(card);
  }

  // 名字顯示：文字＋常駐 ✏️（讓「可以改名」被看見）
  function setNameLabel(nmEl, cr) {
    nmEl.textContent = cr.name;
    const pen = document.createElement('span');
    pen.className = 'pen'; pen.textContent = '✏️';
    nmEl.appendChild(pen);
  }

  function startRename(cr, nmEl) {
    if (nmEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.value = cr.name; input.maxLength = 8;
    nmEl.textContent = ''; nmEl.appendChild(input);
    // 明確的 ✓ 存／✕ 還原，不再依賴失焦
    const btns = document.createElement('span');
    btns.className = 'editBtns';
    const ok = document.createElement('button');
    ok.textContent = '✓'; ok.style.background = '#3f9e4d';
    const no = document.createElement('button');
    no.textContent = '✕'; no.style.background = '#7a8290';
    btns.appendChild(ok); btns.appendChild(no);
    nmEl.appendChild(btns);
    input.focus(); input.select();
    const finish = save => {
      if (save) {
        const v = input.value.trim();
        if (v) cr.name = v;
        if (Sim.save) Sim.save(W);
      }
      nmEl.innerHTML = '';
      setNameLabel(nmEl, cr);
    };
    ok.onclick = ev => { ev.stopPropagation(); finish(true); };
    no.onclick = ev => { ev.stopPropagation(); finish(false); };
    input.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    };
    input.onclick = e => e.stopPropagation();
  }

  function pet(cr) {
    Render.heartsAt(cr.x, cr.y - 8);
    sfx.pet();
    if (W.tick - cr.lastPetTick >= C.PET_COOLDOWN_SEC) {
      cr.lastPetTick = W.tick;
      W.hearts += C.HEART_PET;
      updateHearts();
      floatHeart(window.innerWidth - 90, 40, '+' + C.HEART_PET);
    }
  }

  /* ---------- 點擊世界 ---------- */

  // 點夜空的星星：彈出那個孩子的小卡（肖像＋名字＋⭐）
  function openStarCard(cr) {
    closeCard();
    openCardFor = null;
    const card = document.createElement('div');
    card.id = 'infoCard';
    const cardClose = document.createElement('button');
    cardClose.className = 'cardClose'; cardClose.textContent = '✕';
    cardClose.onclick = ev => { ev.stopPropagation(); closeCard(); };
    card.appendChild(cardClose);
    card.appendChild(portrait({ ...cr, stage: 'adult' }, 4));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const nm = document.createElement('div');
    nm.className = 'nm'; nm.textContent = cr.name;
    const st = document.createElement('div');
    st.className = 'stage'; st.textContent = '⭐';
    const tr = document.createElement('button');
    tr.style.cssText = 'border:none;border-radius:9px;padding:3px 10px;font-family:inherit;' +
      'font-size:14px;cursor:pointer;background:rgba(255,255,255,.16);color:#fff;';
    tr.textContent = '🌳';
    tr.onclick = ev => { ev.stopPropagation(); closeCard(); openTree(cr.id); };
    meta.appendChild(nm); meta.appendChild(st); meta.appendChild(tr);
    card.appendChild(meta);
    $('uiLayer').appendChild(card);
  }

  function onCanvasClick(e) {
    if (!W) return;
    const { x, y } = Render.toWorld(e.clientX, e.clientY);
    if (handleModeClick(x, y)) return;          // 購買/放置模式優先
    // 夜空區：點紀念星看是哪個孩子
    if (y < C.SKY_H - 2) {
      const star = Render.starAt(W, x, y);
      if (star) { openStarCard(star); return; }
    }
    // 找最近的在世個體
    let best = null, bd = 12;
    for (const cr of W.creatures) {
      if (cr.stage === 'star') continue;
      const d = Math.hypot(cr.x - x, cr.y - (y + 5));   // sprite 錨點在腳底，中心略上移
      if (d < bd) { bd = d; best = cr; }
    }
    if (best) {
      if (openCardFor === best.id) pet(best);   // 卡片開著再點本體 = 摸摸
      else openCard(best);
      return;
    }
    closeCard();
    if (handleDecorPickup(x, y)) return;        // 點裝飾 → 撿起搬家
    // 點地面 → 放果實 + 引導走過來（純演出）
    // 自然限制：地上果實數最多＝目前會吃的孩子數（一人一顆）、吃飽的孩子沒興趣
    if (y > C.SKY_H + 4) {
      const eaters = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star').length;
      if (Render.fruits.filter(f => !f.eaten).length >= eaters) return;
      Render.addFruit(x, y);
      const now = performance.now();
      W.creatures
        .filter(c => c.stage !== 'egg' && c.stage !== 'star' && !isFull(c, now))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
        .slice(0, 3)
        .forEach(c => {
          // 正在扛堅果的話標記中斷：讓 tryGather 的 interval 下一輪自行收工掉落，這裡不動它的搬運狀態
          const carrying = Render.nuts.find(n => n.state === 'carried' && n.carrierId === c.id);
          if (carrying) carrying.interrupted = true;
          // 皮克敏式衝刺：看到果實用比散步快得多的速度小跑過去
          const d = Math.hypot(c.x - x, c.y - y) || 1;
          const spd = C.RUSH_SPEED * c.genes.speed;
          c.action = 'walk'; c.actionUntil = W.tick + Math.ceil(d / spd) + 4;
          c.vx = (x - c.x) / d * spd;
          c.vy = (y - c.y) / d * spd;
        });
    }
  }

  // 飽足感：吃過果實 3 分鐘內對新果實沒興趣（ui 端狀態，重整歸零無妨）
  const FULL_MS = 3 * 60 * 1000;
  const fullUntil = new Map();   // creature id -> ms
  const isFull = (c, now) => (fullUntil.get(c.id) || 0) > now;

  // 果實被吃掉的判定（純演出）
  setInterval(() => {
    if (!W) return;
    const now = performance.now();
    for (const f of Render.fruits) {
      if (f.eaten) continue;
      const eater = W.creatures.find(c => c.stage !== 'egg' && c.stage !== 'star' &&
        !isFull(c, now) && Math.hypot(c.x - f.x, c.y - f.y) < 10);   // 衝刺步幅大，判定放寬防跳過
      if (eater) {
        f.eaten = true;
        fullUntil.set(eater.id, now + FULL_MS);
        Render.heartsAt(f.x, f.y - 6);   // 吃到的小開心
      }
    }
  }, 500);

  /* ---------- 族譜 ---------- */

  let tileTimers = [];   // 商店示意動畫的計時器，關面板時清掉
  function closePanel() {
    const p = document.querySelector('.panel');
    if (p) p.remove();
    tileTimers.forEach(clearInterval);
    tileTimers = [];
  }

  // 卡片式面板：深遮罩（點空白處關閉）＋置中亮卡片＋身份錨點表頭
  function sheetPanel(id, bigIcon, statsHtml) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    if (id) panel.id = id;
    panel.onclick = e => { if (e.target === panel) closePanel(); };
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const head = document.createElement('div');
    head.className = 'sheet-head';
    head.innerHTML = `<span class="big">${bigIcon}</span>${statsHtml}`;
    const close = document.createElement('button');
    close.className = 'close'; close.textContent = '✕';
    close.onclick = closePanel;
    head.appendChild(close);
    sheet.appendChild(head);
    panel.appendChild(sheet);
    return { panel, sheet };
  }

  // 兩幀循環示意動畫（商店的 🍎／🧵 用圖說話）
  function spriteOfGenes(genes) {
    const r = Genetics.rasterize(genes, 'adult');
    const cv = document.createElement('canvas');
    cv.width = r.w; cv.height = r.h;
    cv.getContext('2d').putImageData(new ImageData(r.pixels, r.w, r.h), 0, 0);
    return cv;
  }
  function makeAnimTile(frames, ms = 700) {
    const cv = document.createElement('canvas');
    cv.width = 56; cv.height = 40;
    const c2 = cv.getContext('2d');
    c2.imageSmoothingEnabled = false;
    let f = 0;
    const draw = () => { c2.clearRect(0, 0, 56, 40); frames[f % frames.length](c2); f++; };
    draw();
    tileTimers.push(setInterval(draw, ms));
    return cv;
  }

  function openTree(focusId = null) {
    closePanel(); closeCard();
    const all = everyone();
    const aliveN = W.creatures.length, starN = W.archive.length;
    const { panel, sheet } = sheetPanel('treePanel', '🌳',
      `<span class="stat dim">🐾 ${aliveN}</span><span class="stat dim">⭐ ${starN}</span>`);
    const maxGen = Math.max(...all.map(c => c.gen));
    const nodeEls = new Map();
    for (let g = 0; g <= maxGen; g++) {
      const row = document.createElement('div');
      row.className = 'gen-row';
      const chip = document.createElement('div');
      chip.className = 'gen-chip';
      chip.textContent = g === 0 ? '👑' : g;   // 世代籤：祖代皇冠、其後數字
      row.appendChild(chip);
      all.filter(c => c.gen === g).forEach(cr => {
        const nd = document.createElement('div');
        nd.className = 'node'; nd.dataset.id = cr.id;
        nd.appendChild(portrait(cr, 2));
        const nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = cr.name;
        nd.appendChild(nm);
        if (cr.starTick && cr.stage === 'star' || cr.starIdx !== undefined && cr.starIdx !== null && !W.creatures.includes(cr)) {
          const b = document.createElement('div'); b.className = 'badge'; b.textContent = '⭐';
          nd.appendChild(b);
        }
        if (cr.gen === 0) {
          const cw = document.createElement('div'); cw.className = 'crown'; cw.textContent = '👑';
          nd.appendChild(cw);
        }
        nd.onclick = ev => { ev.stopPropagation(); highlight(cr, nodeEls, panel); };
        row.appendChild(nd);
        nodeEls.set(cr.id, nd);
      });
      sheet.appendChild(row);
      if (g < maxGen) {
        const sep = document.createElement('div'); sep.className = 'gen-sep';
        sheet.appendChild(sep);
      }
    }
    $('uiLayer').appendChild(panel);
    if (focusId && nodeEls.has(focusId)) {
      const cr = findAny(focusId);
      highlight(cr, nodeEls, panel);
      nodeEls.get(focusId).scrollIntoView({ block: 'center' });
    }
  }

  function highlight(cr, nodeEls, panel) {
    nodeEls.forEach(el => el.className = 'node');
    const mark = (id, cls) => { const el = nodeEls.get(id); if (el) el.classList.add(cls); };
    mark(cr.id, 'hl-self');
    (cr.parents || []).forEach(id => mark(id, 'hl-parent'));
    if (cr.partnerId != null) mark(cr.partnerId, 'hl-mate');
    everyone().filter(c => c.parents && c.parents.includes(cr.id))
      .forEach(c => mark(c.id, 'hl-child'));
    drawTreeLines(cr, nodeEls, panel);
  }

  function drawTreeLines(cr, nodeEls, panel) {
    let svg = panel.querySelector('#treeLines');
    if (svg) svg.remove();
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'treeLines';
    svg.style.position = 'absolute';
    svg.style.left = '0'; svg.style.top = '0';
    svg.style.width = panel.scrollWidth + 'px';
    svg.style.height = panel.scrollHeight + 'px';
    const pr = panel.getBoundingClientRect();
    const center = el => {
      const r = el.getBoundingClientRect();
      return { x: r.left - pr.left + r.width / 2 + panel.scrollLeft,
               y: r.top - pr.top + r.height / 2 + panel.scrollTop };
    };
    const me = nodeEls.get(cr.id);
    if (!me) return;
    const from = center(me);
    const link = (id, color) => {
      const el = nodeEls.get(id);
      if (!el) return;
      const to = center(el);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', from.x); ln.setAttribute('y1', from.y);
      ln.setAttribute('x2', to.x);   ln.setAttribute('y2', to.y);
      ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', '2');
      ln.setAttribute('stroke-dasharray', '4 3'); ln.setAttribute('opacity', '.7');
      svg.appendChild(ln);
    };
    (cr.parents || []).forEach(id => link(id, '#7ec8e3'));
    if (cr.partnerId != null) link(cr.partnerId, '#ff8fab');
    everyone().filter(c => c.parents && c.parents.includes(cr.id))
      .forEach(c => link(c.id, '#a5d6a7'));
    panel.appendChild(svg);
  }

  /* ---------- 星空特寫 ---------- */

  function openStars() {
    closePanel(); closeCard();
    const { panel, sheet } = sheetPanel(null, '⭐',
      `<span class="stat dim">${W.archive.length}</span>`);
    const row = document.createElement('div');
    row.className = 'gen-row';
    if (W.archive.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#889;font-size:40px;margin:30px auto;';
      empty.textContent = '🌌';
      row.appendChild(empty);
    }
    W.archive.forEach(cr => {
      const nd = document.createElement('div');
      nd.className = 'node';
      nd.appendChild(portrait({ ...cr, stage: 'adult' }, 2));
      const nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = cr.name;
      nd.appendChild(nm);
      const b = document.createElement('div'); b.className = 'badge'; b.textContent = '⭐';
      nd.appendChild(b);
      nd.onclick = () => { closePanel(); openTree(cr.id); };
      row.appendChild(nd);
    });
    sheet.appendChild(row);
    $('uiLayer').appendChild(panel);
  }

  /* ---------- 離線摘要卡 ---------- */

  UI.showSummary = function (world, summary) {
    W = world;
    const card = document.createElement('div');
    card.id = 'summaryCard';
    const section = (tag, list, stage, mode) => {
      if (!list || !list.length) return;
      const row = document.createElement('div');
      row.className = 'row';
      const t = document.createElement('div'); t.className = 'tag'; t.textContent = tag;
      row.appendChild(t);
      list.slice(0, 8).forEach(cr => {
        if (mode === 'reveal') {
          // 揭曉前後對比：小圓點 → 成形
          const pair = document.createElement('span');
          pair.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
          pair.appendChild(portrait({ ...cr, stage: 'child' }, 3));
          const arrow = document.createElement('span');
          arrow.textContent = '→'; arrow.style.cssText = 'color:#9ab;font-size:16px;';
          pair.appendChild(arrow);
          pair.appendChild(portrait({ ...cr, stage: 'adult' }, 3));
          row.appendChild(pair);
        } else if (mode === 'ascend') {
          const wrap = document.createElement('span');
          wrap.className = 'ascend';
          wrap.appendChild(portrait({ ...cr, stage }, 3));
          row.appendChild(wrap);
        } else {
          row.appendChild(portrait({ ...cr, stage }, 3));
        }
      });
      if (list.length > 8) {
        const more = document.createElement('div');
        more.style.cssText = 'color:#889;font-size:18px;';
        more.textContent = '…';
        row.appendChild(more);
      }
      card.appendChild(row);
    };
    section('🐣', summary.born, 'child');
    section('🌼', summary.matured, 'adult', 'reveal');
    section('⭐', summary.starred, 'adult', 'ascend');
    if (summary.hearts > 0) {
      const h = document.createElement('div');
      h.className = 'hearts'; h.textContent = `❤ +${summary.hearts}`;
      card.appendChild(h);
    }
    if (!card.children.length) return;   // 離線期間無事發生就不打擾
    card.onclick = () => card.remove();
    document.body.appendChild(card);
  };

  /* ---------- 商店與購買流（第二階段） ---------- */

  // 模式狀態機：null | extend-pick | match-pick1 | match-pick2:<firstId> | place:<kind> | move:<index>
  let mode = null;
  let modeArg = null;

  function showBanner(html) {
    hideBanner();
    const b = document.createElement('div');
    b.id = 'modeBanner';
    b.innerHTML = `<span>${html}</span>`;
    const x = document.createElement('button');
    x.className = 'cancel'; x.textContent = '✕';
    x.onclick = () => setMode(null);
    b.appendChild(x);
    document.body.appendChild(b);
  }
  function hideBanner() { document.getElementById('modeBanner')?.remove(); }
  function removeConfirmBub() { document.getElementById('confirmBub')?.remove(); }

  function setMode(m, arg = null) {
    mode = m; modeArg = arg;
    removeConfirmBub();
    Render.setGhost(null);
    if (!m) { Render.setHighlight([]); hideBanner(); return; }
    // 模式狀態可見化：頂部膠囊說明「現在要點什麼」＋隨時可按 ✕ 取消
    if (m === 'extend-pick') {
      Render.setHighlight(W.creatures.filter(c => c.stage !== 'egg').map(c => c.id), '#a5d6a7', true);
      showBanner('🍎 👆');
    } else if (m === 'match-pick1' || m === 'match-pick2') {
      const eligible = W.creatures.filter(c =>
        (c.stage === 'adult' || c.stage === 'elder') && c.partnerId == null).map(c => c.id);
      Render.setHighlight(eligible, '#ff8fab', true);   // pick2 時已選者保留光圈不被壓暗
      showBanner(m === 'match-pick1' ? '🧵 👆 ①' : '🧵 👆 ②');
    } else if (m.startsWith('place:')) {
      Render.setHighlight([]);
      showBanner('🛍️ 👇');
    } else if (m.startsWith('move:')) {
      Render.setHighlight([]);
      showBanner('✋ 👇');
      // 移除鈕（買過的裝飾之後可 0 愛心購回——商店就是倉庫）
      if (typeof Sim.removeDecor === 'function') {
        const banner = document.getElementById('modeBanner');
        const bin = document.createElement('button');
        bin.className = 'cancel'; bin.textContent = '🗑️';
        bin.onclick = ev => {
          ev.stopPropagation();
          Sim.removeDecor(W, +m.slice(5));
          if (Sim.save) { Sim.save(W); if (window.Bottles?.hasMeta?.()) Bottles.touchSaved(); }
          setMode(null);
        };
        banner.insertBefore(bin, banner.lastChild);
      }
    } else {
      Render.setHighlight([]);
      hideBanner();
    }
  }

  // 幽靈預覽：放置/搬家模式中，裝飾半透明跟著游標走
  function onPointerMove(e) {
    if (!mode) return;
    let kind = null;
    if (mode.startsWith('place:')) kind = mode.slice(6);
    else if (mode.startsWith('move:')) kind = W.decor?.[+mode.slice(5)]?.kind;
    if (!kind) return;
    const { x, y } = Render.toWorld(e.clientX, e.clientY);
    if (y > C.SKY_H + 4) Render.setGhost({ kind, x, y });
    else Render.setGhost(null);
  }

  function extendPriceOf(cr) {
    return C.SHOP.extend.base * C.SHOP.extend.factor ** (cr.lifeBuys || 0);
  }

  // 延壽確認氣泡：出現在小動物頭上，按了才真的扣款
  function showConfirmBub(cr) {
    removeConfirmBub();
    const price = extendPriceOf(cr);
    const b = document.createElement('button');
    b.id = 'confirmBub';
    b.textContent = `🍎 ✓ ❤${price}`;
    const cv = document.getElementById('world');
    const r = cv.getBoundingClientRect();
    b.style.left = (r.left + cr.x / C.WORLD_W * r.width) + 'px';
    b.style.top = (r.top + (cr.y - 20) / C.WORLD_H * r.height) + 'px';
    b.onclick = ev => {
      ev.stopPropagation();
      const res = Sim.extendLife(W, cr.id);
      if (res.ok) {
        Render.heartsAt(cr.x, cr.y - 8); sfx.mature(); spend(res.price);
        Render.invalidateSprite(cr.id);   // 回春時 elder 快取要重畫
      } else { confusedMark(cr.x, cr.y); }
      setMode(null);
    };
    document.body.appendChild(b);
  }

  function confusedMark(x, y) {   // 不成立的操作：位置上冒 ❓
    const el = document.createElement('div');
    el.className = 'float-heart'; el.textContent = '❓'; el.style.color = '#aab';
    const cv = document.getElementById('world');
    const r = cv.getBoundingClientRect();
    el.style.left = (r.left + x / C.WORLD_W * r.width) + 'px';
    el.style.top = (r.top + (y - 14) / C.WORLD_H * r.height) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function spend(price) {
    updateHearts();
    floatHeart(window.innerWidth - 90, 40, '-' + price);
    if (Sim.save) Sim.save(W);
  }

  function openShop() {
    closePanel(); closeCard(); setMode(null);
    // 表頭直接放愛心餘額：逛街時預算就在視線起點
    const { panel, sheet } = sheetPanel('shopPanel', '🛍️',
      `<span class="stat">❤ ${W.hearts}</span>`);

    const mkItem = (iconEl, price, enabled, onBuy) => {
      const nd = document.createElement('div');
      nd.className = 'node shop-item' + (enabled ? '' : ' cant');
      if (typeof iconEl === 'string') nd.innerHTML = iconEl;
      else nd.appendChild(iconEl);
      const nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = `❤${price}`;
      nd.appendChild(nm);
      if (enabled) nd.onclick = ev => { ev.stopPropagation(); onBuy(); };
      return nd;
    };

    // 功能列：用兩幀示意動畫自我說明——🍎=生命條變長、🧵=紅線牽起
    const row1 = document.createElement('div');
    row1.className = 'gen-row';
    const spA = spriteOfGenes(Genetics.founderGenes(0));
    const spB = spriteOfGenes(Genetics.founderGenes(2));
    const extendTile = makeAnimTile([
      c => { c.drawImage(spA, 4, 2, 24, 24); c.fillStyle = '#d9577e'; c.fillRect(6, 32, 14, 4); },
      c => { c.drawImage(spA, 4, 2, 24, 24); c.fillStyle = '#6bcb77'; c.fillRect(6, 32, 44, 4);
             c.font = '13px sans-serif'; c.fillText('🍎', 34, 20); },
    ]);
    const matchTile = makeAnimTile([
      c => { c.drawImage(spA, 2, 10, 22, 22); c.drawImage(spB, 32, 10, 22, 22); },
      c => { c.drawImage(spA, 2, 10, 22, 22); c.drawImage(spB, 32, 10, 22, 22);
             c.strokeStyle = '#ff5d7e'; c.lineWidth = 2;
             c.beginPath(); c.moveTo(22, 21); c.quadraticCurveTo(28, 15, 34, 21); c.stroke();
             c.font = '12px sans-serif'; c.fillText('❤', 22, 11); },
    ]);
    row1.appendChild(mkItem(extendTile, C.SHOP.extend.base + '+',
      W.hearts >= C.SHOP.extend.base,
      () => { closePanel(); setMode('extend-pick'); }));
    row1.appendChild(mkItem(matchTile, C.SHOP.match,
      W.hearts >= C.SHOP.match &&
      W.creatures.filter(c => (c.stage === 'adult' || c.stage === 'elder') && c.partnerId == null).length >= 2,
      () => { closePanel(); setMode('match-pick1'); }));
    sheet.appendChild(row1);

    const sep = document.createElement('div');
    sep.className = 'gen-sep';
    sheet.appendChild(sep);

    // 裝飾列（縮圖所見即所得）
    const row2 = document.createElement('div');
    row2.className = 'gen-row';
    for (const [kind, basePrice] of Object.entries(C.SHOP.decor)) {
      const placed = kind === 'pond' && (W.decor || []).some(d => d.kind === 'pond');
      // 買過的裝飾 0 愛心購回（移除後不心疼；池塘一次性除外）
      const rebuy = kind !== 'pond' && (W.ownedDecor || []).includes(kind);
      const price = rebuy ? 0 : basePrice;
      let icon;
      if (kind === 'pond') icon = '<div style="font-size:30px;">🌊</div>';
      else {
        const sp = Render.decorThumb(kind);
        icon = document.createElement('canvas');
        icon.width = sp.width * 3; icon.height = sp.height * 3;
        const c2 = icon.getContext('2d'); c2.imageSmoothingEnabled = false;
        c2.drawImage(sp, 0, 0, icon.width, icon.height);
      }
      row2.appendChild(mkItem(icon, price, !placed && W.hearts >= price,
        () => { closePanel(); setMode('place:' + kind); }));
    }
    sheet.appendChild(row2);
    $('uiLayer').appendChild(panel);
  }

  // 模式下的世界點擊；回傳 true = 已處理
  function handleModeClick(x, y) {
    if (!mode) return false;
    const hit = (() => {
      let best = null, bd = 12;
      for (const cr of W.creatures) {
        if (cr.stage === 'star') continue;
        const d = Math.hypot(cr.x - x, cr.y - (y + 5));
        if (d < bd) { bd = d; best = cr; }
      }
      return best;
    })();

    if (mode === 'extend-pick') {
      // 兩段式：先點人出確認氣泡（✓＋價格），再點氣泡才扣款；點其他地方取消
      if (document.getElementById('confirmBub')) { setMode(null); return true; }
      if (!hit || hit.stage === 'egg') { setMode(null); return true; }
      Render.setHighlight([hit.id], '#a5d6a7', true);
      showConfirmBub(hit);
      return true;
    }

    if (mode === 'match-pick1') {
      if (hit && (hit.stage === 'adult' || hit.stage === 'elder') && hit.partnerId == null) {
        setMode('match-pick2', hit.id);
      } else if (hit) { confusedMark(hit.x, hit.y); }
      else setMode(null);
      return true;
    }
    if (mode === 'match-pick2') {
      if (!hit) { setMode(null); return true; }
      if (hit.id === modeArg) { confusedMark(hit.x, hit.y); return true; }
      const first = W.creatures.find(c => c.id === modeArg);
      const res = Sim.matchmake(W, modeArg, hit.id);
      if (res.ok) {
        Render.onEvents(W, [{ type: 'family', ids: [modeArg, hit.id] }]);
        if (first) Render.heartsAt((first.x + hit.x) / 2, (first.y + hit.y) / 2 - 6);
        sfx.born(); spend(C.SHOP.match);
      } else { confusedMark(hit.x, hit.y); }
      setMode(null);
      return true;
    }

    if (mode && mode.startsWith('place:')) {
      if (y <= C.SKY_H + 4) { setMode(null); return true; }
      const kind = mode.slice(6);
      const res = Sim.buyDecor(W, kind, x, y);
      if (res.ok) { sfx.drop?.(); spend(C.SHOP.decor[kind]); }
      setMode(null);
      return true;
    }

    if (mode && mode.startsWith('move:')) {
      if (y > C.SKY_H + 4) {
        Sim.moveDecor(W, +mode.slice(5), x, y);
        if (Sim.save) Sim.save(W);
      }
      setMode(null);
      return true;
    }
    return false;
  }

  // 點到裝飾 → 撿起搬家；回傳 true = 已處理
  function handleDecorPickup(x, y) {
    const list = W.decor || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.kind === 'pond') continue;
      if (Math.hypot(d.x - x, d.y - 6 - y) < 9) { setMode('move:' + i); return true; }
    }
    return false;
  }

  /* ---------- 療癒事件排程器（在場限定 +2❤） ---------- */

  function scheduleAmbient() {
    const delayMs = (20 + Math.random() * 20) * 60 * 1000 / Math.max(1, C.TIME_SCALE);
    setTimeout(() => { fireAmbient(); scheduleAmbient(); }, delayMs);
  }

  function fireAmbient() {
    if (!W || document.hidden) return;
    const night = Render.isNight(W);
    const pool = night
      ? ['meteor', 'firefly', 'gift', 'nap', 'petals', 'reflect']
      : ['butterfly', 'rainbow', 'gift', 'nap', 'petals', 'chase', 'reflect'];
    let kind = pool[Math.floor(Math.random() * pool.length)];
    if (kind === 'meteor' && Math.random() < 0.3) kind = 'shower';   // 30% 升級成流星雨
    if (kind === 'nap') {
      // 找一對已經靠近的孩子一起打盹；找不到就換蝴蝶/螢火蟲
      const alive = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star');
      let pair = null;
      for (let i = 0; i < alive.length && !pair; i++)
        for (let j = i + 1; j < alive.length; j++)
          if (Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y) < 16) { pair = [alive[i], alive[j]]; break; }
      if (pair) {
        pair.forEach(c => { c.action = 'sleep'; c.vx = 0; c.vy = 0;
          c.actionUntil = W.tick + 40 + Math.floor(Math.random() * 30); });
      } else kind = night ? 'firefly' : 'butterfly';
    }
    if (kind === 'chase') {
      // 追蝴蝶：蝴蝶低飛掠過，隨機一隻孩子開心地追著跑
      const handle = Render.playAmbient('chase', W);
      const alive = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star');
      const chaser = alive[Math.floor(Math.random() * alive.length)];
      if (chaser && handle) {
        const iv = setInterval(() => {
          const p = handle.getPos();
          if (p.done) { clearInterval(iv); return; }
          if (p.x > 4 && p.x < C.WORLD_W - 4) {
            const d = Math.hypot(chaser.x - p.x, chaser.y - p.y) || 1;
            chaser.action = 'walk';
            chaser.actionUntil = W.tick + 4;
            chaser.vx = (p.x - chaser.x) / d * C.WALK_SPEED_MAX * 0.9;
            chaser.vy = (p.y - chaser.y) / d * C.WALK_SPEED_MAX * 0.9;
          }
        }, 900);
      }
    } else if (kind !== 'nap') Render.playAmbient(kind, W);
    if (window.Audio2) Audio2.eventSound(kind);
    const gain = kind === 'shower' ? 5 : 2;   // 流星雨是難得的大場面
    W.hearts += gain;
    updateHearts();
    floatHeart(window.innerWidth - 90, 40, '+' + gain);
  }

  /* ---------- 事件反應 ---------- */

  UI.onEvents = function (world, events) {
    W = world;
    let delta = 0;
    for (const ev of events) {
      if (ev.type === 'born') { delta += C.HEART_BORN; sfx.born(); }
      else if (ev.type === 'family') { if (window.Audio2) Audio2.eventSound('family'); }
      else if (ev.type === 'matured') { delta += C.HEART_MATURE; sfx.mature(); }
      else if (ev.type === 'starred') {
        delta += C.HEART_STAR; sfx.star();
        if (openCardFor === ev.ids[0]) closeCard();
      }
    }
    if (delta > 0) floatHeart(window.innerWidth - 90, 40, '+' + delta);
    updateHearts();
  };

  /* ---------- 佈景互動：幼體盪鞦韆（純表現層，同追蝴蝶的引導手法） ---------- */

  const busyIds = new Set();   // 正在玩佈景的孩子（避免一隻同時軋三個劇本）

  // 夜間遊具減班：晚上一半機率直接休息，把幼體的檔期留給夜間限定的開關燈惡作劇
  // （全部遊具共用 busyIds，遊具全天候搶人會把夜戲餓死——實玩回饋）
  const nightRest = () => Render.isNight(W) && Math.random() < 0.5;

  let riding = null;   // 一次只有一隻在玩
  function tryPlaytime() {
    if (!W || document.hidden || riding || nightRest()) return;
    const swing = (W.decor || []).find(d => d.kind === 'swing');
    const kids = W.creatures.filter(c => c.stage === 'child' && !busyIds.has(c.id));
    if (!swing || !kids.length || Math.random() < 0.35) return;
    const kid = kids[Math.floor(Math.random() * kids.length)];
    riding = { id: kid.id, phase: 'walk', until: Date.now() + 30000 };   // 30 秒走不到就放棄
    busyIds.add(kid.id);
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === riding?.id);
      const sw = (W.decor || []).find(d => d.kind === 'swing');
      if (!c || !sw || c.stage !== 'child' || Date.now() > riding.until) {
        busyIds.delete(kid.id);
        riding = null; clearInterval(iv); return;                        // 鞦韆被收走/長大/超時 → 收工
      }
      if (riding.phase === 'walk') {
        const d = Math.hypot(c.x - sw.x, c.y - (sw.y - 2)) || 1;
        if (d < 5) {
          riding.phase = 'ride';
          riding.until = Date.now() + 14000 + Math.random() * 10000;     // 盪 14~24 秒
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (sw.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
          c.vy = (sw.y - 2 - c.y) / d * C.WALK_SPEED_MAX * 0.8;
        }
      } else {
        // 坐上座板，跟鞦韆 sprite 同一條 sin 同步微擺
        c.action = 'idle'; c.actionUntil = W.tick + 4;
        c.vx = 0; c.vy = 0;
        c.x = sw.x + Math.sin(performance.now() / 800) * 1.6;
        c.y = sw.y - 6;
      }
    }, 250);
  }
  function playtimeLoop() {
    setTimeout(() => { tryPlaytime(); playtimeLoop(); }, 20000 + Math.random() * 30000);
  }

  /* ---------- 皮小孩開關燈（夜間限定惡作劇，玩完落跑） ---------- */

  let pranking = false;
  function tryPrank() {
    if (!W || document.hidden || pranking || !Render.isNight(W)) return;
    const lantern = (W.decor || []).find(d => d.kind === 'lantern');
    const kids = W.creatures.filter(c => c.stage === 'child' && !busyIds.has(c.id));
    if (!lantern || !kids.length || Math.random() < 0.25) return;
    const kid = kids[Math.floor(Math.random() * kids.length)];
    pranking = true;
    busyIds.add(kid.id);
    // walkUntil（集合超時）／flickUntil（按燈計時）分開存放：共用一個 until 時，
    // 外層 generic guard 會搶在 flick phase 的「提前 100ms 心虛落跑」判斷之前攔截，
    // interval 250ms 粒度下常常直接跨過那 100ms 窗口，落跑動畫永遠演不到（同 cradle/bunk 前例）
    const state = { phase: 'walk', walkUntil: Date.now() + 25000, flickUntil: null };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === kid.id);
      const lt = (W.decor || []).find(d => d.kind === 'lantern');
      // walkUntil 只管 walk 階段；flick 階段交給下面的 flickUntil 判斷
      if (!c || !lt || c.stage !== 'child' || (state.phase === 'walk' && Date.now() > state.walkUntil)) {
        pranking = false; busyIds.delete(kid.id); clearInterval(iv);
        Render.setLanternPrank(null);
        return;
      }
      const tx = lt.x + 7, ty = lt.y;               // 站在燈旁邊
      if (state.phase === 'walk') {
        const d = Math.hypot(c.x - tx, c.y - ty) || 1;
        if (d < 4) {
          state.phase = 'flick';
          state.flickUntil = Date.now() + 3800 + Math.random() * 1700;   // 狂按 3.8~5.5 秒
          Render.setLanternPrank({ x: lt.x, y: lt.y, until: state.flickUntil });
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (tx - c.x) / d * C.WALK_SPEED_MAX * 0.9;
          c.vy = (ty - c.y) / d * C.WALK_SPEED_MAX * 0.9;
        }
      } else {
        // 按開關中：站定微晃（跟閃爍同節奏的小抖動）
        c.action = 'idle'; c.actionUntil = W.tick + 4;
        c.vx = 0; c.vy = 0;
        c.x = tx + (Math.floor(performance.now() / 280) % 2 ? 0.8 : -0.8);
        if (Date.now() > state.flickUntil - 100) {
          // 玩夠了：心虛落跑！
          const ang = Math.random() * Math.PI * 2;
          c.action = 'walk'; c.actionUntil = W.tick + 6;
          c.vx = Math.cos(ang) * C.RUSH_SPEED * 0.8;
          c.vy = Math.abs(Math.sin(ang)) * C.RUSH_SPEED * 0.8 * (c.y > (C.SKY_H + C.WORLD_H) / 2 ? -1 : 1);
          pranking = false; busyIds.delete(kid.id); clearInterval(iv);
          Render.setLanternPrank(null);
        }
      }
    }, 250);
  }
  function prankLoop() {
    setTimeout(() => { tryPrank(); prankLoop(); }, 30000 + Math.random() * 40000);
  }

  /* ---------- 白天池塘潑水仗（兩隻在池邊互潑，佈景互動三部曲之三） ---------- */

  let splashing = false;
  function trySplash() {
    if (!W || document.hidden || splashing || !Render.isDay(W)) return;
    const free = W.creatures.filter(c =>
      c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    if (free.length < 2 || Math.random() < 0.35) return;
    const pick = free.sort(() => Math.random() - 0.5).slice(0, 2);
    const [a, b] = pick;
    const px = C.WORLD_W * 0.79, py = C.WORLD_H * 0.8;
    const rx = (W.decor || []).some(d => d.kind === 'pond') ? 40 : 26;
    const spotA = { x: px - rx - 3, y: py - 3 };    // 池塘左緣兩個位置，面對面
    const spotB = { x: px - rx + 11, y: py + 4 };
    splashing = true; busyIds.add(a.id); busyIds.add(b.id);
    const st = { phase: 'walk', until: Date.now() + 30000 };
    const iv = setInterval(() => {
      const ca = W.creatures.find(x => x.id === a.id);
      const cb = W.creatures.find(x => x.id === b.id);
      if (!ca || !cb || Date.now() > st.until) {
        splashing = false; busyIds.delete(a.id); busyIds.delete(b.id);
        Render.setSplash(null); clearInterval(iv); return;
      }
      if (st.phase === 'walk') {
        let both = true;
        [[ca, spotA], [cb, spotB]].forEach(([c, s]) => {
          const d = Math.hypot(c.x - s.x, c.y - s.y) || 1;
          if (d >= 4) {
            both = false;
            c.action = 'walk'; c.actionUntil = W.tick + 4;
            c.vx = (s.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
            c.vy = (s.y - c.y) / d * C.WALK_SPEED_MAX * 0.8;
          } else {
            // 先到的站定等玩伴（同翹翹板：放著不管會被 sim 拉去亂晃）
            c.action = 'idle'; c.actionUntil = W.tick + 4;
            c.vx = 0; c.vy = 0;
          }
        });
        if (both) {
          st.phase = 'splash';
          st.until = Date.now() + 8000 + Math.random() * 5000;   // 潑 8~13 秒
          Render.setSplash({ ax: spotA.x, ay: spotA.y, bx: spotB.x, by: spotB.y, until: st.until });
        }
      } else {
        // 互潑中：兩隻在原地小晃（相位錯開＝你來我往）
        [[ca, spotA, 0], [cb, spotB, 1]].forEach(([c, s, ph]) => {
          c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
          c.x = s.x + (Math.floor(performance.now() / 320 + ph) % 2 ? 0.9 : -0.9);
          c.y = s.y;
        });
      }
    }, 250);
  }
  function splashLoop() {
    setTimeout(() => { trySplash(); splashLoop(); }, 50000 + Math.random() * 60000);
  }

  /* ---------- 過橋散步（誰都能走：晃到橋頭、慢慢走過去，另一端下橋） ---------- */

  let crossing = false;
  function tryCross() {
    if (!W || document.hidden || crossing) return;
    const bridge = (W.decor || []).find(d => d.kind === 'bridge');
    const free = W.creatures.filter(c =>
      c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    if (!bridge || !free.length || Math.random() < 0.4) return;
    const c0 = free[Math.floor(Math.random() * free.length)];
    // 橋的半寬跟 render 同一條式子（池塘直徑＋搭岸 12px 的一半），起點在橋頭、終點過橋再走一小段
    const half = (((W.decor || []).some(d => d.kind === 'pond') ? 40 : 26) * 2 + 12) / 2;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const from = { x: bridge.x - dir * (half - 2), y: bridge.y + 1 };
    const to = { x: bridge.x + dir * (half + 6), y: bridge.y + 2 };
    crossing = true; busyIds.add(c0.id);
    const st = { phase: 'walk', until: Date.now() + 30000 };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === c0.id);
      const br = (W.decor || []).find(d => d.kind === 'bridge');
      if (!c || !br || Date.now() > st.until) {
        crossing = false; busyIds.delete(c0.id); clearInterval(iv); return;   // 橋被收走/超時 → 收工
      }
      const target = st.phase === 'walk' ? from : to;
      const d = Math.hypot(c.x - target.x, c.y - target.y) || 1;
      if (d < 4) {
        if (st.phase === 'walk') {
          st.phase = 'cross'; st.until = Date.now() + 20000;
        } else {
          crossing = false; busyIds.delete(c0.id); clearInterval(iv); return; // 過完橋，散步結束
        }
      } else if (st.phase === 'cross') {
        // 橋上：水平慢走，y 直接貼橋面拱線（跟 bridgeSprite 同一條 sin），走出「上橋翻過拱頂」
        c.action = 'walk'; c.actionUntil = W.tick + 4;
        c.vx = (target.x > c.x ? 1 : -1) * C.WALK_SPEED_MAX * 0.55;
        c.vy = 0;
        const arch = ((W.decor || []).some(dd => dd.kind === 'pond') ? 10 : 7);
        const t = Math.min(1, Math.max(0, (c.x - (br.x - half)) / (half * 2)));
        c.y = br.y - 1 - arch * Math.sin(Math.PI * t);
      } else {
        c.action = 'walk'; c.actionUntil = W.tick + 4;
        c.vx = (target.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
        c.vy = (target.y - c.y) / d * C.WALK_SPEED_MAX * 0.8;
      }
    }, 250);
  }
  function crossLoop() {
    setTimeout(() => { tryCross(); crossLoop(); }, 35000 + Math.random() * 55000);
  }

  /* ---------- 溜滑梯（幼體限定：爬梯上平台、咻一聲滑下來，玩上癮會再排隊） ---------- */

  let sliding = null;
  function trySlide() {
    if (!W || document.hidden || sliding || nightRest()) return;
    const slide = (W.decor || []).find(d => d.kind === 'slide');
    const kids = W.creatures.filter(c => c.stage === 'child' && !busyIds.has(c.id));
    if (!slide || !kids.length || Math.random() < 0.3) return;
    const kid = kids[Math.floor(Math.random() * kids.length)];
    sliding = { id: kid.id };
    busyIds.add(kid.id);
    // 座標對齊 render.js 的 slide sprite（26×20 加外框置中畫在 d.y 上緣）
    const pos = d => ({
      base: { x: d.x + 10, y: d.y + 1 },     // 梯腳
      top: { x: d.x + 10, y: d.y - 16 },     // 梯頂
      rampTop: { x: d.x + 3, y: d.y - 15 },  // 平台滑道口
      rampBot: { x: d.x - 13, y: d.y + 1 },  // 滑道底
    });
    const st = { phase: 'walk', p: 0, rounds: 1 + Math.floor(Math.random() * 2), until: Date.now() + 45000 };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === kid.id);
      const sl = (W.decor || []).find(d => d.kind === 'slide');
      if (!c || !sl || c.stage !== 'child' || Date.now() > st.until) {
        sliding = null; busyIds.delete(kid.id); clearInterval(iv); return;   // 滑梯被收走/長大/超時
      }
      const P = pos(sl);
      if (st.phase === 'walk') {
        const d = Math.hypot(c.x - P.base.x, c.y - P.base.y) || 1;
        if (d < 4) { st.phase = 'climb'; st.p = 0; }
        else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (P.base.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
          c.vy = (P.base.y - c.y) / d * C.WALK_SPEED_MAX * 0.8;
        }
      } else if (st.phase === 'climb') {
        // 手腳並用往上爬（等速），到頂後挪到滑道口
        c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        st.p = Math.min(1, st.p + 250 / 1750);
        c.x = P.base.x; c.y = P.base.y + (P.top.y - P.base.y) * st.p;
        if (st.p >= 1) { st.phase = 'whee'; st.p = 0; }
      } else if (st.phase === 'whee') {
        // 咻——加速滑落（p^1.7 模擬重力），到底彈一小下
        c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        st.p = Math.min(1, st.p + 250 / 1000);
        const e = Math.pow(st.p, 1.7);
        c.x = P.rampTop.x + (P.rampBot.x - P.rampTop.x) * e;
        c.y = P.rampTop.y + (P.rampBot.y - P.rampTop.y) * e;
        if (st.p >= 1) {
          c.y -= 2;                                  // 落地小彈跳
          if (--st.rounds > 0) st.phase = 'walk';    // 太好玩了，再來一次！
          else { sliding = null; busyIds.delete(kid.id); clearInterval(iv); }
        }
      }
    }, 250);
  }
  function slideLoop() {
    setTimeout(() => { trySlide(); slideLoop(); }, 25000 + Math.random() * 40000);
  }

  /* ---------- 翹翹板（兩隻對坐，跟板子同一條 sin 一上一下） ---------- */

  let seesawing = false;
  function trySeesaw() {
    if (!W || document.hidden || seesawing || nightRest()) return;
    const seesaw = (W.decor || []).find(d => d.kind === 'seesaw');
    // 幼體優先湊對，不夠就大小同樂（親子蹺蹺板）
    const free = W.creatures.filter(c =>
      c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    const kids = shuffle(free.filter(c => c.stage === 'child'));
    const pair = [...kids, ...shuffle(free.filter(c => c.stage !== 'child'))].slice(0, 2);
    if (!seesaw || pair.length < 2 || Math.random() < 0.35) return;
    let [a, b] = pair;
    // 座位按遠近分配（總路程最短），避免兩隻交叉走位互撞
    const dxL = x => Math.hypot(x.x - (seesaw.x - 11), x.y - (seesaw.y - 2));
    const dxR = x => Math.hypot(x.x - (seesaw.x + 11), x.y - (seesaw.y - 2));
    if (dxL(a) + dxR(b) > dxR(a) + dxL(b)) [a, b] = [b, a];   // a 坐左、b 坐右
    seesawing = true; busyIds.add(a.id); busyIds.add(b.id);
    const st = { phase: 'walk', until: Date.now() + 40000 };   // 兩隻可能從地圖兩端來，給足集合時間
    const iv = setInterval(() => {
      const ca = W.creatures.find(x => x.id === a.id);
      const cb = W.creatures.find(x => x.id === b.id);
      const ss = (W.decor || []).find(d => d.kind === 'seesaw');
      if (!ca || !cb || !ss || Date.now() > st.until) {
        seesawing = false; busyIds.delete(a.id); busyIds.delete(b.id); clearInterval(iv);
        Render.setSeesawMotion(null);   // 人走了，板子停下來
        return;
      }
      const seatL = { x: ss.x - 11, y: ss.y - 2 };
      const seatR = { x: ss.x + 11, y: ss.y - 2 };
      if (st.phase === 'walk') {
        let both = true;
        [[ca, seatL], [cb, seatR]].forEach(([c, s]) => {
          const d = Math.hypot(c.x - s.x, c.y - s.y) || 1;
          if (d >= 4) {
            both = false;
            c.action = 'walk'; c.actionUntil = W.tick + 4;
            c.vx = (s.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
            c.vy = (s.y - c.y) / d * C.WALK_SPEED_MAX * 0.8;
          } else {
            // 先到的站定等玩伴——不給指令的話 sim 會讓它亂晃，
            // 晃出去又被拉回來，看起來像在座位前來回碰撞（實玩回饋）
            c.action = 'idle'; c.actionUntil = W.tick + 4;
            c.vx = 0; c.vy = 0;
          }
        });
        if (both) {
          st.until = Date.now() + 14000 + Math.random() * 8000;   // 蹺 14~22 秒
          st.phase = 'ride';
          Render.setSeesawMotion({ mode: 'ride' });               // 兩隻都坐好了，開始蹺
        }
      } else {
        // 相位源與 seesawSprite 同一條 tMs/700 → 人板同步，一上一下
        const tilt = Math.sin(performance.now() / 700) * 3;
        [[ca, seatL, +1], [cb, seatR, -1]].forEach(([c, s, dir]) => {
          c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
          c.x = s.x;
          c.y = ss.y - 8 + tilt * dir;
        });
      }
    }, 250);
  }
  function seesawLoop() {
    setTimeout(() => { trySeesaw(); seesawLoop(); }, 30000 + Math.random() * 40000);
  }

  /* ---------- 苔蘚沙發（大人的家具：伴侶依偎，或 elder 獨坐看天空） ---------- */

  let lounging = null;
  function trySofa() {
    if (!W || document.hidden || lounging || nightRest()) return;
    const sofa = (W.decor || []).find(d => d.kind === 'sofa');
    const free = W.creatures.filter(c =>
      (c.stage === 'adult' || c.stage === 'elder') && !busyIds.has(c.id));
    if (!sofa || !free.length || Math.random() < 0.35) return;
    const main = free[Math.floor(Math.random() * free.length)];
    let partner = null;
    if (main.partnerId != null) {
      const p = W.creatures.find(c => c.id === main.partnerId);
      if (p && !busyIds.has(p.id)) partner = p;
    }
    lounging = { mainId: main.id, partnerId: partner ? partner.id : null,
      phase: 'walk', until: Date.now() + 30000 };
    busyIds.add(main.id);
    if (partner) busyIds.add(partner.id);
    const iv = setInterval(() => {
      const cm = W.creatures.find(x => x.id === lounging?.mainId);
      const cp = lounging?.partnerId != null ? W.creatures.find(x => x.id === lounging.partnerId) : null;
      const sf = (W.decor || []).find(d => d.kind === 'sofa');
      const needsPartner = lounging.partnerId != null;
      if (!cm || !sf || (needsPartner && !cp) || Date.now() > lounging.until) {
        busyIds.delete(lounging.mainId);
        if (lounging.partnerId != null) busyIds.delete(lounging.partnerId);
        lounging = null; clearInterval(iv); return;   // 家具被收走/伴侶消失/超時 → 收工
      }
      // 每輪用當下家具座標重算座位，家具被搬動時跟著走（同 seesaw/splash 風格）。
      // 雙人座：x 間距拉到 8px（依偎收 1px 後回到 6px，跟單人時同寬，不會比原設計更擠）；
      // 加 y 前後交錯（±1px）讓繪製順序穩定、疊圖時兩隻的輪廓都露得出來，不靠 sort tie-break 碰運氣
      // ——較寬的形狀基因兩隻幾乎完全疊在一起、看起來像合體不像依偎
      const seatMx = sf.x + (cp ? -4 : 0), seatPx = sf.x + 4;
      const seatMy = sf.y - 7 + (cp ? 1 : 0), seatPy = sf.y - 7 - 1;
      if (lounging.phase === 'walk') {
        const dm = Math.hypot(cm.x - seatMx, cm.y - seatMy) || 1;
        const mArrived = dm < 4;
        if (!mArrived) {
          cm.action = 'walk'; cm.actionUntil = W.tick + 4;
          cm.vx = (seatMx - cm.x) / dm * C.WALK_SPEED_MAX * 0.8;
          cm.vy = (seatMy - cm.y) / dm * C.WALK_SPEED_MAX * 0.8;
        } else {
          cm.action = 'idle'; cm.actionUntil = W.tick + 4; cm.vx = 0; cm.vy = 0;
        }
        let pArrived = true;
        if (cp) {
          const dp = Math.hypot(cp.x - seatPx, cp.y - seatPy) || 1;
          pArrived = dp < 4;
          if (!pArrived) {
            cp.action = 'walk'; cp.actionUntil = W.tick + 4;
            cp.vx = (seatPx - cp.x) / dp * C.WALK_SPEED_MAX * 0.8;
            cp.vy = (seatPy - cp.y) / dp * C.WALK_SPEED_MAX * 0.8;
          } else {
            cp.action = 'idle'; cp.actionUntil = W.tick + 4; cp.vx = 0; cp.vy = 0;
          }
        }
        if (mArrived && pArrived) {
          lounging.phase = 'sit';
          lounging.until = Date.now() + 20000 + Math.random() * 15000;   // 坐 20~35 秒
          cm.x = seatMx + (cp ? 1 : 0); cm.y = seatMy;   // 落座；有伴侶時各往中間偏 1px 依偎
          if (cp) {
            cp.x = seatPx - 1; cp.y = seatPy;
            Render.snuggleAt((cm.x + cp.x) / 2, seatMy - 6);
          } else if (cm.stage === 'elder') {
            cm.action = 'gaze';   // 搖椅分支：老人家獨坐看天空
          }
        }
      } else {
        // sit：坐滿 lounging.until 由外層 timeout 判斷收工，這裡只負責維持坐姿
        cm.actionUntil = W.tick + 4; cm.vx = 0; cm.vy = 0;
        cm.x = seatMx + (cp ? 1 : 0); cm.y = seatMy;
        if (cm.action !== 'gaze') cm.action = 'idle';
        if (cp) { cp.action = 'idle'; cp.actionUntil = W.tick + 4; cp.vx = 0; cp.vy = 0; cp.x = seatPx - 1; cp.y = seatPy; }
      }
    }, 250);
  }
  function sofaLoop() {
    setTimeout(() => { trySofa(); sofaLoop(); }, 40000 + Math.random() * 40000);
  }

  /* ---------- 貝殼上下舖（夜間限定：兩幼體搶上舖，或幼體＋親代同睡） ---------- */

  let bunking = null;
  function tryBunk() {
    if (!W || document.hidden || bunking || !Render.isNight(W)) return;
    const bunk = (W.decor || []).find(d => d.kind === 'bunk');
    if (!bunk) return;
    const kids = W.creatures.filter(c => c.stage === 'child' && !busyIds.has(c.id));
    let a = null, b = null, isFamily = false;
    if (kids.length >= 2) {
      const shuffled = kids.sort(() => Math.random() - 0.5);
      a = shuffled[0]; b = shuffled[1];
    } else if (kids.length === 1 && kids[0].parents) {
      const parent = kids[0].parents.map(pid => W.creatures.find(c => c.id === pid))
        .find(p => p && p.stage !== 'egg' && p.stage !== 'star' && !busyIds.has(p.id));
      if (parent) { a = kids[0]; b = parent; isFamily = true; }
    }
    if (!a || !b || Math.random() < 0.3) return;
    busyIds.add(a.id); busyIds.add(b.id);
    // walkDeadline（集合／爬梯階段）／sleepUntil（睡眠時長）分開，理由同 cradle：
    // 共用一個 until 會被外層 timeout 搶先攔截，睡醒跳下床的收尾永遠走不到
    bunking = {
      aId: a.id, bId: b.id, isFamily, upperId: isFamily ? a.id : null,
      phase: 'raceToBed', climbP: 0, walkDeadline: Date.now() + 45000, sleepUntil: null,
    };
    const iv = setInterval(() => {
      const ca = W.creatures.find(x => x.id === bunking?.aId);
      const cb = W.creatures.find(x => x.id === bunking?.bId);
      const bk = (W.decor || []).find(d => d.kind === 'bunk');
      // 幼體中途長大也要散場：親子模式只有 a 是幼體，兩幼體模式 a/b 都要維持 child
      const kidStillChild = ca && (bunking.isFamily ? ca.stage === 'child' : ca.stage === 'child' && cb && cb.stage === 'child');
      if (!ca || !cb || !bk || !kidStillChild) {
        busyIds.delete(bunking.aId); busyIds.delete(bunking.bId);
        bunking = null; clearInterval(iv); return;   // 床被收走/角色消失/幼體長大 → 立即收工
      }
      if (bunking.phase !== 'sleep' && Date.now() > bunking.walkDeadline) {
        busyIds.delete(bunking.aId); busyIds.delete(bunking.bId);
        bunking = null; clearInterval(iv); return;   // 集合／爬梯階段超時 → 收工
      }
      // 每輪用當下家具座標重算，家具被搬動時跟著走（同 seesaw/splash 風格）
      // 上下舖座標對齊 render.js 的 bunk sprite（見該處註解：y 底部錨點間距抓 23px、x 因加寬床身變寬 4px 而右移對齊梯柱新位置）
      const foot = { x: bk.x + 9, y: bk.y - 1 };
      const top = { x: bk.x + 9, y: bk.y - 27 };
      const upperPillow = { x: bk.x - 5.5, y: bk.y - 30.5 };
      const lowerPillow = { x: bk.x - 5.5, y: bk.y - 7.5 };
      const go = (c, tx, ty) => {
        const d = Math.hypot(c.x - tx, c.y - ty) || 1;
        if (d < 4) { c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0; return true; }
        c.action = 'walk'; c.actionUntil = W.tick + 4;
        c.vx = (tx - c.x) / d * C.WALK_SPEED_MAX * 0.8;
        c.vy = (ty - c.y) / d * C.WALK_SPEED_MAX * 0.8;
        return false;
      };
      if (bunking.phase === 'raceToBed') {
        if (bunking.isFamily) {
          // 親子組合：親代不搶，直接走下舖；幼體走梯腳
          const aAt = go(ca, foot.x, foot.y);
          const bAt = go(cb, lowerPillow.x, lowerPillow.y);
          if (aAt && bAt) bunking.phase = 'climb';
        } else {
          // 兩幼體：誰先跑到梯腳誰贏上舖，不用寫輸贏邏輯，自然湧現
          const aAt = go(ca, foot.x, foot.y);
          const bAt = go(cb, foot.x, foot.y);
          if (aAt || bAt) {
            bunking.upperId = aAt ? ca.id : cb.id;
            bunking.phase = 'settle';
            bunking.until2 = Date.now() + 500;   // 後到者愣半拍
          }
        }
      } else if (bunking.phase === 'settle') {
        const winC = bunking.upperId === ca.id ? ca : cb;
        const losC = bunking.upperId === ca.id ? cb : ca;
        winC.action = 'idle'; winC.actionUntil = W.tick + 4; winC.vx = 0; winC.vy = 0;
        losC.action = 'idle'; losC.actionUntil = W.tick + 4; losC.vx = 0; losC.vy = 0;
        if (Date.now() > bunking.until2) bunking.phase = 'climb';
      } else if (bunking.phase === 'climb') {
        const climber = bunking.upperId === ca.id ? ca : cb;
        const other = bunking.upperId === ca.id ? cb : ca;
        bunking.climbP = Math.min(1, bunking.climbP + 250 / 5500);   // 爬梯距離拉長(8→26px)，時長等比例拉長維持等速感
        climber.action = 'idle'; climber.actionUntil = W.tick + 4; climber.vx = 0; climber.vy = 0;
        climber.x = foot.x; climber.y = foot.y + (top.y - foot.y) * bunking.climbP;
        const otherAt = go(other, lowerPillow.x, lowerPillow.y);
        if (bunking.climbP >= 1 && otherAt) {
          climber.x = upperPillow.x; climber.y = upperPillow.y; climber.action = 'sleep'; climber.actionUntil = W.tick + 4;
          other.x = lowerPillow.x; other.y = lowerPillow.y; other.action = 'sleep'; other.actionUntil = W.tick + 4;
          bunking.phase = 'sleep';
          bunking.sleepUntil = Date.now() + 40000 + Math.random() * 40000;   // 睡 40~80 秒
        }
      } else {
        // sleep：持續鎖枕位避免被 sim 拉走
        const upperC = bunking.upperId === ca.id ? ca : cb;
        const lowerC = bunking.upperId === ca.id ? cb : ca;
        upperC.action = 'sleep'; upperC.actionUntil = W.tick + 4; upperC.vx = 0; upperC.vy = 0;
        upperC.x = upperPillow.x; upperC.y = upperPillow.y;
        lowerC.action = 'sleep'; lowerC.actionUntil = W.tick + 4; lowerC.vx = 0; lowerC.vy = 0;
        lowerC.x = lowerPillow.x; lowerC.y = lowerPillow.y;
        if (Date.now() > bunking.sleepUntil) {
          upperC.x = foot.x; upperC.y = foot.y - 2;   // 醒來：上舖的跳下床，落地小彈跳（同滑梯到底手法）
          busyIds.delete(bunking.aId); busyIds.delete(bunking.bId);
          bunking = null; clearInterval(iv);
        }
      }
    }, 250);
  }
  function bunkLoop() {
    setTimeout(() => { tryBunk(); bunkLoop(); }, 60000 + Math.random() * 60000);
  }

  /* ---------- 球咪搖籃（幼體限定，親代加分戲：哄睡後躡手躡腳離開） ---------- */

  const CRADLE_SWAY_PERIOD = 1200;   // ms，需與 render.js 的 CRADLE_PERIOD 同值才會同相位
  let cradling = null;
  function tryCradle() {
    if (!W || document.hidden || cradling || nightRest()) return;
    const cradle = (W.decor || []).find(d => d.kind === 'cradle');
    const kids = W.creatures.filter(c => c.stage === 'child' && !busyIds.has(c.id));
    if (!cradle || !kids.length || Math.random() < 0.3) return;
    const kid = kids[Math.floor(Math.random() * kids.length)];
    let parent = null;
    if (kid.parents) {
      parent = kid.parents.map(pid => W.creatures.find(c => c.id === pid))
        .find(p => p && p.stage !== 'egg' && p.stage !== 'star' && !busyIds.has(p.id));
    }
    busyIds.add(kid.id);
    if (parent) busyIds.add(parent.id);
    // walkDeadline／sleepUntil 分開：兩者都塞進同一個 until 欄位會被外層 timeout 判斷搶先攔截，
    // 導致 sleep phase 自然結束時走不到下面的 breeze 衰減，永遠只會撞到這裡的異常保底
    cradling = { kidId: kid.id, parentId: parent ? parent.id : null,
      phase: 'walk', walkDeadline: Date.now() + 30000, sleepUntil: null, leaveAt: null };
    const iv = setInterval(() => {
      const ck = W.creatures.find(x => x.id === cradling?.kidId);
      const cp = cradling?.parentId != null ? W.creatures.find(x => x.id === cradling.parentId) : null;
      const cr = (W.decor || []).find(d => d.kind === 'cradle');
      if (!ck || ck.stage !== 'child' || !cr || (cradling.parentId != null && !cp)) {
        busyIds.delete(cradling.kidId);
        if (cradling.parentId != null) busyIds.delete(cradling.parentId);
        Render.setCradleMotion(null);
        cradling = null; clearInterval(iv); return;   // 搖籃被收走/角色消失/幼體長大 → 立即收工
      }
      // 每輪用當下家具座標重算，家具被搬動時跟著走（同 seesaw/splash 風格）
      const kidSpot = { x: cr.x, y: cr.y - 5 };
      const parentSpot = { x: cr.x + 6, y: cr.y - 2 };
      if (cradling.phase === 'walk') {
        if (Date.now() > cradling.walkDeadline) {
          busyIds.delete(cradling.kidId);
          if (cradling.parentId != null) busyIds.delete(cradling.parentId);
          Render.setCradleMotion(null);
          cradling = null; clearInterval(iv); return;   // 集合超時 → 收工
        }
        const d = Math.hypot(ck.x - kidSpot.x, ck.y - kidSpot.y) || 1;
        const kidAt = d < 4;
        if (!kidAt) {
          ck.action = 'walk'; ck.actionUntil = W.tick + 4;
          ck.vx = (kidSpot.x - ck.x) / d * C.WALK_SPEED_MAX * 0.8;
          ck.vy = (kidSpot.y - ck.y) / d * C.WALK_SPEED_MAX * 0.8;
        } else {
          ck.action = 'idle'; ck.actionUntil = W.tick + 4; ck.vx = 0; ck.vy = 0;
        }
        let parentAt = true;
        if (cp) {
          const dp = Math.hypot(cp.x - parentSpot.x, cp.y - parentSpot.y) || 1;
          parentAt = dp < 4;
          if (!parentAt) {
            cp.action = 'walk'; cp.actionUntil = W.tick + 4;
            cp.vx = (parentSpot.x - cp.x) / dp * C.WALK_SPEED_MAX * 0.8;
            cp.vy = (parentSpot.y - cp.y) / dp * C.WALK_SPEED_MAX * 0.8;
          } else {
            cp.action = 'idle'; cp.actionUntil = W.tick + 4; cp.vx = 0; cp.vy = 0;
          }
        }
        if (kidAt && parentAt) {
          cradling.phase = 'sleep';
          cradling.sleepUntil = Date.now() + 30000 + Math.random() * 30000;   // 睡 30~60 秒
          cradling.leaveAt = cp ? Date.now() + 10000 : null;                  // 親代在場：睡著後 10 秒離開
          Render.setCradleMotion({ mode: 'rock' });
        }
      } else {
        // sleep：幼體 x 與籃身同相位（跟 render.js cradleSway 共用同一條 performance.now() 式子）
        ck.action = 'sleep'; ck.actionUntil = W.tick + 4; ck.vx = 0; ck.vy = 0;
        const sway = Math.sin(performance.now() / CRADLE_SWAY_PERIOD * Math.PI * 2) * 1.5;
        ck.x = kidSpot.x + sway; ck.y = kidSpot.y;
        if (cp) {
          if (cradling.leaveAt && Date.now() > cradling.leaveAt) {
            // 躡手躡腳離開：給個隨機方向的慢速度（0.4 倍走速），之後放給 sim 接管
            const ang = Math.random() * Math.PI * 2;
            cp.action = 'walk'; cp.actionUntil = W.tick + 20;
            cp.vx = Math.cos(ang) * C.WALK_SPEED_MAX * 0.4;
            cp.vy = Math.sin(ang) * C.WALK_SPEED_MAX * 0.4;
            busyIds.delete(cradling.parentId);
            cradling.parentId = null;
          } else {
            // 站定輕推：同開關燈「站定微晃」手法，晃動相位與搖籃同步（幅度略小）
            cp.action = 'idle'; cp.actionUntil = W.tick + 4; cp.vx = 0; cp.vy = 0;
            cp.x = parentSpot.x + sway * 0.6; cp.y = parentSpot.y;
          }
        }
        if (Date.now() > cradling.sleepUntil) {
          // 散場：搖動衰減停止（複用風吹的 breeze 衰減式），不是瞬間 null 掉
          const now = performance.now();
          Render.setCradleMotion({ mode: 'breeze', start: now, until: now + 2200 });
          busyIds.delete(cradling.kidId);
          if (cradling.parentId != null) busyIds.delete(cradling.parentId);
          cradling = null; clearInterval(iv);
        }
      }
    }, 250);
  }
  function cradleLoop() {
    setTimeout(() => { tryCradle(); cradleLoop(); }, 45000 + Math.random() * 45000);
  }

  // 無人使用時偶爾一陣風，把搖籃輕輕搖幾下
  function cradleBreezeLoop() {
    setTimeout(() => {
      if (W && !document.hidden && !cradling && (W.decor || []).some(d => d.kind === 'cradle')) {
        const now = performance.now();
        Render.setCradleMotion({ mode: 'breeze', start: now, until: now + 2200 });
      }
      cradleBreezeLoop();
    }, 45000 + Math.random() * 65000);
  }

  /* ---------- 篝火（夜間限定：全遊戲第一個群聚事件＋火星許願） ---------- */

  // 座位：內側兩位較近火、外側兩位再往外＋往前站，圍出弧形；
  // decor 一律畫在小動物身後（Render.draw 順序），生物離火太近會把整團火焰完全蓋住，
  // 兩隻生物間距不夠則會疊成一坨看不出輪廓——兩者疊加就是「像相撲」的成因。
  // x 用最大體型（size 1.15、半徑約 9px）反推：內側兩位中心距拉到 18px 剛好不重疊；
  // y 內側從 3 加大到 8，讓生物退開到篝火火焰視覺主體之外，露出跳動的火苗當視覺焦點；
  // 外側再往外＋往前多站一點（y 比內側多 5px），前後層次錯落，不會跟內側同一水平線完全疊住
  function fireSeatsFor(n) {
    const L2 = { x: -18, y: 13 }, L1 = { x: -9, y: 8 }, R1 = { x: 9, y: 8 }, R2 = { x: 18, y: 13 };
    if (n === 2) return [L1, R1];
    if (n === 3) return Math.random() < 0.5 ? [L2, L1, R1] : [L1, R1, R2];
    return [L2, L1, R1, R2];
  }

  let campfiring = null;
  function tryCampfire() {
    if (!W || document.hidden || campfiring || !Render.isNight(W)) return;
    const fire = (W.decor || []).find(d => d.kind === 'campfire');
    const free = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    if (!fire || free.length < 2 || Math.random() < 0.4) return;
    const n = Math.min(free.length, 2 + Math.floor(Math.random() * 3));   // 2~4 隻
    const shuffled = free.sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, n);
    const elderInFree = free.find(c => c.stage === 'elder');   // 有 elder 時保底入選一名（許願主角）
    if (elderInFree && !picks.includes(elderInFree)) picks[picks.length - 1] = elderInFree;
    picks.forEach(c => busyIds.add(c.id));
    campfiring = {
      ids: picks.map(c => c.id), seats: fireSeatsFor(picks.length),
      phase: 'walk', until: Date.now() + 45000,   // 集合超時 45 秒
      partyUntil: null, wishAt: null, wished: false, wishGazeId: null, wishGazeUntil: 0,
    };
    const iv = setInterval(() => {
      const cs = campfiring.ids.map(id => W.creatures.find(x => x.id === id));
      const fr = (W.decor || []).find(d => d.kind === 'campfire');
      const alive = cs.filter(Boolean);
      if (!fr || alive.length < 2) {
        campfiring.ids.forEach(id => busyIds.delete(id));
        Render.setCampfireParty(false);
        campfiring = null; clearInterval(iv); return;   // 篝火被收走/湊不到 2 隻 → 收工
      }
      // 座位目標點 clamp 到世界邊界內（同 sim.js stepMovement 的 margin=6）：篝火放在地圖邊緣時
      // 外側座位 x±18 可能超界，生物朝界外走會被邊界反彈卡住、永遠到不了、45 秒超時才解散
      const seatXY = i => ({
        x: Math.max(6, Math.min(C.WORLD_W - 6, fr.x + campfiring.seats[i].x)),
        y: Math.max(C.SKY_H + 6, Math.min(C.WORLD_H - 6, fr.y + campfiring.seats[i].y)),
      });
      if (campfiring.phase === 'walk') {
        if (Date.now() > campfiring.until) {
          // 集合超時：到場的有幾隻就演幾隻，還沒到的放棄；不夠 2 隻才整場解散。
          // 用座位距離判定到場，不要用 action==='idle'——那個上一輪才更新，deadline 當輪判斷會有時間差誤判
          const arrived = [];
          cs.forEach((c, i) => {
            if (!c) return;
            const { x: tx, y: ty } = seatXY(i);
            if (Math.hypot(c.x - tx, c.y - ty) < 4) arrived.push(i);
          });
          if (arrived.length < 2) {
            campfiring.ids.forEach(id => busyIds.delete(id));
            campfiring = null; clearInterval(iv); return;
          }
          // 一律照原始 ids 索引釋放未到場者，不要看 c 是否存在——角色化星消失時 c 會是 undefined，
          // 用 c.id 判斷會漏放，留下永久卡住 busyIds 的殭屍 id
          campfiring.ids.forEach((id, i) => { if (!arrived.includes(i)) busyIds.delete(id); });
          campfiring.ids = arrived.map(i => campfiring.ids[i]);
          campfiring.seats = arrived.map(i => campfiring.seats[i]);
          campfiring.phase = 'party';
          campfiring.partyUntil = Date.now() + 25000 + Math.random() * 15000;
          campfiring.wishAt = Date.now() + (campfiring.partyUntil - Date.now()) * 0.4;
          Render.setCampfireParty(true);
          return;
        }
        let allArrived = true;
        cs.forEach((c, i) => {
          if (!c) return;
          const { x: tx, y: ty } = seatXY(i);
          const d = Math.hypot(c.x - tx, c.y - ty) || 1;
          if (d >= 4) {
            allArrived = false;
            c.action = 'walk'; c.actionUntil = W.tick + 4;
            c.vx = (tx - c.x) / d * C.WALK_SPEED_MAX * 0.8;
            c.vy = (ty - c.y) / d * C.WALK_SPEED_MAX * 0.8;
          } else {
            c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
          }
        });
        if (allArrived) {
          campfiring.phase = 'party';
          campfiring.partyUntil = Date.now() + 25000 + Math.random() * 15000;   // 晚會 25~40 秒
          campfiring.wishAt = Date.now() + (campfiring.partyUntil - Date.now()) * 0.4;   // 中段許願
          Render.setCampfireParty(true);
        }
      } else {
        if (Date.now() > campfiring.partyUntil) {
          campfiring.ids.forEach(id => busyIds.delete(id));
          Render.setCampfireParty(false);
          campfiring = null; clearInterval(iv); return;
        }
        // party：晚會中段觸發一次火星許願（elder 優先抬頭 gaze）
        if (!campfiring.wished && Date.now() > campfiring.wishAt) {
          campfiring.wished = true;
          const elder = cs.find(c => c && c.stage === 'elder') || cs.find(Boolean);
          if (elder) {
            campfiring.wishGazeId = elder.id;
            campfiring.wishGazeUntil = Date.now() + 4000;
            Render.playAmbient('wish', W);
          }
        }
        // 微晃取暖，相位錯開（同潑水仗「你來我往」手法）；許願中的那隻維持 gaze 不晃動
        cs.forEach((c, i) => {
          if (!c) return;
          const { x: tx, y: ty } = seatXY(i);
          c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
          if (c.id === campfiring.wishGazeId && Date.now() < campfiring.wishGazeUntil) {
            c.action = 'gaze'; c.x = tx; c.y = ty;
          } else {
            c.action = 'idle';
            c.x = tx + (Math.floor(performance.now() / 340 + i) % 2 ? 0.7 : -0.7);
            c.y = ty;
          }
        });
      }
    }, 250);
  }
  function campfireLoop() {
    setTimeout(() => { tryCampfire(); campfireLoop(); }, 90000 + Math.random() * 60000);
  }

  /* ---------- 堅果搬運（花叢／採集點，兩者互相獨立，單買都有戲） ---------- */

  // 花叢生成：場上有花叢即啟用，跟採集點無關；同時上限（含頭頂與掉落）2 顆、槽滿 3 顆停產
  function nutGrowLoop() {
    setTimeout(() => {
      if (W && !document.hidden) {
        const bush = (W.decor || []).find(d => d.kind === 'flower');
        const activeNuts = Render.nuts.filter(n => n.state !== 'stored').length;
        if (bush && Render.nutStock() < 3 && activeNuts < 2) Render.addNut(bush.x, bush.y - 6);
      }
      nutGrowLoop();
    }, 60000 + Math.random() * 30000);
  }

  // 只有採集點模式：玩家餵食掉在地上的食物，有機會被撿去搬進採集點存放
  function tryAdoptFruit() {
    if (!W || document.hidden) return;
    const spot = (W.decor || []).find(d => d.kind === 'gathering');
    const hasBush = (W.decor || []).some(d => d.kind === 'flower');
    if (!spot || hasBush || Render.nutStock() >= 3) return;   // 限定「只有採集點、沒有花叢」單置模式
    if (Render.nuts.filter(n => n.state !== 'stored').length >= 2) return;
    const fruit = Render.fruits.find(f => !f.eaten && performance.now() - f.born > 3000);
    if (!fruit || Math.random() < 0.5) return;
    fruit.eaten = true;   // 從既有 fruits 系統除名，改由堅果搬運系統接手，避免雙重處理
    Render.addNut(fruit.x, fruit.y);
  }
  function adoptFruitLoop() {
    setTimeout(() => { tryAdoptFruit(); adoptFruitLoop(); }, 6000 + Math.random() * 8000);
  }

  // 摘取＋後續動線：有採集點就搬去存放；沒有就當場吃掉，或頂去送給伴侶／孩子吃
  function tryGather() {
    if (!W || document.hidden) return;
    const nut = Render.nuts.find(n => n.state === 'bush' && !n.locked);
    if (!nut) return;
    const free = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    if (!free.length) return;
    const picker = free.sort((a, b) =>
      Math.hypot(a.x - nut.x, a.y - nut.y) - Math.hypot(b.x - nut.x, b.y - nut.y))[0];
    busyIds.add(picker.id);
    nut.locked = true;
    const slow = picker.stage === 'child' ? 0.6 : 1;   // 幼體也能搬，速度略慢
    // deadline（整段流程 40 秒總超時，全程不變）／phaseUntil（selfEat、gifted 這種短暫收尾階段各自的截止時間）
    // 分開存放，避免像 cradle/bunk 那樣共用一個欄位被短計時覆寫、語意混在一起
    const st = { phase: 'toNut', deadline: Date.now() + 40000, phaseUntil: null, giftTo: null };
    const cleanup = () => {
      busyIds.delete(picker.id);
      if (st.giftTo != null) busyIds.delete(st.giftTo);
    };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === picker.id);
      if (!c || Date.now() > st.deadline || nut.interrupted) {
        if (nut.state === 'bush') nut.locked = false;              // 還沒摘到手，放回去讓別人摘
        else if (nut.state === 'carried') Render.dropNut(nut, c ? c.x : nut.x, c ? c.y : nut.y);  // 扛著中途被打斷/出事，掉在腳邊
        cleanup(); clearInterval(iv); return;
      }
      if (st.phase === 'toNut') {
        const d = Math.hypot(c.x - nut.x, c.y - nut.y) || 1;
        if (d < 4) {
          nut.state = 'carried'; nut.carrierId = picker.id;
          const spot = (W.decor || []).find(d2 => d2.kind === 'gathering');
          if (spot) {
            st.phase = 'toSpot';
          } else {
            // 沒有採集點：決定直接吃掉，或頂去送給伴侶／孩子吃
            const candidates = [];
            if (picker.partnerId != null) {
              const p = W.creatures.find(x => x.id === picker.partnerId);
              if (p && p.stage !== 'egg' && p.stage !== 'star' && !busyIds.has(p.id)) candidates.push(p);
            }
            W.creatures.forEach(x => {
              if (x.stage === 'child' && x.parents && x.parents.includes(picker.id) && !busyIds.has(x.id)) candidates.push(x);
            });
            if (candidates.length && Math.random() < 0.6) {
              const target = candidates[Math.floor(Math.random() * candidates.length)];
              busyIds.add(target.id);
              st.phase = 'toGift'; st.giftTo = target.id;
            } else {
              st.phase = 'selfEat'; st.phaseUntil = Date.now() + 1800;
              Render.eatCarriedNut(nut, c);
            }
          }
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (nut.x - c.x) / d * C.WALK_SPEED_MAX * 0.8 * slow;
          c.vy = (nut.y - c.y) / d * C.WALK_SPEED_MAX * 0.8 * slow;
        }
      } else if (st.phase === 'toSpot') {
        const spot = (W.decor || []).find(d2 => d2.kind === 'gathering');
        if (!spot) {
          Render.dropNut(nut, c.x, c.y);
          cleanup(); clearInterval(iv); return;
        }
        const d = Math.hypot(c.x - spot.x, c.y - spot.y) || 1;
        if (d < 4) {
          // depositStart 獨立於 st.deadline（那是整段流程的 40 秒總超時，不能被這裡的 400ms 覆寫掉）
          st.phase = 'depositing'; st.depositStart = Date.now();
          c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (spot.x - c.x) / d * C.WALK_SPEED_MAX * 0.8 * slow;
          c.vy = (spot.y - c.y) / d * C.WALK_SPEED_MAX * 0.8 * slow;
        }
      } else if (st.phase === 'depositing') {
        // 投放前小跳一下：起跳→落地的拋物線停頓，再真的存入槽內
        const spot = (W.decor || []).find(d2 => d2.kind === 'gathering');
        if (!spot) { Render.dropNut(nut, c.x, c.y); cleanup(); clearInterval(iv); return; }
        c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        const p = Math.min(1, (Date.now() - st.depositStart) / 400);
        c.y = spot.y - Math.sin(p * Math.PI) * 2;
        if (p >= 1) {
          c.y = spot.y;
          Render.storeNut(nut, spot); cleanup(); clearInterval(iv);
        }
      } else if (st.phase === 'toGift') {
        const target = W.creatures.find(x => x.id === st.giftTo);
        if (!target) {
          busyIds.delete(st.giftTo); st.giftTo = null;
          st.phase = 'selfEat'; st.phaseUntil = Date.now() + 1800;
          Render.eatCarriedNut(nut, c);
          return;
        }
        target.action = 'idle'; target.actionUntil = W.tick + 4; target.vx = 0; target.vy = 0;   // 等待方站定
        const d = Math.hypot(c.x - target.x, c.y - target.y) || 1;
        if (d < 5) {
          st.phase = 'gifted'; st.phaseUntil = Date.now() + 1800;
          Render.eatCarriedNut(nut, target);
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (target.x - c.x) / d * C.WALK_SPEED_MAX * 0.8 * slow;
          c.vy = (target.y - c.y) / d * C.WALK_SPEED_MAX * 0.8 * slow;
        }
      } else {   // selfEat / gifted：吃掉的當下已觸發咀嚼特效，這裡只負責站定收工
        c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        if (Date.now() > st.phaseUntil) { cleanup(); clearInterval(iv); }
      }
    }, 250);
  }
  function gatherLoop() {
    setTimeout(() => { tryGather(); gatherLoop(); }, 8000 + Math.random() * 12000);
  }

  // 路過生物嘴饞：爬上樹樁啃掉槽內一顆堅果（純表現的點心，不影響 sim 飽食度）
  let eatingNut = false;
  function tryEatNut() {
    if (!W || document.hidden || eatingNut) return;
    const spot = (W.decor || []).find(d => d.kind === 'gathering');
    if (!spot || Render.nutStock() < 1) return;
    const free = W.creatures.filter(c => c.stage !== 'egg' && c.stage !== 'star' && !busyIds.has(c.id));
    if (!free.length || Math.random() < 0.4) return;
    const eater = free[Math.floor(Math.random() * free.length)];
    eatingNut = true; busyIds.add(eater.id);
    // deadline（走去的路上 30 秒超時）／chewUntil（咬下去後的 2.2 秒咀嚼計時）分開存放，
    // 兩者語意不同，共用一個欄位容易在未來加咀嚼專屬收尾動畫時踩雷（cradle/bunk 就是前車之鑑）
    const st = { phase: 'walk', deadline: Date.now() + 30000, chewUntil: null };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === eater.id);
      const sp = (W.decor || []).find(d => d.kind === 'gathering');
      // deadline 只管 walk 階段；chew 階段已經進場了，交給下面的 chewUntil 判斷，
      // 不然快超時才咬到堅果時，2.2 秒咀嚼動畫會被這裡提前打斷
      if (!c || !sp || (st.phase === 'walk' && Date.now() > st.deadline)) {
        eatingNut = false; busyIds.delete(eater.id); clearInterval(iv); return;
      }
      if (st.phase === 'walk') {
        // nutStock 只在還沒吃到的路上才有意義；chew 階段已經咬下去了，槽裡剩幾顆與這口無關
        if (Render.nutStock() < 1) {
          eatingNut = false; busyIds.delete(eater.id); clearInterval(iv); return;
        }
        const d = Math.hypot(c.x - sp.x, c.y - sp.y) || 1;
        if (d < 4) {
          st.phase = 'chew'; st.chewUntil = Date.now() + 2200;
          Render.eatStoredNut(c);   // 咬第一口就消失＋掉屑特效，比較像"正在吃"而非"啃了一半"
        } else {
          c.action = 'walk'; c.actionUntil = W.tick + 4;
          c.vx = (sp.x - c.x) / d * C.WALK_SPEED_MAX * 0.8;
          c.vy = (sp.y - c.y) / d * C.WALK_SPEED_MAX * 0.8;
        }
      } else {
        c.action = 'idle'; c.actionUntil = W.tick + 4; c.vx = 0; c.vy = 0;
        if (Date.now() > st.chewUntil) { eatingNut = false; busyIds.delete(eater.id); clearInterval(iv); }
      }
    }, 250);
  }
  function eatNutLoop() {
    setTimeout(() => { tryEatNut(); eatNutLoop(); }, 40000 + Math.random() * 50000);
  }

  // 偶爾一陣風，把沒人玩的翹翹板吹得晃幾下
  function breezeLoop() {
    setTimeout(() => {
      if (W && !document.hidden && !seesawing && (W.decor || []).some(d => d.kind === 'seesaw')) {
        const now = performance.now();
        Render.setSeesawMotion({ mode: 'breeze', start: now, until: now + 2600 });
      }
      breezeLoop();
    }, 45000 + Math.random() * 65000);
  }

  // 除錯把手：console 手動觸發佈景互動（仍受各自的前置條件與機率閘門約束）
  UI.debugPlay = { tryPlaytime, tryPrank, trySplash, tryCross, trySlide, trySeesaw,
    trySofa, tryBunk, tryCradle, tryCampfire, tryGather, tryEatNut, tryAdoptFruit,
    world: () => W, busy: () => [...busyIds] };

  /* ---------- 池塘跳魚（小驚喜，不進事件排程、無 ❤） ---------- */

  function fishLoop() {
    setTimeout(() => {
      if (W && !document.hidden && Math.random() < 0.7) Render.playAmbient('fish', W);
      fishLoop();
    }, 25000 + Math.random() * 45000);
  }

  /* ---------- 初始化 ---------- */

  UI.init = function (world) {
    W = world;
    updateHearts();
    document.getElementById('world').addEventListener('click', onCanvasClick);
    document.getElementById('world').addEventListener('pointermove', onPointerMove);
    $('btnTree').onclick = () => {
      document.querySelector('#treePanel') ? closePanel() : openTree();
    };
    $('btnStars').onclick = () => openStars();
    $('btnShop').onclick = () => {
      document.querySelector('#shopPanel') ? closePanel() : openShop();
    };
    // 音效與音樂分離開關（偏好記進 localStorage）
    let prefs = { sfx: true, music: true };
    try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem('terrarium_prefs') || '{}') } } catch (e) {}
    const savePrefs = () => { try { localStorage.setItem('terrarium_prefs', JSON.stringify(prefs)); } catch (e) {} };
    const applyAudioBtns = () => {
      soundOn = prefs.sfx;
      $('btnSound').textContent = prefs.sfx ? '🔊' : '🔇';
      $('btnSound').classList.toggle('off', !prefs.sfx);
      $('btnMusic').classList.toggle('off', !prefs.music);
      if (window.Audio2) { Audio2.setEnabled(prefs.sfx); Audio2.setMusic(prefs.music); }
    };
    applyAudioBtns();
    $('btnSound').onclick = () => { prefs.sfx = !prefs.sfx; savePrefs(); applyAudioBtns(); };
    $('btnMusic').onclick = () => { prefs.music = !prefs.music; savePrefs(); applyAudioBtns(); };
    // ⏩ 時間倍速（1/2/5/10 循環；?fast 除錯模式時隱藏）
    const SPEEDS = [1, 2, 5, 10];
    const speedLabel = v => v === 1 ? '▶' : `⏩${v}`;
    const applySpeed = () => {
      C.TIME_SCALE = prefs.speed || 1;
      $('btnSpeed').textContent = speedLabel(C.TIME_SCALE);
      $('btnSpeed').style.color = C.TIME_SCALE > 1 ? '#ffd54f' : '#dde';   // 加速中亮金色
    };
    if (C._FAST_DEBUG) {
      $('btnSpeed').style.display = 'none';
    } else {
      if (![1, 2, 5, 10].includes(prefs.speed)) prefs.speed = 1;
      applySpeed();
      // 展開直選選單（循環超過三項會逼人繞遠路）
      $('btnSpeed').onclick = ev => {
        ev.stopPropagation();
        const old = document.getElementById('speedMenu');
        if (old) { old.remove(); return; }
        const m = document.createElement('div');
        m.id = 'speedMenu';
        SPEEDS.forEach(v => {
          const b = document.createElement('button');
          b.className = 'speed-chip' + (v === (prefs.speed || 1) ? ' cur' : '');
          b.textContent = speedLabel(v);
          b.onclick = e2 => {
            e2.stopPropagation();
            prefs.speed = v; savePrefs(); applySpeed();
            m.remove();
          };
          m.appendChild(b);
        });
        document.body.appendChild(m);
        setTimeout(() => document.addEventListener('click', function away(e3) {
          if (!m.contains(e3.target)) m.remove();
          document.removeEventListener('click', away);
        }), 0);
      };
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { setMode(null); closePanel(); closeCard(); }
    });
    // 音訊開頁即啟動：autoplay 放行的環境直接出聲，
    // 被擋的環境由 Audio2 內部的「任何互動即解鎖」接手
    if (window.Audio2) Audio2.start(() => W && Render.isNight(W));
    scheduleAmbient();
    playtimeLoop();
    fishLoop();
    prankLoop();
    splashLoop();
    crossLoop();
    slideLoop();
    seesawLoop();
    breezeLoop();
    sofaLoop();
    bunkLoop();
    cradleLoop();
    cradleBreezeLoop();
    campfireLoop();
    nutGrowLoop();
    adoptFruitLoop();
    gatherLoop();
    eatNutLoop();
  };
})();

if (typeof window !== 'undefined') window.UI = UI;
