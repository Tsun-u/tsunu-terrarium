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

  function ensureCtx() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = enabled ? MASTER_VOL : 0;
      master.connect(ac.destination);
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
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(master);
    musicBus.connect(delay);

    const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];   // C D E G A
    const CHORDS = [
      [130.81, 196.0, 329.63],    // C:  C3 G3 E4
      [110.0, 164.81, 261.63],    // Am: A2 E3 C4
      [87.31, 174.61, 220.0],     // F:  F2 F3 A3
      [98.0, 146.83, 329.63],     // Gsus: G2 D3 E4
    ];
    let chordIdx = 0;

    function pluck(freq, vol, when = 0) {
      if (!musicOn) return;
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * (1 + (Math.random() * 0.002 - 0.001));   // 微 detune，有機感
      const h = ac.createOscillator();
      h.type = 'sine'; h.frequency.value = freq * 3;                       // 三倍頻泛音＝音樂盒質感
      const g = ac.createGain(), hg = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      hg.gain.setValueAtTime(vol * 0.16, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g); g.connect(musicBus);
      h.connect(hg); hg.connect(musicBus);
      o.start(t); o.stop(t + 2.8);
      h.start(t); h.stop(t + 1.3);
    }

    function chordPad() {
      if (musicOn) {
        const notes = CHORDS[chordIdx % CHORDS.length];
        chordIdx += Math.random() < 0.7 ? 1 : 2;   // 偶爾跳一個和弦，不落入固定循環
        const t = ac.currentTime;
        notes.forEach(f => {
          const o = ac.createOscillator();
          o.type = 'triangle'; o.frequency.value = f;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 2.5);      // 緩慢浮現
          g.gain.linearRampToValueAtTime(0.0001, t + 9);      // 緩慢退場
          o.connect(g); g.connect(musicBus);
          o.start(t); o.stop(t + 9.5);
        });
      }
      setTimeout(chordPad, 9000 + Math.random() * 5000);
    }

    // 音階上第 idx 級的頻率（超過五聲就上八度）
    const OCT = 2;
    const noteAt = idx => PENTA[idx % 5] * OCT * (idx >= 5 ? 2 : 1);

    function melodyLoop() {
      if (musicOn) {
        const r = Math.random();
        if (r < 0.30) {
          // 上行小琶音：do-mi-so 式的三連蹦跳，可愛擔當
          const i0 = Math.floor(Math.random() * 4);
          [i0, i0 + 2, i0 + 4].forEach((idx, k) =>
            pluck(noteAt(idx), 0.42 - k * 0.04, k * 0.16));
        } else if (r < 0.65) {
          // 兩音短句：間距短、跳躍感
          pluck(noteAt(Math.floor(Math.random() * 7)), 0.42);
          pluck(noteAt(Math.floor(Math.random() * 7)), 0.34, 0.2);
        } else {
          // 單音（偶爾再高八度的小亮點）
          pluck(noteAt(Math.floor(Math.random() * 5)) * (Math.random() < 0.3 ? 2 : 1), 0.42);
        }
      }
      setTimeout(melodyLoop, 900 + Math.random() * 1500);
    }

    setTimeout(chordPad, 1200);
    setTimeout(melodyLoop, 2600);
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

  Audio2.setMusic = on => { musicOn = on; };

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
