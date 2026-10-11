/** A row of the skills table: a skill, or the header of the group a prefix two of them share makes. */
export type SkillTableRow<S> =
  | { group: string | null; skill: S; type: "skill" }
  | { count: number; prefix: string; type: "group" };

/** "Knowledge (arcana)" → "Knowledge": the part before the parenthesis groups related skills. */
function getSkillGroup(name: string): string | null {
  const match = name.match(/^(.+?)\s*\(/);
  return match ? match[1] : null;
}

/** The skills as table rows, with a header row before each prefix that two or more of them share. */
export function groupSkills<S extends { name: string }>(skills: readonly S[]): SkillTableRow<S>[] {
  const prefixCounts = new Map<string, number>();
  for (const skill of skills) {
    const prefix = getSkillGroup(skill.name);
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const rows: SkillTableRow<S>[] = [];
  let lastPrefix: string | null = null;
  for (const skill of skills) {
    const prefix = getSkillGroup(skill.name);
    const count = prefix === null ? 0 : (prefixCounts.get(prefix) ?? 0);
    const group = count >= 2 ? prefix : null;
    if (group !== null && group !== lastPrefix) {
      rows.push({ type: "group", prefix: group, count });
      lastPrefix = group;
    }
    rows.push({ type: "skill", skill, group });
  }
  return rows;
}
