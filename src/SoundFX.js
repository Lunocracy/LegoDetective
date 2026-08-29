class SoundFX {
  constructor() {
    this.ctx = null;
    this._distortionCurve = null;
    this._noiseBuffer = null;
    this._crackleBuffer = null;
    this._lastClickTime = 0;
    this._lastLockTime = 0;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this._buildBuffers();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _buildBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;

    // 1. White / pink noise buffer for explosion bursts
    const noiseLength = sampleRate * 1.5;
    const noiseBuf = this.ctx.createBuffer(1, noiseLength, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < noiseLength; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      const pink = b0 + b1 + b2 + white * 0.5362;
      noiseData[i] = pink * 0.18;
    }
    this._noiseBuffer = noiseBuf;

    // 2. High-density crackle buffer (plastic splinter clicks / pops)
    const crackleLength = sampleRate * 1.2;
    const crackleBuf = this.ctx.createBuffer(1, crackleLength, sampleRate);
    const crackleData = crackleBuf.getChannelData(0);
    for (let i = 0; i < crackleLength; i++) {
      if (Math.random() < 0.015) {
        const sign = Math.random() < 0.5 ? -1 : 1;
        crackleData[i] = sign * (0.7 + Math.random() * 0.3);
      } else {
        crackleData[i] = (Math.random() * 2 - 1) * 0.008;
      }
    }
    this._crackleBuffer = crackleBuf;

    // 3. Warm saturation curve
    const k = 22;
    const n = 512;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this._distortionCurve = curve;
  }

  // --- Smooth Airy Whoosh / Shower as pieces drop downwards from above ---
  playDropWhoosh(duration = 0.7) {
    this._initContext();
    if (!this.ctx || !this._noiseBuffer) return;

    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.2, t);
    filter.frequency.setValueAtTime(1600, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(t);
    src.stop(t + duration);
  }

  // --- Soft, rounded "locking into place" sound with downward micro-pitch glide ---
  playDropLock(layer = 1, index = 0, total = 20) {
    this._initContext();
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this._lastLockTime < 24) return;
    this._lastLockTime = now;

    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.connect(this.ctx.destination);

    const layerFactor = Math.min(3.0, 1.0 + (layer - 1) * 0.12);
    const startF = (420 + Math.random() * 40) * layerFactor;
    const endF = (240 + Math.random() * 20) * layerFactor;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(endF, t + 0.045);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.001, t);
    toneGain.gain.linearRampToValueAtTime(0.14, t + 0.004);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    osc.connect(toneGain);
    toneGain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.06);

    if (this._noiseBuffer) {
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = this._noiseBuffer;

      const nFilter = this.ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(800 * layerFactor, t);
      nFilter.Q.setValueAtTime(1.5, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, t);
      nGain.gain.linearRampToValueAtTime(0.08, t + 0.003);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(masterGain);

      nSrc.start(t);
      nSrc.stop(t + 0.04);
    }
  }

  // --- Core Satisfying Sound: Procedural Crackling Explosion (Upgraded Punch) ---
  playExplosion(cascadeIndex = 0, isTarget = false) {
    this._initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    const panVal = Math.max(-0.85, Math.min(0.85, ((cascadeIndex % 5) - 2) * 0.35 + (Math.random() * 0.2 - 0.1)));
    if (panNode) {
      panNode.pan.setValueAtTime(panVal, t);
      masterGain.connect(panNode);
      panNode.connect(this.ctx.destination);
    } else {
      masterGain.connect(this.ctx.destination);
    }

    const basePitchRatio = Math.min(2.0, 1.0 + cascadeIndex * 0.08 + (Math.random() * 0.15 - 0.07));
    const duration = isTarget ? 1.5 : Math.min(1.0, 0.55 + cascadeIndex * 0.04);

    // Boost explosion levels for a punchier feel
    const peakVolume = isTarget ? 0.95 : Math.min(0.82, 0.58 + cascadeIndex * 0.04);
    masterGain.gain.setValueAtTime(0.001, t);
    masterGain.gain.exponentialRampToValueAtTime(peakVolume, t + 0.008);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    // Layer 1: Sub-bass Punch Thump
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = isTarget ? 'triangle' : 'sine';
    const startFreq = (isTarget ? 180 : 145) * basePitchRatio;
    const endFreq = isTarget ? 22 : 30;
    subOsc.frequency.setValueAtTime(startFreq, t);
    subOsc.frequency.exponentialRampToValueAtTime(endFreq, t + (isTarget ? 0.42 : 0.26));

    subGain.gain.setValueAtTime(0.9, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + (isTarget ? 0.5 : 0.3));

    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(t);
    subOsc.stop(t + duration);

    // Layer 2: Filtered Crunchy Noise Body
    if (this._noiseBuffer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this._noiseBuffer;
      noiseSrc.playbackRate.setValueAtTime(basePitchRatio, t);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const centerFreq = (isTarget ? 500 : 780) * basePitchRatio;
      filter.frequency.setValueAtTime(centerFreq, t);
      filter.frequency.exponentialRampToValueAtTime(110, t + duration * 0.7);
      filter.Q.setValueAtTime(1.8, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isTarget ? 0.95 : 0.72, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._distortionCurve;

      noiseSrc.connect(filter);
      filter.connect(shaper);
      shaper.connect(noiseGain);
      noiseGain.connect(masterGain);

      noiseSrc.start(t);
      noiseSrc.stop(t + duration);
    }

    // Layer 3: Satisfying Plastic Micro-Crackle & Debris Rattles
    if (this._crackleBuffer) {
      const crackleSrc = this.ctx.createBufferSource();
      crackleSrc.buffer = this._crackleBuffer;
      crackleSrc.playbackRate.setValueAtTime((1.1 + Math.random() * 0.4) * basePitchRatio, t);

      const crackleFilter = this.ctx.createBiquadFilter();
      crackleFilter.type = 'highpass';
      crackleFilter.frequency.setValueAtTime(isTarget ? 1300 : 1700, t);

      const crackleGain = this.ctx.createGain();
      crackleGain.gain.setValueAtTime(0.001, t);
      crackleGain.gain.linearRampToValueAtTime(isTarget ? 0.85 : 0.65, t + 0.02);
      crackleGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      crackleSrc.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(masterGain);

      crackleSrc.start(t);
      crackleSrc.stop(t + duration);
    }

    // Layer 4: Discrete Pop/Snap Burst Particles
    const popCount = isTarget ? 7 : 4;
    for (let i = 0; i < popCount; i++) {
      const popDelay = t + 0.015 + Math.random() * (duration * 0.6);
      const popOsc = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();
      popOsc.type = 'square';
      const popFreq = 380 + Math.random() * 1100;
      popOsc.frequency.setValueAtTime(popFreq, popDelay);
      popOsc.frequency.exponentialRampToValueAtTime(70, popDelay + 0.035);

      popGain.gain.setValueAtTime(0.2, popDelay);
      popGain.gain.exponentialRampToValueAtTime(0.0001, popDelay + 0.035);

      popOsc.connect(popGain);
      popGain.connect(masterGain);

      popOsc.start(popDelay);
      popOsc.stop(popDelay + 0.04);
    }
  }

  // --- Solve Bounce Acoustic Chime (Softened & Calibrated) ---
  playSolvePulse(pulseIndex = 0, totalPulses = 4) {
    this._initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.connect(this.ctx.destination);

    const scale = [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.51];
    const freq = scale[pulseIndex % scale.length];

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, t);
    osc1.frequency.exponentialRampToValueAtTime(freq * 1.01, t + 0.05);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.76, t);

    const bottomThump = this.ctx.createOscillator();
    bottomThump.type = 'sine';
    bottomThump.frequency.setValueAtTime(130 + pulseIndex * 15, t);
    bottomThump.frequency.exponentialRampToValueAtTime(45, t + 0.10);

    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.18, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    bottomThump.connect(thumpGain);
    thumpGain.connect(gain);

    const dur = 0.45;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc1.connect(gain);
    osc2.connect(gain);

    osc1.start(t);
    osc2.start(t);
    bottomThump.start(t);

    osc1.stop(t + dur);
    osc2.stop(t + dur);
    bottomThump.stop(t + dur);
  }

  // --- Victory Fanfare (Softened & Calibrated) ---
  playSolveSuccess() {
    this._initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.5];
    chords.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      g.gain.setValueAtTime(0.001, t + idx * 0.06);
      g.gain.linearRampToValueAtTime(0.12, t + idx * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.06 + 0.6);

      osc.connect(g);
      g.connect(this.ctx.destination);

      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.65);
    });
  }

  // --- Cheat / Scan Tone ---
  playCheatTone() {
    this._initContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(960, t + 0.16);

    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}

globalThis.soundFX = new SoundFX();
globalThis.SoundFX = SoundFX;
if (typeof module !== 'undefined' && module.exports) module.exports = SoundFX;