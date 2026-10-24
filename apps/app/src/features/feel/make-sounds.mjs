// Writes the four interface sounds Android plays (sounds/*.wav), synthesised the same way the
// web plays them with WebAudio (sound.web.ts, from b2.html's sound()). Run it after changing
// a sound there:  node apps/app/src/features/feel/make-sounds.mjs

import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 44100;
const out = new URL("./sounds/", import.meta.url);
mkdirSync(out, { recursive: true });

/** A WebAudio-style tone: a 6 ms linear attack to `vol`, then an exponential fall over `dur`. */
function tone(buf, freq, at, dur, type, vol) {
  const start = Math.round(at * RATE);
  const end = Math.min(buf.length, Math.round((at + dur + 0.02) * RATE));
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE;
    const phase = (freq * t) % 1;
    const wave = type === "sine" ? Math.sin(2 * Math.PI * phase) : 1 - 4 * Math.abs(phase - 0.5);
    const gain =
      t < 0.006 ? (vol * t) / 0.006 : t < dur ? vol * Math.pow(0.0001 / vol, (t - 0.006) / (dur - 0.006)) : 0;
    buf[i] += wave * gain;
  }
}

/** Fading noise through a band-pass sweeping 500 to 2600 Hz, like the web's swoosh. */
function swoosh(buf) {
  const n = Math.round(RATE * 0.2);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 500 * Math.pow(2600 / 500, Math.min(t, 0.18) / 0.18);
    // RBJ band-pass (0 dB peak), Q 1.2, recomputed per sample as the frequency sweeps.
    const w = (2 * Math.PI * f) / RATE;
    const alpha = Math.sin(w) / (2 * 1.2);
    const a0 = 1 + alpha;
    const x = noise() * (1 - i / n);
    const y = (alpha * x - alpha * x2 + 2 * Math.cos(w) * y1 - (1 - alpha) * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] += y * 0.12;
  }
}

const SOUNDS = {
  tick: (b) => tone(b, 1500, 0, 0.045, "sine", 0.07),
  done: (b) => {
    tone(b, 660, 0, 0.16, "triangle", 0.09);
    tone(b, 990, 0.07, 0.22, "triangle", 0.08);
  },
  soft: (b) => tone(b, 240, 0, 0.1, "sine", 0.1),
  swoosh,
};
const LENGTH = { tick: 0.07, done: 0.32, soft: 0.13, swoosh: 0.22 };

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

for (const [name, draw] of Object.entries(SOUNDS)) {
  const buf = new Float64Array(Math.round(LENGTH[name] * RATE));
  draw(buf);
  writeFileSync(new URL(`${name}.wav`, out), wav(buf));
  console.log(`wrote sounds/${name}.wav`);
}
