import { useEffect, useRef, useState } from "react";

import { DICE_ROLL } from "@/client/src/theme/animations.ts";

/** A die a roll throws: what it stands for (an ability's id, a level's index), and how it rolls. */
interface Die {
  key: string;
  roll: () => number;
}

/** A roll of dice as it shows: `useDiceRoll`'s. */
export type DiceRoll = ReturnType<typeof useDiceRoll>;

/**
 * A roll of dice as it shows, timed by `DICE_ROLL` (`theme/animations.ts`): each die tumbles through faces, then lands
 * on its result, one after another, which pulses as it settles (`settleAnimation`), and the roll ends with the last
 * pulse. A new character's ability scores and the level wizard's hit points roll through it.
 */
export function useDiceRoll() {
  // The face each die still tumbling shows, and the dice landed so far
  const [faces, setFaces] = useState<Record<string, number>>({});
  const [landed, setLanded] = useState<ReadonlySet<string>>(new Set());
  const [rolling, setRolling] = useState(false);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = () => {
    for (const id of intervals.current) clearInterval(id);
    for (const id of timeouts.current) clearTimeout(id);
    intervals.current = [];
    timeouts.current = [];
  };

  useEffect(() => stop, []);

  // Throws `dice`, each one's result handed to `onLand` as it lands; a roll already under way goes on alone
  const roll = (dice: Die[], onLand: (key: string, result: number) => void) => {
    if (rolling || dice.length === 0) return;
    stop();
    setRolling(true);
    setLanded(new Set());
    for (const [index, die] of dice.entries()) {
      const interval = setInterval(() => setFaces((prev) => ({ ...prev, [die.key]: die.roll() })), DICE_ROLL.face);
      intervals.current.push(interval);
      const landing = setTimeout(
        () => {
          clearInterval(interval);
          const result = die.roll();
          setFaces((prev) => {
            const tumbling = { ...prev };
            delete tumbling[die.key];
            return tumbling;
          });
          setLanded((prev) => new Set(prev).add(die.key));
          onLand(die.key, result);
          if (index < dice.length - 1) return;
          const end = setTimeout(() => {
            setRolling(false);
            setLanded(new Set());
          }, DICE_ROLL.settle);
          timeouts.current.push(end);
        },
        DICE_ROLL.land + index * DICE_ROLL.stagger,
      );
      timeouts.current.push(landing);
    }
  };

  return {
    /** The face a die shows while it tumbles; none once it landed. */
    faceOf: (key: string): number | undefined => faces[key],
    /** Whether a die of the roll has landed, its result pulsing until the roll ends. */
    hasLanded: (key: string) => landed.has(key),
    roll,
    rolling,
  };
}
