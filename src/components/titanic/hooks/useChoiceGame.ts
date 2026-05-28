"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { roundsPerGame } from "../lib/constants";
import type { ChoiceRound } from "../lib/types";

type UseChoiceGameOptions = {
  rounds: ChoiceRound[];
  onComplete: (stars: number) => void;
  speak: (text: string) => Promise<void>;
  preload: (texts: string[]) => void;
};

export function useChoiceGame({ rounds, onComplete, speak, preload }: UseChoiceGameOptions) {
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [wrongAnswers, setWrongAnswers] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);

  const currentRound = rounds[roundIndex] || rounds[0];

  useEffect(() => {
    preload(rounds.slice(0, 4).map((round) => round.ttsText));
  }, [preload, rounds]);

  const start = useCallback(async () => {
    setStarted(true);
    setFinished(false);
    setRoundIndex(0);
    setStars(0);
    setFeedback("");
    setWrongAnswers([]);
    setAccepting(true);
    if (rounds[0]) await speak(rounds[0].ttsText);
  }, [rounds, speak]);

  const repeat = useCallback(() => {
    if (currentRound) speak(currentRound.ttsText);
  }, [currentRound, speak]);

  const choose = useCallback((choice: string) => {
    if (!accepting || !currentRound) return;
    if (choice !== currentRound.correctAnswer) {
      setWrongAnswers((items) => items.includes(choice) ? items : [...items, choice]);
      setFeedback(currentRound.hintText);
      speak(`Try again. ${currentRound.hintText}`);
      return;
    }

    const nextStars = stars + 1;
    setStars(nextStars);
    setFeedback("Great job, Captain!");
    setWrongAnswers([]);
    if (roundIndex + 1 >= roundsPerGame) {
      setAccepting(false);
      setFinished(true);
      onComplete(nextStars);
      speak(`Great job, Captain! You earned ${nextStars} stars.`);
      return;
    }

    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    if (rounds[nextIndex + 1]) preload([rounds[nextIndex + 1].ttsText]);
    setTimeout(() => {
      setAccepting(true);
      speak(rounds[nextIndex].ttsText);
    }, 450);
  }, [accepting, currentRound, onComplete, preload, roundIndex, rounds, speak, stars]);

  const reset = useCallback(() => {
    setStarted(false);
    setFinished(false);
    setRoundIndex(0);
    setStars(0);
    setFeedback("");
    setWrongAnswers([]);
    setAccepting(false);
  }, []);

  return useMemo(() => ({
    started,
    finished,
    roundIndex,
    stars,
    feedback,
    wrongAnswers,
    currentRound,
    accepting,
    start,
    repeat,
    choose,
    reset,
  }), [accepting, choose, currentRound, feedback, finished, repeat, reset, roundIndex, stars, start, started, wrongAnswers]);
}
