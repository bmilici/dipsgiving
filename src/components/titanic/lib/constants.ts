import type { GradeConfig, LevelKey } from "./types";

export const roundsPerGame = 10;
export const animals = ["🐻", "🐰", "🐱", "🐶", "🦊", "🐼", "🐨", "🐵", "🐯", "🦁"];

export const storageKeys = {
  adventureProgress: "titanicAdventureProgress",
  cabinProgress: "titanicCabinMatchProgress",
  coalProgress: "titanicCoalCountProgress",
  cargoProgress: "titanicCargoCrewProgress",
  bridgeProgress: "titanicBridgeNavigationProgress",
  sosProgress: "titanicSosSignalProgress",
  adventureGrade: "titanicAdventureGrade",
  cabinGrade: "titanicCabinMatchGrade",
  globalGrades: ["titanicAdventureGrade", "titanicSelectedGrade", "selectedGrade", "dipsgivingSelectedGrade"],
} as const;

export const gradeConfigs: Record<string, GradeConfig> = {
  kindergarten: {
    label: "Kindergarten",
    intro: "Kindergarten training uses letters, counting, matching, and short sight words.",
    letters: ["A", "B", "C"],
    maxNumber: 20,
    numberRange: [1, 10],
    mathMax: 12,
  },
  first: {
    label: "1st Grade",
    intro: "First grade training adds one more, one less, rhymes, and early addition.",
    letters: ["A", "B", "C", "D"],
    maxNumber: 30,
    numberRange: [1, 20],
    mathMax: 24,
  },
  second: {
    label: "2nd Grade",
    intro: "Second grade training adds skip counting, place value, cargo sorting, and routes.",
    letters: ["A", "B", "C", "D", "E"],
    maxNumber: 60,
    numberRange: [5, 50],
    mathMax: 60,
  },
  third: {
    label: "3rd Grade",
    intro: "Third grade training adds multiplication, division, logic, and reading messages.",
    letters: ["A", "B", "C", "D", "E", "F"],
    maxNumber: 99,
    numberRange: [10, 99],
    mathMax: 99,
  },
};

export const levels: Array<{ id: Exclude<LevelKey, "select">; number: number; title: string; subtitle: string }> = [
  { id: "cabin", number: 1, title: "Cabin Match", subtitle: "Match ticket clues to cabin doors" },
  { id: "coal", number: 2, title: "Engine Room Coal Count", subtitle: "Power the boiler with math" },
  { id: "cargo", number: 3, title: "Cargo Crew Challenge", subtitle: "Sort luggage into the right carts" },
  { id: "bridge", number: 4, title: "Bridge Navigation", subtitle: "Follow the safe ocean route" },
  { id: "sos", number: 5, title: "SOS Signal Station", subtitle: "Decode radio reading messages" },
];
