import { describe, expect, test } from "bun:test";

import DomainDetails from "@/codegen/pf1/tools/detect/DomainDetails.ts";
import type { DomainEntry } from "@/codegen/pf1/tools/types/domains.ts";

const POWERS = [
  { label: "Granted Powers", text: "You command the winds." },
  { label: "Lightning Arc (Sp)", text: "You unleash an arc of electricity." },
];

/** A domain of `details`, as a reference stores it. */
function domain(details: DomainEntry["details"]): DomainEntry {
  return { name: "Test", sources: [], subdomain: false, details };
}

describe("A domain's details", () => {
  test("describe it by its granted powers, each power after their opening line", () => {
    const details = new DomainDetails(domain([...POWERS, { label: "Domain Spells", text: "1st—fly." }]));
    expect(details.description()).toBe("You command the winds. Lightning Arc (Sp): You unleash an arc of electricity.");
  });

  test("give its spells by level, each without its note", () => {
    const line =
      "1st—obscuring mist, 2nd—wind wall, 7th—elemental body IV (air only), 9th—elemental swarm (air spell only).";
    expect(new DomainDetails(domain([{ label: "Domain Spells", text: line }])).spells()).toEqual([
      { level: 1, name: "obscuring mist" },
      { level: 2, name: "wind wall" },
      { level: 7, name: "elemental body IV" },
      { level: 9, name: "elemental swarm" },
    ]);
  });

  test("give its spells up to its line's first period, past which a page carries another source's notes", () => {
    const line = "8th—create greater undead, 9th—wail of the banshee. Variant (Source: Blog) 3rd—speak with dead";
    expect(new DomainDetails(domain([{ label: "Domain Spells", text: line }])).spells()).toEqual([
      { level: 8, name: "create greater undead" },
      { level: 9, name: "wail of the banshee" },
    ]);
  });

  test("give no spells without a Domain Spells line", () => {
    expect(new DomainDetails(domain(POWERS)).spells()).toEqual([]);
  });
});
