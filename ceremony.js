/* ceremony.js — 開瓶儀式：新瓶子誕生前，自訂八隻祖代的形狀與顏色。
   無文字方針：形狀按鈕＝形狀本身、色相條＝彩虹、🎲＝驚喜、🌱＝開始。
   突變形狀（星形/齒輪等）刻意不開放——那是繁衍路上的驚喜獎勵。 */

const Ceremony = {};

(() => {
  const style = document.createElement('style');
  style.textContent = `
  #ceremony {
    position: fixed; inset: 0; z-index: 120;
    background: linear-gradient(#141a2c, #1d2740);
    display: flex; flex-direction: column; align-items: center;
    overflow-y: auto; padding: 4vh 14px 20px;
  }
  #ceremony .sheet2 {
    background: rgba(34,42,64,.96); border: 1px solid rgba(255,255,255,.14);
    border-radius: 22px; padding: 18px 20px;
    box-shadow: 0 14px 44px rgba(0,0,0,.5);
    animation: cerIn .3s cubic-bezier(.34,1.3,.64,1);
  }
  @keyframes cerIn { from { transform: translateY(26px) scale(.96); opacity: 0; } }
  #ceremony .head2 {
    display: flex; align-items: center; gap: 12px; justify-content: center;
    font-size: 30px; margin-bottom: 14px;
  }
  #ceremony .slots {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  }
  @media (max-width: 720px) { #ceremony .slots { grid-template-columns: repeat(2, 1fr); } }
  #ceremony .slot {
    background: rgba(255,255,255,.09); border-radius: 14px;
    padding: 10px 8px 8px; text-align: center; width: 120px;
  }
  #ceremony .slot canvas { image-rendering: pixelated; }
  #ceremony .preview { height: 52px; display: flex; align-items: center; justify-content: center; }
  #ceremony .shapes { display: flex; gap: 4px; justify-content: center; margin: 6px 0; }
  #ceremony .shapes button {
    width: 24px; height: 24px; padding: 1px; border-radius: 7px; cursor: pointer;
    border: 2px solid transparent; background: rgba(255,255,255,.10);
  }
  #ceremony .shapes button.sel { border-color: #ffd54f; background: rgba(255,213,79,.18); }
  #ceremony .hue { cursor: pointer; border-radius: 5px; display: block; margin: 0 auto 6px; }
  #ceremony .dice {
    border: none; border-radius: 9px; background: rgba(255,255,255,.14);
    font-size: 15px; width: 32px; height: 26px; cursor: pointer;
  }
  #ceremony .actions {
    display: flex; gap: 14px; justify-content: center; margin-top: 16px;
  }
  #ceremony .actions button {
    border: none; border-radius: 16px; font-size: 24px; cursor: pointer;
    padding: 10px 30px; color: #fff; font-family: inherit;
    transition: transform .12s;
  }
  #ceremony .actions button:active { transform: scale(.94); }
  #ceremony #cerDiceAll { background: #4d6796; box-shadow: 0 5px 0 #33486e; }
  #ceremony #cerStart { background: #3f9e4d; box-shadow: 0 5px 0 #2c7337; font-size: 28px; padding: 10px 46px; }
  `;
  document.head.appendChild(style);

  Ceremony.show = function (onDone) {
    const anchors = [0, 1, 2, 3].map(i => Genetics.founderGenes(i).shape);
    // 每格狀態：形狀索引＋色相（彩度亮度鎖柔和值，怎麼選都不會刺眼）
    const slots = Array.from({ length: C.FOUNDER_COUNT }, (_, i) => ({
      shapeIdx: i % 4, h: (i * 45) % 360,
    }));

    const genesOf = s => ({
      shape: { ...anchors[s.shapeIdx] },
      color: { h: s.h, s: 0.7, l: 0.6 },
      size: 1, speed: 1, glow: false,
    });

    const root = document.createElement('div');
    root.id = 'ceremony';
    const sheet = document.createElement('div');
    sheet.className = 'sheet2';
    sheet.innerHTML = '<div class="head2">🫙✨</div>';
    const grid = document.createElement('div');
    grid.className = 'slots';

    // 形狀縮圖（中性灰藍，四格共用圖源）
    const shapeThumbs = anchors.map(sh => {
      const r = Genetics.rasterize({ shape: sh, color: { h: 215, s: 0.18, l: 0.72 },
        size: 1, speed: 1, glow: false }, 'adult');
      const cv = document.createElement('canvas');
      cv.width = r.w; cv.height = r.h;
      cv.getContext('2d').putImageData(new ImageData(r.pixels, r.w, r.h), 0, 0);
      return cv;
    });

    const redraws = [];
    slots.forEach((slot, idx) => {
      const cell = document.createElement('div');
      cell.className = 'slot';

      // 預覽
      const pvWrap = document.createElement('div');
      pvWrap.className = 'preview';
      const pv = document.createElement('canvas');
      pvWrap.appendChild(pv);
      cell.appendChild(pvWrap);

      // 四形狀
      const shapes = document.createElement('div');
      shapes.className = 'shapes';
      const shapeBtns = [];
      anchors.forEach((_, si) => {
        const b = document.createElement('button');
        const t = document.createElement('canvas');
        t.width = 18; t.height = 18;
        const c2 = t.getContext('2d');
        c2.imageSmoothingEnabled = false;
        c2.drawImage(shapeThumbs[si], 0, 0, 18, 18);
        b.appendChild(t);
        b.onclick = () => { slot.shapeIdx = si; redraw(); };
        shapeBtns.push(b);
        shapes.appendChild(b);
      });
      cell.appendChild(shapes);

      // 色相條
      const hue = document.createElement('canvas');
      hue.className = 'hue';
      hue.width = 96; hue.height = 12;
      const pick = e => {
        const r = hue.getBoundingClientRect();
        slot.h = Math.max(0, Math.min(359, (e.clientX - r.left) / r.width * 360));
        redraw();
      };
      hue.addEventListener('pointerdown', e => {
        pick(e);
        const mv = ev => pick(ev);
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      });
      cell.appendChild(hue);

      // 單格骰子
      const dice = document.createElement('button');
      dice.className = 'dice'; dice.textContent = '🎲';
      dice.onclick = () => {
        slot.shapeIdx = Math.floor(Math.random() * 4);
        slot.h = Math.floor(Math.random() * 360);
        redraw();
      };
      cell.appendChild(dice);

      function redraw() {
        // 預覽 sprite
        const r = Genetics.rasterize(genesOf(slot), 'adult');
        pv.width = r.w * 3; pv.height = r.h * 3;
        const c2 = pv.getContext('2d');
        c2.imageSmoothingEnabled = false;
        const tmp = document.createElement('canvas');
        tmp.width = r.w; tmp.height = r.h;
        tmp.getContext('2d').putImageData(new ImageData(r.pixels, r.w, r.h), 0, 0);
        c2.clearRect(0, 0, pv.width, pv.height);
        c2.drawImage(tmp, 0, 0, pv.width, pv.height);
        // 形狀選取框
        shapeBtns.forEach((b, si) => b.classList.toggle('sel', si === slot.shapeIdx));
        // 色相條＋游標
        const hc = hue.getContext('2d');
        for (let x = 0; x < hue.width; x++) {
          hc.fillStyle = `hsl(${x / hue.width * 360}, 70%, 60%)`;
          hc.fillRect(x, 0, 1, hue.height);
        }
        hc.fillStyle = '#fff';
        hc.fillRect(Math.round(slot.h / 360 * hue.width) - 1, 0, 2, hue.height);
      }
      redraws.push(redraw);
      redraw();
      grid.appendChild(cell);
    });
    sheet.appendChild(grid);

    // 全部骰＋開始
    const actions = document.createElement('div');
    actions.className = 'actions';
    const diceAll = document.createElement('button');
    diceAll.id = 'cerDiceAll'; diceAll.textContent = '🎲🎲';
    diceAll.onclick = () => {
      slots.forEach(s => { s.shapeIdx = Math.floor(Math.random() * 4); s.h = Math.floor(Math.random() * 360); });
      redraws.forEach(f => f());
    };
    const start = document.createElement('button');
    start.id = 'cerStart'; start.textContent = '🌱';
    start.onclick = () => {
      root.remove();
      onDone(slots.map(genesOf));
    };
    actions.appendChild(diceAll);
    actions.appendChild(start);
    sheet.appendChild(actions);

    root.appendChild(sheet);
    document.body.appendChild(root);
  };
})();

if (typeof window !== 'undefined') window.Ceremony = Ceremony;
