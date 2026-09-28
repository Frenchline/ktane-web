// Effets sonores synthétisés (WebAudio) + radio web
// Partagé entre la vue désamorceur (scène 3D) et la vue expert
export class Sfx {
  constructor() {
    this.ctx = null;
    this.alarmOsc = null;
    this.clockTimer = null;
    this.radioEl = null;
    this.radioNoise = null;
    this._radioTimeout = null;
  }
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume?.();
    return this.ctx;
  }
  click() {
    try {
      const ctx = this.ensure();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 800; g.gain.value = 0.08;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.08);
    } catch {}
  }
  // sirène stridente (effet alarme)
  startAlarm() {
    try {
      const ctx = this.ensure();
      this.stopAlarm();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(600, ctx.currentTime);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 4; lg.gain.value = 250;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.06;
      o.connect(g).connect(ctx.destination);
      o.start(); lfo.start();
      this.alarmOsc = [o, lfo];
    } catch {}
  }
  stopAlarm() {
    this.alarmOsc?.forEach(o => { try { o.stop(); } catch {} });
    this.alarmOsc = null;
  }
  thunder() {
    try {
      const ctx = this.ensure();
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
      const s = ctx.createBufferSource(); s.buffer = b;
      s.connect(ctx.destination); s.start();
    } catch {}
  }
  explosion() {
    try {
      const ctx = this.ensure();
      const b = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      s.connect(f).connect(ctx.destination); s.start();
    } catch {}
  }
  // ---------- radio web (effet panique) ----------
  // flux web radio fort ; si injoignable (hors-ligne) → static synthétisée
  startRadio(url = 'https://stream.radioparadise.com/mp3-192') {
    this.stopRadio();
    const el = new Audio();
    el.loop = true;
    el.volume = 1;
    el.onerror = () => this._startRadioStatic();
    el.onstalled = () => {};
    this.radioEl = el;
    // si le flux n'a rien joué sous 4 s → fallback bruit
    this._radioTimeout = setTimeout(() => {
      if (el.readyState < 3 || el.paused) this._startRadioStatic();
    }, 4000);
    el.src = url;
    el.play().catch(() => this._startRadioStatic());
  }
  _startRadioStatic() {
    if (this.radioNoise) return;
    try {
      const ctx = this.ensure();
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.03 ? 1 : 0.3);
      }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.55;
      s.connect(f).connect(g).connect(ctx.destination);
      s.start();
      this.radioNoise = [s];
    } catch {}
  }
  stopRadio() {
    clearTimeout(this._radioTimeout);
    if (this.radioEl) { this.radioEl.pause(); this.radioEl.removeAttribute('src'); this.radioEl = null; }
    this.radioNoise?.forEach(s => { try { s.stop(); } catch {} });
    this.radioNoise = null;
  }
  // ---------- flashbang : acouphène ----------
  tinnitus() {
    try {
      const ctx = this.ensure();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 3700;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 3);
    } catch {}
  }
  // ---------- néon qui grésille ----------
  startNeonBuzz() {
    try {
      const ctx = this.ensure();
      this.stopNeonBuzz();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 110;
      g.gain.value = 0.04;
      // crépitements
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.05 ? 0.5 : 0.02);
      const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0.2;
      o.connect(g).connect(ctx.destination);
      ns.connect(ng).connect(ctx.destination);
      o.start(); ns.start();
      this.neonOsc = [o, ns];
    } catch {}
  }
  stopNeonBuzz() {
    this.neonOsc?.forEach(o => { try { o.stop(); } catch {} });
    this.neonOsc = null;
  }
  // ---------- séisme : grondement ----------
  startRumble() {
    try {
      const ctx = this.ensure();
      this.stopRumble();
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      let v = 0;
      for (let i = 0; i < d.length; i++) { v += (Math.random() * 2 - 1) * 0.04; v *= 0.995; d[i] = v * 8; }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
      const g = ctx.createGain(); g.gain.value = 0.5;
      s.connect(f).connect(g).connect(ctx.destination);
      s.start();
      this.rumbleSrc = [s];
    } catch {}
  }
  stopRumble() {
    this.rumbleSrc?.forEach(s => { try { s.stop(); } catch {} });
    this.rumbleSrc = null;
  }
  // ---------- réveil qui sonne (effet panique) ----------
  startAlarmClock() {
    try {
      const ctx = this.ensure();
      this.stopAlarmClock();
      const beep = (t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 1400;
        g.gain.setValueAtTime(0.18, t);
        g.gain.setValueAtTime(0, t + 0.09);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.1);
      };
      const burst = () => {
        const t0 = ctx.currentTime + 0.02;
        for (let i = 0; i < 4; i++) beep(t0 + i * 0.13);
      };
      burst();
      this.clockTimer = setInterval(burst, 1100);
    } catch {}
  }
  stopAlarmClock() {
    clearInterval(this.clockTimer);
    this.clockTimer = null;
  }
}
