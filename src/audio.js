// Web Audio로 만드는 엔진음, 파도, 폭포, 경적, 안내 차임
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // 엔진
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.eng1.connect(lp); this.eng2.connect(g2); g2.connect(lp);
    lp.connect(this.engGain); this.engGain.connect(this.master);
    this.eng1.start(); this.eng2.start();

    // 노이즈 버퍼 (파도/폭포)
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 4; }
    const mk = (type, freq) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return g;
    };
    this.waveGain = mk('lowpass', 600);
    this.fallGain = mk('bandpass', 1400);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  update({ driving, speed, throttle, seaNear, fallNear, t }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const rpm = 38 + Math.abs(speed) * 3.2 + throttle * 14;
    this.eng1.frequency.setTargetAtTime(rpm, now, 0.1);
    this.eng2.frequency.setTargetAtTime(rpm * 0.5, now, 0.1);
    this.engGain.gain.setTargetAtTime(driving ? 0.05 + throttle * 0.04 : 0, now, 0.2);
    const swell = 0.6 + 0.4 * Math.sin(t * 0.7);
    this.waveGain.gain.setTargetAtTime(seaNear * 0.22 * swell, now, 0.3);
    this.fallGain.gain.setTargetAtTime(fallNear * 0.25, now, 0.3);
  }

  tone(freq, dur, type = 'sine', vol = 0.15, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  horn() { this.tone(330, 0.6, 'square', 0.07); this.tone(415, 0.6, 'square', 0.06); }
  chime() { this.tone(988, 0.5, 'sine', 0.12); this.tone(784, 0.8, 'sine', 0.12, 0.35); }
  stamp() { this.tone(660, 0.15, 'triangle', 0.14); this.tone(880, 0.3, 'triangle', 0.14, 0.12); }
  thud() { this.tone(70, 0.3, 'sine', 0.3); }
}
