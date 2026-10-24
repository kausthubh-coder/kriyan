// Interface sounds on Android: the same four sounds the web synthesises (sound.web.ts), as short
// WAV files written by make-sounds.mjs. Off unless the person turned Sounds on. They mix with
// whatever else is playing and stay quiet when the phone is on silent.

import type { AudioPlayer } from "expo-audio";
import { soundsOn } from "./setting";

export type Sound = "tick" | "done" | "soft" | "swoosh";

const SOURCES: Record<Sound, number> = {
  tick: require("./sounds/tick.wav"),
  done: require("./sounds/done.wav"),
  soft: require("./sounds/soft.wav"),
  swoosh: require("./sounds/swoosh.wav"),
};

const players: Partial<Record<Sound, AudioPlayer>> = {};
let audio: typeof import("expo-audio") | null = null;

export function playSound(kind: Sound) {
  if (!soundsOn()) return;
  try {
    if (!audio) {
      // Loaded on first use: a dev build made before expo-audio was added has no native
      // module, and a top-level import would stop the whole app from starting.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
      audio = require("expo-audio") as typeof import("expo-audio");
      void audio
        .setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" })
        .catch(() => undefined);
    }
    const player = (players[kind] ??= audio.createAudioPlayer(SOURCES[kind]));
    void player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // A build without the audio module: the screen already said it.
  }
}
