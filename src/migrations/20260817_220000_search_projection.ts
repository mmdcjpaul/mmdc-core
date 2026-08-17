import { sql } from '@payloadcms/db-postgres';
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';

/** Synthetic canonical records used only to prove disposable search projection semantics. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "foundation_search_records" (
      "id" serial PRIMARY KEY NOT NULL,
      "canonical_version" numeric DEFAULT 1 NOT NULL,
      "value" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "foundation_search_records_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_foundation_search_records_fk" FOREIGN KEY ("foundation_search_records_id") REFERENCES "public"."foundation_search_records"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "foundation_search_records_updated_at_idx" ON "foundation_search_records" USING btree ("updated_at");
    CREATE INDEX "foundation_search_records_created_at_idx" ON "foundation_search_records" USING btree ("created_at");
    CREATE INDEX "payload_locked_documents_rels_foundation_search_records_id_idx" ON "payload_locked_documents_rels" USING btree ("foundation_search_records_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE "foundation_search_records" CASCADE;`);
}
