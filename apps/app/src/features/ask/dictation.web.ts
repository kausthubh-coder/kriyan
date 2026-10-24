// Dictation into the ask box with the browser's speech recognition (Chrome, Edge, Safari). The
// words land in the field for the person to read and send; nothing is sent by itself. Browsers
// without it (Firefox) show no microphone.

import { useEffect, useRef, useState } from "react";
import { showToast } from "@/ui/toast";
import type { Dictation } from "./dictation";

interface Alternative {
  transcript: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<Alternative>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * What's heard goes after what the field held when dictation started (`toggle`'s `base`), and
 * replaces itself as the browser refines its guess. `onText` should be a state setter.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [supported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.abort(), []);

  const toggle = (base: string) => {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    const start = base.trimEnd();
    r.lang = navigator.language || "en";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const heard = Array.from(e.results, (res) => res[0]?.transcript ?? "")
        .join("")
        .trim();
      onText(start && heard ? `${start} ${heard}` : start || heard);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        showToast("Allow the microphone for this site to dictate.");
      else if (e.error !== "no-speech" && e.error !== "aborted") showToast("Couldn't hear that. Try again.");
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
    }
  };

  return { supported, listening, toggle };
}
