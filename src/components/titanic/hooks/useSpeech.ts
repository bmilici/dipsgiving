"use client";

import { useCallback, useRef } from "react";

type CachedAudio = {
  url: string;
  blob: Blob;
};

export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, CachedAudio>>(new Map());
  const promiseRef = useRef<Map<string, Promise<CachedAudio>>>(new Map());

  const getAudio = useCallback(async (text: string) => {
    const key = text.trim().toLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const pending = promiseRef.current.get(key);
    if (pending) return pending;

    const promise = fetch(`/api/text-to-speech?${new URLSearchParams({ text })}`).then(async (response) => {
      if (!response.ok) throw new Error("Text-to-speech failed");
      const blob = await response.blob();
      const audio = { blob, url: URL.createObjectURL(blob) };
      cacheRef.current.set(key, audio);
      return audio;
    }).finally(() => {
      promiseRef.current.delete(key);
    });

    promiseRef.current.set(key, promise);
    return promise;
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    try {
      const asset = await getAudio(text);
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.setAttribute("playsinline", "");
      }
      audioRef.current.pause();
      audioRef.current.src = asset.url;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    }
  }, [getAudio]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const preload = useCallback((texts: string[]) => {
    texts.filter(Boolean).forEach((text) => {
      getAudio(text).catch(() => undefined);
    });
  }, [getAudio]);

  return { speak, stop, preload };
}
