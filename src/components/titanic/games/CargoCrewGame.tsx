"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EndOverlay, StartOverlay, TitleRow } from "../GameChrome";
import { gradeConfigs, roundsPerGame } from "../lib/constants";
import { buildCargoRounds } from "../lib/roundBuilders";
import type { CargoItem, GradeKey } from "../lib/types";

type GameProps = {
  grade: GradeKey;
  onComplete: (stars: number) => void;
  onLevelSelect: () => void;
  reportHud: (round: number, stars: number) => void;
  speech: { speak: (text: string) => Promise<void>; preload: (texts: string[]) => void };
};

export default function CargoCrewGame({ grade, onComplete, onLevelSelect, reportHud, speech }: GameProps) {
  const rounds = useMemo(() => buildCargoRounds(grade), [grade]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [selected, setSelected] = useState<CargoItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const round = rounds[roundIndex] || rounds[0];

  useEffect(() => {
    reportHud(roundIndex, stars);
  }, [reportHud, roundIndex, stars]);

  useEffect(() => {
    speech.preload(rounds.slice(0, 4).map((item) => item.ttsText));
  }, [rounds, speech]);

  const start = useCallback(async () => {
    setStarted(true);
    setFinished(false);
    setRoundIndex(0);
    setStars(0);
    setSelected([]);
    setFeedback("");
    await speech.speak(rounds[0].ttsText);
  }, [rounds, speech]);

  const toggleItem = (item: CargoItem) => {
    setSelected((items) => items.some((selectedItem) => selectedItem.id === item.id)
      ? items.filter((selectedItem) => selectedItem.id !== item.id)
      : [...items, item]);
  };

  const loadCart = async (cart: string) => {
    if (!started || finished) return;
    const correctItems = round.items.filter((item) => item.value === round.correctAnswer);
    const selectedIds = selected.map((item) => item.id).sort().join(",");
    const correctIds = correctItems.map((item) => item.id).sort().join(",");
    if (cart !== round.correctAnswer || selectedIds !== correctIds) {
      setFeedback(round.hintText);
      await speech.speak(`Try again. ${round.hintText}`);
      return;
    }
    const nextStars = stars + 1;
    setStars(nextStars);
    setSelected([]);
    setFeedback("Cargo loaded!");
    if (roundIndex + 1 >= roundsPerGame) {
      setFinished(true);
      onComplete(nextStars);
      await speech.speak(`Cargo loaded! You earned ${nextStars} stars.`);
      return;
    }
    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    setTimeout(() => speech.speak(rounds[nextIndex].ttsText), 350);
  };

  return (
    <section className="taa-game-wrap taa-cargo-yard" aria-label="Cargo Crew Challenge game">
      <div className="taa-game-content taa-cargo-content">
        <TitleRow title="Cargo Crew Challenge" gradeLabel={gradeConfigs[grade].label} stars={stars} />
        <div className="taa-speech">{round.promptText}</div>
        <div className="taa-cargo-helper">
          <span className="taa-helper-face">Cargo Chief</span>
          <button className="taa-big-button taa-repeat-button" type="button" onClick={() => speech.speak(round.ttsText)}>Repeat</button>
          <button className="taa-big-button taa-repeat-button" type="button" onClick={() => speech.speak(round.hintText)}>Hint</button>
        </div>
        <div className="taa-cargo-stage">
          <div className="taa-cargo-belt">
            {round.items.map((item) => (
              <button className={`taa-cargo-item ${selected.some((selectedItem) => selectedItem.id === item.id) ? "is-selected" : ""}`} key={item.id} type="button" onClick={() => toggleItem(item)}>
                <strong>{item.icon}</strong>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="taa-cargo-carts">
            {round.carts.map((cart) => (
              <button className="taa-cargo-cart" key={cart} type="button" onClick={() => loadCart(cart)}>
                <span>{cart}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="taa-meter"><div style={{ width: `${stars * 10}%` }} /></div>
        <div className="taa-feedback">{feedback}</div>
      </div>
      {!started && <StartOverlay title="Start Loading" text={`${gradeConfigs[grade].intro} Select the right luggage and load the matching cart.`} buttonText="Start Loading" onStart={start} onLevelSelect={onLevelSelect} />}
      {finished && <EndOverlay title="Cargo Loaded!" text={`You earned ${stars} stars loading cargo carts.`} onAgain={start} onLevelSelect={onLevelSelect} />}
    </section>
  );
}
