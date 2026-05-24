"use client";

// Audio queue for radio_blurb broadcasts.
// One utterance at a time, serial playback. Each corp has its own voice
// profile (lang + pitch + rate) so listeners can tell who is speaking.
// Browser Web Speech API only — no external TTS.

import type { CorpId } from "./ws";

interface VoiceProfile {
  lang: string;
  pitch: number;
  rate: number;
}

// Accent allocation matrix — see harshita_talk feature spec.
// NexusCorp -> Google, VertexAI -> OpenAI, ShadowScale -> Anthropic
// (corp identities were renamed on dev; voice archetypes carry over).
const VOICE_PROFILES: Record<CorpId, VoiceProfile> = {
  Google:         { lang: "en-US", pitch: 0.95, rate: 1.05 }, // analytical, neo-corp
  OpenAI:         { lang: "en-GB", pitch: 1.15, rate: 0.95 }, // clinical, precise
  Anthropic:      { lang: "en-AU", pitch: 0.75, rate: 0.85 }, // deep, underground
  Chaos_Operator: { lang: "en-IN", pitch: 1.35, rate: 1.25 }, // urgent, chaotic
};

interface QueueItem {
  sender: CorpId;
  text: string;
}

const queue: QueueItem[] = [];
let isPlaying = false;

function ssr(): boolean {
  return typeof window === "undefined" || !window.speechSynthesis;
}

// Voice list loads async in some browsers (Chrome especially). Best-effort
// match — exact lang first, then language-family prefix, then null (browser
// default).
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (ssr()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;
  const family = lang.split("-")[0];
  return voices.find((v) => v.lang.startsWith(family)) ?? null;
}

function playNext(): void {
  if (ssr() || isPlaying) return;
  const item = queue.shift();
  if (!item) return;

  const profile = VOICE_PROFILES[item.sender];
  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.lang = profile.lang;
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;
  const voice = pickVoice(profile.lang);
  if (voice) utterance.voice = voice;

  const release = () => {
    isPlaying = false;
    playNext();
  };
  utterance.onend = release;
  utterance.onerror = release;

  isPlaying = true;
  window.speechSynthesis.speak(utterance);
}

const VALID_SENDERS: ReadonlySet<string> = new Set([
  "Google",
  "OpenAI",
  "Anthropic",
  "Chaos_Operator",
]);

/**
 * Push a blurb onto the serial queue. Drops silently in SSR, when the
 * sender isn't a known corp (e.g. "System" boot frames), or when the text
 * is empty. If nothing is playing, kicks playback immediately.
 */
export function enqueueRadioBlurb(
  sender: string,
  text: string | null | undefined,
): void {
  if (ssr()) return;
  if (!text || !text.trim()) return;
  if (!VALID_SENDERS.has(sender)) return;
  queue.push({ sender: sender as CorpId, text: text.trim() });
  playNext();
}

/** Stop the current utterance and drop everything in the queue. */
export function clearRadioQueue(): void {
  if (ssr()) return;
  queue.length = 0;
  window.speechSynthesis.cancel();
  isPlaying = false;
}
