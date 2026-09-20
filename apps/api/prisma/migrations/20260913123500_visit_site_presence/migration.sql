ALTER TABLE "maintenance_visits"
  ADD COLUMN "site_presence_confirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "site_presence_distance_m" DECIMAL(8,2);
