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
