/**
 * BBB sound engine — procedural Web Audio.
 *
 * No sample files: every cue is synthesized at runtime from oscillators and
 * shaped noise. Pitches are locked to an A-minor-pentatonic palette so that
 * multi-note cues (locks, arpeggios, the boot chord) stay consonant instead of
 * sounding like random beeps. A small generated reverb glues everything into one
 * cohesive, dark sci-fi space.
 *
 * The AudioContext can only start after a user gesture, so nothing is created
 * until `unlock()` is called from the first interaction.
 */

export type Cue =
  | 'hover'
  | 'click'
  | 'nav'
  | 'glitch'
  | 'impact'
  | 'laser'
  | 'lock'
  | 'denied'
  | 'add'
  | 'remove'
  | 'toast'
  | 'boot';

// A-minor pentatonic across a few octaves (Hz). Indexable by scale degree.
const SCALE = {
  A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0,
  A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0,
  A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  A5: 880.0, C6: 1046.5, D6: 1174.66, E6: 1318.51,
};

const STORAGE_KEY = 'bbb-muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ambientGain: GainNode | null = null;
  private ambientVoices: OscillatorNode[] = [];
  private ambientLfo: OscillatorNode | null = null;
  private ambientStarted = false;
  private ambientTarget = 0;

  private _muted = false;
  private booted = false;

  // Optional real samples (CC/royalty-free). When a cue has a loaded buffer it
  // is used instead of the synthesized version; otherwise we fall back to synth.
  private samples: Partial<Record<Cue, AudioBuffer>> = {};
  private sampleFiles: Partial<Record<Cue, string>> = {
    impact: 'impact.mp3',
    laser: 'laser.mp3',
    nav: 'nav.mp3',
  };
  private samplesRequested = false;

  constructor() {
    try {
      this._muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Resume/create the context on a user gesture. Plays a one-time boot cue. */
  unlock(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.afterResume(), () => this.afterResume());
    } else {
      this.afterResume();
    }
  }

  /** Runs once the context is actually running: boot cue + restore ambient. */
  private afterResume(): void {
    if (!this.booted) {
      this.booted = true;
      // Small delay so resume settles before the first scheduled nodes.
      if (!this._muted) setTimeout(() => this.play('boot'), 60);
    }
    if (!this._muted && this.ambientTarget > 0) this.setAmbient(this.ambientTarget);
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(m ? 0.0001 : 0.9, now + 0.18);
    }
    if (m) this.stopAmbient();
  }

  toggleMuted(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  // ---- internal setup -----------------------------------------------------

  private ensure(): void {
    if (this.ctx) return;
    type ACtor = typeof AudioContext;
    const Ctor: ACtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    // master → limiter → out
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0.0001 : 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;

    // reverb send bus
    const reverb = ctx.createGain();
    reverb.gain.value = 0.5;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(2.2, 2.6);
    reverb.connect(convolver);
    convolver.connect(master);
    this.reverb = reverb;

    // shared noise
    this.noiseBuffer = this.makeNoise(2);

    this.loadSamples();
  }

  private loadSamples(): void {
    if (this.samplesRequested || !this.ctx) return;
    this.samplesRequested = true;
    if (typeof fetch !== 'function') return;
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    for (const key of Object.keys(this.sampleFiles) as Cue[]) {
      const file = this.sampleFiles[key];
      if (!file) continue;
      try {
        fetch(`${base}sounds/${file}`)
          .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))))
          .then(buf => this.ctx!.decodeAudioData(buf))
          .then(audio => { this.samples[key] = audio; })
          .catch(() => { /* keep the synthesized fallback */ });
      } catch {
        /* fetch unavailable / bad URL — synthesized fallback stays */
      }
    }
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ---- voice helpers ------------------------------------------------------

  private now(): number {
    return this.ctx!.currentTime;
  }

  /** A pitched voice with an ADSR-ish gain and optional reverb send. */
  private tone(opts: {
    type: OscillatorType;
    freq: number;
    to?: number;
    t0: number;
    dur: number;
    gain: number;
    attack?: number;
    glideEase?: 'lin' | 'exp';
    detune?: number;
    filter?: { type: BiquadFilterType; freq: number; q?: number; to?: number };
    send?: number;
    pan?: number;
  }): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    if (opts.detune) osc.detune.value = opts.detune;
    osc.frequency.setValueAtTime(opts.freq, opts.t0);
    if (opts.to != null) {
      if (opts.glideEase === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), opts.t0 + opts.dur);
      else osc.frequency.linearRampToValueAtTime(opts.to, opts.t0 + opts.dur);
    }

    const g = ctx.createGain();
    const atk = opts.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, opts.t0);
    g.gain.linearRampToValueAtTime(opts.gain, opts.t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, opts.t0 + opts.dur);

    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.frequency.setValueAtTime(opts.filter.freq, opts.t0);
      if (opts.filter.to != null) f.frequency.linearRampToValueAtTime(opts.filter.to, opts.t0 + opts.dur);
      if (opts.filter.q != null) f.Q.value = opts.filter.q;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    this.route(g, opts.t0, opts.pan, opts.send);

    osc.start(opts.t0);
    osc.stop(opts.t0 + opts.dur + 0.05);
  }

  /** A shaped-noise burst (impacts, sweeps, sizzle). */
  private noise(opts: {
    t0: number;
    dur: number;
    gain: number;
    filter: { type: BiquadFilterType; freq: number; q?: number; to?: number };
    attack?: number;
    send?: number;
    pan?: number;
  }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const f = ctx.createBiquadFilter();
    f.type = opts.filter.type;
    f.frequency.setValueAtTime(opts.filter.freq, opts.t0);
    if (opts.filter.to != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filter.to), opts.t0 + opts.dur);
    if (opts.filter.q != null) f.Q.value = opts.filter.q;

    const g = ctx.createGain();
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, opts.t0);
    g.gain.linearRampToValueAtTime(opts.gain, opts.t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, opts.t0 + opts.dur);

    src.connect(f);
    f.connect(g);
    this.route(g, opts.t0, opts.pan, opts.send);

    src.start(opts.t0);
    src.stop(opts.t0 + opts.dur + 0.05);
  }

  private route(input: GainNode, t0: number, pan?: number, send?: number): void {
    const ctx = this.ctx!;
    let out: AudioNode = input;
    if (pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, t0);
      input.connect(p);
      out = p;
    }
    out.connect(this.master!);
    if (send && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = send;
      out.connect(s);
      s.connect(this.reverb);
    }
  }

  // ---- public cues --------------------------------------------------------

  /** Play a loaded sample with a length cap + fade, scaled by intensity. */
  private playSample(cue: Cue, intensity: number): void {
    const ctx = this.ctx!;
    const buf = this.samples[cue]!;
    const t0 = this.now();
    let gain = 0.7, rate = 1, maxDur = buf.duration, send = 0.15;

    if (cue === 'impact') {
      const k = Math.max(0.25, Math.min(1.6, intensity));
      rate = 1.18 - k * 0.4;            // bigger yield → deeper/slower
      gain = 0.55 + k * 0.55;
      maxDur = 1.2 + k * 1.6;
      send = 0.3;
    } else if (cue === 'laser') {
      rate = 1.0; gain = 0.6; maxDur = 1.7; send = 0.22;
    } else if (cue === 'nav') {
      rate = 1.05; gain = 0.5; maxDur = 1.1; send = 0.12;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const dur = Math.min(buf.duration / rate, maxDur);
    const atk = 0.005;
    const rel = Math.min(0.3, dur * 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.setValueAtTime(gain, t0 + Math.max(atk, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(g);
    this.route(g, t0, undefined, send);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  play(cue: Cue, intensity = 1): void {
    if (this._muted) return;
    this.ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;

    if (this.samples[cue]) { this.playSample(cue, intensity); return; }

    const t = this.now();

    switch (cue) {
      case 'hover':
        this.tone({ type: 'triangle', freq: SCALE.E5, t0: t, dur: 0.05, gain: 0.05,
          filter: { type: 'lowpass', freq: 2600 }, pan: (Math.random() - 0.5) * 0.4 });
        break;

      case 'click':
        this.tone({ type: 'square', freq: SCALE.E5, t0: t, dur: 0.045, gain: 0.07,
          filter: { type: 'lowpass', freq: 3200 } });
        this.tone({ type: 'square', freq: SCALE.A5, t0: t + 0.05, dur: 0.06, gain: 0.06,
          filter: { type: 'lowpass', freq: 3600 } });
        break;

      case 'nav':
        // filtered-noise whoosh + a sub-drop underneath
        this.noise({ t0: t, dur: 0.34, gain: 0.10,
          filter: { type: 'bandpass', freq: 320, to: 2400, q: 1.1 }, send: 0.18 });
        this.tone({ type: 'sine', freq: SCALE.A3, to: SCALE.A2, t0: t, dur: 0.34, gain: 0.12,
          glideEase: 'exp' });
        this.tone({ type: 'triangle', freq: SCALE.E6, t0: t + 0.18, dur: 0.12, gain: 0.04,
          filter: { type: 'lowpass', freq: 4000 }, send: 0.2 });
        break;

      case 'glitch':
        // digital stutter: gated noise + a detuned zap
        for (let i = 0; i < 4; i++) {
          this.noise({ t0: t + i * 0.028, dur: 0.022, gain: 0.06,
            filter: { type: 'highpass', freq: 1400 + i * 600, q: 0.8 } });
        }
        this.tone({ type: 'square', freq: SCALE.A4, to: SCALE.D4, t0: t, dur: 0.14, gain: 0.05,
          detune: 18, filter: { type: 'bandpass', freq: 1200, q: 2 } });
        break;

      case 'impact': {
        const k = Math.max(0.25, Math.min(1.6, intensity));
        const dur = 0.7 + k * 0.7;
        // low boom sweep
        this.tone({ type: 'sine', freq: 150 * (0.7 + k * 0.4), to: 32, t0: t, dur, gain: 0.5,
          glideEase: 'exp', send: 0.25 });
        // body / debris
        this.noise({ t0: t, dur: dur * 0.9, gain: 0.22 * k,
          filter: { type: 'lowpass', freq: 1800 * k, to: 120, q: 0.7 }, send: 0.3 });
        // initial crack
        this.noise({ t0: t, dur: 0.05, gain: 0.18,
          filter: { type: 'highpass', freq: 2200 } });
        // sub thump
        this.tone({ type: 'sine', freq: 60, to: 28, t0: t, dur: 0.5, gain: 0.4, glideEase: 'exp' });
        break;
      }

      case 'laser': {
        const k = Math.max(0.3, Math.min(1.4, intensity));
        // bright descending beam (FM-ish via two detuned voices)
        this.tone({ type: 'sawtooth', freq: SCALE.E6 * (0.9 + k * 0.3), to: SCALE.A4, t0: t, dur: 0.5,
          gain: 0.12, glideEase: 'exp', filter: { type: 'lowpass', freq: 5200, to: 1400 }, send: 0.22 });
        this.tone({ type: 'sine', freq: SCALE.E5, to: SCALE.A3, t0: t, dur: 0.5, gain: 0.16,
          glideEase: 'exp', detune: -6 });
        // sizzle tail
        this.noise({ t0: t + 0.04, dur: 0.4, gain: 0.05,
          filter: { type: 'bandpass', freq: 3200, to: 800, q: 1.4 }, send: 0.2 });
        break;
      }

      case 'lock':
        // two-tone confirm, root then a fifth above
        this.tone({ type: 'sine', freq: SCALE.A5, t0: t, dur: 0.16, gain: 0.16,
          filter: { type: 'lowpass', freq: 4000 }, send: 0.3, pan: -0.15 });
        this.tone({ type: 'sine', freq: SCALE.E6, t0: t + 0.1, dur: 0.3, gain: 0.14,
          filter: { type: 'lowpass', freq: 5000 }, send: 0.4, pan: 0.15 });
        break;

      case 'denied':
        // dissonant low buzz with a stutter
        for (let i = 0; i < 3; i++) {
          this.tone({ type: 'sawtooth', freq: SCALE.A3, t0: t + i * 0.1, dur: 0.07, gain: 0.12,
            detune: 22, filter: { type: 'lowpass', freq: 900, q: 3 } });
          this.tone({ type: 'sawtooth', freq: SCALE.A3 * 1.06, t0: t + i * 0.1, dur: 0.07, gain: 0.1,
            filter: { type: 'lowpass', freq: 900, q: 3 } });
        }
        break;

      case 'add':
        // ascending root-third-fifth arpeggio
        this.tone({ type: 'triangle', freq: SCALE.A4, t0: t, dur: 0.1, gain: 0.1,
          filter: { type: 'lowpass', freq: 3400 }, send: 0.12 });
        this.tone({ type: 'triangle', freq: SCALE.C5, t0: t + 0.07, dur: 0.1, gain: 0.1,
          filter: { type: 'lowpass', freq: 3800 }, send: 0.12 });
        this.tone({ type: 'triangle', freq: SCALE.E5, t0: t + 0.14, dur: 0.18, gain: 0.11,
          filter: { type: 'lowpass', freq: 4200 }, send: 0.22 });
        break;

      case 'remove':
        this.tone({ type: 'triangle', freq: SCALE.E5, t0: t, dur: 0.08, gain: 0.08,
          filter: { type: 'lowpass', freq: 3000 } });
        this.tone({ type: 'triangle', freq: SCALE.A4, t0: t + 0.06, dur: 0.12, gain: 0.08,
          filter: { type: 'lowpass', freq: 2600 } });
        break;

      case 'toast':
        // soft bell notification
        this.tone({ type: 'sine', freq: SCALE.C6, t0: t, dur: 0.4, gain: 0.1,
          filter: { type: 'lowpass', freq: 5000 }, send: 0.4 });
        this.tone({ type: 'sine', freq: SCALE.E6, t0: t + 0.005, dur: 0.3, gain: 0.05, send: 0.4 });
        break;

      case 'boot':
        // rising sweep + low swell, resolving to an A-minor chord
        this.tone({ type: 'sawtooth', freq: SCALE.A2, to: SCALE.A3, t0: t, dur: 0.7, gain: 0.08,
          glideEase: 'exp', filter: { type: 'lowpass', freq: 400, to: 2200 }, send: 0.2 });
        this.noise({ t0: t, dur: 0.8, gain: 0.05,
          filter: { type: 'bandpass', freq: 300, to: 3000, q: 0.8 }, send: 0.25 });
        this.tone({ type: 'sine', freq: SCALE.A4, t0: t + 0.7, dur: 0.5, gain: 0.12, send: 0.4, pan: -0.2 });
        this.tone({ type: 'sine', freq: SCALE.C5, t0: t + 0.74, dur: 0.5, gain: 0.1, send: 0.4 });
        this.tone({ type: 'sine', freq: SCALE.E5, t0: t + 0.78, dur: 0.5, gain: 0.1, send: 0.4, pan: 0.2 });
        break;
    }
  }

  // ---- ambient drone ------------------------------------------------------

  /** Low atmospheric pad. `level` 0..1 fades it (e.g. quieter off the landing). */
  setAmbient(level: number): void {
    this.ambientTarget = level;
    if (this._muted) {
      this.stopAmbient();
      return;
    }
    this.ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.ambientStarted) this.startAmbient();
    if (this.ambientGain) {
      const now = this.now();
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.linearRampToValueAtTime(0.06 * Math.max(0, Math.min(1, level)), now + 0.8);
    }
  }

  private startAmbient(): void {
    const ctx = this.ctx!;
    this.ambientStarted = true;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.6;
    g.connect(filter);
    filter.connect(this.master!);
    if (this.reverb) {
      const s = ctx.createGain();
      s.gain.value = 0.3;
      filter.connect(s);
      s.connect(this.reverb);
    }
    this.ambientGain = g;

    // root, fifth, octave — a quiet sustained drone
    const freqs = [SCALE.A2, SCALE.E3, SCALE.A3];
    const detunes = [-4, 3, -2];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = detunes[i];
      o.connect(g);
      o.start();
      this.ambientVoices.push(o);
    });

    // slow filter LFO for movement
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.ambientLfo = lfo;
  }

  private stopAmbient(): void {
    if (this.ambientGain && this.ctx) {
      const now = this.now();
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    }
  }
}

export const sound = new SoundEngine();
