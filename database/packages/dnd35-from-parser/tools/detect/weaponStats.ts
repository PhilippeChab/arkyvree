/** A specific weapon's enhancement bonus, on its attack rolls and on its damage rolls. */
export type WeaponEnhancement = { attack: number; damage: number };

/** What a weapon is named in its text, last word: "this +2 dagger", "a +1 flaming burst longsword". */
const WEAPON_NOUN = String.raw`(?:sword|longsword|dagger|warhammer|greatsword|greataxe|mace|longbow|shortbow|bow|rapier|scimitar|trident|axe|hammer)`;

/**
 * Its enhancement, as its text first gives it: "this +2 short sword" (later, conditional ones, such as a holy avenger's
 * +5 in a paladin's hands, stay in its text), "an enhancement bonus of +1", or a masterwork weapon's +1 on attack rolls
 * only.
 */
const ENHANCEMENTS: [RegExp, (bonus: number) => WeaponEnhancement][] = [
  [
    /As a masterwork weapon, it has a \+(\d) enhancement bonus on attack rolls/,
    (bonus) => ({ attack: bonus, damage: 0 }),
  ],
  [
    new RegExp(String.raw`\+(\d)(?:/\+\d)?\s+(?:[a-z'-]+\s+){0,3}?${WEAPON_NOUN}\b`, "i"),
    (bonus) => ({ attack: bonus, damage: bonus }),
  ],
  [/enhancement bonus of \+(\d)/, (bonus) => ({ attack: bonus, damage: bonus })],
];

/** A specific weapon's enhancement bonus, by its text: none when it gives none. */
export function readWeaponEnhancement(text: string): WeaponEnhancement | undefined {
  const found = ENHANCEMENTS.map(([pattern, enhancement]) => {
    const match = text.match(pattern);
    return match ? { index: match.index ?? 0, enhancement: enhancement(Number(match[1])) } : undefined;
  }).filter((entry) => entry !== undefined);
  // The first the text gives
  return found.sort((a, b) => a.index - b.index)[0]?.enhancement;
}
