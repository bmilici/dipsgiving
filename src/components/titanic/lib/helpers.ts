import type { GradeKey, ProgressMap } from "./types";
import { gradeConfigs } from "./constants";

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickOne<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

export function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function uniqueChoices(correct: string, candidates: string[], count = 4) {
  const values = new Set<string>([correct]);
  shuffled(candidates).forEach((candidate) => {
    if (values.size < count) values.add(candidate);
  });
  return shuffled(Array.from(values)).slice(0, count);
}

export function normalizeGrade(value: string | null | undefined): GradeKey {
  return Object.prototype.hasOwnProperty.call(gradeConfigs, value || "") ? (value as GradeKey) : "kindergarten";
}

export function starText(stars: number, total = 10) {
  return "★".repeat(stars) + "☆".repeat(Math.max(0, total - stars));
}

export function completionFor(progress: ProgressMap, grade: GradeKey) {
  const record = progress[grade] || {};
  return {
    completed: Boolean(record.completed || record.complete),
    bestStars: Number(record.bestStars || record.stars || 0),
  };
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function cabinCode(letter: string, number: number) {
  return `${letter}${number}`;
}
