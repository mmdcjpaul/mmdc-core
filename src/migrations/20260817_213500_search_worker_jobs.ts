import { sql } from '@payloadcms/db-postgres';
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';

/**
 * The worker is the first feature that enables Payload's durable jobs
 * collection. Keep this migration separate from the foundation schema so a
 * shared environment can apply it once without schema push on web replicas.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "payload_jobs" (
      "id" serial PRIMARY KEY NOT NULL,
      "input" jsonb,
      "completed_at" timestamp(3) with time zone,
      "total_tried" numeric DEFAULT 0,
      "has_error" boolean DEFAULT false,
      "error" jsonb,
      "task_slug" varchar,
      "queue" varchar DEFAULT 'default',
      "wait_until" timestamp(3) with time zone,
      "processing" boolean DEFAULT false,
      "concurrency_key" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "payload_jobs_log" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "executed_at" timestamp(3) with time zone NOT NULL,
      "completed_at" timestamp(3) with time zone NOT NULL,
      "task_slug" varchar NOT NULL,
      "task_i_d" varchar NOT NULL,
      "input" jsonb,
      "output" jsonb,
      "state" varchar NOT NULL,
      "error" jsonb,
      "parent_task_slug" varchar,
      "parent_task_i_d" varchar
    );

    ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
    CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
    CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
    CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
    CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
    CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
    CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
    CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
    CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
    CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
    CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
    CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "payload_jobs_log" CASCADE;
    DROP TABLE "payload_jobs" CASCADE;
  `);
}
