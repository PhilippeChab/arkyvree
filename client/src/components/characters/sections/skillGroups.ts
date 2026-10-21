/** A row of the skills table: a skill, or the header of the group a family two of them share makes. */
type SkillTableRow<S> =
  | { group: string | null; skill: S; type: "skill" }
  | { count: number; prefix: string; type: "group" };

/** The skills as table rows, with a header row before each family (their rules') that two or more of them share. */
export function groupSkills<S extends { family: string | null }>(skills: readonly S[]): SkillTableRow<S>[] {
  const prefixCounts = new Map<string, number>();
  for (const skill of skills) {
    const prefix = skill.family;
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const rows: SkillTableRow<S>[] = [];
  let lastPrefix: string | null = null;
  for (const skill of skills) {
    const prefix = skill.family;
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
