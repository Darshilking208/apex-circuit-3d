/**
 * Procedural Web Audio synthesizer for arcade racing feedback.
 * Zero external audio assets. Respects mute and pause states cleanly.
 */
export class RacingAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private screechGain: GainNode | null = null;
  private muted = false;
  private active = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        mute ? 0 : 0.35,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.35;
      this.masterGain.connect(this.ctx.destination);

      // Continuous engine dual-oscillator synth
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;

      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'triangle';
      this.subOsc.frequency.value = 27.5;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 260;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;

      this.engineOsc.connect(this.engineFilter);
      this.subOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOsc.start();
      this.subOsc.start();

      // Tire screech noise loop
      const bufSize = this.ctx.sampleRate;
      const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const screechFilter = this.ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1450;
      screechFilter.Q.value = 4.2;

      this.screechGain = this.ctx.createGain();
      this.screechGain.gain.value = 0;

      noiseSrc.connect(screechFilter);
      screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.masterGain);
      noiseSrc.start();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setPlaying(playing: boolean): void {
    this.active = playing;
    if (!this.ctx || !this.engineGain || !this.screechGain) return;
    if (!playing) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  public update(speedRatio: number, lateralSlip: number, accelerating: boolean): void {
    if (!this.ctx || !this.active || !this.engineOsc || !this.subOsc || !this.engineFilter || !this.engineGain || !this.screechGain) {
      return;
    }
    const now = this.ctx.currentTime;
    // Simulated 5-speed transmission sawtooth RPM curve
    const gear = Math.min(5, Math.floor(speedRatio * 4.8) + 1);
    const gearSpan = 1 / 5;
    const gearLocal = ((speedRatio - (gear - 1) * gearSpan * 0.85) / gearSpan) % 1;
    const rpm = 0.25 + 0.75 * Math.max(0, Math.min(1, gearLocal + speedRatio * 0.3));

    const baseFreq = 46 + rpm * 125;
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(210 + rpm * 650, now, 0.05);
    this.engineGain.gain.setTargetAtTime(
      accelerating ? 0.19 : 0.09,
      now,
      0.06
    );

    const slipLevel = Math.max(0, Math.min(1, (lateralSlip - 3.2) / 10));
    this.screechGain.gain.setTargetAtTime(slipLevel * 0.14, now, 0.04);
  }

  public playImpact(strength: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
    const amp = Math.min(0.45, 0.15 + strength * 0.02);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playCheckpoint(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.07);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playLapComplete(isFinalFinish: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const notes = isFinalFinish ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
