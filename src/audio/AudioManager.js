/**
 * Procedural SFX + music via Web Audio API (no external files).
 * Unlock on first user gesture, then play from game events.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.enabled = true;
    this.unlocked = false;
    this.musicPlaying = false;
    this._musicTimer = null;
    this._musicStep = 0;
    this._musicMode = 'menu'; // 'menu' | 'fight' | 'victory'
    this._noiseBuffer = null;

    this.sfxVolume = 0.55;
    this.musicVolume = 0.22;

    this._bindUnlock();
  }

  _bindUnlock() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    this._noiseBuffer = this._makeNoiseBuffer(1.0);
    this.unlocked = true;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    // Resume music if something already requested it
    if (this.musicPlaying) this._scheduleMusicLoop();
  }

  _ensure() {
    if (!this.unlocked) this.unlock();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.enabled && !!this.ctx;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.master) return;
    this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    if (!on) this.stopMusic();
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  // ─── low-level helpers ───────────────────────────────────────────

  _now() {
    return this.ctx.currentTime;
  }

  _makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone({
    type = 'square',
    freq = 440,
    freqEnd = null,
    duration = 0.12,
    gain = 0.2,
    attack = 0.005,
    decay = 0.08,
    delay = 0,
    dest = null
  }) {
    if (!this._ensure()) return;
    const t0 = this._now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, duration));
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise({
    duration = 0.1,
    gain = 0.15,
    attack = 0.005,
    filterFreq = 1200,
    filterType = 'lowpass',
    delay = 0,
    dest = null
  }) {
    if (!this._ensure() || !this._noiseBuffer) return;
    const t0 = this._now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  // ─── SFX ─────────────────────────────────────────────────────────

  playHit({ heavy = false, blocked = false, shieldBreak = false } = {}) {
    if (!this._ensure()) return;
    // Slight random pitch so repeated hits don't sound identical
    const detune = 0.92 + Math.random() * 0.16;

    if (shieldBreak) {
      this._noise({ duration: 0.32, gain: 0.32, filterFreq: 700, filterType: 'bandpass' });
      this._noise({ duration: 0.12, gain: 0.2, filterFreq: 3200, filterType: 'highpass', delay: 0.01 });
      this._tone({ type: 'sawtooth', freq: 200 * detune, freqEnd: 55, duration: 0.38, gain: 0.24 });
      this._tone({ type: 'sine', freq: 70 * detune, freqEnd: 35, duration: 0.45, gain: 0.28 });
      this._tone({ type: 'square', freq: 110 * detune, freqEnd: 45, duration: 0.3, gain: 0.14, delay: 0.03 });
      return;
    }
    if (blocked) {
      // Metallic clank
      this._tone({ type: 'triangle', freq: 680 * detune, freqEnd: 320, duration: 0.07, gain: 0.14 });
      this._tone({ type: 'square', freq: 420 * detune, freqEnd: 180, duration: 0.09, gain: 0.08, delay: 0.01 });
      this._noise({ duration: 0.05, gain: 0.12, filterFreq: 2400, filterType: 'highpass' });
      return;
    }
    if (heavy) {
      // Big punch: sub thump + mid slam + high crack + short rumble
      this._tone({ type: 'sine', freq: 95 * detune, freqEnd: 38, duration: 0.22, gain: 0.32, attack: 0.002 });
      this._tone({ type: 'triangle', freq: 180 * detune, freqEnd: 70, duration: 0.16, gain: 0.2, attack: 0.002 });
      this._tone({ type: 'square', freq: 130 * detune, freqEnd: 50, duration: 0.14, gain: 0.12, attack: 0.003 });
      this._noise({ duration: 0.08, gain: 0.26, filterFreq: 1800, filterType: 'highpass', attack: 0.001 });
      this._noise({ duration: 0.18, gain: 0.18, filterFreq: 450, filterType: 'lowpass', delay: 0.015 });
      this._tone({ type: 'sawtooth', freq: 70 * detune, freqEnd: 30, duration: 0.28, gain: 0.1, delay: 0.02 });
    } else {
      // Snappy light hit: click + body + soft thump
      this._noise({ duration: 0.04, gain: 0.2, filterFreq: 3500, filterType: 'highpass', attack: 0.001 });
      this._tone({ type: 'triangle', freq: 320 * detune, freqEnd: 110, duration: 0.09, gain: 0.18, attack: 0.002 });
      this._tone({ type: 'sine', freq: 140 * detune, freqEnd: 55, duration: 0.11, gain: 0.16, attack: 0.002 });
      this._tone({ type: 'square', freq: 220 * detune, freqEnd: 90, duration: 0.07, gain: 0.08, attack: 0.002 });
      this._noise({ duration: 0.07, gain: 0.1, filterFreq: 900, filterType: 'bandpass', delay: 0.008 });
    }
  }

  playSwing({ heavy = false } = {}) {
    if (!this._ensure()) return;
    if (heavy) {
      this._noise({ duration: 0.16, gain: 0.12, filterFreq: 900, filterType: 'bandpass' });
      this._tone({ type: 'sawtooth', freq: 220, freqEnd: 90, duration: 0.14, gain: 0.08 });
    } else {
      this._noise({ duration: 0.08, gain: 0.08, filterFreq: 2200, filterType: 'highpass' });
      this._tone({ type: 'triangle', freq: 480, freqEnd: 200, duration: 0.07, gain: 0.06 });
    }
  }

  playJump({ doubleJump = false } = {}) {
    if (!this._ensure()) return;
    if (doubleJump) {
      this._tone({ type: 'square', freq: 360, freqEnd: 720, duration: 0.12, gain: 0.1 });
      this._tone({ type: 'triangle', freq: 540, freqEnd: 900, duration: 0.1, gain: 0.06, delay: 0.03 });
    } else {
      this._tone({ type: 'square', freq: 220, freqEnd: 480, duration: 0.11, gain: 0.11 });
    }
  }

  playDodge() {
    if (!this._ensure()) return;
    this._noise({ duration: 0.12, gain: 0.1, filterFreq: 2800, filterType: 'highpass' });
    this._tone({ type: 'triangle', freq: 600, freqEnd: 200, duration: 0.1, gain: 0.07 });
  }

  playShield() {
    if (!this._ensure()) return;
    this._tone({ type: 'sine', freq: 640, freqEnd: 420, duration: 0.08, gain: 0.06 });
  }

  playSpecial() {
    if (!this._ensure()) return;
    this._tone({ type: 'square', freq: 300, freqEnd: 600, duration: 0.14, gain: 0.1 });
    this._tone({ type: 'triangle', freq: 450, freqEnd: 900, duration: 0.16, gain: 0.07, delay: 0.04 });
    this._noise({ duration: 0.1, gain: 0.08, filterFreq: 1600, delay: 0.02 });
  }

  /** California counter success — bright glass chime + reverse whoosh. */
  playCounter() {
    if (!this._ensure()) return;
    this._tone({ type: 'sine', freq: 880, freqEnd: 1320, duration: 0.12, gain: 0.16, attack: 0.001 });
    this._tone({ type: 'triangle', freq: 660, freqEnd: 990, duration: 0.16, gain: 0.12, delay: 0.02 });
    this._tone({ type: 'square', freq: 440, freqEnd: 220, duration: 0.1, gain: 0.08, delay: 0.04 });
    this._noise({ duration: 0.14, gain: 0.14, filterFreq: 2800, filterType: 'highpass', attack: 0.001 });
    this._noise({ duration: 0.1, gain: 0.1, filterFreq: 900, filterType: 'bandpass', delay: 0.03 });
  }

  playKo() {
    if (!this._ensure()) return;
    this._noise({ duration: 0.35, gain: 0.25, filterFreq: 500 });
    this._tone({ type: 'sawtooth', freq: 160, freqEnd: 40, duration: 0.45, gain: 0.22 });
    this._tone({ type: 'square', freq: 80, freqEnd: 30, duration: 0.5, gain: 0.16, delay: 0.04 });
  }

  /** Steam vent telegraph — soft hiss rise. */
  playHazardWarn() {
    if (!this._ensure()) return;
    this._noise({ duration: 0.22, gain: 0.08, filterFreq: 1800, filterType: 'bandpass' });
    this._tone({ type: 'sine', freq: 180, freqEnd: 320, duration: 0.18, gain: 0.05 });
  }

  /** Steam vent burst — airy whoosh + soft pop. */
  playHazardBurst() {
    if (!this._ensure()) return;
    this._noise({ duration: 0.28, gain: 0.16, filterFreq: 1200, filterType: 'bandpass' });
    this._noise({ duration: 0.14, gain: 0.1, filterFreq: 2800, filterType: 'highpass', delay: 0.02 });
    this._tone({ type: 'triangle', freq: 140, freqEnd: 60, duration: 0.2, gain: 0.08 });
  }

  playUiSelect() {
    if (!this._ensure()) return;
    this._tone({ type: 'square', freq: 520, duration: 0.05, gain: 0.08 });
    this._tone({ type: 'square', freq: 780, duration: 0.07, gain: 0.06, delay: 0.04 });
  }

  playUiConfirm() {
    if (!this._ensure()) return;
    this._tone({ type: 'square', freq: 400, duration: 0.06, gain: 0.09 });
    this._tone({ type: 'square', freq: 600, duration: 0.08, gain: 0.08, delay: 0.05 });
    this._tone({ type: 'triangle', freq: 900, duration: 0.1, gain: 0.06, delay: 0.1 });
  }

  playVictory() {
    if (!this._ensure()) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this._tone({ type: 'square', freq: f, duration: 0.18, gain: 0.1, delay: i * 0.12 });
      this._tone({ type: 'triangle', freq: f * 2, duration: 0.16, gain: 0.04, delay: i * 0.12 + 0.02 });
    });
  }

  // ─── Music ───────────────────────────────────────────────────────

  playMenuMusic() {
    this._startMusic('menu');
  }

  playFightMusic() {
    this._startMusic('fight');
  }

  playVictoryMusic() {
    this._startMusic('victory');
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimer != null) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _startMusic(mode) {
    this._musicMode = mode;
    this.musicPlaying = true;
    this._musicStep = 0;
    if (!this._ensure()) return;
    if (this._musicTimer != null) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
    this._scheduleMusicLoop();
  }

  _scheduleMusicLoop() {
    if (!this.musicPlaying || !this.ctx) return;

    const patterns = {
      menu: {
        bpm: 96,
        bass: [196, 0, 196, 0, 174.61, 0, 196, 0, 220, 0, 196, 0, 174.61, 0, 146.83, 0],
        lead: [392, 0, 493.88, 523.25, 0, 493.88, 392, 0, 349.23, 392, 0, 329.63, 0, 293.66, 349.23, 0]
      },
      fight: {
        bpm: 128,
        bass: [110, 110, 0, 110, 130.81, 130.81, 0, 130.81, 146.83, 146.83, 0, 146.83, 98, 98, 110, 0],
        lead: [440, 0, 523.25, 0, 587.33, 523.25, 0, 440, 392, 0, 440, 493.88, 0, 523.25, 587.33, 0]
      },
      victory: {
        bpm: 110,
        bass: [130.81, 0, 164.81, 0, 196, 0, 220, 0, 196, 0, 164.81, 0, 130.81, 0, 98, 0],
        lead: [523.25, 587.33, 659.25, 783.99, 0, 659.25, 587.33, 523.25, 0, 659.25, 783.99, 880, 0, 1046.5, 0, 0]
      }
    };

    const pat = patterns[this._musicMode] || patterns.fight;
    const stepDur = 60 / pat.bpm / 2; // 8th notes
    const i = this._musicStep % pat.bass.length;
    const t0 = this._now();

    const bassF = pat.bass[i];
    if (bassF > 0) {
      this._tone({
        type: 'triangle',
        freq: bassF,
        duration: stepDur * 0.85,
        gain: 0.09,
        attack: 0.01,
        dest: this.musicGain
      });
    }

    const leadF = pat.lead[i];
    if (leadF > 0) {
      this._tone({
        type: 'square',
        freq: leadF,
        duration: stepDur * 0.55,
        gain: 0.045,
        attack: 0.008,
        dest: this.musicGain
      });
      // Soft harmony
      this._tone({
        type: 'sine',
        freq: leadF * 1.5,
        duration: stepDur * 0.4,
        gain: 0.02,
        attack: 0.01,
        dest: this.musicGain
      });
    }

    // Light percussion on fight music
    if (this._musicMode === 'fight' && i % 2 === 0) {
      this._noise({
        duration: 0.04,
        gain: 0.04,
        filterFreq: i % 4 === 0 ? 200 : 1200,
        filterType: i % 4 === 0 ? 'lowpass' : 'highpass',
        dest: this.musicGain
      });
    }

    this._musicStep += 1;
    const ms = Math.max(20, stepDur * 1000 - 2);
    this._musicTimer = setTimeout(() => this._scheduleMusicLoop(), ms);
  }
}

/** Shared singleton used by Game / combat / characters. */
export const audio = new AudioManager();
