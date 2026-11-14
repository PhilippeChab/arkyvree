DROP INDEX "account"."users_expires_at_idx";--> statement-breakpoint
ALTER TABLE "account"."users" DROP COLUMN "expires_at";