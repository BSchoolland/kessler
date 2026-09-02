// ZzFX-style micro synth (algorithm after Frank Force's ZzFX, MIT).
const SR = 44100;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain = 0.8;
const cache = new Map<string, AudioBuffer>();

export function audioContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setSfxVolume(v: number): void {
  sfxGain = v;
}

type P = [number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?, number?];

function generate(
  volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1,
  slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0,
  delay = 0, sustainVolume = 1, decay = 0, tremolo = 0,
): Float32Array {
  const PI2 = Math.PI * 2;
  const sign = (v: number) => (v > 0 ? 1 : -1);
  let startSlide = (slide *= (500 * PI2) / SR / SR);
  let startFrequency = (frequency *= ((1 + randomness * 2 * Math.random() - randomness) * PI2) / SR);
  let t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f = 0;
  attack = attack * SR + 9;
  decay *= SR;
  sustain *= SR;
  release *= SR;
  delay *= SR;
  deltaSlide *= (500 * PI2) / SR ** 3;
  modulation *= PI2 / SR;
  pitchJump *= PI2 / SR;
  pitchJumpTime *= SR;
  repeatTime = (repeatTime * SR) | 0;
  const length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(length);
  for (; i < length; b[i++] = s) {
    if (!(++c % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? Math.sin((t % PI2) ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((((2 * t) / PI2) % 2) + 2) % 2)
          : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);
      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        sign(s) * Math.abs(s) ** shapeCurve * volume * 0.3 *
        (i < attack ? i / attack
          : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
          : i < attack + decay + sustain ? sustainVolume
          : i < length - delay ? ((length - i - delay) / release) * sustainVolume
          : 0);
      s = delay ? s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2) : s;
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);
    t += f - f * noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2));
    if (j && ++j > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      j = 0;
    }
    if (repeatTime && !(++r % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      j = j || 1;
    }
  }
  return b;
}

export const SFX = {
  swing: [0.5, 0.1, 420, 0.01, 0.02, 0.07, 4, 1.6, -40, , , , , , , , , 0.6, 0.02] as P,
  swingHeavy: [0.7, 0.1, 300, 0.01, 0.04, 0.1, 4, 1.8, -50, , , , , , , , , 0.6, 0.02] as P,
  hit: [0.9, 0.1, 230, 0.005, 0.02, 0.11, 3, 1.8, -4, , , , , 0.3, , 0.1, , 0.8, 0.02] as P,
  crit: [1.1, 0.1, 160, 0.01, 0.05, 0.22, 3, 2, -6, , , , , 0.7, , 0.2, , 0.8, 0.03] as P,
  kill: [1, 0.1, 95, 0.02, 0.09, 0.33, 4, 1.5, -2, , , , , 1.1, , 0.3, , 0.7, 0.05] as P,
  bossKill: [1.6, 0.05, 50, 0.05, 0.4, 1.2, 4, 2, -1, , , , , 1.5, , 0.5, 0.2, 0.6, 0.2] as P,
  impact: [0.9, 0.1, 62, 0.01, 0.05, 0.28, 4, 2.2, , , , , , 1.8, , 0.4, , 0.6, 0.05] as P,
  void: [0.7, 0.05, 880, 0.08, 0.25, 0.55, 0, 1, -9, -1.5, , , , , , , , 0.5, 0.1] as P,
  dash: [0.6, 0.05, 520, 0.01, 0.05, 0.1, 0, 1, 22, , , , , , , , , 0.55, 0.02] as P,
  land: [0.45, 0.1, 120, , 0.02, 0.07, 4, 2, , , , , , 0.5, , , , 0.5] as P,
  hurt: [1, 0.05, 260, 0.01, 0.08, 0.24, 2, 1.5, -10, , , , , 0.3, , 0.2, , 0.7, 0.05] as P,
  shot: [0.55, 0.05, 720, 0.01, 0.04, 0.12, 1, 1.2, -16, , , , , , , , , 0.5, 0.02] as P,
  telegraph: [0.45, 0.02, 320, 0.02, 0.14, 0.18, 1, 1, , , , , , , , , , 0.5, 0.05] as P,
  shockwave: [1, 0.05, 78, 0.02, 0.2, 0.5, 4, 2, -1, , , , , 1, , 0.5, , 0.6, 0.1] as P,
  wave: [0.7, 0, 440, 0.02, 0.18, 0.3, 0, 1, , , 220, 0.1, , , , , , 0.6, 0.05] as P,
  boss: [1, 0.02, 55, 0.05, 0.4, 0.8, 2, 1.5, , , , , 0.1, 0.5, , 0.3, , 0.6, 0.1] as P,
  upgrade: [0.8, 0, 523, 0.02, 0.14, 0.3, 0, 1, , , 262, 0.08, , , , , , 0.7, 0.05] as P,
  combo: [0.6, 0, 660, 0.01, 0.05, 0.1, 0, 1, , , 330, 0.05, , , , , , 0.6] as P,
  debrisHit: [0.5, 0.1, 300, , 0.02, 0.08, 3, 1.5, -5, , , , , 0.3, , , , 0.6] as P,
  deflect: [0.7, 0.05, 900, 0.01, 0.04, 0.15, 0, 1, 30, , , , , , , , , 0.6, 0.02] as P,
  death: [1.4, 0.02, 110, 0.1, 0.4, 1, 2, 1.3, -5, , , , , 0.6, , 0.3, , 0.6, 0.2] as P,
  pull: [0.8, 0.02, 90, 0.1, 0.8, 0.5, 2, 1, 2, , , , 0.06, 0.2, 8, , , 0.5, 0.1] as P,
  phase: [1, 0.02, 200, 0.05, 0.3, 0.6, 2, 1.5, -3, , -100, 0.2, , 0.4, , 0.2, , 0.6, 0.1] as P,
  sector: [0.9, 0, 330, 0.05, 0.3, 0.6, 0, 1, , , 165, 0.15, , , , , 0.1, 0.6, 0.1] as P,
  pod: [0.5, 0.1, 200, 0.02, 0.1, 0.3, 4, 1.5, -3, , , , , 0.8, , 0.2, , 0.5, 0.05] as P,
  click: [0.4, 0, 800, , 0.01, 0.04, 1, 1, , , , , , , , , , 0.5] as P,
  gunshot: [1.1, 0.05, 140, 0.005, 0.03, 0.18, 4, 2.5, -20, , , , , 1.2, , 0.3, , 0.7, 0.03] as P,
  empty: [0.5, 0, 1200, , 0.01, 0.03, 1, 1, , , , , , , , , , 0.4] as P,
  ammo: [0.45, 0.05, 900, 0.005, 0.02, 0.06, 0, 1, 40, , , , , , , , , 0.5] as P,
  dive: [0.8, 0.1, 260, 0.02, 0.18, 0.2, 4, 1.6, -8, , , , , 0.4, , 0.1, , 0.6, 0.05] as P,
  fuelEmpty: [0.5, 0, 300, 0.02, 0.08, 0.15, 2, 1, -6, , , , , , , , , 0.5, 0.05] as P,
  sweep: [0.6, 0.1, 240, 0.01, 0.05, 0.12, 4, 1.6, -25, , , , , 0.2, , , , 0.6, 0.02] as P,
  edgeWave: [0.55, 0.05, 180, 0.01, 0.08, 0.16, 4, 1.4, 18, , , , , 0.5, , 0.1, , 0.6, 0.03] as P,
};

export type SfxName = keyof typeof SFX;

export function play(name: SfxName, volume = 1, pan = 0): void {
  const ac = audioContext();
  if (!ac || !master || sfxGain <= 0) return;
  const key = name;
  let buf = cache.get(key);
  if (!buf) {
    const data = generate(...SFX[name]);
    buf = ac.createBuffer(1, data.length, SR);
    buf.getChannelData(0).set(data);
    cache.set(key, buf);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = volume * sfxGain;
  const p = ac.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(g).connect(p).connect(master);
  src.start();
}

// --- ambient music: a slow evolving pad plus a pulse that tightens with intensity ---
let musicNodes: { osc: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; pulse: GainNode; pulseOsc: OscillatorNode } | null = null;
let musicVolume = 0.5;
let intensity = 0;
let pulseTimer: number | null = null;
const ROOTS = [55, 58.27, 61.74, 49, 51.91];

export function setMusicVolume(v: number): void {
  musicVolume = v;
  if (musicNodes) musicNodes.gain.gain.setTargetAtTime(v * 0.35, musicNodes.gain.context.currentTime, 0.3);
}

export function setIntensity(x: number): void {
  intensity = Math.max(0, Math.min(1, x));
  if (!musicNodes) return;
  const ac = musicNodes.filter.context;
  musicNodes.filter.frequency.setTargetAtTime(220 + intensity * 1400, ac.currentTime, 0.8);
}

export function startMusic(): void {
  const ac = audioContext();
  if (!ac || !master || musicNodes) return;
  const gain = ac.createGain();
  gain.gain.value = musicVolume * 0.35;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 300;
  filter.Q.value = 3;
  filter.connect(gain).connect(master);
  const osc: OscillatorNode[] = [];
  for (const [type, detune, oct] of [["sawtooth", -7, 1], ["sawtooth", 7, 1], ["triangle", 0, 2], ["sine", 0, 0.5]] as const) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = ROOTS[0] * oct;
    o.detune.value = detune;
    const g = ac.createGain();
    g.gain.value = type === "sine" ? 0.5 : 0.18;
    o.connect(g).connect(filter);
    o.start();
    osc.push(o);
  }
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  const pulseOsc = ac.createOscillator();
  pulseOsc.type = "sine";
  pulseOsc.frequency.value = 55;
  const pulse = ac.createGain();
  pulse.gain.value = 0;
  pulseOsc.connect(pulse).connect(master);
  pulseOsc.start();
  musicNodes = { osc, filter, gain, lfo, pulse, pulseOsc };

  let chord = 0;
  const changeChord = () => {
    if (!musicNodes) return;
    chord = (chord + 1) % ROOTS.length;
    const root = ROOTS[chord];
    const t = ac.currentTime;
    const octs = [1, 1, 2, 0.5];
    musicNodes.osc.forEach((o, i) => o.frequency.setTargetAtTime(root * octs[i], t, 1.5));
    window.setTimeout(changeChord, 9000 + Math.random() * 5000);
  };
  window.setTimeout(changeChord, 9000);

  const beat = () => {
    if (!musicNodes) return;
    const t = ac.currentTime;
    if (intensity > 0.15) {
      const v = 0.12 * intensity * musicVolume;
      musicNodes.pulse.gain.cancelScheduledValues(t);
      musicNodes.pulse.gain.setValueAtTime(v, t);
      musicNodes.pulse.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      musicNodes.pulseOsc.frequency.setValueAtTime(90, t);
      musicNodes.pulseOsc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    }
    pulseTimer = window.setTimeout(beat, 700 - intensity * 250);
  };
  beat();
}

// --- thruster loop: filtered noise that fades in while steering in space ---
let thruster: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
let thrustLevel = 0;

export function setThrust(level: number): void {
  const ac = audioContext();
  if (!ac || !master) return;
  if (!thruster) {
    const len = SR * 2;
    const buf = ac.createBuffer(1, len, SR);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise reads as a rocket better than white
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    thruster = { src, gain, filter };
  }
  const target = Math.max(0, Math.min(1, level));
  if (Math.abs(target - thrustLevel) < 0.01) return;
  thrustLevel = target;
  const t = ac.currentTime;
  thruster.gain.gain.setTargetAtTime(target * 0.35 * sfxGain, t, target > 0 ? 0.05 : 0.12);
  thruster.filter.frequency.setTargetAtTime(380 + target * 500, t, 0.1);
}

export function stopMusic(): void {
  if (!musicNodes) return;
  for (const o of musicNodes.osc) o.stop();
  musicNodes.lfo.stop();
  musicNodes.pulseOsc.stop();
  if (pulseTimer) window.clearTimeout(pulseTimer);
  musicNodes = null;
}
