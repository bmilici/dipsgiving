"use client";

import { useCallback, useMemo, useState } from "react";
import GameChrome from "./GameChrome";
import LevelSelect from "./LevelSelect";
import BridgeNavigationGame from "./games/BridgeNavigationGame";
import CabinMatchGame from "./games/CabinMatchGame";
import CargoCrewGame from "./games/CargoCrewGame";
import CoalCountGame from "./games/CoalCountGame";
import SosSignalGame from "./games/SosSignalGame";
import { useSpeech } from "./hooks/useSpeech";
import { useTitanicProgress } from "./hooks/useTitanicProgress";
import type { LevelKey } from "./lib/types";

export default function TitanicAdventureAcademy() {
  const { ready, grade, progress, setSelectedGrade, completeLevel } = useTitanicProgress();
  const speechApi = useSpeech();
  const speech = useMemo(() => ({ speak: speechApi.speak, preload: speechApi.preload }), [speechApi.preload, speechApi.speak]);
  const [activeLevel, setActiveLevel] = useState<LevelKey>("select");
  const [hud, setHud] = useState({ round: 0, stars: 0 });

  const showLevelSelect = useCallback(() => {
    speechApi.stop();
    setActiveLevel("select");
    setHud({ round: 0, stars: 0 });
  }, [speechApi]);

  const reportHud = useCallback((round: number, stars: number) => {
    setHud((current) => current.round === round && current.stars === stars ? current : { round, stars });
  }, []);

  const gameProps = {
    grade,
    onLevelSelect: showLevelSelect,
    reportHud,
    speech,
  };

  if (!ready) {
    return (
      <main className="taa-page">
        <div className="taa-loading">Preparing Titanic Adventure Academy...</div>
      </main>
    );
  }

  return (
    <GameChrome activeLevel={activeLevel} round={hud.round} stars={hud.stars} onLevelSelect={showLevelSelect}>
      {activeLevel === "select" && (
        <LevelSelect
          grade={grade}
          progress={progress}
          onGradeChange={setSelectedGrade}
          onSelectLevel={(level) => {
            setHud({ round: 0, stars: 0 });
            setActiveLevel(level);
          }}
        />
      )}
      {activeLevel === "cabin" && <CabinMatchGame {...gameProps} onComplete={(stars) => completeLevel("cabin", stars)} />}
      {activeLevel === "coal" && <CoalCountGame {...gameProps} onComplete={(stars) => completeLevel("coal", stars)} />}
      {activeLevel === "cargo" && <CargoCrewGame {...gameProps} onComplete={(stars) => completeLevel("cargo", stars)} />}
      {activeLevel === "bridge" && <BridgeNavigationGame {...gameProps} onComplete={(stars) => completeLevel("bridge", stars)} />}
      {activeLevel === "sos" && <SosSignalGame {...gameProps} onComplete={(stars) => completeLevel("sos", stars)} />}
    </GameChrome>
  );
}
