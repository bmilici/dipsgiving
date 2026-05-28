export type GradeKey = "kindergarten" | "first" | "second" | "third";
export type LevelKey = "select" | "cabin" | "coal" | "cargo" | "bridge" | "sos";

export type ProgressRecord = {
  completed?: boolean;
  complete?: boolean;
  bestStars?: number;
  stars?: number;
};

export type ProgressMap = Record<string, ProgressRecord>;

export type GradeConfig = {
  label: string;
  intro: string;
  letters: string[];
  maxNumber: number;
  numberRange: [number, number];
  mathMax: number;
};

export type ChoiceRound = {
  promptText: string;
  ttsText: string;
  visualText?: string;
  messageText?: string;
  choices: string[];
  correctAnswer: string;
  hintText: string;
  kind: string;
};

export type CargoItem = {
  id: string;
  label: string;
  value: string;
  icon: string;
};

export type CargoRound = ChoiceRound & {
  items: CargoItem[];
  carts: string[];
};

export type BridgeRound = ChoiceRound & {
  gridSize: number;
  safePath: string[];
  hazards: string[];
  destination: string;
};
