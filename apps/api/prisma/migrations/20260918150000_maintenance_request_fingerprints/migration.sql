ALTER TABLE "maintenance_visits"
  ADD COLUMN "request_fingerprint" TEXT;

ALTER TABLE "maintenance_attempts"
  ADD COLUMN "request_fingerprint" TEXT;
