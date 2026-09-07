ALTER TABLE "rules"."klass_level_saves" DROP CONSTRAINT "klass_level_saves_save_id_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."klass_level_saves" ADD CONSTRAINT "klass_level_saves_save_id_fkey" FOREIGN KEY ("save_id") REFERENCES "rules"."saves"("id") ON DELETE restrict ON UPDATE no action;