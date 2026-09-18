ALTER TABLE "maintenance_visits"
  ADD COLUMN "location_presence_confirmed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "location_review_required" BOOLEAN NOT NULL DEFAULT false;
