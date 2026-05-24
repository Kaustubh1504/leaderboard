"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { LastTelemetry } from "./ws";

interface VoiceProfile {
  lang: string;
  pitch: number;
  rate: number;
}

const VOICE_PROFILES: Record<string, VoiceProfile> = {
  Google:         { lang: "en-US", pitch: 0.95, rate: 1.05 },
  OpenAI:         { lang: "en-GB", pitch: 1.15, rate: 0.95 },
  Anthropic:      { lang: "en-AU", pitch: 0.75, rate: 0.85 },
  Chaos_Operator: { lang: "en-IN", pitch: 1.35, rate: 1.25 },
};

const FALLBACK_LANGS = ["en-US", "en-GB", "en"];

interface QueueItem {
  text: string;
  sender: string;
}

export function useRadioQueue(
  lastTelemetry: LastTelemetry | null | undefined,
  tick: number,
) {
  const queueRef = useRef<QueueItem[]>([]);
  const isSpeakingRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const prevTickRef = useRef(-1);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const resolveVoice = useCallback((lang: string): SpeechSynthesisVoice | null => {
    const synth = synthRef.current;
    if (!synth) return null;
    const voices = synth.getVoices();
    const exact = voices.find((v: SpeechSynthesisVoice) => v.lang === lang || v.lang.startsWith(lang));
    if (exact) return exact;
    for (const fb of FALLBACK_LANGS) {
      const match = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith(fb));
      if (match) return match;
    }
    return voices[0] || null;
  }, []);

  const processQueue = useCallback(() => {
    const synth = synthRef.current;
    if (!synth || isSpeakingRef.current || queueRef.current.length === 0) return;

    const item = queueRef.current.shift()!;
    const profile = VOICE_PROFILES[item.sender] || VOICE_PROFILES["Google"];

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;

    const voice = resolveVoice(profile.lang);
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      processQueue();
    };
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      processQueue();
    };

    synth.speak(utterance);
  }, [resolveVoice]);

  useEffect(() => {
    if (tick === prevTickRef.current) return;
    prevTickRef.current = tick;

    const blurb = lastTelemetry?.radio_blurb;
    if (!blurb || isMuted) return;

    queueRef.current.push({ text: blurb, sender: lastTelemetry.sender });
    processQueue();
  }, [tick, lastTelemetry, isMuted, processQueue]);

  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev: boolean) => {
      if (!prev) {
        synthRef.current?.cancel();
        queueRef.current = [];
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  return { isSpeaking, isMuted, toggleMute };
}
