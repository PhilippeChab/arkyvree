import { Hono } from "hono";
import { z } from "zod";

import {
  denyDemoUser,
  exportRateLimit,
  importRateLimit,
  importSourceRateLimit,
  sessionMiddleware,
  validate,
} from "@/server/middlewares/index.ts";
import { characterIdParam, idList, idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { MAX_CHARACTER_NAME_LENGTH, MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";

import contributors from "./contributors/index.ts";
import inventory from "./inventory/index.ts";
import levels from "./levels/index.ts";
import modifiers from "./modifiers/index.ts";
import sharing from "./sharing/index.ts";

const campaignIdParam = z.object({ campaignId: z.string().uuid() });

/** A field's value as a body sends it: a text, a number or a flag. */
const fieldValue = z.union([z.string(), z.number(), z.boolean()]);

/**
 * A character's fields, by their keys, which its ruleset reads and checks by their declarations (`FieldCodec.parse`):
 * a single field's value, a set's values, or none.
 */
const characterFields = z.record(z.string(), z.union([fieldValue, z.array(fieldValue).readonly(), z.null()]));

/** A creation pick's role: its single link's (3.5's `race`). */
const roleParam = z.object({ role: z.string() });

/** A character's links of a role (3.5's `score`, `speaks`). */
const roleParams = idParam.extend({ role: z.string() });

/** A character's amount of a scored link's entity (3.5's ability score). */
const score = z.number().int();

export default new Hono()
  .use(sessionMiddleware)
  .route("/", contributors)
  .route("/levels", levels)
  .route("/inventory", inventory)
  .route("/modifiers", modifiers)
  .route("/", sharing)
  .get(
    "/",
    validate(
      "query",
      z.object({
        limit,
        page,
        visibility: z.enum(["all", "archived", "active"]).default("active"),
        search: z.string().optional(),
        orderBy: z.enum(["name", "createdAt", "lastChangedAt"]).default("lastChangedAt"),
        orderDir: orderDirDesc,
        accessRole: z.enum(["owner", "contributor"]).optional(),
      }),
    ),
    async (c) => {
      const { visibility, search, orderBy, orderDir, accessRole, limit, page } = c.req.valid("query");
      // Use the service to get character list with session for activity logging
      return c.json(
        await CharactersService.getCharacters(
          c.var.requestSession,
          {
            visibility,
            search,
            orderBy,
            orderDir,
            accessRole,
          },
          { limit, page },
        ),
        200,
      );
    },
  )
  // How a new character of a ruleset sets its scores of a scored link's role (3.5's `score`, its ability scores)
  .get("/creation", validate("query", z.object({ role: z.string(), rulesetId: z.string().uuid() })), async (c) => {
    const { role, rulesetId } = c.req.valid("query");
    return c.json(await CharactersService.getCreation(c.var.requestSession, rulesetId, role), 200);
  })
  // A new character's creation pick's options (a single link's, by its role: 3.5's race), each checked
  .get(
    "/creation/:role",
    validate("param", roleParam),
    validate(
      "query",
      // Past its ruleset and its page, what the form's fields that narrow its options hold, by their keys (`narrows`)
      z.object({ rulesetId: z.string().uuid(), limit, page, search: z.string().optional() }).catchall(z.string()),
    ),
    async (c) => {
      const { role } = c.req.valid("param");
      const { rulesetId, limit, page, search, ...narrowing } = c.req.valid("query");
      return c.json(
        await CharactersService.getCreationOptions(
          c.var.requestSession,
          rulesetId,
          role,
          narrowing,
          { search },
          { limit, page },
        ),
        200,
      );
    },
  )
  // The session's characters it could link to a campaign: in none yet, on its ruleset
  .get(
    "/unlinked/:campaignId",
    validate("param", campaignIdParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { campaignId } = c.req.valid("param");
      const { search, limit, page } = c.req.valid("query");
      return c.json(
        await CampaignCharactersService.getLinkableCharacters(
          c.var.requestSession,
          campaignId,
          { search },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharactersService.getCharacter(c.var.requestSession, id), 200);
  })
  // What a character has of a picked link's role, and what its picks (as its edit is being made) leave it room for
  .get(
    "/:id/links/:role",
    validate("param", roleParams),
    validate("query", z.object({ entityIds: idList })),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const { entityIds = [] } = c.req.valid("query");
      return c.json(await CharactersService.getLinkPicks(c.var.requestSession, id, role, entityIds), 200);
    },
  )
  .post(
    "/",
    validate(
      "json",
      z.object({
        rulesetId: z.string().uuid(),
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH),
        // The entity each of its creation's picks names, by its single link's role, and each scored link's amounts, by
        // role
        picks: z.record(z.string(), z.string().uuid()),
        scores: z.record(z.string(), z.record(z.string().uuid(), score)),
        // Its fields, by the keys its rules' form gives them, which its ruleset reads and checks (`planCreate`)
        fields: characterFields,
        notes: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");

      // Use the service to create character with session for activity logging
      return c.json(await CharactersService.createCharacter(c.var.requestSession, body), 201);
    },
  )
  // Import the character another program's file holds (its text) into a ruleset, with the report of what it imported
  .post(
    "/import",
    importRateLimit,
    validate("json", z.object({ rulesetId: z.string().uuid(), text: z.string().min(1).max(MAX_IMPORT_FILE_LENGTH) })),
    async (c) => {
      const { rulesetId, text } = c.req.valid("json");
      return c.json(await CharactersService.importCharacter(c.var.requestSession, rulesetId, text), 201);
    },
  )
  // What a character file another program saved is (its text), before a ruleset is picked: the program, its version,
  // the file's format and its character's rules, and the base rules whose rulesets import it
  .post(
    "/import/source",
    importSourceRateLimit,
    validate("json", z.object({ text: z.string().min(1).max(MAX_IMPORT_FILE_LENGTH) })),
    (c) => {
      const { text } = c.req.valid("json");
      return c.json(CharactersService.getImportSource(text), 200);
    },
  )
  // Enqueue async PDF generation
  .post("/:characterId/pdf", denyDemoUser, exportRateLimit, validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");

    await CharactersService.enqueuePdf(c.var.requestSession, characterId);
    return c.json({ message: "PDF generation started" }, 202);
  })
  .post("/:id/unarchive", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.unarchiveCharacter(c.var.requestSession, id);
    return c.json({ message: "Character unarchived successfully" }, 200);
  })
  .put(
    "/:id",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH).optional(),
        // Its fields, by the keys its sheet's fields block gives them, which its ruleset reads and checks (`planEdit`)
        fields: characterFields.optional(),
        notes: z.string().optional(),
        // Read by the character's editors and its campaign's Game Master only
        privateNotes: z.string().optional(),
        // Each picked link's picks, by role, which its ruleset reads and checks (`planEdit`)
        links: z.record(z.string(), z.array(z.string().uuid())).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      // Use the service to update character with session for activity logging
      return c.json(await CharactersService.updateCharacter(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/scores/:role",
    validate("param", roleParams),
    validate("json", z.record(z.string().uuid(), score)),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const body = c.req.valid("json");

      await CharactersService.updateScores(c.var.requestSession, id, role, body);
      return c.json({ success: true }, 200);
    },
  )
  .delete("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.archiveCharacter(c.var.requestSession, id);
    return c.json({ message: "Character archived successfully" }, 200);
  })
  // Permanently delete an archived character
  .delete("/:id/permanent", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.hardDeleteCharacter(c.var.requestSession, id);
    return c.json({ message: "Character permanently deleted" }, 200);
  });
