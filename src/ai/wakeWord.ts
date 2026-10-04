/**
 * "Grok, …" wake word for hands-free voice in VR. Speech-to-text may spell the name a few ways,
 * and people often lead with "hey" or "okay".
 */
const WAKE = /^\s*(?:(?:hey|hi|ok(?:ay)?|yo)[\s,.!]+)?(?:grok|grock|groc|groq|grog|grokk|grook)\b[\s,.:;!?-]*/i;

/**
 * The command after the wake word, `""` when only the wake word was said (listen for a follow-up),
 * or null when the utterance was not addressed to Grok. `armed` accepts a bare follow-up command.
 */
export function wakeCommand(text: string, armed = false): string | null {
  const t = text.trim();
  if (!t) return null;
  const m = WAKE.exec(t);
  if (m) return t.slice(m[0].length).trim();
  return armed ? t : null;
}
