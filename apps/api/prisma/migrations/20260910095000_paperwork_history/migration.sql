CREATE TYPE "PaperworkKind" AS ENUM ('SERVICE_SLIP', 'CONFIRMATION');

CREATE TABLE "paperwork_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visit_id" UUID NOT NULL,
  "kind" "PaperworkKind" NOT NULL,
  "previous_status" "PaperworkStatus" NOT NULL,
  "new_status" "PaperworkStatus" NOT NULL,
  "changed_by_id" UUID NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "paperwork_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paperwork_status_history_visit_id_changed_at_idx"
  ON "paperwork_status_history"("visit_id", "changed_at");

CREATE INDEX "paperwork_status_history_changed_by_id_changed_at_idx"
  ON "paperwork_status_history"("changed_by_id", "changed_at");

ALTER TABLE "paperwork_status_history"
  ADD CONSTRAINT "paperwork_status_history_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "maintenance_visits"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paperwork_status_history"
  ADD CONSTRAINT "paperwork_status_history_changed_by_id_fkey"
  FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
