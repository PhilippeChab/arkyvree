import { useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { SPELL_LEVELS } from "@/shared/dnd3.5/spells.ts";

/**
 * A spell list's level filter, kept in the URL (`level`): a level from 0 up, or "" for all of them where the list offers
 * `allowAll` (its first level otherwise); an unknown value reads as that default.
 */
export function useSpellLevelFilter(allowAll: boolean) {
  const fallback: number | "" = allowAll ? "" : 0;
  const { value, setValue } = useSearchParam("level");
  const level = value === "" ? fallback : (oneOf(Number(value), SPELL_LEVELS) ?? fallback);
  const setLevel = (next: number | "") => setValue(next === fallback ? "" : String(next));
  return { level, setLevel };
}
