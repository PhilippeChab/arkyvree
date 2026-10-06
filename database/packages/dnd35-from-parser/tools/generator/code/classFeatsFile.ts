/** A class's feats file (feats/classes/<slug>.ts): the feats its features are, and the domains it picks from. */

import {
  buildClassFeatSeeds,
  classDomainPickFeats,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { stringifyProperty } from "@/database/packages/dnd35-from-parser/tools/generator/code/customization.ts";
import { quote, toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";

/** A feat as a line of a class's feats file (`file`): the class feature aptitude as `APT`. */
function stringifyFeat(file: CodeFile, feat: FeatSeed, classFeatureAptitude: string): string {
  const parts = [
    `name: ${quote(feat.name)}`,
    `description: ${quote(feat.description)}`,
    ...(feat.stackable ? ["stackable: true"] : []),
    ...(feat.selectable !== undefined ? [`selectable: ${feat.selectable}`] : []),
    `aptitudes: [${feat.aptitudes.map((a) => (a === classFeatureAptitude ? "APT" : quote(a))).join(", ")}]`,
    ...(feat.modifiers?.length ? [`modifiers: [${feat.modifiers.map((m) => file.featModifier(m)).join(", ")}]`] : []),
    ...(feat.requirements?.length
      ? [`requirements: [${feat.requirements.map((r) => file.requirement(r)).join(", ")}]`]
      : []),
    ...(feat.properties?.length ? [`properties: [${feat.properties.map(stringifyProperty).join(", ")}]`] : []),
  ];
  return `  { ${parts.join(", ")} },`;
}

/** A class's feats file: its own feats (`buildClassFeatSeeds`), and the domains it picks from (`classDomainPickFeats`). */
export function generateClassFeatSeeds(ref: ClassReference): string {
  const aptitude = ref.mapping.classFeatureAptitude;
  const file = new CodeFile();
  const feats = [...buildClassFeatSeeds(ref), ...classDomainPickFeats(ref)].map((feat) =>
    stringifyFeat(file, feat, aptitude),
  );
  file.lines.push(
    `const APT = ${quote(aptitude)};`,
    "",
    `export const ${toConstName(ref.raw.name)}_FEATS: FeatSeed[] = [`,
    ...feats,
    `];`,
    "",
  );
  return file.code([`import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`]);
}
