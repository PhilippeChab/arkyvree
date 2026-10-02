/** A word that makes what its sentence grants apply only sometimes: "+2 on saves against poison", "while raging". */
const CONDITION = /\b(?:against|while|whenever|when|during|versus|if|unless|only|as long as)\b|\bvs\./i;

/** Someone other than the character, whom what the sentence grants goes to: "all allies within 30 feet gain…". */
const SOMEONE_ELSE = /\b(?:all(?:y|ies)|companions?|cohorts?|familiars?|followers?|mounts?)\b/i;

/** An effect used rather than had: "expend/spend one use of…", "three times per day", "as a swift action", "for 1 hour". */
const ACTIVATION =
  /\b(?:ex|s)pend\b|\bper day\b|\/day\b|\btimes? a day\b|\bas an? (?:free|swift|immediate|move|standard|full-round) action\b|\bfor (?:\d+|one|a|an) (?:rounds?|minutes?|hours?)\b/i;

/**
 * What narrows a bonus right after it: "Search checks made to notice…", "a bonus that…", "checks related to…", "saves
 * for resisting poison", "checks for 1 hour". Not "for every three levels", which scales it.
 */
const NARROWED =
  /^(?:\s+(?:that|to|made|related|involving)\b|\s+for\s+(?:\w+ing\b|(?:\d+(?:d\d+)?|one|a|an)\s+(?:rounds?|minutes?|hours?|days?)\b)|,?\s+(?:(?:when|while|if|against|versus)\b|vs\.?\s))/i;

/**
 * What's worn, held or carried, which conditions nothing: an item "when worn", a feat's "if you are wearing light
 * armor and carrying a light load".
 */
const EQUIPPED =
  /\b(?:when|while|if|as long as)\s+(?:(?:it is|you are|they are|she|he|you)\s+)?(?:worn|wears|wearing|placed|donned|held|holds|holding|grasped|carried|carries|carrying|used|activated|wielded|wields|wielding)\b/gi;

/**
 * What of `text` the bonus from `start` to `end` falls under: its sentence's opening, before any bonus ("While raging,
 * you gain…"), and its own part, up to the sentence's next bonus. Between two bonuses, what comes before the last comma
 * qualifies the first ("+2 on Fortitude saves against poison, and a +1 on Will saves": the poison isn't the Will
 * save's), and what comes after it joins them both ("…, while a dishonorable one gains a +2…": either one).
 */
function scopeOf(text: string, start: number, end: number): string {
  // A period before a capital or the end, or the separator some scraped texts join their parts with (a race's traits)
  // oxlint-disable-next-line no-control-regex -- that separator is a control character (\x01)
  const boundary = /\.(?=\s+[A-Z]|\s*$|\s*\x01)|\x01/g;
  let from = 0;
  let to = text.length;
  for (const match of text.matchAll(boundary)) {
    if (match.index < start) from = match.index + 1;
    else if (match.index >= end) {
      to = match.index;
      break;
    }
  }
  const bonuses = [...text.slice(from, to).matchAll(/\+\d+/g)].map((match) => from + match.index);
  const previous = bonuses.filter((index) => index < start).at(-1);
  const next = bonuses.find((index) => index >= end);
  /** Where the text between two bonuses splits: at its last comma or semicolon, else at its end. */
  const split = (gapStart: number, gapEnd: number) => {
    const gap = text.slice(gapStart, gapEnd);
    const comma = Math.max(gap.lastIndexOf(","), gap.lastIndexOf(";"));
    return comma < 0 ? gapEnd : gapStart + comma;
  };
  const opening = text.slice(from, Math.min(bonuses[0] ?? start, start));
  const joinedBefore = previous === undefined ? "" : text.slice(split(previous, start), start);
  const own = text.slice(start, next === undefined ? to : next);
  return opening + joinedBefore + own;
}

/**
 * Whether the bonus `text` gives from `start` to `end` isn't a permanent modifier of the character: what it falls under
 * (`scopeOf`) names a condition, other than what's worn or held, an effect used, or someone else it goes to; or what
 * follows the bonus narrows it.
 */
export function isConditional(text: string, start: number, end: number): boolean {
  const scope = scopeOf(text, start, end);
  return (
    CONDITION.test(scope.replace(EQUIPPED, "")) ||
    ACTIVATION.test(scope) ||
    SOMEONE_ELSE.test(scope) ||
    NARROWED.test(text.slice(end).replace(EQUIPPED, ""))
  );
}
