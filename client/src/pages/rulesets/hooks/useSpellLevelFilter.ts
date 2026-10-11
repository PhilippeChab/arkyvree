import { useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { getVocabulary } from "@/client/src/pages/rulesets/vocabularyFactory.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A spell list's level filter: the level it shows, and the change that picks one ("" for all, where it offers them). */
interface SpellLevelFilter<L extends number | ""> {
  level: L;
  setLevel: (next: number | "") => void;
}

/**
 * A spell list's level filter, kept in the URL (`level`): one of its ruleset's spell levels (`baseRules`), or "" for all
 * of them where the list offers `allowAll` (its first level otherwise); an unknown value reads as that default.
 */
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: true): SpellLevelFilter<number | "">;
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: false): SpellLevelFilter<number>;
export function useSpellLevelFilter(baseRules: BaseRules, allowAll: boolean): SpellLevelFilter<number | ""> {
  const fallback: number | "" = allowAll ? "" : 0;
  const { value, setValue } = useSearchParam("level");
  const level =
    value === "" ? fallback : (oneOf(Number(value), getVocabulary(baseRules).spellLevels.levels) ?? fallback);
  const setLevel = (next: number | "") => setValue(next === fallback ? "" : String(next));
  return { level, setLevel };
}
