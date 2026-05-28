import { gradeConfigs, roundsPerGame } from "./constants";
import { cabinCode, pickOne, randomInt, shuffled, uniqueChoices } from "./helpers";
import type { BridgeRound, CargoRound, ChoiceRound, GradeKey } from "./types";

function cabinChoices(letter: string, answer: number, max: number) {
  const numbers = new Set<number>([answer]);
  [answer - 1, answer + 1, answer - 2, answer + 2].forEach((number) => {
    if (number >= 1 && number <= max) numbers.add(number);
  });
  while (numbers.size < 4) numbers.add(randomInt(1, max));
  return uniqueChoices(cabinCode(letter, answer), Array.from(numbers).map((number) => cabinCode(letter, number)), 4);
}

export function buildCabinRounds(grade: GradeKey): ChoiceRound[] {
  const config = gradeConfigs[grade];
  return Array.from({ length: roundsPerGame }, (_, index) => {
    const letter = pickOne(config.letters);
    const base = randomInt(1, config.maxNumber);
    let answer = base;
    let visualText = cabinCode(letter, base);
    let promptText = `Find cabin ${letter} ${base}.`;
    let kind = "exactMatch";

    if (grade !== "kindergarten" && index % 3 === 1 && base < config.maxNumber) {
      answer = base + 1;
      visualText = `${cabinCode(letter, base)} + 1`;
      promptText = `Find the cabin one number higher than ${letter} ${base}.`;
      kind = "oneMore";
    } else if (grade !== "kindergarten" && index % 3 === 2 && base > 1) {
      answer = base - 1;
      visualText = `${cabinCode(letter, base)} - 1`;
      promptText = `Find the cabin one number smaller than ${letter} ${base}.`;
      kind = "oneLess";
    } else if ((grade === "second" || grade === "third") && index > 5) {
      const add = grade === "third" ? randomInt(2, 9) : randomInt(2, 5);
      const start = randomInt(1, Math.max(1, config.maxNumber - add));
      answer = start + add;
      visualText = `${cabinCode(letter, start)} + ${add}`;
      promptText = `Find cabin ${letter} ${start} plus ${add}.`;
      kind = "addition";
    }

    return {
      kind,
      promptText,
      ttsText: promptText,
      visualText,
      choices: cabinChoices(letter, answer, config.maxNumber),
      correctAnswer: cabinCode(letter, answer),
      hintText: `Look for cabin ${cabinCode(letter, answer)}.`,
    };
  });
}

export function buildCoalRounds(grade: GradeKey): ChoiceRound[] {
  const config = gradeConfigs[grade];
  return Array.from({ length: roundsPerGame }, (_, index) => {
    const [min, max] = config.numberRange;
    let promptText = "";
    let answer = 0;
    let visualText = "";
    let kind = "count";

    if (grade === "kindergarten" || index < 3) {
      answer = randomInt(min, Math.min(max, 12));
      promptText = `How many coal pieces are in the cart?`;
      visualText = String(answer);
    } else if (grade === "first" || index < 6) {
      const a = randomInt(1, Math.min(12, config.mathMax));
      const b = randomInt(1, Math.min(9, config.mathMax - a));
      answer = a + b;
      visualText = `${a} + ${b}`;
      promptText = `Add the coal: ${a} plus ${b}.`;
      kind = "addition";
    } else {
      const a = randomInt(2, grade === "third" ? 9 : 5);
      const b = randomInt(2, grade === "third" ? 9 : 5);
      answer = a * b;
      visualText = `${a} × ${b}`;
      promptText = `Multiply the coal stacks: ${a} times ${b}.`;
      kind = "multiplication";
    }

    const candidates = Array.from({ length: 12 }, (_, n) => String(Math.max(1, answer - 6 + n)));
    return {
      kind,
      promptText,
      ttsText: promptText,
      visualText,
      choices: uniqueChoices(String(answer), candidates, 4),
      correctAnswer: String(answer),
      hintText: `The engine needs ${answer}.`,
    };
  });
}

const cargoCategories = {
  color: ["red", "blue", "green", "yellow"],
  shape: ["round", "square", "tall", "flat"],
  deck: ["A deck", "B deck", "C deck", "D deck"],
};

export function buildCargoRounds(grade: GradeKey): CargoRound[] {
  const keys = Object.keys(cargoCategories) as Array<keyof typeof cargoCategories>;
  return Array.from({ length: roundsPerGame }, (_, index) => {
    const category = grade === "kindergarten" ? "color" : keys[index % keys.length];
    const carts = cargoCategories[category];
    const correctAnswer = pickOne(carts);
    const items = Array.from({ length: grade === "third" ? 5 : 4 }, (_, itemIndex) => ({
      id: `${index}-${itemIndex}`,
      label: itemIndex % 2 === 0 ? correctAnswer : pickOne(carts.filter((cart) => cart !== correctAnswer)),
      value: itemIndex % 2 === 0 ? correctAnswer : pickOne(carts.filter((cart) => cart !== correctAnswer)),
      icon: ["trunk", "crate", "bag", "case", "mail"][itemIndex],
    }));

    return {
      kind: category,
      promptText: `Load every ${correctAnswer} item into the right cargo cart.`,
      ttsText: `Load every ${correctAnswer} item into the right cargo cart.`,
      visualText: correctAnswer,
      choices: carts,
      carts,
      items: shuffled(items),
      correctAnswer,
      hintText: `Only choose luggage marked ${correctAnswer}.`,
    };
  });
}

function tile(row: number, col: number) {
  return `${row}-${col}`;
}

export function buildBridgeRounds(grade: GradeKey): BridgeRound[] {
  const gridSize = grade === "kindergarten" ? 4 : grade === "third" ? 6 : 5;
  return Array.from({ length: roundsPerGame }, (_, index) => {
    const startRow = randomInt(0, gridSize - 1);
    const path = [tile(startRow, 0)];
    while (path.length < Math.min(gridSize + 1, 4 + Math.floor(index / 3))) {
      const [row, col] = path[path.length - 1].split("-").map(Number);
      const options = [
        [row, col + 1],
        [Math.max(0, row - 1), col + 1],
        [Math.min(gridSize - 1, row + 1), col + 1],
      ].filter(([, c]) => c < gridSize);
      const [nextRow, nextCol] = pickOne(options);
      path.push(tile(nextRow, nextCol));
    }
    const hazards = new Set<string>();
    while (hazards.size < gridSize - 1) {
      const hazard = tile(randomInt(0, gridSize - 1), randomInt(0, gridSize - 1));
      if (!path.includes(hazard)) hazards.add(hazard);
    }
    return {
      kind: "safePath",
      gridSize,
      safePath: path,
      hazards: Array.from(hazards),
      destination: path[path.length - 1],
      promptText: "Watch the radar, then sail along the safe route.",
      ttsText: "Watch the radar, then sail along the safe route.",
      choices: path,
      correctAnswer: path[0],
      hintText: "Follow the glowing water tiles in order.",
    };
  });
}

const sosPools: Record<GradeKey, Array<[string, string[]]>> = {
  kindergarten: [
    ["ship", ["shop", "fish", "sun"]],
    ["help", ["hat", "hop", "map"]],
    ["red", ["run", "bed", "blue"]],
    ["go", ["so", "dog", "to"]],
  ],
  first: [
    ["bright", ["heavy", "tiny", "slow"]],
    ["wave", ["rope", "bell", "dock"]],
    ["radio", ["rabbit", "rope", "rain"]],
    ["captain", ["cabin", "cargo", "coal"]],
  ],
  second: [
    ["The radio glows.", ["Radio the glows.", "Glows the radio.", "The glows radio."]],
    ["The ship is safe.", ["Safe ship the is.", "Ship safe is the.", "The safe is ship."]],
    ["Reply: Excellent signal check.", ["Reply: The door is purple.", "Reply: I lost my pencil.", "Reply: Time for a snack."]],
  ],
  third: [
    ["Read the note. Choose the word. Tap send.", ["Tap send. Choose the word. Read the note.", "Choose the word. Read the note. Tap send.", "Read the note. Tap send. Choose the word."]],
    ["Reply: I will check the compass.", ["Reply: The cake is blue.", "Reply: I forgot my socks.", "Reply: Put coal in the ocean."]],
    ["signal", ["captain", "paper", "reply"]],
  ],
};

export function buildSosRounds(grade: GradeKey): ChoiceRound[] {
  const pool = sosPools[grade] || sosPools.kindergarten;
  return Array.from({ length: roundsPerGame }, (_, index) => {
    const [answer, distractors] = pool[index % pool.length];
    return {
      kind: index > 5 ? "readingComprehension" : "sightWordRecognition",
      promptText: grade === "kindergarten" ? `Find the word: ${answer}.` : "Decode the wireless message.",
      ttsText: grade === "kindergarten" ? `Find the word ${answer}.` : "Decode the wireless message.",
      messageText: index > 5 ? "Wireless message: ___" : `Signal word: ${answer}`,
      choices: uniqueChoices(answer, distractors, 4),
      correctAnswer: answer,
      hintText: `Look for ${answer}.`,
    };
  });
}
