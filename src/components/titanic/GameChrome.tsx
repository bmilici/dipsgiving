"use client";

import Link from "next/link";
import { roundsPerGame } from "./lib/constants";
import { starText } from "./lib/helpers";
import type { LevelKey } from "./lib/types";

type GameChromeProps = {
  activeLevel: LevelKey;
  round: number;
  stars: number;
  onLevelSelect: () => void;
  children: React.ReactNode;
};

export default function GameChrome({ activeLevel, round, stars, onLevelSelect, children }: GameChromeProps) {
  const isPlaying = activeLevel !== "select";
  return (
    <main className={`taa-page ${isPlaying ? "is-playing" : ""}`}>
      <div className="taa-topbar">
        <Link className="taa-home-link" href="/games">Home</Link>
        {isPlaying ? (
          <button className="taa-small-button" type="button" onClick={onLevelSelect}>Level Select</button>
        ) : <span />}
        <div className={`taa-scoreboard ${isPlaying ? "" : "is-hidden"}`} aria-live="polite">
          <span>Round: <strong>{Math.min(round + 1, roundsPerGame)}</strong>/<strong>{roundsPerGame}</strong></span>
          <span>Stars: <strong>{stars}</strong></span>
        </div>
      </div>
      {children}
    </main>
  );
}

export function TitleRow({ title, gradeLabel, stars }: { title: string; gradeLabel: string; stars: number }) {
  return (
    <div className="taa-title-row">
      <div>
        <h1>{title}</h1>
        <div className="taa-grade-badge">{gradeLabel}</div>
      </div>
      <div className="taa-stars" aria-label={`${stars} stars earned`}>{starText(stars)}</div>
    </div>
  );
}

export function StartOverlay({ title, text, buttonText, onStart, onLevelSelect }: {
  title: string;
  text: string;
  buttonText: string;
  onStart: () => void;
  onLevelSelect: () => void;
}) {
  return (
    <div className="taa-screen">
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="taa-button-row">
        <button className="taa-big-button" type="button" onClick={onStart}>{buttonText}</button>
        <button className="taa-big-button" type="button" onClick={onLevelSelect}>Level Select</button>
      </div>
    </div>
  );
}

export function EndOverlay({ title, text, onAgain, onLevelSelect }: {
  title: string;
  text: string;
  onAgain: () => void;
  onLevelSelect: () => void;
}) {
  return (
    <div className="taa-screen">
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="taa-button-row">
        <button className="taa-big-button" type="button" onClick={onAgain}>Play Again</button>
        <button className="taa-big-button" type="button" onClick={onLevelSelect}>Back to Level Select</button>
      </div>
    </div>
  );
}
