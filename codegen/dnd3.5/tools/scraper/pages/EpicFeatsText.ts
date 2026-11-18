import { capitalizeTitle } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";

/** A feat of the page, as read. */
type RawFeat = FeatReference["raw"][number];

/** Where the page's epic feats end: the monster feats after them aren't epic. */
const END = /^These feats are not epic feats/;

/** A field of a feat, by the label its paragraph starts with, and the key it's read into. */
const FIELDS: [RegExp, "benefit" | "normal" | "prerequisiteText" | "special"][] = [
  [/^Prerequisites?: ?/, "prerequisiteText"],
  [/^Benefits?: ?/, "benefit"],
  [/^Normal: ?/, "normal"],
  [/^Special: ?/, "special"],
];

/**
 * A feat's heading: its name in capitals and its types, epic among them ("ARMOR SKIN [EPIC]", "SPELL KNOWLEDGE [EPIC,
 * PSIONIC]", "ENHANCE SPELL [METAMAGIC][EPIC]").
 */
const HEADING = /^(.+?) ((?:\[[A-Z ,]+\] ?)+)$/;

/**
 * The SRD's Epic Feats page (`EpicFeats.rtf`), as text (`readRtfText`): each epic feat, its name title-cased, of type
 * `epic`, its prerequisites, benefit, normal and special paragraphs, a paragraph without a label (a table's row, a
 * list's entry) joined to the one before it. Its psionic feats are left out, as the app has no psionics.
 */
export class EpicFeatsText {
  constructor(private readonly text: string) {}

  /** A paragraph of a feat, into its field by its label, or onto the last field it filled. */
  private static add(feat: RawFeat, line: string, last: keyof RawFeat | undefined): keyof RawFeat | undefined {
    const field = FIELDS.find(([label]) => label.test(line));
    if (field) {
      const [label, key] = field;
      feat[key] = line.replace(label, "").trim();
      return key;
    }
    if (last && last !== "name" && last !== "featType") feat[last] = `${feat[last] ?? ""} ${line}`.trim();
    return last;
  }

  /**
   * The feat a heading line starts, its type its other than epic's (a metamagic feat's, a wild one's) or epic: none for
   * a psionic one, which `read` skips with its paragraphs.
   */
  private static start(heading: RegExpMatchArray): RawFeat | null {
    const types: string[] = heading[2].match(/[A-Z][A-Z ]*/g) ?? [];
    if (types.includes("PSIONIC")) return null;
    const featType = types.find((type) => type !== "EPIC")?.toLowerCase() ?? "epic";
    return { name: capitalizeTitle(heading[1]), featType, prerequisiteText: "", benefit: "" };
  }

  /** Every epic feat of the page, in its order. */
  read(): RawFeat[] {
    const feats: RawFeat[] = [];
    let current: RawFeat | null = null;
    let inFeat = false;
    let last: keyof RawFeat | undefined;
    for (const line of this.text.split("\n")) {
      if (END.test(line)) break;
      const heading = line.match(HEADING);
      if (heading && heading[2].includes("EPIC")) {
        current = EpicFeatsText.start(heading);
        inFeat = true;
        last = undefined;
        if (current) feats.push(current);
      } else if (inFeat && current) {
        last = EpicFeatsText.add(current, line, last);
      }
    }
    return feats;
  }
}
