// Interface sounds on the web, synthesised with WebAudio exactly as b2.html's sound() does, so
// there are no files to load. Quiet (gain 0.07 to 0.12) and short (under 300 ms): a sound only
// confirms what the screen already shows. Off unless the person turned Sounds on.

import { soundsOn } from "./setting";

export type Sound = "tick" | "done" | "soft" | "swoosh";

let ctx: AudioContext | null = null;

export function playSound(kind: Sound) {
  if (!soundsOn()) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    const audio = ctx;
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    const tone = (freq: number, at: number, dur: number, type: OscillatorType, vol: number) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + at);
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    if (kind === "tick") tone(1500, 0, 0.045, "sine", 0.07);
    else if (kind === "done") {
      tone(660, 0, 0.16, "triangle", 0.09);
      tone(990, 0.07, 0.22, "triangle", 0.08);
    } else if (kind === "soft") tone(240, 0, 0.1, "sine", 0.1);
    else {
      const n = Math.floor(audio.sampleRate * 0.2);
      const buf = audio.createBuffer(1, n, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = audio.createBufferSource();
      const f = audio.createBiquadFilter();
      const g = audio.createGain();
      src.buffer = buf;
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
      g.gain.value = 0.12;
      src.connect(f);
      f.connect(g);
      g.connect(audio.destination);
      src.start(t);
    }
  } catch {
    // No audio here (an old browser, or audio blocked): the screen already said it.
  }
}
