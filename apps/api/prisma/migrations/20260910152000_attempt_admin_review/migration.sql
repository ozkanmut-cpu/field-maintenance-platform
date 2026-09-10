CREATE TYPE "AttemptReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "maintenance_attempts"
  ADD COLUMN "review_status" "AttemptReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "closed_due_date" DATE;
ALTER TABLE "maintenance_obligations" ADD COLUMN "resolved_by_attempt_id" UUID;
CREATE INDEX "maintenance_attempts_review_status_attempted_at_idx" ON "maintenance_attempts"("review_status", "attempted_at");
CREATE INDEX "maintenance_obligations_resolved_by_attempt_id_idx" ON "maintenance_obligations"("resolved_by_attempt_id");
ALTER TABLE "maintenance_attempts" ADD CONSTRAINT "maintenance_attempts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
