"use client";

import { useEffect, useMemo } from "react";
import { EndOverlay, StartOverlay, TitleRow } from "../GameChrome";
import { useChoiceGame } from "../hooks/useChoiceGame";
import { animals, gradeConfigs } from "../lib/constants";
import { buildCabinRounds } from "../lib/roundBuilders";
import type { GradeKey } from "../lib/types";

type GameProps = {
  grade: GradeKey;
  onComplete: (stars: number) => void;
  onLevelSelect: () => void;
  reportHud: (round: number, stars: number) => void;
  speech: { speak: (text: string) => Promise<void>; preload: (texts: string[]) => void };
};

export default function CabinMatchGame({ grade, onComplete, onLevelSelect, reportHud, speech }: GameProps) {
  const rounds = useMemo(() => buildCabinRounds(grade), [grade]);
  const game = useChoiceGame({ rounds, onComplete, speak: speech.speak, preload: speech.preload });
  const round = game.currentRound;

  useEffect(() => reportHud(game.roundIndex, game.stars), [game.roundIndex, game.stars, reportHud]);

  return (
    <section className="taa-game-wrap taa-cabin-game" aria-label="Cabin Match game">
      <div className="taa-ship-top" aria-hidden="true" />
      <div className="taa-hall" aria-hidden="true" />
      <div className="taa-cabin-fixtures" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <div className="taa-game-content">
        <TitleRow title="Captain's Cabin Match" gradeLabel={gradeConfigs[grade].label} stars={game.stars} />
        <div className="taa-speech" aria-live="polite">{round?.promptText || "Tap Start Boarding to begin captain training."}</div>
        <div className="taa-passenger-area">
          <div className="taa-passenger">
            <div className="taa-animal" aria-hidden="true">{animals[game.roundIndex % animals.length]}</div>
            <button className="taa-ticket-repeat-button" type="button" onClick={game.repeat}>
              <span className="taa-ticket-label">Ticket Clue</span>
              <span className="taa-ticket-code">{round?.visualText || "Repeat"}</span>
            </button>
          </div>
          <div className="taa-doors" aria-label="Cabin choices">
            {round?.choices.map((choice) => (
              <button
                className={`taa-door-button ${choice === round.correctAnswer && game.feedback.startsWith("Great") ? "is-correct" : ""} ${game.wrongAnswers.includes(choice) ? "is-wrong" : ""}`}
                key={choice}
                type="button"
                onClick={() => game.choose(choice)}
              >
                <span className="taa-door-code">{choice}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="taa-feedback" aria-live="polite">{game.feedback}</div>
      </div>
      {!game.started && (
        <StartOverlay
          title="All Aboard!"
          text={`${gradeConfigs[grade].intro} Help each passenger board by matching the cabin ticket clue.`}
          buttonText="Start Boarding"
          onStart={game.start}
          onLevelSelect={onLevelSelect}
        />
      )}
      {game.finished && (
        <EndOverlay
          title="Cabins Matched!"
          text={`You earned ${game.stars} stars helping passengers find their cabins.`}
          onAgain={game.start}
          onLevelSelect={onLevelSelect}
        />
      )}
    </section>
  );
}
