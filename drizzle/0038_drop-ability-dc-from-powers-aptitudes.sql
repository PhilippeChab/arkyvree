ALTER TABLE "rules"."powers_aptitudes" DROP CONSTRAINT "powers_aptitudes_ability_dc_id_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."powers_aptitudes" DROP COLUMN "ability_dc_id";