// Dictation into the ask box. On Android the keyboard has its own microphone, so the box shows
// none (dictation.web.ts is the browser's version).

export interface Dictation {
  /** False where there is nothing to dictate with; the box then hides its microphone. */
  supported: boolean;
  listening: boolean;
  /** Starts listening after `base`, what the field holds now, or stops. */
  toggle: (base: string) => void;
}

export function useDictation(_onText: (text: string) => void): Dictation {
  return { supported: false, listening: false, toggle: () => undefined };
}
