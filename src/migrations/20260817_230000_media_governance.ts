import { sql } from '@payloadcms/db-postgres';
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN "rights_status" varchar;
    ALTER TABLE "media" ADD COLUMN "rights_holder" varchar;
    ALTER TABLE "media" ADD COLUMN "is_decorative" boolean DEFAULT false;
    ALTER TABLE "media" ADD COLUMN "detected_mime_type" varchar;
    ALTER TABLE "media" ADD COLUMN "content_hash" varchar;
    ALTER TABLE "media" ADD COLUMN "eligibility_status" varchar DEFAULT 'pending';
    ALTER TABLE "media" ADD COLUMN "storage_state" varchar DEFAULT 'pending';
    ALTER TABLE "media" ADD COLUMN "canonical_key" varchar;
    ALTER TABLE "media" ADD COLUMN "variant_manifest" jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" DROP COLUMN "variant_manifest";
    ALTER TABLE "media" DROP COLUMN "canonical_key";
    ALTER TABLE "media" DROP COLUMN "storage_state";
    ALTER TABLE "media" DROP COLUMN "eligibility_status";
    ALTER TABLE "media" DROP COLUMN "content_hash";
    ALTER TABLE "media" DROP COLUMN "detected_mime_type";
    ALTER TABLE "media" DROP COLUMN "is_decorative";
    ALTER TABLE "media" DROP COLUMN "rights_holder";
    ALTER TABLE "media" DROP COLUMN "rights_status";
  `);
}
