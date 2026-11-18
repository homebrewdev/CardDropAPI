// «Jingle Bells» (Дж. Пирпонт, 1857 — общественное достояние), припев.
// Синтез через Web Audio: мелодия + бас + бубенцы, без аудиофайлов.
// 16 тактов по 4 доли при 256 BPM ≈ 15 с; припев звучит дважды — ≈ 30 секунд.

const BPM = 256;
const REPEATS = 2;
const CHORUS_SEC = 16 * 4 * (60 / BPM);
const BEAT = 60 / BPM;

const N: Record<string, number> = {
  G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, Fs3: 185.0, G3: 196.0,
  G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33,
};

// [нота, длительность в долях]
const MELODY: [string, number][] = [
  ["B4", 1], ["B4", 1], ["B4", 2],
  ["B4", 1], ["B4", 1], ["B4", 2],
  ["B4", 1], ["D5", 1], ["G4", 1.5], ["A4", 0.5],
  ["B4", 4],
  ["C5", 1], ["C5", 1], ["C5", 1.5], ["C5", 0.5],
  ["C5", 1], ["B4", 1], ["B4", 1], ["B4", 0.5], ["B4", 0.5],
  ["B4", 1], ["A4", 1], ["A4", 1], ["B4", 1],
  ["A4", 2], ["D5", 2],
  ["B4", 1], ["B4", 1], ["B4", 2],
  ["B4", 1], ["B4", 1], ["B4", 2],
  ["B4", 1], ["D5", 1], ["G4", 1.5], ["A4", 0.5],
  ["B4", 4],
  ["C5", 1], ["C5", 1], ["C5", 1.5], ["C5", 0.5],
  ["C5", 1], ["B4", 1], ["B4", 1], ["B4", 0.5], ["B4", 0.5],
  ["D5", 1], ["D5", 1], ["C5", 1], ["A4", 1],
  ["G4", 4],
];

// Бас «ум-па»: [основной тон, квинта] на каждый такт
const BASS: [string, string][] = [
  ["G2", "D3"], ["G2", "D3"], ["G2", "D3"], ["G2", "D3"],
  ["C3", "G3"], ["G2", "D3"], ["A2", "E3"], ["D3", "Fs3"],
  ["G2", "D3"], ["G2", "D3"], ["G2", "D3"], ["G2", "D3"],
  ["C3", "G3"], ["G2", "D3"], ["D3", "Fs3"], ["G2", "D3"],
];

export const JINGLE_DURATION_SEC = REPEATS * CHORUS_SEC + 0.6;

function tone(
  ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number,
  type: OscillatorType, vol: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(vol * 0.5, start + dur * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.95);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur);
}

function bell(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, start: number, vol: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  src.connect(hp).connect(gain).connect(out);
  src.start(start);
  src.stop(start + 0.15);
}

/** Запускает песню. Возвращает функцию остановки. */
export function playJingleBells(onEnd: () => void): () => void {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  const start = ctx.currentTime + 0.1;
  for (let rep = 0; rep < REPEATS; rep++) {
    const t0 = start + rep * CHORUS_SEC;

    let t = t0;
    for (const [note, beats] of MELODY) {
      const d = beats * BEAT;
      tone(ctx, master, N[note], t, d, "triangle", 0.5);
      tone(ctx, master, N[note] * 2, t, d, "sine", 0.08); // призвук «колокольчика»
      t += d;
    }

    BASS.forEach(([root, fifth], bar) => {
      const b = t0 + bar * 4 * BEAT;
      tone(ctx, master, N[root], b, BEAT, "sine", 0.35);
      tone(ctx, master, N[fifth], b + 2 * BEAT, BEAT, "sine", 0.25);
    });
  }

  // Бубенцы на каждую долю (при двойном темпе дробнее было бы шумом)
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  for (let i = 0; i < REPEATS * 16 * 4; i++) {
    bell(ctx, master, noise, start + i * BEAT, i % 2 ? 0.12 : 0.22);
  }

  let stopped = false;
  const timer = window.setTimeout(stop, JINGLE_DURATION_SEC * 1000 + 200);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    window.setTimeout(() => ctx.close().catch(() => {}), 200);
    onEnd();
  }

  return stop;
}
