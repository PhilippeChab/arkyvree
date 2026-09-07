export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function roll4d6DropLowest(): number {
  const rolls = Array.from({ length: 4 }, () => rollDie(6));
  rolls.sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

export function roll3d6(): number {
  return rollDie(6) + rollDie(6) + rollDie(6);
}

export type RollMethodId = "4d6-drop-lowest" | "3d6-straight" | "standard-array" | "point-buy";

export const ROLL_METHODS: { id: RollMethodId; label: string }[] = [
  { id: "4d6-drop-lowest", label: "4d6 Drop Lowest" },
  { id: "3d6-straight", label: "3d6 Straight" },
  { id: "standard-array", label: "Standard Array" },
  { id: "point-buy", label: "Point Buy" },
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
};

export const POINT_BUY_TOTAL = 25;

export function getRollFunction(method: RollMethodId): (() => number) | null {
  switch (method) {
    case "4d6-drop-lowest": return roll4d6DropLowest;
    case "3d6-straight": return roll3d6;
    default: return null;
  }
}

export function isDiceMethod(method: RollMethodId): boolean {
  return method === "4d6-drop-lowest" || method === "3d6-straight";
}
