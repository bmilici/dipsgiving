"use client";

import { gradeConfigs, levels } from "./lib/constants";
import { completionFor } from "./lib/helpers";
import type { GradeKey, LevelKey, ProgressMap } from "./lib/types";

type LevelSelectProps = {
  grade: GradeKey;
  progress: Record<string, ProgressMap>;
  onGradeChange: (grade: GradeKey) => void;
  onSelectLevel: (level: Exclude<LevelKey, "select">) => void;
};

export default function LevelSelect({ grade, progress, onGradeChange, onSelectLevel }: LevelSelectProps) {
  return (
    <section className="taa-level-select" aria-labelledby="level-select-title">
      <h1 id="level-select-title">Titanic Adventure</h1>
      <p className="taa-level-subtitle">{gradeConfigs[grade].intro}</p>
      <div className="taa-grade-select" aria-label="Titanic Adventure grade selector">
        <div className="taa-grade-select-title">Titanic Adventure Grade</div>
        <div className="taa-grade-options">
          {(Object.keys(gradeConfigs) as GradeKey[]).map((key) => (
            <button
              className={`taa-grade-option ${key === grade ? "is-selected" : ""}`}
              key={key}
              type="button"
              onClick={() => onGradeChange(key)}
            >
              {gradeConfigs[key].label}
            </button>
          ))}
        </div>
      </div>
      <div className="taa-level-grid">
        {levels.map((level) => {
          const status = completionFor(progress[level.id] || {}, grade);
          return (
            <button
              className={`taa-level-card ${status.completed ? "is-complete" : ""}`}
              key={level.id}
              type="button"
              onClick={() => onSelectLevel(level.id)}
            >
              <span className="taa-level-number">{level.number}</span>
              <strong>{level.title}</strong>
              <span>{level.subtitle}</span>
              <em>{status.completed ? `${status.bestStars} star best` : `${gradeConfigs[grade].label}: Available`}</em>
              <span className="taa-level-play">Play</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
