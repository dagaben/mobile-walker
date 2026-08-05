/**
 * Procedural day/night ambient audio for Vampire Ducks 2.0.
 * Day: soft pad + occasional bird-like stingers.
 * Night: low drone + pulse + owl + rare wolf howl.
 * All synthesis via Web Audio API (no external assets).
 */

export type AudioPhase = "day" | "night" | "off";

/** Next delay (seconds) before a stinger can fire. Day is shorter / livelier. */
export function nextStingerDelaySeconds(
  phase: "day" | "night",
  rand: () => number = Math.random,
): number {
  const r = Math.min(1, Math.max(0, rand()));
  if (phase === "day") {
    // 4–12 s
    return 4 + r * 8;
  }
  // Night: 9–22 s (always longer than day min)
  return 9 + r * 13;
}

/** ~18 % chance a night stinger is a wolf howl instead of an owl. */
export function shouldPlayWolfHowl(rand: () => number = Math.random): boolean {
  return rand() < 0.18;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private stingerGain: GainNode | null = null;
  private phase: AudioPhase = "off";
  private muted = false;
  private bedNodes: AudioNode[] = [];
  private stingerTimer: number | null = null;
  private running = false;

  /** Call from a user gesture (PLAY) so AudioContext can start. */
  resume(): void {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    this.running = true;
    if (this.phase === "off") this.setPhase("day");
    else this.restartBed();
  }

  setPhase(phase: AudioPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.stopBed();
    if (this.stingerTimer != null) {
      window.clearTimeout(this.stingerTimer);
      this.stingerTimer = null;
    }
    if (phase === "off" || !this.running || this.muted) return;
    this.restartBed();
    this.scheduleNextStinger();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx!.currentTime, 0.05);
    }
    if (this.muted) {
      this.stopBed();
      if (this.stingerTimer != null) {
        window.clearTimeout(this.stingerTimer);
        this.stingerTimer = null;
      }
    } else if (this.running && this.phase !== "off") {
      this.restartBed();
      this.scheduleNextStinger();
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Suspend oscillators when tab is hidden (saves CPU / battery). */
  suspend(): void {
    this.stopBed();
    if (this.stingerTimer != null) {
      window.clearTimeout(this.stingerTimer);
      this.stingerTimer = null;
    }
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }

  dispose(): void {
    this.running = false;
    this.stopBed();
    if (this.stingerTimer != null) {
      window.clearTimeout(this.stingerTimer);
      this.stingerTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.master = null;
    this.bedGain = null;
    this.stingerGain = null;
  }

  private init(): void {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.bedGain = this.ctx.createGain();
      this.bedGain.gain.value = 0.45;
      this.bedGain.connect(this.master);
      this.stingerGain = this.ctx.createGain();
      this.stingerGain.gain.value = 0.7;
      this.stingerGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
  }

  private stopBed(): void {
    for (const n of this.bedNodes) {
      try {
        if ("stop" in n && typeof (n as OscillatorNode).stop === "function") {
          (n as OscillatorNode).stop();
        }
        n.disconnect();
      } catch { /* already stopped */ }
    }
    this.bedNodes = [];
  }

  private restartBed(): void {
    if (!this.ctx || !this.bedGain || this.muted || this.phase === "off") return;
    this.stopBed();
    if (this.phase === "day") this.startDayBed();
    else this.startNightBed();
  }

  private startDayBed(): void {
    if (!this.ctx || !this.bedGain) return;
    const t = this.ctx.currentTime;
    // Soft major pad: two gentle sines
    const freqs = [196, 246.94]; // G3 + B3
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 2.5);
      osc.connect(g);
      g.connect(this.bedGain);
      osc.start(t);
      this.bedNodes.push(osc, g);
    }
    // Very quiet high shimmer
    const shimmer = this.ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = 523.25;
    const sg = this.ctx.createGain();
    sg.gain.value = 0.018;
    shimmer.connect(sg);
    sg.connect(this.bedGain);
    shimmer.start(t);
    this.bedNodes.push(shimmer, sg);
  }

  private startNightBed(): void {
    if (!this.ctx || !this.bedGain) return;
    const t = this.ctx.currentTime;
    // Low ominous drone
    const drone = this.ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 55;
    const dg = this.ctx.createGain();
    dg.gain.setValueAtTime(0, t);
    dg.gain.linearRampToValueAtTime(0.12, t + 3);
    drone.connect(dg);
    dg.connect(this.bedGain);
    drone.start(t);
    this.bedNodes.push(drone, dg);

    // Subtle sub + detuned layer
    const sub = this.ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = 41;
    const sg = this.ctx.createGain();
    sg.gain.value = 0.06;
    sub.connect(sg);
    sg.connect(this.bedGain);
    sub.start(t);
    this.bedNodes.push(sub, sg);

    // Slow pulse LFO on a mid tone
    const pulse = this.ctx.createOscillator();
    pulse.type = "sine";
    pulse.frequency.value = 82.4;
    const pg = this.ctx.createGain();
    pg.gain.value = 0.04;
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.35;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG);
    lfoG.connect(pg.gain);
    pulse.connect(pg);
    pg.connect(this.bedGain);
    pulse.start(t);
    lfo.start(t);
    this.bedNodes.push(pulse, pg, lfo, lfoG);
  }

  private scheduleNextStinger(): void {
    if (!this.ctx || this.muted || this.phase === "off" || !this.running) return;
    const delay = nextStingerDelaySeconds(this.phase === "day" ? "day" : "night");
    this.stingerTimer = window.setTimeout(() => {
      this.stingerTimer = null;
      this.playStinger();
      this.scheduleNextStinger();
    }, delay * 1000);
  }

  private playStinger(): void {
    if (!this.ctx || !this.stingerGain || this.muted) return;
    if (this.phase === "day") this.playBirdChirp();
    else if (shouldPlayWolfHowl()) this.playWolfHowl();
    else this.playOwlHoot();
  }

  private playBirdChirp(): void {
    if (!this.ctx || !this.stingerGain) return;
    const t = this.ctx.currentTime;
    const base = 1800 + Math.random() * 900;
    for (let i = 0; i < 3; i += 1) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      const start = t + i * 0.07;
      osc.frequency.setValueAtTime(base + i * 120, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.4 + i * 80, start + 0.09);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(g);
      g.connect(this.stingerGain);
      osc.start(start);
      osc.stop(start + 0.16);
    }
  }

  private playOwlHoot(): void {
    if (!this.ctx || !this.stingerGain) return;
    const t = this.ctx.currentTime;
    // Two soft descending hoots
    for (let i = 0; i < 2; i += 1) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      const start = t + i * 0.55;
      osc.frequency.setValueAtTime(420 - i * 30, start);
      osc.frequency.exponentialRampToValueAtTime(280 - i * 20, start + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.28, start + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(g);
      g.connect(this.stingerGain);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  }

  private playWolfHowl(): void {
    if (!this.ctx || !this.stingerGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.9);
    osc.frequency.linearRampToValueAtTime(140, t + 2.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.linearRampToValueAtTime(1200, t + 0.8);
    filter.frequency.linearRampToValueAtTime(400, t + 2.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.25);
    g.gain.setValueAtTime(0.15, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.stingerGain);
    osc.start(t);
    osc.stop(t + 2.7);
  }
}
