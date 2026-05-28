"use client";

import { useEffect, useMemo } from "react";
import { EndOverlay, StartOverlay, TitleRow } from "../GameChrome";
import { useChoiceGame } from "../hooks/useChoiceGame";
import { gradeConfigs } from "../lib/constants";
import { buildSosRounds } from "../lib/roundBuilders";
import type { GradeKey } from "../lib/types";

type GameProps = {
  grade: GradeKey;
  onComplete: (stars: number) => void;
  onLevelSelect: () => void;
  reportHud: (round: number, stars: number) => void;
  speech: { speak: (text: string) => Promise<void>; preload: (texts: string[]) => void };
};

export default function SosSignalGame({ grade, onComplete, onLevelSelect, reportHud, speech }: GameProps) {
  const rounds = useMemo(() => buildSosRounds(grade), [grade]);
  const game = useChoiceGame({ rounds, onComplete, speak: speech.speak, preload: speech.preload });
  const round = game.currentRound;

  useEffect(() => reportHud(game.roundIndex, game.stars), [game.roundIndex, game.stars, reportHud]);

  return (
    <section className="taa-game-wrap taa-sos-station" aria-label="SOS Signal Station reading game">
      <div className="taa-game-content taa-sos-content">
        <TitleRow title="SOS Signal Station" gradeLabel={gradeConfigs[grade].label} stars={game.stars} />
        <div className="taa-speech">{round?.promptText || "Tap Start Signal Training to begin radio reading training."}</div>
        <div className="taa-sos-console">
          <aside className="taa-radio-cabinet">
            <div className="taa-helper-face">Radio Captain</div>
            <button className="taa-big-button taa-repeat-button" type="button" onClick={game.repeat}>Repeat</button>
            <div className="taa-radio-dial">SOS</div>
            <div className="taa-meter"><div style={{ width: `${game.stars * 10}%` }} /></div>
            <div className="taa-morse-key">beep beep beep</div>
          </aside>
          <div className="taa-message-board">
            <div className="taa-sos-tools">
              <span>Round {game.roundIndex + 1} of 10</span>
              <span>{round?.kind === "sightWordRecognition" ? "Sight Word" : "Reading"}</span>
            </div>
            <div className="taa-message-paper">
              <div className="taa-message-label">Wireless Message</div>
              <div>{round?.messageText || "Ready for a friendly training signal."}</div>
            </div>
            <div className="taa-sos-feedback">{game.feedback}</div>
            <div className="taa-sos-choice-grid">
              {round?.choices.map((choice) => (
                <button className={`taa-sos-choice ${choice.length > 26 ? "is-long" : ""} ${game.wrongAnswers.includes(choice) ? "is-wrong" : ""}`} key={choice} type="button" onClick={() => game.choose(choice)}>
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!game.started && <StartOverlay title="Start Signal Training" text={`${gradeConfigs[grade].intro} Decode friendly ship messages.`} buttonText="Start Signal Training" onStart={game.start} onLevelSelect={onLevelSelect} />}
      {game.finished && <EndOverlay title="Signals Sent!" text={`You earned ${game.stars} stars sending radio messages.`} onAgain={game.start} onLevelSelect={onLevelSelect} />}
    </section>
  );
}
