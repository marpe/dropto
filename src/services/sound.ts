class SoundService {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public playConnect() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this.playTone(523.25, now, 0.12, 'sine'); // C5
    this.playTone(659.25, now + 0.1, 0.18, 'sine'); // E5
  }

  public playStart() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this.playTone(440, now, 0.1, 'sine'); // A4
    this.playTone(554.37, now + 0.08, 0.1, 'sine'); // C#5
    this.playTone(659.25, now + 0.16, 0.2, 'sine'); // E5
  }

  public playComplete() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this.playTone(523.25, now, 0.15, 'triangle'); // C5
    this.playTone(659.25, now + 0.12, 0.15, 'triangle'); // E5
    this.playTone(783.99, now + 0.24, 0.18, 'triangle'); // G5
    this.playTone(1046.50, now + 0.36, 0.35, 'triangle'); // C6
  }

  public playError() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this.playTone(330, now, 0.12, 'sawtooth');
    this.playTone(277.18, now + 0.1, 0.2, 'sawtooth');
  }

  private playTone(freq: number, startTime: number, duration: number, type: OscillatorType) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (e) {
      // Audio autoplay policy or background context error safe catch
    }
  }
}

export const soundService = new SoundService();
