ALTER TABLE "maintenance_visits"
  ADD COLUMN "confirmation_evidence_acquired_at" TIMESTAMP(3),
  ADD COLUMN "confirmation_evidence_import_run_id" UUID;

-- Preserve ordering for any reconciliation audit created before the watermark
-- columns existed. Receipts that never changed state had no audit to backfill.
UPDATE "maintenance_visits" AS visit
SET
  "confirmation_evidence_acquired_at" = latest."acquired_at",
  "confirmation_evidence_import_run_id" = latest."import_run_id"
FROM (
  SELECT DISTINCT ON (reconciliation."visit_id")
    reconciliation."visit_id",
    import_run."acquired_at",
    import_run."id" AS "import_run_id"
  FROM "sap_confirmation_reconciliations" AS reconciliation
  JOIN "sap_import_runs" AS import_run
    ON import_run."id" = reconciliation."import_run_id"
  ORDER BY reconciliation."visit_id", import_run."acquired_at" DESC, import_run."id" DESC
) AS latest
WHERE visit."id" = latest."visit_id";

ALTER TABLE "maintenance_visits"
  ADD CONSTRAINT "maintenance_visits_confirmation_evidence_watermark_check"
  CHECK (
    ("confirmation_evidence_acquired_at" IS NULL AND "confirmation_evidence_import_run_id" IS NULL)
    OR
    ("confirmation_evidence_acquired_at" IS NOT NULL AND "confirmation_evidence_import_run_id" IS NOT NULL)
  );
