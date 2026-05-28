"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { storageKeys } from "../lib/constants";
import { normalizeGrade, readJson, writeJson } from "../lib/helpers";
import type { GradeKey, LevelKey, ProgressMap } from "../lib/types";

const levelStorage: Record<Exclude<LevelKey, "select">, string> = {
  cabin: storageKeys.cabinProgress,
  coal: storageKeys.coalProgress,
  cargo: storageKeys.cargoProgress,
  bridge: storageKeys.bridgeProgress,
  sos: storageKeys.sosProgress,
};

export function useTitanicProgress() {
  const [ready, setReady] = useState(false);
  const [grade, setGrade] = useState<GradeKey>("kindergarten");
  const [progress, setProgress] = useState<Record<string, ProgressMap>>({});

  useEffect(() => {
    const storedGrade = storageKeys.globalGrades.map((key) => window.localStorage.getItem(key)).find(Boolean);
    setGrade(normalizeGrade(storedGrade));
    setProgress({
      cabin: readJson<ProgressMap>(storageKeys.cabinProgress, {}),
      coal: readJson<ProgressMap>(storageKeys.coalProgress, {}),
      cargo: readJson<ProgressMap>(storageKeys.cargoProgress, {}),
      bridge: readJson<ProgressMap>(storageKeys.bridgeProgress, {}),
      sos: readJson<ProgressMap>(storageKeys.sosProgress, {}),
      adventure: readJson<ProgressMap>(storageKeys.adventureProgress, {}),
    });
    setReady(true);
  }, []);

  const setSelectedGrade = useCallback((nextGrade: GradeKey) => {
    setGrade(nextGrade);
    window.localStorage.setItem(storageKeys.adventureGrade, nextGrade);
    window.localStorage.setItem(storageKeys.cabinGrade, nextGrade);
  }, []);

  const completeLevel = useCallback((level: Exclude<LevelKey, "select">, stars: number) => {
    setProgress((current) => {
      const levelProgress = current[level] || {};
      const previous = levelProgress[grade] || {};
      const nextLevelProgress = {
        ...levelProgress,
        [grade]: {
          ...previous,
          completed: true,
          complete: true,
          bestStars: Math.max(Number(previous.bestStars || previous.stars || 0), stars),
          stars: Math.max(Number(previous.bestStars || previous.stars || 0), stars),
        },
      };
      const adventureProgress = {
        ...(current.adventure || {}),
        [level]: { completed: true, complete: true, bestStars: stars, stars },
      };
      writeJson(levelStorage[level], nextLevelProgress);
      writeJson(storageKeys.adventureProgress, adventureProgress);
      return { ...current, [level]: nextLevelProgress, adventure: adventureProgress };
    });
  }, [grade]);

  return useMemo(() => ({
    ready,
    grade,
    progress,
    setSelectedGrade,
    completeLevel,
  }), [completeLevel, grade, progress, ready, setSelectedGrade]);
}
