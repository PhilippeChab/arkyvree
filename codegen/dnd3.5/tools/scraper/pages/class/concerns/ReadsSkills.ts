import { Page } from "@/codegen/core/scraper/Page.ts";
import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { capitalizeTitle } from "@/codegen/dnd3.5/tools/text/names.ts";
import { KNOWLEDGE_SKILLS } from "@/codegen/dnd3.5/tools/vocabulary/skills.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A Knowledge skill by its subspecialty, lowercased ("the planes" → "Knowledge (The Planes)"). */
const KNOWLEDGE_SUBSPECIALTIES: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_SKILLS.map((name) => [name.slice("Knowledge (".length, -1).toLowerCase(), name]),
);

/** The Knowledge skill a subspecialty names: the skill list's, else one of its name in title case. */
function knowledgeSkill(subspecialty: string): string {
  return KNOWLEDGE_SUBSPECIALTIES[subspecialty] ?? `Knowledge (${capitalizeTitle(subspecialty)})`;
}

/** Reading a class's skills: the table under its page's Class Skills heading. */
export function ReadsSkills<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingSkills extends Base {
    /**
     * The class's skills, each a row's link or text of its first table under its Class Skills heading: "Knowledge
     * (all)" every Knowledge skill, a Knowledge row without a subspecialty its link's, else every Knowledge skill.
     */
    skills(): string[] {
      const skills: string[] = [];
      const header = this.heading(/^Class Skills$/i);
      if (header.length === 0) return skills;

      for (const el of Page.section(header)) {
        if (Page.tagName(el) !== "table") continue;
        el.find("tr").each((_, row) => {
          const firstCell = this.$(row).find("td").first();
          if (firstCell.length === 0) return;

          const link = firstCell.find("a").first();
          const skillName = link.length > 0 ? link.text().trim() : firstCell.text().trim();
          if (!skillName) return;
          if (!skillName.toLowerCase().startsWith("knowledge")) {
            skills.push(skillName);
            return;
          }

          // A Knowledge skill: its subspecialty from the cell's text or the skill's name, else from its link
          const subMatch =
            firstCell
              .text()
              .trim()
              .match(/Knowledge\s*\(([^)]+)\)/i) ?? skillName.match(/Knowledge\s*\(([^)]+)\)/i);
          if (subMatch) {
            const sub = subMatch[1].toLowerCase().trim();
            if (/^all\b/i.test(sub)) skills.push(...KNOWLEDGE_SKILLS);
            else skills.push(knowledgeSkill(sub));
            return;
          }
          const slugMatch = (link.attr("href") ?? "").match(/\/skills\/knowledge-([^/]+)\//);
          if (slugMatch) skills.push(knowledgeSkill(slugMatch[1].replace(/-/g, " ").toLowerCase()));
          else skills.push(...KNOWLEDGE_SKILLS);
        });
        if (skills.length > 0) break;
      }
      return skills;
    }
  }
  return ReadingSkills;
}
