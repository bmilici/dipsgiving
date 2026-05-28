"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EndOverlay, StartOverlay, TitleRow } from "../GameChrome";
import { gradeConfigs, roundsPerGame } from "../lib/constants";
import { buildBridgeRounds } from "../lib/roundBuilders";
import type { GradeKey } from "../lib/types";

type GameProps = {
  grade: GradeKey;
  onComplete: (stars: number) => void;
  onLevelSelect: () => void;
  reportHud: (round: number, stars: number) => void;
  speech: { speak: (text: string) => Promise<void>; preload: (texts: string[]) => void };
};

function coordinate(tile: string) {
  const [row, col] = tile.split("-").map(Number);
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

export default function BridgeNavigationGame({ grade, onComplete, onLevelSelect, reportHud, speech }: GameProps) {
  const rounds = useMemo(() => buildBridgeRounds(grade), [grade]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [pathIndex, setPathIndex] = useState(0);
  const [visiblePath, setVisiblePath] = useState<string[]>([]);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const round = rounds[roundIndex] || rounds[0];

  useEffect(() => reportHud(roundIndex, stars), [reportHud, roundIndex, stars]);

  const revealRoute = useCallback(() => {
    setRevealing(true);
    setVisiblePath([]);
    round.safePath.forEach((tile, index) => {
      setTimeout(() => setVisiblePath((items) => [...items, tile]), index * 420);
    });
    setTimeout(() => {
      setRevealing(false);
      setPathIndex(0);
      setVisiblePath(grade === "kindergarten" ? [round.safePath[0]] : []);
      setFeedback("Choose the next safe tile.");
    }, round.safePath.length * 420 + 500);
  }, [grade, round]);

  const start = useCallback(async () => {
    setStarted(true);
    setFinished(false);
    setRoundIndex(0);
    setPathIndex(0);
    setStars(0);
    setFeedback("Watch the radar.");
    await speech.speak(rounds[0].ttsText);
    setTimeout(revealRoute, 200);
  }, [revealRoute, rounds, speech]);

  const chooseTile = async (tile: string) => {
    if (!started || finished || revealing) return;
    const expected = round.safePath[pathIndex];
    if (tile !== expected) {
      setFeedback(round.hintText);
      await speech.speak("Careful. Try the next safe tile.");
      return;
    }
    const nextPathIndex = pathIndex + 1;
    setPathIndex(nextPathIndex);
    setVisiblePath((items) => Array.from(new Set([...items, tile])));
    if (nextPathIndex < round.safePath.length) return;

    const nextStars = stars + 1;
    setStars(nextStars);
    setFeedback("Great navigation, Captain!");
    if (roundIndex + 1 >= roundsPerGame) {
      setFinished(true);
      onComplete(nextStars);
      await speech.speak(`Great navigation, Captain! You earned ${nextStars} stars.`);
      return;
    }
    const nextRound = roundIndex + 1;
    setRoundIndex(nextRound);
    setPathIndex(0);
    setTimeout(() => {
      speech.speak(rounds[nextRound].ttsText);
      revealRoute();
    }, 650);
  };

  return (
    <section className="taa-game-wrap taa-bridge-deck" aria-label="Bridge Navigation game">
      <div className="taa-game-content taa-bridge-content">
        <TitleRow title="Bridge Navigation" gradeLabel={gradeConfigs[grade].label} stars={stars} />
        <div className="taa-speech">{round.promptText}</div>
        <div className="taa-bridge-actions">
          <button className="taa-big-button taa-repeat-button" type="button" onClick={() => speech.speak(round.ttsText)}>Repeat</button>
          <button className="taa-big-button taa-repeat-button" type="button" onClick={revealRoute}>Replay Radar</button>
        </div>
        <div className="taa-bridge-console">
          <aside className="taa-bridge-panel">
            <div className="taa-helper-face">Radar Helper</div>
            <div className="taa-bridge-stat"><span>Round</span><strong>{roundIndex + 1} of {roundsPerGame}</strong></div>
            <div className="taa-bridge-stat"><span>Destination</span><strong>{coordinate(round.destination)}</strong></div>
            <div className="taa-bridge-stat"><span>Status</span><strong>{revealing ? "Scanning" : "Ready"}</strong></div>
            <div className="taa-meter"><div style={{ width: `${stars * 10}%` }} /></div>
          </aside>
          <div className={`taa-radar-screen ${revealing ? "is-revealing" : ""}`}>
            <div className="taa-ocean-grid" style={{ gridTemplateColumns: `repeat(${round.gridSize}, minmax(0, 1fr))` }}>
              {Array.from({ length: round.gridSize * round.gridSize }, (_, index) => {
                const row = Math.floor(index / round.gridSize);
                const col = index % round.gridSize;
                const id = `${row}-${col}`;
                const visible = visiblePath.includes(id);
                const visited = round.safePath.slice(0, pathIndex).includes(id);
                const next = round.safePath[pathIndex] === id;
                const hazard = revealing && round.hazards.includes(id);
                return (
                  <button
                    className={`taa-ocean-tile ${visible ? "is-safe" : ""} ${visited ? "is-visited" : ""} ${next && !revealing ? "is-next" : ""} ${hazard ? "is-iceberg" : ""}`}
                    key={id}
                    type="button"
                    onClick={() => chooseTile(id)}
                  >
                    <span>{coordinate(id)}</span>
                    <strong>{visited ? "ship" : hazard ? "ice" : visible ? round.safePath.indexOf(id) + 1 : ""}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="taa-feedback">{feedback}</div>
      </div>
      {!started && <StartOverlay title="Start Navigation" text={`${gradeConfigs[grade].intro} Watch the route, then steer through safe water.`} buttonText="Start Navigation" onStart={start} onLevelSelect={onLevelSelect} />}
      {finished && <EndOverlay title="Safe Harbor!" text={`You earned ${stars} stars guiding the ship.`} onAgain={start} onLevelSelect={onLevelSelect} />}
    </section>
  );
}
