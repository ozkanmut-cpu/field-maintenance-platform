ALTER TABLE "points"
  ADD COLUMN "cooler_count" INTEGER,
  ADD COLUMN "tower_count" INTEGER,
  ADD COLUMN "tap_count" INTEGER,
  ADD COLUMN "smarttap_count" INTEGER,
  ADD COLUMN "equipment_verified_at" TIMESTAMP(3),
  ADD COLUMN "equipment_verified_by_id" UUID;

ALTER TABLE "maintenance_visits"
  ADD COLUMN "cooler_count" INTEGER,
  ADD COLUMN "tower_count" INTEGER,
  ADD COLUMN "tap_count" INTEGER,
  ADD COLUMN "smarttap_count" INTEGER,
  ADD COLUMN "equipment_confirmed" BOOLEAN NOT NULL DEFAULT false;
