"use client";

import { useEffect, useMemo } from "react";
import { EndOverlay, StartOverlay, TitleRow } from "../GameChrome";
import { useChoiceGame } from "../hooks/useChoiceGame";
import { gradeConfigs } from "../lib/constants";
import { buildCoalRounds } from "../lib/roundBuilders";
import type { GradeKey } from "../lib/types";

type GameProps = {
  grade: GradeKey;
  onComplete: (stars: number) => void;
  onLevelSelect: () => void;
  reportHud: (round: number, stars: number) => void;
  speech: { speak: (text: string) => Promise<void>; preload: (texts: string[]) => void };
};

export default function CoalCountGame({ grade, onComplete, onLevelSelect, reportHud, speech }: GameProps) {
  const rounds = useMemo(() => buildCoalRounds(grade), [grade]);
  const game = useChoiceGame({ rounds, onComplete, speak: speech.speak, preload: speech.preload });
  const round = game.currentRound;

  useEffect(() => reportHud(game.roundIndex, game.stars), [game.roundIndex, game.stars, reportHud]);

  return (
    <section className="taa-game-wrap taa-engine-room" aria-label="Engine Room Coal Count game">
      <div className="taa-game-content taa-engine-content">
        <TitleRow title="Engine Room Coal Count" gradeLabel={gradeConfigs[grade].label} stars={game.stars} />
        <div className="taa-speech" aria-live="polite">{round?.promptText || "Tap Start Engine to begin math training."}</div>
        <div className="taa-engine-stage">
          <div className="taa-engineer">
            <div className="taa-helper-face" aria-hidden="true">Engineer</div>
            <button className="taa-big-button taa-repeat-button" type="button" onClick={game.repeat}>Repeat</button>
          </div>
          <div className="taa-coal-visual" aria-live="polite">
            <div className="taa-coal-label">{round?.kind === "count" ? "Coal Cart" : "Coal Problem"}</div>
            <div className="taa-number-card">{round?.visualText}</div>
            <div className="taa-coal-pieces" aria-hidden="true">
              {Array.from({ length: Math.min(12, Number(round?.correctAnswer || 0)) }).map((_, index) => <span key={index} />)}
            </div>
          </div>
          <div className="taa-boiler-panel">
            <div className="taa-furnace" style={{ "--furnace-power": game.stars / 10 } as React.CSSProperties}>Go</div>
            <div className="taa-engine-status">{game.stars > 7 ? "Full steam" : game.stars > 3 ? "Boiler warming" : "Cold boiler"}</div>
            <div className="taa-engine-meter"><div style={{ width: `${game.stars * 10}%` }} /></div>
          </div>
        </div>
        <div className="taa-answer-grid">
          {round?.choices.map((choice) => (
            <button
              className={`taa-answer-button ${game.wrongAnswers.includes(choice) ? "is-wrong" : ""}`}
              key={choice}
              type="button"
              onClick={() => game.choose(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
        <div className="taa-feedback">{game.feedback}</div>
      </div>
      {!game.started && <StartOverlay title="Start the Engine" text={`${gradeConfigs[grade].intro} Power the ship with math.`} buttonText="Start Engine" onStart={game.start} onLevelSelect={onLevelSelect} />}
      {game.finished && <EndOverlay title="Engine Powered!" text={`You earned ${game.stars} stars and powered the engine.`} onAgain={game.start} onLevelSelect={onLevelSelect} />}
    </section>
  );
}
