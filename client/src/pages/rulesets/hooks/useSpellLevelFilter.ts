import { useRules, useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A spell list's level filter: the level it shows, and the change that picks one ("" for all, where it offers them). */
interface SpellLevelFilter<L extends number | ""> {
  level: L;
  setLevel: (next: number | "") => void;
}

/**
 * A spell list's level filter, kept in the URL (`level`): one of its ruleset's spell levels (`baseRules`, its rules'),
 * or "" for all of them where the list offers `allowAll` (its first level otherwise); an unknown value reads as that
 * default. While its rules load, any level stands, so its list's first fetch is for the level the URL names.
 */
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: true): SpellLevelFilter<number | "">;
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: false): SpellLevelFilter<number>;
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: boolean): SpellLevelFilter<number | ""> {
  const fallback: number | "" = allowAll ? "" : 0;
  const { value, setValue } = useSearchParam("level");
  const { rules } = useRules(baseRules);
  const asked = Number(value);
  const known = rules
    ? oneOf(
        asked,
        rules.tiers.map((option) => option.level),
      )
    : Number.isInteger(asked) && asked >= 0
      ? asked
      : undefined;
  const level = value === "" ? fallback : (known ?? fallback);
  const setLevel = (next: number | "") => setValue(next === fallback ? "" : String(next));
  return { level, setLevel };
}
