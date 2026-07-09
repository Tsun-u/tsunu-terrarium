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
    W.hearts += 2;
    updateHearts();
    floatHeart(window.innerWidth - 90, 40, '+2');
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

  let riding = null;   // 一次只有一隻在玩
  function tryPlaytime() {
    if (!W || document.hidden || riding) return;
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
    if (!lantern || !kids.length || Math.random() < 0.4) return;
    const kid = kids[Math.floor(Math.random() * kids.length)];
    pranking = true;
    busyIds.add(kid.id);
    const state = { phase: 'walk', until: Date.now() + 25000 };
    const iv = setInterval(() => {
      const c = W.creatures.find(x => x.id === kid.id);
      const lt = (W.decor || []).find(d => d.kind === 'lantern');
      if (!c || !lt || c.stage !== 'child' || Date.now() > state.until) {
        pranking = false; busyIds.delete(kid.id); clearInterval(iv);
        Render.setLanternPrank(null);
        return;
      }
      const tx = lt.x + 7, ty = lt.y;               // 站在燈旁邊
      if (state.phase === 'walk') {
        const d = Math.hypot(c.x - tx, c.y - ty) || 1;
        if (d < 4) {
          state.phase = 'flick';
          state.until = Date.now() + 3800 + Math.random() * 1700;   // 狂按 3.8~5.5 秒
          Render.setLanternPrank({ x: lt.x, y: lt.y, until: state.until });
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
        if (Date.now() > state.until - 100) {
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
    setTimeout(() => { tryPrank(); prankLoop(); }, 40000 + Math.random() * 50000);
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
    // 環境音在第一次手勢後啟動（瀏覽器 autoplay 政策）
    const startAudio = () => {
      if (window.Audio2) Audio2.start(() => W && Render.isNight(W));
      document.removeEventListener('pointerdown', startAudio);
    };
    document.addEventListener('pointerdown', startAudio);
    scheduleAmbient();
    playtimeLoop();
    fishLoop();
    prankLoop();
    splashLoop();
  };
})();

if (typeof window !== 'undefined') window.UI = UI;
