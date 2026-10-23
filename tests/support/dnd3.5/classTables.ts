import type ClassTable from "@/engine/rulesets/dnd3.5/entities/classes/ClassTable.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";

/** A class's tables, by the name its route reads one by, each as its rules describe it. */
interface ClassTables {
  "feat-pools": ReturnType<ClassTable["describeFeatPools"]>;
  "spell-lists": ReturnType<ClassTable["describeSpellLists"]>;
  spells: ReturnType<ClassTable["describeSpells"]>;
  "spells-known": ReturnType<ClassTable["describeSpellsKnown"]>;
}

/** One of a class's tables (`table`), as its tab reads it: the service answers any of them. */
export async function readClassTable<T extends keyof ClassTables>(rulesetId: string, classId: string, table: T) {
  return (await EntitiesService.getEntityTable(rulesetId, "klasses", classId, table)) as ClassTables[T];
}
