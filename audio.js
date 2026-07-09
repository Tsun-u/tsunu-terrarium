/* audio.js — 環境音引擎（WebAudio 合成，無音檔）。
   風＝濾波噪音緩慢起伏；鳥鳴＝白天隨機上滑 chirp；蟲鳴＝夜晚規律短脈衝。
   命名 Audio2 避免撞到內建 window.Audio。 */

const Audio2 = {};

(() => {
  let ac = null;          // AudioContext
  let master = null;      // 總音量
  let enabled = true;
  let isNightFn = () => false;
  let started = false;

  const MASTER_VOL = 0.05;   // 整體極輕，陪伴不搶戲

  let musicOut = null;   // 音樂匯流排（與音效分離，可獨立開關）

  function ensureCtx() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();                       // 音效＋環境音匯流排
      master.gain.value = enabled ? MASTER_VOL : 0;
      master.connect(ac.destination);
      musicOut = ac.createGain();                     // 音樂盒匯流排
      musicOut.gain.value = musicOn ? MASTER_VOL : 0;
      musicOut.connect(ac.destination);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 風：白噪音 → lowpass → 慢速起伏 ---------- */
  function startWind() {
    const len = ac.sampleRate * 4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    const g = ac.createGain(); g.gain.value = 0.5;
    // 起伏 LFO
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
  }

  /* ---------- 小音符工具 ---------- */
  function tone(freq, dur, type, vol, when = 0, glideTo = null) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------- 鳥鳴（白天）與蟲鳴（夜晚） ---------- */
  function natureLoop() {
    if (!ac) return;
    const night = isNightFn();
    if (!night && Math.random() < 0.5) {
      // 鳥：2-3 個上滑短音
      const n = 2 + Math.floor(Math.random() * 2);
      const base = 1800 + Math.random() * 800;
      for (let i = 0; i < n; i++) tone(base, 0.12, 'sine', 0.5, i * 0.18, base * 1.35);
    } else if (night) {
      // 蟲：三連短脈衝
      for (let i = 0; i < 3; i++) tone(4200, 0.03, 'square', 0.12, i * 0.09);
    }
    setTimeout(natureLoop, (night ? 3500 : 9000) + Math.random() * 8000);
  }

  /* ---------- 事件音 ---------- */
  const EVENT_MOTIFS = {
    family:    () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.5, i * 0.14)); },
    butterfly: () => { [880, 1108, 1318].forEach((f, i) => tone(f, 0.18, 'sine', 0.4, i * 0.12)); },
    rainbow:   () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.35, i * 0.15)); },
    meteor:    () => tone(2400, 0.7, 'sine', 0.35, 0, 500),
    firefly:   () => { [1568, 1976].forEach((f, i) => tone(f, 0.25, 'sine', 0.25, i * 0.3)); },
    gift:      () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.16, 'triangle', 0.4, i * 0.1)); },
    nap:       () => { [392, 330].forEach((f, i) => tone(f, 0.5, 'sine', 0.3, i * 0.4)); },
    petals:    () => { [1047, 932, 784].forEach((f, i) => tone(f, 0.35, 'sine', 0.25, i * 0.25)); },
  };

  /* ---------- 生成式音樂盒：五聲音階鈴音＋和弦墊，永不重複的溫柔旋律 ---------- */

  let musicBus = null;
  let musicOn = true;

  function startMusicBox() {
    // 回聲：讓鈴音有「空瓶子裡的回響」
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.3;
    const wet = ac.createGain(); wet.gain.value = 0.45;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicOut);
    musicBus = ac.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(musicOut);
    musicBus.connect(delay);

    /* ---- 作曲規則 v2 ----
       概念參考 AMIX「EASY 8BIT EDITOR」的公開作曲規則（和弦感知音階、
       動機移調反覆、終止式），實作為本專案原創。三層規則：
       1) 和弦進行：定番進行輪播（日間明亮池／夜間柔暗池），不再隨機亂跳
       2) 動機：每首曲子造一個小動機，在每個和弦上「移調反覆」＝聽起來像有主題
       3) 終止式：進行走完解決回主音、樂句間留呼吸 */

    const SEMI3 = n => 130.81 * Math.pow(2, n / 12);   // C3 起算的半音頻率（和弦墊）
    const SEMI5 = n => 523.25 * Math.pow(2, n / 12);   // C5 起算（旋律，音樂盒音域）
    // 和弦組成音（相對 C 的半音數；七和弦第四音給旋律用，墊只取前三）
    const CHORD_PCS = {
      C: [0, 4, 7], Cmaj7: [0, 4, 7, 11], Dm: [2, 5, 9], Dm7: [2, 5, 9, 12],
      Em: [4, 7, 11], Em7: [4, 7, 11, 14], F: [5, 9, 12], Fmaj7: [5, 9, 12, 16],
      G: [7, 11, 14], G7: [7, 11, 14, 17], Am: [9, 12, 16], Am7: [9, 12, 16, 19],
      Gsus: [7, 12, 14],
    };
    // 定番進行：日間亮色七和弦為主（參考曲配方：Cmaj7-Am7-Fmaj7-G7）／夜間柔暗
    const PROG_DAY = [
      ['Cmaj7', 'Am7', 'Fmaj7', 'G7'], ['C', 'G', 'Am', 'F'],
      ['Fmaj7', 'G7', 'Em7', 'Am7'], ['C', 'Am', 'F', 'G'],
      ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'],   // 卡農進行
    ];
    const PROG_NIGHT = [
      ['Am', 'F', 'C', 'G'], ['Am', 'Dm', 'G', 'C'], ['Dm', 'Am', 'F', 'G'],
    ];
    // 五聲音階攤兩個八度（半音表示）
    const PENTA_SEMIS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

    // 和弦感知音階：跟當前和弦差半音打架的級音，換成和弦自己的音
    function effScale(pcs) {
      const chroma = pcs.map(p => p % 12);
      return PENTA_SEMIS.map(s => {
        const pc = s % 12, oct = s - pc;
        for (const c of chroma) {
          if ((pc + 1) % 12 === c || (pc + 11) % 12 === c) {
            let np = oct + c;                       // 換成和弦音時取「最近」的八度
            if (c - pc > 6) np -= 12;
            if (pc - c > 6) np += 12;
            return np;
          }
        }
        return s;
      });
    }
    // 音階上離某和弦音最近的級數（動機的錨點）
    function nearestDeg(scale, targetPc) {
      let best = 0, bd = 99;
      scale.forEach((s, i) => {
        const d = Math.min((s % 12 - targetPc % 12 + 12) % 12, (targetPc % 12 - s % 12 + 12) % 12);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }

    function pluck(freq, vol, when = 0, decay = 2.6) {
      if (!musicOn) return;
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * (1 + (Math.random() * 0.002 - 0.001));   // 微 detune，有機感
      const h = ac.createOscillator();
      h.type = 'sine'; h.frequency.value = freq * 3;                       // 三倍頻泛音＝音樂盒質感
      const g = ac.createGain(), hg = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
      hg.gain.setValueAtTime(vol * 0.16, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + Math.min(1.1, decay));
      o.connect(g); g.connect(musicBus);
      h.connect(hg); hg.connect(musicBus);
      o.start(t); o.stop(t + decay + 0.2);
      h.start(t); h.stop(t + Math.min(1.1, decay) + 0.2);
    }

    // 和弦墊：跟著進行走（root 低八度、其餘中音域，triangle 緩起緩收）
    function padChord(name, durSec) {
      const pcs = CHORD_PCS[name] || [0, 4, 7];
      const t = ac.currentTime;
      const freqs = [SEMI3(pcs[0]), SEMI3(pcs[1]), SEMI3(pcs[2])];
      freqs.forEach(f => {
        const o = ac.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.8);
        g.gain.linearRampToValueAtTime(0.0001, t + durSec + 2.2);
        o.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + durSec + 2.6);
      });
    }

    // 動機：一段小節奏＋輪廓（級數差），整首曲子共用、逐和弦移調反覆。
    // 白天用 3-3-2 切分節奏（參考曲的蹦跳配方：音落在 8 步的 0/3/6 步）＋下行瀑布輪廓；
    // 夜晚用貼近曲首的柔和短簇。
    const RHYTHMS_NIGHT = [[0, 0.2], [0, 0.18, 0.36], [0, 0.24, 0.48], [0, 0.16, 0.32, 0.55]];
    // 白天加密版：以 0.43s（70bpm 八分音符）為格，3-3-2 骨架＋墊步填縫——
    // 句內不留超過一拍的空隙，聽感才會「一直在動」
    const RHYTHMS_DAY = [
      [0, 0.43, 1.29, 1.71, 2.57], [0, 0.86, 1.29, 2.14, 2.57, 3.0],
      [0, 0.43, 0.86, 1.29, 2.57], [0, 1.29, 1.71, 2.57, 3.0],
    ];
    function mkMotif(day) {
      const pool = day ? RHYTHMS_DAY : RHYTHMS_NIGHT;
      const offs = pool[Math.floor(Math.random() * pool.length)];
      const degs = [0];
      let lastLeap = 0;
      for (let i = 1; i < offs.length; i++) {
        let step;
        if (lastLeap !== 0) { step = lastLeap > 0 ? -1 : 1; lastLeap = 0; }  // 跳進後反向級進
        else if (Math.random() < 0.25) { step = Math.random() < 0.5 ? 2 : -2; lastLeap = step; }
        else if (day) step = Math.random() < 0.72 ? -1 : 1;   // 白天偏下行＝瀑布式鈴聲
        else step = Math.random() < 0.55 ? 1 : -1;
        degs.push(degs[i - 1] + step);
      }
      return { offs, degs };
    }

    // 在指定和弦上奏動機：錨點吸附和弦音（強拍），其餘沿和弦感知音階級進
    function playMotif(motif, chordName, opts = {}) {
      const pcs = CHORD_PCS[chordName] || [0, 4, 7];
      const scale = effScale(pcs);
      const anchorPc = pcs[Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? 1 : 2];
      let anchor = nearestDeg(scale, anchorPc);
      if (opts.high) anchor = Math.min(scale.length - 1, anchor + 5);   // 白天瀑布從高處落下
      else if (anchor < 2 && Math.random() < 0.5) anchor += 5;          // 夜晚偶爾上八度亮一下
      motif.offs.forEach((off, k) => {
        const deg = Math.max(0, Math.min(scale.length - 1, anchor + motif.degs[k]));
        pluck(SEMI5(scale[deg]), (opts.vol || 0.42) - k * 0.03, off, opts.decay || 2.6);
      });
    }

    // 曲子引擎：選進行＋造動機 → 每個和弦奏墊＋動機（移調反覆）→
    // 走完數輪以終止式收尾 → 留一段只有風聲的呼吸，再開下一首
    let piece = null;
    function musicStep() {
      if (!musicOn) { setTimeout(musicStep, 2000); return; }
      if (!piece) {
        const day = !isNightFn();
        const pool = day ? PROG_DAY : PROG_NIGHT;
        piece = {
          day,
          prog: pool[Math.floor(Math.random() * pool.length)],
          motif: mkMotif(day),
          idx: 0, cycle: 0,
          cycles: 2 + Math.floor(Math.random() * 2),          // 每首 2~3 輪
        };
      }
      // 白天和聲節奏較快（參考曲每和弦約 3.4 秒），夜晚放慢呼吸
      const chordMs = piece.day ? 3400 + Math.random() * 500 : 4600 + Math.random() * 600;
      const ch = piece.prog[piece.idx];
      const lastChord = piece.idx === piece.prog.length - 1;
      const lastCycle = piece.cycle === piece.cycles - 1;
      padChord(ch, chordMs / 1000);
      if (lastChord && lastCycle) {
        const pcs = CHORD_PCS[piece.prog[0]] || [0, 4, 7];
        if (piece.day) {
          // 白天終止式：三音下行小跑步落回主音，收得乾脆不拖
          pluck(SEMI5(pcs[0] % 12 + 7), 0.4, 0.4, 1.6);
          pluck(SEMI5(pcs[0] % 12 + 4), 0.36, 0.83, 1.6);
          pluck(SEMI5(pcs[0] % 12), 0.46, 1.26, 2.6);
        } else {
          // 夜晚終止式：根音長音＋五度輕聲，餘韻慢慢散
          pluck(SEMI5(pcs[0] % 12), 0.46, chordMs / 1000 * 0.55);
          pluck(SEMI5(pcs[0] % 12 + 7), 0.2, chordMs / 1000 * 0.55 + 0.35);
        }
        const breath = piece.day ? 2500 + Math.random() * 2000 : 5000 + Math.random() * 5000;
        piece = null;
        setTimeout(musicStep, chordMs + breath);   // 曲間呼吸：白天短、夜晚長
        return;
      }
      if (piece.day || Math.random() < 0.8) {
        // 白天忠實反覆為主（參考曲 sequenz 配方）＋短衰減讓快音粒粒分明；
        // 夜晚多留白、變奏稍多、長餘韻
        const varyP = piece.day ? 0.15 : 0.3;
        const vary = piece.cycle > 0 && Math.random() < varyP;
        const m = vary
          ? { offs: piece.motif.offs.slice(0, -1), degs: piece.motif.degs.slice(0, -1) }
          : piece.motif;
        playMotif(m, ch, { vol: 0.42, high: piece.day, decay: piece.day ? 1.6 : 2.6 });
      }
      piece.idx++;
      if (piece.idx >= piece.prog.length) { piece.idx = 0; piece.cycle++; }
      setTimeout(musicStep, chordMs);
    }

    setTimeout(musicStep, 1500);
  }

  /* ---------- 對外介面 ---------- */

  // 在第一次使用者手勢後呼叫（autoplay 政策）
  Audio2.start = function (nightFn) {
    if (started) return;
    if (!ensureCtx()) return;
    started = true;
    isNightFn = nightFn || isNightFn;
    if (ac.state === 'suspended') ac.resume();
    startWind();
    setTimeout(natureLoop, 3000);
    startMusicBox();
  };

  Audio2.setMusic = on => {
    musicOn = on;
    if (musicOut && ac) musicOut.gain.linearRampToValueAtTime(on ? MASTER_VOL : 0, ac.currentTime + 0.4);
  };

  Audio2.setEnabled = function (on) {
    enabled = on;
    if (master) master.gain.linearRampToValueAtTime(on ? MASTER_VOL : 0, ac.currentTime + 0.4);
  };

  Audio2.eventSound = function (kind) {
    if (!ac || !enabled) return;
    (EVENT_MOTIFS[kind] || (() => {}))();
  };
})();

if (typeof window !== 'undefined') window.Audio2 = Audio2;
