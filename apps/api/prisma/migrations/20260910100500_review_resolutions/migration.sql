CREATE TYPE "ReviewDecision" AS ENUM ('NO_ISSUE', 'KEEP_LOCATION_EXCLUDED', 'NEEDS_FOLLOWUP');

CREATE TABLE "maintenance_review_resolutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "previous_reason" TEXT,
    "resolved_by_id" UUID NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "maintenance_review_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "maintenance_review_resolutions_visit_id_resolved_at_idx"
    ON "maintenance_review_resolutions"("visit_id", "resolved_at");

CREATE INDEX "maintenance_review_resolutions_resolved_by_id_resolved_at_idx"
    ON "maintenance_review_resolutions"("resolved_by_id", "resolved_at");

ALTER TABLE "maintenance_review_resolutions"
    ADD CONSTRAINT "maintenance_review_resolutions_visit_id_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "maintenance_visits"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "maintenance_review_resolutions"
    ADD CONSTRAINT "maintenance_review_resolutions_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
