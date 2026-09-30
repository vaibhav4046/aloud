"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Player settings that live in the browser: sound, reduced motion and typed-only
 * play. The daily goal lives in Progress (the engine owns it), not here.
 * Sound is off by default and stays off until the player turns it on.
 */

export type GameSettings = { sound: boolean; reduceMotion: boolean; typedOnly: boolean };

export const DEFAULT_SETTINGS: GameSettings = { sound: false, reduceMotion: false, typedOnly: false };
const KEY = "aloud.settings";

let cache: GameSettings | null = null;
const listeners = new Set<() => void>();

export function parseSettings(raw: string | null): GameSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<GameSettings>;
    return {
      sound: v.sound === true,
      reduceMotion: v.reduceMotion === true,
      typedOnly: v.typedOnly === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function read(): GameSettings {
  if (cache) return cache;
  try {
    cache = parseSettings(window.localStorage.getItem(KEY));
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache;
}

export function applyMotionAttr(s: GameSettings): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reduceMotion = s.reduceMotion ? "true" : "false";
}

export function writeSettings(patch: Partial<GameSettings>): GameSettings {
  const next = { ...read(), ...patch };
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the setting holds for this visit */
  }
  applyMotionAttr(next);
  listeners.forEach((l) => l());
  return next;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): [GameSettings, (patch: Partial<GameSettings>) => void] {
  const s = useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS);
  const set = useCallback((patch: Partial<GameSettings>) => void writeSettings(patch), []);
  return [s, set];
}

/** True when the OS asks for reduced motion or the player turned it on here. */
export function prefersReducedMotion(s: GameSettings): boolean {
  if (s.reduceMotion) return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
