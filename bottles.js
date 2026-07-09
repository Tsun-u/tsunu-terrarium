/* bottles.js — 多瓶子系統：瓶子清單、切換、命名、匯出/匯入、雲端同步入口。
   存檔結構 v3：meta（清單＋當前瓶）＋每瓶獨立 key；舊單存檔自動遷移為一號瓶。 */

const Bottles = {};

(() => {
  const META_KEY = 'terrarium_meta_v1';
  const LEGACY_KEY = 'terrarium_v1';
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  let meta = null;

  const bkey = id => 'terrarium_bottle_' + id;
  const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const active = () => meta.bottles.find(b => b.id === meta.activeId);

  function loadMeta() {
    try { meta = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { meta = null; }
    if (!meta || !Array.isArray(meta.bottles)) meta = { activeId: null, pendingNew: false, bottles: [] };
  }
  function saveMeta() { localStorage.setItem(META_KEY, JSON.stringify(meta)); }

  Bottles.defaultName = () => (window.C && C.LANG === 'en')
    ? `Bottle ${meta.bottles.length + 1}`
    : `${NUM[meta.bottles.length] || (meta.bottles.length + 1)}號瓶`;

  /* 開機路由：回傳 'load'（進當前瓶）或 'ceremony'（辦開瓶儀式） */
  Bottles.init = function () {
    loadMeta();
    // 舊單存檔遷移 → 一號瓶（舊 key 保留當備份）
    if (!meta.bottles.length && localStorage.getItem(LEGACY_KEY)) {
      const id = newId();
      localStorage.setItem(bkey(id), localStorage.getItem(LEGACY_KEY));
      meta.bottles.push({ id, name: '一號瓶', createdAt: Date.now(), savedAt: Date.now() });
      meta.activeId = id;
      saveMeta();
    }
    if (meta.pendingNew) return 'ceremony';
    if (!meta.activeId || !active()) {
      if (!meta.bottles.length) return 'ceremony';
      meta.activeId = meta.bottles[0].id;
      saveMeta();
    }
    C.SAVE_KEY = bkey(meta.activeId);
    return 'load';
  };

  Bottles.createFromCeremony = function (name) {
    const id = newId();
    meta.pendingNew = false;
    meta.bottles.push({ id, name: (name || '').trim() || Bottles.defaultName(),
      createdAt: Date.now(), savedAt: Date.now() });
    meta.activeId = id;
    saveMeta();
    C.SAVE_KEY = bkey(id);
  };

  Bottles.touchSaved = () => { const b = active(); if (b) { b.savedAt = Date.now(); saveMeta(); } };
  Bottles.activeName = () => active()?.name || '';
  Bottles.hasMeta = () => !!meta;
  Bottles.list = () => meta.bottles;
  Bottles.activeId = () => meta.activeId;

  Bottles.switchTo = function (id, world) {
    if (id === meta.activeId) return;
    if (window.Sim?.save && world) { Sim.save(world); Bottles.touchSaved(); }
    meta.activeId = id;
    saveMeta();
    location.reload();
  };

  Bottles.startNew = function (world) {
    if (window.Sim?.save && world) { Sim.save(world); Bottles.touchSaved(); }
    meta.pendingNew = true;
    saveMeta();
    location.reload();
  };

  /* ---------- 匯出／匯入（無帳號的「瓶子帶著走」備援） ---------- */

  Bottles.exportAll = function () {
    const data = { kind: 'terrarium-bottles', ver: 1, exportedAt: Date.now(), bottles: [] };
    meta.bottles.forEach(b => {
      const save = localStorage.getItem(bkey(b.id));
      if (save) data.bottles.push({ name: b.name, createdAt: b.createdAt, savedAt: b.savedAt, save });
    });
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `terrarium_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // 檔案匯入＝複製語意：一律配新 id 併入，絕不覆蓋既有瓶
  Bottles.importData = function (data) {
    if (!data || data.kind !== 'terrarium-bottles' || !Array.isArray(data.bottles)) return 0;
    let n = 0;
    data.bottles.forEach(b => {
      if (!b.save) return;
      const id = newId();
      localStorage.setItem(bkey(id), b.save);
      meta.bottles.push({ id, name: b.name || Bottles.defaultName(),
        createdAt: b.createdAt || Date.now(), savedAt: b.savedAt || Date.now() });
      n++;
    });
    if (n) saveMeta();
    return n;
  };

  /* ---------- 雲端同步 payload（Drive 用；merge-by-id、savedAt 新者勝） ---------- */

  Bottles.cloudPayload = function () {
    const saves = {};
    meta.bottles.forEach(b => { saves[b.id] = localStorage.getItem(bkey(b.id)); });
    return { kind: 'terrarium-cloud', ver: 1, savedAt: Date.now(), bottles: meta.bottles, saves };
  };

  Bottles.cloudMerge = function (payload) {
    if (!payload || payload.kind !== 'terrarium-cloud') return { added: 0, updated: 0 };
    let added = 0, updated = 0;
    (payload.bottles || []).forEach(rb => {
      const save = payload.saves?.[rb.id];
      if (!save) return;
      const local = meta.bottles.find(b => b.id === rb.id);
      if (!local) {
        localStorage.setItem(bkey(rb.id), save);
        meta.bottles.push({ ...rb });
        added++;
      } else if ((rb.savedAt || 0) > (local.savedAt || 0)) {
        localStorage.setItem(bkey(rb.id), save);
        local.name = rb.name; local.savedAt = rb.savedAt;
        updated++;
      }
    });
    if (added || updated) saveMeta();
    return { added, updated };
  };

  /* ---------- 瓶子面板（🫙） ---------- */

  Bottles.openPanel = function (world) {
    document.querySelector('.panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.onclick = e => { if (e.target === panel) panel.remove(); };
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const head = document.createElement('div');
    head.className = 'sheet-head';
    head.innerHTML = `<span class="big">🫙</span><span class="stat dim">${meta.bottles.length}</span>`;
    const close = document.createElement('button');
    close.className = 'close'; close.textContent = '✕';
    close.onclick = () => panel.remove();
    head.appendChild(close);
    sheet.appendChild(head);

    // 瓶子清單
    const row = document.createElement('div');
    row.className = 'gen-row';
    meta.bottles.forEach(b => {
      const nd = document.createElement('div');
      nd.className = 'node' + (b.id === meta.activeId ? ' hl-self' : '');
      nd.style.width = '96px';
      const icon = document.createElement('div');
      icon.style.cssText = 'font-size:26px;';
      icon.textContent = '🫙';
      nd.appendChild(icon);
      const nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = b.name;
      nd.appendChild(nm);
      const dt = document.createElement('div');
      dt.className = 'nm'; dt.style.opacity = .55;
      const d = new Date(b.savedAt || b.createdAt);
      dt.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      nd.appendChild(dt);
      nd.onclick = ev => { ev.stopPropagation(); Bottles.switchTo(b.id, world); };
      row.appendChild(nd);
    });
    // ➕ 新瓶子
    const add = document.createElement('div');
    add.className = 'node';
    add.style.cssText = 'width:96px;display:flex;align-items:center;justify-content:center;font-size:30px;min-height:74px;';
    add.textContent = '➕';
    add.onclick = ev => { ev.stopPropagation(); Bottles.startNew(world); };
    row.appendChild(add);
    sheet.appendChild(row);

    const sep = document.createElement('div');
    sep.className = 'gen-sep';
    sheet.appendChild(sep);

    // 工具列：⬇️ 匯出、⬆️ 匯入、☁️ 同步（有 client id 才亮）
    const tools = document.createElement('div');
    tools.className = 'gen-row';
    const toolBtn = (txt, onClick) => {
      const b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = 'border:none;border-radius:12px;background:rgba(255,255,255,.14);' +
        'color:#fff;font-size:20px;width:56px;height:44px;cursor:pointer;font-family:inherit;';
      b.onclick = ev => { ev.stopPropagation(); onClick(b); };
      tools.appendChild(b);
      return b;
    };
    toolBtn('⬇️', () => Bottles.exportAll());
    toolBtn('⬆️', () => {
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'application/json';
      fi.onchange = () => {
        const f = fi.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const n = Bottles.importData(JSON.parse(rd.result));
            panel.remove();
            if (n) Bottles.openPanel(world);   // 重開面板看到新瓶
          } catch (e) { /* 非本遊戲的檔案：安靜忽略 */ }
        };
        rd.readAsText(f);
      };
      fi.click();
    });
    if (window.Drive && Drive.enabled) {
      toolBtn('☁️⬆️', btn => {
        btn.textContent = '⏳';
        Drive.auth(ok => {
          if (!ok) { btn.textContent = '☁️⬆️'; return; }
          if (window.Sim?.save && world) { Sim.save(world); Bottles.touchSaved(); }
          Drive.upload(Bottles.cloudPayload())
            .then(() => { btn.textContent = '✅'; setTimeout(() => btn.textContent = '☁️⬆️', 1500); })
            .catch(() => { btn.textContent = '❌'; setTimeout(() => btn.textContent = '☁️⬆️', 1500); });
        });
      });
      toolBtn('☁️⬇️', btn => {
        btn.textContent = '⏳';
        Drive.auth(ok => {
          if (!ok) { btn.textContent = '☁️⬇️'; return; }
          Drive.download()
            .then(payload => {
              const r = Bottles.cloudMerge(payload);
              btn.textContent = (r.added + r.updated) ? '✅' : '➖';
              setTimeout(() => { panel.remove(); Bottles.openPanel(world); }, 900);
            })
            .catch(() => { btn.textContent = '❌'; setTimeout(() => btn.textContent = '☁️⬇️', 1500); });
        });
      });
    }
    sheet.appendChild(tools);

    panel.appendChild(sheet);
    document.getElementById('uiLayer').appendChild(panel);
  };
})();

if (typeof window !== 'undefined') window.Bottles = Bottles;
