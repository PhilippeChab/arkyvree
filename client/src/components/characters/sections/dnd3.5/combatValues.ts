/** How the sheet writes a combat value: the attacks a base attack bonus gives, a speed. */

import { formatSigned } from "@/client/src/lib/formatNumeric.ts";

/** A speed in feet ("30 ft."), or undefined when the character's isn't known: the field shows an empty value. */
export function formatSpeed(speed: number | undefined): string | undefined {
  return speed === undefined ? undefined : `${speed} ft.`;
}

/** The attacks a base attack bonus gives a round: "+11/+6/+1", or "+0". */
export function iterativeAttacks(bab: number): string {
  const attacks: string[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) attacks.push(formatSigned(bonus));

  return attacks.length > 0 ? attacks.join("/") : formatSigned(bab);
}
